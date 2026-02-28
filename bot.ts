import { startBot } from './src/bot';

const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('DISCORD token not provided. Set DISCORD_TOKEN or DISCORD_BOT_TOKEN.');
  process.exit(1);
}

startBot(token).catch(err => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
