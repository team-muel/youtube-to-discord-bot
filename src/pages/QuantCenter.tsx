import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppHeader } from '../components/ui/AppHeader';
import { BackToTopButton } from '../components/BackToTopButton';
import { MuelReveal } from '../components/ui/MuelReveal';
import { SurfaceCard } from '../components/ui/SurfaceCard';
import { UiButton } from '../components/ui/UiButton';
import { TopSectionSwitcher } from '../components/TopSectionSwitcher';
import { ROUTES } from '../config/routes';
import { apiFetch, apiFetchJson } from '../config';
import { useMuelMotion } from '../hooks/useMuelMotion';
import { getMuelMotionCssVars } from '../lib/getMuelMotionCssVars';

type QuantUser = {
  id: string;
  username: string;
  avatar?: string | null;
  isPresetAdmin?: boolean;
};

type QuantSessionParams = {
  symbol: string;
  timeframe: string;
  signalMode: 'cvd_sma_cross' | 'price_sma_cross';
  leverage: number;
  riskLimitPct: number;
  pollIntervalSec: number;
};

type QuantSession = {
  running: boolean;
  startedAt: string | null;
  stoppedAt: string | null;
  updatedAt: string;
  params: QuantSessionParams;
};

type QuantMetric = {
  id: 'position' | 'winRate' | 'cvd';
  label: string;
  value: number;
  unit: string;
  change: number;
  trend: 'up' | 'down' | 'flat';
  updatedAt: string;
};

type QuantPanelResponse = {
  source: 'backend' | 'fallback';
  metrics: QuantMetric[];
};

type QuantMode = 'main' | 'legacy';

type TradingRuntimeResponse = {
  runtime?: {
    started?: boolean;
    startedAt?: string | null;
    paused?: boolean;
    pausedAt?: string | null;
    pausedReason?: string | null;
    symbols?: string[];
    timeframe?: string;
  };
  strategy?: {
    signal?: {
      mode?: 'cvd_sma_cross' | 'price_sma_cross';
    };
    risk?: {
      leverage?: number;
      riskPct?: number;
    };
    runtime?: {
      pollSeconds?: number;
    };
  };
};

type QuantRouteMapResponse = {
  currentBackend: string;
  quantPanel: string;
  runtime: string;
  strategyGet: string;
  strategyPut: string;
  runtimeResume: string;
  runtimePause: string;
  legacyFallback?: Record<string, string>;
};

type BenchmarkSummaryResponse = {
  reconnect?: {
    attempts?: number;
    success?: number;
    failed?: number;
    rejected?: number;
    lastResultAt?: string | null;
  };
};

type TradeRecord = {
  id: number;
  symbol: string;
  side: 'long' | 'short';
  status: 'open' | 'closed' | 'canceled' | 'error';
  entryPrice: number;
  qty: number;
  createdAt: string;
};

type ActionLogItem = {
  id: string;
  at: string;
  action: string;
  status: number;
  ok: boolean;
  detail: string;
};

interface QuantCenterProps {
  user?: QuantUser | null;
  onLogin?: () => void | Promise<void>;
  onLogout?: () => void | Promise<void>;
}

const toPrettyJson = (value: unknown) => JSON.stringify(value, null, 2);

