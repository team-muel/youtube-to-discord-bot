import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../config';
import { SurfaceCard } from '../ui/SurfaceCard';
import { UiButton } from '../ui/UiButton';
import { type ResearchPresetKey } from '../../content/researchContent';
import { trackBenchmarkEvent } from '../../lib/benchmarkTracker';
import { type BotStatusApiResponse } from '../../types/botStatus';
import { useReconnectBenchmarkSummary } from '../../hooks/useReconnectBenchmarkSummary';

type HistoryRow = {
  id: string;
  presetKey: string;
  actorUserId: string;
  actorUsername: string;
  source: string;
  payload: unknown;
  metadata?: unknown;
  createdAt: string;
};

const RESTORE_CONFIRM_TTL_MS = 5000;
const FOCUS_HIGHLIGHT_TTL_MS = 2600;
const HISTORY_AUTO_REFRESH_MS = 30000;
const HISTORY_AUTO_REFRESH_BACKOFF_MS = 60000;
const BOT_STATUS_REFRESH_MS = 15000;
const BOT_STATUS_REFRESH_BACKOFF_MS = 45000;
const SYNC_ELAPSED_TICK_MS = 1000;
const SYNC_STALE_AFTER_MS = 90000;
const BOT_STATUS_STALE_AFTER_MS = 90000;
const RECENT_WINDOW_OPTIONS = [10, 30, 60] as const;
type RecentWindowMinutes = (typeof RECENT_WINDOW_OPTIONS)[number];
const RECENT_WINDOW_STORAGE_KEY = 'muel_research_history_recent_window_minutes';

const getStoredRecentWindowMinutes = (): RecentWindowMinutes => {
  if (typeof window === 'undefined') {
    return 10;
  }

  const raw = window.localStorage.getItem(RECENT_WINDOW_STORAGE_KEY);
  const numeric = Number(raw);
  return RECENT_WINDOW_OPTIONS.includes(numeric as RecentWindowMinutes)
    ? (numeric as RecentWindowMinutes)
    : 10;
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

const getSyncErrorReason = (status: number) => {
  if (status === 401) return 'AUTH';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 422) return 'INVALID_PAYLOAD';
  if (status === 503) return 'CONFIG';
  if (status >= 500) return 'SERVER';
  return 'REQUEST';
};

const toBotPollDelayMs = (nextCheckInSec?: number) => {
  if (!Number.isFinite(nextCheckInSec)) {
    return BOT_STATUS_REFRESH_MS;
  }

  const sec = Math.max(10, Math.min(120, Number(nextCheckInSec)));
  return sec * 1000;
};

const getActionLabel = (source: string) => {
  if (source === 'restore') return 'RESTORE';
  if (source === 'upsert') return 'UPSERT';
  return String(source || 'UNKNOWN').toUpperCase();
};

const getActionDescription = (source: string) => {
  if (source === 'restore') return '이전 스냅샷 기준으로 현재 프리셋을 복원한 작업';
  if (source === 'upsert') return '관리자 입력으로 프리셋을 직접 갱신한 작업';
  return '기록된 운영 변경 작업';
};

const getRestoredFromHistoryId = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const candidate = (metadata as Record<string, unknown>).restoredFromHistoryId;
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
};

const formatRestoreError = (status: number, message?: string) => {
  if (status === 401) return '인증이 만료되었습니다. 다시 로그인 후 시도하세요.';
  if (status === 403) return '복원 권한이 없습니다. 관리자 allowlist를 확인하세요.';
  if (status === 404) return '선택한 이력 항목을 찾을 수 없습니다.';
  if (status === 422) return '선택한 스냅샷 payload 형식이 유효하지 않습니다.';
  if (status === 503) return '운영 설정이 준비되지 않았습니다. Supabase 또는 관리자 allowlist를 확인하세요.';
  return message || '복원 처리 중 오류가 발생했습니다.';
};

const SUMMARY_KEYS = ['page', 'stepNav', 'core', 'hero', 'charts', 'data'] as const;

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const hasChanged = (current: unknown, previous: unknown) => {
  return JSON.stringify(current) !== JSON.stringify(previous);
};

type DiffEntry = {
  path: string;
  before: string;
  after: string;
};

