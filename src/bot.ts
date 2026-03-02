import {
  Client,
  GatewayIntentBits,
  ChannelType,
  ForumChannel,
  AttachmentBuilder,
  TextChannel,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Interaction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { lookup, setDefaultResultOrder } from 'node:dns';
import { randomBytes } from 'node:crypto';
import { supabase, isSupabaseConfigured } from './supabase';
import { isResearchPresetKey, type ResolvedResearchPreset } from './content/researchContent';
import { isResolvedResearchPreset } from './lib/researchPresetValidation';
import { getReconnectFailureReason, toReconnectResult } from './lib/reconnectTelemetry';
import { type BotRuntimeStatus, type BotOperationalStatus } from './types/botStatus';

const loginTimeoutMs = Number(process.env.DISCORD_LOGIN_TIMEOUT_MS || 30000);
const reconnectDelayMs = Number(process.env.DISCORD_RECONNECT_DELAY_MS || 8000);
const manualReconnectCooldownMs = Number(process.env.DISCORD_MANUAL_RECONNECT_COOLDOWN_MS || 30000);
const interactionTtlMs = Number(process.env.DISCORD_INTERACTION_TTL_MS || 300000);
const botAlertWebhookUrl = (process.env.DISCORD_BOT_ALERT_WEBHOOK_URL || '').trim();
const botAlertCooldownMs = Number(process.env.DISCORD_BOT_ALERT_COOLDOWN_MS || 300000);

setDefaultResultOrder('ipv4first');
console.log('[RENDER_EVENT] DNS_RESULT_ORDER value=ipv4first scope=src_bot');

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildPresences,
];

// Create a new client instance
export const client = new Client({
  intents,
});

const botRuntimeStatus: BotRuntimeStatus = {
  started: false,
  ready: false,
  wsStatus: client.ws.status,
  tokenPresent: false,
  reconnectQueued: false,
  reconnectAttempts: 0,
  lastReadyAt: null,
  lastLoginAttemptAt: null,
  lastLoginErrorAt: null,
  lastLoginError: null,
  lastDisconnectAt: null,
  lastDisconnectCode: null,
  lastDisconnectReason: null,
  lastInvalidatedAt: null,
  lastAlertAt: null,
  lastAlertReason: null,
  lastRecoveryAt: null,
  lastManualReconnectAt: null,
  manualReconnectCooldownRemainingSec: 0,
};

let activeBotToken: string | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectInFlight = false;
let lastBotAlertAtMs = 0;
let lastManualReconnectAtMs = 0;

const updateBotRuntimeWsStatus = () => {
  botRuntimeStatus.wsStatus = client.ws.status;
};

const getManualReconnectCooldownRemainingSec = () => {
  const cooldownMs = Math.max(5000, manualReconnectCooldownMs);
  const remainMs = Math.max(0, cooldownMs - (Date.now() - lastManualReconnectAtMs));
  return Math.ceil(remainMs / 1000);
};

const sendBotOperationalAlert = async (reason: string, details: string, level: 'warning' | 'success' = 'warning') => {
  if (!botAlertWebhookUrl) {
    return;
  }

  const now = Date.now();
  if (level !== 'success' && now - lastBotAlertAtMs < Math.max(10000, botAlertCooldownMs)) {
    return;
  }

  if (level !== 'success') {
    lastBotAlertAtMs = now;
    botRuntimeStatus.lastAlertAt = new Date(now).toISOString();
    botRuntimeStatus.lastAlertReason = reason;
  } else {
    botRuntimeStatus.lastRecoveryAt = new Date(now).toISOString();
  }

  const prefix = level === 'success' ? '✅ BOT_RECOVERED' : '⚠️ BOT_OFFLINE';
  const content = `${prefix} reason=${reason} details=${details} wsStatus=${client.ws.status}`;

  try {
    await fetch(botAlertWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
  } catch (error) {
    console.error('[Discord Bot] Failed to send operational alert:', error);
  }
};

const scheduleBotReconnect = (reason: string, delayMs = reconnectDelayMs) => {
  if (!activeBotToken) {
    return;
  }

  if (reconnectTimer || reconnectInFlight) {
    return;
  }

  botRuntimeStatus.reconnectQueued = true;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    botRuntimeStatus.reconnectQueued = false;
    if (!activeBotToken || client.isReady() || reconnectInFlight) {
      updateBotRuntimeWsStatus();
      return;
    }

    reconnectInFlight = true;
    botRuntimeStatus.reconnectAttempts += 1;
    botRuntimeStatus.lastLoginAttemptAt = new Date().toISOString();
    updateBotRuntimeWsStatus();

    console.log(`[RENDER_EVENT] BOT_RECONNECT_ATTEMPT n=${botRuntimeStatus.reconnectAttempts} reason=${reason}`);

    try {
      try {
        client.destroy();
      } catch {
        // ignore destroy errors
      }

      await client.login(activeBotToken);
      updateBotRuntimeWsStatus();
      console.log(`[RENDER_EVENT] BOT_RECONNECT_PROMISE_RESOLVED reason=${reason}`);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      botRuntimeStatus.lastLoginErrorAt = new Date().toISOString();
      botRuntimeStatus.lastLoginError = errMessage;
      updateBotRuntimeWsStatus();
      console.log(`[RENDER_EVENT] BOT_RECONNECT_FAILED reason=${reason}`);
      console.error('[Discord Bot] Reconnect failed:', error);
      scheduleBotReconnect('reconnect_failed', Math.max(5000, reconnectDelayMs));
    } finally {
      reconnectInFlight = false;
    }
  }, Math.max(1000, delayMs));
};

export const getBotRuntimeStatus = () => {
  updateBotRuntimeWsStatus();
  botRuntimeStatus.manualReconnectCooldownRemainingSec = getManualReconnectCooldownRemainingSec();
  return {
    ...botRuntimeStatus,
  };
};

