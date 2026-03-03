import express from 'express';
import { applyCommonMiddleware } from './src/middleware/common';
import { createAuthRouter } from './src/routes/auth';
import { createCrawlerRouter } from './src/routes/crawler';
import { createBenchmarkRouter } from './src/routes/benchmark';
import { createBotRouter } from './src/routes/bot';
import { createResearchRouter } from './src/routes/research';
import { createAppRouter } from './src/routes/app';
import { detectRuntimeEnvironment, getCookieSecurity } from './src/backend/runtimeEnvironment';
import { supabase, isSupabaseConfigured } from './src/supabase';
import { client, startBot, createForumThread, logEvent, getBotRuntimeStatus, evaluateBotRuntimeStatus, getBotNextCheckInSec, forceBotReconnect } from './src/bot';
import { scrapeYouTubePost } from './src/scraper';
import { getResolvedResearchPreset, isResearchPresetKey } from './src/content/researchContent';
import { isResolvedResearchPreset } from './src/lib/researchPresetValidation';
import { getReconnectFailureReason, toReconnectResult } from './src/lib/reconnectTelemetry';
import { createCrawlerRuntimeRegistry } from './src/backend/registry/crawlerRuntimeRegistry';
import { summarizeBenchmarkEvents } from './src/backend/benchmark/types';
import { isBackendFeatureEnabled } from './src/backend/registry/externalFeatureRegistry';
import { JwtUser, AuthenticatedRequest } from './src/types';
import { imageUrlToBase64, truncateText, MAX_SOURCES_PER_GUILD, DEFAULT_PAGE_LIMIT, getSafeErrorMessage, validateYouTubeUrl } from './src/utils';

export function createApp() {
  const app = express();
  applyCommonMiddleware(app);
  // ...라우터 등록 및 기타 미들웨어 조립은 server.ts에서 수행...
  return app;
}
