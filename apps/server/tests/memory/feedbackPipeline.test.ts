import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedbackPipeline, type FeedbackRecord } from '@agent-office/ai';

test('FeedbackPipeline: Idempotency Key Handling', () => {
  const input = {
    idempotencyKey: 'idemp_key_12345',
    taskId: 'task_001',
    actorId: 'boss',
    feedbackType: 'user_rejection' as const,
    targetType: 'skill' as const,
    targetIdentifier: 'humanizer',
    details: 'Tone in academic register was too informal',
  };

  const fb1 = FeedbackPipeline.createFeedbackRecord(input);
  assert.equal(fb1.idempotencyKey, 'idemp_key_12345');
  assert.equal(fb1.rating, -1);
  assert.equal(fb1.processed, false);
});

test('FeedbackPipeline: Negative Feedback Creates a Proposal (No direct skill mutation!)', () => {
  const fb: FeedbackRecord = {
    id: 'fb_test_1',
    idempotencyKey: 'key_1',
    taskId: 'task_001',
    actorId: 'boss',
    projectScope: 'default',
    feedbackType: 'failed_test',
    targetType: 'skill',
    targetIdentifier: 'humanizer',
    rating: -1,
    details: 'Test failed: emoji detected in Telegram output',
    evidence: { error: 'EmojiFound: 🚀' },
    processed: false,
    createdAt: new Date().toISOString(),
  };

  const proposal = FeedbackPipeline.generateProposalFromFeedback({
    feedback: fb,
    targetSkillId: 'humanizer',
    proposalType: 'instruction_refinement',
    title: 'Strictly enforce emoji removal for Telegram channels',
    description: 'Ensure unicode regex covers all emoji ranges',
    beforeDiff: '// previous regex',
    afterDiff: '// improved unicode regex',
    currentProposalsForTask: 0,
  });

  assert.ok(proposal, 'Should generate proposal');
  assert.equal(proposal.status, 'pending_review', 'New proposal must be in pending_review status');
  assert.equal(proposal.targetSkillId, 'humanizer');
  assert.ok(proposal.justification.includes('fb_test_1'));
  assert.equal(proposal.securityAuditStatus, 'passed');
});

test('FeedbackPipeline: AI Agents CANNOT Self-Approve Proposals (Owner-Only Rule)', () => {
  const fb: FeedbackRecord = {
    id: 'fb_test_2',
    idempotencyKey: 'key_2',
    actorId: 'boss',
    projectScope: 'default',
    feedbackType: 'execution_error',
    targetType: 'skill',
    targetIdentifier: 'humanizer',
    rating: -1,
    details: 'Instruction issue',
    evidence: {},
    processed: false,
    createdAt: new Date().toISOString(),
  };

  const proposal = FeedbackPipeline.generateProposalFromFeedback({
    feedback: fb,
    targetSkillId: 'humanizer',
    proposalType: 'instruction_refinement',
    title: 'Fix typo',
    description: 'Fix typo',
    beforeDiff: 'a',
    afterDiff: 'b',
  })!;

  // 1. AI Agent (e.g. Zen / Rai) tries to approve -> MUST THROW ERROR
  assert.throws(
    () => {
      FeedbackPipeline.reviewProposal(proposal, {
        proposalId: proposal.id,
        reviewerId: 'agent_leader',
        reviewerRole: 'agent',
        decision: 'approve',
        reason: 'Agent self-approval attempt',
      });
    },
    /Unauthorized: Only human OWNER is authorized/
  );

  // 2. Human Owner approves -> SUCCEEDS
  const approved = FeedbackPipeline.reviewProposal(proposal, {
    proposalId: proposal.id,
    reviewerId: 'boss',
    reviewerRole: 'owner',
    decision: 'approve',
    reason: 'Approved after verification of test cases',
  });

  assert.equal(approved.status, 'approved');
  assert.equal(approved.reviewedBy, 'boss');
});

test('FeedbackPipeline: Versioned Publication and Rollback', () => {
  const fb: FeedbackRecord = {
    id: 'fb_test_3',
    idempotencyKey: 'key_3',
    actorId: 'boss',
    projectScope: 'default',
    feedbackType: 'explicit_correction',
    targetType: 'skill',
    targetIdentifier: 'humanizer',
    rating: -1,
    details: 'Refined guidelines',
    evidence: {},
    processed: false,
    createdAt: new Date().toISOString(),
  };

  const proposal = FeedbackPipeline.generateProposalFromFeedback({
    feedback: fb,
    targetSkillId: 'humanizer',
    proposalType: 'instruction_refinement',
    title: 'Guideline refinement',
    description: 'Update humanizer',
    beforeDiff: 'v1 guidelines',
    afterDiff: 'v2 guidelines',
  })!;

  // Cannot publish unapproved proposal
  assert.throws(
    () => {
      FeedbackPipeline.publishProposal(proposal, 'owner', '1.0.0');
    },
    /Cannot publish proposal in status 'pending_review'/
  );

  // Approve first
  const approved = FeedbackPipeline.reviewProposal(proposal, {
    proposalId: proposal.id,
    reviewerId: 'boss',
    reviewerRole: 'owner',
    decision: 'approve',
    reason: 'Approved',
  });

  // Publish
  const pubRes = FeedbackPipeline.publishProposal(approved, 'owner', '1.0.0');
  assert.equal(pubRes.newVersion, '1.1.0');
  assert.equal(pubRes.updatedProposal.status, 'published');
  assert.equal(pubRes.rollbackSnapshot.content, 'v1 guidelines');

  // Rollback
  const rollRes = FeedbackPipeline.rollbackProposal(
    pubRes.updatedProposal,
    'owner',
    'Unexpected formatting regression discovered'
  );

  assert.equal(rollRes.rolledBackProposal.status, 'rolled_back');
  assert.equal(rollRes.restoredContent, 'v1 guidelines');
});

test('FeedbackPipeline: Loop Limits (Max 2 proposals per task)', () => {
  const fb: FeedbackRecord = {
    id: 'fb_test_4',
    idempotencyKey: 'key_4',
    taskId: 'task_009',
    actorId: 'boss',
    projectScope: 'default',
    feedbackType: 'failed_test',
    targetType: 'skill',
    targetIdentifier: 'humanizer',
    rating: -1,
    details: 'Error',
    evidence: {},
    processed: false,
    createdAt: new Date().toISOString(),
  };

  // When task already has 2 proposals, 3rd proposal is rejected / returns null
  const proposal3 = FeedbackPipeline.generateProposalFromFeedback({
    feedback: fb,
    targetSkillId: 'humanizer',
    proposalType: 'instruction_refinement',
    title: 'Fix',
    description: 'Fix',
    beforeDiff: 'a',
    afterDiff: 'b',
    currentProposalsForTask: 2,
  });

  assert.equal(proposal3, null, 'Must enforce finite loop limit of max 2 proposals per task');
});

