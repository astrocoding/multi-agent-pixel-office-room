import type { TelegramActor, ActorRole } from '../../identity/domain/identityTypes.js';
import type { AgentOfficeClient } from '../../../integrations/agent-office/agentOfficeClient.js';
import type { DeliveryService } from '../../delivery/application/deliveryService.js';

export interface CommandContext {
  command: string;
  args: string[];
  rawText: string;
  actor: TelegramActor;
  messageId: number;
  agentOfficeClient: AgentOfficeClient;
  deliveryService: DeliveryService;
}

export type CommandExecutionResult =
  | string
  | {
      text: string;
      replyMarkup?: Record<string, unknown>;
      parseMode?: 'HTML' | 'Markdown';
    };

export interface CommandHandler {
  name: string;
  description: string;
  requiredRole?: ActorRole;
  execute(ctx: CommandContext): Promise<CommandExecutionResult>;
}

