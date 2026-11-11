import type { CommandHandler, CommandContext, CommandExecutionResult } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { KeyboardBuilder } from '../../../delivery/infrastructure/keyboardBuilder.js';

export const taskDetailHandler: CommandHandler = {
  name: 'task_detail',
  description: 'Lihat progres dan detail eksekusi tugas',
  async execute(ctx: CommandContext): Promise<CommandExecutionResult> {
    const taskId = ctx.args[0]?.trim();
    if (!taskId) {
      return 'GUNAKAN: /task_detail <task_id>\nContoh: /task_detail task_12345';
    }

    try {
      const task = await ctx.agentOfficeClient.getTaskById(taskId);
      if (!task) {
        return MessageFormatter.formatError(`Tugas dengan ID "${taskId}" tidak ditemukan.`, 'NOT FOUND');
      }
      return {
        text: MessageFormatter.formatTaskDetail(task),
        replyMarkup: KeyboardBuilder.buildTaskDetailKeyboard(task.id),
        parseMode: 'HTML',
      };
    } catch (err) {
      return MessageFormatter.formatError(`Gagal mengambil detail tugas ID "${taskId}".`);
    }
  },
};