const toDisplayString = (value: unknown) => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const collectDiffEntries = (current: unknown, previous: unknown, basePath = ''): DiffEntry[] => {
  if (!hasChanged(current, previous)) {
    return [];
  }

  const currentIsRecord = isObjectRecord(current);
  const previousIsRecord = isObjectRecord(previous);

  if (currentIsRecord || previousIsRecord) {
    const currentRecord = currentIsRecord ? current : {};
    const previousRecord = previousIsRecord ? previous : {};
    const keys = Array.from(new Set([...Object.keys(currentRecord), ...Object.keys(previousRecord)])).sort();

    const nested = keys.flatMap((key) => {
      const nextPath = basePath ? `${basePath}.${key}` : key;
      return collectDiffEntries(currentRecord[key], previousRecord[key], nextPath);
    });

    if (nested.length) {
      return nested;
    }
  }

  const path = basePath || 'root';
  return [
    {
      path,
      before: toDisplayString(previous),
      after: toDisplayString(current),
    },
  ];
};

const getChangedKeys = (current: unknown, previous: unknown) => {
  const currentRecord = isObjectRecord(current) ? current : {};
  const previousRecord = isObjectRecord(previous) ? previous : {};

  return SUMMARY_KEYS.filter((key) => hasChanged(currentRecord[key], previousRecord[key]));
};

interface ResearchPresetHistoryPanelProps {
  presetKey: ResearchPresetKey;
  initialHistoryId?: string | null;
  onRestored?: () => void;
}

