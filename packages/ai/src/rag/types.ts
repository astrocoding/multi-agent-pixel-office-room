import { z } from 'zod';

export const SkillStatusSchema = z.enum(['proposed', 'approved', 'disabled']);
export type SkillStatus = z.infer<typeof SkillStatusSchema>;

export const SourceTrustLevelSchema = z.enum([
  'approved_local_skill',
  'unreviewed_proposal',
  'untrusted_external',
  'system_builtin',
]);
export type SourceTrustLevel = z.infer<typeof SourceTrustLevelSchema>;

export const SourceTypeSchema = z.enum(['skill', 'reference', 'doc']);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const KnowledgeSourceStatusSchema = z.enum([
  'proposed',
  'approved',
  'quarantined',
  'tombstone',
  'disabled',
]);
export type KnowledgeSourceStatus = z.infer<typeof KnowledgeSourceStatusSchema>;

export const RawFrontmatterSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  id: z.string().optional(),
  description: z.string().optional(),
  desc: z.string().optional(),
  version: z.string().optional(),
  triggers: z.union([z.array(z.string()), z.string()]).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  roles: z.union([z.array(z.string()), z.string()]).optional(),
  agents: z.union([z.array(z.string()), z.string()]).optional(),
  languages: z.union([z.array(z.string()), z.string()]).optional(),
  lang: z.union([z.array(z.string()), z.string()]).optional(),
  references: z.array(z.string()).optional(),
  status: SkillStatusSchema.optional(),
  trust: SourceTrustLevelSchema.optional(),
  scope: z.string().optional(),
  owner: z.string().optional(),
}).passthrough();
export type RawFrontmatter = z.infer<typeof RawFrontmatterSchema>;

export const SkillMetadataSchema = z.object({
  skillId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  canonicalPath: z.string().min(1),
  entrypoint: z.string().min(1),
  references: z.array(z.string()).default([]),
  triggers: z.array(z.string()).default([]),
  roles: z.array(z.string()).default([]),
  languages: z.array(z.string()).default(['id', 'en']),
  sourceTrust: SourceTrustLevelSchema.default('unreviewed_proposal'),
  status: SkillStatusSchema.default('proposed'),
  approvedBy: z.string().nullable().default(null),
  version: z.string().default('1.0.0'),
  contentHash: z.string().min(1),
  activeVersion: z.string().default('1.0.0'),
  scope: z.string().default('office'),
  owner: z.string().default('system'),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

export const MarkdownChunkSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  parentSectionId: z.string().nullable().default(null),
  headingPath: z.string().default(''),
  headingLevel: z.number().int().min(0).max(6).default(1),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  content: z.string(),
  tokenCount: z.number().int().min(0).default(0),
  chunkHash: z.string().min(1),
  visibility: z.string().default('internal'),
  createdAt: z.string().optional(),
});
export type MarkdownChunk = z.infer<typeof MarkdownChunkSchema>;

export const KnowledgeSourceSchema = z.object({
  id: z.string().min(1),
  sourceType: SourceTypeSchema.default('skill'),
  canonicalPath: z.string().min(1),
  title: z.string().min(1),
  version: z.string().default('1.0.0'),
  status: KnowledgeSourceStatusSchema.default('proposed'),
  trustLevel: SourceTrustLevelSchema.default('unreviewed_proposal'),
  projectId: z.string().default('default'),
  ownerId: z.string().default('system'),
  aclPolicy: z.record(z.string(), z.unknown()).default({ visibility: 'internal' }),
  language: z.string().default('id'),
  contentHash: z.string().min(1),
  embeddingModelId: z.string().nullable().default(null),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  deletedAt: z.string().nullable().default(null).optional(),
});
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;

export const IngestionResultSchema = z.object({
  totalDiscovered: z.number().int().min(0),
  indexed: z.array(z.string()),
  updated: z.array(z.string()),
  skipped: z.array(z.string()),
  tombstoned: z.array(z.string()),
  quarantined: z.array(
    z.object({
      path: z.string(),
      reason: z.string(),
    })
  ),
  dryRun: z.boolean(),
  timestamp: z.string(),
});
export type IngestionResult = z.infer<typeof IngestionResultSchema>;
