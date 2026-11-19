import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Task, AgentId } from '@agent-office/shared';
import { AGENT_IDS } from '@agent-office/shared';
import { OfficeWorkflowGraphBuilder } from '../../src/graph/officeWorkflowGraph.js';
import { OfficeWorkflowOrchestrator, type WorkflowAgentRegistry } from '../../src/graph/workflow.js';
import { DbQueries } from '../../src/db/queries.js';

function createMockWorkflowRegistry() {
  const broadcasts: any[] = [];
  const statusUpdates: any[] = [];

  const mockAgent = (name: string) => ({
    setStatus: async (st: string, msg?: string, tid?: string) => {
      statusUpdates.push({ agent: name, status: st, message: msg, taskId: tid });
    },
    emitBubble: async (text: string) => {},
    execute: async (ctx: any) => ({
      success: true,
      output: `${name} executed successfully for "${ctx.task?.title || 'task'}"`,
    }),
  });

  const leader = {
    ...mockAgent('leader'),
    planTask: async (title: string, desc: string, atts: any[], snippets: string[]) => ({
      clarificationNeeded: false,
      steps: [
        { stepIndex: 1, assignedTo: AGENT_IDS.ENGINEERING, objective: 'Implement core functionality' },
        { stepIndex: 2, assignedTo: AGENT_IDS.QA, objective: 'Audit and verify quality' },
      ],
    }),
    synthesizeResults: async (title: string, results: any[]) =>
      `Synthesized deliverable for "${title}" with ${results.length} specialist results.`,
  };

  const research = mockAgent('research');
  const engineering = mockAgent('engineering');
  const automation = mockAgent('automation');
  const qa = mockAgent('qa');
  const memory = mockAgent('memory');

  const socketBridge = {
    broadcastTaskUpdated: (t: any) => broadcasts.push({ event: 'task_updated', data: t }),
    broadcastClarificationNeeded: (c: any) => broadcasts.push({ event: 'clarification_needed', data: c }),
    broadcastChat: (ch: any) => broadcasts.push({ event: 'chat', data: ch }),
    broadcastSystemNotification: (lvl: string, m: string) =>
      broadcasts.push({ event: 'notification', level: lvl, message: m }),
  };

  const memoryService = {
    retrieveRelevant: async () => [],
    saveObservation: async () => {},
  };

  const registry: WorkflowAgentRegistry = {
    leader: leader as any,
    research: research as any,
    engineering: engineering as any,
    automation: automation as any,
    qa: qa as any,
    memory: memory as any,
    memoryService: memoryService as any,
    socketBridge: socketBridge as any,
  };

  return { registry, broadcasts, statusUpdates };
}

