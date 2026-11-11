import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MessageFormatter } from '../../src/domains/delivery/infrastructure/messageFormatter.js';
import { hasEmoji } from '../../src/shared/utils/noEmoji.js';

describe('MessageFormatter', () => {
  it('formats start message without emojis and with copyable role code', () => {
    const formatted = MessageFormatter.formatStart('owner');
    assert.strictEqual(hasEmoji(formatted), false);
    assert.strictEqual(formatted.includes('AGENT OFFICE ROOM'), true);
    assert.strictEqual(formatted.includes('Role: <code>OWNER</code>'), true);
  });

  it('formats help message without emojis for owner and guest', () => {
    const ownerHelp = MessageFormatter.formatHelp(true);
    assert.strictEqual(hasEmoji(ownerHelp), false);
    assert.strictEqual(ownerHelp.includes('/approve'), true);
    assert.strictEqual(ownerHelp.includes('/reject'), true);

    const guestHelp = MessageFormatter.formatHelp(false);
    assert.strictEqual(hasEmoji(guestHelp), false);
    assert.strictEqual(guestHelp.includes('/approve'), false);
  });

  it('formats status message without emojis and with copyable model code', () => {
    const status = MessageFormatter.formatStatus({
      success: true,
      runtime: 'online',
      agentCount: 6,
      activeTasksCount: 2,
      pendingApprovalsCount: 1,
      activeModel: 'gemini-2.5-flash',
      uptimeSeconds: 3600,
    });
    assert.strictEqual(hasEmoji(status), false);
    assert.strictEqual(status.includes('Active Model: <code>gemini-2.5-flash</code>'), true);
  });

  it('formats task detail and approvals without emojis and with copyable codes', () => {
    const taskDetail = MessageFormatter.formatTaskDetail({
      id: 'task_001',
      title: 'Analyze DB Performance',
      description: 'Analyze query bottlenecks',
      status: 'running',
      assignedAgentId: 'iky',
      createdAt: '2026-11-19T10:00:00Z',
      updatedAt: '2026-11-19T10:05:00Z',
    });
    assert.strictEqual(hasEmoji(taskDetail), false);
    assert.strictEqual(taskDetail.includes('Status: <code>RUNNING</code>'), true);
    assert.strictEqual(taskDetail.includes('ID: <code>task_001</code>'), true);

    const approvals = MessageFormatter.formatApprovalsList([
      {
        id: 'app_001',
        taskId: 'task_001',
        actionType: 'exec_command',
        actionDescription: 'ALTER TABLE users ADD COLUMN verified BOOLEAN',
        riskLevel: 'high',
        status: 'pending',
        requestedBy: 'zen',
        createdAt: '2026-11-19T10:00:00Z',
      },
    ]);
    assert.strictEqual(hasEmoji(approvals), false);
    assert.strictEqual(approvals.includes('ID: <code>app_001</code>'), true);
    assert.strictEqual(approvals.includes('Status: <code>PENDING</code>'), true);
  });
});
