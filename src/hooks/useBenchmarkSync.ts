import { useEffect } from 'react';
import { apiFetch } from '../config';
import { type BenchmarkEventRecord, getPendingBenchmarkEvents, markBenchmarkEventsAsSent, syncBenchmarkEvents } from '../lib/benchmarkTracker';

const BENCHMARK_SYNC_INTERVAL_MS = 15000;
const BENCHMARK_SYNC_BATCH_SIZE = 80;

const postBenchmarkEvents = async (events: BenchmarkEventRecord[]) => {
  try {
    const response = await apiFetch('/api/benchmark/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const flushByKeepalive = () => {
  const pending = getPendingBenchmarkEvents(BENCHMARK_SYNC_BATCH_SIZE);
  if (!pending.length) {
    return;
  }

  apiFetch('/api/benchmark/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: pending }),
    keepalive: true,
  })
    .then((response) => {
      if (response.ok) {
        markBenchmarkEventsAsSent(pending.map((event) => event.id));
      }
    })
    .catch(() => {
      // ignore network errors on unload path
    });
};

export const useBenchmarkSync = () => {
  useEffect(() => {
    void syncBenchmarkEvents(postBenchmarkEvents, BENCHMARK_SYNC_BATCH_SIZE);

    const interval = window.setInterval(() => {
      void syncBenchmarkEvents(postBenchmarkEvents, BENCHMARK_SYNC_BATCH_SIZE);
    }, BENCHMARK_SYNC_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushByKeepalive();
      }
    };

    const handleBeforeUnload = () => {
      flushByKeepalive();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
};
