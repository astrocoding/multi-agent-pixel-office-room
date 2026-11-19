import { env } from '../../config/env.js';
import { Logger } from '../../infrastructure/logging/logger.js';
import { splitMessage } from '../../shared/utils/textSplitter.js';
import { assertNoEmoji, stripEmoji } from '../../shared/utils/noEmoji.js';

export interface TelegramSendMessageOptions {
  replyMarkup?: Record<string, unknown>;
  parseMode?: 'Markdown' | 'HTML';
}

export class TelegramClient {
  private botToken: string;
  private apiBase: string;

  constructor(token = env.TELEGRAM_BOT_TOKEN) {
    this.botToken = token;
    this.apiBase = `https://api.telegram.org/bot${token}`;
  }

  private async request<T = unknown>(
    method: string,
    payload: Record<string, unknown> = {},
    signal?: AbortSignal
  ): Promise<T> {
    const url = `${this.apiBase}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    const data = (await res.json()) as { ok: boolean; result?: T; description?: string; parameters?: { retry_after?: number } };
    if (!data.ok) {
      if (data.parameters?.retry_after) {
        Logger.warn(`Telegram rate limit: retry after ${data.parameters.retry_after}s`);
      }
      throw new Error(`Telegram API Error (${method}): ${data.description || 'Unknown error'}`);
    }

    return data.result as T;
  }

  public async sendMessage(
    chatId: number,
    text: string,
    options: TelegramSendMessageOptions = {}
  ): Promise<unknown> {
    // Assert and enforce strictly NO EMOJI in application-generated messages
    const cleanText = stripEmoji(text);
    assertNoEmoji(cleanText, 'TelegramClient.sendMessage');

    const chunks = splitMessage(cleanText, 3500);
    let lastResult: unknown = null;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const payload: Record<string, unknown> = {
        chat_id: chatId,
        text: chunk,
      };

      // Only attach replyMarkup on the final chunk
      if (i === chunks.length - 1 && options.replyMarkup) {
        payload.reply_markup = options.replyMarkup;
      }
      if (options.parseMode) {
        payload.parse_mode = options.parseMode;
      }

      try {
        lastResult = await this.request('sendMessage', payload);
      } catch (err) {
        if (options.parseMode) {
          delete payload.parse_mode;
          lastResult = await this.request('sendMessage', payload);
        } else {
          throw err;
        }
      }
    }

    return lastResult;
  }

  public async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
    const cleanText = text ? stripEmoji(text) : undefined;
    if (cleanText) {
      assertNoEmoji(cleanText, 'answerCallbackQuery');
    }
    return this.request('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: cleanText,
    });
  }

  public async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options: TelegramSendMessageOptions = {}
  ): Promise<unknown> {
    const cleanText = stripEmoji(text);
    assertNoEmoji(cleanText, 'editMessageText');

    const payload: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text: cleanText,
    };
    if (options.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }
    return this.request('editMessageText', payload);
  }

  public async getMe(): Promise<{ id: number; is_bot: boolean; first_name: string; username: string }> {
    return this.request('getMe');
  }

  public async getWebhookInfo(): Promise<{
    url: string;
    has_custom_certificate: boolean;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  }> {
    return this.request('getWebhookInfo');
  }

  public async setWebhook(
    url: string,
    secretToken: string,
    allowedUpdates: string[] = ['message', 'callback_query']
  ): Promise<boolean> {
    return this.request('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: allowedUpdates,
    });
  }

  public async deleteWebhook(dropPendingUpdates = false): Promise<boolean> {
    return this.request('deleteWebhook', { drop_pending_updates: dropPendingUpdates });
  }

  public async getUpdates(
    offset?: number,
    limit = 100,
    timeout = 25,
    signal?: AbortSignal
  ): Promise<any[]> {
    const payload: Record<string, unknown> = {
      limit,
      timeout,
      allowed_updates: ['message', 'callback_query'],
    };
    if (offset !== undefined) {
      payload.offset = offset;
    }
    return this.request<any[]>('getUpdates', payload, signal);
  }

  public async setMyCommands(
    commands: Array<{ command: string; description: string }>
  ): Promise<boolean> {
    // Assert no emojis in command descriptions
    for (const cmd of commands) {
      assertNoEmoji(cmd.description, `command description for /${cmd.command}`);
    }
    return this.request('setMyCommands', { commands });
  }

  public async getFile(fileId: string): Promise<{
    file_id: string;
    file_unique_id?: string;
    file_size?: number;
    file_path?: string;
  }> {
    return this.request('getFile', { file_id: fileId });
  }

  public async downloadFile(filePath: string): Promise<Buffer> {
    const url = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download file from Telegram (${res.status}): ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  public async sendChatAction(
    chatId: number,
    action: 'typing' | 'upload_photo' | 'upload_document' = 'typing'
  ): Promise<boolean> {
    try {
      await this.request('sendChatAction', { chat_id: chatId, action });
      return true;
    } catch {
      return false;
    }
  }
}

