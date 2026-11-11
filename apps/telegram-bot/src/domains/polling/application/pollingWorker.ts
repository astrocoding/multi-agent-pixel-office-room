import type { TelegramClient } from '../../../integrations/telegram/telegramClient.js';
import type { WebhookService } from '../../webhook/application/webhookService.js';
import { Logger } from '../../../infrastructure/logging/logger.js';

export class PollingWorker {
  private telegramClient: TelegramClient;
  private webhookService: WebhookService;
  private isRunning = false;
  private abortController: AbortController | null = null;
  private currentOffset = 0;

  constructor(telegramClient: TelegramClient, webhookService: WebhookService) {
    this.telegramClient = telegramClient;
    this.webhookService = webhookService;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.abortController = new AbortController();

    Logger.info('Initializing Telegram Long-Polling Worker...');

    // 1. Delete active webhook to ensure Telegram routes updates to getUpdates
    try {
      await this.telegramClient.deleteWebhook(false);
      Logger.info('Cleared Telegram webhook registration for Long-Polling mode');
    } catch (err) {
      Logger.warn('Could not clear webhook before starting polling', { error: String(err) });
    }

    // 2. Start polling loop asynchronously in background
    this.pollLoop().catch((err) => {
      Logger.error('Fatal unhandled error in Telegram polling loop', err);
    });
  }

  private async pollLoop(): Promise<void> {
    Logger.info('Telegram Long-Polling Worker started actively listening for updates...');

    while (this.isRunning) {
      try {
        const updates = await this.telegramClient.getUpdates(
          this.currentOffset > 0 ? this.currentOffset : undefined,
          50,
          25,
          this.abortController?.signal
        );

        if (updates && Array.isArray(updates) && updates.length > 0) {
          for (const update of updates) {
            if (update.update_id) {
              this.currentOffset = Math.max(this.currentOffset, update.update_id + 1);
            }
            const sender = update.message?.from?.username || update.message?.from?.id || 'unknown';
            const text = update.message?.text || update.callback_query?.data || '(event)';
            Logger.info(`[Telegram Inbound] Received from ${sender}: "${text}" (update_id: ${update.update_id})`);
            // Pass update into the same unified pipeline as Webhook
            await this.webhookService.handleUpdate(update);
          }
        }
      } catch (err: unknown) {
        if (!this.isRunning || (err as { name?: string })?.name === 'AbortError') {
          break;
        }
        Logger.warn('Error during Telegram long-polling cycle, retrying in 3s...', {
          error: String(err),
        });
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    Logger.info('Telegram Long-Polling Worker stopped');
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    Logger.info('Telegram Long-Polling Worker stop requested');
  }
}

