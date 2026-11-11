import type { CommandHandler, CommandContext, CommandExecutionResult } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { KeyboardBuilder } from '../../../delivery/infrastructure/keyboardBuilder.js';

export const helpHandler: CommandHandler = {
  name: 'help',
  description: 'Lihat panduan dan daftar perintah bot',
  async execute(ctx: CommandContext): Promise<CommandExecutionResult> {
    return {
      text: MessageFormatter.formatHelp(ctx.actor.isOwner),
      replyMarkup: KeyboardBuilder.buildMainMenuKeyboard(ctx.actor.isOwner),
      parseMode: 'HTML',
    };
  },
};
