import { CommandParser } from '../infrastructure/commandParser.js';
import { CommandRegistry } from '../domain/commandRegistry.js';
import { SessionManager } from '../../sessions/application/sessionManager.js';
import { MessageFormatter } from '../../delivery/infrastructure/messageFormatter.js';
import { Logger } from '../../../infrastructure/logging/logger.js';
import type { TelegramActor } from '../../identity/domain/identityTypes.js';
import type { AgentOfficeClient } from '../../../integrations/agent-office/agentOfficeClient.js';
import type { DeliveryService } from '../../delivery/application/deliveryService.js';

export class CommandDispatcher {
  private agentOfficeClient: AgentOfficeClient;
  private deliveryService: DeliveryService;

  constructor(agentOfficeClient: AgentOfficeClient, deliveryService: DeliveryService) {
    this.agentOfficeClient = agentOfficeClient;
    this.deliveryService = deliveryService;
  }

  public async dispatch(
    text: string,
    actor: TelegramActor,
    messageId: number,
    updateId?: number
  ): Promise<string> {
    const logCtx = {
      updateId,
      actorId: actor.actorId,
      userId: actor.telegramUserId,
      chatId: actor.chatId,
    };

    // 1. Authorization check
    if (!actor.isAuthorized) {
      Logger.warn('Unauthorized message attempt rejected', logCtx);
      const response = "Forbidden! You don't have any access to this Agent Office Room.";
      await this.deliveryService.sendResponse(actor.chatId, response);
      return response;
    }

    const parsed = CommandParser.parse(text);

    // 2. Check for active session if message is NOT a slash command (or if it's /cancel)
    const activeSession = await SessionManager.getSession(actor.chatId, actor.telegramUserId);

    if (activeSession && (!parsed.isCommand || parsed.commandName !== 'cancel')) {
      if (activeSession.activeCommand === 'task' && activeSession.sessionState === 'waiting_description') {
        await SessionManager.clearSession(actor.chatId, actor.telegramUserId);
        const taskDescription = text.trim();
        const title = taskDescription.slice(0, 50);

        try {
          const res = await this.agentOfficeClient.createTask(title, taskDescription, actor);
          const response = MessageFormatter.formatTaskCreated(res.taskId, title, 'Zen (Leader)');
          await this.deliveryService.sendResponse(actor.chatId, response);
          return response;
        } catch (err) {
          const response = MessageFormatter.formatError('Gagal membuat tugas dari sesi input.');
          await this.deliveryService.sendResponse(actor.chatId, response);
          return response;
        }
      }
    }

    // 3. If plain message without command or active session
    if (!parsed.isCommand) {
      const response = [
        'PERINTAH TIDAK DIKENAL',
        'Ketik /help untuk melihat daftar perintah bot.',
      ].join('\n');
      await this.deliveryService.sendResponse(actor.chatId, response);
      return response;
    }

    // 4. Resolve command handler
    const handler = CommandRegistry.get(parsed.commandName);
    if (!handler) {
      Logger.info(`Unknown command requested: /${parsed.commandName}`, logCtx);
      const response = [
        'PERINTAH TIDAK DIKENAL',
        `Perintah "/${parsed.commandName}" tidak ditemukan.`,
        'Ketik /help untuk melihat daftar perintah yang tersedia.',
      ].join('\n');
      await this.deliveryService.sendResponse(actor.chatId, response);
      return response;
    }

    // 5. Role check for privileged commands
    if (handler.requiredRole && handler.requiredRole === 'owner' && !actor.isOwner) {
      Logger.warn(`Privileged command /${handler.name} denied for non-owner`, logCtx);
      const response = MessageFormatter.formatError(
        `Perintah "/${handler.name}" memerlukan hak akses BOSS / OWNER.`,
        'FORBIDDEN'
      );
      await this.deliveryService.sendResponse(actor.chatId, response);
      return response;
    }

    // 6. Execute command
    try {
      const result = await handler.execute({
        command: handler.name,
        args: parsed.args,
        rawText: parsed.rawArgs,
        actor,
        messageId,
        agentOfficeClient: this.agentOfficeClient,
        deliveryService: this.deliveryService,
      });

      const responseText = typeof result === 'string' ? result : result.text;
      const sendOptions = typeof result === 'object' ? { replyMarkup: result.replyMarkup, parseMode: result.parseMode } : undefined;

      await this.deliveryService.sendResponse(actor.chatId, responseText, sendOptions);
      return responseText;
    } catch (err) {
      Logger.error(`Error executing /${handler.name}`, err, logCtx);
      const response = MessageFormatter.formatError(
        'Terjadi kendala saat memproses perintah Anda. Coba beberapa saat lagi.',
        'ERROR'
      );
      await this.deliveryService.sendResponse(actor.chatId, response);
      return response;
    }
  }
}

