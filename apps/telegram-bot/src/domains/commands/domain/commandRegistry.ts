import type { CommandHandler } from './commandTypes.js';
import { startHandler } from '../infrastructure/handlers/startHandler.js';
import { helpHandler } from '../infrastructure/handlers/helpHandler.js';
import { statusHandler } from '../infrastructure/handlers/statusHandler.js';
import { agentsHandler } from '../infrastructure/handlers/agentsHandler.js';
import { taskHandler } from '../infrastructure/handlers/taskHandler.js';
import { tasksHandler } from '../infrastructure/handlers/tasksHandler.js';
import { taskDetailHandler } from '../infrastructure/handlers/taskDetailHandler.js';
import { cancelHandler } from '../infrastructure/handlers/cancelHandler.js';
import { chatHandler } from '../infrastructure/handlers/chatHandler.js';
import { approvalsHandler } from '../infrastructure/handlers/approvalsHandler.js';
import { approveHandler } from '../infrastructure/handlers/approveHandler.js';
import { rejectHandler } from '../infrastructure/handlers/rejectHandler.js';
import { historyHandler } from '../infrastructure/handlers/historyHandler.js';
import { activityHandler } from '../infrastructure/handlers/activityHandler.js';
import { modelsHandler } from '../infrastructure/handlers/modelsHandler.js';
import { memoryHandler } from '../infrastructure/handlers/memoryHandler.js';
import { notificationsHandler } from '../infrastructure/handlers/notificationsHandler.js';
import { settingsHandler } from '../infrastructure/handlers/settingsHandler.js';

export class CommandRegistry {
  private static handlers = new Map<string, CommandHandler>();

  static {
    const list: CommandHandler[] = [
      startHandler,
      helpHandler,
      statusHandler,
      agentsHandler,
      taskHandler,
      tasksHandler,
      taskDetailHandler,
      cancelHandler,
      chatHandler,
      approvalsHandler,
      approveHandler,
      rejectHandler,
      historyHandler,
      activityHandler,
      modelsHandler,
      memoryHandler,
      notificationsHandler,
      settingsHandler,
    ];

    for (const h of list) {
      this.handlers.set(h.name.toLowerCase(), h);
    }
  }

  public static get(name: string): CommandHandler | undefined {
    return this.handlers.get(name.toLowerCase());
  }

  public static has(name: string): boolean {
    return this.handlers.has(name.toLowerCase());
  }

  public static getAll(): CommandHandler[] {
    return Array.from(this.handlers.values());
  }

  public static getCommandDescriptions(): Array<{ command: string; description: string }> {
    return Array.from(this.handlers.values()).map((h) => ({
      command: h.name,
      description: h.description,
    }));
  }
}

