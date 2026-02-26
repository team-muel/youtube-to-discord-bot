import express from 'express';
import { createServer as createViteServer } from 'vite';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { supabase, isSupabaseConfigured } from './src/supabase';
import { client, startBot, createForumThread } from './src/bot';
import { scrapeYouTubePost } from './src/scraper';
import { ChannelType } from 'discord.js';

// --- Background Job ---
async function runBackgroundJob() {
  if (!isSupabaseConfigured || !client.isReady()) return;

  try {
    // 1. Get all sources directly
    const { data: sources, error: sourcesError } = await supabase.from('sources').select('*');
    if (sourcesError || !sources) return;

    for (const source of sources) {
      const userId = source.user_id;
      const forumChannelId = source.channel_id;
      if (!userId || !forumChannelId) continue;

      try {
        // 3. Scrape the URL
          const { content, imageUrl, author } = await scrapeYouTubePost(source.url);
          
          // 4. Create a signature to detect new posts
          const postSignature = `${content.substring(0, 100)}_${imageUrl}`;
          
          let updateData: any = {
            last_check_status: 'success',
            last_check_error: null,
            last_check_at: new Date().toISOString()
          };

          // If the signature is different from the last one we saved, it's a new post
          if (source.last_post_signature !== postSignature) {
            console.log(`[Background Job] New post detected for ${author} (User: ${userId})`);
            
            let imageBase64 = undefined;
            if (imageUrl) {
              const imgRes = await fetch(imageUrl);
              const arrayBuffer = await imgRes.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
              imageBase64 = `data:${contentType};base64,${buffer.toString('base64')}`;
            }

            const title = `${author}님의 새 커뮤니티 게시글`;
            const maxContentLength = 1800;
            let truncatedContent = content || '내용 없음';
            if (truncatedContent.length > maxContentLength) {
              truncatedContent = truncatedContent.substring(0, maxContentLength) + '...\n(내용이 너무 길어 생략되었습니다)';
            }
            const fullContent = `${truncatedContent}\n\n🔗 원본 링크: ${source.url}`;

            // Send to Discord
            await createForumThread(forumChannelId, title, fullContent, imageBase64, userId);
            
            updateData.last_post_signature = postSignature;
          }
          
          // Update status
          await supabase.from('sources').update(updateData).eq('id', source.id);
        } catch (err: any) {
          console.error(`[Background Job] Error processing source ${source.url} for user ${userId}:`, err.message);
          await supabase.from('sources').update({
            last_check_status: 'error',
            last_check_error: err.message,
            last_check_at: new Date().toISOString()
          }).eq('id', source.id);
        }
      }
    }
  } catch (err) {
    console.error('[Background Job] Fatal error:', err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit to 50mb to allow base64 image uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(cookieParser());

  // --- Auth Middleware ---
  const requireAuth = (req: any, res: any, next: any) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'default_secret');
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
    const state = Buffer.from(JSON.stringify({ redirectUri })).toString('base64');
    
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
    try {
      const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
      redirectUri = decodedState.redirectUri;
    } catch (e) {
      return res.status(400).send('Invalid state');
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
        console.error('Token error:', tokenData);
        return res.status(400).send('Failed to get token');
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

      const token = jwt.sign(
        { id: userData.id, username: userData.username, avatar: userData.avatar, accessToken: tokenData.access_token }, 
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
    } catch (err: any) {
      console.error('OAuth error:', err);
      res.status(500).send('Internal Server Error');
    }
  });

  app.get('/api/auth/me', requireAuth, (req: any, res) => {
    res.json({ user: req.user });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token', {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
    });
    res.json({ success: true });
  });

  // Get bot status
  app.get('/api/status', requireAuth, async (req: any, res) => {
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get sources
  app.get('/api/sources', requireAuth, async (req: any, res) => {
    if (!isSupabaseConfigured) return res.json([]);
    try {
      const { data: sources, error } = await supabase.from('sources').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
      if (error) {
        console.warn('Warning getting sources (table might not exist):', error.message);
        return res.json([]);
      }
      res.json(sources || []);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add source
  app.post('/api/sources', requireAuth, async (req: any, res) => {
    if (!isSupabaseConfigured) return res.status(500).json({ error: 'Supabase is not configured' });
    try {
      const { url, name, guildId, channelId, guildName, channelName } = req.body;
      if (!url || !name || !guildId || !channelId) return res.status(400).json({ error: 'All fields are required' });
      
      // Check limit per guild
      const { count, error: countError } = await supabase
        .from('sources')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id)
        .eq('guild_id', guildId);
        
      if (countError) throw countError;
      if (count !== null && count >= 4) {
        return res.status(403).json({ error: '해당 서버에는 최대 4개까지만 알림을 등록할 수 있습니다. (추후 프리미엄 기능으로 해금 예정 🚀)' });
      }

      const { data, error } = await supabase.from('sources').insert([{ 
        name, url, user_id: req.user.id,
        guild_id: guildId, channel_id: channelId,
        guild_name: guildName, channel_name: channelName
      }]).select();
      if (error) throw error;
      res.json({ id: data[0].id, url, name });
    } catch (error: any) {
      console.error('Error adding source:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete source
  app.delete('/api/sources/:id', requireAuth, async (req: any, res) => {
    if (!isSupabaseConfigured) return res.status(500).json({ error: 'Supabase is not configured' });
    try {
      const { error } = await supabase.from('sources').delete().eq('id', req.params.id).eq('user_id', req.user.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting source:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update source name
  app.put('/api/sources/:id', requireAuth, async (req: any, res) => {
    if (!isSupabaseConfigured) return res.status(500).json({ error: 'Supabase is not configured' });
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const { error } = await supabase.from('sources').update({ name }).eq('id', req.params.id).eq('user_id', req.user.id);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error updating source:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get settings
  app.get('/api/settings', requireAuth, async (req: any, res) => {
    if (!isSupabaseConfigured) return res.json({});
    try {
      const { data: settings, error } = await supabase.from('settings').select('*').eq('user_id', req.user.id);
      if (error) {
        console.warn('Warning getting settings (table might not exist):', error.message);
        return res.json({});
      }
      const settingsObj = (settings || []).reduce((acc: any, curr: any) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
      res.json(settingsObj);
    } catch (error: any) {
      console.error('Error getting settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update settings
  app.post('/api/settings', requireAuth, async (req: any, res) => {
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
    } catch (error: any) {
      console.error('Error updating settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Discord Guilds & Channels
  app.get('/api/discord/guilds', requireAuth, async (req: any, res) => {
    try {
      const userResponse = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${req.user.accessToken}` }
      });
      if (!userResponse.ok) throw new Error('Failed to fetch guilds');
      const guilds = await userResponse.json();
      
      const adminGuilds = guilds.filter((g: any) => {
        if (!g.permissions) return false;
        const perms = BigInt(g.permissions);
        return (perms & 0x8n) === 0x8n || (perms & 0x20n) === 0x20n; // Administrator or Manage Guild
      });

      const botGuilds = client.guilds.cache;
      
      const result = adminGuilds.map((g: any) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        botInGuild: botGuilds.has(g.id)
      }));

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/discord/channels/:guildId', requireAuth, async (req: any, res) => {
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get logs
  app.get('/api/logs', requireAuth, async (req: any, res) => {
    if (!isSupabaseConfigured) return res.json([]);
    try {
      const { data: logs, error } = await supabase.from('logs').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50);
      if (error) {
        console.warn('Warning getting logs (table might not exist):', error.message);
        return res.json([]);
      }
      res.json(logs || []);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Test Trigger (Simulates finding a new YouTube post)
  app.post('/api/test-trigger', requireAuth, async (req: any, res) => {
    try {
      const { url, channelId } = req.body;
      
      if (!channelId) {
        return res.status(400).json({ error: 'Channel ID is required. Please select a channel first.' });
      }

      // 1. 봇이 백그라운드에서 URL을 크롤링하여 텍스트와 이미지 추출
      const { content, imageUrl, author } = await scrapeYouTubePost(url);
      
      // 2. 이미지가 있다면 다운로드하여 Base64로 변환 (Discord.js 전송용)
      let imageBase64 = undefined;
      if (imageUrl) {
        const imgRes = await fetch(imageUrl);
        const arrayBuffer = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        imageBase64 = `data:${contentType};base64,${buffer.toString('base64')}`;
      }

      // 3. 디스코드 포럼에 전송할 제목과 내용 구성
      const title = `${author}님의 새 커뮤니티 게시글`;
      
      // Discord message content limit is 2000 characters.
      // We need to truncate the content if it's too long, leaving room for the URL.
      const maxContentLength = 1800; // Leave 200 chars for the URL and formatting
      let truncatedContent = content || '내용 없음'; // Ensure content is never completely empty
      if (truncatedContent.length > maxContentLength) {
        truncatedContent = truncatedContent.substring(0, maxContentLength) + '...\n(내용이 너무 길어 생략되었습니다)';
      }
      
      const fullContent = `${truncatedContent}\n\n🔗 원본 링크: ${url}`;

      await createForumThread(channelId, title, fullContent, imageBase64, req.user.id);
      res.json({ success: true, message: 'Thread created successfully!' });
    } catch (error: any) {
      console.error('Error in test-trigger:', error);
      res.status(500).json({ error: error.message });
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

  // Start the Discord Bot if token is in env
  const token = process.env.DISCORD_BOT_TOKEN;
  if (token) {
    startBot(token);
  }

  // Start the background job to run every 10 minutes (600,000 ms)
  setInterval(runBackgroundJob, 10 * 60 * 1000);
  // Run it once on startup after a short delay to ensure bot is ready
  setTimeout(runBackgroundJob, 10000);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
