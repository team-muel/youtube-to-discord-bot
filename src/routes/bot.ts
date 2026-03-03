import { Router, Response, type RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../types';
import type { BenchmarkPayload } from '../backend/benchmark/types';
import type { BotOperationalStatus, BotRuntimeStatus, BotStatusGrade } from '../types/botStatus';

type BotReconnectRequestBody = {
  reason?: string;
};

type BotReconnectResult = {
  ok: boolean;
  message: string;
};

type BotRoutesDeps = {
  requireAuth: RequestHandler;
  requireAuthAndCsrf: RequestHandler;
  requirePresetAdmin: RequestHandler;
  getBotRuntimeStatus: () => BotRuntimeStatus;
  evaluateBotRuntimeStatus: (runtime: BotRuntimeStatus) => BotOperationalStatus;
  getBotNextCheckInSec: (grade: BotStatusGrade) => number;
  forceBotReconnect: (reason: string) => Promise<BotReconnectResult>;
  getReconnectFailureReason: (message: string) => string;
  toReconnectResult: (ok: boolean) => 'success' | 'failed' | 'rejected';
  appendServerBenchmarkEvent: (params: {
    userId: string;
    name: string;
    path: string;
    payload?: BenchmarkPayload;
  }) => Promise<void>;
  botStatusViewBenchmarkLastAt: Map<string, number>;
  botStatusBenchmarkMinIntervalMs: number;
  botStatusViewBenchmarkIntervalMs: number;
  defaultReconnectReason: string;
  reconnectReasonMaxLength: number;
  botReconnectFailureStatus: number;
};

export const createBotRouter = ({
  requireAuth,
  requireAuthAndCsrf,
  requirePresetAdmin,
  getBotRuntimeStatus,
  evaluateBotRuntimeStatus,
  getBotNextCheckInSec,
  forceBotReconnect,
  getReconnectFailureReason,
  toReconnectResult,
  appendServerBenchmarkEvent,
  botStatusViewBenchmarkLastAt,
  botStatusBenchmarkMinIntervalMs,
  botStatusViewBenchmarkIntervalMs,
  defaultReconnectReason,
  reconnectReasonMaxLength,
  botReconnectFailureStatus,
}: BotRoutesDeps) => {
  const router = Router();

  router.get('/api/bot/status', requireAuth, requirePresetAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const bot = getBotRuntimeStatus();
    const operational = evaluateBotRuntimeStatus(bot);
    const nextCheckInSec = getBotNextCheckInSec(operational.grade);
    const nowMs = Date.now();
    const outageSince = bot.ready
      ? null
      : bot.lastDisconnectAt || bot.lastInvalidatedAt || bot.lastLoginErrorAt || bot.lastLoginAttemptAt;
    const outageDurationMs = outageSince ? Math.max(0, nowMs - Date.parse(outageSince)) : 0;

    const previousAt = botStatusViewBenchmarkLastAt.get(req.user.id) || 0;
    const shouldTrack = nowMs - previousAt >= Math.max(botStatusBenchmarkMinIntervalMs, botStatusViewBenchmarkIntervalMs);
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

  router.post('/api/bot/reconnect', requireAuthAndCsrf, requirePresetAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const body = (req.body || {}) as BotReconnectRequestBody;
    const reason = String(body.reason || defaultReconnectReason).trim().slice(0, reconnectReasonMaxLength) || defaultReconnectReason;
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

    return res.status(result.ok ? 200 : botReconnectFailureStatus).json({
      ok: result.ok,
      message: result.message,
      statusGrade: operational.grade,
      statusSummary: operational.summary,
      recommendations: operational.recommendations,
      bot: runtime,
      actor: req.user.id,
    });
  });

  return router;
};
