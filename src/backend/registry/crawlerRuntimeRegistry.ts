import { type Response } from 'express';
import type { Client } from 'discord.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type AuthenticatedRequest, type Source, type ScrapedYouTubePost } from '../../types';

type SourceMutationBody = {
  url?: string;
  name?: string;
  guildId?: string;
  channelId?: string;
  guildName?: string;
  channelName?: string;
};

type TriggerTestBody = {
  url?: string;
  channelId?: string;
};

export type CrawlerRuntimeRegistryDeps = {
  isSupabaseConfigured: boolean;
  supabase: SupabaseClient;
  client: Pick<Client, 'isReady'>;
  scrapeYouTubePost: (url: string) => Promise<ScrapedYouTubePost>;
  createForumThread: (forumChannelId: string, title: string, content: string, imageBase64?: string, user_id?: string) => Promise<unknown>;
  logEvent: (message: string, type: 'info' | 'error' | 'success', user_id?: string) => Promise<unknown>;
  imageUrlToBase64: (url: string) => Promise<string | undefined>;
  truncateText: (text: string, maxLength: number) => string;
  validateYouTubeUrl: (url: string) => { valid: boolean; message?: string };
  getSafeErrorMessage: (error: unknown, context: string) => string;
  maxSourcesPerGuild: number;
  defaultPageLimit: number;
};

