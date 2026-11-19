import { z } from 'zod';

export const MemoryCategorySchema = z.enum([
  'working',
  'episodic',
  'semantic_project',
  'user_preference',
  'procedural',
]);
export type MemoryCategory = z.infer<typeof MemoryCategorySchema>;

export const VerificationStateSchema = z.enum([
  'observed_fact',
  'user_claim',
  'model_inference',
  'verified_truth',
]);
export type VerificationState = z.infer<typeof VerificationStateSchema>;

export const RetentionPolicySchema = z.enum([
  'session',
  '30_days',
  '90_days',
  'permanent',
]);
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

export const MemoryVisibilitySchema = z.enum([
  'private',
  'project',
  'internal',
  'public',
]);
export type MemoryVisibility = z.infer<typeof MemoryVisibilitySchema>;

export const SourceProvenanceSchema = z.object({
  taskId: z.string().optional(),
  sourceId: z.string().optional(),
  fileLineRange: z.string().optional(),
  reporter: z.string().optional(),
  toolExecutionId: z.string().optional(),
  modelUsed: z.string().optional(),
});
export type SourceProvenance = z.infer<typeof SourceProvenanceSchema>;

export const ScopedMemoryRecordSchema = z.object({
  id: z.string().min(1),
  category: MemoryCategorySchema,
  content: z.string().min(1),
  summary: z.string().optional(),
  actorId: z.string().default('boss'),
  projectScope: z.string().default('default'),
  tenantId: z.string().default('default'),
  visibility: MemoryVisibilitySchema.default('project'),
  verificationState: VerificationStateSchema.default('observed_fact'),
  confidence: z.number().min(0).max(1).default(1.0),
  sourceProvenance: SourceProvenanceSchema.default({}),
  retentionPolicy: RetentionPolicySchema.default('permanent'),
  expiresAt: z.string().nullable().default(null),
  supersededBy: z.string().nullable().default(null),
  deletedAt: z.string().nullable().default(null),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ScopedMemoryRecord = z.infer<typeof ScopedMemoryRecordSchema>;

export const FeedbackTypeSchema = z.enum([
  'user_approval',
  'user_rejection',
  'explicit_correction',
  'failed_test',
  'invalid_artifact',
  'execution_error',
]);
export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;

export const FeedbackTargetTypeSchema = z.enum([
  'skill',
  'artifact',
  'task_result',
  'preference',
  'retrieval',
]);
export type FeedbackTargetType = z.infer<typeof FeedbackTargetTypeSchema>;

export const FeedbackRecordSchema = z.object({
  id: z.string().min(1),
  idempotencyKey: z.string().min(1),
  taskId: z.string().optional(),
  actorId: z.string().default('boss'),
  projectScope: z.string().default('default'),
  feedbackType: FeedbackTypeSchema,
  targetType: FeedbackTargetTypeSchema,
  targetIdentifier: z.string().min(1),
  rating: z.number().int().min(-1).max(1).default(0),
  details: z.string().min(1),
  evidence: z.record(z.string(), z.unknown()).default({}),
  processed: z.boolean().default(false),
  proposalId: z.string().optional(),
  createdAt: z.string(),
});
export type FeedbackRecord = z.infer<typeof FeedbackRecordSchema>;

export const ProposalTypeSchema = z.enum([
  'trigger_tuning',
  'instruction_refinement',
  'example_addition',
  'retrieval_budget',
  'artifact_template',
]);
export type ProposalType = z.infer<typeof ProposalTypeSchema>;

export const ProposalStatusSchema = z.enum([
  'pending_review',
  'approved',
  'rejected',
  'published',
  'rolled_back',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const ImprovementProposalSchema = z.object({
  id: z.string().min(1),
  targetSkillId: z.string().min(1),
  proposalType: ProposalTypeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  justification: z.string().min(1),
  linkedFeedbackIds: z.array(z.string()).default([]),
  beforeDiff: z.string().default(''),
  afterDiff: z.string().min(1),
  evaluationScore: z.number().min(0).max(1).default(0.0),
  evaluationMetrics: z.record(z.string(), z.unknown()).default({}),
  securityAuditStatus: z.enum(['pending', 'passed', 'flagged']).default('pending'),
  securityNotes: z.string().optional(),
  status: ProposalStatusSchema.default('pending_review'),
  proposedBy: z.string().min(1),
  reviewedBy: z.string().nullable().default(null),
  decisionReason: z.string().nullable().default(null),
  publishedVersion: z.string().nullable().default(null),
  rollbackPayload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
});
export type ImprovementProposal = z.infer<typeof ImprovementProposalSchema>;

export const MemoryFeatureFlagsSchema = z.object({
  enableMemoryCapture: z.boolean().default(true),
  enableMemoryRetrieval: z.boolean().default(true),
  enableImprovementProposals: z.boolean().default(true),
  enableAutoProposalGeneration: z.boolean().default(true),
});
export type MemoryFeatureFlags = z.infer<typeof MemoryFeatureFlagsSchema>;

