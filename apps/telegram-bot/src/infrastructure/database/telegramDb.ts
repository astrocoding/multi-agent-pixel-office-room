import pg from 'pg';
import { env } from '../../config/env.js';
import { Logger } from '../logging/logger.js';

const { Pool } = pg;

export class TelegramDb {
  private static pool: pg.Pool | null = null;
  private static memoryProcessedUpdates = new Set<string>();
  private static memorySessions = new Map<string, { activeCommand: string; sessionState: string; data: Record<string, unknown>; expiresAt: number }>();
  private static memoryPreferences = new Map<number, { enabled: boolean; notifyTaskCompleted: boolean; notifyTaskFailed: boolean; notifyApprovalRequired: boolean }>();

  public static getPool(): pg.Pool | null {
    if (!this.pool && env.DATABASE_URL) {
      try {
        this.pool = new Pool({
          connectionString: env.DATABASE_URL,
          max: 10,
          idleTimeoutMillis: 30000,
        });
      } catch (e) {
        Logger.warn('PostgreSQL pool initialization failed, using in-memory store', { error: String(e) });
      }
    }
    return this.pool;
  }

  public static async isUpdateProcessed(dedupKey: string): Promise<boolean> {
    if (this.memoryProcessedUpdates.has(dedupKey)) return true;
    const pool = this.getPool();
    if (!pool) return false;

    try {
      const res = await pool.query('SELECT 1 FROM telegram_processed_updates WHERE id = $1;', [dedupKey]);
      if (res.rows.length > 0) {
        this.memoryProcessedUpdates.add(dedupKey);
        return true;
      }
      return false;
    } catch (e) {
      return this.memoryProcessedUpdates.has(dedupKey);
    }
  }

  public static async markUpdateReceived(
    dedupKey: string,
    updateId: number,
    chatId?: number,
    userId?: number,
    command?: string
  ): Promise<boolean> {
    this.memoryProcessedUpdates.add(dedupKey);
    const pool = this.getPool();
    if (!pool) return true;

    try {
      await pool.query(
        `
        INSERT INTO telegram_processed_updates (id, update_id, chat_id, user_id, command, status)
        VALUES ($1, $2, $3, $4, $5, 'received')
        ON CONFLICT (id) DO NOTHING;
      `,
        [dedupKey, updateId, chatId || null, userId || null, command || null]
      );
      return true;
    } catch {
      return true;
    }
  }

  public static async updateProcessedStatus(
    dedupKey: string,
    status: 'completed' | 'failed',
    summary?: string
  ): Promise<void> {
    const pool = this.getPool();
    if (!pool) return;
    try {
      await pool.query(
        `UPDATE telegram_processed_updates SET status = $2, response_summary = $3, updated_at = NOW() WHERE id = $1;`,
        [dedupKey, status, summary || null]
      );
    } catch {}
  }

  public static async getSession(chatId: number, userId: number): Promise<{
    activeCommand: string;
    sessionState: string;
    data: Record<string, unknown>;
  } | null> {
    const key = `${chatId}:${userId}`;
    const mem = this.memorySessions.get(key);
    if (mem) {
      if (Date.now() > mem.expiresAt) {
        this.memorySessions.delete(key);
        return null;
      }
      return { activeCommand: mem.activeCommand, sessionState: mem.sessionState, data: mem.data };
    }

    const pool = this.getPool();
    if (!pool) return null;

    try {
      const res = await pool.query('SELECT * FROM telegram_sessions WHERE id = $1 AND expires_at > NOW();', [key]);
      if (res.rows.length === 0) return null;
      const r = res.rows[0];
      return {
        activeCommand: r.active_command,
        sessionState: r.session_state,
        data: r.data || {},
      };
    } catch {
      return null;
    }
  }

  public static async saveSession(
    chatId: number,
    userId: number,
    activeCommand: string,
    sessionState: string,
    data: Record<string, unknown> = {},
    ttlSeconds = 600
  ): Promise<void> {
    const key = `${chatId}:${userId}`;
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.memorySessions.set(key, { activeCommand, sessionState, data, expiresAt });

    const pool = this.getPool();
    if (!pool) return;

    try {
      await pool.query(
        `
        INSERT INTO telegram_sessions (id, chat_id, user_id, active_command, session_state, data, expires_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (id) DO UPDATE SET
          active_command = EXCLUDED.active_command,
          session_state = EXCLUDED.session_state,
          data = EXCLUDED.data,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW();
      `,
        [key, chatId, userId, activeCommand, sessionState, JSON.stringify(data), new Date(expiresAt)]
      );
    } catch {}
  }

  public static async clearSession(chatId: number, userId: number): Promise<void> {
    const key = `${chatId}:${userId}`;
    this.memorySessions.delete(key);
    const pool = this.getPool();
    if (!pool) return;
    try {
      await pool.query('DELETE FROM telegram_sessions WHERE id = $1;', [key]);
    } catch {}
  }

  public static async getNotificationPreferences(chatId: number): Promise<{
    enabled: boolean;
    notifyTaskCompleted: boolean;
    notifyTaskFailed: boolean;
    notifyApprovalRequired: boolean;
  }> {
    const mem = this.memoryPreferences.get(chatId);
    if (mem) return mem;

    const pool = this.getPool();
    if (!pool) {
      return { enabled: true, notifyTaskCompleted: true, notifyTaskFailed: true, notifyApprovalRequired: true };
    }

    try {
      const res = await pool.query('SELECT * FROM telegram_notification_preferences WHERE chat_id = $1;', [chatId]);
      if (res.rows.length === 0) {
        return { enabled: true, notifyTaskCompleted: true, notifyTaskFailed: true, notifyApprovalRequired: true };
      }
      const r = res.rows[0];
      const pref = {
        enabled: Boolean(r.enabled),
        notifyTaskCompleted: Boolean(r.notify_task_completed),
        notifyTaskFailed: Boolean(r.notify_task_failed),
        notifyApprovalRequired: Boolean(r.notify_approval_required),
      };
      this.memoryPreferences.set(chatId, pref);
      return pref;
    } catch {
      return { enabled: true, notifyTaskCompleted: true, notifyTaskFailed: true, notifyApprovalRequired: true };
    }
  }

  public static async updateNotificationPreferences(
    chatId: number,
    userId: number,
    enabled: boolean
  ): Promise<void> {
    const current = await this.getNotificationPreferences(chatId);
    const updated = { ...current, enabled };
    this.memoryPreferences.set(chatId, updated);

    const pool = this.getPool();
    if (!pool) return;

    try {
      await pool.query(
        `
        INSERT INTO telegram_notification_preferences (chat_id, user_id, enabled, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (chat_id) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          user_id = EXCLUDED.user_id,
          updated_at = NOW();
      `,
        [chatId, userId, enabled]
      );
    } catch {}
  }

  public static async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

