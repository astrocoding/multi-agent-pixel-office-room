import type { CommandHandler, CommandContext } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';

export const approveHandler: CommandHandler = {
  name: 'approve',
  description: 'Setujui permintaan eksekusi tugas',
  requiredRole: 'owner',
  async execute(ctx: CommandContext): Promise<string> {
    const approvalId = ctx.args[0]?.trim();

    if (!approvalId) {
      return 'GUNAKAN: /approve <approval_id>\nContoh: /approve apr_12345';
    }

    if (!ctx.actor.isOwner) {
      return MessageFormatter.formatError('Hanya Boss / OWNER yang memiliki otoritas untuk menyetujui tindakan ini.', 'FORBIDDEN');
    }

    try {
      const res = await ctx.agentOfficeClient.approveRequest(approvalId, ctx.actor);
      return MessageFormatter.formatApprovalResolved(res.approvalId, 'approved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return MessageFormatter.formatError(`Persetujuan gagal diproses: ${msg}`);
    }
  },
};

