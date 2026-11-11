import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasEmoji, stripEmoji, assertNoEmoji } from '../../src/shared/utils/noEmoji.js';

describe('noEmoji Utility', () => {
  it('detects common emojis', () => {
    assert.strictEqual(hasEmoji('Hello 😊'), true);
    assert.strictEqual(hasEmoji('🚀 Deploying'), true);
    assert.strictEqual(hasEmoji('System status: ✅ OK'), true);
    assert.strictEqual(hasEmoji('Warning ⚠️'), true);
    assert.strictEqual(hasEmoji('Agent 🤖 active'), true);
  });

  it('passes pure ASCII and clean text', () => {
    assert.strictEqual(hasEmoji('AGENT OFFICE ROOM'), false);
    assert.strictEqual(hasEmoji('[SUCCESS] Task completed'), false);
    assert.strictEqual(hasEmoji('Status: RUNNING [ID: task_123]'), false);
    assert.strictEqual(hasEmoji('Approval #1: APPROVE / REJECT'), false);
    assert.strictEqual(hasEmoji(''), false);
  });

  it('strips emoji while preserving ASCII characters', () => {
    const raw = '🚀 Launching task ✅ [SUCCESS]';
    const cleaned = stripEmoji(raw);
    assert.strictEqual(hasEmoji(cleaned), false);
    assert.strictEqual(cleaned.includes('[SUCCESS]'), true);
  });

  it('throws an error in assertNoEmoji when emoji is detected', () => {
    assert.throws(() => {
      assertNoEmoji('Error ❌ occurred', 'test context');
    }, /Detected forbidden emoji in test context/);
  });

  it('does not throw in assertNoEmoji when clean ASCII text is passed', () => {
    assert.doesNotThrow(() => {
      assertNoEmoji('[STATUS: OK] All systems nominal', 'test context');
    });
  });
});

