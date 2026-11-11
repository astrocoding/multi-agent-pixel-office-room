import { createTelegramBotApp } from './app.js';
import { env } from './config/env.js';
import { CommandRegistry } from './domains/commands/domain/commandRegistry.js';
import { TelegramDb } from './infrastructure/database/telegramDb.js';
import { Logger } from './infrastructure/logging/logger.js';

async function bootstrap() {
  Logger.info('Starting Agent Office Room Telegram Bot Service...');

  const { server, telegramClient, pollingWorker } = createTelegramBotApp();

  // 1. Verify Bot Token & Register commands with Telegram if valid
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_TOKEN !== 'dummy_test_token') {
    try {
      const me = await telegramClient.getMe();
      Logger.info(`Connected to Telegram Bot API as @${me.username} (${me.first_name})`);

      // Register the 18 commands with Telegram BotFather
      const commands = CommandRegistry.getCommandDescriptions();
      await telegramClient.setMyCommands(commands);
      Logger.info(`Successfully registered ${commands.length} bot commands with Telegram`);

      // Determine operating mode: Webhook vs Long-Polling
      const isExplicitWebhook = env.TELEGRAM_MODE === 'webhook' || (env.TELEGRAM_MODE === 'auto' && Boolean(env.TELEGRAM_WEBHOOK_PUBLIC_URL));

      if (isExplicitWebhook && env.TELEGRAM_WEBHOOK_PUBLIC_URL) {
        Logger.info(`Configuring Telegram Webhook at: ${env.TELEGRAM_WEBHOOK_PUBLIC_URL}`);
        await telegramClient.setWebhook(env.TELEGRAM_WEBHOOK_PUBLIC_URL, env.TELEGRAM_WEBHOOK_SECRET);
        Logger.info('Telegram Webhook registered successfully');
      } else {
        Logger.info('Operating mode: Long-Polling (local runner & auto-fallback)');
        await pollingWorker.start();
      }
    } catch (err) {
      Logger.warn('Could not verify Telegram Bot token or register commands at startup', {
        error: String(err),
      });
    }
  }

  // 2. Start Webhook Gateway HTTP Server (runs for incoming webhooks or internal service notifications)
  const port = env.TELEGRAM_BOT_PORT;
  await server.listen({ port, host: '0.0.0.0' });

  Logger.info(`Telegram Gateway Server listening at http://0.0.0.0:${port}`);
  Logger.info(`Webhook Endpoint: POST http://0.0.0.0:${port}/webhooks/telegram`);

  // 3. Graceful shutdown handler
  const shutdown = async (signal: string) => {
    Logger.info(`Received ${signal}. Shutting down gracefully...`);
    try {
      pollingWorker.stop();
      await server.close();
      await TelegramDb.close();
      Logger.info('Telegram Bot service stopped cleanly.');
      process.exit(0);
    } catch (err) {
      Logger.error('Error during shutdown', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  Logger.error('Fatal Telegram Bot startup error', err);
  process.exit(1);
});

