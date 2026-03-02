export type BotStatusGrade = 'healthy' | 'degraded' | 'offline';

export type BotRuntimeStatus = {
  started: boolean;
  ready: boolean;
  wsStatus: number;
  tokenPresent: boolean;
  reconnectQueued: boolean;
  reconnectAttempts: number;
  lastReadyAt: string | null;
  lastLoginAttemptAt: string | null;
  lastLoginErrorAt: string | null;
  lastLoginError: string | null;
  lastDisconnectAt: string | null;
  lastDisconnectCode: number | null;
  lastDisconnectReason: string | null;
  lastInvalidatedAt: string | null;
  lastAlertAt: string | null;
  lastAlertReason: string | null;
  lastRecoveryAt: string | null;
  lastManualReconnectAt: string | null;
  manualReconnectCooldownRemainingSec: number;
};

export type BotOperationalStatus = {
  grade: BotStatusGrade;
  healthy: boolean;
  summary: string;
  recommendations: string[];
};

export type BotStatusApiResponse = {
  healthy: boolean;
  statusGrade?: BotStatusGrade;
  statusSummary?: string;
  recommendations?: string[];
  nextCheckInSec?: number;
  outageDurationMs: number;
  bot?: BotRuntimeStatus;
};
