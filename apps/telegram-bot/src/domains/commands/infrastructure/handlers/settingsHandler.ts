import type { CommandHandler, CommandContext } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';

export const settingsHandler: CommandHandler = {
  name: 'settings',
  description: 'Kelola konfigurasi Agent Office Room',
  async execute(ctx: CommandContext): Promise<string> {
    try {
      const res = await ctx.agentOfficeClient.getSettings();
      return MessageFormatter.formatSettings(res.settings);
    } catch (err) {
      return MessageFormatter.formatError('Gagal memuat pengaturan dari server core.');
    }
  },
};

