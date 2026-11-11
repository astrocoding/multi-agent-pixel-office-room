import type { CommandHandler, CommandContext } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';

export const activityHandler: CommandHandler = {
  name: 'activity',
  description: 'Pantau aktivitas dan event AI Agent',
  async execute(ctx: CommandContext): Promise<string> {
    try {
      const res = await ctx.agentOfficeClient.getActivity(10);
      return MessageFormatter.formatActivities(res.activities);
    } catch (err) {
      return MessageFormatter.formatError('Gagal memuat log aktivitas AI Agent.');
    }
  },
};

