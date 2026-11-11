import { TelegramClient } from '../integrations/telegram/telegramClient.js';
import { env } from '../config/env.js';
import { CommandRegistry } from '../domains/commands/domain/commandRegistry.js';

async function main() {
  const action = process.argv[2] || 'info';
  const client = new TelegramClient(env.TELEGRAM_BOT_TOKEN);

  if (action === 'info') {
    console.log('--- Telegram Webhook & Bot Diagnostics ---');
    try {
      const me = await client.getMe();
      console.log(`Bot ID: ${me.id}`);
      console.log(`Username: @${me.username}`);
      console.log(`Name: ${me.first_name}`);

      const info = await client.getWebhookInfo();
      console.log(`Webhook URL: ${info.url || '(none)'}`);
      console.log(`Pending Updates: ${info.pending_update_count}`);
      if (info.last_error_message) {
        console.log(`Last Error: ${info.last_error_message} (${info.last_error_date})`);
      }
    } catch (e) {
      console.error('Error fetching webhook info:', (e as Error).message);
    }
  } else if (action === 'set') {
    const url = process.argv[3] || env.TELEGRAM_WEBHOOK_PUBLIC_URL;
    if (!url) {
      console.error('Usage: tsx src/cli/webhookCli.ts set <public_webhook_https_url>');
      console.error('Or set TELEGRAM_WEBHOOK_PUBLIC_URL in .env');
      process.exit(1);
    }

    console.log(`Setting Telegram webhook to: ${url}`);
    try {
      const res = await client.setWebhook(url, env.TELEGRAM_WEBHOOK_SECRET);
      console.log(`Webhook set result: ${res ? 'SUCCESS' : 'FAILED'}`);

      const cmds = CommandRegistry.getCommandDescriptions();
      await client.setMyCommands(cmds);
      console.log(`Registered ${cmds.length} commands successfully.`);
    } catch (e) {
      console.error('Failed to set webhook:', (e as Error).message);
      process.exit(1);
    }
  } else {
    console.log('Usage: tsx src/cli/webhookCli.ts [info|set]');
  }
}

main().catch(console.error);

