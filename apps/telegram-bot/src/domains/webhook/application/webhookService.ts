import type { TelegramUpdatePayload } from '../infrastructure/webhookValidator.js';
import { TelegramDb } from '../../../infrastructure/database/telegramDb.js';
import { IdentityService } from '../../identity/application/identityService.js';
import { CommandDispatcher } from '../../commands/application/commandDispatcher.js';
import { Logger } from '../../../infrastructure/logging/logger.js';
import type { TelegramClient } from '../../../integrations/telegram/telegramClient.js';
import type { TaskAttachment } from '@agent-office/shared';

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
    const messageId = message?.message_id || callback?.message?.message_id || 0;

    if (!userId || !chatId) {
      return { acknowledged: true, isDuplicate: false };
    }

    // 3. Resolve and download multimodal attachments (photos, documents, PDFs, code, text)
    const attachments: TaskAttachment[] = [];

    if (message?.photo && message.photo.length > 0 && this.telegramClient) {
      try {
        const largestPhoto = message.photo[message.photo.length - 1];
        const fileInfo = await this.telegramClient.getFile(largestPhoto.file_id);
        if (fileInfo.file_path) {
          const fileBuf = await this.telegramClient.downloadFile(fileInfo.file_path);
          attachments.push({
            id: `att_${largestPhoto.file_unique_id || Date.now()}`,
            name: `photo_${largestPhoto.file_unique_id || Date.now()}.jpg`,
            type: 'image',
            mimeType: 'image/jpeg',
            size: fileBuf.length,
            base64Data: fileBuf.toString('base64'),
          });
        }
      } catch (err) {
        Logger.warn('Failed to download photo from Telegram update', { error: String(err) });
      }
    }

    if (message?.document && this.telegramClient) {
      try {
        const doc = message.document;
        const fileInfo = await this.telegramClient.getFile(doc.file_id);
        if (fileInfo.file_path) {
          const fileBuf = await this.telegramClient.downloadFile(fileInfo.file_path);
          const rawMime = doc.mime_type || 'application/octet-stream';
          const ext = (doc.file_name?.includes('.') ? '.' + doc.file_name.split('.').pop() : '').toLowerCase();

          const isImg = rawMime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
          const isPdf = rawMime === 'application/pdf' || ext === '.pdf';
          const isText = ['.md', '.txt', '.json', '.ts', '.js', '.py', '.php', '.sql', '.yaml', '.yml'].includes(ext);

          attachments.push({
            id: `att_${doc.file_unique_id || Date.now()}`,
            name: doc.file_name || `document_${Date.now()}`,
            type: isImg ? 'image' : isText ? 'code' : 'document',
            mimeType: isImg ? (ext === '.png' ? 'image/png' : 'image/jpeg') : isPdf ? 'application/pdf' : rawMime,
            size: fileBuf.length,
            base64Data: (isImg || isPdf) ? fileBuf.toString('base64') : undefined,
            content: (!isImg && !isPdf) ? fileBuf.toString('utf-8') : undefined,
          });
        }
      } catch (err) {
        Logger.warn('Failed to download document from Telegram update', { error: String(err) });
      }
    }

    const text =
      message?.caption ||
      message?.text ||
      callback?.data ||
      (attachments.length > 0 ? 'Tolong periksa dan analisis isi dari file/gambar yang saya lampirkan ini.' : '');

    // 4. Mark update received atomically in DB
    await TelegramDb.markUpdateReceived(dedupKey, updateId, chatId, userId, text.slice(0, 30));

    // 5. Resolve identity & authorization
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

    // 6. Asynchronously process in background (do not block HTTP webhook response!)
    setTimeout(async () => {
      try {
        const responseSummary = await this.commandDispatcher.dispatch(text, actor, messageId, updateId, attachments);
        await TelegramDb.updateProcessedStatus(dedupKey, 'completed', responseSummary.slice(0, 100));
      } catch (err) {
        Logger.error(`Error processing update ${updateId}`, err, { updateId, userId, chatId });
        await TelegramDb.updateProcessedStatus(dedupKey, 'failed', String(err));
      }
    }, 10);

    return { acknowledged: true, isDuplicate: false };
  }
}

