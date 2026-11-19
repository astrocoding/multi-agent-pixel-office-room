import { z } from 'zod';
import { AGENT_IDS, type AgentId } from '../constants/index.js';

export const agentIdSchema = z.enum([
  AGENT_IDS.LEADER,
  AGENT_IDS.RESEARCH,
  AGENT_IDS.ENGINEERING,
  AGENT_IDS.AUTOMATION,
  AGENT_IDS.QA,
  AGENT_IDS.MEMORY,
]);

export const taskAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['image', 'code', 'document', 'other']),
  mimeType: z.string(),
  size: z.number(),
  content: z.string().optional(),
  base64Data: z.string().optional(),
});

export const AnalysisDepthSchema = z.enum(['D0', 'D1', 'D2', 'D3', 'D4']);
export type AnalysisDepth = z.infer<typeof AnalysisDepthSchema>;

export const RiskTierSchema = z.enum(['R0', 'R1', 'R2', 'R3', 'R4']);
export type RiskTier = z.infer<typeof RiskTierSchema>;

export const ComplexityDimensionSchema = z.number().int().min(0).max(4).nullable();
export type ComplexityDimension = z.infer<typeof ComplexityDimensionSchema>;

export const ComplexityVectorSchema = z.object({
  S: ComplexityDimensionSchema, // Scope breadth (weight: 0.20)
  D: ComplexityDimensionSchema, // Dependency complexity (weight: 0.20)
  I: ComplexityDimensionSchema, // Integration novelty (weight: 0.15)
  U: ComplexityDimensionSchema, // Requirements uncertainty (weight: 0.20)
  V: ComplexityDimensionSchema, // Validation/acceptance load (weight: 0.15)
  C: ComplexityDimensionSchema, // Coordination/conflict (weight: 0.10)
});
export type ComplexityVector = z.infer<typeof ComplexityVectorSchema>;

export const ComplexityTierSchema = z.enum(['low', 'standard', 'moderate', 'high', 'very_high']);
export type ComplexityTier = z.infer<typeof ComplexityTierSchema>;

export const TaskIntakeSchema = z.object({
  intakeId: z.string().min(1),
  taskId: z.string().min(1),
  actorId: z.string().min(1),
  actorRole: z.enum(['owner', 'member', 'guest']).default('member'),
  projectScope: z.string().default('default'),
  tenantId: z.string().optional(),
  channel: z.enum(['web', 'telegram', 'terminal', 'api']).default('web'),
  rawRequest: z.string().min(1),
  normalizedGoal: z.string().min(1),
  requestedDeliverable: z.enum(['chat', 'code_patch', 'markdown_file', 'json', 'summary', 'artifact']),
  constraints: z.array(z.string()).default([]),
  attachments: z.array(taskAttachmentSchema).default([]),
  confirmedPreferences: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.string(),
});
export type TaskIntake = z.infer<typeof TaskIntakeSchema>;

export const ClarificationTypeSchema = z.enum(['BLOCKING', 'RECOMMENDED', 'OPTIONAL', 'FORBIDDEN_ACTION']);
export type ClarificationType = z.infer<typeof ClarificationTypeSchema>;

export const ClarificationOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  tradeoffs: z.string().min(1),
  isRecommended: z.boolean().default(false),
});
export type ClarificationOption = z.infer<typeof ClarificationOptionSchema>;

export const ClarificationItemSchema = z.object({
  question: z.string().min(1),
  type: ClarificationTypeSchema,
  blockingReason: z.string().optional(),
  options: z.array(ClarificationOptionSchema).default([]),
  assumedDefault: z.string().optional(),
});
export type ClarificationItem = z.infer<typeof ClarificationItemSchema>;

export const WorkUnitSchema = z.object({
  workId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  outputContract: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  eligibleCapabilities: z.array(z.string()).default([]),
  assignedAgent: agentIdSchema,
  risk: RiskTierSchema.default('R1'),
  allowedTools: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).min(1),
  resourceLocks: z.array(z.string()).default([]),
  estimatedTokens: z.number().int().min(0).default(0),
  estimatedDurationMs: z.number().int().min(0).default(0),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'blocked']).default('pending'),
  result: z.unknown().optional(),
});
export type WorkUnit = z.infer<typeof WorkUnitSchema>;

export const WorkPlanSchema = z.object({
  planId: z.string().min(1),
  taskId: z.string().min(1),
  summary: z.string().min(1),
  analysisDepth: AnalysisDepthSchema,
  complexityTier: ComplexityTierSchema,
  riskTier: RiskTierSchema,
  requiresOwnerApproval: z.boolean().default(false),
  approvalReason: z.string().optional(),
  workUnits: z.array(WorkUnitSchema),
  criticalPathWorkIds: z.array(z.string()).default([]),
  estimatedTotalDurationMs: z.number().int().min(0).default(0),
  estimatedTotalTokens: z.number().int().min(0).default(0),
  version: z.number().int().min(1).default(1),
});
export type WorkPlan = z.infer<typeof WorkPlanSchema>;

export const DecisionRecordSchema = z.object({
  decisionId: z.string().min(1),
  taskId: z.string().min(1),
  actorId: z.string().min(1),
  policyVersion: z.string().default('1.0.0'),
  timestamp: z.string(),
  intent: z.string().min(1),
  analysisDepth: AnalysisDepthSchema,
  complexityVector: ComplexityVectorSchema,
  complexityScore: z.number().min(0).max(100).nullable(),
  complexityScoreRange: z.tuple([z.number(), z.number()]).optional(),
  complexityTier: ComplexityTierSchema,
  riskTier: RiskTierSchema,
  confidenceBand: z.enum(['high', 'medium', 'low', 'insufficient_evidence']),
  blockingUnknowns: z.array(z.string()).default([]),
  nonBlockingAssumptions: z.array(z.string()).default([]),
  clarificationItems: z.array(ClarificationItemSchema).default([]),
  selectedCapabilities: z.array(z.string()).default([]),
  assignedAgents: z.array(agentIdSchema).default([]),
  rationaleSummary: z.string().min(1),
  approvalRequirement: z.object({
    required: z.boolean(),
    reason: z.string().optional(),
    gatedAction: z.string().optional(),
  }),
  evidenceRefs: z.array(z.string()).default([]),
  limitationNotes: z.array(z.string()).default([]),
});
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

export const AgentHandoffSchema = z.object({
  handoffId: z.string().min(1),
  taskId: z.string().min(1),
  workId: z.string().min(1),
  fromAgent: agentIdSchema,
  toAgent: agentIdSchema,
  scopeContract: z.string().min(1),
  inputArtifacts: z.array(z.string()).default([]),
  verificationProof: z.string().optional(),
  timestamp: z.string(),
});
export type AgentHandoff = z.infer<typeof AgentHandoffSchema>;
