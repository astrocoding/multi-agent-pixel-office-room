import type { CommandHandler, CommandContext } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';

export const rejectHandler: CommandHandler = {
  name: 'reject',
  description: 'Tolak permintaan eksekusi tugas',
  requiredRole: 'owner',
  async execute(ctx: CommandContext): Promise<string> {
    const approvalId = ctx.args[0]?.trim();

    if (!approvalId) {
      return 'GUNAKAN: /reject <approval_id>\nContoh: /reject apr_12345';
    }

    if (!ctx.actor.isOwner) {
      return MessageFormatter.formatError('Hanya Boss / OWNER yang memiliki otoritas untuk menolak tindakan ini.', 'FORBIDDEN');
    }

    try {
      const res = await ctx.agentOfficeClient.rejectRequest(approvalId, ctx.actor);
      return MessageFormatter.formatApprovalResolved(res.approvalId, 'rejected');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return MessageFormatter.formatError(`Penolakan gagal diproses: ${msg}`);
    }
  },
};

