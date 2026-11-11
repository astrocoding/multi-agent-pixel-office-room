import type { CommandHandler, CommandContext } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';

export const historyHandler: CommandHandler = {
  name: 'history',
  description: 'Lihat riwayat tugas dan hasil pekerjaan',
  async execute(ctx: CommandContext): Promise<string> {
    try {
      const res = await ctx.agentOfficeClient.getHistory(10);
      return MessageFormatter.formatHistory(res.history);
    } catch (err) {
      return MessageFormatter.formatError('Gagal memuat riwayat pekerjaan dari server core.');
    }
  },
};

