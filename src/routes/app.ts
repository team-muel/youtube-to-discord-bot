import { Router, Response, type RequestHandler } from 'express';
import { ChannelType, type Client } from 'discord.js';
import { supabase } from '../supabase';
import type { AuthenticatedRequest, SettingsRow } from '../types';
import { getSafeErrorMessage, MAX_LOGS_DISPLAY } from '../utils';

type SettingsUpdateRequestBody = {
  forumChannelId?: string;
  guildId?: string;
};

type DiscordGuildApiRow = {
  id: string;
  name: string;
  icon: string | null;
  permissions?: string;
};

type AppRoutesDeps = {
  requireAuth: RequestHandler;
  requireAuthAndCsrf: RequestHandler;
  isSupabaseConfigured: boolean;
  client: Client;
  refreshDiscordTokenIfNeeded: (user: AuthenticatedRequest['user']) => Promise<AuthenticatedRequest['user'] | null>;
  issueAuthCookie: (res: Response, jwtPayload: AuthenticatedRequest['user']) => void;
  discordApiGuildsUrl: string;
  discordPermissionAdmin: bigint;
  discordPermissionManageGuild: bigint;
};

export const createAppRouter = ({
  requireAuth,
  requireAuthAndCsrf,
  isSupabaseConfigured,
  client,
  refreshDiscordTokenIfNeeded,
  issueAuthCookie,
  discordApiGuildsUrl,
  discordPermissionAdmin,
  discordPermissionManageGuild,
}: AppRoutesDeps) => {
  const router = Router();

  router.get('/api/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      let sourcesCount = 0;
      let logsCount = 0;

      if (isSupabaseConfigured) {
        const { count: sCount, error: sError } = await supabase.from('sources').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id);
        if (!sError) sourcesCount = sCount || 0;

        const { count: lCount, error: lError } = await supabase.from('logs').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id);
        if (!lError) logsCount = lCount || 0;
      }

      return res.json({
        online: client.isReady(),
        botName: client.user?.tag || null,
        guildsCount: client.guilds.cache.size,
        sourcesCount,
        logsCount,
        clientId: process.env.DISCORD_CLIENT_ID,
      });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'GET /api/status');
      return res.status(500).json({ error: safeMsg });
    }
  });

  router.get('/api/settings', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!isSupabaseConfigured) return res.json({});
    try {
      const { data: settings, error } = await supabase.from('settings').select('*').eq('user_id', req.user.id);
      if (error) {
        console.warn('Warning getting settings (table might not exist):', error.message);
        return res.json({});
      }
      const settingsObj = (settings || []).reduce((acc: Record<string, string>, curr: SettingsRow) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {} as Record<string, string>);
      return res.json(settingsObj);
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'GET /api/settings');
      console.error('Error getting settings:', error);
      return res.status(500).json({ error: safeMsg });
    }
  });

  router.post('/api/settings', requireAuthAndCsrf, async (req: AuthenticatedRequest, res: Response) => {
    if (!isSupabaseConfigured) return res.status(500).json({ error: 'Supabase is not configured' });
    try {
      const { forumChannelId, guildId } = (req.body || {}) as SettingsUpdateRequestBody;

      const upsertSetting = async (key: string, value: string) => {
        const { data: existing } = await supabase.from('settings').select('key').eq('key', key).eq('user_id', req.user.id).single();
        if (existing) {
          await supabase.from('settings').update({ value }).eq('key', key).eq('user_id', req.user.id);
        } else {
          await supabase.from('settings').insert({ key, value, user_id: req.user.id });
        }
      };

      if (forumChannelId !== undefined) await upsertSetting('forumChannelId', forumChannelId);
      if (guildId !== undefined) await upsertSetting('guildId', guildId);

      return res.json({ success: true });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'POST /api/settings');
      console.error('Error updating settings:', error);
      return res.status(500).json({ error: safeMsg });
    }
  });

  router.get('/api/discord/guilds', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const refreshedUser = await refreshDiscordTokenIfNeeded(req.user);

      if (!refreshedUser || !refreshedUser.accessToken) {
        return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' });
      }

      const tokenWasRefreshed =
        refreshedUser.accessToken !== req.user.accessToken ||
        refreshedUser.refreshToken !== req.user.refreshToken ||
        refreshedUser.tokenExpiresAt !== req.user.tokenExpiresAt;

      if (tokenWasRefreshed) {
        issueAuthCookie(res, refreshedUser);
        req.user = refreshedUser;
      }

      const userResponse = await fetch(discordApiGuildsUrl, {
        headers: { Authorization: `Bearer ${refreshedUser.accessToken}` },
      });
      if (!userResponse.ok) throw new Error('Failed to fetch guilds');
      const guilds = (await userResponse.json()) as DiscordGuildApiRow[];

      const adminGuilds = guilds.filter((g) => {
        if (!g.permissions) return false;
        const perms = BigInt(g.permissions);
        return (perms & discordPermissionAdmin) === discordPermissionAdmin || (perms & discordPermissionManageGuild) === discordPermissionManageGuild;
      });

      const botGuilds = client.guilds.cache;

      const result = adminGuilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        botInGuild: botGuilds.has(g.id),
      }));

      return res.json(result);
    } catch (err: unknown) {
      const safeMsg = getSafeErrorMessage(err, 'GET /api/discord/guilds');
      return res.status(500).json({ error: safeMsg });
    }
  });

  router.get('/api/discord/channels/:guildId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const guild = client.guilds.cache.get(req.params.guildId);
      if (!guild) return res.status(404).json({ error: 'Bot is not in this guild' });

      const channels = await guild.channels.fetch();
      const validChannels = channels
        .filter(
          (c) =>
            c &&
            (c.type === ChannelType.GuildText ||
              c.type === ChannelType.GuildForum ||
              c.type === ChannelType.GuildAnnouncement ||
              c.type === ChannelType.GuildCategory),
        )
        .map((c) => ({
          id: c!.id,
          name: c!.name,
          type: c!.type,
          parentId: c!.parentId,
          position: c!.rawPosition || 0,
        }));

      return res.json(validChannels);
    } catch (err: unknown) {
      const safeMsg = getSafeErrorMessage(err, 'GET /api/discord/channels');
      return res.status(500).json({ error: safeMsg });
    }
  });

  router.get('/api/logs', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!isSupabaseConfigured) return res.json({ logs: [], total: 0 });
    try {
      const { data: logs, error, count } = await supabase
        .from('logs')
        .select('*', { count: 'exact' })
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(MAX_LOGS_DISPLAY);

      if (error) {
        console.warn('Warning getting logs (table might not exist):', error.message);
        return res.json({ logs: [], total: 0 });
      }
      return res.json({ logs: logs || [], total: count || 0 });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'GET /api/logs');
      return res.status(500).json({ error: safeMsg });
    }
  });

  return router;
};
