import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';
import { randomBytes, timingSafeEqual } from 'crypto';
import { supabase, isSupabaseConfigured } from './src/supabase';
import { client, startBot, createForumThread, logEvent } from './src/bot';
import { scrapeYouTubePost } from './src/scraper';
import { ChannelType } from 'discord.js';
import { JwtUser, Source, SettingsRow, AuthenticatedRequest } from './src/types';
import { imageUrlToBase64, truncateText, MAX_SOURCES_PER_GUILD, DEFAULT_PAGE_LIMIT, MAX_LOGS_DISPLAY, getSafeErrorMessage, validateYouTubeUrl } from './src/utils';

// --- Background Job ---

// process a single source entry, returning when done (or throwing)
async function processSource(source: Source) {
  const userId = source.user_id;
  const forumChannelId = source.channel_id;
  if (!userId || !forumChannelId) return;

  try {
    const { content, imageUrl, author } = await scrapeYouTubePost(source.url);
    const postSignature = `${content.substring(0, 100)}_${imageUrl}`;

    const updateData: Partial<Pick<Source, 'last_check_status' | 'last_check_error' | 'last_check_at' | 'last_post_signature'>> = {
      last_check_status: 'success',
      last_check_error: null,
      last_check_at: new Date().toISOString()
    };

    if (source.last_post_signature !== postSignature) {
      console.log(`[Background Job] New post detected for ${author} (User: ${userId})`);

      if (!client.isReady()) {
        const offlineMessage = 'Discord bot is not ready. New post dispatch deferred.';
        console.warn(`[Background Job] ${offlineMessage} source=${source.id}`);
        await logEvent(`${offlineMessage} source=${source.id}`, 'error', userId);
        updateData.last_check_status = 'error';
        updateData.last_check_error = offlineMessage;
      } else {
        let imageBase64: string | undefined;
        if (imageUrl) {
          imageBase64 = await imageUrlToBase64(imageUrl);
        }

        const title = `${author}님의 새 커뮤니티 게시글`;
        const maxContentLength = 1800;
        const truncatedContent = truncateText(content || '내용 없음', maxContentLength);
        const fullContent = `${truncatedContent}\n\n🔗 원본 링크: ${source.url}`;

        await createForumThread(forumChannelId, title, fullContent, imageBase64, userId);
        updateData.last_post_signature = postSignature;
      }
    }

    const { error: updateError } = await supabase.from('sources').update(updateData).eq('id', source.id);
    if (updateError) {
      console.error(`[Background Job] Failed to update source ${source.id}:`, updateError.message);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Background Job] Error processing source ${source.url} for user ${userId}:`, message);
    
    // Try to update error status in database
    const { error: updateError } = await supabase.from('sources').update({
      last_check_status: 'error',
      last_check_error: message,
      last_check_at: new Date().toISOString()
    }).eq('id', source.id);
    
    if (updateError) {
      console.error(`[Background Job] Failed to save error status for source ${source.id}:`, updateError.message);
    }
  }
}

async function runBackgroundJob() {
  if (!isSupabaseConfigured) return;

  try {
    // 1. Get all sources directly
    const { data: sources, error: sourcesError } = await supabase.from('sources').select('*');
    if (sourcesError || !sources) {
      console.error('[Background Job] Failed to fetch sources:', sourcesError?.message || 'Unknown error');
      return;
    }

    // Process sources with 1-second delay between each to avoid server overload
    for (const source of sources) {
      await processSource(source);
      // Sleep for 1 second before processing next source (rate limiting & load distribution)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error('[Background Job] Fatal error:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Lightweight health check used by Render/Load balancers
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Utility function to refresh Discord access token if expired
  // Returns updated user or null if refresh failed
  async function refreshDiscordTokenIfNeeded(user: JwtUser): Promise<JwtUser | null> {
    if (!user.refreshToken || !user.tokenExpiresAt) return user;
    
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = user.tokenExpiresAt - now;
    
    // Refresh if token expires within 5 minutes (300 seconds)
    if (timeUntilExpiry > 300) return user;
    
    try {
      const refreshResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID || '',
          client_secret: process.env.DISCORD_CLIENT_SECRET || '',
          grant_type: 'refresh_token',
          refresh_token: user.refreshToken
        })
      });
      
      const newTokenData = await refreshResponse.json();
      if (newTokenData.access_token) {
        const newExpiresAt = Math.floor(Date.now() / 1000) + (newTokenData.expires_in || 604800);
        return {
          ...user,
          accessToken: newTokenData.access_token,
          refreshToken: newTokenData.refresh_token || user.refreshToken,
          tokenExpiresAt: newExpiresAt
        };
      }
      
      // Token refresh failed (no access_token in response)
      console.error('[Token Refresh] Refresh response missing access_token:', newTokenData);
      return null;
    } catch (err) {
      console.error('[Token Refresh] Failed to refresh token:', err);
      return null;
    }
  }

  // Increase payload limit to 50mb to allow base64 image uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());

  // --- Auth Middleware ---
  const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'default_secret') as JwtUser;
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  // --- API Routes ---
  
  // Auth Routes
  app.get('/api/auth/url', (req, res) => {
    const redirectUri = req.query.redirectUri as string;
    // Enhanced CSRF protection: include random nonce in state
    const nonce = randomBytes(16).toString('hex');
    const state = Buffer.from(JSON.stringify({ redirectUri, nonce })).toString('base64');

    res.cookie('oauth_nonce', nonce, {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 10 * 60 * 1000,
    });
    
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state: state
    });
    
    res.json({ url: `https://discord.com/api/oauth2/authorize?${params}` });
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code, state } = req.query;
    let redirectUri = '';
    let nonce = '';
    try {
      const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
      redirectUri = decodedState.redirectUri;
      nonce = decodedState.nonce;
    } catch (e) {
      return res.status(400).send('Invalid state parameter');
    }

    const nonceCookie = req.cookies.oauth_nonce;
    res.clearCookie('oauth_nonce', {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      httpOnly: true,
    });

    if (!nonceCookie || !nonce) {
      return res.status(400).send('Invalid OAuth nonce');
    }

    const nonceFromState = Buffer.from(nonce, 'utf-8');
    const nonceFromCookie = Buffer.from(nonceCookie, 'utf-8');
    const nonceValid = nonceFromState.length === nonceFromCookie.length && timingSafeEqual(nonceFromState, nonceFromCookie);
    if (!nonceValid) {
      return res.status(400).send('OAuth nonce validation failed');
    }

    try {
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID || '',
          client_secret: process.env.DISCORD_CLIENT_SECRET || '',
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: redirectUri,
        })
      });
      
      const tokenData = await tokenResponse.json();
      if (!tokenData.access_token) {
        return res.status(400).send('Failed to authenticate with Discord');
      }

      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const userData = await userResponse.json();

      if (isSupabaseConfigured) {
        // Register or update user in Supabase
        await supabase.from('users').upsert({
          id: userData.id,
          username: userData.username,
          avatar: userData.avatar,
          updated_at: new Date().toISOString()
        });
      }

      // Calculate token expiry: current time + expires_in seconds
      const tokenExpiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in || 604800); // default 7 days

      const jwtPayload: JwtUser = {
        id: userData.id,
        username: userData.username,
        avatar: userData.avatar,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt
      };

      const token = jwt.sign(
        jwtPayload,
        process.env.SESSION_SECRET || 'default_secret',
        { expiresIn: '7d' }
      );

      res.cookie('auth_token', token, {
        secure: true,
        sameSite: 'none',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (err: unknown) {
      console.error('OAuth error:', err);
      res.status(500).send('Authentication failed. Please try again.');
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    res.clearCookie('auth_token', {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
    });
    res.json({ success: true });
  });

  // Get bot status
  app.get('/api/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      let sourcesCount = 0;
      let logsCount = 0;
      
      if (isSupabaseConfigured) {
        const { count: sCount, error: sError } = await supabase.from('sources').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id);
        if (!sError) sourcesCount = sCount || 0;
        
        const { count: lCount, error: lError } = await supabase.from('logs').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id);
        if (!lError) logsCount = lCount || 0;
      }
      
      res.json({
        online: client.isReady(),
        botName: client.user?.tag || null,
        guildsCount: client.guilds.cache.size,
        sourcesCount,
        logsCount,
        clientId: process.env.DISCORD_CLIENT_ID
      });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'GET /api/status');
      res.status(500).json({ error: safeMsg });
    }
  });

  // Get sources with pagination
  app.get('/api/sources', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!isSupabaseConfigured) return res.json({ sources: [], total: 0, page: 1, limit: DEFAULT_PAGE_LIMIT });
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(DEFAULT_PAGE_LIMIT, parseInt(req.query.limit as string) || DEFAULT_PAGE_LIMIT);
      const offset = (page - 1) * limit;

      // Get total count
      const { count } = await supabase
        .from('sources')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id);

      // Get paginated data
      const { data: sources, error } = await supabase
        .from('sources')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.warn('Warning getting sources (table might not exist):', error.message);
        return res.json({ sources: [], total: 0, page, limit });
      }
      res.json({ sources: sources || [], total: count || 0, page, limit });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'GET /api/sources');
      res.status(500).json({ error: safeMsg });
    }
  });

  // Add source
  app.post('/api/sources', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!isSupabaseConfigured) return res.status(500).json({ error: 'Supabase is not configured' });
    try {
      const { url, name, guildId, channelId, guildName, channelName } = req.body;
      if (!url || !name || !guildId || !channelId) return res.status(400).json({ error: 'All fields are required' });
      
      // Validate YouTube URL format
      const urlValidation = validateYouTubeUrl(url);
      if (!urlValidation.valid) {
        return res.status(400).json({ error: urlValidation.message || '유효하지 않은 YouTube URL입니다.' });
      }
      
      // Check limit per guild
      const { count, error: countError } = await supabase
        .from('sources')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id)
        .eq('guild_id', guildId);
        
      if (countError) throw countError;
      if (count !== null && count >= MAX_SOURCES_PER_GUILD) {
        return res.status(403).json({ error: `해당 서버에는 최대 ${MAX_SOURCES_PER_GUILD}개까지만 알림을 등록할 수 있습니다. (추후 프리미엄 기능으로 해금 예정 🚀)` });
      }

      const { data, error } = await supabase.from('sources').insert([{ 
        name, url, user_id: req.user.id,
        guild_id: guildId, channel_id: channelId,
        guild_name: guildName, channel_name: channelName
      }]).select();
      if (error) throw error;
      res.json({ id: data[0].id, url, name });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'POST /api/sources');
      console.error('Error adding source:', error);
      res.status(500).json({ error: safeMsg });
    }
  });

  // Delete source
  app.delete('/api/sources/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!isSupabaseConfigured) return res.status(500).json({ error: 'Supabase is not configured' });
    try {
      const { error } = await supabase.from('sources').delete().eq('id', req.params.id).eq('user_id', req.user.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'DELETE /api/sources');
      console.error('Error deleting source:', error);
      res.status(500).json({ error: safeMsg });
    }
  });

  // Update source name
  app.put('/api/sources/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!isSupabaseConfigured) return res.status(500).json({ error: 'Supabase is not configured' });
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const { error } = await supabase.from('sources').update({ name }).eq('id', req.params.id).eq('user_id', req.user.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'PUT /api/sources');
      console.error('Error updating source:', error);
      res.status(500).json({ error: safeMsg });
    }
  });

  // Get settings
  app.get('/api/settings', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!isSupabaseConfigured) return res.json({});
    try {
      const { data: settings, error } = await supabase.from('settings').select('*').eq('user_id', req.user.id);
      if (error) {
        console.warn('Warning getting settings (table might not exist):', error.message);
        return res.json({});
      }
      const settingsObj = (settings || []).reduce((acc: Record<string,string>, curr: SettingsRow) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {} as Record<string,string>);
      res.json(settingsObj);
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'GET /api/settings');
      console.error('Error getting settings:', error);
      res.status(500).json({ error: safeMsg });
    }
  });

  // Update settings
  app.post('/api/settings', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!isSupabaseConfigured) return res.status(500).json({ error: 'Supabase is not configured' });
    try {
      const { forumChannelId, guildId } = req.body;
      
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
      
      res.json({ success: true });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'POST /api/settings');
      console.error('Error updating settings:', error);
      res.status(500).json({ error: safeMsg });
    }
  });

  // Discord Guilds & Channels
  app.get('/api/discord/guilds', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Refresh token if needed before API call
      const refreshedUser = await refreshDiscordTokenIfNeeded(req.user);
      
      // Token refresh failed - session expired
      if (!refreshedUser || !refreshedUser.accessToken) {
        return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인해주세요.' });
      }
      
      const userResponse = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${refreshedUser.accessToken}` }
      });
      if (!userResponse.ok) throw new Error('Failed to fetch guilds');
      const guilds = await userResponse.json();
      
interface DiscordGuild {
        id: string;
        name: string;
        icon: string | null;
        permissions?: string;
      }
      const adminGuilds = (guilds as DiscordGuild[]).filter((g) => {
        if (!g.permissions) return false;
        const perms = BigInt(g.permissions);
        return (perms & 0x8n) === 0x8n || (perms & 0x20n) === 0x20n; // Administrator or Manage Guild
      });
      
      const botGuilds = client.guilds.cache;
      
      const result = adminGuilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        botInGuild: botGuilds.has(g.id)
      }));

      res.json(result);
    } catch (err: unknown) {
      const safeMsg = getSafeErrorMessage(err, 'GET /api/discord/guilds');
      res.status(500).json({ error: safeMsg });
    }
  });

  app.get('/api/discord/channels/:guildId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const guild = client.guilds.cache.get(req.params.guildId);
      if (!guild) return res.status(404).json({ error: 'Bot is not in this guild' });

      const channels = await guild.channels.fetch();
      const validChannels = channels.filter(c => 
        c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildForum || c.type === ChannelType.GuildAnnouncement || c.type === ChannelType.GuildCategory)
      ).map(c => ({
        id: c!.id,
        name: c!.name,
        type: c!.type,
        parentId: c!.parentId,
        position: c!.rawPosition || 0
      }));

      res.json(validChannels);
    } catch (err: unknown) {
      const safeMsg = getSafeErrorMessage(err, 'GET /api/discord/channels');
      res.status(500).json({ error: safeMsg });
    }
  });

  // Get logs
  app.get('/api/logs', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
      res.json({ logs: logs || [], total: count || 0 });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'GET /api/logs');
      res.status(500).json({ error: safeMsg });
    }
  });

  // Test Trigger (Simulates finding a new YouTube post)
  app.post('/api/test-trigger', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { url, channelId } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'YouTube URL is required.' });
      }
      
      if (!channelId) {
        return res.status(400).json({ error: 'Channel ID is required. Please select a channel first.' });
      }
      
      // Validate YouTube URL
      const urlValidation = validateYouTubeUrl(url);
      if (!urlValidation.valid) {
        return res.status(400).json({ error: urlValidation.message || '유효하지 않은 YouTube URL입니다.' });
      }

      // 1. 봇이 백그라운드에서 URL을 크롤링하여 텍스트와 이미지 추출
      const { content, imageUrl, author } = await scrapeYouTubePost(url);
      
      // 2. 이미지가 있다면 다운로드하여 Base64로 변환 (Discord.js 전송용)
      let imageBase64 = undefined;
      if (imageUrl) {
        imageBase64 = await imageUrlToBase64(imageUrl);
      }

      // 3. 디스코드 포럼에 전송할 제목과 내용 구성
      const title = `${author}님의 새 커뮤니티 게시글`;
      
      // Discord message content limit is 2000 characters.
      // We need to truncate the content if it's too long, leaving room for the URL.
      const maxContentLength = 1800; // Leave 200 chars for the URL and formatting
      const truncatedContent = truncateText(content || '내용 없음', maxContentLength);
      
      const fullContent = `${truncatedContent}\n\n🔗 원본 링크: ${url}`;

      await createForumThread(channelId, title, fullContent, imageBase64, req.user.id);
      res.json({ success: true, message: 'Thread created successfully!' });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'POST /api/test-trigger');
      console.error('Error in test-trigger:', error);
      res.status(500).json({ error: safeMsg });
    }
  });

  // --- Vite Integration ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Start the Discord Bot if token is in env (accept multiple env var names)
  const sanitizeEnv = (value?: string) => (value || '').replace(/\s+/g, '');
  const token = sanitizeEnv(process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN);
  const loginTimeoutRaw = sanitizeEnv(process.env.DISCORD_LOGIN_TIMEOUT_MS);
  const loginTimeoutMs = Number(loginTimeoutRaw || '30000');
  const messageContentEnv = process.env.DISCORD_ENABLE_MESSAGE_CONTENT;
  const guildPresencesEnv = process.env.DISCORD_ENABLE_GUILD_PRESENCES;
  console.log('DEBUG: Token exists?', !!token, '| Key length:', token?.length || 0);
  console.log(`[RENDER_EVENT] BOT_TOKEN_PRESENT value=${!!token}`);
  console.log(`[RENDER_EVENT] BOT_ENV_FLAGS messageContent=${messageContentEnv ?? 'undefined'} guildPresences=${guildPresencesEnv ?? 'undefined'} loginTimeoutMs=${loginTimeoutMs}`);

  // Schedule background job using cron to ensure it keeps running even if errors occur
  // Runs every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      await runBackgroundJob();
    } catch (err) {
      console.error('[Background Job] Cron execution error:', err);
    }
  });

  // Run job once at startup after short delay to ensure bot is ready
  setTimeout(() => runBackgroundJob().catch(err => console.error('[Background Job] Initial run error:', err)), 10000);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[RENDER_EVENT] SERVER_READY port=${PORT}`);
    console.log(`Server running on http://localhost:${PORT}`);

    if (token) {
      setImmediate(() => startBot(token));
    } else {
      console.log('[RENDER_EVENT] BOT_START_SKIPPED reason=missing_token');
    }
  });
}

startServer();
