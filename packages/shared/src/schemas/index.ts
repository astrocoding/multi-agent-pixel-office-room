import { z } from 'zod';
import { AGENT_IDS, AGENT_STATES, ROOM_EVENTS, TASK_STATES } from '../constants/index.js';

export const agentIdSchema = z.enum([
  AGENT_IDS.LEADER,
  AGENT_IDS.RESEARCH,
  AGENT_IDS.ENGINEERING,
  AGENT_IDS.AUTOMATION,
  AGENT_IDS.QA,
  AGENT_IDS.MEMORY,
]);

export const agentStateSchema = z.enum(AGENT_STATES);
export const taskStateSchema = z.enum(TASK_STATES);
export const roomEventSchema = z.nativeEnum(ROOM_EVENTS);

export const taskAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['image', 'code', 'document', 'other']),
  mimeType: z.string(),
  size: z.number(),
  content: z.string().optional(),
  base64Data: z.string().optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(120),
  description: z.string().min(5, 'Description must be at least 5 characters').max(2000),
  targetAgentId: agentIdSchema.optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  attachments: z.array(taskAttachmentSchema).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: taskStateSchema,
  assignedAgentId: agentIdSchema.optional().nullable(),
  outputPayload: z.record(z.string(), z.unknown()).optional(),
});

export const bubbleChatSchema = z.object({
  agentId: z.union([agentIdSchema, z.literal('boss')]),
  text: z.string().min(1).max(280),
  durationMs: z.number().int().min(1000).max(15000).default(4000),
  bubbleType: z.enum(['speech', 'thought', 'alert']).default('speech'),
});

export const memoryCreateSchema = z.object({
  agentId: agentIdSchema,
  memoryType: z.enum(['short_term', 'episodic', 'semantic', 'project_preference']),
  content: z.string().min(3),
  summary: z.string().optional(),
  importance: z.number().int().min(1).max(10).default(5),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const memoryQuerySchema = z.object({
  query: z.string().min(1),
  agentId: agentIdSchema.optional(),
  memoryType: z.enum(['short_term', 'episodic', 'semantic', 'project_preference']).optional(),
  limit: z.number().int().min(1).max(50).default(5),
  threshold: z.number().min(0).max(1).default(0.6),
});

export const playerMoveSchema = z.object({
  x: z.number(),
  y: z.number(),
  direction: z.enum(['up', 'down', 'left', 'right', 'idle']),
});

export const chatSendSchema = z.object({
  text: z.string().min(1).max(4000),
  recipientAgentId: agentIdSchema.optional(),
  sessionId: z.string().optional(),
});

export const createChatSessionSchema = z.object({
  title: z.string().max(255).optional(),
  projectScope: z.string().max(120).default('default'),
  primaryIntent: z.string().max(120).optional(),
  targetAgentId: z.string().max(64).default(AGENT_IDS.LEADER),
  contextSnapshot: z.record(z.string(), z.unknown()).default({}),
});

export const updateChatSessionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  projectScope: z.string().max(120).optional(),
  primaryIntent: z.string().max(120).optional(),
  summary: z.string().optional(),
  contextSnapshot: z.record(z.string(), z.unknown()).optional(),
  isPinned: z.boolean().optional(),
});

