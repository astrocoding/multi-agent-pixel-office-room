import {
  LlmAgent,
  Runner,
  InMemorySessionService,
  BaseLlm,
  toStructuredEvents,
  EventType,
  type Event,
  getFunctionCalls,
  getFunctionResponses,
  stringifyContent,
} from '@google/adk';
import {
  createAdkGeminiModels,
  createAgentSpecificAdkModel,
  type AdkModelConfig,
} from './models.js';
import { createOfficeFunctionTools, type OfficeFunctionTools, type OfficeToolHandlers } from './tools.js';
import { SYSTEM_PROMPTS } from '../prompts/agentPrompts.js';
import { AGENT_IDS, type AgentId } from '@agent-office/shared';

export interface OfficeSwarmOptions {
  modelConfig: AdkModelConfig;
  toolHandlers: OfficeToolHandlers;
}

export interface SwarmEvent {
  type: 'thought' | 'tool_call' | 'tool_result' | 'speech' | 'agent_switch' | 'error' | 'finished';
  agentId: AgentId;
  agentName: string;
  text?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  rawEvent?: Event;
}

export class GoogleAdkOfficeSwarm {
  public readonly atlas: LlmAgent;
  public readonly torvalds: LlmAgent;
  public readonly ada: LlmAgent;
  public readonly volt: LlmAgent;
  public readonly iris: LlmAgent;
  public readonly mnemo: LlmAgent;

  public readonly runner: Runner;
  public readonly sessionService: InMemorySessionService;
  public readonly routedModel: BaseLlm;
  public readonly tools: OfficeFunctionTools;

  private agentMap: Record<string, { agent: LlmAgent; id: AgentId; displayName: string }>;

