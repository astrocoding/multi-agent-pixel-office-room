import type { TelegramUpdatePayload } from '../infrastructure/webhookValidator.js';
import { TelegramDb } from '../../../infrastructure/database/telegramDb.js';
import { IdentityService } from '../../identity/application/identityService.js';
import { CommandDispatcher } from '../../commands/application/commandDispatcher.js';
import { Logger } from '../../../infrastructure/logging/logger.js';
import type { TelegramClient } from '../../../integrations/telegram/telegramClient.js';

export class WebhookService {
  private commandDispatcher: CommandDispatcher;
  private telegramClient?: TelegramClient;
  private botIdentity = 'bot_office';

  constructor(commandDispatcher: CommandDispatcher, telegramClient?: TelegramClient) {
    this.commandDispatcher = commandDispatcher;
    this.telegramClient = telegramClient;
  }

  public async handleUpdate(update: TelegramUpdatePayload): Promise<{ acknowledged: boolean; isDuplicate: boolean }> {
    const updateId = update.update_id;
    const dedupKey = `${this.botIdentity}_${updateId}`;

    // 1. Idempotency check: if update was already processed or received, return success without re-executing
    const alreadyProcessed = await TelegramDb.isUpdateProcessed(dedupKey);
    if (alreadyProcessed) {
      Logger.info(`Duplicate Telegram update ignored: ${updateId}`, { updateId });
      return { acknowledged: true, isDuplicate: true };
    }

    // 2. Extract message or callback query
    const message = update.message;
    const callback = update.callback_query;

    if (!message && !callback) {
      return { acknowledged: true, isDuplicate: false };
    }

    const userId = message?.from?.id || callback?.from.id;
    const chatId = message?.chat.id || callback?.message?.chat.id;
    const chatType = message?.chat.type || callback?.message?.chat.type || 'private';
    const text = message?.text || callback?.data || '';
    const messageId = message?.message_id || callback?.message?.message_id || 0;

    if (!userId || !chatId) {
      return { acknowledged: true, isDuplicate: false };
    }

    // 3. Mark update received atomically in DB
    await TelegramDb.markUpdateReceived(dedupKey, updateId, chatId, userId, text.slice(0, 30));

    // 4. Resolve identity & authorization
    const actor = IdentityService.resolveActor(
      userId,
      chatId,
      chatType,
      message?.from?.username || callback?.from.username
    );

    // If it is a callback query, acknowledge it to clear button loading state
    if (callback && this.telegramClient) {
      this.telegramClient.answerCallbackQuery(
        callback.id,
        actor.isAuthorized ? undefined : "Forbidden! You don't have any access to this Agent Office Room."
      ).catch(() => {});
    }

    // 5. Asynchronously process in background (do not block HTTP webhook response!)
    setTimeout(async () => {
      try {
        const responseSummary = await this.commandDispatcher.dispatch(text, actor, messageId, updateId);
        await TelegramDb.updateProcessedStatus(dedupKey, 'completed', responseSummary.slice(0, 100));
      } catch (err) {
        Logger.error(`Error processing update ${updateId}`, err, { updateId, userId, chatId });
        await TelegramDb.updateProcessedStatus(dedupKey, 'failed', String(err));
      }
    }, 10);

    return { acknowledged: true, isDuplicate: false };
  }
}

