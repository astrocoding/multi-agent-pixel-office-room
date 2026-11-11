import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramBotApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { TelegramDb } from '../../src/infrastructure/database/telegramDb.js';

describe('Webhook Idempotency', () => {
  it('processes first delivery and ignores duplicate update_id', async () => {
    const { server, commandDispatcher } = createTelegramBotApp();
    
    let dispatchCallCount = 0;
    // Spy on dispatch
    const originalDispatch = commandDispatcher.dispatch.bind(commandDispatcher);
    commandDispatcher.dispatch = async (text, actor, messageId, updateId) => {
      dispatchCallCount++;
      return originalDispatch(text, actor, messageId, updateId);
    };

    const updatePayload = {
      update_id: 8881234,
      message: {
        message_id: 1,
        from: {
          id: 12345678,
          is_bot: false,
          first_name: 'Tester',
          username: 'tester',
        },
        chat: {
          id: 12345678,
          type: 'private' as const,
        },
        date: Math.floor(Date.now() / 1000),
        text: '/start',
      },
    };

    // First request
    const firstRes = await server.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers: {
        'x-telegram-bot-api-secret-token': env.TELEGRAM_WEBHOOK_SECRET,
      },
      payload: updatePayload,
    });

    assert.strictEqual(firstRes.statusCode, 200);
    const firstBody = firstRes.json();
    assert.strictEqual(firstBody.ok, true);
    assert.strictEqual(firstBody.duplicate, false);

    // Wait a brief tick for background processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Second request with EXACT same update_id
    const duplicateRes = await server.inject({
      method: 'POST',
      url: '/webhooks/telegram',
      headers: {
        'x-telegram-bot-api-secret-token': env.TELEGRAM_WEBHOOK_SECRET,
      },
      payload: updatePayload,
    });

    assert.strictEqual(duplicateRes.statusCode, 200);
    const duplicateBody = duplicateRes.json();
    assert.strictEqual(duplicateBody.ok, true);
    assert.strictEqual(duplicateBody.duplicate, true);

    // Assert dispatch was called only once despite duplicate HTTP webhook post
    assert.strictEqual(dispatchCallCount, 1);
  });
});

