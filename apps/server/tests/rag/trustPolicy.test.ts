import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SkillTrustPolicy,
  SkillRegistryService,
  type SkillMetadata,
} from '@agent-office/ai';

describe('Skill Trust and Approval Policy (Phase 1)', () => {
  const sampleProposedSkill: SkillMetadata = {
    skillId: 'unreviewed_tool',
    name: 'Unreviewed Tool Procedure',
    description: 'A newly added skill that has not been approved',
    canonicalPath: '/workspace/skills/unreviewed_tool/SKILL.md',
    entrypoint: 'skills/unreviewed_tool/SKILL.md',
    references: [],
    triggers: ['deploy', 'execute'],
    roles: ['engineering'],
    languages: ['id', 'en'],
    sourceTrust: 'unreviewed_proposal',
    status: 'proposed',
    approvedBy: null,
    version: '1.0.0',
    contentHash: 'hash123',
    activeVersion: '1.0.0',
    scope: 'office',
    owner: 'system',
    metadata: {},
  };

  const sampleApprovedSkill: SkillMetadata = {
    ...sampleProposedSkill,
    skillId: 'humanizer',
    name: 'Agent Office Room Humanizer',
    sourceTrust: 'approved_local_skill',
    status: 'approved',
    approvedBy: 'admin_user',
  };

  it('evaluates initial trust of newly discovered skills as proposed', () => {
    const trust = SkillTrustPolicy.evaluateInitialTrust('/workspace/skills/test/SKILL.md', false);
    assert.strictEqual(trust.status, 'proposed');
    assert.strictEqual(trust.sourceTrust, 'unreviewed_proposal');
    assert.strictEqual(trust.approvedBy, null);
  });

  it('correctly reports approval status', () => {
    assert.strictEqual(SkillTrustPolicy.isSkillApproved(sampleProposedSkill), false);
    assert.strictEqual(SkillTrustPolicy.isSkillApproved(sampleApprovedSkill), true);
  });

  it('forbids execution of unapproved skills as procedural instructions', () => {
    assert.strictEqual(SkillTrustPolicy.canExecuteAsProcedure(sampleProposedSkill), false);
    assert.strictEqual(SkillTrustPolicy.canExecuteAsProcedure(sampleApprovedSkill), true);
  });

  it('throws a SecurityError when attempting to assert procedure on unapproved skill', () => {
    assert.throws(
      () => {
        SkillTrustPolicy.assertCanExecuteAsProcedure(sampleProposedSkill);
      },
      (err: Error) => {
        return (
          err.message.includes('SecurityPolicy') &&
          err.message.includes('unreviewed_tool') &&
          err.message.includes('Requires explicit approval')
        );
      }
    );

    assert.doesNotThrow(() => {
      SkillTrustPolicy.assertCanExecuteAsProcedure(sampleApprovedSkill);
    });
  });

  it('filters candidate skills excluding unapproved skills by default', () => {
    const candidates = [sampleProposedSkill, sampleApprovedSkill];

    const matched = SkillRegistryService.filterCandidateSkills(candidates, {
      intent: 'Please write a natural response using humanizer',
    });

    // Only approved skill should be returned
    assert.strictEqual(matched.length, 1);
    assert.strictEqual(matched[0].skillId, 'humanizer');
  });

  it('can explicitly query proposed skills when status is requested for review', () => {
    const candidates = [sampleProposedSkill, sampleApprovedSkill];

    const matched = SkillRegistryService.filterCandidateSkills(candidates, {
      status: 'proposed',
      intent: 'deploy',
    });

    assert.strictEqual(matched.length, 1);
    assert.strictEqual(matched[0].skillId, 'unreviewed_tool');
  });
});

