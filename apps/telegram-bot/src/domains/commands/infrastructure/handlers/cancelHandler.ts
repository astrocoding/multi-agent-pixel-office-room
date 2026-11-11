import type { CommandHandler, CommandContext } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { SessionManager } from '../../../sessions/application/sessionManager.js';

export const cancelHandler: CommandHandler = {
  name: 'cancel',
  description: 'Batalkan tugas yang sedang berjalan',
  async execute(ctx: CommandContext): Promise<string> {
    const taskId = ctx.args[0]?.trim();

    // 1. Without taskId: cancel active session if one exists
    if (!taskId) {
      const activeSession = await SessionManager.getSession(ctx.actor.chatId, ctx.actor.telegramUserId);
      if (activeSession) {
        await SessionManager.clearSession(ctx.actor.chatId, ctx.actor.telegramUserId);
        return 'SESI DIBATALKAN\nInput sesi interaktif telah berhasil dibatalkan.';
      }
      return 'GUNAKAN: /cancel <task_id>\nUntuk membatalkan tugas tertentu, sertakan task ID.\nContoh: /cancel task_12345';
    }

    // 2. With taskId: cancel the task
    try {
      const res = await ctx.agentOfficeClient.cancelTask(taskId, ctx.actor);
      return [
        'TASK CANCELLED',
        `ID: ${res.taskId}`,
        `Status: ${res.status.toUpperCase()}`,
        'Catatan: Sinyal pembatalan telah dikirim ke orchestrator.',
      ].join('\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return MessageFormatter.formatError(`Gagal membatalkan tugas: ${msg}`);
    }
  },
};