export const forceBotReconnect = async (reason = 'manual') => {
  if (!activeBotToken) {
    return {
      ok: false,
      message: '활성 봇 토큰이 없어 재연결을 실행할 수 없습니다.',
    };
  }

  const cooldownRemainingSec = getManualReconnectCooldownRemainingSec();
  if (cooldownRemainingSec > 0) {
    return {
      ok: false,
      message: `수동 재연결 쿨다운이 ${cooldownRemainingSec}초 남아 있습니다.`,
    };
  }

  if (reconnectInFlight) {
    return {
      ok: false,
      message: '이미 재연결이 진행 중입니다.',
    };
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    botRuntimeStatus.reconnectQueued = false;
  }

  reconnectInFlight = true;
  lastManualReconnectAtMs = Date.now();
  botRuntimeStatus.lastManualReconnectAt = new Date(lastManualReconnectAtMs).toISOString();
  botRuntimeStatus.lastLoginAttemptAt = new Date().toISOString();
  botRuntimeStatus.reconnectAttempts += 1;
  botRuntimeStatus.ready = false;
  updateBotRuntimeWsStatus();

  try {
    try {
      client.destroy();
    } catch {
      // ignore destroy errors
    }

    await client.login(activeBotToken);
    updateBotRuntimeWsStatus();

    return {
      ok: true,
      message: `수동 재연결 요청을 수락했습니다. reason=${reason}`,
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    botRuntimeStatus.lastLoginErrorAt = new Date().toISOString();
    botRuntimeStatus.lastLoginError = errMessage;
    botRuntimeStatus.ready = false;
    updateBotRuntimeWsStatus();
    scheduleBotReconnect('manual_reconnect_failed', Math.max(5000, reconnectDelayMs));

    return {
      ok: false,
      message: `수동 재연결 실패: ${errMessage}`,
    };
  } finally {
    reconnectInFlight = false;
  }
};

export const evaluateBotRuntimeStatus = (runtime: BotRuntimeStatus): BotOperationalStatus => {
  const recommendations: string[] = [];

  if (!runtime.tokenPresent) {
    recommendations.push('DISCORD_TOKEN 또는 DISCORD_BOT_TOKEN 설정을 확인하세요.');
  }

  if (runtime.lastDisconnectCode === 4014) {
    recommendations.push('Discord Portal에서 Message Content/Presence Intent를 활성화하세요.');
  }

  if (runtime.lastLoginError?.toLowerCase().includes('invalid token')) {
    recommendations.push('봇 토큰을 재발급하고 배포 환경 시크릿을 교체하세요.');
  }

  if (runtime.reconnectQueued || runtime.reconnectAttempts > 0) {
    recommendations.push('네트워크 경로와 Discord Gateway 접근 상태를 확인하세요.');
  }

  if (runtime.ready) {
    return {
      grade: 'healthy',
      healthy: true,
      summary: '봇이 정상 연결 상태입니다.',
      recommendations: recommendations.length ? recommendations.slice(0, 3) : ['현재 즉시 조치 필요 없음'],
    };
  }

  if (!runtime.tokenPresent) {
    return {
      grade: 'offline',
      healthy: false,
      summary: '봇 토큰이 없어 오프라인 상태입니다.',
      recommendations: recommendations.length ? recommendations.slice(0, 4) : ['봇 토큰을 설정하세요.'],
    };
  }

  return {
    grade: runtime.reconnectQueued || runtime.reconnectAttempts > 0 ? 'degraded' : 'offline',
    healthy: false,
    summary: runtime.reconnectQueued
      ? '봇이 재연결 시도 중입니다.'
      : '봇 연결이 끊긴 상태입니다.',
    recommendations: recommendations.length ? recommendations.slice(0, 4) : ['로그인 오류 및 Gateway 연결 상태를 확인하세요.'],
  };
};

export const getBotNextCheckInSec = (grade: BotOperationalStatus['grade']) => {
  if (grade === 'healthy') {
    return 60;
  }

  if (grade === 'degraded') {
    return 30;
  }

  return 10;
};

type AuditSource = 'upsert' | 'restore';

const presetAdminUserIds = new Set(
  (process.env.RESEARCH_PRESET_ADMIN_USER_IDS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

const studioBaseUrlRaw =
  process.env.RESEARCH_STUDIO_URL ||
  process.env.STUDIO_BASE_URL ||
  process.env.APP_BASE_URL ||
  '';
const presetMutationCooldownMs = Number(process.env.RESEARCH_PRESET_MUTATION_COOLDOWN_MS || 8000);

const studioBaseUrl = studioBaseUrlRaw.trim().replace(/\/+$/, '');
const presetMutationLocks = new Map<string, number>();

const isPresetAdmin = (userId: string) => {
  return presetAdminUserIds.size > 0 && presetAdminUserIds.has(userId);
};

const buildStudioPresetLink = (presetKey: string, historyId?: string) => {
  if (!studioBaseUrl) {
    return null;
  }

  try {
    const url = new URL('/studio', studioBaseUrl);
    url.searchParams.set('preset', presetKey);
    if (historyId) {
      url.searchParams.set('historyId', historyId);
    }
    url.hash = 'preset-history';
    return url.toString();
  } catch {
    return null;
  }
};

const appendStudioPresetLink = (message: string, presetKey: string, historyId?: string) => {
  const link = buildStudioPresetLink(presetKey, historyId);
  if (!link) {
    return message;
  }

  return `${message}\nStudio: ${link}`;
};

const acquirePresetMutationLock = (lockKey: string) => {
  const now = Date.now();
  const activeUntil = presetMutationLocks.get(lockKey) || 0;
  if (activeUntil > now) {
    return Math.ceil((activeUntil - now) / 1000);
  }

  presetMutationLocks.set(lockKey, now + Math.max(1000, presetMutationCooldownMs));
  return 0;
};

const releasePresetMutationLock = (lockKey: string) => {
  presetMutationLocks.delete(lockKey);
};

const PRESET_RESTORE_BUTTON_PREFIX = 'preset_restore';
const PRESET_HISTORY_PAGE_BUTTON_PREFIX = 'preset_history_page';
const BOT_STATUS_REFRESH_BUTTON_PREFIX = 'bot_status_refresh';
const PRESET_HISTORY_PAGE_SIZE = 5;

const toDurationText = (diffMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${totalSeconds % 60}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
};

const buildPresetRestoreButtonCustomId = (presetKey: string, historyId: string, requesterUserId: string) => {
  return `${PRESET_RESTORE_BUTTON_PREFIX}|${presetKey}|${historyId}|${requesterUserId}|${Date.now()}`;
};

const parsePresetRestoreButtonCustomId = (customId: string) => {
  const [prefix, presetKey, historyId, requesterUserId, issuedAtRaw] = customId.split('|');
  if (prefix !== PRESET_RESTORE_BUTTON_PREFIX) {
    return null;
  }

  const issuedAt = Number(issuedAtRaw);
  if (!presetKey || !historyId || !requesterUserId || !Number.isFinite(issuedAt)) {
    return null;
  }

  return {
    presetKey,
    historyId,
    requesterUserId,
    issuedAt,
  };
};

const buildPresetHistoryPageButtonCustomId = (presetKey: string, requesterUserId: string, pageIndex: number, limit: number) => {
  return `${PRESET_HISTORY_PAGE_BUTTON_PREFIX}|${presetKey}|${requesterUserId}|${pageIndex}|${limit}|${Date.now()}`;
};

const parsePresetHistoryPageButtonCustomId = (customId: string) => {
  const [prefix, presetKey, requesterUserId, pageIndexRaw, limitRaw, issuedAtRaw] = customId.split('|');
  if (prefix !== PRESET_HISTORY_PAGE_BUTTON_PREFIX) {
    return null;
  }

  const pageIndex = Number(pageIndexRaw);
  const limit = Number(limitRaw);
  const issuedAt = Number(issuedAtRaw);
  if (!presetKey || !requesterUserId || !Number.isInteger(pageIndex) || pageIndex < 0 || !Number.isInteger(limit) || limit < 1 || !Number.isFinite(issuedAt)) {
    return null;
  }

  return {
    presetKey,
    requesterUserId,
    pageIndex,
    limit,
    issuedAt,
  };
};

const buildBotStatusRefreshButtonCustomId = (requesterUserId: string) => {
  return `${BOT_STATUS_REFRESH_BUTTON_PREFIX}|${requesterUserId}|${Date.now()}`;
};

const parseBotStatusRefreshButtonCustomId = (customId: string) => {
  const [prefix, requesterUserId, issuedAtRaw] = customId.split('|');
  const issuedAt = Number(issuedAtRaw);
  if (prefix !== BOT_STATUS_REFRESH_BUTTON_PREFIX || !requesterUserId || !Number.isFinite(issuedAt)) {
    return null;
  }

  return {
    requesterUserId,
    issuedAt,
  };
};

const isInteractionExpired = (issuedAt: number) => {
  const ttl = Math.max(10000, interactionTtlMs);
  return Date.now() - issuedAt > ttl;
};

const notifyExpiredButtonInteraction = async (interaction: ButtonInteraction, message: string) => {
  try {
    await interaction.update({
      components: [],
    });
    await interaction.followUp({
      content: message,
      ephemeral: true,
    });
    return;
  } catch {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message).catch(() => undefined);
      return;
    }

    await interaction.reply({
      content: message,
      ephemeral: true,
    }).catch(() => undefined);
  }
};

const buildBotStatusReplyPayload = (runtime: ReturnType<typeof getBotRuntimeStatus>, requesterUserId: string) => {
  const nowMs = Date.now();
  const outageSince = runtime.ready
    ? null
    : runtime.lastDisconnectAt || runtime.lastInvalidatedAt || runtime.lastLoginErrorAt || runtime.lastLoginAttemptAt;
  const outageDuration = outageSince ? Math.max(0, nowMs - Date.parse(outageSince)) : 0;
  const operational = evaluateBotRuntimeStatus(runtime);
  const nextCheckInSec = getBotNextCheckInSec(operational.grade);
  const statusText = operational.grade.toUpperCase();
  const statusColor = operational.grade === 'healthy' ? 0x22c55e : operational.grade === 'degraded' ? 0xf59e0b : 0xef4444;

  const embed = new EmbedBuilder()
    .setTitle('Bot Runtime Status')
    .setColor(statusColor)
    .setDescription(`STATUS: ${statusText}\n${operational.summary}`)
    .addFields(
      {
        name: 'Core',
        value: [
          `READY: ${runtime.ready ? 'YES' : 'NO'}`,
          `WS: ${runtime.wsStatus}`,
          `TOKEN: ${runtime.tokenPresent ? 'YES' : 'NO'}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Reconnect',
        value: [
          `QUEUED: ${runtime.reconnectQueued ? 'YES' : 'NO'}`,
          `ATTEMPTS: ${runtime.reconnectAttempts}`,
          `OUTAGE: ${runtime.ready ? '0s' : toDurationText(outageDuration)}`,
          `NEXT_CHECK_IN: ${nextCheckInSec}s`,
          `MANUAL_COOLDOWN: ${runtime.manualReconnectCooldownRemainingSec ?? 0}s`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Last Events',
        value: [
          `READY_AT: ${runtime.lastReadyAt || '-'}`,
          `LOGIN_ATTEMPT_AT: ${runtime.lastLoginAttemptAt || '-'}`,
          `LOGIN_ERROR_AT: ${runtime.lastLoginErrorAt || '-'}`,
          `LOGIN_ERROR: ${runtime.lastLoginError || '-'}`,
          `DISCONNECT_CODE: ${runtime.lastDisconnectCode ?? '-'}`,
          `DISCONNECT_REASON: ${runtime.lastDisconnectReason || '-'}`,
          `INVALIDATED_AT: ${runtime.lastInvalidatedAt || '-'}`,
          `ALERT_AT: ${runtime.lastAlertAt || '-'}`,
          `ALERT_REASON: ${runtime.lastAlertReason || '-'}`,
          `RECOVERY_AT: ${runtime.lastRecoveryAt || '-'}`,
          `MANUAL_RECONNECT_AT: ${runtime.lastManualReconnectAt || '-'}`,
        ].join('\n').slice(0, 1024),
        inline: false,
      },
      {
        name: 'Recommended Actions',
        value: operational.recommendations.join('\n').slice(0, 1024),
        inline: false,
      },
    )
    .setTimestamp(new Date());

  const components = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildBotStatusRefreshButtonCustomId(requesterUserId))
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Primary),
    ),
  ];

  return {
    content: operational.healthy ? '봇 상태 정상' : '봇 상태 점검 필요',
    embeds: [embed],
    components,
  };
};

const presetCommandSpecs = [
  new SlashCommandBuilder()
    .setName('bot-status')
    .setDescription('Discord 봇 현재 운영 상태를 조회합니다 (관리자 전용).'),
  new SlashCommandBuilder()
    .setName('bot-reconnect')
    .setDescription('Discord 봇 재연결을 즉시 트리거합니다 (관리자 전용).')
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('재연결 사유 메모')
        .setRequired(false)
        .setMaxLength(80),
    ),
  new SlashCommandBuilder()
    .setName('preset-history')
    .setDescription('Research preset 변경 이력을 조회합니다 (관리자 전용).')
    .addStringOption((option) =>
      option
        .setName('preset_key')
        .setDescription('조회할 프리셋 키')
        .setRequired(true)
        .addChoices(
          { name: 'embedded', value: 'embedded' },
          { name: 'studio', value: 'studio' },
        ),
    )
    .addIntegerOption((option) =>
      option
        .setName('limit')
        .setDescription('조회 건수 (1~20, 기본 10)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(20),
    ),
  new SlashCommandBuilder()
    .setName('preset-restore')
    .setDescription('Research preset 이력 스냅샷을 복원합니다 (관리자 전용).')
    .addStringOption((option) =>
      option
        .setName('preset_key')
        .setDescription('복원할 프리셋 키')
        .setRequired(true)
        .addChoices(
          { name: 'embedded', value: 'embedded' },
          { name: 'studio', value: 'studio' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('history_id')
        .setDescription('복원할 이력 항목 ID (UUID)')
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('preset-upsert')
    .setDescription('Research preset payload를 직접 업서트합니다 (관리자 전용).')
    .addStringOption((option) =>
      option
        .setName('preset_key')
        .setDescription('업서트할 프리셋 키')
        .setRequired(true)
        .addChoices(
          { name: 'embedded', value: 'embedded' },
          { name: 'studio', value: 'studio' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('payload_json')
        .setDescription('Resolved preset JSON payload')
        .setRequired(true)
        .setMaxLength(6000),
    ),
  new SlashCommandBuilder()
    .setName('preset-upsert-from-history')
    .setDescription('이력 payload를 읽어 대상 preset으로 업서트합니다 (관리자 전용).')
    .addStringOption((option) =>
      option
        .setName('source_preset_key')
        .setDescription('원본 이력이 속한 프리셋 키')
        .setRequired(true)
        .addChoices(
          { name: 'embedded', value: 'embedded' },
          { name: 'studio', value: 'studio' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('history_id')
        .setDescription('가져올 이력 항목 ID (UUID)')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('target_preset_key')
        .setDescription('업서트할 대상 프리셋 키')
        .setRequired(true)
        .addChoices(
          { name: 'embedded', value: 'embedded' },
          { name: 'studio', value: 'studio' },
        ),
    ),
];

const registerPresetCommands = async () => {
  if (!client.application) {
    return;
  }

  const payload = presetCommandSpecs.map((command) => command.toJSON());
  const guildId = (process.env.DISCORD_COMMAND_GUILD_ID || '').trim();

  if (guildId) {
    await client.application.commands.set(payload, guildId);
    console.log(`[RENDER_EVENT] BOT_COMMANDS_REGISTERED scope=guild guild=${guildId} count=${payload.length}`);
    return;
  }

  await client.application.commands.set(payload);
  console.log(`[RENDER_EVENT] BOT_COMMANDS_REGISTERED scope=global count=${payload.length}`);
};

const appendPresetAudit = async (params: {
  presetKey: string;
  actorUserId: string;
  actorUsername: string;
  source: AuditSource;
  payload: ResolvedResearchPreset;
  metadata?: Record<string, string | number | boolean | null>;
}) => {
  if (!isSupabaseConfigured) {
    return;
  }

  await supabase.from('research_preset_audit').insert([
    {
      preset_key: params.presetKey,
      actor_user_id: params.actorUserId,
      actor_username: params.actorUsername,
      source: params.source,
      payload: params.payload,
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
    },
  ]);
};

const appendPresetBenchmarkEvent = async (params: {
  userId: string;
  name: string;
  payload: Record<string, string | number | boolean | null>;
}) => {
  if (!isSupabaseConfigured) {
    return;
  }

  await supabase.from('benchmark_events').insert([
    {
      user_id: params.userId,
      event_id: randomBytes(8).toString('hex'),
      name: params.name,
      payload: params.payload,
      path: '/discord/slash',
      created_at: new Date().toISOString(),
    },
  ]);
};

const appendPresetBenchmarkEventSafe = async (params: {
  userId: string;
  name: string;
  payload: Record<string, string | number | boolean | null>;
}) => {
  try {
    await appendPresetBenchmarkEvent(params);
  } catch (error) {
    console.error('[Discord Bot] benchmark_events insert failed:', error);
  }
};

const ensurePresetAdminInteraction = async (interaction: ChatInputCommandInteraction) => {
  if (!isSupabaseConfigured) {
    await interaction.reply({
      content: 'Supabase가 설정되지 않아 이 명령을 실행할 수 없습니다.',
      ephemeral: true,
    });
    return false;
  }

  if (!presetAdminUserIds.size) {
    await interaction.reply({
      content: 'RESEARCH_PRESET_ADMIN_USER_IDS allowlist가 설정되지 않았습니다.',
      ephemeral: true,
    });
    return false;
  }

  if (!isPresetAdmin(interaction.user.id)) {
    await interaction.reply({
      content: '관리자 권한이 없어 이 명령을 실행할 수 없습니다.',
      ephemeral: true,
    });
    return false;
  }

  return true;
};

const formatHistoryRowsForDiscord = (rows: Array<{
  id: string;
  source: string;
  actor_username: string;
  created_at: string;
  metadata?: unknown;
}>, startIndex = 0) => {
  return rows
    .map((row, index) => {
      const restoredFrom =
        row.metadata && typeof row.metadata === 'object' && (row.metadata as Record<string, unknown>).restoredFromHistoryId
          ? ` · from ${(row.metadata as Record<string, unknown>).restoredFromHistoryId}`
          : '';
      const ts = row.created_at ? new Date(row.created_at).toLocaleString('ko-KR') : '-';
      return `${startIndex + index + 1}. [${row.source.toUpperCase()}] ${row.id} · ${row.actor_username} · ${ts}${restoredFrom}`;
    })
    .join('\n');
};

const buildPresetHistoryReply = (params: {
  presetKey: string;
  rows: Array<{
    id: string;
    source: string;
    actor_username: string;
    created_at: string;
    metadata?: unknown;
  }>;
  requesterUserId: string;
  pageIndex: number;
  limit: number;
}) => {
  const pageCount = Math.max(1, Math.ceil(params.rows.length / PRESET_HISTORY_PAGE_SIZE));
  const safePageIndex = Math.max(0, Math.min(pageCount - 1, params.pageIndex));
  const start = safePageIndex * PRESET_HISTORY_PAGE_SIZE;
  const pageRows = params.rows.slice(start, start + PRESET_HISTORY_PAGE_SIZE);

  const body = formatHistoryRowsForDiscord(pageRows, start).slice(0, 1800);
  const content = appendStudioPresetLink(
    `preset=${params.presetKey} recent history (page ${safePageIndex + 1}/${pageCount})\n${body}`,
    params.presetKey,
  );

  const restoreButtons = pageRows.map((row, index) =>
    new ButtonBuilder()
      .setCustomId(buildPresetRestoreButtonCustomId(params.presetKey, row.id, params.requesterUserId))
      .setLabel(`Restore ${start + index + 1}`)
      .setStyle(ButtonStyle.Secondary),
  );

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (restoreButtons.length) {
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(restoreButtons));
  }

  if (pageCount > 1) {
    components.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildPresetHistoryPageButtonCustomId(params.presetKey, params.requesterUserId, safePageIndex - 1, params.limit))
          .setLabel('Prev')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(safePageIndex <= 0),
        new ButtonBuilder()
          .setCustomId(buildPresetHistoryPageButtonCustomId(params.presetKey, params.requesterUserId, safePageIndex + 1, params.limit))
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(safePageIndex >= pageCount - 1),
      ),
    );
  }

  return {
    content,
    components,
  };
};

const handlePresetHistoryCommand = async (interaction: ChatInputCommandInteraction) => {
  const allowed = await ensurePresetAdminInteraction(interaction);
  if (!allowed) {
    return;
  }

  const presetKey = interaction.options.getString('preset_key', true).trim();
  const limit = interaction.options.getInteger('limit') ?? 10;

  if (!isResearchPresetKey(presetKey)) {
    await interaction.reply({ content: '알 수 없는 preset_key 입니다.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const { data, error } = await supabase
    .from('research_preset_audit')
    .select('id,source,actor_username,created_at,metadata')
    .eq('preset_key', presetKey)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(20, limit)));

  if (error) {
    await interaction.editReply(`이력 조회 실패: ${error.message}`);
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    await interaction.editReply(appendStudioPresetLink(`preset=${presetKey} 이력 데이터가 없습니다.`, presetKey));
    return;
  }

  const replyPayload = buildPresetHistoryReply({
    presetKey,
    rows,
    requesterUserId: interaction.user.id,
    pageIndex: 0,
    limit: Math.max(1, Math.min(20, limit)),
  });

  await interaction.editReply(replyPayload);
};

const handleBotStatusCommand = async (interaction: ChatInputCommandInteraction) => {
  const allowed = await ensurePresetAdminInteraction(interaction);
  if (!allowed) {
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const runtime = getBotRuntimeStatus();
  const operational = evaluateBotRuntimeStatus(runtime);

  await appendPresetBenchmarkEventSafe({
    userId: interaction.user.id,
    name: 'research_bot_status_discord',
    payload: {
      ready: runtime.ready,
      grade: operational.grade,
      wsStatus: runtime.wsStatus,
      reconnectAttempts: runtime.reconnectAttempts,
      result: 'success',
      source: 'slash',
      actor: interaction.user.username,
    },
  });

  await interaction.editReply(buildBotStatusReplyPayload(runtime, interaction.user.id));
};

const handleBotReconnectCommand = async (interaction: ChatInputCommandInteraction) => {
  const allowed = await ensurePresetAdminInteraction(interaction);
  if (!allowed) {
    return;
  }

  const reason = interaction.options.getString('reason')?.trim() || 'manual';
  await interaction.deferReply({ ephemeral: true });

  const result = await forceBotReconnect(`slash:${reason}`);
  const runtime = getBotRuntimeStatus();
  const operational = evaluateBotRuntimeStatus(runtime);
  const failureReason = result.ok ? 'OK' : getReconnectFailureReason(result.message);

  await appendPresetBenchmarkEventSafe({
    userId: interaction.user.id,
    name: 'research_bot_reconnect_discord',
    payload: {
      ok: result.ok,
      result: toReconnectResult(result.ok),
      reason: failureReason,
      source: 'slash',
      requestReason: reason,
      grade: operational.grade,
      reconnectAttempts: runtime.reconnectAttempts,
      actor: interaction.user.username,
    },
  });

  await interaction.editReply(`${result.message}\nCURRENT_GRADE=${operational.grade.toUpperCase()}`);
};

const handleBotStatusRefreshButton = async (interaction: ButtonInteraction) => {
  const parsed = parseBotStatusRefreshButtonCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  if (!isSupabaseConfigured || !presetAdminUserIds.size) {
    await appendPresetBenchmarkEventSafe({
      userId: interaction.user.id,
      name: 'research_bot_status_discord_button',
      payload: {
        result: 'rejected',
        reason: 'CONFIG',
        source: 'button',
        actor: interaction.user.username,
      },
    });
    await interaction.reply({
      content: '운영 설정이 준비되지 않아 상태 갱신을 실행할 수 없습니다.',
      ephemeral: true,
    });
    return;
  }

  if (parsed.requesterUserId !== interaction.user.id) {
    await appendPresetBenchmarkEventSafe({
      userId: interaction.user.id,
      name: 'research_bot_status_discord_button',
      payload: {
        result: 'rejected',
        reason: 'REQUESTER_MISMATCH',
        source: 'button',
        actor: interaction.user.username,
      },
    });
    await interaction.reply({
      content: '이 버튼은 명령 실행자만 사용할 수 있습니다.',
      ephemeral: true,
    });
    return;
  }

  if (isInteractionExpired(parsed.issuedAt)) {
    await appendPresetBenchmarkEventSafe({
      userId: interaction.user.id,
      name: 'research_bot_status_discord_button',
      payload: {
        result: 'rejected',
        reason: 'EXPIRED',
        source: 'button',
        actor: interaction.user.username,
      },
    });
    await notifyExpiredButtonInteraction(interaction, '버튼 유효 시간이 만료되었습니다. `/bot-status`를 다시 실행해 주세요.');
    return;
  }

  if (!isPresetAdmin(interaction.user.id)) {
    await appendPresetBenchmarkEventSafe({
      userId: interaction.user.id,
      name: 'research_bot_status_discord_button',
      payload: {
        result: 'rejected',
        reason: 'FORBIDDEN',
        source: 'button',
        actor: interaction.user.username,
      },
    });
    await interaction.reply({
      content: '관리자 권한이 없어 이 버튼을 실행할 수 없습니다.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();
  const runtime = getBotRuntimeStatus();
  const operational = evaluateBotRuntimeStatus(runtime);

  await appendPresetBenchmarkEventSafe({
    userId: interaction.user.id,
    name: 'research_bot_status_discord_button',
    payload: {
      ready: runtime.ready,
      grade: operational.grade,
      wsStatus: runtime.wsStatus,
      reconnectAttempts: runtime.reconnectAttempts,
      result: 'success',
      source: 'button',
      actor: interaction.user.username,
    },
  });

  await interaction.editReply(buildBotStatusReplyPayload(runtime, interaction.user.id));
};

const executePresetRestore = async (params: {
  presetKey: string;
  historyId: string;
  actorUserId: string;
  actorUsername: string;
  via: 'discord_slash' | 'discord_button';
}) => {
  const lockKey = `restore:${params.actorUserId}:${params.presetKey}:${params.historyId}`;
  const remainingSec = acquirePresetMutationLock(lockKey);
  if (remainingSec > 0) {
    return {
      ok: false,
      message: `중복 복원 요청이 감지되어 ${remainingSec}초 뒤 다시 시도해 주세요.`,
    };
  }

  try {
    const { data: historyRow, error: historyError } = await supabase
      .from('research_preset_audit')
      .select('id,preset_key,payload')
      .eq('preset_key', params.presetKey)
      .eq('id', params.historyId)
      .maybeSingle<{ id: string; preset_key: string; payload: unknown }>();

    if (historyError) {
      return {
        ok: false,
        message: `복원 대상 조회 실패: ${historyError.message}`,
      };
    }

    if (!historyRow || typeof historyRow.payload !== 'object' || historyRow.payload === null) {
      return {
        ok: false,
        message: '복원 대상 이력 payload를 찾을 수 없습니다.',
      };
    }

    const normalizedPayload = {
      ...(historyRow.payload as Record<string, unknown>),
      key: params.presetKey,
    };

    if (!isResolvedResearchPreset(normalizedPayload)) {
      return {
        ok: false,
        message: '복원 대상 payload 형태가 유효하지 않습니다.',
      };
    }

    const { error: upsertError } = await supabase
      .from('research_presets')
      .upsert(
        [
          {
            preset_key: params.presetKey,
            payload: normalizedPayload,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'preset_key' },
      );

    if (upsertError) {
      return {
        ok: false,
        message: `복원 업서트 실패: ${upsertError.message}`,
      };
    }

    await appendPresetAudit({
      presetKey: params.presetKey,
      actorUserId: params.actorUserId,
      actorUsername: params.actorUsername,
      source: 'restore',
      payload: normalizedPayload,
      metadata: {
        action: 'restore',
        restoredFromHistoryId: params.historyId,
        via: params.via,
      },
    });

    await appendPresetBenchmarkEvent({
      userId: params.actorUserId,
      name: params.via === 'discord_button' ? 'research_preset_restore_discord_button' : 'research_preset_restore_discord',
      payload: {
        presetKey: params.presetKey,
        historyId: params.historyId,
        actor: params.actorUsername,
      },
    });

    return {
      ok: true,
      message: appendStudioPresetLink(
        `복원 완료: preset=${params.presetKey}, history=${params.historyId}`,
        params.presetKey,
        params.historyId,
      ),
    };
  } finally {
    releasePresetMutationLock(lockKey);
  }
};

const handlePresetRestoreCommand = async (interaction: ChatInputCommandInteraction) => {
  const allowed = await ensurePresetAdminInteraction(interaction);
  if (!allowed) {
    return;
  }

  const presetKey = interaction.options.getString('preset_key', true).trim();
  const historyId = interaction.options.getString('history_id', true).trim();

  if (!isResearchPresetKey(presetKey)) {
    await interaction.reply({ content: '알 수 없는 preset_key 입니다.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const result = await executePresetRestore({
    presetKey,
    historyId,
    actorUserId: interaction.user.id,
    actorUsername: interaction.user.username,
    via: 'discord_slash',
  });

  await interaction.editReply(result.message);
};

const handlePresetRestoreButton = async (interaction: ButtonInteraction) => {
  const parsed = parsePresetRestoreButtonCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  if (!isSupabaseConfigured || !presetAdminUserIds.size) {
    await interaction.reply({
      content: '운영 설정이 준비되지 않아 버튼 복원을 실행할 수 없습니다.',
      ephemeral: true,
    });
    return;
  }

  if (parsed.requesterUserId !== interaction.user.id) {
    await interaction.reply({
      content: '이 버튼은 명령 실행자만 사용할 수 있습니다.',
      ephemeral: true,
    });
    return;
  }

  if (isInteractionExpired(parsed.issuedAt)) {
    await notifyExpiredButtonInteraction(interaction, '버튼 유효 시간이 만료되었습니다. `/preset-history`를 다시 실행해 주세요.');
    return;
  }

  if (!isPresetAdmin(interaction.user.id)) {
    await interaction.reply({
      content: '관리자 권한이 없어 이 버튼을 실행할 수 없습니다.',
      ephemeral: true,
    });
    return;
  }

  if (!isResearchPresetKey(parsed.presetKey)) {
    await interaction.reply({
      content: '알 수 없는 preset_key 입니다.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  const result = await executePresetRestore({
    presetKey: parsed.presetKey,
    historyId: parsed.historyId,
    actorUserId: interaction.user.id,
    actorUsername: interaction.user.username,
    via: 'discord_button',
  });

  await interaction.editReply({
    content: result.message,
    components: [],
  });
};

const handlePresetHistoryPageButton = async (interaction: ButtonInteraction) => {
  const parsed = parsePresetHistoryPageButtonCustomId(interaction.customId);
  if (!parsed) {
    return;
  }

  if (!isSupabaseConfigured || !presetAdminUserIds.size) {
    await interaction.reply({
      content: '운영 설정이 준비되지 않아 이력 페이지 이동을 실행할 수 없습니다.',
      ephemeral: true,
    });
    return;
  }

  if (parsed.requesterUserId !== interaction.user.id) {
    await interaction.reply({
      content: '이 버튼은 명령 실행자만 사용할 수 있습니다.',
      ephemeral: true,
    });
    return;
  }

  if (isInteractionExpired(parsed.issuedAt)) {
    await notifyExpiredButtonInteraction(interaction, '버튼 유효 시간이 만료되었습니다. `/preset-history`를 다시 실행해 주세요.');
    return;
  }

  if (!isPresetAdmin(interaction.user.id)) {
    await interaction.reply({
      content: '관리자 권한이 없어 이 버튼을 실행할 수 없습니다.',
      ephemeral: true,
    });
    return;
  }

  if (!isResearchPresetKey(parsed.presetKey)) {
    await interaction.reply({
      content: '알 수 없는 preset_key 입니다.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  const normalizedLimit = Math.max(1, Math.min(20, parsed.limit));
  const { data, error } = await supabase
    .from('research_preset_audit')
    .select('id,source,actor_username,created_at,metadata')
    .eq('preset_key', parsed.presetKey)
    .order('created_at', { ascending: false })
    .limit(normalizedLimit);

  if (error) {
    await interaction.editReply({
      content: `이력 조회 실패: ${error.message}`,
      components: [],
    });
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    await interaction.editReply({
      content: appendStudioPresetLink(`preset=${parsed.presetKey} 이력 데이터가 없습니다.`, parsed.presetKey),
      components: [],
    });
    return;
  }

  const replyPayload = buildPresetHistoryReply({
    presetKey: parsed.presetKey,
    rows,
    requesterUserId: interaction.user.id,
    pageIndex: parsed.pageIndex,
    limit: normalizedLimit,
  });

  await interaction.editReply(replyPayload);
};

const handlePresetUpsertCommand = async (interaction: ChatInputCommandInteraction) => {
  const allowed = await ensurePresetAdminInteraction(interaction);
  if (!allowed) {
    return;
  }

  const presetKey = interaction.options.getString('preset_key', true).trim();
  const payloadJson = interaction.options.getString('payload_json', true);

  if (!isResearchPresetKey(presetKey)) {
    await interaction.reply({ content: '알 수 없는 preset_key 입니다.', ephemeral: true });
    return;
  }

  const lockKey = `upsert:${interaction.user.id}:${presetKey}`;
  const remainingSec = acquirePresetMutationLock(lockKey);
  if (remainingSec > 0) {
    await interaction.reply({
      content: `중복 업서트 요청이 감지되어 ${remainingSec}초 뒤 다시 시도해 주세요.`,
      ephemeral: true,
    });
    return;
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(payloadJson);
    } catch {
      await interaction.editReply('payload_json 파싱에 실패했습니다. 유효한 JSON 문자열을 입력하세요.');
      return;
    }

    const normalizedPayload = {
      ...(parsedPayload as Record<string, unknown>),
      key: presetKey,
    };

    if (!isResolvedResearchPreset(normalizedPayload)) {
      await interaction.editReply('payload_json 형태가 유효하지 않습니다. Resolved preset 스키마를 확인하세요.');
      return;
    }

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
      await interaction.editReply(`업서트 실패: ${upsertError.message}`);
      return;
    }

    await appendPresetAudit({
      presetKey,
      actorUserId: interaction.user.id,
      actorUsername: interaction.user.username,
      source: 'upsert',
      payload: normalizedPayload,
      metadata: {
        action: 'upsert',
        via: 'discord_slash',
      },
    });

    await appendPresetBenchmarkEvent({
      userId: interaction.user.id,
      name: 'research_preset_upsert_discord',
      payload: {
        presetKey,
        actor: interaction.user.username,
      },
    });

    await interaction.editReply(appendStudioPresetLink(`업서트 완료: preset=${presetKey}`, presetKey));
  } finally {
    releasePresetMutationLock(lockKey);
  }
};

const handlePresetUpsertFromHistoryCommand = async (interaction: ChatInputCommandInteraction) => {
  const allowed = await ensurePresetAdminInteraction(interaction);
  if (!allowed) {
    return;
  }

  const sourcePresetKey = interaction.options.getString('source_preset_key', true).trim();
  const targetPresetKey = interaction.options.getString('target_preset_key', true).trim();
  const historyId = interaction.options.getString('history_id', true).trim();

  if (!isResearchPresetKey(sourcePresetKey) || !isResearchPresetKey(targetPresetKey)) {
    await interaction.reply({ content: '알 수 없는 preset_key 입니다.', ephemeral: true });
    return;
  }

  const lockKey = `upsert-history:${interaction.user.id}:${sourcePresetKey}:${historyId}:${targetPresetKey}`;
  const remainingSec = acquirePresetMutationLock(lockKey);
  if (remainingSec > 0) {
    await interaction.reply({
      content: `중복 이력 업서트 요청이 감지되어 ${remainingSec}초 뒤 다시 시도해 주세요.`,
      ephemeral: true,
    });
    return;
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    const { data: historyRow, error: historyError } = await supabase
      .from('research_preset_audit')
      .select('id,preset_key,payload')
      .eq('preset_key', sourcePresetKey)
      .eq('id', historyId)
      .maybeSingle<{ id: string; preset_key: string; payload: unknown }>();

    if (historyError) {
      await interaction.editReply(`원본 이력 조회 실패: ${historyError.message}`);
      return;
    }

    if (!historyRow || typeof historyRow.payload !== 'object' || historyRow.payload === null) {
      await interaction.editReply('원본 이력 payload를 찾을 수 없습니다.');
      return;
    }

    const normalizedPayload = {
      ...(historyRow.payload as Record<string, unknown>),
      key: targetPresetKey,
    };

    if (!isResolvedResearchPreset(normalizedPayload)) {
      await interaction.editReply('원본 이력 payload 형태가 유효하지 않습니다.');
      return;
    }

    const { error: upsertError } = await supabase
      .from('research_presets')
      .upsert(
        [
          {
            preset_key: targetPresetKey,
            payload: normalizedPayload,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'preset_key' },
      );

    if (upsertError) {
      await interaction.editReply(`업서트 실패: ${upsertError.message}`);
      return;
    }

    await appendPresetAudit({
      presetKey: targetPresetKey,
      actorUserId: interaction.user.id,
      actorUsername: interaction.user.username,
      source: 'upsert',
      payload: normalizedPayload,
      metadata: {
        action: 'upsert',
        via: 'discord_slash',
        sourcePresetKey,
        sourceHistoryId: historyId,
      },
    });

    await appendPresetBenchmarkEvent({
      userId: interaction.user.id,
      name: 'research_preset_upsert_from_history_discord',
      payload: {
        sourcePresetKey,
        targetPresetKey,
        historyId,
        actor: interaction.user.username,
      },
    });

    await interaction.editReply(
      appendStudioPresetLink(
        `이력 업서트 완료: ${sourcePresetKey}/${historyId} → ${targetPresetKey}`,
        targetPresetKey,
        historyId,
      ),
    );
  } finally {
    releasePresetMutationLock(lockKey);
  }
};

client.on('interactionCreate', async (interaction: Interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'bot-status') {
        await handleBotStatusCommand(interaction);
        return;
      }

      if (interaction.commandName === 'bot-reconnect') {
        await handleBotReconnectCommand(interaction);
        return;
      }

      if (interaction.commandName === 'preset-history') {
        await handlePresetHistoryCommand(interaction);
        return;
      }

      if (interaction.commandName === 'preset-restore') {
        await handlePresetRestoreCommand(interaction);
        return;
      }

      if (interaction.commandName === 'preset-upsert') {
        await handlePresetUpsertCommand(interaction);
        return;
      }

      if (interaction.commandName === 'preset-upsert-from-history') {
        await handlePresetUpsertFromHistoryCommand(interaction);
        return;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith(`${BOT_STATUS_REFRESH_BUTTON_PREFIX}|`)) {
        await handleBotStatusRefreshButton(interaction);
        return;
      }

      if (interaction.customId.startsWith(`${PRESET_RESTORE_BUTTON_PREFIX}|`)) {
        await handlePresetRestoreButton(interaction);
        return;
      }

      if (interaction.customId.startsWith(`${PRESET_HISTORY_PAGE_BUTTON_PREFIX}|`)) {
        await handlePresetHistoryPageButton(interaction);
        return;
      }

      return;
    }
  } catch (error) {
    console.error('[Discord Bot] Slash command handling failed:', error);
    if (!interaction.isRepliable()) {
      return;
    }

    const alreadyDeferred = 'deferred' in interaction && Boolean(interaction.deferred);
    const alreadyReplied = 'replied' in interaction && Boolean(interaction.replied);

    if (alreadyDeferred || alreadyReplied) {
      await interaction.editReply('명령 처리 중 오류가 발생했습니다.').catch(() => undefined);
      return;
    }

    await interaction.reply({
      content: '명령 처리 중 오류가 발생했습니다.',
      ephemeral: true,
    }).catch(() => undefined);
  }
});

client.on('clientReady', () => {
  const wasReady = botRuntimeStatus.ready;
  botRuntimeStatus.started = true;
  botRuntimeStatus.ready = true;
  botRuntimeStatus.lastReadyAt = new Date().toISOString();
  botRuntimeStatus.lastLoginError = null;
  updateBotRuntimeWsStatus();
  if (!wasReady) {
    void sendBotOperationalAlert('client_ready', client.user?.tag || 'unknown', 'success');
  }
  console.log(`[RENDER_EVENT] BOT_READY tag=${client.user?.tag || 'unknown'}`);
  console.log(`✅ [SUCCESS] Logged in as ${client.user?.tag}`);
  logEvent('Bot started successfully', 'info');

  void registerPresetCommands().catch((error) => {
    console.error('[Discord Bot] Failed to register slash commands:', error);
    logEvent(`Slash command register failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
  });
});

client.on('error', (error) => {
  botRuntimeStatus.ready = false;
  botRuntimeStatus.lastLoginErrorAt = new Date().toISOString();
  botRuntimeStatus.lastLoginError = error.message;
  updateBotRuntimeWsStatus();
  void sendBotOperationalAlert('client_error', error.message || 'unknown');
  console.error('[DISCORD_ERROR]', error);
  console.error('[Discord Bot] Error:', error);
  logEvent(`Bot error: ${error.message}`, 'error');
  scheduleBotReconnect('client_error');
});

client.on('warn', (message) => {
  console.warn(`[DISCORD WARN] ${message}`);
  console.log(`[RENDER_EVENT] BOT_WARN ${message}`);
});

client.on('debug', (info) => {
  console.log(`[DISCORD DEBUG] ${info}`);
});

client.rest.on('rateLimited', (info) => {
  console.log(`[RENDER_EVENT] BOT_REST_RATE_LIMIT route=${info.route} retryAfter=${info.retryAfter} limit=${info.limit}`);
});

client.on('shardError', (error, shardId) => {
  botRuntimeStatus.ready = false;
  botRuntimeStatus.lastLoginErrorAt = new Date().toISOString();
  botRuntimeStatus.lastLoginError = error instanceof Error ? error.message : String(error);
  updateBotRuntimeWsStatus();
  void sendBotOperationalAlert('shard_error', `shard=${shardId} message=${botRuntimeStatus.lastLoginError}`);
  const errCode = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? 'unknown') : 'unknown';
  console.log(`[RENDER_EVENT] BOT_SHARD_ERROR shard=${shardId} code=${errCode}`);
  console.error('[DISCORD_SHARD_ERROR]', error);
  scheduleBotReconnect('shard_error');
});

