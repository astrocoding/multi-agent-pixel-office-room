import type { CommandHandler, CommandContext, CommandExecutionResult } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { KeyboardBuilder } from '../../../delivery/infrastructure/keyboardBuilder.js';
import { TelegramDb } from '../../../../infrastructure/database/telegramDb.js';

export const notificationsHandler: CommandHandler = {
  name: 'notifications',
  description: 'Atur notifikasi tugas dan aktivitas',
  async execute(ctx: CommandContext): Promise<CommandExecutionResult> {
    const subCommand = ctx.args[0]?.toLowerCase().trim();

    if (subCommand === 'on') {
      await TelegramDb.updateNotificationPreferences(ctx.actor.chatId, ctx.actor.telegramUserId, true);
      return 'NOTIFIKASI AKTIF\nNotifikasi tugas dan approval kini aktif untuk chat ini.';
    }

    if (subCommand === 'off') {
      await TelegramDb.updateNotificationPreferences(ctx.actor.chatId, ctx.actor.telegramUserId, false);
      return 'NOTIFIKASI NONAKTIF\nNotifikasi tugas dan approval telah dinonaktifkan untuk chat ini.';
    }

    const currentPref = await TelegramDb.getNotificationPreferences(ctx.actor.chatId);
    return {
      text: MessageFormatter.formatNotifications(currentPref.enabled),
      replyMarkup: KeyboardBuilder.buildNotificationsKeyboard(),
      parseMode: 'HTML',
    };
  },
};
