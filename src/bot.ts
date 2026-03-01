import { Client, GatewayIntentBits, ChannelType, ForumChannel, AttachmentBuilder, TextChannel } from 'discord.js';
import { lookup, setDefaultResultOrder } from 'node:dns';
import { supabase } from './supabase';

const loginTimeoutMs = Number(process.env.DISCORD_LOGIN_TIMEOUT_MS || 30000);

setDefaultResultOrder('ipv4first');
console.log('[RENDER_EVENT] DNS_RESULT_ORDER value=ipv4first scope=src_bot');

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildPresences,
];

// Create a new client instance
export const client = new Client({
  intents,
});

client.on('ready', () => {
  console.log(`[RENDER_EVENT] BOT_READY tag=${client.user?.tag || 'unknown'}`);
  console.log(`✅ [SUCCESS] Logged in as ${client.user?.tag}`);
  logEvent('Bot started successfully', 'info');
});

client.on('error', (error) => {
  console.error('[DISCORD_ERROR]', error);
  console.error('[Discord Bot] Error:', error);
  logEvent(`Bot error: ${error.message}`, 'error');
});

client.on('warn', (message) => {
  console.warn(`[DISCORD WARN] ${message}`);
  console.log(`[RENDER_EVENT] BOT_WARN ${message}`);
});

client.on('debug', (info) => {
  console.log(`[DISCORD DEBUG] ${info}`);
});

client.rest.on('rateLimited', (info) => {
  console.log(`[RENDER_EVENT] BOT_REST_RATE_LIMIT route=${info.route} retryAfter=${info.retryAfter} limit=${info.limit}`);
});

client.on('shardError', (error, shardId) => {
  const errCode = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? 'unknown') : 'unknown';
  console.log(`[RENDER_EVENT] BOT_SHARD_ERROR shard=${shardId} code=${errCode}`);
  console.error('[DISCORD_SHARD_ERROR]', error);
});

client.on('shardDisconnect', (event, shardId) => {
  console.log(`[RENDER_EVENT] BOT_SHARD_DISCONNECT shard=${shardId} code=${event.code} reason=${event.reason || 'unknown'}`);
  if (event.code === 4014) {
    console.log('[RENDER_EVENT] BOT_INTENTS_DISALLOWED_HINT check Discord Portal privileged intents (Message Content / Presence Intent)');
  }
});

client.on('shardReconnecting', (shardId) => {
  console.log(`[RENDER_EVENT] BOT_SHARD_RECONNECTING shard=${shardId}`);
});

client.on('shardResume', (shardId) => {
  console.log(`[RENDER_EVENT] BOT_SHARD_RESUME shard=${shardId}`);
});

client.on('invalidated', () => {
  console.log('[RENDER_EVENT] BOT_SESSION_INVALIDATED');
});

// Helper to log events to DB
export async function logEvent(message: string, type: 'info' | 'error' | 'success', user_id?: string) {
  try {
    await supabase.from('logs').insert([{ message, type, user_id }]);
  } catch (err) {
    console.error('Failed to write log to DB:', err);
  }
}

// Function to trigger a new forum post
export async function createForumThread(forumChannelId: string, title: string, content: string, imageBase64?: string, user_id?: string) {
  if (!client.isReady()) {
    throw new Error('Discord bot is not ready or not configured.');
  }

  try {
    const channel = await client.channels.fetch(forumChannelId);

    if (!channel) {
      throw new Error('Channel not found.');
    }

    if (channel.type !== ChannelType.GuildForum && channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      throw new Error('Target channel is not a Forum or Text Channel.');
    }

    const messageOptions: any = { content: content };
    
    // If an image was pasted, convert base64 to a buffer and attach it
    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      const attachment = new AttachmentBuilder(buffer, { name: 'uploaded_image.png' });
      messageOptions.files = [attachment];
    }

    let thread;
    if (channel.type === ChannelType.GuildForum) {
      const forumChannel = channel as ForumChannel;
      // Create a thread in the forum channel
      thread = await forumChannel.threads.create({
        name: title.substring(0, 100), // Discord thread names are limited to 100 chars
        message: messageOptions,
      });
    } else {
      const textChannel = channel as TextChannel;
      // Create a thread in the text channel
      thread = await textChannel.threads.create({
        name: title.substring(0, 100),
      });
      // Send the message to the newly created thread
      await thread.send(messageOptions);
    }

    logEvent(`Created new thread: ${title}`, 'success', user_id);
    return thread;
  } catch (error: any) {
    console.error('[Discord Bot] Error creating thread:', error);
    logEvent(`Failed to create thread: ${error.message}`, 'error', user_id);
    throw error;
  }
}

