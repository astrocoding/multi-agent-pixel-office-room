import { TelegramClient } from '../../../integrations/telegram/telegramClient.js';
import { Logger } from '../../../infrastructure/logging/logger.js';

export class DeliveryService {
  private telegramClient: TelegramClient;

  constructor(telegramClient: TelegramClient) {
    this.telegramClient = telegramClient;
  }

  public async sendResponse(
    chatId: number,
    text: string,
    options?: { replyMarkup?: Record<string, unknown>; parseMode?: 'HTML' | 'Markdown' }
  ): Promise<void> {
    try {
      await this.telegramClient.sendMessage(chatId, text, options);
    } catch (err) {
      Logger.error(`Failed to send Telegram message to chat ${chatId}`, err, { chatId });
    }
  }

  public async sendNotification(
    chatId: number,
    text: string,
    options?: { replyMarkup?: Record<string, unknown>; parseMode?: 'HTML' | 'Markdown' }
  ): Promise<void> {
    try {
      await this.telegramClient.sendMessage(chatId, text, options);
    } catch (err) {
      Logger.error(`Failed to send notification to chat ${chatId}`, err, { chatId });
    }
  }
}

