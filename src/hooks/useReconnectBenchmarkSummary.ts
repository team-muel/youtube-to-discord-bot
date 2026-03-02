import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../config';

const BENCHMARK_SUMMARY_REFRESH_MS = 30000;
const BENCHMARK_SUMMARY_REFRESH_BACKOFF_MS = 60000;

type BenchmarkReconnectSummary = {
  attempts: number;
  total: number;
  success: number;
  failed: number;
  rejected: number;
  bySource: Array<{ source: string; count: number }>;
  byReason: Array<{ reason: string; count: number }>;
  lastResultAt: string | null;
};

type BenchmarkSummaryResponse = {
  reconnect?: BenchmarkReconnectSummary;
};

const getSyncErrorReason = (status: number) => {
  if (status === 401) return 'AUTH';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 422) return 'INVALID_PAYLOAD';
  if (status === 503) return 'CONFIG';
  if (status >= 500) return 'SERVER';
  return 'REQUEST';
};

const toElapsedText = (diffMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s ago`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m ago`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  return `${totalHours}h ago`;
};

interface UseReconnectBenchmarkSummaryParams {
  visible: boolean;
  nowMs: number;
}

export const useReconnectBenchmarkSummary = ({ visible, nowMs }: UseReconnectBenchmarkSummaryParams) => {
  const [summary, setSummary] = useState<BenchmarkReconnectSummary | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [refreshDelayMs, setRefreshDelayMs] = useState(BENCHMARK_SUMMARY_REFRESH_MS);
  const refreshDelayRef = useRef(BENCHMARK_SUMMARY_REFRESH_MS);

  const refreshSummary = useCallback(async () => {
    try {
      const response = await apiFetch('/api/benchmark/summary');
      if (response.status === 401 || response.status === 403) {
        setErrorReason('FORBIDDEN');
        refreshDelayRef.current = BENCHMARK_SUMMARY_REFRESH_BACKOFF_MS;
        setRefreshDelayMs(BENCHMARK_SUMMARY_REFRESH_BACKOFF_MS);
        return false;
      }

      if (!response.ok) {
        setErrorReason(getSyncErrorReason(response.status));
        refreshDelayRef.current = BENCHMARK_SUMMARY_REFRESH_BACKOFF_MS;
        setRefreshDelayMs(BENCHMARK_SUMMARY_REFRESH_BACKOFF_MS);
        return false;
      }

      const payload = (await response.json()) as BenchmarkSummaryResponse;
      setSummary(payload.reconnect || null);
      setErrorReason(null);
      refreshDelayRef.current = BENCHMARK_SUMMARY_REFRESH_MS;
      setRefreshDelayMs(BENCHMARK_SUMMARY_REFRESH_MS);
      return true;
    } catch {
      setErrorReason('NETWORK');
      refreshDelayRef.current = BENCHMARK_SUMMARY_REFRESH_BACKOFF_MS;
      setRefreshDelayMs(BENCHMARK_SUMMARY_REFRESH_BACKOFF_MS);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    void refreshSummary();
  }, [refreshSummary, visible]);

  useEffect(() => {
    refreshDelayRef.current = BENCHMARK_SUMMARY_REFRESH_MS;
    setRefreshDelayMs(BENCHMARK_SUMMARY_REFRESH_MS);
    let timeoutId: number | null = null;
    let cancelled = false;

    const scheduleNext = (delayMs: number) => {
      if (cancelled) {
        return;
      }

      timeoutId = window.setTimeout(async () => {
        if (cancelled) {
          return;
        }

        if (document.visibilityState !== 'visible' || !visible) {
          scheduleNext(refreshDelayRef.current);
          return;
        }

        await refreshSummary();
        scheduleNext(refreshDelayRef.current);
      }, delayMs);
    };

    scheduleNext(refreshDelayRef.current);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [refreshSummary, visible]);

  const successRate = useMemo(() => {
    if (!summary || summary.total <= 0) {
      return 0;
    }

    return Math.round((summary.success / summary.total) * 100);
  }, [summary]);

  const topReasons = useMemo(() => {
    if (!summary?.byReason?.length) {
      return [] as Array<{ reason: string; count: number }>;
    }

    const filtered = summary.byReason.filter((item) => item.reason !== 'OK');
    return (filtered.length ? filtered : summary.byReason).slice(0, 3);
  }, [summary]);

  const topSources = useMemo(() => {
    if (!summary?.bySource?.length) {
      return [] as Array<{ source: string; count: number }>;
    }

    return summary.bySource.slice(0, 2);
  }, [summary]);

  const lastResultText = useMemo(() => {
    const raw = summary?.lastResultAt;
    if (!raw) {
      return '-';
    }

    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) {
      return '-';
    }

    return toElapsedText(nowMs - parsed);
  }, [nowMs, summary]);

  return {
    summary,
    errorReason,
    refreshDelayMs,
    successRate,
    topReasons,
    topSources,
    lastResultText,
    refreshSummary,
    isBackoff: refreshDelayMs > BENCHMARK_SUMMARY_REFRESH_MS,
  };
};
