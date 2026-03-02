export type ReconnectResult = 'success' | 'failed';

export const toReconnectResult = (ok: boolean): ReconnectResult => {
  return ok ? 'success' : 'failed';
};

export const getReconnectFailureReason = (message: string) => {
  if (message.includes('쿨다운')) return 'COOLDOWN';
  if (message.includes('진행 중')) return 'IN_FLIGHT';
  if (message.includes('활성 봇 토큰')) return 'NO_TOKEN';
  if (message.includes('실패')) return 'RECONNECT_FAILED';
  return 'UNKNOWN';
};
