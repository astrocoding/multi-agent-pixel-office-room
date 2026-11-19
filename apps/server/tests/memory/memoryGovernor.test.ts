import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryGovernor, type ScopedMemoryRecord, type MemoryAccessScope } from '@agent-office/ai';

const baseRecord: ScopedMemoryRecord = {
  id: 'mem_test_1',
  category: 'semantic_project',
  content: 'Project Alpha architectural design decisions',
  summary: 'Project Alpha architecture',
  actorId: 'alice',
  projectScope: 'project_alpha',
  tenantId: 'tenant_1',
  visibility: 'project',
  verificationState: 'observed_fact',
  confidence: 1.0,
  sourceProvenance: {},
  retentionPolicy: 'permanent',
  expiresAt: null,
  supersededBy: null,
  deletedAt: null,
  metadata: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

test('MemoryGovernor: Cross-Tenant Isolation', () => {
  const scopeTenant1: MemoryAccessScope = {
    actorId: 'alice',
    projectScope: 'project_alpha',
    tenantId: 'tenant_1',
    role: 'member',
  };

  const scopeTenant2: MemoryAccessScope = {
    actorId: 'bob',
    projectScope: 'project_alpha',
    tenantId: 'tenant_2',
    role: 'owner',
  };

  assert.equal(MemoryGovernor.isReadAuthorized(baseRecord, scopeTenant1), true);
  // Bob from tenant_2 must NEVER be able to read tenant_1 records, even if Bob is an owner in tenant_2
  assert.equal(MemoryGovernor.isReadAuthorized(baseRecord, scopeTenant2), false);
});

test('MemoryGovernor: Cross-User Private Memory Isolation', () => {
  const privateRecord: ScopedMemoryRecord = {
    ...baseRecord,
    id: 'mem_priv_1',
    actorId: 'alice',
    visibility: 'private',
  };

  const aliceScope: MemoryAccessScope = {
    actorId: 'alice',
    projectScope: 'project_alpha',
    tenantId: 'tenant_1',
    role: 'member',
  };

  const bobScope: MemoryAccessScope = {
    actorId: 'bob',
    projectScope: 'project_alpha',
    tenantId: 'tenant_1',
    role: 'member',
  };

  assert.equal(MemoryGovernor.isReadAuthorized(privateRecord, aliceScope), true);
  assert.equal(MemoryGovernor.isReadAuthorized(privateRecord, bobScope), false);
});

test('MemoryGovernor: Role-Based Write Restrictions', () => {
  const guestScope: MemoryAccessScope = {
    actorId: 'charlie',
    projectScope: 'project_alpha',
    tenantId: 'tenant_1',
    role: 'guest',
  };

  const memberScope: MemoryAccessScope = {
    actorId: 'bob',
    projectScope: 'project_alpha',
    tenantId: 'tenant_1',
    role: 'member',
  };

  const ownerScope: MemoryAccessScope = {
    actorId: 'alice',
    projectScope: 'project_alpha',
    tenantId: 'tenant_1',
    role: 'owner',
  };

  // Guest cannot write any memory
  assert.equal(MemoryGovernor.isWriteAuthorized('semantic_project', 'project', guestScope), false);

  // Member cannot write procedural memory (skills/SOPs)
  assert.equal(MemoryGovernor.isWriteAuthorized('procedural', 'internal', memberScope), false);
  assert.equal(MemoryGovernor.isWriteAuthorized('episodic', 'project', memberScope), true);

  // Owner can write procedural memory
  assert.equal(MemoryGovernor.isWriteAuthorized('procedural', 'internal', ownerScope), true);
});

test('MemoryGovernor: Non-Promotion Invariant (AI cannot self-promote to verified_truth)', () => {
  const agentScope: MemoryAccessScope = {
    actorId: 'agent_qa_critic',
    projectScope: 'project_alpha',
    tenantId: 'tenant_1',
    role: 'member',
  };

  const ownerScope: MemoryAccessScope = {
    actorId: 'boss',
    projectScope: 'project_alpha',
    tenantId: 'tenant_1',
    role: 'owner',
  };

  // Automated agent requesting verified_truth must be downgraded to model_inference
  const agentState = MemoryGovernor.enforceVerificationState('verified_truth', agentScope, true);
  assert.equal(agentState, 'model_inference');

  // Human owner can explicitly set verified_truth
  const ownerState = MemoryGovernor.enforceVerificationState('verified_truth', ownerScope, false);
  assert.equal(ownerState, 'verified_truth');
});

test('MemoryGovernor: Retention Policy and Expiration Checks', () => {
  const now = Date.now();

  const sessionExp = MemoryGovernor.computeExpiration('session', now);
  assert.ok(sessionExp);
  assert.ok(new Date(sessionExp).getTime() > now);

  const thirtyDaysExp = MemoryGovernor.computeExpiration('30_days', now);
  assert.ok(thirtyDaysExp);

  const permanentExp = MemoryGovernor.computeExpiration('permanent', now);
  assert.equal(permanentExp, null);

  // Expired record check
  const expiredRecord: ScopedMemoryRecord = {
    ...baseRecord,
    expiresAt: new Date(now - 1000).toISOString(), // expired 1 sec ago
  };

  const scope: MemoryAccessScope = {
    actorId: 'alice',
    projectScope: 'project_alpha',
    tenantId: 'tenant_1',
    role: 'owner',
  };

  assert.equal(MemoryGovernor.isReadAuthorized(expiredRecord, scope), false);

  // Soft-deleted record check
  const deletedRecord: ScopedMemoryRecord = {
    ...baseRecord,
    deletedAt: new Date(now - 1000).toISOString(),
  };
  assert.equal(MemoryGovernor.isReadAuthorized(deletedRecord, scope), false);
});

