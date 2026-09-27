import { StateGraph, END, START } from '@langchain/langgraph';
import type { Task, AgentId, ToolExecutionRecord, ClarificationRequest } from '@agent-office/shared';
import { ROOM_EVENTS } from '@agent-office/shared';
import { DbQueries } from '../db/queries.js';
import type { SocketServerBridge } from '../socket/socketServer.js';
import type {
  LeaderAgent,
  ResearchAgent,
  EngineeringAgent,
  AutomationAgent,
  QaAgent,
  MemoryAgent,
} from '../agents/specialists.js';
import type { MemoryService } from '../memory/memoryService.js';
import { WorkspaceFsTools } from '../tools/index.js';

export interface WorkflowAgentRegistry {
  leader: LeaderAgent;
  research: ResearchAgent;
  engineering: EngineeringAgent;
  automation: AutomationAgent;
  qa: QaAgent;
  memory: MemoryAgent;
  memoryService: MemoryService;
  socketBridge: SocketServerBridge;
}

export class OfficeWorkflowOrchestrator {
  private registry: WorkflowAgentRegistry;

  constructor(registry: WorkflowAgentRegistry) {
    this.registry = registry;
  }

  public async runTask(task: Task): Promise<Task> {
    const { leader, research, engineering, automation, qa, memory, memoryService, socketBridge } = this.registry;

    try {
      // 1. Mark queued -> analyzing
      await DbQueries.updateTaskStatus(task.id, 'analyzing');
      task.status = 'analyzing';
      socketBridge.broadcastTaskUpdated(task);

      // 2. Fetch relevant historical context & past learnings from pgvector
      const pastMemories = await memoryService.retrieveRelevant(task.title, { limit: 3 });
      const memorySnippets = pastMemories.map((m) => `[Prior Knowledge]: ${m.content}`);

      // Node 1: Leader Plans & Evaluates Intent
      await leader.setStatus('thinking', 'Evaluating directive, scoping constraints, and formulating roadmap...', task.id);
      const plan = await leader.planTask(
        task.title,
        task.description,
        task.attachments || [],
        memorySnippets
      );

      // Check if task needs Boss clarification or confirmation
      if (plan.clarificationNeeded && plan.clarificationQuestion) {
        const clarReq: ClarificationRequest = {
          taskId: task.id,
          question: plan.clarificationQuestion,
          options:
            Array.isArray(plan.clarificationOptions) && plan.clarificationOptions.length > 0
              ? plan.clarificationOptions
              : ['Option A: Minimal prototype in ~/Projects', 'Option B: Standard workspace artifact'],
          context: task.description,
        };

        task.status = 'waiting_approval';
        task.clarification = clarReq;
        await DbQueries.updateTaskStatus(task.id, 'waiting_approval', { clarification: clarReq });
        socketBridge.broadcastTaskUpdated(task);
        socketBridge.broadcastClarificationNeeded(clarReq);

        await leader.setStatus('consulting', `Awaiting Boss clarification: "${plan.clarificationQuestion}"`, task.id);
        await leader.emitBubble(`Boss, please clarify: ${plan.clarificationQuestion}`, 5000, 'thought');

        socketBridge.broadcastChat({
          id: `chat_${Date.now()}`,
          sender: 'agent_leader',
          senderName: 'Zen (Leader)',
          text: `Boss, before the team begins executing: ${plan.clarificationQuestion}${clarReq.options?.length ? `\nOptions: ${clarReq.options.join(' | ')}` : ''}`,
          taskId: task.id,
          timestamp: new Date().toISOString(),
          type: 'dialogue',
        });

        return task;
      }

      // Node 2: Roadmap Planning Confirmed
      const validSteps = Array.isArray(plan.steps) && plan.steps.length > 0 ? plan.steps : [];
      task.plan = {
        steps: validSteps.map((s) => ({
          stepIndex: s.stepIndex,
          assignedTo: s.assignedTo as AgentId,
          objective: s.objective,
          status: 'pending',
        })),
      };

      await DbQueries.updateTaskStatus(task.id, 'planned', null, task.plan);
      task.status = 'planned';
      socketBridge.broadcastTaskUpdated(task);

      // Node 3: Specialist Execution Pipeline
      await DbQueries.updateTaskStatus(task.id, 'in_progress', null, task.plan);
      task.status = 'in_progress';
      socketBridge.broadcastTaskUpdated(task);

      const stepResults: { specialist: string; output: string }[] = [];
      const executionLogs: ToolExecutionRecord[] = [];

      for (const step of validSteps) {
        const stepIdx = task.plan.steps.findIndex((s) => s.stepIndex === step.stepIndex);
        if (stepIdx !== -1) {
          task.plan.steps[stepIdx].status = 'in_progress';
          socketBridge.broadcastTaskUpdated(task);
        }

        let specialistOutput = '';

        if (step.assignedTo === 'agent_research') {
          const res = await research.execute({ task });
          specialistOutput = res.output;
        } else if (step.assignedTo === 'agent_engineering') {
          const res = await engineering.execute({
            task,
            previousOutputs: { previousSteps: stepResults },
          });
          specialistOutput = res.output;
        } else if (step.assignedTo === 'agent_automation') {
          const res = await automation.execute({
            task,
            previousOutputs: { previousSteps: stepResults },
          });
          specialistOutput = res.output;
        } else if (step.assignedTo === 'agent_qa') {
          const res = await qa.execute({
            task,
            previousOutputs: { previousSteps: stepResults },
          });
          specialistOutput = res.output;
        } else {
          specialistOutput = `Execution step completed for objective: ${step.objective}`;
        }

        stepResults.push({ specialist: step.assignedTo, output: specialistOutput });

        if (stepIdx !== -1) {
          task.plan.steps[stepIdx].status = 'completed';
          task.plan.steps[stepIdx].result = specialistOutput.slice(0, 160) + '...';
          socketBridge.broadcastTaskUpdated(task);
        }
      }

      // Node 4: QA Rigorous Audit
      await DbQueries.updateTaskStatus(task.id, 'reviewing', null, task.plan);
      task.status = 'reviewing';
      socketBridge.broadcastTaskUpdated(task);

      const qaRes = await qa.execute({
        task,
        previousOutputs: { stepResults },
      });

      // Node 5: Leader Synthesizes Deliverables
      const finalReport = await leader.synthesizeResults(task.title, stepResults, executionLogs);

      // Node 6: Memory & Knowledge Persistence
      await memory.execute({
        task,
        previousOutputs: { finalReport, qaVerdict: qaRes.output },
      });

      // Finalize task status
      task.status = 'completed';
      task.outputPayload = {
        finalDeliverable: finalReport,
        qaVerdict: qaRes.success ? 'APPROVED' : 'CONDITIONAL_PASS',
        stepResults,
        workspaceRoot: WorkspaceFsTools.getWorkspaceRoot(),
      };

      await DbQueries.updateTaskStatus(task.id, 'completed', task.outputPayload, task.plan);
      socketBridge.broadcastTaskUpdated(task);

      // Send final chat message to Boss
      socketBridge.broadcastChat({
        id: `chat_${Date.now()}`,
        sender: 'agent_leader',
        senderName: 'Zen (Leader)',
        text: `Boss, task "${task.title}" has been successfully executed and all project files have been generated in your workspace! Check the Task Panel for full deliverable breakdown.`,
        taskId: task.id,
        timestamp: new Date().toISOString(),
        type: 'dialogue',
      });

      // Reset agents to idle
      await leader.setStatus('idle', 'Awaiting next instructions from Boss.');
      await research.setStatus('idle');
      await engineering.setStatus('idle');
      await automation.setStatus('idle');
      await qa.setStatus('idle');
      await memory.setStatus('idle');

      return task;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Orchestrator] Task ${task.id} execution failed:`, errorMsg);

      task.status = 'failed';
      task.outputPayload = {
        error: errorMsg,
        finalDeliverable: `Task execution failed: ${errorMsg}\n\nPlease review technical directives and try re-dispatching.`,
        qaVerdict: 'FAILED',
      };

      await DbQueries.updateTaskStatus(task.id, 'failed', task.outputPayload, task.plan);
      socketBridge.broadcastTaskUpdated(task);

      await leader.setStatus('idle', `Halted: ${errorMsg.slice(0, 30)}`);
      await leader.emitBubble(`Task execution halted due to error: ${errorMsg.slice(0, 45)}`, 4000, 'alert');
      await research.setStatus('idle');
      await engineering.setStatus('idle');
      await automation.setStatus('idle');
      await qa.setStatus('idle');
      await memory.setStatus('idle');

      socketBridge.broadcastChat({
        id: `chat_${Date.now()}`,
        sender: 'agent_leader',
        senderName: 'Zen (Leader)',
        text: `Boss, task "${task.title}" could not complete: ${errorMsg}. All specialist agents are back to idle.`,
        taskId: task.id,
        timestamp: new Date().toISOString(),
        type: 'dialogue',
      });

      return task;
    }
  }

  /**
   * Resumes a paused task after the Boss provides clarification.
   */
  public async resumeWithClarification(taskId: string, clarificationResponse: string): Promise<void> {
    const task = await DbQueries.getTaskById(taskId);
    if (!task) return;

    task.description += `\n\n[Boss Clarification]: ${clarificationResponse}`;
    task.clarification = null;

    this.runTask(task).catch((err) => {
      console.error('[Orchestrator] Resume task failed:', err);
    });
  }
}
