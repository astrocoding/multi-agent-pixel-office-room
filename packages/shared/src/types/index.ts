import type { AgentId, AgentStateType, RoomEventType, TaskStateType } from '../constants/index.js';

export interface TaskAttachment {
  id: string;
  name: string;
  type: 'image' | 'code' | 'document' | 'other';
  mimeType: string;
  size: number;
  content?: string; // Text content for code/markdown/documents
  base64Data?: string; // Base64 data for images/screenshots
}

export interface ClarificationRequest {
  taskId: string;
  question: string;
  options?: string[];
  context: string;
  suggestedAction?: string;
}

export interface ToolExecutionRecord {
  id: string;
  taskId?: string;
  toolName: string;
  command?: string;
  parameters?: Record<string, unknown>;
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  executedBy: AgentId;
  timestamp: string;
}

export interface ToolLearningRecord {
  id: string;
  commandPattern: string;
  errorPattern?: string;
  resolutionStrategy: string;
  contextTags: string[];
  successCount: number;
  failureCount: number;
}

export interface TaskHandoffRecord {
  fromAgent: AgentId | string;
  toAgent: AgentId | string;
  stage: 'planning' | 'research' | 'engineering' | 'qa_verification' | 'archival' | 'synthesis';
  summary: string;
  timestamp: string;
}

export interface TaskDecision {
  complexity: 'trivial' | 'moderate' | 'complex' | 'mission_critical';
  executionStrategy: 'direct' | 'single_agent' | 'sequential' | 'parallel';
  allocatedAgents: string[];
  recommendedAction: string;
  riskAssessment: 'low' | 'medium' | 'high' | 'critical';
  requiresHumanApproval: boolean;
  approvalReason?: string;
  phases?: {
    phaseIndex: number;
    name: string;
    parallel: boolean;
    assignments: {
      agentId: string;
      objective: string;
      expectedOutput?: string;
    }[];
  }[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStateType;
  assignedAgentId?: AgentId | null;
  projectName?: string;
  intent?: string;
  decision?: TaskDecision;
  handoffChain?: TaskHandoffRecord[];
  qaVerdict?: string;
  qaNotes?: string;
  metadata?: Record<string, unknown>;
  contextSnapshot?: Record<string, unknown>;
  attachments?: TaskAttachment[];
  clarification?: ClarificationRequest | null;
  terminalLogs?: ToolExecutionRecord[];
  inputPayload: Record<string, unknown>;
  outputPayload?: Record<string, unknown> | null;
  plan?: {
    steps: {
      stepIndex: number;
      assignedTo: AgentId;
      objective: string;
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      result?: string;
    }[];
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskActivity {
  id: string;
  taskId?: string | null;
  agentId: AgentId | 'boss' | 'system';
  eventType: RoomEventType;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AgentRuntimeState {
  agentId: AgentId;
  name: string;
  role: string;
  state: AgentStateType;
  currentTaskId?: string | null;
  currentThought?: string;
  positionX: number;
  positionY: number;
  deskX: number;
  deskY: number;
  lastActiveAt: string;
}

export type MemoryType = 'short_term' | 'episodic' | 'semantic' | 'project_preference';

export interface MemoryRecord {
  id: string;
  agentId: AgentId;
  memoryType: MemoryType;
  content: string;
  summary?: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  importance: number;
  projectScope?: string;
  intentCategory?: string;
  taskId?: string;
  accessCount?: number;
  lastRecalledAt?: string;
  createdAt: string;
  updatedAt: string;
  similarity?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  projectScope: string;
  primaryIntent?: string;
  summary?: string;
  contextSnapshot?: Record<string, unknown>;
  targetAgentId?: AgentId | string;
  modelUsed?: string;
  messageCount: number;
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId?: string;
  sender: AgentId | 'boss' | 'system';
  senderName: string;
  text: string;
  taskId?: string;
  timestamp: string;
  type: 'dialogue' | 'status' | 'announcement' | 'instruct';
  intent?: string;
  mentionedAgents?: string[];
  metadata?: Record<string, unknown>;
}

export interface BubbleChatPayload {
  agentId: AgentId | 'boss';
  text: string;
  durationMs?: number;
  bubbleType?: 'speech' | 'thought' | 'alert';
}

export interface ModelRouteMetrics {
  provider: 'gemini' | 'mock-fallback' | 'custom';
  modelName: string;
  latencyMs: number;
  tokenCount: {
    prompt: number;
    completion: number;
    total: number;
  };
  success: boolean;
  timestamp: string;
}

export interface ServerToClientEvents {
  'room:state': (data: {
    agents: Record<AgentId, AgentRuntimeState>;
    tasks: Task[];
    recentActivities: TaskActivity[];
  }) => void;
  'agent:status': (data: {
    agentId: AgentId;
    state: AgentStateType;
    currentTaskId?: string | null;
    currentThought?: string;
  }) => void;
  'agent:bubble': (data: BubbleChatPayload) => void;
  'agent:moved': (data: { agentId: AgentId; x: number; y: number }) => void;
  'task:created': (task: Task) => void;
  'task:updated': (task: Task) => void;
  'task:activity': (activity: TaskActivity) => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:session_created': (session: ChatSession) => void;
  'chat:session_updated': (session: ChatSession) => void;
  'chat:session_deleted': (data: { sessionId: string }) => void;
  'tool:executed': (data: ToolExecutionRecord) => void;
  'task:clarification_needed': (data: ClarificationRequest) => void;
  'system:notification': (data: { level: 'info' | 'warn' | 'error'; message: string }) => void;
  'agent:summon': (data: { agentId: AgentId; reason?: string; text?: string }) => void;
}

export interface ClientToServerEvents {
  'player:move': (data: { x: number; y: number; direction: string }) => void;
  'task:submit': (
    data: {
      title: string;
      description: string;
      targetAgentId?: AgentId;
      attachments?: TaskAttachment[];
    },
    callback?: (res: { success: boolean; taskId?: string; error?: string }) => void
  ) => void;
  'task:clarify': (
    data: { taskId: string; response: string },
    callback?: (res: { success: boolean }) => void
  ) => void;
  'chat:send': (data: {
    text: string;
    recipientAgentId?: AgentId;
    attachments?: TaskAttachment[];
    sessionId?: string;
    type?: 'dialogue' | 'instruct';
    metadata?: Record<string, unknown>;
  }) => void;
  'agent:interact': (data: { agentId: AgentId; intent: string }) => void;
}

