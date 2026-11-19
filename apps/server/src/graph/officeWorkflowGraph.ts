import { StateGraph, Annotation, MemorySaver, Command, interrupt, END, START } from '@langchain/langgraph';
import type {
  Task,
  AgentId,
  TaskStateType,
  TaskAttachment,
  ClarificationRequest,
  TaskApproval,
} from '@agent-office/shared';
import { AGENT_IDS } from '@agent-office/shared';
import {
  IntentClassifier,
  HumanizerComposer,
  ArtifactVerifier,
  GroundedContextBuilder,
  type RequestProfile,
  type SkillMetadata,
  type BuiltContext,
} from '@agent-office/ai';
import { DbQueries } from '../db/queries.js';
import { AuthorizedRetriever } from '../rag/authorizedRetriever.js';
import { DbSkillRepository } from '../rag/dbSkillRepository.js';
import { WorkspaceFsTools } from '../tools/index.js';
import type { WorkflowAgentRegistry } from './workflow.js';

export const OfficeWorkflowAnnotation = Annotation.Root({
  taskId: Annotation<string>(),
  correlationId: Annotation<string>(),
  title: Annotation<string>(),
  description: Annotation<string>(),
  actorId: Annotation<string>(),
  projectScope: Annotation<string>(),
  channel: Annotation<'web' | 'telegram' | 'terminal'>(),
  attachments: Annotation<TaskAttachment[]>(),
  requestProfile: Annotation<RequestProfile>(),
  selectedSkills: Annotation<SkillMetadata[]>(),
  skillTrace: Annotation<Array<{ skillId: string; version: string; reason: string }>>({
    reducer: (curr, update) => [...(curr || []), ...(update || [])],
    default: () => [],
  }),
  retrievedContext: Annotation<BuiltContext>(),
  planSteps: Annotation<
    Array<{
      stepIndex: number;
      assignedTo: AgentId;
      objective: string;
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      result?: string;
    }>
  >(),
  stepResults: Annotation<Array<{ specialist: string; output: string }>>({
    reducer: (curr, update) => [...(curr || []), ...(update || [])],
    default: () => [],
  }),
  finalDeliverable: Annotation<string>(),
  verifiedArtifact: Annotation<{
    path: string;
    verified: boolean;
    reason?: string;
  } | null>(),
  qaVerdict: Annotation<'APPROVED' | 'CONDITIONAL_PASS' | 'FAILED'>(),
  status: Annotation<TaskStateType>(),
  iterationCount: Annotation<number>({
    reducer: (curr, val) => (curr || 0) + val,
    default: () => 0,
  }),
  clarification: Annotation<ClarificationRequest | null>(),
  approval: Annotation<TaskApproval | null>(),
  error: Annotation<string | null>(),
});

export type OfficeWorkflowState = typeof OfficeWorkflowAnnotation.State;

export class OfficeWorkflowGraphBuilder {
  private readonly registry: WorkflowAgentRegistry;
  private readonly retriever: AuthorizedRetriever;
  public readonly checkpointer: MemorySaver;

  constructor(registry: WorkflowAgentRegistry) {
    this.registry = registry;
    this.retriever = new AuthorizedRetriever();
    this.checkpointer = new MemorySaver();
  }

