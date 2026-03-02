import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';
import { randomBytes, timingSafeEqual } from 'crypto';
import { setDefaultResultOrder } from 'dns';
import { supabase, isSupabaseConfigured } from './src/supabase';
import { client, startBot, createForumThread, logEvent, getBotRuntimeStatus, evaluateBotRuntimeStatus, getBotNextCheckInSec, forceBotReconnect } from './src/bot';
import { scrapeYouTubePost } from './src/scraper';
import { getResolvedResearchPreset, isResearchPresetKey, type ResearchPresetKey, type ResolvedResearchPreset } from './src/content/researchContent';
import { isResolvedResearchPreset } from './src/lib/researchPresetValidation';
import { getReconnectFailureReason, toReconnectResult } from './src/lib/reconnectTelemetry';
import { ChannelType } from 'discord.js';
import { JwtUser, Source, SettingsRow, AuthenticatedRequest } from './src/types';
import { imageUrlToBase64, truncateText, MAX_SOURCES_PER_GUILD, DEFAULT_PAGE_LIMIT, MAX_LOGS_DISPLAY, getSafeErrorMessage, validateYouTubeUrl } from './src/utils';

setDefaultResultOrder('ipv4first');

process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[PROCESS] Uncaught exception:', error);
});

const handleShutdownSignal = (signal: NodeJS.Signals) => {
  console.log(`[PROCESS] Received ${signal}, shutting down server resources...`);
  try {
    if (client.isReady()) {
      client.destroy();
    }
  } catch (error) {
    console.error('[PROCESS] Failed during Discord client shutdown:', error);
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));

type BenchmarkPayload = Record<string, string | number | boolean | null | undefined>;

type BenchmarkEventRow = {
  id: string;
  name: string;
  payload?: BenchmarkPayload;
  path: string;
  ts: string;
};

type ReconnectSummary = {
  attempts: number;
  total: number;
  success: number;
  failed: number;
  rejected: number;
  bySource: Array<{ source: string; count: number }>;
  byReason: Array<{ reason: string; count: number }>;
  lastResultAt: string | null;
};

type ResearchPresetSupabaseRow = {
  payload?: unknown;
};

type ResearchPresetAuditInsertRow = {
  preset_key: string;
  actor_user_id: string;
  actor_username: string;
  source: 'upsert' | 'restore';
  payload: ResolvedResearchPreset;
  metadata?: Record<string, string | number | boolean | null>;
  created_at: string;
};

type ResearchPresetAuditSelectRow = {
  id: string;
  preset_key: string;
  actor_user_id: string;
  actor_username: string;
  source: 'supabase' | 'upsert' | 'restore';
  payload: unknown;
  metadata?: unknown;
  created_at: string;
};

const benchmarkMemoryStore = new Map<string, BenchmarkEventRow[]>();
const BENCHMARK_MEMORY_LIMIT = 2000;
const BOT_STATUS_VIEW_BENCHMARK_INTERVAL_MS = Number(process.env.BOT_STATUS_VIEW_BENCHMARK_INTERVAL_MS || 60000);
const botStatusViewBenchmarkLastAt = new Map<string, number>();

const appendBenchmarkMemoryEvents = (userId: string, events: BenchmarkEventRow[]) => {
  const previous = benchmarkMemoryStore.get(userId) || [];
  const next = [...previous, ...events].slice(-BENCHMARK_MEMORY_LIMIT);
  benchmarkMemoryStore.set(userId, next);
};

const appendServerBenchmarkEvent = async ({
  userId,
  name,
  path,
  payload,
}: {
  userId: string;
  name: string;
  path: string;
  payload?: BenchmarkPayload;
}) => {
  const event: BenchmarkEventRow = {
    id: randomBytes(8).toString('hex'),
    name,
    payload,
    path,
    ts: new Date().toISOString(),
  };

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('benchmark_events').insert([
        {
          user_id: userId,
          event_id: event.id,
          name: event.name,
          payload: event.payload || {},
          path: event.path,
          created_at: event.ts,
        },
      ]);

      if (!error) {
        return;
      }
    } catch {
      // fallback to memory store
    }
  }

  appendBenchmarkMemoryEvents(userId, [event]);
};

