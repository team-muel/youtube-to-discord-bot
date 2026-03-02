import { client, startBot } from './src/bot';
import { setDefaultResultOrder } from 'dns';

setDefaultResultOrder('ipv4first');

process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[PROCESS] Uncaught exception:', error);
});

const handleShutdownSignal = (signal: NodeJS.Signals) => {
  console.log(`[PROCESS] Received ${signal}, shutting down Discord client...`);
  try {
    if (client.isReady()) {
      client.destroy();
    }
  } catch (error) {
    console.error('[PROCESS] Failed during Discord client shutdown:', error);
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));

const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;

// 봇이 안 켜질 때 범인을 찾는 디버그 로그
console.log('DEBUG: Token exists?', !!token, '| Key length:', token?.length || 0);

if (!token) {
  console.error('DISCORD token not provided. Set DISCORD_TOKEN or DISCORD_BOT_TOKEN.');
  process.exit(1);
}

// 1. startBot이 Promise를 반환하지 않는 경우를 대비한 안전한 호출 방식
try {
  // 만약 startBot이 내부적으로 async라면, 아래처럼 호출하는 것이 가장 깔끔합니다.
  startBot(token); 
  console.log('Muel bot is initiating...'); 
} catch (err) {
  console.error('Failed to start bot:', err);
  process.exit(1);
}