test('OfficeWorkflowGraph: Full End-to-End Orchestration', async () => {
  const { registry, broadcasts } = createMockWorkflowRegistry();
  const orchestrator = new OfficeWorkflowOrchestrator(registry);

  const taskId = `task_e2e_${Date.now()}`;
  const task: Task = {
    id: taskId,
    title: 'Implement RESTful API endpoints for user profiles',
    description: 'Create user registration and profile lookup endpoints using Express and TypeScript.',
    status: 'queued',
    assignedAgentId: AGENT_IDS.LEADER,
    attachments: [],
    inputPayload: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const completed = await orchestrator.runTask(task);

  assert.equal(completed.status, 'completed');
  assert.ok(completed.outputPayload?.finalDeliverable);
  assert.equal(completed.outputPayload?.qaVerdict, 'APPROVED');
  assert.ok(Array.isArray(completed.outputPayload?.stepResults));
  assert.equal(completed.outputPayload?.stepResults.length, 2);

  // Assert Socket.IO broadcasts occurred
  const updateEvents = broadcasts.filter((b) => b.event === 'task_updated');
  assert.ok(updateEvents.length >= 2, 'Should broadcast task updates during lifecycle');
  const chatEvents = broadcasts.filter((b) => b.event === 'chat');
  assert.ok(chatEvents.length >= 1, 'Should broadcast chat message on completion');
});

test('OfficeWorkflowGraph: Telegram Channel Consistency & Emoji-Free Policy', async () => {
  const { registry } = createMockWorkflowRegistry();
  const orchestrator = new OfficeWorkflowOrchestrator(registry);

  const taskId = `task_tg_${Date.now()}`;
  const task: Task = {
    id: taskId,
    title: 'Ringkasan status server',
    description: 'Tolong berikan ringkasan performa sistem untuk tim Telegram.',
    status: 'queued',
    assignedAgentId: AGENT_IDS.LEADER,
    attachments: [],
    inputPayload: { channel: 'telegram' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const completed = await orchestrator.runTask(task);

  assert.equal(completed.status, 'completed');
  const output = completed.outputPayload?.finalDeliverable as string;
  assert.ok(output);

  // Assert strictly no emoji
  const hasEmoji = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u.test(output);
  assert.equal(hasEmoji, false, 'Telegram output must strictly contain no emojis');
});

test('OfficeWorkflowGraph: Sensitive Action Triggers Owner Approval Interrupt & Resume Flow', async () => {
  const { registry } = createMockWorkflowRegistry();
  const orchestrator = new OfficeWorkflowOrchestrator(registry);

  const taskId = `task_sec_${Date.now()}`;
  const task: Task = {
    id: taskId,
    title: 'Hapus direktori sistem',
    description: 'Jalankan perintah rm -rf /var/log/old_data untuk membersihkan disk.',
    status: 'queued',
    assignedAgentId: AGENT_IDS.LEADER,
    attachments: [],
    inputPayload: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Step 1: Dispatch dangerous task -> LangGraph pauses at interrupt
  const paused = await orchestrator.runTask(task);
  assert.equal(paused.status, 'waiting_approval', 'Must pause in waiting_approval status');

  // Step 2: Resume with rejection -> Should fail task safely
  const rejectTaskId = `task_sec_rej_${Date.now()}`;
  const rejectTask: Task = {
    ...task,
    id: rejectTaskId,
  };
  await orchestrator.runTask(rejectTask);
  const rejected = await orchestrator.resumeWithApproval(rejectTaskId, false, 'Dangerous deletion rejected');

  assert.ok(rejected);
  assert.equal(rejected.status, 'failed', 'Rejected approval must result in failed task status');
  assert.equal(rejected.outputPayload?.qaVerdict, 'FAILED');
});

test('OfficeWorkflowGraph: Material Ambiguity Triggers Clarification & Checkpoint Resumption', async () => {
  const { registry, broadcasts } = createMockWorkflowRegistry();
  const orchestrator = new OfficeWorkflowOrchestrator(registry);

  const taskId = `task_vague_${Date.now()}`;
  const task: Task = {
    id: taskId,
    title: 'tolong',
    description: 'tolong',
    status: 'queued',
    assignedAgentId: AGENT_IDS.LEADER,
    attachments: [],
    inputPayload: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Step 1: Dispatch vague task -> LangGraph pauses for 1 focused question
  const paused = await orchestrator.runTask(task);
  assert.equal(paused.status, 'waiting_approval');
  assert.ok(paused.clarification);
  assert.ok(paused.clarification.question);

  const clarEvents = broadcasts.filter((b) => b.event === 'clarification_needed');
  assert.equal(clarEvents.length, 1, 'Should emit exactly 1 clarification event');

  // Step 2: Resume with specific clarification response from checkpoint
  const resumed = await orchestrator.resumeWithClarification(taskId, 'Tolong buatkan endpoint profil pengguna di src/api/user.ts');

  assert.ok(resumed);
  assert.equal(resumed.status, 'completed', 'Task should complete after clarification resume');
  assert.ok(resumed.outputPayload?.finalDeliverable);
});

test('OfficeWorkflowGraph: Physical Artifact Verification on Generated File', async () => {
  const { registry } = createMockWorkflowRegistry();
  const orchestrator = new OfficeWorkflowOrchestrator(registry);

  // Pre-generate a physical test file
  const testArtifactPath = path.join(os.tmpdir(), `test_artifact_${Date.now()}.json`);
  fs.writeFileSync(testArtifactPath, JSON.stringify({ version: '1.0', ready: true }));

  const taskId = `task_art_${Date.now()}`;
  const task: Task = {
    id: taskId,
    title: `Tolong verifikasi file ${testArtifactPath}`,
    description: `Generate file ${testArtifactPath} untuk konfigurasi server`,
    status: 'queued',
    assignedAgentId: AGENT_IDS.LEADER,
    attachments: [],
    inputPayload: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const completed = await orchestrator.runTask(task);
  assert.equal(completed.status, 'completed');

  const artifactCheck = completed.outputPayload?.verifiedArtifact as {
    path: string;
    verified: boolean;
    reason?: string;
  };
  assert.ok(artifactCheck);
  assert.equal(artifactCheck.verified, true);
  assert.equal(artifactCheck.path.toLowerCase(), testArtifactPath.toLowerCase());

  fs.unlinkSync(testArtifactPath);
});
