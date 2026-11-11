import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SecretValidator } from '../../../infrastructure/security/secretValidator.js';
import { telegramUpdateSchema } from '../infrastructure/webhookValidator.js';
import type { WebhookService } from '../application/webhookService.js';
import { env } from '../../../config/env.js';
import { Logger } from '../../../infrastructure/logging/logger.js';

export function registerWebhookController(server: FastifyInstance, webhookService: WebhookService): void {
  // Health check endpoint
  server.get('/health', async () => {
    return { status: 'ok', service: 'telegram-bot', timestamp: new Date().toISOString() };
  });

  const webhookHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const providedSecret = typeof secretHeader === 'string' ? secretHeader : undefined;

    // 1. Verify Secret Token with constant-time comparison
    const isSecretValid = SecretValidator.verifyWebhookSecret(providedSecret, env.TELEGRAM_WEBHOOK_SECRET);
    if (!isSecretValid) {
      Logger.warn('Telegram webhook rejected: Invalid or missing X-Telegram-Bot-Api-Secret-Token');
      return reply.status(401).send({ ok: false, error: 'Unauthorized webhook request' });
    }

    // 2. Validate Telegram Update payload schema
    const parseResult = telegramUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      Logger.warn('Telegram webhook rejected: Invalid update payload format', {
        issues: parseResult.error.issues,
      });
      return reply.status(400).send({ ok: false, error: 'Invalid update payload' });
    }

    // 3. Process update idempotently & asynchronously
    try {
      const result = await webhookService.handleUpdate(parseResult.data);
      return reply.status(200).send({ ok: true, duplicate: result.isDuplicate });
    } catch (err) {
      Logger.error('Failed to accept webhook update', err);
      return reply.status(500).send({ ok: false, error: 'Internal processing error' });
    }
  };

  // Support both canonical /webhooks/telegram and /webhook
  server.post('/webhooks/telegram', webhookHandler);
  server.post('/webhook', webhookHandler);
}

