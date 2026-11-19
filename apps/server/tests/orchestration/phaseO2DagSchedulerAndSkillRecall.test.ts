import test from 'node:test';
import assert from 'node:assert/strict';
import { DAGScheduler, SkillRecallEngine } from '@agent-office/ai';
import { AGENT_IDS, type WorkUnit } from '@agent-office/shared';

test('PHASE O2: DAGScheduler - Valid Dependency Graph & Critical Path', () => {
  const units: WorkUnit[] = [
    {
      workId: 'W1_research',
      title: 'Analyze architecture requirements',
      description: 'Research state of the art',
      outputContract: 'research_doc',
      dependsOn: [],
      eligibleCapabilities: ['research'],
      assignedAgent: AGENT_IDS.RESEARCH,
      risk: 'R0',
      allowedTools: ['file_read'],
      acceptanceCriteria: ['Document created with citations'],
      resourceLocks: [],
      estimatedTokens: 200,
      estimatedDurationMs: 1500,
      status: 'pending',
    },
    {
      workId: 'W2_code',
      title: 'Implement endpoint',
      description: 'Create Express handler',
      outputContract: 'code_patch',
      dependsOn: ['W1_research'],
      eligibleCapabilities: ['engineering'],
      assignedAgent: AGENT_IDS.ENGINEERING,
      risk: 'R2',
      allowedTools: ['file_write'],
      acceptanceCriteria: ['Handler code compiles and passes tests'],
      resourceLocks: ['file:src/routes.ts'],
      estimatedTokens: 350,
      estimatedDurationMs: 3000,
      status: 'pending',
    },
    {
      workId: 'W3_qa',
      title: 'Validate handler security',
      description: 'Run integration test',
      outputContract: 'qa_verdict',
      dependsOn: ['W2_code'],
      eligibleCapabilities: ['qa'],
      assignedAgent: AGENT_IDS.QA,
      risk: 'R1',
      allowedTools: ['execute_bash'],
      acceptanceCriteria: ['Zero vulnerabilities detected'],
      resourceLocks: [],
      estimatedTokens: 150,
      estimatedDurationMs: 1000,
      status: 'pending',
    },
  ];

  const validation = DAGScheduler.validate(units);
  assert.equal(validation.isValid, true);
  assert.equal(validation.cyclesDetected.length, 0);
  assert.equal(validation.missingDependencies.length, 0);
  assert.deepEqual(validation.criticalPath, ['W1_research', 'W2_code', 'W3_qa']);
  assert.equal(validation.totalEstimatedDurationMs, 5500);
});

test('PHASE O2: DAGScheduler - Cycle & Missing Dependency Rejection', () => {
  // Cycle between W1 and W2
  const cyclicUnits: WorkUnit[] = [
    {
      workId: 'W1',
      title: 'Task 1',
      description: 'Task 1',
      outputContract: 'doc',
      dependsOn: ['W2'],
      eligibleCapabilities: ['engineering'],
      assignedAgent: AGENT_IDS.ENGINEERING,
      risk: 'R1',
      allowedTools: [],
      acceptanceCriteria: ['done'],
      resourceLocks: [],
      estimatedTokens: 100,
      estimatedDurationMs: 1000,
      status: 'pending',
    },
    {
      workId: 'W2',
      title: 'Task 2',
      description: 'Task 2',
      outputContract: 'doc',
      dependsOn: ['W1'],
      eligibleCapabilities: ['qa'],
      assignedAgent: AGENT_IDS.QA,
      risk: 'R1',
      allowedTools: [],
      acceptanceCriteria: ['done'],
      resourceLocks: [],
      estimatedTokens: 100,
      estimatedDurationMs: 1000,
      status: 'pending',
    },
  ];

  const cycleRes = DAGScheduler.validate(cyclicUnits);
  assert.equal(cycleRes.isValid, false);
  assert.ok(cycleRes.cyclesDetected.length > 0);

  // Missing dependency W99
  const missingUnits: WorkUnit[] = [
    {
      workId: 'W1',
      title: 'Task 1',
      description: 'Task 1',
      outputContract: 'doc',
      dependsOn: ['W99_nonexistent'],
      eligibleCapabilities: ['engineering'],
      assignedAgent: AGENT_IDS.ENGINEERING,
      risk: 'R1',
      allowedTools: [],
      acceptanceCriteria: ['done'],
      resourceLocks: [],
      estimatedTokens: 100,
      estimatedDurationMs: 1000,
      status: 'pending',
    },
  ];

  const missingRes = DAGScheduler.validate(missingUnits);
  assert.equal(missingRes.isValid, false);
  assert.equal(missingRes.missingDependencies.length, 1);
  assert.equal(missingRes.missingDependencies[0].missingDep, 'W99_nonexistent');
});

