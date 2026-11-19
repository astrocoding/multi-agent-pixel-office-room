import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ComplexityCalculator,
  RiskEvaluator,
  AnalysisDepthSelector,
  ClarificationEvaluator,
  TeamAdmissionPolicy,
} from '@agent-office/ai';
import { AGENT_IDS } from '@agent-office/shared';

test('PHASE O1: ComplexityCalculator - Deterministic Weighted Scoring (0..100)', () => {
  // 1. Minimum vector (all 0s)
  const minVector = { S: 0, D: 0, I: 0, U: 0, V: 0, C: 0 };
  const minRes = ComplexityCalculator.calculate(minVector);
  assert.equal(minRes.score, 0);
  assert.equal(minRes.tier, 'low');
  assert.equal(minRes.isFullyAssessed, true);

  // 2. Maximum vector (all 4s)
  const maxVector = { S: 4, D: 4, I: 4, U: 4, V: 4, C: 4 };
  const maxRes = ComplexityCalculator.calculate(maxVector);
  assert.equal(maxRes.score, 100);
  assert.equal(maxRes.tier, 'very_high');
  assert.equal(maxRes.isFullyAssessed, true);

  // 3. Mid vector (all 2s)
  const midVector = { S: 2, D: 2, I: 2, U: 2, V: 2, C: 2 };
  const midRes = ComplexityCalculator.calculate(midVector);
  assert.equal(midRes.score, 50);
  assert.equal(midRes.tier, 'moderate');
  assert.equal(midRes.isFullyAssessed, true);

  // 4. Low-tier vector (S: 1, D: 0, I: 0, U: 1, V: 0, C: 0) -> 25 * (0.2*1 + 0.2*1) = 10
  const lowVector = { S: 1, D: 0, I: 0, U: 1, V: 0, C: 0 };
  const lowRes = ComplexityCalculator.calculate(lowVector);
  assert.equal(lowRes.score, 10);
  assert.equal(lowRes.tier, 'low');
});

test('PHASE O1: ComplexityCalculator - Interval Calculation on Unknown / Null Dimensions', () => {
  // S: 2 (0.4), D: null (unknown), I: 0, U: null (unknown), V: 1 (0.15), C: 0
  // Known weight sum = 0.2*2 + 0.15*1 = 0.55 -> score 13.75
  // Unknown weights: D (0.2), U (0.2) -> sum = 0.4
  // Min score = 25 * 0.55 = 13.75
  // Max score = 25 * (0.55 + 0.4*4) = 25 * (0.55 + 1.6) = 25 * 2.15 = 53.75
  const partialVector = { S: 2, D: null, I: 0, U: null, V: 1, C: 0 };
  const res = ComplexityCalculator.calculate(partialVector);

  assert.equal(res.score, null, 'Score must be null when dimensions are unknown');
  assert.ok(res.scoreRange, 'Must provide an interval [min, max]');
  assert.equal(res.scoreRange[0], 13.75);
  assert.equal(res.scoreRange[1], 53.75);
  assert.equal(res.isFullyAssessed, false);
  assert.equal(res.knownDimensionsCount, 4);
});

test('PHASE O1: RiskEvaluator - Risk Tiers & High-Risk Precedence (Fails Closed)', () => {
  // 1. R4 Prohibited: System file access or unauthorized deletion
  const r4Res = RiskEvaluator.evaluate({
    action: 'cat /etc/shadow',
    resource: 'system_credentials',
    environment: 'production',
    actorRole: 'member',
  });
  assert.equal(r4Res.tier, 'R4');
  assert.equal(r4Res.isForbidden, true);

  // 2. R3 Sensitive: Production deployment, dropping database tables
  const r3Res = RiskEvaluator.evaluate({
    action: 'deploy_service to production',
    resource: 'k8s_cluster',
    environment: 'production',
    actorRole: 'member',
  });
  assert.equal(r3Res.tier, 'R3');
  assert.equal(r3Res.requiresOwnerApproval, true);
  assert.ok(r3Res.approvalReason?.includes('Owner authorization'));

  const r3Drop = RiskEvaluator.evaluate({
    action: 'DROP TABLE users;',
    resource: 'database',
    environment: 'local',
    actorRole: 'owner',
  });
  assert.equal(r3Drop.tier, 'R3');
  assert.equal(r3Drop.requiresOwnerApproval, true);

  // 3. R2 Controlled-Write: Local code edits
  const r2Res = RiskEvaluator.evaluate({
    action: 'write code patch to src/index.ts',
    resource: 'src/index.ts',
    environment: 'local',
    actorRole: 'member',
  });
  assert.equal(r2Res.tier, 'R2');
  assert.equal(r2Res.requiresOwnerApproval, false);

  // 4. R0 Informational: Read-only search
  const r0Res = RiskEvaluator.evaluate({
    action: 'read documentation and summarize',
    resource: 'docs/README.md',
    environment: 'local',
    actorRole: 'guest',
  });
  assert.equal(r0Res.tier, 'R0');
  assert.equal(r0Res.requiresOwnerApproval, false);
});