// Start the bot if token is available
export function startBot(token: string) {
  if (!token) {
    console.log('[RENDER_EVENT] BOT_START_SKIPPED reason=missing_token');
    console.log('[Discord Bot] No token provided, bot will not start.');
    return;
  }

  const normalizedToken = token.trim().replace(/^['\"]|['\"]$/g, '');
  const tokenLooksJwtLike = normalizedToken.split('.').length === 3;
  if (normalizedToken.length !== token.length) {
    console.log('[RENDER_EVENT] BOT_TOKEN_NORMALIZED trimmed_or_unquoted=true');
  }
  console.log(`[RENDER_EVENT] BOT_TOKEN_FORMAT jwt_like=${tokenLooksJwtLike}`);

  const messageContentEnv = process.env.DISCORD_ENABLE_MESSAGE_CONTENT;
  const guildPresencesEnv = process.env.DISCORD_ENABLE_GUILD_PRESENCES;
  const nodeOptions = process.env.NODE_OPTIONS;
  console.log(`[RENDER_EVENT] BOT_INTENTS envMessageContent=${messageContentEnv ?? 'undefined'} envGuildPresences=${guildPresencesEnv ?? 'undefined'} effectiveMessageContent=true effectiveGuildPresences=true`);
  console.log(`[RENDER_EVENT] BOT_RUNTIME node=${process.version} platform=${process.platform} nodeOptions=${nodeOptions ?? 'undefined'}`);

  const logDnsResolution = (host: string) => {
    lookup(host, { all: true }, (err, addresses) => {
      if (err) {
        const errCode = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code ?? 'unknown') : 'unknown';
        console.log(`[RENDER_EVENT] DNS_LOOKUP_FAILED host=${host} code=${errCode}`);
        console.error(`[DNS] lookup failed host=${host}:`, err);
        return;
      }

      const joined = (addresses || []).map((item) => `${item.address}/v${item.family}`).join(',');
      console.log(`[RENDER_EVENT] DNS_LOOKUP_OK host=${host} addresses=${joined || 'none'}`);
    });
  };

  logDnsResolution('gateway.discord.gg');
  logDnsResolution('discord.com');

  const runHttpPreflight = async () => {
    console.log('[RENDER_EVENT] BOT_HTTP_PREFLIGHT_START');

    const runCheck = async (name: string, url: string, headers?: Record<string, string>) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        const body = await response.text();
        const bodyPreview = body.replace(/\s+/g, ' ').slice(0, 200);
        console.log(`[RENDER_EVENT] BOT_HTTP_PREFLIGHT_RESULT name=${name} status=${response.status} ok=${response.ok}`);

        if (!response.ok) {
          console.log(`[RENDER_EVENT] BOT_HTTP_PREFLIGHT_BODY name=${name} preview=${bodyPreview || 'empty'}`);
        }
      } catch (err: unknown) {
        const errName = err instanceof Error ? err.name : typeof err;
        const errMessage = err instanceof Error ? err.message : String(err);
        console.log(`[RENDER_EVENT] BOT_HTTP_PREFLIGHT_FAILED name=${name} error=${errName}`);
        console.error(`[Discord Bot] HTTP preflight failed for ${name}:`, errMessage);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    await runCheck('gateway', 'https://discord.com/api/v10/gateway');
    await runCheck('gateway_bot', 'https://discord.com/api/v10/gateway/bot', {
      Authorization: `Bot ${normalizedToken}`,
    });

    console.log('[RENDER_EVENT] BOT_HTTP_PREFLIGHT_DONE');
  };

  let hasRetried = false;
  let attempt = 0;

  const runLoginAttempt = () => {
    attempt += 1;
    const startedAt = Date.now();
    console.log(`[RENDER_EVENT] BOT_LOGIN_ATTEMPT n=${attempt}`);

    const progressInterval = setInterval(() => {
      if (client.isReady()) {
        clearInterval(progressInterval);
        return;
      }
      console.log(`[RENDER_EVENT] BOT_LOGIN_PROGRESS wsStatus=${client.ws.status} elapsedMs=${Date.now() - startedAt}`);
    }, 10000);

    const timeout = setTimeout(() => {
      if (client.isReady()) {
        clearInterval(progressInterval);
        return;
      }

      clearInterval(progressInterval);
      console.log(`[RENDER_EVENT] BOT_LOGIN_TIMEOUT ms=${loginTimeoutMs} attempt=${attempt}`);
      console.error('[Discord Bot] Login timed out before ready event.');

      if (!hasRetried) {
        hasRetried = true;
        console.log('[RENDER_EVENT] BOT_LOGIN_RETRY reason=timeout delayMs=5000');
        try {
          client.destroy();
        } catch (destroyErr) {
          console.error('[Discord Bot] Failed to destroy client before retry:', destroyErr);
        }
        setTimeout(runLoginAttempt, 5000);
      }
    }, loginTimeoutMs);

    client
      .login(normalizedToken)
      .then(() => {
        clearTimeout(timeout);
        clearInterval(progressInterval);
        console.log(`[RENDER_EVENT] BOT_LOGIN_PROMISE_RESOLVED attempt=${attempt}`);
      })
      .catch((err) => {
        clearTimeout(timeout);
        clearInterval(progressInterval);

        const errCode = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code ?? 'unknown') : 'unknown';
        const errMessage = err instanceof Error ? err.message : String(err);
        console.log(`[RENDER_EVENT] BOT_LOGIN_FAILED code=${errCode} attempt=${attempt}`);
        console.error('[Discord Bot] Failed to login:', err);
        logEvent(`Login failed: [${errCode}] ${errMessage}`, 'error');

        if (!hasRetried) {
          hasRetried = true;
          console.log('[RENDER_EVENT] BOT_LOGIN_RETRY reason=login_failed delayMs=5000');
          setTimeout(runLoginAttempt, 5000);
        }
      });

    client.once('ready', () => {
      clearTimeout(timeout);
      clearInterval(progressInterval);
    });
  };

  runHttpPreflight()
    .catch((err) => {
      console.error('[Discord Bot] Unexpected preflight error:', err);
    })
    .finally(() => {
      runLoginAttempt();
    });
}
