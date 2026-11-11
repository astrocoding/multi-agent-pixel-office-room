import type { CommandHandler, CommandContext, CommandExecutionResult } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { KeyboardBuilder } from '../../../delivery/infrastructure/keyboardBuilder.js';

export const approvalsHandler: CommandHandler = {
  name: 'approvals',
  description: 'Lihat tugas yang menunggu persetujuan Boss',
  async execute(ctx: CommandContext): Promise<CommandExecutionResult> {
    try {
      const res = await ctx.agentOfficeClient.getApprovals();
      return {
        text: MessageFormatter.formatApprovalsList(res.approvals),
        replyMarkup: KeyboardBuilder.buildApprovalsKeyboard(res.approvals),
        parseMode: 'HTML',
      };
    } catch (err) {
      return MessageFormatter.formatError('Gagal memeriksa daftar persetujuan tugas.');
    }
  },
};
