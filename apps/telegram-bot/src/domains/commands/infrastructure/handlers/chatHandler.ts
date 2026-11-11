import type { CommandHandler, CommandContext } from '../../domain/commandTypes.js';
import { MessageFormatter } from '../../../delivery/infrastructure/messageFormatter.js';
import { AGENT_IDS } from '@agent-office/shared';

const AGENT_ALIAS_MAP: Record<string, string> = {
  zen: AGENT_IDS.LEADER,
  dre: AGENT_IDS.RESEARCH,
  iky: AGENT_IDS.ENGINEERING,
  gus: AGENT_IDS.AUTOMATION,
  rai: AGENT_IDS.QA,
  dhea: AGENT_IDS.MEMORY,
};

export const chatHandler: CommandHandler = {
  name: 'chat',
  description: 'Berkomunikasi langsung dengan AI Agent',
  async execute(ctx: CommandContext): Promise<string> {
    const agentAlias = ctx.args[0]?.toLowerCase().trim();
    const message = ctx.args.slice(1).join(' ').trim();

    if (!agentAlias || !message) {
      return [
        'GUNAKAN: /chat <agent> <pesan>',
        'Pilihan agent: zen, dre, iky, gus, rai, dhea',
        'Contoh: /chat zen tolong periksa arsitektur sistem saat ini',
      ].join('\n');
    }

    const targetAgentId = AGENT_ALIAS_MAP[agentAlias];
    if (!targetAgentId) {
      return [
        'AGENT TIDAK DIKENAL',
        `Agent "${agentAlias}" tidak terdaftar.`,
        'Pilihan valid: zen, dre, iky, gus, rai, dhea.',
      ].join('\n');
    }

    try {
      const res = await ctx.agentOfficeClient.sendChat(message, targetAgentId, ctx.actor);
      return [
        `${res.agentName}:`,
        res.reply,
      ].join('\n');
    } catch (err) {
      return MessageFormatter.formatError('Gagal mengirim pesan ke AI Agent runtime.');
    }
  },
};

