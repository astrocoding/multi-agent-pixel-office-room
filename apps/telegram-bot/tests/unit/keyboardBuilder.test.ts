import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardBuilder } from '../../src/domains/delivery/infrastructure/keyboardBuilder.js';
import { hasEmoji } from '../../src/shared/utils/noEmoji.js';

describe('KeyboardBuilder', () => {
  it('builds main menu keyboard in 2-column layout without emojis', () => {
    const kb = KeyboardBuilder.buildMainMenuKeyboard(true);
    assert.strictEqual(kb.inline_keyboard.length, 5);
    for (const row of kb.inline_keyboard) {
      assert.strictEqual(row.length, 2);
      for (const btn of row) {
        assert.strictEqual(hasEmoji(btn.text), false);
        assert.strictEqual(btn.callback_data.startsWith('/'), true);
      }
    }
  });

  it('builds tasks keyboard with action buttons', () => {
    const kb = KeyboardBuilder.buildTasksKeyboard([
      {
        id: 'task_001',
        title: 'Run Migrations',
        description: 'Postgres migrations',
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    assert.strictEqual(kb.inline_keyboard.length, 2);
    assert.strictEqual(kb.inline_keyboard[0][0].callback_data, '/task_detail task_001');
    assert.strictEqual(kb.inline_keyboard[0][1].callback_data, '/cancel task_001');
  });

  it('builds approvals keyboard with approve and reject buttons', () => {
    const kb = KeyboardBuilder.buildApprovalsKeyboard([
      {
        id: 'app_101',
        taskId: 'task_001',
        actionType: 'exec_command',
        actionDescription: 'pnpm db:migrate',
        riskLevel: 'medium',
        status: 'pending',
        requestedBy: 'Zen',
        createdAt: new Date().toISOString(),
      },
    ]);
    assert.strictEqual(kb.inline_keyboard.length, 2);
    assert.strictEqual(kb.inline_keyboard[0][0].callback_data, '/approve app_101');
    assert.strictEqual(kb.inline_keyboard[0][1].callback_data, '/reject app_101');
  });
});

