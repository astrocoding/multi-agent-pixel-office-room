import { TelegramDb } from '../../../infrastructure/database/telegramDb.js';

export interface UserSession {
  activeCommand: string;
  sessionState: string;
  data: Record<string, unknown>;
}

export class SessionManager {
  public static async getSession(chatId: number, userId: number): Promise<UserSession | null> {
    return TelegramDb.getSession(chatId, userId);
  }

  public static async setSession(
    chatId: number,
    userId: number,
    activeCommand: string,
    sessionState: string,
    data: Record<string, unknown> = {},
    ttlSeconds = 600
  ): Promise<void> {
    await TelegramDb.saveSession(chatId, userId, activeCommand, sessionState, data, ttlSeconds);
  }

  public static async clearSession(chatId: number, userId: number): Promise<void> {
    await TelegramDb.clearSession(chatId, userId);
  }
}

