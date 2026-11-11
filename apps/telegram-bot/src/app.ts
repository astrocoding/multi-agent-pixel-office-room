import fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { TelegramClient } from './integrations/telegram/telegramClient.js';
import { AgentOfficeClient } from './integrations/agent-office/agentOfficeClient.js';
import { DeliveryService } from './domains/delivery/application/deliveryService.js';
import { CommandDispatcher } from './domains/commands/application/commandDispatcher.js';
import { WebhookService } from './domains/webhook/application/webhookService.js';
import { NotificationService } from './domains/notifications/application/notificationService.js';
import { PollingWorker } from './domains/polling/application/pollingWorker.js';
import { registerWebhookController } from './domains/webhook/presentation/webhookController.js';

export interface TelegramBotAppContext {
  server: FastifyInstance;
  telegramClient: TelegramClient;
  agentOfficeClient: AgentOfficeClient;
  deliveryService: DeliveryService;
  commandDispatcher: CommandDispatcher;
  webhookService: WebhookService;
  notificationService: NotificationService;
  pollingWorker: PollingWorker;
}

export function createTelegramBotApp(options: {
  telegramClient?: TelegramClient;
  agentOfficeClient?: AgentOfficeClient;
} = {}): TelegramBotAppContext {
  const server = fastify({
    logger: false,
    bodyLimit: 1024 * 1024, // 1MB bounded payload
  });

  server.register(cors, {
    origin: '*',
    methods: ['GET', 'POST'],
  });

  const telegramClient = options.telegramClient || new TelegramClient();
  const agentOfficeClient = options.agentOfficeClient || new AgentOfficeClient();
  const deliveryService = new DeliveryService(telegramClient);
  const commandDispatcher = new CommandDispatcher(agentOfficeClient, deliveryService);
  const webhookService = new WebhookService(commandDispatcher, telegramClient);
  const notificationService = new NotificationService(deliveryService);
  const pollingWorker = new PollingWorker(telegramClient, webhookService);

  registerWebhookController(server, webhookService);

  return {
    server,
    telegramClient,
    agentOfficeClient,
    deliveryService,
    commandDispatcher,
    webhookService,
    notificationService,
    pollingWorker,
  };
}