export const ResearchPresetHistoryPanel = ({ presetKey, initialHistoryId = null, onRestored }: ResearchPresetHistoryPanelProps) => {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [confirmRestoreRowId, setConfirmRestoreRowId] = useState<string | null>(null);
  const [restoringRowId, setRestoringRowId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [recentWindowMinutes, setRecentWindowMinutes] = useState<RecentWindowMinutes>(() => getStoredRecentWindowMinutes());
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [syncErrorReason, setSyncErrorReason] = useState<string | null>(null);
  const [syncElapsedNow, setSyncElapsedNow] = useState(() => Date.now());
  const [autoRefreshDelayMs, setAutoRefreshDelayMs] = useState(HISTORY_AUTO_REFRESH_MS);
  const [botStatus, setBotStatus] = useState<BotStatusApiResponse | null>(null);
  const [botStatusError, setBotStatusError] = useState<string | null>(null);
  const [lastBotSyncedAt, setLastBotSyncedAt] = useState<string | null>(null);
  const [botRefreshDelayMs, setBotRefreshDelayMs] = useState(BOT_STATUS_REFRESH_MS);
  const [botActionMessage, setBotActionMessage] = useState<string | null>(null);
  const [isBotReconnectPending, setIsBotReconnectPending] = useState(false);
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});
  const isFetchingHistoryRef = useRef(false);
  const autoRefreshDelayRef = useRef(HISTORY_AUTO_REFRESH_MS);
  const botRefreshDelayRef = useRef(BOT_STATUS_REFRESH_MS);
  const autoJumpHandledRef = useRef(false);
  const previousBotHealthyRef = useRef<boolean | null>(null);
  const previousBotStatusErrorRef = useRef<string | null>(null);

  const {
    summary: benchmarkSummary,
    errorReason: benchmarkSummaryError,
    successRate: reconnectSuccessRate,
    topReasons: topReconnectReasons,
    topSources: topReconnectSources,
    lastResultText: reconnectLastResultText,
    refreshSummary: refreshBenchmarkSummary,
    isBackoff: isBenchmarkSummaryBackoff,
  } = useReconnectBenchmarkSummary({ visible, nowMs: syncElapsedNow });

  const syncElapsedText = useMemo(() => {
    if (!lastSyncedAt) {
      return '-';
    }

    const syncedAtMs = Date.parse(lastSyncedAt);
    if (!Number.isFinite(syncedAtMs)) {
      return '-';
    }

    return toElapsedText(syncElapsedNow - syncedAtMs);
  }, [lastSyncedAt, syncElapsedNow]);

  const syncDisplayKind = useMemo(() => {
    if (syncStatus === 'error') {
      return 'error';
    }

    if (!lastSyncedAt) {
      return syncStatus;
    }

    const syncedAtMs = Date.parse(lastSyncedAt);
    if (!Number.isFinite(syncedAtMs)) {
      return syncStatus;
    }

    return syncElapsedNow - syncedAtMs > SYNC_STALE_AFTER_MS ? 'stale' : syncStatus;
  }, [lastSyncedAt, syncElapsedNow, syncStatus]);

  const historySummary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        if (row.source === 'restore') {
          acc.restore += 1;
        } else if (row.source === 'upsert') {
          acc.upsert += 1;
        } else {
          acc.other += 1;
        }

        acc.total += 1;
        return acc;
      },
      { restore: 0, upsert: 0, other: 0, total: 0 },
    );
  }, [rows]);

  const recentSummary = useMemo(() => {
    const now = Date.now();
    const windowMs = recentWindowMinutes * 60 * 1000;

    return rows.reduce(
      (acc, row) => {
        const timestamp = Date.parse(row.createdAt);
        if (!Number.isFinite(timestamp) || now - timestamp > windowMs) {
          return acc;
        }

        if (row.source === 'restore') {
          acc.restore += 1;
        } else if (row.source === 'upsert') {
          acc.upsert += 1;
        }

        acc.total += 1;
        return acc;
      },
      { restore: 0, upsert: 0, total: 0 },
    );
  }, [recentWindowMinutes, rows]);

  const botSyncElapsedText = useMemo(() => {
    if (!lastBotSyncedAt) {
      return '-';
    }

    const syncedAtMs = Date.parse(lastBotSyncedAt);
    if (!Number.isFinite(syncedAtMs)) {
      return '-';
    }

    return toElapsedText(syncElapsedNow - syncedAtMs);
  }, [lastBotSyncedAt, syncElapsedNow]);

  const botStatusKind = useMemo(() => {
    if (!botStatus) {
      return botStatusError ? 'error' : 'idle';
    }

    if (botStatusError) {
      return 'stale';
    }

    if (!lastBotSyncedAt) {
      return botStatus.healthy ? 'ok' : 'error';
    }

    const syncedAtMs = Date.parse(lastBotSyncedAt);
    if (!Number.isFinite(syncedAtMs)) {
      return botStatus.healthy ? 'ok' : 'error';
    }

    if (syncElapsedNow - syncedAtMs > BOT_STATUS_STALE_AFTER_MS) {
      return 'stale';
    }

    return botStatus.healthy ? 'ok' : 'error';
  }, [botStatus, botStatusError, lastBotSyncedAt, syncElapsedNow]);

  const botOutageElapsedText = useMemo(() => {
    if (!botStatus || botStatus.healthy || !botStatus.outageDurationMs) {
      return '0s';
    }

    return toElapsedText(botStatus.outageDurationMs).replace(' ago', '');
  }, [botStatus]);

  const fetchBotStatus = useCallback(async () => {
    try {
      const response = await apiFetch('/api/bot/status');
      if (response.status === 401 || response.status === 403) {
        setBotStatusError('FORBIDDEN');
        botRefreshDelayRef.current = BOT_STATUS_REFRESH_BACKOFF_MS;
        setBotRefreshDelayMs(BOT_STATUS_REFRESH_BACKOFF_MS);
        return false;
      }

      if (!response.ok) {
        setBotStatusError(getSyncErrorReason(response.status));
        botRefreshDelayRef.current = BOT_STATUS_REFRESH_BACKOFF_MS;
        setBotRefreshDelayMs(BOT_STATUS_REFRESH_BACKOFF_MS);
        return false;
      }

      const payload = (await response.json()) as BotStatusApiResponse;
      setBotStatus(payload);
      setBotStatusError(null);
      setLastBotSyncedAt(new Date().toISOString());
      const nextDelayMs = toBotPollDelayMs(payload.nextCheckInSec);
      botRefreshDelayRef.current = nextDelayMs;
      setBotRefreshDelayMs(nextDelayMs);
      return true;
    } catch {
      setBotStatusError('NETWORK');
      botRefreshDelayRef.current = BOT_STATUS_REFRESH_BACKOFF_MS;
      setBotRefreshDelayMs(BOT_STATUS_REFRESH_BACKOFF_MS);
      return false;
    }
  }, []);

  const triggerBotReconnect = useCallback(async () => {
    setIsBotReconnectPending(true);
    setBotActionMessage(null);
    trackBenchmarkEvent('bot_reconnect_ui_attempt', {
      presetKey,
      source: 'studio_panel',
    });
    try {
      const response = await apiFetch('/api/bot/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'studio_panel' }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok) {
        trackBenchmarkEvent('bot_reconnect_ui_failed', {
          presetKey,
          source: 'studio_panel',
          status: response.status,
        });
        setBotActionMessage(payload.message || '봇 재연결 요청에 실패했습니다.');
        return;
      }

      trackBenchmarkEvent('bot_reconnect_ui_success', {
        presetKey,
        source: 'studio_panel',
      });
      setBotActionMessage(payload.message || '봇 재연결 요청을 전송했습니다.');
      await fetchBotStatus();
    } catch {
      trackBenchmarkEvent('bot_reconnect_ui_failed', {
        presetKey,
        source: 'studio_panel',
        status: 'NETWORK',
      });
      setBotActionMessage('네트워크 문제로 봇 재연결 요청에 실패했습니다.');
    } finally {
      setIsBotReconnectPending(false);
    }
  }, [fetchBotStatus, presetKey]);

  const fetchHistory = useCallback(async (options?: { silent?: boolean }) => {
    if (isFetchingHistoryRef.current) {
      return true;
    }

    isFetchingHistoryRef.current = true;
    const isSilent = Boolean(options?.silent);
    if (!isSilent) {
      setLoading(true);
    }

    try {
      const historyLimit = initialHistoryId ? 100 : 20;
      const response = await apiFetch(`/api/research/preset/${presetKey}/history?limit=${historyLimit}`);
      if (response.status === 401 || response.status === 403 || response.status === 503) {
        setVisible(false);
        setSyncStatus('error');
        setSyncErrorReason(getSyncErrorReason(response.status));
        return false;
      }

      if (!response.ok) {
        setRows([]);
        setSyncStatus('error');
        setSyncErrorReason(getSyncErrorReason(response.status));
        return false;
      }

      const payload = (await response.json()) as { rows?: HistoryRow[] };
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
      setVisible(true);
      if (!isSilent) {
        setExpandedRowId(null);
        setConfirmRestoreRowId(null);
        setRestoreError(null);
      }
      setLastSyncedAt(new Date().toISOString());
      setSyncStatus('ok');
      setSyncErrorReason(null);
      autoRefreshDelayRef.current = HISTORY_AUTO_REFRESH_MS;
      setAutoRefreshDelayMs(HISTORY_AUTO_REFRESH_MS);
      return true;
    } catch {
      setRows([]);
      setSyncStatus('error');
      setSyncErrorReason('NETWORK');
      return false;
    } finally {
      isFetchingHistoryRef.current = false;
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, [initialHistoryId, presetKey]);

  const restoreSnapshot = useCallback(
    async (historyId: string) => {
      setRestoringRowId(historyId);
      setRestoreError(null);
      setConfirmRestoreRowId(null);

      try {
        const response = await apiFetch(`/api/research/preset/${presetKey}/restore/${historyId}`, {
          method: 'POST',
        });

        if (response.status === 401 || response.status === 403 || response.status === 503) {
          setVisible(false);
          return;
        }

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          setRestoreError(formatRestoreError(response.status, payload.error));
          return;
        }

        await fetchHistory();
        onRestored?.();
      } catch {
        setRestoreError('네트워크 연결 상태를 확인한 뒤 다시 시도하세요.');
      } finally {
        setRestoringRowId(null);
      }
    },
    [fetchHistory, onRestored, presetKey],
  );

  useEffect(() => {
    void fetchHistory();
    void fetchBotStatus();
  }, [fetchBotStatus, fetchHistory]);

  useEffect(() => {
    autoRefreshDelayRef.current = HISTORY_AUTO_REFRESH_MS;
    setAutoRefreshDelayMs(HISTORY_AUTO_REFRESH_MS);
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

        if (document.visibilityState !== 'visible' || restoringRowId !== null || !visible) {
          scheduleNext(HISTORY_AUTO_REFRESH_MS);
          return;
        }

        const ok = await fetchHistory({ silent: true });
        autoRefreshDelayRef.current = ok ? HISTORY_AUTO_REFRESH_MS : HISTORY_AUTO_REFRESH_BACKOFF_MS;
        setAutoRefreshDelayMs(autoRefreshDelayRef.current);
        scheduleNext(autoRefreshDelayRef.current);
      }, delayMs);
    };

    scheduleNext(autoRefreshDelayRef.current);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [fetchHistory, restoringRowId, visible]);

  useEffect(() => {
    botRefreshDelayRef.current = BOT_STATUS_REFRESH_MS;
    setBotRefreshDelayMs(BOT_STATUS_REFRESH_MS);
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
          scheduleNext(botRefreshDelayRef.current);
          return;
        }

        await fetchBotStatus();
        scheduleNext(botRefreshDelayRef.current);
      }, delayMs);
    };

    scheduleNext(botRefreshDelayRef.current);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [fetchBotStatus, visible]);

  useEffect(() => {
    if (!confirmRestoreRowId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setConfirmRestoreRowId((prev) => (prev === confirmRestoreRowId ? null : prev));
    }, RESTORE_CONFIRM_TTL_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [confirmRestoreRowId]);

  useEffect(() => {
    if (!focusedRowId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFocusedRowId((prev) => (prev === focusedRowId ? null : prev));
    }, FOCUS_HIGHLIGHT_TTL_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [focusedRowId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(RECENT_WINDOW_STORAGE_KEY, String(recentWindowMinutes));
  }, [recentWindowMinutes]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setSyncElapsedNow(Date.now());
    }, SYNC_ELAPSED_TICK_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const jumpToHistoryRow = useCallback((historyId: string) => {
    const target = rowRefs.current[historyId];
    if (!target) {
      setRestoreError('원본 이력 항목을 현재 목록에서 찾지 못했습니다. 이력 새로고침 후 다시 시도하세요.');
      return;
    }

    setExpandedRowId(historyId);
    setFocusedRowId(historyId);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    autoJumpHandledRef.current = false;
  }, [initialHistoryId, presetKey]);

  useEffect(() => {
    if (!initialHistoryId || loading || !rows.length || autoJumpHandledRef.current) {
      return;
    }

    const found = rows.some((row) => row.id === initialHistoryId);
    if (found) {
      autoJumpHandledRef.current = true;
      setRestoreError(null);
      jumpToHistoryRow(initialHistoryId);
      return;
    }

    autoJumpHandledRef.current = true;
    setRestoreError('딥링크 이력 항목을 최근 100건 내에서 찾지 못했습니다. 이력 필터를 확인하거나 항목 ID를 다시 확인하세요.');
  }, [initialHistoryId, jumpToHistoryRow, loading, rows]);

  useEffect(() => {
    if (!botStatus) {
      return;
    }

    const currentHealthy = botStatus.healthy;
    const previousHealthy = previousBotHealthyRef.current;
    if (previousHealthy === null) {
      previousBotHealthyRef.current = currentHealthy;
      return;
    }

    if (previousHealthy !== currentHealthy) {
      trackBenchmarkEvent(currentHealthy ? 'bot_status_recovered' : 'bot_status_degraded', {
        presetKey,
        wsStatus: botStatus.bot?.wsStatus,
        reconnectAttempts: botStatus.bot?.reconnectAttempts,
        outageDurationMs: botStatus.outageDurationMs,
      });
    }

    previousBotHealthyRef.current = currentHealthy;
  }, [botStatus, presetKey]);

  useEffect(() => {
    const previousError = previousBotStatusErrorRef.current;
    if (previousError !== botStatusError) {
      if (botStatusError) {
        trackBenchmarkEvent('bot_status_poll_error', {
          presetKey,
          reason: botStatusError,
          pollMs: botRefreshDelayMs,
        });
      } else if (previousError) {
        trackBenchmarkEvent('bot_status_poll_recovered', {
          presetKey,
          previousReason: previousError,
          pollMs: botRefreshDelayMs,
        });
      }
      previousBotStatusErrorRef.current = botStatusError;
    }
  }, [botRefreshDelayMs, botStatusError, presetKey]);

  if (!visible) {
    return null;
  }

  return (
    <section id="preset-history" className="io-reveal section-emphasis-shell research-admin-shell">
      <SurfaceCard className="research-admin-card">
        <div className="research-admin-head">
          <div>
            <p className="chapter-overline">ADMIN PRESET HISTORY</p>
            <h2 className="chapter-title">프리셋 변경 이력</h2>
            <p className="chapter-desc">최근 변경 내역을 확인해 운영 이력을 추적합니다.</p>
            <div className="research-admin-window" role="tablist" aria-label="Recent history window">
              {RECENT_WINDOW_OPTIONS.map((minutes) => (
                <UiButton
                  key={minutes}
                  size="sm"
                  variant="tab"
                  active={recentWindowMinutes === minutes}
                  className="muel-interact"
                  onClick={() => setRecentWindowMinutes(minutes)}
                >
                  {minutes}m
                </UiButton>
              ))}
            </div>
            <div className="research-admin-summary" aria-label="History action summary">
              <span className="mono-data research-admin-summary-chip" data-kind="restore">
                RESTORE {historySummary.restore}
              </span>
              <span className="mono-data research-admin-summary-chip" data-kind="upsert">
                UPSERT {historySummary.upsert}
              </span>
              {historySummary.other > 0 ? (
                <span className="mono-data research-admin-summary-chip" data-kind="other">
                  OTHER {historySummary.other}
                </span>
              ) : null}
              <span className="mono-data research-admin-summary-chip" data-kind="total">
                TOTAL {historySummary.total}
              </span>
              <span className="mono-data research-admin-summary-chip" data-kind="recent">
                LAST {recentWindowMinutes}M {recentSummary.total}
              </span>
              <span className="mono-data research-admin-summary-chip" data-kind="recent-restore">
                R {recentSummary.restore}
              </span>
              <span className="mono-data research-admin-summary-chip" data-kind="recent-upsert">
                U {recentSummary.upsert}
              </span>
            </div>
            <div className="research-admin-summary" aria-label="Reconnect operation summary">
              <span className="mono-data research-admin-summary-chip" data-kind="total">
                RECONNECT {benchmarkSummary?.total ?? 0}
              </span>
              <span className="mono-data research-admin-summary-chip" data-kind="recent">
                ATTEMPT {benchmarkSummary?.attempts ?? 0}
              </span>
              <span className="mono-data research-admin-summary-chip" data-kind="recent-upsert">
                SUCCESS {benchmarkSummary?.success ?? 0}
              </span>
              <span className="mono-data research-admin-summary-chip" data-kind="restore">
                FAILED {benchmarkSummary?.failed ?? 0}
              </span>
              <span className="mono-data research-admin-summary-chip" data-kind="other">
                REJECTED {benchmarkSummary?.rejected ?? 0}
              </span>
              <span className="mono-data research-admin-summary-chip" data-kind="recent">
                RATE {reconnectSuccessRate}%
              </span>
              <span className="mono-data research-admin-summary-chip" data-kind="recent" title="Last reconnect result timestamp">
                LAST {reconnectLastResultText}
              </span>
              {topReconnectSources.map((sourceItem) => (
                <span
                  key={`source-${sourceItem.source}`}
                  className="mono-data research-admin-summary-chip"
                  data-kind="recent-upsert"
                  title="Top reconnect source"
                >
                  SRC {sourceItem.source.toUpperCase()} {sourceItem.count}
                </span>
              ))}
              {topReconnectReasons.map((reasonItem) => (
                <span
                  key={`reason-${reasonItem.reason}`}
                  className="mono-data research-admin-summary-chip"
                  data-kind="other"
                  title="Top reconnect failure/reject reason"
                >
                  REASON {reasonItem.reason} {reasonItem.count}
                </span>
              ))}
              {benchmarkSummaryError ? (
                <span className="mono-data research-admin-summary-chip" data-kind="other" title="Reconnect benchmark summary fetch error">
                  RS_ERR {benchmarkSummaryError}
                </span>
              ) : null}
              {isBenchmarkSummaryBackoff ? (
                <span className="mono-data research-admin-summary-chip" data-kind="other" title="Reconnect summary polling backoff">
                  RS_BACKOFF
                </span>
              ) : null}
            </div>
          </div>
          <UiButton
            size="sm"
            variant="outline"
            className="muel-interact"
            onClick={() => {
              void fetchHistory();
              void fetchBotStatus();
              void refreshBenchmarkSummary();
            }}
          >
            Refresh
          </UiButton>
          <UiButton
            size="sm"
            variant="outline"
            className="muel-interact"
            disabled={isBotReconnectPending}
            onClick={() => {
              void triggerBotReconnect();
            }}
          >
            {isBotReconnectPending ? 'Reconnecting...' : 'Reconnect Bot'}
          </UiButton>
        </div>

        <p className="mono-data research-admin-sync" data-kind={botStatusKind}>
          Bot sync: {lastBotSyncedAt ? new Date(lastBotSyncedAt).toLocaleTimeString('ko-KR') : '-'} ({botSyncElapsedText}) · poll {Math.floor(botRefreshDelayMs / 1000)}s
          {botStatus ? (
            <>
              <span className="research-admin-sync-badge" data-kind={botStatus.healthy ? 'bot-ok' : 'bot-outage'}>
                {botStatus.statusGrade ? `BOT_${botStatus.statusGrade.toUpperCase()}` : botStatus.healthy ? 'BOT_READY' : 'BOT_DEGRADED'}
              </span>
              {typeof botStatus.nextCheckInSec === 'number' ? (
                <span className="research-admin-sync-badge" data-kind="reason">
                  NEXT {botStatus.nextCheckInSec}s
                </span>
              ) : null}
              <span className="research-admin-sync-badge" data-kind="reason">
                WS {botStatus.bot?.wsStatus ?? '-'}
              </span>
              {!botStatus.healthy ? (
                <span className="research-admin-sync-badge" data-kind="reason">
                  OUTAGE {botOutageElapsedText}
                </span>
              ) : null}
              {(botStatus.bot?.reconnectQueued || (botStatus.bot?.reconnectAttempts || 0) > 0) ? (
                <span className="research-admin-sync-badge" data-kind="backoff">
                  RECONNECT {botStatus.bot?.reconnectAttempts ?? 0}
                </span>
              ) : null}
              {botRefreshDelayMs > BOT_STATUS_REFRESH_MS ? (
                <span className="research-admin-sync-badge" data-kind="backoff">
                  BACKOFF
                </span>
              ) : null}
              {botStatus.bot?.lastAlertAt ? (
                <span
                  className="research-admin-sync-badge"
                  data-kind="reason"
                  title={`lastAlertAt=${botStatus.bot.lastAlertAt} reason=${botStatus.bot.lastAlertReason || '-'}`}
                >
                  ALERT
                </span>
              ) : null}
              {botStatus.bot?.lastRecoveryAt ? (
                <span
                  className="research-admin-sync-badge"
                  data-kind="bot-ok"
                  title={`lastRecoveryAt=${botStatus.bot.lastRecoveryAt}`}
                >
                  RECOVERY
                </span>
              ) : null}
              {botStatus.bot?.lastLoginError ? (
                <span className="research-admin-sync-badge" data-kind="reason" title={botStatus.bot.lastLoginError}>
                  LAST_ERROR
                </span>
              ) : null}
              {botStatus.recommendations?.[0] ? (
                <span className="research-admin-sync-badge" data-kind="reason" title={botStatus.recommendations[0]}>
                  ACTION
                </span>
              ) : null}
            </>
          ) : null}
          {!botStatus && botStatusError ? (
            <span className="research-admin-sync-badge" data-kind="reason">
              {botStatusError}
            </span>
          ) : null}
        </p>

        <p className="mono-data research-admin-sync" data-kind={syncDisplayKind}>
          Last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('ko-KR') : '-'} ({syncElapsedText}) · poll {Math.floor(autoRefreshDelayMs / 1000)}s
          {autoRefreshDelayMs > HISTORY_AUTO_REFRESH_MS ? (
            <span className="research-admin-sync-badge" data-kind="backoff" aria-label="Polling backoff mode active">
              BACKOFF
            </span>
          ) : null}
          {autoRefreshDelayMs > HISTORY_AUTO_REFRESH_MS && syncErrorReason ? (
            <span className="research-admin-sync-badge" data-kind="reason" aria-label="Last polling failure reason">
              {syncErrorReason}
            </span>
          ) : null}
        </p>

        {botActionMessage ? <p className="mono-data research-admin-empty">{botActionMessage}</p> : null}

        {loading ? (
          <p className="mono-data research-admin-empty">Loading history...</p>
        ) : rows.length === 0 ? (
          <p className="mono-data research-admin-empty">No preset updates yet.</p>
        ) : (
          <div className="research-admin-list" role="list" aria-label="Preset update history">
            {rows.map((row, index) => {
              const previous = rows[index + 1];
              const changedKeys = previous ? getChangedKeys(row.payload, previous.payload) : ['data'];
              const isExpanded = expandedRowId === row.id;
              const isConfirmingRestore = confirmRestoreRowId === row.id;
              const restoredFromHistoryId = getRestoredFromHistoryId(row.metadata);
              const diffEntries = previous ? collectDiffEntries(row.payload, previous.payload).slice(0, 40) : [];

              return (
                <article
                  key={row.id}
                  role="listitem"
                  className={`research-admin-item${focusedRowId === row.id ? ' is-focus-target' : ''}`}
                  data-kind={row.source}
                  tabIndex={-1}
                  ref={(node) => {
                    rowRefs.current[row.id] = node;
                  }}
                >
                  <div className="research-admin-item-top">
                    <span className="mono-data research-admin-badge" data-kind={row.source}>
                      {getActionLabel(row.source)}
                    </span>
                    <span className="mono-data research-admin-time">{new Date(row.createdAt).toLocaleString('ko-KR')}</span>
                  </div>
                  <p className="research-admin-title">{row.actorUsername}</p>
                  <p className="research-admin-action-desc">{getActionDescription(row.source)}</p>
                  <p className="mono-data research-admin-meta">UID: {row.actorUserId}</p>
                  {row.source === 'restore' && restoredFromHistoryId ? (
                    <p className="mono-data research-admin-meta">
                      RESTORED FROM:{' '}
                      <button
                        type="button"
                        className="research-admin-history-link"
                        onClick={() => jumpToHistoryRow(restoredFromHistoryId)}
                      >
                        {restoredFromHistoryId}
                      </button>
                    </p>
                  ) : null}

                  <div className="research-admin-diff" aria-label="Changed preset sections">
                    {(changedKeys.length ? changedKeys : ['none']).map((key) => (
                      <span key={`${row.id}-${key}`} className="mono-data research-admin-diff-chip">
                        {key}
                      </span>
                    ))}
                  </div>

                  <div className="research-admin-actions">
                    <UiButton
                      size="sm"
                      variant="outline"
                      className="muel-interact"
                      disabled={restoringRowId !== null}
                      onClick={() => {
                        if (!isConfirmingRestore) {
                          setConfirmRestoreRowId(row.id);
                          setRestoreError(null);
                          return;
                        }

                        void restoreSnapshot(row.id);
                      }}
                    >
                      {restoringRowId === row.id
                        ? 'Restoring...'
                        : isConfirmingRestore
                          ? 'Confirm Restore'
                          : 'Restore'}
                    </UiButton>
                    <UiButton
                      size="sm"
                      variant="ghost"
                      className="muel-interact"
                      disabled={restoringRowId !== null}
                      onClick={() => setExpandedRowId((prev) => (prev === row.id ? null : row.id))}
                    >
                      {isExpanded ? 'Hide Diff' : 'View Diff'}
                    </UiButton>
                    {isConfirmingRestore ? (
                      <UiButton
                        size="sm"
                        variant="ghost"
                        className="muel-interact"
                        disabled={restoringRowId !== null}
                        onClick={() => setConfirmRestoreRowId(null)}
                      >
                        Cancel
                      </UiButton>
                    ) : null}
                  </div>

                  {isConfirmingRestore && restoringRowId !== row.id ? (
                    <p className="mono-data research-admin-confirm">한 번 더 클릭하면 이 스냅샷으로 즉시 복원됩니다. (5초 후 자동 해제)</p>
                  ) : null}

                  {isExpanded ? (
                    previous ? (
                      <div className="research-admin-diff-detail" aria-label="Detailed payload diff">
                        {diffEntries.length === 0 ? (
                          <p className="mono-data research-admin-empty">No detailed field differences found.</p>
                        ) : (
                          diffEntries.map((entry) => (
                            <div key={`${row.id}-${entry.path}`} className="research-admin-diff-row">
                              <p className="mono-data research-admin-diff-path">{entry.path}</p>
                              <p className="research-admin-diff-before">- {entry.before}</p>
                              <p className="research-admin-diff-after">+ {entry.after}</p>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <p className="mono-data research-admin-empty">This is the oldest snapshot in history.</p>
                    )
                  ) : null}
                </article>
              );
            })}
          </div>
        )}

        {restoreError ? <p className="mono-data research-admin-empty">{restoreError}</p> : null}
      </SurfaceCard>
    </section>
  );
};