test('PHASE O2: DAGScheduler - Bounded Parallelism (maxConcurrency = 3) & Resource Lock Serialization', () => {
  // 4 independent units, but W1 and W2 share exclusive lock on 'file:package.json'
  const units: WorkUnit[] = [
    {
      workId: 'W1',
      title: 'Update dependencies A',
      description: 'Edit package.json',
      outputContract: 'patch',
      dependsOn: [],
      eligibleCapabilities: ['engineering'],
      assignedAgent: AGENT_IDS.ENGINEERING,
      risk: 'R2',
      allowedTools: ['file_edit'],
      acceptanceCriteria: ['valid JSON'],
      resourceLocks: ['file:package.json'],
      estimatedTokens: 100,
      estimatedDurationMs: 1000,
      status: 'pending',
    },
    {
      workId: 'W2',
      title: 'Update dependencies B',
      description: 'Edit package.json',
      outputContract: 'patch',
      dependsOn: [],
      eligibleCapabilities: ['engineering'],
      assignedAgent: AGENT_IDS.ENGINEERING,
      risk: 'R2',
      allowedTools: ['file_edit'],
      acceptanceCriteria: ['valid JSON'],
      resourceLocks: ['file:package.json'], // SAME EXCLUSIVE LOCK!
      estimatedTokens: 100,
      estimatedDurationMs: 1000,
      status: 'pending',
    },
    {
      workId: 'W3',
      title: 'Research docs',
      description: 'Read web docs',
      outputContract: 'summary',
      dependsOn: [],
      eligibleCapabilities: ['research'],
      assignedAgent: AGENT_IDS.RESEARCH,
      risk: 'R0',
      allowedTools: ['file_read'],
      acceptanceCriteria: ['summary created'],
      resourceLocks: [],
      estimatedTokens: 100,
      estimatedDurationMs: 800,
      status: 'pending',
    },
    {
      workId: 'W4',
      title: 'Prepare test harness',
      description: 'Setup test file',
      outputContract: 'test_file',
      dependsOn: [],
      eligibleCapabilities: ['qa'],
      assignedAgent: AGENT_IDS.QA,
      risk: 'R1',
      allowedTools: ['file_write'],
      acceptanceCriteria: ['test harness ready'],
      resourceLocks: ['file:tests/unit.test.ts'],
      estimatedTokens: 100,
      estimatedDurationMs: 900,
      status: 'pending',
    },
  ];

  const { stages, conflictingLocks } = DAGScheduler.planExecutionStages(units, 3);

  // W1 and W2 must NOT be in the same stage due to shared lock on 'file:package.json'
  const stage0 = stages[0];
  const stage1 = stages[1];

  const stage0WorkIds = stage0.parallelUnits.map((u) => u.workId);
  const stage1WorkIds = stage1.parallelUnits.map((u) => u.workId);

  assert.ok(stage0WorkIds.includes('W1') || stage0WorkIds.includes('W2'));
  // If W1 is in stage 0, W2 must be in stage 1 (serialized)
  assert.equal(
    stage0WorkIds.includes('W1') && stage0WorkIds.includes('W2'),
    false,
    'Conflicting exclusive locks must be serialized across stages'
  );
  assert.ok(conflictingLocks.some((l) => l.lock === 'file:package.json'));

  // Maximum parallel units per stage must never exceed maxConcurrency (3)
  for (const s of stages) {
    assert.ok(s.parallelUnits.length <= 3, `Stage ${s.stageIndex} units ${s.parallelUnits.length} <= 3`);
  }
});

test('PHASE O2: SkillRecallEngine - High-Speed Skills Directory Access & Recall', () => {
  // 1. List skills in repository
  const skills = SkillRecallEngine.listSkills();
  assert.ok(skills.length >= 2, 'Should discover at least humanizer and adaptive-orchestration');

  const orchSkill = skills.find((s) => s.slug === 'adaptive-orchestration');
  assert.ok(orchSkill, 'adaptive-orchestration skill must be indexed');
  assert.equal(orchSkill.references.length, 5, 'Must find all 5 reference documents');

  // 2. Recall skill instructions
  const recall = SkillRecallEngine.recallSkill('adaptive-orchestration', 'primary contract');
  assert.equal(recall.found, true);
  assert.equal(recall.slug, 'adaptive-orchestration');
  assert.ok(recall.extractedGuidance.toLowerCase().includes('smallest safe, sufficient'));
  assert.equal(recall.referencedFiles.length, 5);

  // 3. Read specific reference document
  const refRead = SkillRecallEngine.readSkillReference(
    'adaptive-orchestration',
    '01_ARCHITECTURE_AND_WORKFLOW.md'
  );
  assert.equal(refRead.success, true);
  assert.ok(refRead.content.includes('Zen (Chief of Staff)'));

  // 4. Security check: Rejects path traversal attempts
  const traversalRead = SkillRecallEngine.readSkillReference(
    'adaptive-orchestration',
    '../../package.json'
  );
  assert.equal(traversalRead.success, false);
  assert.ok(traversalRead.error?.includes('Path traversal forbidden'));

  // 5. Tool definitions for LangChain / ADK / MCP
  const tools = SkillRecallEngine.getToolDefinitions();
  assert.equal(tools.length, 3);
  assert.ok(tools.some((t) => t.name === 'skill_recall'));
  assert.ok(tools.some((t) => t.name === 'skill_list'));
  assert.ok(tools.some((t) => t.name === 'skill_read_reference'));
});