client.on('shardDisconnect', (event, shardId) => {
  botRuntimeStatus.ready = false;
  botRuntimeStatus.lastDisconnectAt = new Date().toISOString();
  botRuntimeStatus.lastDisconnectCode = event.code;
  botRuntimeStatus.lastDisconnectReason = event.reason || 'unknown';
  updateBotRuntimeWsStatus();
  void sendBotOperationalAlert('shard_disconnect', `shard=${shardId} code=${event.code} reason=${event.reason || 'unknown'}`);
  console.log(`[RENDER_EVENT] BOT_SHARD_DISCONNECT shard=${shardId} code=${event.code} reason=${event.reason || 'unknown'}`);
  if (event.code === 4014) {
    console.log('[RENDER_EVENT] BOT_INTENTS_DISALLOWED_HINT check Discord Portal privileged intents (Message Content / Presence Intent)');
  }
  scheduleBotReconnect(`shard_disconnect_${event.code}`);
});

client.on('shardReconnecting', (shardId) => {
  console.log(`[RENDER_EVENT] BOT_SHARD_RECONNECTING shard=${shardId}`);
});

client.on('shardResume', (shardId) => {
  botRuntimeStatus.ready = client.isReady();
  updateBotRuntimeWsStatus();
  console.log(`[RENDER_EVENT] BOT_SHARD_RESUME shard=${shardId}`);
});

