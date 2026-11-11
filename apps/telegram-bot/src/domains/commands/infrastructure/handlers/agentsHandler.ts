import type { CommandHandler, CommandContext, CommandExecutionResult } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { KeyboardBuilder } from '../../../delivery/infrastructure/keyboardBuilder.js';

export const agentsHandler: CommandHandler = {
  name: 'agents',
  description: 'Lihat seluruh AI Agent beserta statusnya',
  async execute(ctx: CommandContext): Promise<CommandExecutionResult> {
    try {
      const res = await ctx.agentOfficeClient.getAgents();
      return {
        text: MessageFormatter.formatAgents(res.agents),
        replyMarkup: KeyboardBuilder.buildAgentsKeyboard(),
        parseMode: 'HTML',
      };
    } catch (err) {
      return MessageFormatter.formatError('Gagal memuat status AI Agent dari backend core.');
    }
  },
};