  constructor(options: OfficeSwarmOptions) {
    const atlasModel = createAgentSpecificAdkModel('atlas', options.modelConfig).routedModel;
    const torvaldsModel = createAgentSpecificAdkModel('torvalds', options.modelConfig).routedModel;
    const adaModel = createAgentSpecificAdkModel('ada', options.modelConfig).routedModel;
    const voltModel = createAgentSpecificAdkModel('volt', options.modelConfig).routedModel;
    const irisModel = createAgentSpecificAdkModel('iris', options.modelConfig).routedModel;
    const mnemoModel = createAgentSpecificAdkModel('mnemo', options.modelConfig).routedModel;

    this.routedModel = atlasModel;

    this.tools = createOfficeFunctionTools(options.toolHandlers);
    const {
      executeBashTool,
      readFileTool,
      writeFileTool,
      editFileTool,
      listDirectoryTool,
      searchWebDocsTool,
      recallMemoryTool,
      storeMemoryTool,
      queryTasksDatabaseTool,
      getTaskDetailsTool,
      planTaskExecutionTool,
      requestHumanApprovalTool,
      searchKnowledgeSopTool,
    } = this.tools;

    // 1. Engineering Specialist (Iky / Torvalds) - Gemini 3.8 Flash (Flagship Code Model)
    // Low temperature (0.1) for strictly deterministic, compiler-ready, zero-error code.
    this.torvalds = new LlmAgent({
      name: 'iky',
      description:
        'Senior Software Engineer (Iky) specializing in code architecture, refactoring, building, compilation, package managers (npm, pnpm, bun, composer, php artisan), and running terminal tests.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.ENGINEERING],
      model: torvaldsModel,
      generateContentConfig: {
        temperature: 0.1,
      },
      tools: [
        executeBashTool,
        readFileTool,
        writeFileTool,
        editFileTool,
        listDirectoryTool,
        getTaskDetailsTool,
        searchKnowledgeSopTool,
      ],
    });

    // 2. Research Specialist (Dre / Ada) - Gemini 3 Flash Preview (Multimodal & Fast)
    // Temperature (0.3) for balanced synthesis of docs, libraries, and technical constraints.
    this.ada = new LlmAgent({
      name: 'dre',
      description:
        'Research Specialist (Dre) investigating official technical documentation, architecture constraints, multimodal media, API standards, and library trade-offs.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.RESEARCH],
      model: adaModel,
      generateContentConfig: {
        temperature: 0.3,
      },
      tools: [
        searchWebDocsTool,
        readFileTool,
        listDirectoryTool,
        getTaskDetailsTool,
        searchKnowledgeSopTool,
      ],
    });

    // 3. Automation Specialist (Gus / Volt) - Gemini 3.5 Flash-Lite (High Throughput)
    // Low temperature (0.1) for deterministic script execution and background pipeline authoring.
    this.volt = new LlmAgent({
      name: 'gus',
      description:
        'Automation Architect (Gus) handling DevOps, workflow execution, background jobs, schedulers, and operational automation.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.AUTOMATION],
      model: voltModel,
      generateContentConfig: {
        temperature: 0.1,
      },
      tools: [executeBashTool, writeFileTool, listDirectoryTool, getTaskDetailsTool],
    });

    // 4. QA & Critic Specialist (Rai / Iris) - Gemini 3.6 Flash (Calibrated Production)
    // Ultra-low temperature (0.05) for uncompromising audit precision and zero hallucination tolerance.
    this.iris = new LlmAgent({
      name: 'rai',
      description:
        'QA & Critic Specialist (Rai) verifying code quality, detecting hallucinations, testing edge cases, executing test suites, and auditing deliverables against requirements.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.QA],
      model: irisModel,
      generateContentConfig: {
        temperature: 0.05,
      },
      tools: [
        executeBashTool,
        readFileTool,
        listDirectoryTool,
        getTaskDetailsTool,
        queryTasksDatabaseTool,
        searchKnowledgeSopTool,
      ],
    });

    // 5. Memory & Knowledge Curator (Dhea / Mnemo) - Gemini 3.1 Flash-Lite (Low Latency)
    // Low temperature (0.1) for factual database lookup, project scope separation, and vector recall.
    this.mnemo = new LlmAgent({
      name: 'dhea',
      description:
        'Knowledge & Database Memory Curator (Dhea). Inspects database tasks, retrieves episodic memory, recalls past deliverables, tracks project context & intent, and verifies task histories.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.MEMORY],
      model: mnemoModel,
      generateContentConfig: {
        temperature: 0.1,
      },
      tools: [
        queryTasksDatabaseTool,
        getTaskDetailsTool,
        recallMemoryTool,
        storeMemoryTool,
        readFileTool,
      ],
    });

    // 6. Chief of Staff & Root Coordinator (Zen / Atlas) - Gemini 3.1 Flash-Lite (Economical & Fast)
    // Temperature (0.15) for strategic decision-making, planning, and task allocation.
    this.atlas = new LlmAgent({
      name: 'zen',
      description:
        'Chief of Staff, Leader Agent, and Strategic Compass (Zen). Evaluates Boss intent, measures task complexity, allocates workloads, coordinates parallel subagents, and synthesizes final deliverables.',
      instruction: SYSTEM_PROMPTS[AGENT_IDS.LEADER],
      model: atlasModel,
      generateContentConfig: {
        temperature: 0.15,
      },
      tools: [
        planTaskExecutionTool,
        requestHumanApprovalTool,
        searchKnowledgeSopTool,
        listDirectoryTool,
        readFileTool,
        queryTasksDatabaseTool,
        getTaskDetailsTool,
        recallMemoryTool,
        storeMemoryTool,
      ],
      subAgents: [this.torvalds, this.ada, this.volt, this.iris, this.mnemo],
    });

    this.sessionService = new InMemorySessionService();
    this.runner = new Runner({
      appName: 'agent_office',
      agent: this.atlas,
      sessionService: this.sessionService,
      autoCreateSession: true,
    });

    this.agentMap = {
      zen: { agent: this.atlas, id: AGENT_IDS.LEADER, displayName: 'Zen (Leader)' },
      atlas: { agent: this.atlas, id: AGENT_IDS.LEADER, displayName: 'Zen (Leader)' },
      agent_leader: { agent: this.atlas, id: AGENT_IDS.LEADER, displayName: 'Zen (Leader)' },

      iky: { agent: this.torvalds, id: AGENT_IDS.ENGINEERING, displayName: 'Iky (Engineering)' },
      torvalds: { agent: this.torvalds, id: AGENT_IDS.ENGINEERING, displayName: 'Iky (Engineering)' },
      agent_engineering: { agent: this.torvalds, id: AGENT_IDS.ENGINEERING, displayName: 'Iky (Engineering)' },

      dre: { agent: this.ada, id: AGENT_IDS.RESEARCH, displayName: 'Dre (Research)' },
      ada: { agent: this.ada, id: AGENT_IDS.RESEARCH, displayName: 'Dre (Research)' },
      agent_research: { agent: this.ada, id: AGENT_IDS.RESEARCH, displayName: 'Dre (Research)' },

      gus: { agent: this.volt, id: AGENT_IDS.AUTOMATION, displayName: 'Gus (Automation)' },
      eca: { agent: this.volt, id: AGENT_IDS.AUTOMATION, displayName: 'Gus (Automation)' },
      volt: { agent: this.volt, id: AGENT_IDS.AUTOMATION, displayName: 'Gus (Automation)' },
      agent_automation: { agent: this.volt, id: AGENT_IDS.AUTOMATION, displayName: 'Gus (Automation)' },

      rai: { agent: this.iris, id: AGENT_IDS.QA, displayName: 'Rai (QA & Critic)' },
      iris: { agent: this.iris, id: AGENT_IDS.QA, displayName: 'Rai (QA & Critic)' },
      agent_qa: { agent: this.iris, id: AGENT_IDS.QA, displayName: 'Rai (QA & Critic)' },

      dhea: { agent: this.mnemo, id: AGENT_IDS.MEMORY, displayName: 'Dhea (Memory)' },
      mnemo: { agent: this.mnemo, id: AGENT_IDS.MEMORY, displayName: 'Dhea (Memory)' },
      agent_memory: { agent: this.mnemo, id: AGENT_IDS.MEMORY, displayName: 'Dhea (Memory)' },
    };
  }

