export type BenchmarkPayload = Record<string, string | number | boolean | null | undefined>;

export type BenchmarkEventRow = {
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

export const summarizeBenchmarkEvents = (events: BenchmarkEventRow[]) => {
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
