import { Command } from '@langchain/langgraph';
import type { Task, ClarificationRequest } from '@agent-office/shared';
import { AGENT_IDS } from '@agent-office/shared';
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
import { OfficeWorkflowGraphBuilder, type OfficeWorkflowState } from './officeWorkflowGraph.js';

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
  private graphBuilder: OfficeWorkflowGraphBuilder;
  private compiledGraph: ReturnType<OfficeWorkflowGraphBuilder['buildGraph']>;

  constructor(registry: WorkflowAgentRegistry) {
    this.registry = registry;
    this.graphBuilder = new OfficeWorkflowGraphBuilder(registry);
    this.compiledGraph = this.graphBuilder.buildGraph();
  }

  /**
   * Dispatches and coordinates task execution through the unified LangGraph workflow,
   * maintaining thread-bound checkpoints and supporting interrupt/resume semantics.
   */
  public async runTask(task: Task): Promise<Task> {
    const threadConfig = { configurable: { thread_id: task.id } };

    try {
      const inputState: Partial<OfficeWorkflowState> = {
        taskId: task.id,
        correlationId: task.id,
        title: task.title,
        description: task.description,
        actorId: 'boss',
        projectScope: 'default',
        channel: ((task.inputPayload?.channel as any) || 'web'),
        attachments: task.attachments || [],
        status: 'queued',
      };

      const result = await this.compiledGraph.invoke(inputState, threadConfig);
      return await this.handleGraphResult(task, result);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Orchestrator] Task ${task.id} execution failed:`, errorMsg);

      task.status = 'failed';
      task.outputPayload = {
        error: errorMsg,
        finalDeliverable: `Task execution failed: ${errorMsg}\n\nPlease review technical directives and try re-dispatching.`,
        qaVerdict: 'FAILED',
      };

      try {
        await DbQueries.updateTaskStatus(task.id, 'failed', task.outputPayload, task.plan);
      } catch {}
      this.registry.socketBridge.broadcastTaskUpdated(task);

      await this.resetSpecialistsIdle(`Halted: ${errorMsg.slice(0, 30)}`);

      this.registry.socketBridge.broadcastChat({
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
   * Resumes a paused task from its checkpoint when the Boss provides clarification.
   */
  public async resumeWithClarification(taskId: string, clarificationResponse: string): Promise<Task | null> {
    let task: Task | null = null;
    try {
      task = await DbQueries.getTaskById(taskId);
    } catch {}

    if (!task) {
      task = {
        id: taskId,
        title: 'Resumed Task',
        description: '',
        status: 'in_progress',
        assignedAgentId: AGENT_IDS.LEADER,
        attachments: [],
        inputPayload: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const threadConfig = { configurable: { thread_id: taskId } };

    try {
      task.description += `\n\n[Boss Clarification]: ${clarificationResponse}`;
      task.clarification = null;

      const result = await this.compiledGraph.invoke(
        new Command({ resume: clarificationResponse }),
        threadConfig
      );

      return await this.handleGraphResult(task, result);
    } catch (err: unknown) {
      console.error(`[Orchestrator] Resume task ${taskId} with clarification failed:`, err);
      return null;
    }
  }

  /**
   * Resumes a paused task from its checkpoint when an Owner approval or rejection is submitted.
   */
  public async resumeWithApproval(taskId: string, approved: boolean, reason?: string): Promise<Task | null> {
    let task: Task | null = null;
    try {
      task = await DbQueries.getTaskById(taskId);
    } catch {}

    if (!task) {
      task = {
        id: taskId,
        title: 'Resumed Task',
        description: '',
        status: 'in_progress',
        assignedAgentId: AGENT_IDS.LEADER,
        attachments: [],
        inputPayload: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const threadConfig = { configurable: { thread_id: taskId } };

    try {
      const result = await this.compiledGraph.invoke(
        new Command({ resume: { approved, reason } }),
        threadConfig
      );

      return await this.handleGraphResult(task, result);
    } catch (err: unknown) {
      console.error(`[Orchestrator] Resume task ${taskId} with approval failed:`, err);
      return null;
    }
  }

  /**
   * Handles terminal outputs and LangGraph interrupt pauses.
   */
  private async handleGraphResult(task: Task, result: any): Promise<Task> {
    const { leader, socketBridge } = this.registry;

    // Check if graph was interrupted for clarification or owner approval
    if (result && result.__interrupt__ && Array.isArray(result.__interrupt__) && result.__interrupt__.length > 0) {
      const interruptValue = result.__interrupt__[0].value;

      if (interruptValue.type === 'approval_required') {
        const approvalId = `apr_${Date.now()}`;
        try {
          await DbQueries.createApproval({
            id: approvalId,
            taskId: task.id,
            actionType: 'dangerous_operation',
            actionDescription: interruptValue.reason || 'Dangerous operation requires Owner approval',
            riskLevel: 'high',
            requestedBy: 'agent_leader',
            status: 'pending',
          });
        } catch (dbErr) {
          console.warn('[Orchestrator] Could not record task approval to DB:', dbErr);
        }

        task.status = 'waiting_approval';
        try {
          await DbQueries.updateTaskStatus(task.id, 'waiting_approval', { pendingApprovalId: approvalId });
        } catch {}
        socketBridge.broadcastTaskUpdated(task);

        await leader.setStatus('consulting', `Awaiting Boss approval: ${interruptValue.reason}`, task.id);
        await leader.emitBubble(`Boss, explicit approval required: ${interruptValue.reason}`, 5000, 'alert');

        socketBridge.broadcastChat({
          id: `chat_${Date.now()}`,
          sender: 'agent_leader',
          senderName: 'Zen (Leader)',
          text: `Boss, approval is required before proceeding: ${interruptValue.reason}. Please authorize via Task Panel or Telegram.`,
          taskId: task.id,
          timestamp: new Date().toISOString(),
          type: 'dialogue',
        });

        return task;
      }

      if (interruptValue.type === 'clarification_needed') {
        const clarReq: ClarificationRequest = {
          taskId: task.id,
          question: interruptValue.question,
          options: interruptValue.options || ['Proceed with recommended defaults', 'Provide custom specification'],
          context: interruptValue.context || task.description,
        };

        task.status = 'waiting_approval';
        task.clarification = clarReq;
        try {
          await DbQueries.updateTaskStatus(task.id, 'waiting_approval', { clarification: clarReq });
        } catch {}
        socketBridge.broadcastTaskUpdated(task);
        socketBridge.broadcastClarificationNeeded(clarReq);

        await leader.setStatus('consulting', `Awaiting Boss clarification: "${clarReq.question}"`, task.id);
        await leader.emitBubble(`Boss, please clarify: ${clarReq.question}`, 5000, 'thought');

        socketBridge.broadcastChat({
          id: `chat_${Date.now()}`,
          sender: 'agent_leader',
          senderName: 'Zen (Leader)',
          text: `Boss, before the team begins executing: ${clarReq.question}${clarReq.options?.length ? `\nOptions: ${clarReq.options.join(' | ')}` : ''}`,
          taskId: task.id,
          timestamp: new Date().toISOString(),
          type: 'dialogue',
        });

        return task;
      }
    }

    // Check if graph completed with failure
    if (result.status === 'failed' || result.error) {
      task.status = 'failed';
      task.outputPayload = {
        error: result.error || 'Execution halted',
        finalDeliverable: `Task execution failed: ${result.error || 'Execution halted'}`,
        qaVerdict: 'FAILED',
      };
      try {
        await DbQueries.updateTaskStatus(task.id, 'failed', task.outputPayload, task.plan);
      } catch {}
      socketBridge.broadcastTaskUpdated(task);
      await this.resetSpecialistsIdle(`Failed: ${result.error?.slice(0, 30) || 'Halted'}`);
      return task;
    }

    // Graph completed successfully
    task.status = 'completed';
    task.outputPayload = {
      finalDeliverable: result.finalDeliverable,
      qaVerdict: result.qaVerdict || 'APPROVED',
      stepResults: result.stepResults || [],
      verifiedArtifact: result.verifiedArtifact,
      workspaceRoot: WorkspaceFsTools.getWorkspaceRoot(),
    };

    try {
      await DbQueries.updateTaskStatus(task.id, 'completed', task.outputPayload, task.plan);
    } catch {}
    socketBridge.broadcastTaskUpdated(task);

    socketBridge.broadcastChat({
      id: `chat_${Date.now()}`,
      sender: 'agent_leader',
      senderName: 'Zen (Leader)',
      text: `Boss, task "${task.title}" has been successfully executed and all deliverables verified! Check the Task Panel for full details.`,
      taskId: task.id,
      timestamp: new Date().toISOString(),
      type: 'dialogue',
    });

    await this.resetSpecialistsIdle('Awaiting next instructions from Boss.');
    return task;
  }

  private async resetSpecialistsIdle(leaderMsg: string): Promise<void> {
    const { leader, research, engineering, automation, qa, memory } = this.registry;
    await leader.setStatus('idle', leaderMsg);
    await research.setStatus('idle');
    await engineering.setStatus('idle');
    await automation.setStatus('idle');
    await qa.setStatus('idle');
    await memory.setStatus('idle');
  }
}