const summarizeBenchmarkEvents = (events: BenchmarkEventRow[]) => {
  const reconnectSourceCounts: Record<string, number> = {};
  const reconnectReasonCounts: Record<string, number> = {};
  const reconnectSummary: ReconnectSummary = {
    attempts: 0,
    total: 0,
    success: 0,
    failed: 0,
    rejected: 0,
    bySource: [],
    byReason: [],
    lastResultAt: null,
  };

  const registerReconnectResult = (result: string, source: string, reason: string, ts: string) => {
    reconnectSummary.total += 1;
    if (result === 'success') reconnectSummary.success += 1;
    else if (result === 'failed') reconnectSummary.failed += 1;
    else if (result === 'rejected') reconnectSummary.rejected += 1;

    reconnectSourceCounts[source] = (reconnectSourceCounts[source] || 0) + 1;
    reconnectReasonCounts[reason] = (reconnectReasonCounts[reason] || 0) + 1;
    reconnectSummary.lastResultAt = ts;
  };

  events.forEach((event) => {
    if (event.name === 'bot_reconnect_ui_attempt') {
      reconnectSummary.attempts += 1;
      reconnectSourceCounts.ui = (reconnectSourceCounts.ui || 0) + 1;
      return;
    }

    if (event.name === 'bot_reconnect_ui_success') {
      registerReconnectResult('success', 'ui', 'OK', event.ts);
      return;
    }

    if (event.name === 'bot_reconnect_ui_failed') {
      const statusValue = String(event.payload?.status || 'UNKNOWN').toUpperCase();
      registerReconnectResult('failed', 'ui', statusValue, event.ts);
      return;
    }

    if (event.name === 'bot_reconnect_api' || event.name === 'research_bot_reconnect_discord') {
      const resultRaw = String(event.payload?.result || 'unknown').toLowerCase();
      const result = resultRaw === 'success' || resultRaw === 'failed' || resultRaw === 'rejected' ? resultRaw : 'failed';
      const source = String(event.payload?.source || (event.name === 'bot_reconnect_api' ? 'api' : 'slash')).toLowerCase();
      const reason = String(event.payload?.reason || 'UNKNOWN').toUpperCase();
      registerReconnectResult(result, source, reason, event.ts);
      return;
    }
  });

  reconnectSummary.bySource = Object.entries(reconnectSourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));

  reconnectSummary.byReason = Object.entries(reconnectReasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([reason, count]) => ({ reason, count }));

  const eventCounts = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.name] = (acc[event.name] || 0) + 1;
    return acc;
  }, {});

  const routeCounts = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.path] = (acc[event.path] || 0) + 1;
    return acc;
  }, {});

  const topEvents = Object.entries(eventCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const topRoutes = Object.entries(routeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([path, count]) => ({ path, count }));

  return {
    totalEvents: events.length,
    topEvents,
    topRoutes,
    lastEventAt: events[events.length - 1]?.ts || null,
    reconnect: reconnectSummary,
  };
};

const loadResearchPresetFromSupabase = async (presetKey: ResearchPresetKey): Promise<ResolvedResearchPreset | null> => {
  if (!isSupabaseConfigured) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('research_presets')
      .select('payload')
      .eq('preset_key', presetKey)
      .maybeSingle<ResearchPresetSupabaseRow>();

    if (error) {
      return null;
    }

    if (!data?.payload || !isResolvedResearchPreset(data.payload)) {
      return null;
    }

    if (data.payload.key !== presetKey) {
      return {
        ...data.payload,
        key: presetKey,
      };
    }

    return data.payload;
  } catch {
    return null;
  }
};

