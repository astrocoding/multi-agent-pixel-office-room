import type { CommandHandler, CommandContext, CommandExecutionResult } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { KeyboardBuilder } from '../../../delivery/infrastructure/keyboardBuilder.js';

export const statusHandler: CommandHandler = {
  name: 'status',
  description: 'Pantau status sistem dan aktivitas AI Agent',
  async execute(ctx: CommandContext): Promise<CommandExecutionResult> {
    try {
      const status = await ctx.agentOfficeClient.getStatus();
      return {
        text: MessageFormatter.formatStatus(status),
        replyMarkup: KeyboardBuilder.buildStatusKeyboard(),
        parseMode: 'HTML',
      };
    } catch (err) {
      return MessageFormatter.formatError('Sistem core sedang tidak dapat dihubungi. Coba lagi nanti.', 'STATUS ERROR');
    }
  },
};
