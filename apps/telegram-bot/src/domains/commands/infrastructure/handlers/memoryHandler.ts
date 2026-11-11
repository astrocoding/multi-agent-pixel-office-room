import type { CommandHandler, CommandContext } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';

export const memoryHandler: CommandHandler = {
  name: 'memory',
  description: 'Lihat informasi memori dan konteks tersimpan',
  async execute(ctx: CommandContext): Promise<string> {
    const query = ctx.args.join(' ').trim() || undefined;

    try {
      const data = await ctx.agentOfficeClient.getMemory(query, 5);
      return MessageFormatter.formatMemory(data as Parameters<typeof MessageFormatter.formatMemory>[0]);
    } catch (err) {
      return MessageFormatter.formatError('Gagal mengakses sistem memori episodic.');
    }
  },
};