  public buildGraph() {
    const { leader, research, engineering, automation, qa, memory, socketBridge } = this.registry;
    const retriever = this.retriever;

    const graph = new StateGraph(OfficeWorkflowAnnotation)
      // 1. Authorize Node
      .addNode('authorize', async (state) => {
        const actorId = state.actorId || 'boss';
        const projectScope = state.projectScope || 'default';

        // Check if actor has access to the project
        if (projectScope.startsWith('restricted_') && actorId !== 'owner') {
          return {
            status: 'failed' as TaskStateType,
            error: `Unauthorized access: actor '${actorId}' cannot access project scope '${projectScope}'`,
          };
        }

        try {
          await DbQueries.updateTaskStatus(state.taskId, 'analyzing');
        } catch {
          // Graceful fallback when DB is in memory or unreachable
        }

        return { status: 'analyzing' as TaskStateType };
      })

      // 2. Classify Intent Node
      .addNode('classify_intent', async (state) => {
        const fullText = `${state.title}\n${state.description}`;
        const profile = IntentClassifier.classifyDeterministic(fullText, state.channel) || {
          intentCategory: 'query_information' as const,
          userGoal: fullText,
          deliverable: 'chat' as const,
          language: 'id' as const,
          tone: 'professional' as const,
          audience: (state.channel === 'telegram' ? 'telegram' : 'boss') as 'telegram' | 'boss',
          depth: 'standard' as const,
          risk: 'low' as const,
          requiresOwnerApproval: false,
          isMateriallyAmbiguous: false,
          clarificationOptions: [],
          targetSpecialists: [AGENT_IDS.LEADER],
          constraints: [],
        };

        // Check if OWNER approval is required for sensitive or destructive operations
        if (profile.requiresOwnerApproval) {
          const approvalResume = interrupt({
            type: 'approval_required',
            taskId: state.taskId,
            risk: profile.risk,
            reason: profile.approvalReason || `Privileged operation requires Owner authorization: ${profile.userGoal}`,
          }) as { approved?: boolean; reason?: string } | undefined;

          if (approvalResume && typeof approvalResume === 'object' && approvalResume.approved === false) {
            return {
              status: 'failed' as TaskStateType,
              error: `Action rejected by Owner: ${approvalResume.reason || 'Operation unauthorized'}`,
              requestProfile: profile,
            };
          }
        }

        // Check if materially ambiguous
        if (profile.isMateriallyAmbiguous) {
          const clarQuestion = profile.clarificationQuestion || 'Please clarify your requirement.';
          const clarResume = interrupt({
            type: 'clarification_needed',
            taskId: state.taskId,
            question: clarQuestion,
            options: profile.clarificationOptions || ['Option A', 'Option B'],
            context: state.description,
          }) as string | { response?: string } | undefined;

          if (clarResume) {
            const clarText =
              typeof clarResume === 'string'
                ? clarResume
                : typeof clarResume === 'object' && clarResume.response
                  ? clarResume.response
                  : JSON.stringify(clarResume);

            return {
              requestProfile: {
                ...profile,
                isMateriallyAmbiguous: false,
              },
              description: `${state.description}\n\n[Boss Clarification]: ${clarText}`,
            };
          }
        }

        return { requestProfile: profile };
      })

      // 3. Select Approved Skills Node
      .addNode('select_skills', async (state) => {
        let approvedSkills: SkillMetadata[] = [];
        try {
          approvedSkills = await DbSkillRepository.listSkills({ status: 'approved' });
        } catch {
          // Fallback canonical skills when DB is unavailable
          approvedSkills = [
            {
              skillId: 'humanizer',
              name: 'humanizer',
              description: 'Humanizer natural style composition guidelines',
              canonicalPath: 'skills/humanizer/SKILL.md',
              entrypoint: 'skills/humanizer/SKILL.md',
              references: [],
              triggers: ['humanize', 'tone', 'style'],
              roles: ['agent_leader', 'agent_qa', 'agent_research', 'agent_engineering'],
              languages: ['id', 'en'],
              sourceTrust: 'system_builtin',
              status: 'approved',
              approvedBy: 'system',
              version: '1.0.0',
              activeVersion: '1.0.0',
              contentHash: 'hash_humanizer_default',
              scope: 'office',
              owner: 'system',
              metadata: {},
            },
          ];
        }

        // Deduplicate logical skills (e.g., avoid loading both flat humanizer.md and directory humanizer/SKILL.md)
        const seenSlugs = new Set<string>();
        const deduplicatedSkills: SkillMetadata[] = [];

        for (const s of approvedSkills) {
          const normSlug = s.skillId.replace(/\.md$/, '').replace(/^skills\//, '');
          if (!seenSlugs.has(normSlug)) {
            seenSlugs.add(normSlug);
            deduplicatedSkills.push(s);
          }
        }

        const relevantSkills = deduplicatedSkills
          .filter(
            (s) =>
              state.requestProfile?.targetSpecialists.some((role) => s.roles.includes(role)) ||
              s.skillId === 'humanizer'
          )
          .slice(0, 3);

        const trace = relevantSkills.map((s) => ({
          skillId: s.skillId,
          version: s.version,
          reason: `Approved skill matched target roles [${s.roles.join(', ')}]`,
        }));

        return {
          selectedSkills: relevantSkills,
          skillTrace: trace,
        };
      })

      // 4. Retrieve Context Node
      .addNode('retrieve_context', async (state) => {
        let built: BuiltContext = {
          formattedContext: '',
          citations: [],
          totalTokens: 0,
          noEvidence: true,
          selectedSkills: [],
          trace: {
            requestId: state.taskId || 'req',
            actorId: state.actorId || 'boss',
            projectScope: state.projectScope || 'default',
            strategy: 'auto',
            candidatesPreRerank: 0,
            finalPassagesCount: 0,
            selectedSkillSlugs: [],
            retrievedTokens: 0,
            latencyMs: 0,
            fallbackUsed: false,
            noEvidence: true,
            noMatchReason: 'Default empty context',
            timestamp: new Date().toISOString(),
          },
        };

        try {
          const query = `${state.title} ${state.description}`;
          const retrievalRes = await retriever.search({
            query,
            scope: {
              actorId: state.actorId || 'boss',
              projectScope: state.projectScope || 'default',
              channel: state.channel || 'web',
              role: state.requestProfile?.targetSpecialists[0],
            },
            tokenBudget: 3500,
            maxInjectedPassages: 5,
          });

          built = GroundedContextBuilder.build(retrievalRes, { maxTokens: 3500 });
        } catch {
          // Graceful retrieval fallback
        }

        return { retrievedContext: built };
      })

      // 5. Plan and Delegate Node
      .addNode('plan_and_delegate', async (state) => {
        await leader.setStatus(
          'thinking',
          'Formulating roadmap with approved skills and verified RAG evidence...',
          state.taskId
        );

        const contextSnippets = state.retrievedContext?.formattedContext
          ? [state.retrievedContext.formattedContext]
          : [];

        const plan = await leader.planTask(
          state.title,
          state.description,
          state.attachments || [],
          contextSnippets
        );

        const validSteps: Array<{
          stepIndex: number;
          assignedTo: AgentId;
          objective: string;
          status: 'pending' | 'in_progress' | 'completed' | 'failed';
          result?: string;
        }> = (plan.steps || []).map((s) => ({
          stepIndex: s.stepIndex,
          assignedTo: s.assignedTo as AgentId,
          objective: s.objective,
          status: 'pending' as const,
        }));

        try {
          await DbQueries.updateTaskStatus(state.taskId, 'planned', null, { steps: validSteps });
        } catch {}

        socketBridge.broadcastTaskUpdated({
          id: state.taskId,
          title: state.title,
          description: state.description,
          status: 'planned',
          assignedAgentId: AGENT_IDS.LEADER,
          attachments: state.attachments || [],
          inputPayload: {},
          plan: { steps: validSteps },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        return { planSteps: validSteps, status: 'planned' as TaskStateType };
      })

      // 6. Execute Specialists Node (Bounded concurrency & transient retries <= 2)
      .addNode('execute_specialists', async (state) => {
        const steps = state.planSteps || [];
        try {
          await DbQueries.updateTaskStatus(state.taskId, 'in_progress', null, { steps });
        } catch {}

        const results: Array<{ specialist: string; output: string }> = [];

        const mockTask: Task = {
          id: state.taskId,
          title: state.title,
          description: state.description,
          status: 'in_progress',
          assignedAgentId: AGENT_IDS.LEADER,
          attachments: state.attachments || [],
          inputPayload: {},
          plan: { steps },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        for (const step of steps) {
          let output = '';
          let retries = 0;

          while (retries <= 2) {
            try {
              if (step.assignedTo === AGENT_IDS.RESEARCH) {
                await research.setStatus('working', step.objective, state.taskId);
                const res = await research.execute({ task: mockTask });
                output = res.output;
              } else if (step.assignedTo === AGENT_IDS.ENGINEERING) {
                await engineering.setStatus('working', step.objective, state.taskId);
                const res = await engineering.execute({
                  task: mockTask,
                  previousOutputs: { previousSteps: results },
                });
                output = res.output;
              } else if (step.assignedTo === AGENT_IDS.AUTOMATION) {
                await automation.setStatus('working', step.objective, state.taskId);
                const res = await automation.execute({
                  task: mockTask,
                  previousOutputs: { previousSteps: results },
                });
                output = res.output;
              } else if (step.assignedTo === AGENT_IDS.QA) {
                await qa.setStatus('working', step.objective, state.taskId);
                const res = await qa.execute({
                  task: mockTask,
                  previousOutputs: { previousSteps: results },
                });
                output = res.output;
              } else if (step.assignedTo === AGENT_IDS.MEMORY) {
                await memory.setStatus('working', step.objective, state.taskId);
                const res = await memory.execute({
                  task: mockTask,
                  previousOutputs: { previousSteps: results },
                });
                output = res.output;
              } else {
                output = `Step ${step.stepIndex} executed: ${step.objective}`;
              }
              break;
            } catch (err: unknown) {
              retries++;
              if (retries > 2) {
                output = `Execution failed after 2 retries: ${err instanceof Error ? err.message : String(err)}`;
              }
            }
          }

          results.push({ specialist: step.assignedTo, output });
        }

        return { stepResults: results, status: 'in_progress' as TaskStateType };
      })

      // 7. Compose Humanized Deliverable Node
      .addNode('compose_humanized', async (state) => {
        const rawReport = await leader.synthesizeResults(
          state.title,
          state.stepResults || [],
          []
        );

        const humanized = HumanizerComposer.compose({
          profile: state.requestProfile,
          rawContent: rawReport,
          citations: state.retrievedContext?.citations || [],
          channel: state.channel,
          agentVoice: 'zen',
        });

        return { finalDeliverable: humanized };
      })

      // 8. Verify Deliverable Node (Physical Artifact Check & QA Audit)
      .addNode('verify_deliverable', async (state) => {
        const targetFile = state.requestProfile?.outputFilePath;
        let artifactCheck: { path: string; verified: boolean; reason?: string } | null = null;

        if (targetFile) {
          const v = ArtifactVerifier.verify(
            targetFile,
            state.requestProfile.deliverable,
            WorkspaceFsTools.getWorkspaceRoot()
          );
          artifactCheck = {
            path: v.filePath,
            verified: v.verified,
            reason: v.reason,
          };
        }

        const qaRes = await qa.execute({
          task: {
            id: state.taskId,
            title: state.title,
            description: state.description,
            status: 'reviewing',
            assignedAgentId: AGENT_IDS.QA,
            inputPayload: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          previousOutputs: {
            stepResults: state.stepResults,
            finalDeliverable: state.finalDeliverable,
            artifactCheck,
          },
        });

        return {
          qaVerdict: qaRes.success ? ('APPROVED' as const) : ('CONDITIONAL_PASS' as const),
          verifiedArtifact: artifactCheck,
          status: 'reviewing' as TaskStateType,
          iterationCount: 1,
        };
      })

      // 9. Deliver Node
      .addNode('deliver', async (state) => {
        const isFailed = state.status === 'failed' || !!state.error;

        if (isFailed) {
          try {
            await DbQueries.updateTaskStatus(state.taskId, 'failed', {
              error: state.error || 'Execution halted',
            });
          } catch {}
          return { status: 'failed' as TaskStateType };
        }

        const payload = {
          finalDeliverable: state.finalDeliverable,
          qaVerdict: state.qaVerdict,
          stepResults: state.stepResults,
          verifiedArtifact: state.verifiedArtifact,
          workspaceRoot: WorkspaceFsTools.getWorkspaceRoot(),
        };

        try {
          await DbQueries.updateTaskStatus(state.taskId, 'completed', payload);
        } catch {}

        // Reset all specialists to idle
        await leader.setStatus('idle', 'Awaiting next directive from Boss.');
        await research.setStatus('idle');
        await engineering.setStatus('idle');
        await automation.setStatus('idle');
        await qa.setStatus('idle');
        await memory.setStatus('idle');

        return { status: 'completed' as TaskStateType };
      });

    // Wire Graph Edges
    graph
      .addEdge(START, 'authorize')
      .addConditionalEdges('authorize', (state) => {
        if (state.status === 'failed') return 'deliver';
        return 'classify_intent';
      })
      .addEdge('classify_intent', 'select_skills')
      .addEdge('select_skills', 'retrieve_context')
      .addEdge('retrieve_context', 'plan_and_delegate')
      .addEdge('plan_and_delegate', 'execute_specialists')
      .addEdge('execute_specialists', 'compose_humanized')
      .addEdge('compose_humanized', 'verify_deliverable')
      .addConditionalEdges('verify_deliverable', (state) => {
        // Allow at most 1 post-verification revision loop if artifact verification fails
        if (state.verifiedArtifact && !state.verifiedArtifact.verified && (state.iterationCount || 0) < 1) {
          return 'compose_humanized';
        }
        return 'deliver';
      })
      .addEdge('deliver', END);

    return graph.compile({ checkpointer: this.checkpointer });
  }
}