client.on('invalidated', () => {
  botRuntimeStatus.ready = false;
  botRuntimeStatus.lastInvalidatedAt = new Date().toISOString();
  updateBotRuntimeWsStatus();
  void sendBotOperationalAlert('session_invalidated', 'discord session invalidated');
  console.log('[RENDER_EVENT] BOT_SESSION_INVALIDATED');
  scheduleBotReconnect('session_invalidated', Math.max(5000, reconnectDelayMs));
});

// Helper to log events to DB
export async function logEvent(message: string, type: 'info' | 'error' | 'success', user_id?: string) {
  try {
    await supabase.from('logs').insert([{ message, type, user_id }]);
  } catch (err) {
    console.error('Failed to write log to DB:', err);
  }
}

// Function to trigger a new forum post
export async function createForumThread(forumChannelId: string, title: string, content: string, imageBase64?: string, user_id?: string) {
  if (!client.isReady()) {
    throw new Error('Discord bot is not ready or not configured.');
  }

  try {
    const channel = await client.channels.fetch(forumChannelId);

    if (!channel) {
      throw new Error('Channel not found.');
    }

    if (channel.type !== ChannelType.GuildForum && channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      throw new Error('Target channel is not a Forum or Text Channel.');
    }

    const messageOptions: any = { content: content };
    
    // If an image was pasted, convert base64 to a buffer and attach it
    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      const attachment = new AttachmentBuilder(buffer, { name: 'uploaded_image.png' });
      messageOptions.files = [attachment];
    }

    let thread;
    if (channel.type === ChannelType.GuildForum) {
      const forumChannel = channel as ForumChannel;
      // Create a thread in the forum channel
      thread = await forumChannel.threads.create({
        name: title.substring(0, 100), // Discord thread names are limited to 100 chars
        message: messageOptions,
      });
    } else {
      const textChannel = channel as TextChannel;
      // Create a thread in the text channel
      thread = await textChannel.threads.create({
        name: title.substring(0, 100),
      });
      // Send the message to the newly created thread
      await thread.send(messageOptions);
    }

    logEvent(`Created new thread: ${title}`, 'success', user_id);
    return thread;
  } catch (error: any) {
    console.error('[Discord Bot] Error creating thread:', error);
    logEvent(`Failed to create thread: ${error.message}`, 'error', user_id);
    throw error;
  }
}

