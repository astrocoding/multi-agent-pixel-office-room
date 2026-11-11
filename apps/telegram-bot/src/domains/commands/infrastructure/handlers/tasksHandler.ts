import type { CommandHandler, CommandContext, CommandExecutionResult } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { KeyboardBuilder } from '../../../delivery/infrastructure/keyboardBuilder.js';

export const tasksHandler: CommandHandler = {
  name: 'tasks',
  description: 'Lihat daftar tugas aktif dan antrean pekerjaan',
  async execute(ctx: CommandContext): Promise<CommandExecutionResult> {
    try {
      const res = await ctx.agentOfficeClient.getTasks();
      return {
        text: MessageFormatter.formatTasksList(res.tasks),
        replyMarkup: KeyboardBuilder.buildTasksKeyboard(res.tasks),
        parseMode: 'HTML',
      };
    } catch (err) {
      return MessageFormatter.formatError('Gagal mengambil daftar tugas dari sistem core.');
    }
  },
};