const appendResearchPresetAudit = async (row: ResearchPresetAuditInsertRow) => {
  if (!isSupabaseConfigured) {
    return;
  }

  try {
    await supabase.from('research_preset_audit').insert(row);
  } catch {
    // audit failure should not block preset updates
  }
};

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
  const sessionSecret = process.env.SESSION_SECRET;

  if (!sessionSecret) {
    throw new Error('SESSION_SECRET is required. Refusing to start with an insecure default secret.');
  }

  // Lightweight health check used by Render/Load balancers
  app.get('/health', (_req: Request, res: Response) => {
    const bot = getBotRuntimeStatus();
    const operational = evaluateBotRuntimeStatus(bot);
    res.status(200).json({
      status: operational.grade === 'healthy' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      botStatusGrade: operational.grade,
      bot,
    });
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
      const decoded = jwt.verify(token, sessionSecret) as JwtUser;
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  const presetAdminUserIds = new Set(
    (process.env.RESEARCH_PRESET_ADMIN_USER_IDS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

  const requirePresetAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!presetAdminUserIds.size) {
      return res.status(503).json({ error: 'Preset admin allowlist is not configured' });
    }

    const userId = req.user?.id;
    if (!userId || !presetAdminUserIds.has(userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };

  const issueAuthCookie = (res: Response, jwtPayload: JwtUser) => {
    const token = jwt.sign(jwtPayload, sessionSecret, { expiresIn: '7d' });
    res.cookie('auth_token', token, {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
  };

  // --- API Routes ---

  app.get('/api/bot/status', requireAuth, requirePresetAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const bot = getBotRuntimeStatus();
    const operational = evaluateBotRuntimeStatus(bot);
    const nextCheckInSec = getBotNextCheckInSec(operational.grade);
    const nowMs = Date.now();
    const outageSince = bot.ready
      ? null
      : bot.lastDisconnectAt || bot.lastInvalidatedAt || bot.lastLoginErrorAt || bot.lastLoginAttemptAt;
    const outageDurationMs = outageSince ? Math.max(0, nowMs - Date.parse(outageSince)) : 0;

    const previousAt = botStatusViewBenchmarkLastAt.get(req.user.id) || 0;
    const shouldTrack = nowMs - previousAt >= Math.max(5000, BOT_STATUS_VIEW_BENCHMARK_INTERVAL_MS);
    if (shouldTrack) {
      botStatusViewBenchmarkLastAt.set(req.user.id, nowMs);
      await appendServerBenchmarkEvent({
        userId: req.user.id,
        name: 'bot_status_view',
        path: '/api/bot/status',
        payload: {
          healthy: !bot.tokenPresent || bot.ready,
          grade: operational.grade,
          ready: bot.ready,
          wsStatus: bot.wsStatus,
          reconnectAttempts: bot.reconnectAttempts,
        },
      });
    }

    return res.status(200).json({
      healthy: operational.healthy,
      statusGrade: operational.grade,
      statusSummary: operational.summary,
      recommendations: operational.recommendations,
      nextCheckInSec,
      outageDurationMs,
      bot,
      actor: req.user.id,
    });
  });

  app.post('/api/bot/reconnect', requireAuth, requirePresetAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const reason = String(req.body?.reason || 'api_manual').trim().slice(0, 80) || 'api_manual';
    const result = await forceBotReconnect(`api:${reason}`);
    const runtime = getBotRuntimeStatus();
    const operational = evaluateBotRuntimeStatus(runtime);
    const failureReason = result.ok ? 'OK' : getReconnectFailureReason(result.message);

    await appendServerBenchmarkEvent({
      userId: req.user.id,
      name: 'bot_reconnect_api',
      path: '/api/bot/reconnect',
      payload: {
        ok: result.ok,
        result: toReconnectResult(result.ok),
        reason: failureReason,
        source: 'api',
        requestReason: reason,
        grade: operational.grade,
        reconnectAttempts: runtime.reconnectAttempts,
      },
    });

    return res.status(result.ok ? 200 : 429).json({
      ok: result.ok,
      message: result.message,
      statusGrade: operational.grade,
      statusSummary: operational.summary,
      recommendations: operational.recommendations,
      bot: runtime,
      actor: req.user.id,
    });
  });

  app.get('/api/research/preset/:presetKey', async (req: Request, res: Response) => {
    const presetKey = String(req.params.presetKey || '').trim();
    if (!isResearchPresetKey(presetKey)) {
      return res.status(404).json({ error: 'Unknown research preset key' });
    }

    const localPreset = getResolvedResearchPreset(presetKey);
    const remotePreset = await loadResearchPresetFromSupabase(presetKey);

    return res.status(200).json({
      preset: remotePreset ?? localPreset,
      source: remotePreset ? 'supabase' : 'local',
    });
  });

  app.post('/api/research/preset/:presetKey', requireAuth, requirePresetAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const presetKey = String(req.params.presetKey || '').trim();
    if (!isResearchPresetKey(presetKey)) {
      return res.status(404).json({ error: 'Unknown research preset key' });
    }

    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase is not configured' });
    }

    const candidatePayload = req.body?.preset;
    if (!isResolvedResearchPreset(candidatePayload)) {
      return res.status(400).json({ error: 'Invalid preset payload shape' });
    }

    const normalizedPayload: ResolvedResearchPreset = {
      ...candidatePayload,
      key: presetKey,
    };

    try {
      const { error } = await supabase
        .from('research_presets')
        .upsert(
          [
            {
              preset_key: presetKey,
              payload: normalizedPayload,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: 'preset_key' },
        );

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      await appendResearchPresetAudit({
        preset_key: presetKey,
        actor_user_id: req.user.id,
        actor_username: req.user.username,
        source: 'upsert',
        payload: normalizedPayload,
        metadata: {
          action: 'upsert',
        },
        created_at: new Date().toISOString(),
      });

      await appendServerBenchmarkEvent({
        userId: req.user.id,
        name: 'research_preset_upsert',
        path: `/api/research/preset/${presetKey}`,
        payload: {
          presetKey,
          actor: req.user.username,
        },
      });

      return res.status(200).json({
        preset: normalizedPayload,
        source: 'supabase',
      });
    } catch (error) {
      const safeMsg = getSafeErrorMessage(error, 'POST /api/research/preset/:presetKey');
      return res.status(500).json({ error: safeMsg });
    }
  });

  app.post('/api/research/preset/:presetKey/restore/:historyId', requireAuth, requirePresetAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const presetKey = String(req.params.presetKey || '').trim();
    if (!isResearchPresetKey(presetKey)) {
      return res.status(404).json({ error: 'Unknown research preset key' });
    }

    const historyId = String(req.params.historyId || '').trim();
    if (!historyId) {
      return res.status(400).json({ error: 'Invalid history id' });
    }

    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase is not configured' });
    }

    try {
      const { data: historyRow, error: historyError } = await supabase
        .from('research_preset_audit')
        .select('id,preset_key,payload')
        .eq('preset_key', presetKey)
        .eq('id', historyId)
        .maybeSingle<{ id: string; preset_key: string; payload: unknown }>();

      if (historyError) {
        return res.status(500).json({ error: historyError.message });
      }

      if (!historyRow) {
        return res.status(404).json({ error: 'History item not found' });
      }

      if (!isResolvedResearchPreset(historyRow.payload)) {
        return res.status(422).json({ error: 'History payload shape is invalid' });
      }

      const normalizedPayload: ResolvedResearchPreset = {
        ...historyRow.payload,
        key: presetKey,
      };

      const { error: upsertError } = await supabase
        .from('research_presets')
        .upsert(
          [
            {
              preset_key: presetKey,
              payload: normalizedPayload,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: 'preset_key' },
        );

      if (upsertError) {
        return res.status(500).json({ error: upsertError.message });
      }

      await appendResearchPresetAudit({
        preset_key: presetKey,
        actor_user_id: req.user.id,
        actor_username: req.user.username,
        source: 'restore',
        payload: normalizedPayload,
        metadata: {
          action: 'restore',
          restoredFromHistoryId: historyId,
        },
        created_at: new Date().toISOString(),
      });

      await appendServerBenchmarkEvent({
        userId: req.user.id,
        name: 'research_preset_restore',
        path: `/api/research/preset/${presetKey}/restore/${historyId}`,
        payload: {
          presetKey,
          restoredFrom: historyId,
          actor: req.user.username,
        },
      });

      return res.status(200).json({
        preset: normalizedPayload,
        source: 'supabase',
        restoredFrom: historyId,
      });
    } catch (error) {
      const safeMsg = getSafeErrorMessage(error, 'POST /api/research/preset/:presetKey/restore/:historyId');
      return res.status(500).json({ error: safeMsg });
    }
  });

  app.get('/api/research/preset/:presetKey/history', requireAuth, requirePresetAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const presetKey = String(req.params.presetKey || '').trim();
    if (!isResearchPresetKey(presetKey)) {
      return res.status(404).json({ error: 'Unknown research preset key' });
    }

    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase is not configured' });
    }

    const requestedLimit = Number(req.query.limit || 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.floor(requestedLimit)))
      : 20;

    try {
      const { data, error } = await supabase
        .from('research_preset_audit')
        .select('id,preset_key,actor_user_id,actor_username,source,payload,metadata,created_at')
        .eq('preset_key', presetKey)
        .order('created_at', { ascending: false })
        .limit(limit)
        .returns<ResearchPresetAuditSelectRow[]>();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const rows = (data || []).map((row) => ({
        id: row.id,
        presetKey: row.preset_key,
        actorUserId: row.actor_user_id,
        actorUsername: row.actor_username,
        source: row.source,
        payload: row.payload,
        metadata: row.metadata,
        createdAt: row.created_at,
      }));

      return res.status(200).json({
        presetKey,
        rows,
      });
    } catch (error) {
      const safeMsg = getSafeErrorMessage(error, 'GET /api/research/preset/:presetKey/history');
      return res.status(500).json({ error: safeMsg });
    }
  });
  
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

      issueAuthCookie(res, jwtPayload);

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

      const tokenWasRefreshed =
        refreshedUser.accessToken !== req.user.accessToken ||
        refreshedUser.refreshToken !== req.user.refreshToken ||
        refreshedUser.tokenExpiresAt !== req.user.tokenExpiresAt;

      if (tokenWasRefreshed) {
        issueAuthCookie(res, refreshedUser);
        req.user = refreshedUser;
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

  app.post('/api/benchmark/events', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawEvents = Array.isArray(req.body?.events) ? req.body.events : [];
      const events: BenchmarkEventRow[] = rawEvents
        .slice(0, 120)
        .map((event: Partial<BenchmarkEventRow>) => ({
          id: String(event.id || randomBytes(8).toString('hex')),
          name: String(event.name || 'unknown_event'),
          payload: event.payload && typeof event.payload === 'object' ? event.payload : undefined,
          path: String(event.path || '/'),
          ts: String(event.ts || new Date().toISOString()),
        }));

      if (!events.length) {
        return res.json({ accepted: 0, stored: 'none' });
      }

      if (isSupabaseConfigured) {
        const { error } = await supabase.from('benchmark_events').insert(
          events.map((event) => ({
            user_id: req.user.id,
            event_id: event.id,
            name: event.name,
            payload: event.payload || {},
            path: event.path,
            created_at: event.ts,
          })),
        );

        if (!error) {
          return res.json({ accepted: events.length, stored: 'supabase' });
        }

        console.warn('[Benchmark] Supabase insert failed, fallback to memory:', error.message);
      }

      appendBenchmarkMemoryEvents(req.user.id, events);
      return res.json({ accepted: events.length, stored: 'memory' });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'POST /api/benchmark/events');
      return res.status(500).json({ error: safeMsg });
    }
  });

  app.get('/api/benchmark/summary', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('benchmark_events')
          .select('event_id,name,payload,path,created_at')
          .eq('user_id', req.user.id)
          .order('created_at', { ascending: true })
          .limit(1200);

        if (!error && data) {
          const events: BenchmarkEventRow[] = data.map((item: {
            event_id?: string;
            name: string;
            payload?: BenchmarkPayload;
            path: string;
            created_at?: string;
          }) => ({
            id: item.event_id || randomBytes(8).toString('hex'),
            name: item.name,
            payload: item.payload,
            path: item.path,
            ts: item.created_at || new Date().toISOString(),
          }));

          return res.json({
            ...summarizeBenchmarkEvents(events),
            source: 'supabase',
          });
        }

        if (error) {
          console.warn('[Benchmark] Supabase summary query failed, fallback to memory:', error.message);
        }
      }

      const events = benchmarkMemoryStore.get(req.user.id) || [];
      return res.json({
        ...summarizeBenchmarkEvents(events),
        source: 'memory',
      });
    } catch (error: unknown) {
      const safeMsg = getSafeErrorMessage(error, 'GET /api/benchmark/summary');
      return res.status(500).json({ error: safeMsg });
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