// Start the bot if token is available
export function startBot(token: string) {
  botRuntimeStatus.started = true;
  botRuntimeStatus.tokenPresent = Boolean(token);
  updateBotRuntimeWsStatus();
  if (!token) {
    botRuntimeStatus.ready = false;
    botRuntimeStatus.lastLoginErrorAt = new Date().toISOString();
    botRuntimeStatus.lastLoginError = 'missing_token';
    void sendBotOperationalAlert('missing_token', 'DISCORD_TOKEN or DISCORD_BOT_TOKEN is empty');
    console.log('[RENDER_EVENT] BOT_START_SKIPPED reason=missing_token');
    console.log('[Discord Bot] No token provided, bot will not start.');
    return;
  }

  const normalizedToken = token.trim().replace(/^['\"]|['\"]$/g, '');
  activeBotToken = normalizedToken;
  const tokenLooksJwtLike = normalizedToken.split('.').length === 3;
  if (normalizedToken.length !== token.length) {
    console.log('[RENDER_EVENT] BOT_TOKEN_NORMALIZED trimmed_or_unquoted=true');
  }
  console.log(`[RENDER_EVENT] BOT_TOKEN_FORMAT jwt_like=${tokenLooksJwtLike}`);

  const messageContentEnv = process.env.DISCORD_ENABLE_MESSAGE_CONTENT;
  const guildPresencesEnv = process.env.DISCORD_ENABLE_GUILD_PRESENCES;
  const nodeOptions = process.env.NODE_OPTIONS;
  console.log(`[RENDER_EVENT] BOT_INTENTS envMessageContent=${messageContentEnv ?? 'undefined'} envGuildPresences=${guildPresencesEnv ?? 'undefined'} effectiveMessageContent=true effectiveGuildPresences=true`);
  console.log(`[RENDER_EVENT] BOT_RUNTIME node=${process.version} platform=${process.platform} nodeOptions=${nodeOptions ?? 'undefined'}`);

  const logDnsResolution = (host: string) => {
    lookup(host, { all: true }, (err, addresses) => {
      if (err) {
        const errCode = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code ?? 'unknown') : 'unknown';
        console.log(`[RENDER_EVENT] DNS_LOOKUP_FAILED host=${host} code=${errCode}`);
        console.error(`[DNS] lookup failed host=${host}:`, err);
        return;
      }

      const joined = (addresses || []).map((item) => `${item.address}/v${item.family}`).join(',');
      console.log(`[RENDER_EVENT] DNS_LOOKUP_OK host=${host} addresses=${joined || 'none'}`);
    });
  };

  logDnsResolution('gateway.discord.gg');
  logDnsResolution('discord.com');

  const runHttpPreflight = async () => {
    console.log('[RENDER_EVENT] BOT_HTTP_PREFLIGHT_START');

    const runCheck = async (name: string, url: string, headers?: Record<string, string>) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        const body = await response.text();
        const bodyPreview = body.replace(/\s+/g, ' ').slice(0, 200);
        console.log(`[RENDER_EVENT] BOT_HTTP_PREFLIGHT_RESULT name=${name} status=${response.status} ok=${response.ok}`);

        if (!response.ok) {
          console.log(`[RENDER_EVENT] BOT_HTTP_PREFLIGHT_BODY name=${name} preview=${bodyPreview || 'empty'}`);
        }
      } catch (err: unknown) {
        const errName = err instanceof Error ? err.name : typeof err;
        const errMessage = err instanceof Error ? err.message : String(err);
        console.log(`[RENDER_EVENT] BOT_HTTP_PREFLIGHT_FAILED name=${name} error=${errName}`);
        console.error(`[Discord Bot] HTTP preflight failed for ${name}:`, errMessage);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    await runCheck('gateway', 'https://discord.com/api/v10/gateway');
    await runCheck('gateway_bot', 'https://discord.com/api/v10/gateway/bot', {
      Authorization: `Bot ${normalizedToken}`,
    });

    console.log('[RENDER_EVENT] BOT_HTTP_PREFLIGHT_DONE');
  };

  let hasRetried = false;
  let attempt = 0;

  const runLoginAttempt = () => {
    attempt += 1;
    botRuntimeStatus.lastLoginAttemptAt = new Date().toISOString();
    botRuntimeStatus.ready = false;
    updateBotRuntimeWsStatus();
    const startedAt = Date.now();
    console.log(`[RENDER_EVENT] BOT_LOGIN_ATTEMPT n=${attempt}`);

    const progressInterval = setInterval(() => {
      if (client.isReady()) {
        clearInterval(progressInterval);
        return;
      }
      console.log(`[RENDER_EVENT] BOT_LOGIN_PROGRESS wsStatus=${client.ws.status} elapsedMs=${Date.now() - startedAt}`);
    }, 10000);

    const timeout = setTimeout(() => {
      if (client.isReady()) {
        clearInterval(progressInterval);
        return;
      }

      clearInterval(progressInterval);
      console.log(`[RENDER_EVENT] BOT_LOGIN_TIMEOUT ms=${loginTimeoutMs} attempt=${attempt}`);
      console.error('[Discord Bot] Login timed out before ready event.');
      botRuntimeStatus.lastLoginErrorAt = new Date().toISOString();
      botRuntimeStatus.lastLoginError = `login_timeout_attempt_${attempt}`;
      void sendBotOperationalAlert('login_timeout', `attempt=${attempt} timeoutMs=${loginTimeoutMs}`);

      if (!hasRetried) {
        hasRetried = true;
        console.log('[RENDER_EVENT] BOT_LOGIN_RETRY reason=timeout delayMs=5000');
        try {
          client.destroy();
        } catch (destroyErr) {
          console.error('[Discord Bot] Failed to destroy client before retry:', destroyErr);
        }
        setTimeout(runLoginAttempt, 5000);
      }
    }, loginTimeoutMs);

    client
      .login(normalizedToken)
      .then(() => {
        clearTimeout(timeout);
        clearInterval(progressInterval);
        botRuntimeStatus.ready = client.isReady();
        botRuntimeStatus.lastLoginError = null;
        updateBotRuntimeWsStatus();
        console.log(`[RENDER_EVENT] BOT_LOGIN_PROMISE_RESOLVED attempt=${attempt}`);
      })
      .catch((err) => {
        clearTimeout(timeout);
        clearInterval(progressInterval);

        const errCode = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code ?? 'unknown') : 'unknown';
        const errMessage = err instanceof Error ? err.message : String(err);
        botRuntimeStatus.lastLoginErrorAt = new Date().toISOString();
        botRuntimeStatus.lastLoginError = `[${errCode}] ${errMessage}`;
        botRuntimeStatus.ready = false;
        updateBotRuntimeWsStatus();
        void sendBotOperationalAlert('login_failed', `attempt=${attempt} code=${errCode} message=${errMessage}`);
        console.log(`[RENDER_EVENT] BOT_LOGIN_FAILED code=${errCode} attempt=${attempt}`);
        console.error('[Discord Bot] Failed to login:', err);
        logEvent(`Login failed: [${errCode}] ${errMessage}`, 'error');

        if (!hasRetried) {
          hasRetried = true;
          console.log('[RENDER_EVENT] BOT_LOGIN_RETRY reason=login_failed delayMs=5000');
          setTimeout(runLoginAttempt, 5000);
        }
      });

    client.once('clientReady', () => {
      clearTimeout(timeout);
      clearInterval(progressInterval);
    });
  };

  runHttpPreflight()
    .catch((err) => {
      console.error('[Discord Bot] Unexpected preflight error:', err);
      botRuntimeStatus.lastLoginErrorAt = new Date().toISOString();
      botRuntimeStatus.lastLoginError = err instanceof Error ? err.message : String(err);
      updateBotRuntimeWsStatus();
    })
    .finally(() => {
      runLoginAttempt();
    });
}
