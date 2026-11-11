import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SecretValidator } from '../../src/infrastructure/security/secretValidator.js';
import { createTelegramBotApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';

describe('Webhook Security', () => {
  describe('SecretValidator timing-safe comparison', () => {
    const validSecret = 'test-secret-token-12345';

    it('validates correct secret', () => {
      assert.strictEqual(SecretValidator.verifyWebhookSecret(validSecret, validSecret), true);
    });

    it('rejects incorrect secret of same length', () => {
      const wrongSecret = 'test-secret-token-99999';
      assert.strictEqual(SecretValidator.verifyWebhookSecret(wrongSecret, validSecret), false);
    });

    it('rejects secret of different length', () => {
      assert.strictEqual(SecretValidator.verifyWebhookSecret('short', validSecret), false);
    });

    it('rejects undefined or null secret', () => {
      assert.strictEqual(SecretValidator.verifyWebhookSecret(undefined, validSecret), false);
      assert.strictEqual(SecretValidator.verifyWebhookSecret(null, validSecret), false);
    });
  });

  describe('HTTP Webhook Endpoint Security', () => {
    it('rejects requests without X-Telegram-Bot-Api-Secret-Token with 401', async () => {
      const { server } = createTelegramBotApp();
      const response = await server.inject({
        method: 'POST',
        url: '/webhooks/telegram',
        payload: { update_id: 1001 },
      });

      assert.strictEqual(response.statusCode, 401);
      const json = response.json();
      assert.strictEqual(json.ok, false);
      assert.strictEqual(json.error, 'Unauthorized webhook request');
    });

    it('rejects requests with invalid secret token with 401', async () => {
      const { server } = createTelegramBotApp();
      const response = await server.inject({
        method: 'POST',
        url: '/webhooks/telegram',
        headers: {
          'x-telegram-bot-api-secret-token': 'wrong-token',
        },
        payload: { update_id: 1002 },
      });

      assert.strictEqual(response.statusCode, 401);
    });

    it('rejects invalid or non-object payloads with 400', async () => {
      const { server } = createTelegramBotApp();
      const response = await server.inject({
        method: 'POST',
        url: '/webhooks/telegram',
        headers: {
          'x-telegram-bot-api-secret-token': env.TELEGRAM_WEBHOOK_SECRET,
        },
        payload: {
          // Missing update_id
          foo: 'bar',
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const json = response.json();
      assert.strictEqual(json.ok, false);
      assert.strictEqual(json.error, 'Invalid update payload');
    });

    it('rejects GET requests to the webhook URL with 404 or 405', async () => {
      const { server } = createTelegramBotApp();
      const response = await server.inject({
        method: 'GET',
        url: '/webhooks/telegram',
      });

      // Fastify returns 404 if no GET handler is registered on that route
      assert.strictEqual(response.statusCode, 404);
    });
  });
});

