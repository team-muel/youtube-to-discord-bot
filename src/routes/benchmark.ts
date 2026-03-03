import { randomBytes } from 'crypto';
import { Router, Response, type RequestHandler } from 'express';
import { supabase } from '../supabase';
import type { AuthenticatedRequest } from '../types';
import { getSafeErrorMessage } from '../utils';
import type { BenchmarkEventRow, BenchmarkPayload } from '../backend/benchmark/types';
import { summarizeBenchmarkEvents } from '../backend/benchmark/types';

type BenchmarkRoutesDeps = {
  requireAuth: RequestHandler;
  requireAuthAndCsrf: RequestHandler;
  isSupabaseConfigured: boolean;
  benchmarkMemoryStore: Map<string, BenchmarkEventRow[]>;
  appendBenchmarkMemoryEvents: (userId: string, events: BenchmarkEventRow[]) => void;
};

type BenchmarkEventsRequestBody = {
  events?: Array<Partial<BenchmarkEventRow>>;
};

export const createBenchmarkRouter = ({
  requireAuth,
  requireAuthAndCsrf,
  isSupabaseConfigured,
  benchmarkMemoryStore,
  appendBenchmarkMemoryEvents,
}: BenchmarkRoutesDeps) => {
  const router = Router();

  router.post('/api/benchmark/events', requireAuthAndCsrf, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = (req.body || {}) as BenchmarkEventsRequestBody;
      const rawEvents = Array.isArray(body.events) ? body.events : [];
      const events: BenchmarkEventRow[] = rawEvents
        .slice(0, 120)
        .map((event: Partial<BenchmarkEventRow>) => ({
          id: String(event.id || randomBytes(8).toString('hex')),
          name: String(event.name || 'unknown_event'),
          payload: event.payload && typeof event.payload === 'object' ? (event.payload as BenchmarkPayload) : undefined,
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

  router.get('/api/benchmark/summary', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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

  return router;
};
