import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PollingWorker } from '../../src/domains/polling/application/pollingWorker.js';
import { TelegramClient } from '../../src/integrations/telegram/telegramClient.js';
import { WebhookService } from '../../src/domains/webhook/application/webhookService.js';
import { CommandDispatcher } from '../../src/domains/commands/application/commandDispatcher.js';
import { DeliveryService } from '../../src/domains/delivery/application/deliveryService.js';
import { AgentOfficeClient } from '../../src/integrations/agent-office/agentOfficeClient.js';

class MockTelegramClientForPolling extends TelegramClient {
  public deleteWebhookCalled = false;
  public getUpdatesCalled = false;

  constructor() {
    super('mock-token');
  }

  private callCount = 0;

  public override async deleteWebhook(): Promise<boolean> {
    this.deleteWebhookCalled = true;
    return true;
  }

  public override async getUpdates(
    offset?: number,
    limit = 100,
    timeout = 25,
    signal?: AbortSignal
  ): Promise<any[]> {
    this.getUpdatesCalled = true;
    this.callCount++;
    if (this.callCount === 1) {
      return [
        {
          update_id: 99991,
          message: {
            message_id: 1,
            from: { id: 1909551792, is_bot: false, first_name: 'Boss' },
            chat: { id: 1909551792, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: '/status',
          },
        },
      ];
    }

    // Simulate long-polling waiting for next updates or abort
    await new Promise((resolve) => {
      if (signal?.aborted) return resolve(undefined);
      signal?.addEventListener('abort', () => resolve(undefined), { once: true });
    });
    return [];
  }

  public override async sendMessage(): Promise<unknown> {
    return { ok: true };
  }
}

describe('PollingWorker Unit Test', () => {
  it('clears webhook and processes updates from long-polling', async () => {
    const mockTelegram = new MockTelegramClientForPolling();
    const deliveryService = new DeliveryService(mockTelegram);
    const mockApi = new AgentOfficeClient('http://localhost:3001', 'mock-token');
    const dispatcher = new CommandDispatcher(mockApi, deliveryService);
    const webhookService = new WebhookService(dispatcher);

    let handledUpdateId = 0;
    webhookService.handleUpdate = async (update) => {
      handledUpdateId = update.update_id;
      return { acknowledged: true, isDuplicate: false };
    };

    const worker = new PollingWorker(mockTelegram, webhookService);
    await worker.start();

    // Allow loop to tick
    await new Promise((resolve) => setTimeout(resolve, 50));
    worker.stop();

    assert.strictEqual(mockTelegram.deleteWebhookCalled, true);
    assert.strictEqual(mockTelegram.getUpdatesCalled, true);
    assert.strictEqual(handledUpdateId, 99991);
  });
});
