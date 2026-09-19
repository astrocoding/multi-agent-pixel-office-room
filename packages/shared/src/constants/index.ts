export const ROOM_EVENTS = {
  PLAYER_MOVED: 'PLAYER_MOVED',
  NPC_MOVED: 'NPC_MOVED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_PROGRESS: 'TASK_PROGRESS',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_FAILED: 'TASK_FAILED',
  CHAT_SENT: 'CHAT_SENT',
  BUBBLE_EMIT: 'BUBBLE_EMIT',
  AGENT_STATUS_CHANGED: 'AGENT_STATUS_CHANGED',
  MODEL_SWITCHED: 'MODEL_SWITCHED',
  TOOL_CALLED: 'TOOL_CALLED',
  TOOL_RESULT: 'TOOL_RESULT',
  COMMAND_EXECUTED: 'COMMAND_EXECUTED',
  FILE_CREATED: 'FILE_CREATED',
  FILE_MODIFIED: 'FILE_MODIFIED',
  CLARIFICATION_NEEDED: 'CLARIFICATION_NEEDED',
  ERROR_RESOLVED: 'ERROR_RESOLVED',
  LEARNING_RECORDED: 'LEARNING_RECORDED',
  MEMORY_STORED: 'MEMORY_STORED',
  MEMORY_RETRIEVED: 'MEMORY_RETRIEVED',
} as const;

export type RoomEventType = (typeof ROOM_EVENTS)[keyof typeof ROOM_EVENTS];

export const AGENT_IDS = {
  LEADER: 'agent_leader',
  RESEARCH: 'agent_research',
  ENGINEERING: 'agent_engineering',
  AUTOMATION: 'agent_automation',
  QA: 'agent_qa',
  MEMORY: 'agent_memory',
} as const;

export type AgentId = (typeof AGENT_IDS)[keyof typeof AGENT_IDS];

export const AGENT_STATES = [
  'idle',
  'thinking',
  'moving',
  'working',
  'consulting',
  'blocked',
  'reviewing',
  'reporting',
  'offline',
  'fallback_mode',
] as const;

export type AgentStateType = (typeof AGENT_STATES)[number];

export const TASK_STATES = [
  'draft',
  'queued',
  'analyzing',
  'planned',
  'assigned',
  'in_progress',
  'waiting_tool',
  'waiting_approval',
  'reviewing',
  'completed',
  'failed',
  'cancelled',
] as const;

export type TaskStateType = (typeof TASK_STATES)[number];

export interface AgentDeskConfig {
  id: AgentId;
  name: string;
  role: string;
  title: string;
  deskX: number;
  deskY: number;
  color: string;
  shirtColor: number;
  hairColor: number;
  specialty: string;
}

export const AGENT_CONFIGS: Record<AgentId, AgentDeskConfig> = {
  [AGENT_IDS.LEADER]: {
    id: AGENT_IDS.LEADER,
    name: 'Zen (Leader)',
    role: 'Chief of Staff',
    title: 'Multi-Agent Orchestrator',
    deskX: 384,
    deskY: 180,
    color: '#3B82F6',
    shirtColor: 0x3b82f6,
    hairColor: 0x1e293b,
    specialty: 'Task decomposition, delegation, result aggregation & validation',
  },
  [AGENT_IDS.RESEARCH]: {
    id: AGENT_IDS.RESEARCH,
    name: 'Dre (Research)',
    role: 'Research Specialist',
    title: 'Context & Documentation Analyst',
    deskX: 180,
    deskY: 175,
    color: '#8B5CF6',
    shirtColor: 0x8b5cf6,
    hairColor: 0x854d0e,
    specialty: 'Requirements discovery, web documentation scraping, domain synthesis',
  },
  [AGENT_IDS.ENGINEERING]: {
    id: AGENT_IDS.ENGINEERING,
    name: 'Iky (Engineering)',
    role: 'Senior Engineer',
    title: 'Software Architect & Implementer',
    deskX: 580,
    deskY: 165,
    color: '#10B981',
    shirtColor: 0x10b981,
    hairColor: 0x0f172a,
    specialty: 'Architecture design, code generation, refactoring, bug fixing',
  },
  [AGENT_IDS.AUTOMATION]: {
    id: AGENT_IDS.AUTOMATION,
    name: 'Gus (Automation)',
    role: 'Automation Architect',
    title: 'Workflows & Tool Integrator',
    deskX: 610,
    deskY: 275,
    color: '#F59E0B',
    shirtColor: 0xf59e0b,
    hairColor: 0xb45309,
    specialty: 'Workflow automation, CLI tools execution, API integration',
  },
  [AGENT_IDS.QA]: {
    id: AGENT_IDS.QA,
    name: 'Rai (QA & Critic)',
    role: 'QA & Critic Specialist',
    title: 'Verification & Anti-Hallucination Officer',
    deskX: 210,
    deskY: 280,
    color: '#EC4899',
    shirtColor: 0xec4899,
    hairColor: 0x581c87,
    specialty: 'Logic checks, schema validation, test planning, edge case evaluation',
  },
  [AGENT_IDS.MEMORY]: {
    id: AGENT_IDS.MEMORY,
    name: 'Dhea (Memory)',
    role: 'Knowledge & Memory Curator',
    title: 'Episodic & Vector Memory Officer',
    deskX: 390,
    deskY: 290,
    color: '#06B6D4',
    shirtColor: 0x06b6d4,
    hairColor: 0x0e7490,
    specialty: 'Vector embeddings, short/long-term recall, project preference curation',
  },
};

export const DEFAULT_OFFICE_CONFIG = {
  roomWidth: 768,
  roomHeight: 480,
  tileSize: 16,
  bossSpawnX: 384,
  bossSpawnY: 410,
  bossSpeed: 160,
  interactionRadius: 65,
};
