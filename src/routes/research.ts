import { Router, Request, Response, type RequestHandler } from 'express';
import type { ResolvedResearchPreset, ResearchPresetKey } from '../content/researchContent';
import type { AuthenticatedRequest } from '../types';
import type { BenchmarkPayload } from '../backend/benchmark/types';
import { getSafeErrorMessage } from '../utils';
import { supabase } from '../supabase';

type ResearchPresetUpsertRequestBody = {
  preset?: unknown;
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

type ResearchRoutesDeps = {
  requireAuth: RequestHandler;
  requireAuthAndCsrf: RequestHandler;
  requirePresetAdmin: RequestHandler;
  isSupabaseConfigured: boolean;
  isResearchPresetKey: (value: string) => value is ResearchPresetKey;
  getResolvedResearchPreset: (key: ResearchPresetKey) => ResolvedResearchPreset;
  loadResearchPresetFromSupabase: (presetKey: ResearchPresetKey) => Promise<ResolvedResearchPreset | null>;
  isResolvedResearchPreset: (value: unknown) => value is ResolvedResearchPreset;
  appendResearchPresetAudit: (row: {
    preset_key: string;
    actor_user_id: string;
    actor_username: string;
    source: 'upsert' | 'restore';
    payload: ResolvedResearchPreset;
    metadata?: Record<string, string | number | boolean | null>;
    created_at: string;
  }) => Promise<void>;
  appendServerBenchmarkEvent: (params: {
    userId: string;
    name: string;
    path: string;
    payload?: BenchmarkPayload;
  }) => Promise<void>;
  presetHistoryDefaultLimit: number;
  presetHistoryMinLimit: number;
  presetHistoryMaxLimit: number;
};

export const createResearchRouter = ({
  requireAuth,
  requireAuthAndCsrf,
  requirePresetAdmin,
  isSupabaseConfigured,
  isResearchPresetKey,
  getResolvedResearchPreset,
  loadResearchPresetFromSupabase,
  isResolvedResearchPreset,
  appendResearchPresetAudit,
  appendServerBenchmarkEvent,
  presetHistoryDefaultLimit,
  presetHistoryMinLimit,
  presetHistoryMaxLimit,
}: ResearchRoutesDeps) => {
  const router = Router();

  router.get('/api/research/preset/:presetKey', async (req: Request, res: Response) => {
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

  router.post('/api/research/preset/:presetKey', requireAuthAndCsrf, requirePresetAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const presetKey = String(req.params.presetKey || '').trim();
    if (!isResearchPresetKey(presetKey)) {
      return res.status(404).json({ error: 'Unknown research preset key' });
    }

    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase is not configured' });
    }

    const body = (req.body || {}) as ResearchPresetUpsertRequestBody;
    const candidatePayload = body.preset;
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

  router.post('/api/research/preset/:presetKey/restore/:historyId', requireAuthAndCsrf, requirePresetAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

  router.get('/api/research/preset/:presetKey/history', requireAuth, requirePresetAdmin, async (req: AuthenticatedRequest, res: Response) => {
    const presetKey = String(req.params.presetKey || '').trim();
    if (!isResearchPresetKey(presetKey)) {
      return res.status(404).json({ error: 'Unknown research preset key' });
    }

    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Supabase is not configured' });
    }

    const requestedLimit = Number(req.query.limit || presetHistoryDefaultLimit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(presetHistoryMinLimit, Math.min(presetHistoryMaxLimit, Math.floor(requestedLimit)))
      : presetHistoryDefaultLimit;

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

  return router;
};