  public getAgentInfo(nameOrId: string) {
    const key = nameOrId.toLowerCase().trim();
    return this.agentMap[key] || this.agentMap['zen'] || this.agentMap['atlas'];
  }

  /**
   * Executes an autonomous agentic turn using the Agent Office Runner.
   * Yields SwarmEvents as the agent reasons, calls tools, and replies.
   */
  public async *runTurn(params: {
    userId?: string;
    sessionId?: string;
    userText: string;
    targetAgentId?: AgentId;
    activeDirectory?: string;
    stateDelta?: Record<string, unknown>;
  }): AsyncGenerator<SwarmEvent, { replyText: string }, void> {
    const userId = params.userId || 'boss';
    const sessionId = params.sessionId || 'office_main_session';

    const targetInfo = this.getAgentInfo(params.targetAgentId || AGENT_IDS.LEADER);
    let currentAgentId: AgentId = targetInfo.id;
    let currentAgentName: string = targetInfo.displayName;

    let accumulatedReply = '';

    // If Boss selected a specific agent (e.g. Iky or Dre), prefix the instruction so Zen routes to it,
    // or let Zen handle as root coordinator with full subagent delegation.
    let textToSend = params.userText;
    if (params.activeDirectory) {
      textToSend = `[Active Working Directory: "${params.activeDirectory}"]\n${textToSend}`;
    }

    try {
      const eventStream = this.runner.runAsync({
        userId,
        sessionId,
        newMessage: {
          parts: [{ text: textToSend }],
        },
        stateDelta: {
          activeDirectory: params.activeDirectory || '~/Projects',
          ...(params.stateDelta || {}),
        },
      });

      let iterationCount = 0;
      const MAX_TURN_ITERATIONS = 25;

      for await (const event of eventStream) {
        iterationCount++;
        if (iterationCount > MAX_TURN_ITERATIONS) {
          yield {
            type: 'thought',
            agentId: currentAgentId,
            agentName: currentAgentName,
            text: `[Safeguard Guardrail] Mencapai batas langkah iterasi aman (${MAX_TURN_ITERATIONS} langkah). Menghentikan loop untuk mencegah pemborosan token dan merangkum hasil kerja...`,
          };
          break;
        }
        // Track author / agent transfer
        if (event.author && event.author !== 'user') {
          const authorInfo = this.getAgentInfo(event.author);
          if (authorInfo.id !== currentAgentId) {
            currentAgentId = authorInfo.id;
            currentAgentName = authorInfo.displayName;
            yield {
              type: 'agent_switch',
              agentId: currentAgentId,
              agentName: currentAgentName,
              text: `Switched active focus to ${currentAgentName}`,
              rawEvent: event,
            };
          }
        }

        const structured = toStructuredEvents(event);

        for (const sEvent of structured) {
          switch (sEvent.type) {
            case EventType.THOUGHT: {
              if (sEvent.content?.trim()) {
                yield {
                  type: 'thought',
                  agentId: currentAgentId,
                  agentName: currentAgentName,
                  text: sEvent.content.trim(),
                  rawEvent: event,
                };
              }
              break;
            }

            case EventType.TOOL_CALL: {
              yield {
                type: 'tool_call',
                agentId: currentAgentId,
                agentName: currentAgentName,
                toolName: sEvent.call.name,
                toolArgs: (sEvent.call.args as Record<string, unknown>) || {},
                text: `Executing tool ${sEvent.call.name}...`,
                rawEvent: event,
              };
              break;
            }

            case EventType.TOOL_RESULT: {
              yield {
                type: 'tool_result',
                agentId: currentAgentId,
                agentName: currentAgentName,
                toolName: sEvent.result.name,
                toolResult: sEvent.result.response,
                text: `Completed tool ${sEvent.result.name}`,
                rawEvent: event,
              };
              break;
            }

            case EventType.CONTENT: {
              if (sEvent.content) {
                accumulatedReply += sEvent.content;
                yield {
                  type: 'speech',
                  agentId: currentAgentId,
                  agentName: currentAgentName,
                  text: sEvent.content,
                  rawEvent: event,
                };
              }
              break;
            }

            case EventType.ERROR: {
              yield {
                type: 'error',
                agentId: currentAgentId,
                agentName: currentAgentName,
                text: typeof sEvent === 'object' && 'error' in sEvent ? String(sEvent.error) : 'Unknown Agent Office error',
                rawEvent: event,
              };
              break;
            }
          }
        }

        // Also check direct text if structured content wasn't emitted
        const directText = stringifyContent(event);
        if (directText && !accumulatedReply.includes(directText)) {
          accumulatedReply += directText;
          yield {
            type: 'speech',
            agentId: currentAgentId,
            agentName: currentAgentName,
            text: directText,
            rawEvent: event,
          };
        }
      }

      yield {
        type: 'finished',
        agentId: currentAgentId,
        agentName: currentAgentName,
        text: accumulatedReply.trim(),
      };

      return { replyText: accumulatedReply.trim() };
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || String(err);
      yield {
        type: 'error',
        agentId: currentAgentId,
        agentName: currentAgentName,
        text: errorMsg,
      };
      return { replyText: `Lapor Bos, terjadi kendala saat agen mengeksekusi instruksi: ${errorMsg}` };
    }
  }
}

export { GoogleAdkOfficeSwarm as AgentOfficeSwarm };