export const QuantCenter = ({ user, onLogin, onLogout }: QuantCenterProps) => {
  const { tokens } = useMuelMotion();
  const motionCssVars = getMuelMotionCssVars(tokens) as CSSProperties;
  const [panel, setPanel] = useState<QuantPanelResponse | null>(null);
  const [session, setSession] = useState<QuantSession | null>(null);
  const [mode, setMode] = useState<QuantMode>('main');
  const [routeMap, setRouteMap] = useState<QuantRouteMapResponse | null>(null);
  const [benchmarkSummary, setBenchmarkSummary] = useState<BenchmarkSummaryResponse | null>(null);
  const [tradeLogs, setTradeLogs] = useState<TradeRecord[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [params, setParams] = useState<QuantSessionParams>({
    symbol: 'BTCUSDT',
    timeframe: '30m',
    signalMode: 'cvd_sma_cross',
    leverage: 3,
    riskLimitPct: 1.5,
    pollIntervalSec: 15,
  });

  const [runnerPath, setRunnerPath] = useState('/api/trading/runtime');
  const [runnerMethod, setRunnerMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>('GET');
  const [runnerBody, setRunnerBody] = useState('{\n  "reason": "manual"\n}');
  const [runnerResult, setRunnerResult] = useState<string>('');
  const [tradeForm, setTradeForm] = useState({
    symbol: 'BTCUSDT',
    side: 'long' as 'long' | 'short',
    entryPrice: 62000,
    qty: 0.01,
    timeframe: '30m',
    leverage: 3,
    executeOrder: false,
  });

  const pushActionLog = useCallback((item: Omit<ActionLogItem, 'id' | 'at'>) => {
    setActionLogs((prev) => {
      const next: ActionLogItem[] = [
        {
          id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
          at: new Date().toISOString(),
          ...item,
        },
        ...prev,
      ];
      return next.slice(0, 40);
    });
  }, []);

  const buildRouteMap = useCallback(
    (mode: 'main' | 'legacy'): QuantRouteMapResponse =>
      mode === 'main'
        ? {
            currentBackend: 'origin/main compatible',
            quantPanel: '/api/quant/panel',
            runtime: '/api/trading/runtime',
            strategyGet: '/api/trading/strategy',
            strategyPut: '/api/trading/strategy',
            runtimeResume: '/api/trading/runtime/resume',
            runtimePause: '/api/trading/runtime/pause',
            legacyFallback: {
              session: '/api/quant/session',
              start: '/api/quant/session/start',
              stop: '/api/quant/session/stop',
              params: '/api/quant/session/params',
            },
          }
        : {
            currentBackend: 'legacy moved/backend compatible',
            quantPanel: '/api/quant/panel',
            runtime: '/api/quant/session',
            strategyGet: '/api/quant/session',
            strategyPut: '/api/quant/session/params',
            runtimeResume: '/api/quant/session/start',
            runtimePause: '/api/quant/session/stop',
          },
    [],
  );

  const toLegacySession = useCallback((payload: { session: QuantSession }) => payload.session, []);

  const toMainSession = useCallback((payload: TradingRuntimeResponse): QuantSession => {
    const runtime = payload.runtime || {};
    const strategy = payload.strategy || {};
    const signal = strategy.signal || {};
    const risk = strategy.risk || {};
    const runtimeCfg = strategy.runtime || {};

    const symbol = runtime.symbols?.[0] || 'BTCUSDT';
    const running = Boolean(runtime.started) && !Boolean(runtime.paused);
    const updatedAt = runtime.pausedAt || runtime.startedAt || new Date().toISOString();

    return {
      running,
      startedAt: runtime.startedAt || null,
      stoppedAt: runtime.paused ? runtime.pausedAt || null : null,
      updatedAt,
      params: {
        symbol,
        timeframe: runtime.timeframe || '30m',
        signalMode: signal.mode || 'cvd_sma_cross',
        leverage: typeof risk.leverage === 'number' ? risk.leverage : 3,
        riskLimitPct: typeof risk.riskPct === 'number' ? risk.riskPct : 1.5,
        pollIntervalSec: typeof runtimeCfg.pollSeconds === 'number' ? runtimeCfg.pollSeconds : 15,
      },
    };
  }, []);

  const readRuntimeSession = useCallback(async () => {
    const mainResponse = await apiFetch('/api/trading/runtime');
    if (mainResponse.ok) {
      const payload = (await mainResponse.json()) as TradingRuntimeResponse;
      return {
        mode: 'main' as const,
        session: toMainSession(payload),
      };
    }

    const legacyResponse = await apiFetch('/api/quant/session');
    if (legacyResponse.ok) {
      const payload = (await legacyResponse.json()) as { session: QuantSession };
      return {
        mode: 'legacy' as const,
        session: toLegacySession(payload),
      };
    }

    const legacyText = await legacyResponse.text();
    throw new Error(`Runtime load failed (main:${mainResponse.status}, legacy:${legacyResponse.status}) ${legacyText}`);
  }, [toLegacySession, toMainSession]);

  const refreshBenchmarkSummary = useCallback(async () => {
    try {
      const payload = await apiFetchJson<BenchmarkSummaryResponse>('/api/benchmark/summary');
      setBenchmarkSummary(payload);
    } catch {
      setBenchmarkSummary(null);
    }
  }, []);

  const refreshTradeLogs = useCallback(async (symbol?: string) => {
    try {
      const query = symbol ? `?symbol=${encodeURIComponent(symbol)}&limit=20` : '?limit=20';
      const payload = await apiFetchJson<{ trades?: TradeRecord[] }>(`/api/trades${query}`);
      setTradeLogs(payload.trades || []);
    } catch {
      setTradeLogs([]);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [panelPayload, runtimeResult] = await Promise.all([
        apiFetchJson<QuantPanelResponse>('/api/quant/panel'),
        readRuntimeSession(),
      ]);

      setPanel(panelPayload);
      setMode(runtimeResult.mode);
      setSession(runtimeResult.session);
      setRouteMap(buildRouteMap(runtimeResult.mode));
      setParams(runtimeResult.session.params);
      await Promise.all([refreshBenchmarkSummary(), refreshTradeLogs(runtimeResult.session.params.symbol)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quant console data');
    } finally {
      setLoading(false);
    }
  }, [buildRouteMap, readRuntimeSession, refreshBenchmarkSummary, refreshTradeLogs]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const applyParams = useCallback(async () => {
    setActionMessage(null);
    setError(null);

    const strategyPatch = {
      symbols: [params.symbol],
      timeframe: params.timeframe,
      signal: {
        mode: params.signalMode,
      },
      risk: {
        leverage: params.leverage,
        riskPct: params.riskLimitPct,
      },
      runtime: {
        pollSeconds: params.pollIntervalSec,
      },
    };

    let response = await apiFetch('/api/trading/strategy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: strategyPatch }),
    });

    if (response.status === 404) {
      response = await apiFetch('/api/quant/session/params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: params.symbol,
          strategy: params.signalMode,
          leverage: params.leverage,
          riskLimitPct: params.riskLimitPct,
          pollIntervalSec: params.pollIntervalSec,
        }),
      });
    }

    if (!response.ok) {
      const text = await response.text();
      pushActionLog({ action: 'apply-params', status: response.status, ok: false, detail: text || 'failed' });
      throw new Error(`Params update failed (${response.status}): ${text}`);
    }

    pushActionLog({ action: 'apply-params', status: response.status, ok: true, detail: mode === 'main' ? '/api/trading/strategy' : '/api/quant/session/params' });

    setActionMessage('파라미터가 갱신되었습니다.');
    await refreshAll();
  }, [mode, params, pushActionLog, refreshAll]);

  const startSession = useCallback(async () => {
    setActionMessage(null);
    setError(null);

    let response = await apiFetch('/api/trading/runtime/resume', {
      method: 'POST',
    });

    if (response.status === 404) {
      response = await apiFetch('/api/quant/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: params.symbol,
          strategy: params.signalMode,
          leverage: params.leverage,
          riskLimitPct: params.riskLimitPct,
          pollIntervalSec: params.pollIntervalSec,
        }),
      });
    }

    if (!response.ok) {
      const text = await response.text();
      pushActionLog({ action: 'start-session', status: response.status, ok: false, detail: text || 'failed' });
      throw new Error(`Start failed (${response.status}): ${text}`);
    }

    pushActionLog({ action: 'start-session', status: response.status, ok: true, detail: mode === 'main' ? '/api/trading/runtime/resume' : '/api/quant/session/start' });

    setActionMessage('퀀트 세션을 시작했습니다.');
    await refreshAll();
  }, [mode, params, pushActionLog, refreshAll]);

  const stopSession = useCallback(async () => {
    setActionMessage(null);
    setError(null);

    let response = await apiFetch('/api/trading/runtime/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'manual' }),
    });

    if (response.status === 404) {
      response = await apiFetch('/api/quant/session/stop', {
        method: 'POST',
      });
    }

    if (!response.ok) {
      const text = await response.text();
      pushActionLog({ action: 'stop-session', status: response.status, ok: false, detail: text || 'failed' });
      throw new Error(`Stop failed (${response.status}): ${text}`);
    }

    pushActionLog({ action: 'stop-session', status: response.status, ok: true, detail: mode === 'main' ? '/api/trading/runtime/pause' : '/api/quant/session/stop' });

    setActionMessage('퀀트 세션을 종료했습니다.');
    await refreshAll();
  }, [mode, pushActionLog, refreshAll]);

  const runOnce = useCallback(async () => {
    setActionMessage(null);
    setError(null);

    const response = await apiFetch('/api/trading/runtime/run-once', {
      method: 'POST',
    });

    const text = await response.text();
    pushActionLog({ action: 'run-once', status: response.status, ok: response.ok, detail: text || 'no body' });

    if (!response.ok) {
      throw new Error(`Run-once failed (${response.status}): ${text}`);
    }

    setActionMessage('런타임 수동 1회 실행을 요청했습니다.');
    await refreshAll();
  }, [pushActionLog, refreshAll]);

  const submitManualTrade = useCallback(async () => {
    setActionMessage(null);
    setError(null);

    const payload = {
      symbol: tradeForm.symbol,
      side: tradeForm.side,
      timeframe: tradeForm.timeframe,
      entryTs: new Date().toISOString(),
      entryPrice: Number(tradeForm.entryPrice),
      qty: Number(tradeForm.qty),
      leverage: Number(tradeForm.leverage),
      executeOrder: Boolean(tradeForm.executeOrder),
      status: 'open',
    };

    const response = await apiFetch('/api/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    pushActionLog({ action: 'create-trade', status: response.status, ok: response.ok, detail: text || 'no body' });

    if (!response.ok) {
      throw new Error(`Trade create failed (${response.status}): ${text}`);
    }

    setActionMessage('수동 트레이드 등록이 완료되었습니다.');
    await refreshTradeLogs(tradeForm.symbol);
  }, [pushActionLog, refreshTradeLogs, tradeForm]);

  const executeRunner = useCallback(async () => {
    setRunnerResult('');
    const init: RequestInit = { method: runnerMethod };

    if (runnerMethod !== 'GET' && runnerMethod !== 'DELETE') {
      let parsedBody: unknown = undefined;
      if (runnerBody.trim()) {
        parsedBody = JSON.parse(runnerBody);
      }
      init.headers = { 'Content-Type': 'application/json' };
      init.body = parsedBody === undefined ? undefined : JSON.stringify(parsedBody);
    }

    const response = await apiFetch(runnerPath, init);
    const text = await response.text();
    let parsed: unknown = text;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    setRunnerResult(
      toPrettyJson({
        status: response.status,
        ok: response.ok,
        path: runnerPath,
        method: runnerMethod,
        body: parsed,
      }),
    );
    pushActionLog({ action: 'api-runner', status: response.status, ok: response.ok, detail: `${runnerMethod} ${runnerPath}` });
  }, [runnerBody, runnerMethod, runnerPath]);

  const statusLabel = useMemo(() => {
    if (!session) {
      return 'UNKNOWN';
    }

    return session.running ? 'RUNNING' : 'STOPPED';
  }, [session]);

  if (!user?.isPresetAdmin) {
    return <Navigate to={ROUTES.home} replace />;
  }

  return (
    <div className="surface-page surface-bridge hud-grid research-page-shell" style={motionCssVars}>
      <AppHeader
        fixed
        animated={false}
        actions={
          <TopSectionSwitcher
            isAuthenticated={Boolean(user)}
            isPresetAdmin={Boolean(user?.isPresetAdmin)}
            username={user?.username}
            onLogin={onLogin ? () => void onLogin() : undefined}
            onLogout={onLogout ? () => void onLogout() : undefined}
          />
        }
      />

      <main className="section-wrap section-v-80 section-cluster dashboard-kpay-flow dashboard-main-shell">
        <MuelReveal as="section" className="io-reveal section-emphasis-shell" delayMultiplier={0}>
          <header className="muel-section-head">
            <p className="chapter-overline">Admin Only</p>
            <h1 className="chapter-title">퀀트 트레이딩 콘솔</h1>
            <p className="chapter-desc">프론트-백엔드 API 경로 확인, 세션 시작/종료, 파라미터 조절, 수동 트레이드 등록, 실행 로그 확인을 이 화면에서 통합 제어합니다.</p>
          </header>

          <div className="research-binding-strip">
            <span className={`control-room-status ${session?.running ? 'status-completed' : 'status-pending'}`}>Session {statusLabel}</span>
            <span className="control-room-status status-in-progress">Backend Mode: {mode.toUpperCase()}</span>
            {actionMessage ? <p className="research-binding-note">{actionMessage}</p> : null}
            {error ? <p className="research-binding-note">{error}</p> : null}
          </div>
        </MuelReveal>

        <div className="feature-reboot-grid research-triple-grid quant-console-grid">
          <SurfaceCard hoverable className="feature-reboot-card research-feature-card muel-interact quant-console-card">
            <p className="feature-reboot-kicker">Session Control</p>
            <h2 className="feature-reboot-title">시작/종료 및 파라미터</h2>
            <div className="quant-console-form-grid">
              <label className="quant-console-field">
                <span>Symbol</span>
                <input value={params.symbol} onChange={(event) => setParams((prev) => ({ ...prev, symbol: event.target.value }))} />
              </label>
              <label className="quant-console-field">
                <span>Strategy</span>
                <select value={params.signalMode} onChange={(event) => setParams((prev) => ({ ...prev, signalMode: event.target.value as QuantSessionParams['signalMode'] }))}>
                  <option value="cvd_sma_cross">CVD SMA Cross</option>
                  <option value="price_sma_cross">Price SMA Cross</option>
                </select>
              </label>
              <label className="quant-console-field">
                <span>Timeframe</span>
                <input value={params.timeframe} onChange={(event) => setParams((prev) => ({ ...prev, timeframe: event.target.value }))} />
              </label>
              <label className="quant-console-field">
                <span>Leverage</span>
                <input type="number" value={params.leverage} onChange={(event) => setParams((prev) => ({ ...prev, leverage: Number(event.target.value) }))} />
              </label>
              <label className="quant-console-field">
                <span>Risk Limit (%)</span>
                <input type="number" step="0.1" value={params.riskLimitPct} onChange={(event) => setParams((prev) => ({ ...prev, riskLimitPct: Number(event.target.value) }))} />
              </label>
              <label className="quant-console-field">
                <span>Poll Interval (sec)</span>
                <input type="number" value={params.pollIntervalSec} onChange={(event) => setParams((prev) => ({ ...prev, pollIntervalSec: Number(event.target.value) }))} />
              </label>
            </div>

            <div className="hero-cta-stack quant-console-actions">
              <UiButton variant="solid" size="md" onClick={() => void startSession()}>Start</UiButton>
              <UiButton variant="outline" size="md" onClick={() => void stopSession()}>Stop</UiButton>
              {mode === 'main' ? <UiButton variant="outline" size="md" onClick={() => void runOnce()}>Run Once</UiButton> : null}
              <UiButton variant="ghost" size="md" onClick={() => void applyParams()}>Apply Params</UiButton>
              <UiButton variant="ghost" size="md" onClick={() => void refreshAll()}>Refresh</UiButton>
            </div>
          </SurfaceCard>

          <SurfaceCard hoverable className="feature-reboot-card research-feature-card muel-interact quant-console-card">
            <p className="feature-reboot-kicker">API Route Map</p>
            <h2 className="feature-reboot-title">프론트-백엔드 경로</h2>
            <pre className="quant-console-json">{toPrettyJson(routeMap ?? { loading })}</pre>
          </SurfaceCard>

          <SurfaceCard hoverable className="feature-reboot-card research-feature-card muel-interact quant-console-card">
            <p className="feature-reboot-kicker">Panel Snapshot</p>
            <h2 className="feature-reboot-title">실시간 퀀트 패널</h2>
            <div className="feature-reboot-grid">
              {(panel?.metrics || []).map((metric) => (
                <article key={metric.id} className="feature-reboot-card quant-metric-card">
                  <p className="feature-reboot-kicker">{metric.id.toUpperCase()}</p>
                  <h3 className="feature-reboot-title">{metric.label}</h3>
                  <p className="feature-reboot-desc">
                    {metric.value.toFixed(2)} {metric.unit} ({metric.change >= 0 ? '+' : ''}{metric.change.toFixed(2)})
                  </p>
                </article>
              ))}
            </div>
            {!panel?.metrics?.length ? <p className="research-binding-note">패널 데이터가 없습니다.</p> : null}
          </SurfaceCard>
        </div>

        <MuelReveal as="section" className="io-reveal section-emphasis-shell" delayMultiplier={1}>
          <SurfaceCard hoverable className="feature-reboot-card research-feature-card muel-interact quant-console-card">
            <p className="feature-reboot-kicker">Manual Trade</p>
            <h2 className="feature-reboot-title">/api/trades 등록 및 로그 조회</h2>
            <div className="quant-console-form-grid">
              <label className="quant-console-field">
                <span>Symbol</span>
                <input value={tradeForm.symbol} onChange={(event) => setTradeForm((prev) => ({ ...prev, symbol: event.target.value }))} />
              </label>
              <label className="quant-console-field">
                <span>Side</span>
                <select value={tradeForm.side} onChange={(event) => setTradeForm((prev) => ({ ...prev, side: event.target.value as 'long' | 'short' }))}>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </label>
              <label className="quant-console-field">
                <span>Entry Price</span>
                <input type="number" value={tradeForm.entryPrice} onChange={(event) => setTradeForm((prev) => ({ ...prev, entryPrice: Number(event.target.value) }))} />
              </label>
              <label className="quant-console-field">
                <span>Quantity</span>
                <input type="number" step="0.001" value={tradeForm.qty} onChange={(event) => setTradeForm((prev) => ({ ...prev, qty: Number(event.target.value) }))} />
              </label>
              <label className="quant-console-field">
                <span>Timeframe</span>
                <input value={tradeForm.timeframe} onChange={(event) => setTradeForm((prev) => ({ ...prev, timeframe: event.target.value }))} />
              </label>
              <label className="quant-console-field">
                <span>Leverage</span>
                <input type="number" value={tradeForm.leverage} onChange={(event) => setTradeForm((prev) => ({ ...prev, leverage: Number(event.target.value) }))} />
              </label>
              <label className="quant-console-field">
                <span>Execute Order</span>
                <select value={tradeForm.executeOrder ? 'true' : 'false'} onChange={(event) => setTradeForm((prev) => ({ ...prev, executeOrder: event.target.value === 'true' }))}>
                  <option value="false">false</option>
                  <option value="true">true</option>
                </select>
              </label>
            </div>

            <div className="hero-cta-stack quant-console-actions">
              <UiButton variant="solid" size="md" onClick={() => void submitManualTrade()}>Create Trade</UiButton>
              <UiButton variant="ghost" size="md" onClick={() => void refreshTradeLogs(tradeForm.symbol)}>Refresh Trades</UiButton>
            </div>

            <pre className="quant-console-json">
              {toPrettyJson({
                trades: tradeLogs.slice(0, 10),
              })}
            </pre>
          </SurfaceCard>
        </MuelReveal>

        <MuelReveal as="section" className="io-reveal section-emphasis-shell" delayMultiplier={1}>
          <SurfaceCard hoverable className="feature-reboot-card research-feature-card muel-interact quant-console-card">
            <p className="feature-reboot-kicker">API Runner</p>
            <h2 className="feature-reboot-title">경로/메서드/파라미터 직접 실행</h2>

            <div className="quant-runner-head">
              <label className="quant-console-field">
                <span>Method</span>
                <select value={runnerMethod} onChange={(event) => setRunnerMethod(event.target.value as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                  <option value="DELETE">DELETE</option>
                </select>
              </label>
              <label className="quant-console-field quant-console-field-path">
                <span>Path</span>
                <input value={runnerPath} onChange={(event) => setRunnerPath(event.target.value)} />
              </label>
            </div>

            <label className="quant-console-field">
              <span>JSON Body (POST)</span>
              <textarea rows={8} value={runnerBody} onChange={(event) => setRunnerBody(event.target.value)} />
            </label>

            <div className="hero-cta-stack quant-console-actions">
              <UiButton variant="solid" size="md" onClick={() => void executeRunner()}>Execute</UiButton>
            </div>

            <pre className="quant-console-json">{runnerResult || '{\n  "status": "ready"\n}'}</pre>
          </SurfaceCard>
        </MuelReveal>

        <MuelReveal as="section" className="io-reveal section-emphasis-shell" delayMultiplier={1}>
          <SurfaceCard hoverable className="feature-reboot-card research-feature-card muel-interact quant-console-card">
            <p className="feature-reboot-kicker">Verification</p>
            <h2 className="feature-reboot-title">작동 확인 로그</h2>
            <pre className="quant-console-json">
              {toPrettyJson({
                adminAccessFlow: {
                  mode,
                  frontendGate: 'user.isPresetAdmin must be true',
                  backendOrder: [
                    'RESEARCH_PRESET_ADMIN_USER_IDS allowlist',
                    'user_roles.role = admin',
                    'ADMIN_ALLOWLIST_TABLE (optional)',
                  ],
                },
                benchmarkSummary,
                actionLogs: actionLogs.slice(0, 20),
              })}
            </pre>
          </SurfaceCard>
        </MuelReveal>
      </main>

      <BackToTopButton />
    </div>
  );
};
