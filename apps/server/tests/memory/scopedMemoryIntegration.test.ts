import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryService } from '../../src/memory/memoryService.js';
import { ModelRouter, FallbackProvider } from '@agent-office/ai';

function createTestMemoryService(): MemoryService {
  const fallback = new FallbackProvider();
  const router = new ModelRouter(fallback);
  return new MemoryService(router);
}

test('ScopedMemoryIntegration: Working Memory vs Long-Term Memory Separation', async () => {
  const memoryService = createTestMemoryService();
  const sessionId = `sess_${Date.now()}`;

  // 1. Working memory uses sliding window without polluting long-term memory
  await memoryService.appendSessionContext(sessionId, 'User asked about database configuration');
  await memoryService.appendSessionContext(sessionId, 'Zen planned task execution steps');

  const context = await memoryService.getSessionContext(sessionId);
  assert.equal(context.length, 2);
  assert.ok(context[0].includes('User asked about database configuration'));

  // Long-term scoped memories query should be completely empty/isolated from transient session context
  const longTerm = await memoryService.retrieveScopedMemories({
    query: 'database configuration',
    scope: {
      actorId: 'alice',
      projectScope: 'new_project',
      tenantId: 'tenant_x',
      role: 'member',
    },
  });

  assert.equal(longTerm.length, 0, 'Transient working memory must not leak into long-term scoped memory');
});

test('ScopedMemoryIntegration: Storing Scoped Memory with Secret Redaction & ACL', async () => {
  const memoryService = createTestMemoryService();
  const dummyOpenAiKey = ['sk', 'proj'].join('-') + '-mock' + '0'.repeat(32);

  const record = await memoryService.storeScopedMemory({
    category: 'user_preference',
    content: `Always format output in Markdown and use OpenAI API Key ${dummyOpenAiKey} for tests`,
    actorId: 'alice',
    role: 'owner',
    projectScope: 'project_alpha',
    tenantId: 'tenant_alpha',
    visibility: 'private',
    verificationState: 'verified_truth',
    retentionPolicy: 'permanent',
  });

  assert.ok(record);
  assert.equal(record.actorId, 'alice');
  assert.equal(record.visibility, 'private');
  // Verify secret was redacted before storing
  assert.equal(record.content.includes(dummyOpenAiKey), false);
  assert.ok(record.content.includes('[REDACTED_OPENAI_KEY]'));
  assert.equal(record.metadata.redactionCount, 1);
});

test('ScopedMemoryIntegration: Demonstration of Negative Feedback -> Governed Proposal -> Review -> Publish -> Rollback', async () => {
  const memoryService = createTestMemoryService();
  const idempotencyKey = `idemp_feedback_${Date.now()}`;

  // 1. Submit negative feedback
  const feedbackRes = await memoryService.recordFeedback({
    idempotencyKey,
    taskId: 'task_qa_999',
    actorId: 'boss',
    projectScope: 'default',
    feedbackType: 'failed_test',
    targetType: 'skill',
    targetIdentifier: 'humanizer',
    rating: -1,
    details: 'Formal academic register failed to include required methodological citations footer',
    evidence: { missingFooter: true },
  });

  assert.equal(feedbackRes.deduplicated, false);
  assert.equal(feedbackRes.feedback.rating, -1);
  assert.ok(feedbackRes.proposal, 'Negative feedback on skill must spawn a proposed change candidate');
  assert.equal(
    feedbackRes.proposal.status,
    'pending_review',
    'Critical invariant: Proposed change must remain pending until human owner approval'
  );

  const proposalId = feedbackRes.proposal.id;

  // 2. Test Idempotency: submitting same feedback again returns duplicate flag without spawning a second proposal
  const dupRes = await memoryService.recordFeedback({
    idempotencyKey,
    taskId: 'task_qa_999',
    actorId: 'boss',
    feedbackType: 'failed_test',
    targetType: 'skill',
    targetIdentifier: 'humanizer',
    rating: -1,
    details: 'Duplicate submission',
  });
  assert.equal(dupRes.deduplicated, true);

  // 3. Human Owner reviews and approves proposal
  const reviewedProposal = await memoryService.reviewProposal({
    proposalId,
    reviewerId: 'boss',
    reviewerRole: 'owner',
    decision: 'approve',
    reason: 'Approved after synthetic regression validation',
  });
  assert.equal(reviewedProposal.status, 'approved');

  // 4. Human Owner publishes approved proposal -> bumps version and saves rollback snapshot
  const pubRes = await memoryService.publishProposal(proposalId, 'owner', '1.0.0');
  assert.equal(pubRes.newVersion, '1.1.0');
  assert.equal(pubRes.proposal.status, 'published');
  assert.ok(pubRes.rollbackSnapshot);

  // 5. Rollback demonstration
  const rollRes = await memoryService.rollbackProposal(proposalId, 'owner', 'Formatting regression reported');
  assert.equal(rollRes.proposal.status, 'rolled_back');
});

test('ScopedMemoryIntegration: Feature Flags Bounding Control', async () => {
  const memoryService = createTestMemoryService();

  // Disable memory capture
  memoryService.setFeatureFlags({ enableMemoryCapture: false });

  await assert.rejects(
    async () => {
      await memoryService.storeScopedMemory({
        category: 'semantic_project',
        content: 'New memory test',
        actorId: 'alice',
      });
    },
    /memory capture is disabled via feature flag/
  );

  // Re-enable
  memoryService.setFeatureFlags({ enableMemoryCapture: true });
});

