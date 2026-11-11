import type { CommandHandler, CommandContext, CommandExecutionResult } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { KeyboardBuilder } from '../../../delivery/infrastructure/keyboardBuilder.js';

export const modelsHandler: CommandHandler = {
  name: 'models',
  description: 'Lihat model AI aktif dan status auto-router',
  async execute(ctx: CommandContext): Promise<CommandExecutionResult> {
    try {
      const res = await ctx.agentOfficeClient.getModels();
      return {
        text: MessageFormatter.formatModels(res),
        replyMarkup: KeyboardBuilder.buildModelsKeyboard(),
        parseMode: 'HTML',
      };
    } catch (err) {
      return MessageFormatter.formatError('Gagal mengambil informasi model AI dari server core.');
    }
  },
};
