import type { CommandHandler, CommandContext } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { SessionManager } from '../../../sessions/application/sessionManager.js';

export const taskHandler: CommandHandler = {
  name: 'task',
  description: 'Buat dan delegasikan tugas baru ke AI Agent',
  async execute(ctx: CommandContext): Promise<string> {
    const rawDescription = ctx.args.join(' ').trim();

    if (!rawDescription) {
      // Initiate short-lived session waiting for task description
      await SessionManager.setSession(ctx.actor.chatId, ctx.actor.telegramUserId, 'task', 'waiting_description');
      return [
        'TASK INPUT REQUIRED',
        'Silakan ketik rincian tugas yang ingin didelegasikan ke AI Agent.',
        'Ketik /cancel untuk membatalkan.',
      ].join('\n');
    }

    try {
      const title = rawDescription.slice(0, 50);
      const res = await ctx.agentOfficeClient.createTask(title, rawDescription, ctx.actor);
      return MessageFormatter.formatTaskCreated(res.taskId, title, 'Zen (Leader)');
    } catch (err) {
      return MessageFormatter.formatError('Gagal membuat tugas. Periksa koneksi ke server core.');
    }
  },
};

