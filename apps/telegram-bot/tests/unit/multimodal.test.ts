import { describe, it } from 'node:test';
import assert from 'node:assert';
import { telegramUpdateSchema } from '../../src/domains/webhook/infrastructure/webhookValidator.js';
import { CommandDispatcher } from '../../src/domains/commands/application/commandDispatcher.js';
import type { TelegramActor } from '../../src/domains/identity/domain/identityTypes.js';
import type { AgentOfficeClient } from '../../src/integrations/agent-office/agentOfficeClient.js';
import type { DeliveryService } from '../../src/domains/delivery/application/deliveryService.js';
import type { TaskAttachment } from '@agent-office/shared';

describe('Multimodal Telegram & Attachment Support', () => {
  it('validates incoming updates containing photo attachments and caption', () => {
    const rawUpdate = {
      update_id: 10001,
      message: {
        message_id: 42,
        from: { id: 1909551792, first_name: 'Boss', username: 'zaenalalfian' },
        chat: { id: 1909551792, type: 'private' as const },
        date: 1731998400,
        caption: '@dre tolong cek isi gambar ini',
        photo: [
          { file_id: 'photo_thumb', file_unique_id: 'u_thumb', width: 100, height: 100, file_size: 1500 },
          { file_id: 'photo_large', file_unique_id: 'u_large', width: 1280, height: 720, file_size: 45000 },
        ],
      },
    };

    const parsed = telegramUpdateSchema.safeParse(rawUpdate);
    assert.strictEqual(parsed.success, true);
    if (parsed.success && parsed.data.message) {
      assert.strictEqual(parsed.data.message.caption, '@dre tolong cek isi gambar ini');
      assert.strictEqual(parsed.data.message.photo?.length, 2);
      assert.strictEqual(parsed.data.message.photo[1].file_id, 'photo_large');
    }
  });

  it('validates incoming updates containing PDF document attachments', () => {
    const rawUpdate = {
      update_id: 10002,
      message: {
        message_id: 43,
        from: { id: 1909551792, first_name: 'Boss' },
        chat: { id: -1001234567, type: 'supergroup' as const, title: 'Office Dev Group' },
        date: 1731998500,
        caption: '@dre tolong analisis dokumen PDF arsitektur ini',
        document: {
          file_id: 'doc_pdf_123',
          file_name: 'system_architecture.pdf',
          mime_type: 'application/pdf',
          file_size: 120500,
        },
      },
    };

    const parsed = telegramUpdateSchema.safeParse(rawUpdate);
    assert.strictEqual(parsed.success, true);
    if (parsed.success && parsed.data.message) {
      assert.strictEqual(parsed.data.message.document?.file_name, 'system_architecture.pdf');
      assert.strictEqual(parsed.data.message.document?.mime_type, 'application/pdf');
    }
  });

  it('dispatches multimodal chat directly to target agent with attachments', async () => {
    let capturedAgentId = '';
    let capturedPrompt = '';
    let capturedAttachments: TaskAttachment[] | undefined;

    const mockAgentOfficeClient: Partial<AgentOfficeClient> = {
      async sendChat(text, targetAgentId, actor, sessionId, attachments) {
        capturedAgentId = targetAgentId;
        capturedPrompt = text;
        capturedAttachments = attachments;
        return {
          success: true,
          sender: targetAgentId,
          agentName: 'Dre (Research)',
          reply: 'Saya telah memeriksa gambar dan menemukan OCR yang akurat tanpa halusinasi.',
        };
      },
    };

    let deliveredText = '';
    const mockDeliveryService: Partial<DeliveryService> = {
      async sendResponse(chatId, text) {
        deliveredText = text;
        return null;
      },
    };

    const dispatcher = new CommandDispatcher(
      mockAgentOfficeClient as AgentOfficeClient,
      mockDeliveryService as DeliveryService
    );

    const actor: TelegramActor = {
      actorId: 'user_boss',
      telegramUserId: 1909551792,
      chatId: 1909551792,
      chatType: 'private',
      role: 'owner',
      isAuthorized: true,
      isOwner: true,
    };

    const sampleAttachment: TaskAttachment = {
      id: 'att_sample_01',
      name: 'screenshot_test.png',
      type: 'image',
      mimeType: 'image/png',
      size: 5000,
      base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    };

    const result = await dispatcher.dispatch(
      '@dre tolong cek gambar yang saya lampirkan',
      actor,
      100,
      10003,
      [sampleAttachment]
    );

    assert.strictEqual(capturedAgentId, 'agent_research');
    assert.strictEqual(capturedAttachments?.length, 1);
    assert.strictEqual(capturedAttachments?.[0].name, 'screenshot_test.png');
    assert.ok(result.includes('Dre (Research)'));
    assert.ok(deliveredText.includes('OCR yang akurat'));
  });
});

