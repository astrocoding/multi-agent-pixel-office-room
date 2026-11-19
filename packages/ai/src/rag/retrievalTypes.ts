import { z } from 'zod';
import {
  SkillStatusSchema,
  SourceTrustLevelSchema,
  SourceTypeSchema,
  type SkillMetadata,
} from './types.js';

export const RetrievalChannelSchema = z.enum(['web', 'telegram', 'terminal', 'api']);
export type RetrievalChannel = z.infer<typeof RetrievalChannelSchema>;

export const RetrievalStrategySchema = z.enum([
  'auto',
  'exact',
  'lexical',
  'vector',
  'hybrid',
]);
export type RetrievalStrategy = z.infer<typeof RetrievalStrategySchema>;

export const RetrievalScopeSchema = z.object({
  actorId: z.string().min(1),
  projectScope: z.string().default('default'),
  channel: RetrievalChannelSchema.default('web'),
  role: z.string().optional(),
});
export type RetrievalScope = z.infer<typeof RetrievalScopeSchema>;

export const RetrievalRequestSchema = z.object({
  query: z.string().min(1).max(500),
  scope: RetrievalScopeSchema,
  intentHint: z.string().optional(),
  allowedSourceTypes: z.array(SourceTypeSchema).default(['skill', 'reference', 'doc']),
  tokenBudget: z.number().int().min(100).max(8000).default(4000),
  maxCandidates: z.number().int().min(1).max(50).default(20),
  maxInjectedPassages: z.number().int().min(1).max(10).default(6),
  maxSkills: z.number().int().min(1).max(5).default(3),
  correlationId: z.string().default(() => `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
  strategy: RetrievalStrategySchema.default('auto'),
  bypassVector: z.boolean().default(false),
  minRelevanceScore: z.number().min(0).max(1).default(0.01),
});
export type RetrievalRequestInput = z.input<typeof RetrievalRequestSchema>;
export type RetrievalRequest = z.infer<typeof RetrievalRequestSchema>;

export const PassageCitationSchema = z.object({
  sourceId: z.string().min(1),
  canonicalPath: z.string().min(1),
  headingPath: z.string().default(''),
  headingLevel: z.number().int().min(0).max(6).default(1),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  version: z.string().default('1.0.0'),
  contentHash: z.string().min(1),
  trustLevel: SourceTrustLevelSchema.default('unreviewed_proposal'),
  tokenCount: z.number().int().min(0).default(0),
  citationMarker: z.string().default(''),
});
export type PassageCitation = z.infer<typeof PassageCitationSchema>;

export const RetrievedPassageSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  score: z.number().min(0),
  strategy: RetrievalStrategySchema,
  citation: PassageCitationSchema,
  expandedParent: z.boolean().default(false),
});
export type RetrievedPassage = z.infer<typeof RetrievedPassageSchema>;

export const RetrievalTraceSchema = z.object({
  requestId: z.string(),
  actorId: z.string(),
  projectScope: z.string(),
  strategy: z.string(),
  candidatesPreRerank: z.number().int().min(0),
  finalPassagesCount: z.number().int().min(0),
  selectedSkillSlugs: z.array(z.string()),
  retrievedTokens: z.number().int().min(0),
  latencyMs: z.number().min(0),
  fallbackUsed: z.boolean(),
  noEvidence: z.boolean(),
  noMatchReason: z.string().nullable().default(null),
  timestamp: z.string(),
});
export type RetrievalTrace = z.infer<typeof RetrievalTraceSchema>;

export const RetrievalResultSchema = z.object({
  passages: z.array(RetrievedPassageSchema),
  selectedSkills: z.array(z.custom<SkillMetadata>()),
  totalTokens: z.number().int().min(0),
  noEvidence: z.boolean(),
  trace: RetrievalTraceSchema,
});
export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;

export const BuiltContextSchema = z.object({
  formattedContext: z.string(),
  citations: z.array(PassageCitationSchema),
  totalTokens: z.number().int().min(0),
  noEvidence: z.boolean(),
  selectedSkills: z.array(z.custom<SkillMetadata>()),
  trace: RetrievalTraceSchema,
});
export type BuiltContext = z.infer<typeof BuiltContextSchema>;

