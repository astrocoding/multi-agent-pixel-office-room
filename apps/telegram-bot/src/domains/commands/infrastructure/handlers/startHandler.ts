import type { CommandHandler, CommandContext, CommandExecutionResult } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { KeyboardBuilder } from '../../../delivery/infrastructure/keyboardBuilder.js';

export const startHandler: CommandHandler = {
  name: 'start',
  description: 'Mulai Agent Office Room dan tampilkan menu utama',
  async execute(ctx: CommandContext): Promise<CommandExecutionResult> {
    return {
      text: MessageFormatter.formatStart(ctx.actor.role),
      replyMarkup: KeyboardBuilder.buildMainMenuKeyboard(ctx.actor.isOwner),
      parseMode: 'HTML',
    };
  },
};