test('PHASE O1: AnalysisDepthSelector - Adaptive Tier Matching', () => {
  assert.equal(AnalysisDepthSelector.select('low', 'R0', false), 'D0');
  assert.equal(AnalysisDepthSelector.select('standard', 'R1', false), 'D1');
  assert.equal(AnalysisDepthSelector.select('moderate', 'R2', false), 'D2');
  assert.equal(AnalysisDepthSelector.select('high', 'R2', false), 'D3');
  assert.equal(AnalysisDepthSelector.select('very_high', 'R2', false), 'D4');

  // High risk (R3/R4) always escalates to D4
  assert.equal(AnalysisDepthSelector.select('low', 'R3', false), 'D4');
  // Material ambiguity escalates to D3 for structured clarification
  assert.equal(AnalysisDepthSelector.select('standard', 'R1', true), 'D3');
});

test('PHASE O1: ClarificationEvaluator - Next.js Fullstack & Ambiguity Gate (No Invented DB)', () => {
  // 1. Unspecified Next.js fullstack request
  const nextjsPrompt = 'Tolong buatkan aplikasi full-stack Web Next.js FE dan API';
  const cRes = ClarificationEvaluator.evaluate(nextjsPrompt);

  assert.equal(cRes.hasBlockingAmbiguity, true);
  assert.equal(cRes.type, 'BLOCKING');
  assert.equal(cRes.items.length, 2);

  const dbQuestion = cRes.items[0];
  assert.ok(dbQuestion.question.includes('database'));
  assert.equal(dbQuestion.options.length, 3);
  // Option 1: Stateless / No DB is recommended default
  assert.equal(dbQuestion.options[0].id, 'no_db');
  assert.equal(dbQuestion.options[0].isRecommended, true);
  // Counter-sycophantic disclosure of trade-offs:
  assert.ok(dbQuestion.options[2].tradeoffs.includes('Hindari memilih NoSQL hanya karena mitos'));

  // 2. Vague one-word input
  const vagueRes = ClarificationEvaluator.evaluate('tolong');
  assert.equal(vagueRes.hasBlockingAmbiguity, true);
  assert.equal(vagueRes.type, 'BLOCKING');

  // 3. Fully specified input with explicit stateless API
  const specifiedPrompt = 'Buat endpoint Express stateless tanpa database untuk convert timestamp';
  const specifiedRes = ClarificationEvaluator.evaluate(specifiedPrompt);
  assert.equal(specifiedRes.hasBlockingAmbiguity, false);
});

test('PHASE O1: TeamAdmissionPolicy - Smallest Sufficient Team Invariant (No All-Specialists Auto-Swarm)', () => {
  // 1. Low complexity -> Zen Solo
  const lowTeam = TeamAdmissionPolicy.selectTeam('low', [AGENT_IDS.ENGINEERING], 'R1');
  assert.deepEqual(lowTeam.selectedTeam, [AGENT_IDS.LEADER]);
  assert.ok(lowTeam.rationale.includes('Zen solo'));

  // 2. Standard complexity -> Zen + 1 Specialist
  const stdTeam = TeamAdmissionPolicy.selectTeam('standard', [AGENT_IDS.RESEARCH], 'R1');
  assert.deepEqual(stdTeam.selectedTeam, [AGENT_IDS.LEADER, AGENT_IDS.RESEARCH]);

  // 3. Moderate/High complexity -> Targeted team (max 3)
  const highTeam = TeamAdmissionPolicy.selectTeam('high', [AGENT_IDS.ENGINEERING, AGENT_IDS.AUTOMATION], 'R2');
  assert.ok(highTeam.selectedTeam.includes(AGENT_IDS.LEADER));
  assert.ok(highTeam.selectedTeam.includes(AGENT_IDS.ENGINEERING));
  assert.ok(highTeam.selectedTeam.length <= 3);

  // 4. Invariant: 'All Specialists Swarm' is ALWAYS rejected
  const allCandidate = lowTeam.rejectedCandidates.find((c) => c.teamName.includes('All Specialists'));
  assert.ok(allCandidate, 'All specialists candidate must be identified');
  assert.equal(allCandidate.isEligible, false, 'All specialists candidate must NEVER be eligible');
});