export const createCrawlerRuntimeRegistry = (deps: CrawlerRuntimeRegistryDeps) => {
  const processSource = async (source: Source) => {
    const userId = source.user_id;
    const forumChannelId = source.channel_id;
    if (!userId || !forumChannelId) return;

    try {
      const { content, imageUrl, author } = await deps.scrapeYouTubePost(source.url);
      const postSignature = `${content.substring(0, 100)}_${imageUrl}`;

      const updateData: Partial<Pick<Source, 'last_check_status' | 'last_check_error' | 'last_check_at' | 'last_post_signature'>> = {
        last_check_status: 'success',
        last_check_error: null,
        last_check_at: new Date().toISOString(),
      };

      if (source.last_post_signature !== postSignature) {
        console.log(`[Background Job] New post detected for ${author} (User: ${userId})`);

        if (!deps.client.isReady()) {
          const offlineMessage = 'Discord bot is not ready. New post dispatch deferred.';
          console.warn(`[Background Job] ${offlineMessage} source=${source.id}`);
          await deps.logEvent(`${offlineMessage} source=${source.id}`, 'error', userId);
          updateData.last_check_status = 'error';
          updateData.last_check_error = offlineMessage;
        } else {
          let imageBase64: string | undefined;
          if (imageUrl) {
            imageBase64 = await deps.imageUrlToBase64(imageUrl);
          }

          const title = `${author}님의 새 커뮤니티 게시글`;
          const maxContentLength = 1800;
          const truncatedContent = deps.truncateText(content || '내용 없음', maxContentLength);
          const fullContent = `${truncatedContent}\n\n🔗 원본 링크: ${source.url}`;

          await deps.createForumThread(forumChannelId, title, fullContent, imageBase64, userId);
          updateData.last_post_signature = postSignature;
        }
      }

      const { error: updateError } = await deps.supabase.from('sources').update(updateData).eq('id', source.id);
      if (updateError) {
        console.error(`[Background Job] Failed to update source ${source.id}:`, updateError.message);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Background Job] Error processing source ${source.url} for user ${userId}:`, message);

      const { error: updateError } = await deps.supabase
        .from('sources')
        .update({
          last_check_status: 'error',
          last_check_error: message,
          last_check_at: new Date().toISOString(),
        })
        .eq('id', source.id);

      if (updateError) {
        console.error(`[Background Job] Failed to save error status for source ${source.id}:`, updateError.message);
      }
    }
  };

  const runBackgroundJob = async () => {
    if (!deps.isSupabaseConfigured) return;

    try {
      const { data: sources, error: sourcesError } = await deps.supabase.from('sources').select('*');
      if (sourcesError || !sources) {
        console.error('[Background Job] Failed to fetch sources:', sourcesError?.message || 'Unknown error');
        return;
      }

      for (const source of sources as Source[]) {
        await processSource(source);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error('[Background Job] Fatal error:', err);
    }
  };

  const getSources = async (req: AuthenticatedRequest, res: Response) => {
    if (!deps.isSupabaseConfigured) return res.json({ sources: [], total: 0, page: 1, limit: deps.defaultPageLimit });

    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(deps.defaultPageLimit, parseInt(req.query.limit as string) || deps.defaultPageLimit);
      const offset = (page - 1) * limit;

      const { count } = await deps.supabase
        .from('sources')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id);

      const { data: sources, error } = await deps.supabase
        .from('sources')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.warn('Warning getting sources (table might not exist):', error.message);
        return res.json({ sources: [], total: 0, page, limit });
      }

      return res.json({ sources: sources || [], total: count || 0, page, limit });
    } catch (error: unknown) {
      const safeMsg = deps.getSafeErrorMessage(error, 'GET /api/sources');
      return res.status(500).json({ error: safeMsg });
    }
  };

  const addSource = async (req: AuthenticatedRequest, res: Response) => {
    if (!deps.isSupabaseConfigured) return res.status(500).json({ error: 'Supabase is not configured' });

    try {
      const { url, name, guildId, channelId, guildName, channelName } = (req.body || {}) as SourceMutationBody;
      if (!url || !name || !guildId || !channelId) return res.status(400).json({ error: 'All fields are required' });

      const urlValidation = deps.validateYouTubeUrl(url);
      if (!urlValidation.valid) {
        return res.status(400).json({ error: urlValidation.message || '유효하지 않은 YouTube URL입니다.' });
      }

      const { count, error: countError } = await deps.supabase
        .from('sources')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id)
        .eq('guild_id', guildId);

      if (countError) throw countError;
      if (count !== null && count >= deps.maxSourcesPerGuild) {
        return res.status(403).json({ error: `해당 서버에는 최대 ${deps.maxSourcesPerGuild}개까지만 알림을 등록할 수 있습니다. (추후 프리미엄 기능으로 해금 예정 🚀)` });
      }

      const { data, error } = await deps.supabase
        .from('sources')
        .insert([
          {
            name,
            url,
            user_id: req.user.id,
            guild_id: guildId,
            channel_id: channelId,
            guild_name: guildName,
            channel_name: channelName,
          },
        ])
        .select();

      if (error) throw error;
      return res.json({ id: data[0].id, url, name });
    } catch (error: unknown) {
      const safeMsg = deps.getSafeErrorMessage(error, 'POST /api/sources');
      console.error('Error adding source:', error);
      return res.status(500).json({ error: safeMsg });
    }
  };

  const deleteSource = async (req: AuthenticatedRequest, res: Response) => {
    if (!deps.isSupabaseConfigured) return res.status(500).json({ error: 'Supabase is not configured' });

    try {
      const { error } = await deps.supabase.from('sources').delete().eq('id', req.params.id).eq('user_id', req.user.id);
      if (error) throw error;
      return res.json({ success: true });
    } catch (error: unknown) {
      const safeMsg = deps.getSafeErrorMessage(error, 'DELETE /api/sources');
      console.error('Error deleting source:', error);
      return res.status(500).json({ error: safeMsg });
    }
  };

  const updateSource = async (req: AuthenticatedRequest, res: Response) => {
    if (!deps.isSupabaseConfigured) return res.status(500).json({ error: 'Supabase is not configured' });

    try {
      const { name } = (req.body || {}) as SourceMutationBody;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const { error } = await deps.supabase.from('sources').update({ name }).eq('id', req.params.id).eq('user_id', req.user.id);
      if (error) throw error;
      return res.json({ success: true });
    } catch (error: unknown) {
      const safeMsg = deps.getSafeErrorMessage(error, 'PUT /api/sources');
      console.error('Error updating source:', error);
      return res.status(500).json({ error: safeMsg });
    }
  };

  const triggerTest = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { url, channelId } = (req.body || {}) as TriggerTestBody;

      if (!url) {
        return res.status(400).json({ error: 'YouTube URL is required.' });
      }

      if (!channelId) {
        return res.status(400).json({ error: 'Channel ID is required. Please select a channel first.' });
      }

      const urlValidation = deps.validateYouTubeUrl(url);
      if (!urlValidation.valid) {
        return res.status(400).json({ error: urlValidation.message || '유효하지 않은 YouTube URL입니다.' });
      }

      const { content, imageUrl, author } = await deps.scrapeYouTubePost(url);

      let imageBase64 = undefined;
      if (imageUrl) {
        imageBase64 = await deps.imageUrlToBase64(imageUrl);
      }

      const title = `${author}님의 새 커뮤니티 게시글`;
      const maxContentLength = 1800;
      const truncatedContent = deps.truncateText(content || '내용 없음', maxContentLength);
      const fullContent = `${truncatedContent}\n\n🔗 원본 링크: ${url}`;

      await deps.createForumThread(channelId, title, fullContent, imageBase64, req.user.id);
      return res.json({ success: true, message: 'Thread created successfully!' });
    } catch (error: unknown) {
      const safeMsg = deps.getSafeErrorMessage(error, 'POST /api/test-trigger');
      console.error('Error in test-trigger:', error);
      return res.status(500).json({ error: safeMsg });
    }
  };

  return {
    processSource,
    runBackgroundJob,
    getSources,
    addSource,
    deleteSource,
    updateSource,
    triggerTest,
  };
};
