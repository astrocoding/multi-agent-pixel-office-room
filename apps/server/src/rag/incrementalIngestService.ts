import path from 'node:path';
import fs from 'node:fs';
import {
  SkillDiscoveryService,
  parseMarkdownDocument,
  SkillTrustPolicy,
  type IngestionResult,
  type KnowledgeSource,
  type SkillMetadata,
} from '@agent-office/ai';
import { DbSkillRepository } from './dbSkillRepository.js';

export interface IngestionOptions {
  skillsRoot?: string;
  dryRun?: boolean;
  autoApproveSlugs?: string[];
  approver?: string;
}

export class IncrementalIngestionService {
  private readonly discovery: SkillDiscoveryService;
  private readonly skillsRoot: string;

  constructor(skillsRoot?: string) {
    this.skillsRoot = skillsRoot
      ? path.resolve(skillsRoot)
      : path.resolve(process.cwd(), 'skills');
    this.discovery = new SkillDiscoveryService({
      allowlistedRoots: [this.skillsRoot],
    });
  }

  /**
   * Executes incremental ingestion over the skills directory.
   */
  public async ingest(options: IngestionOptions = {}): Promise<IngestionResult> {
    const dryRun = options.dryRun ?? false;
    const autoApproveSlugs = new Set((options.autoApproveSlugs || []).map((s) => s.toLowerCase()));
    const approver = options.approver || 'system_seed';

    const result: IngestionResult = {
      totalDiscovered: 0,
      indexed: [],
      updated: [],
      skipped: [],
      tombstoned: [],
      quarantined: [],
      dryRun,
      timestamp: new Date().toISOString(),
    };

    // 1. Scan filesystem safely
    const scan = this.discovery.scanSkillsDirectory(this.skillsRoot);
    result.quarantined.push(...scan.quarantined);

    // Filter out duplicate aliases from indexing, but keep track of them
    const validSkills = scan.skills.filter((s) => !s.isDuplicateAlias);
    const discoveredPaths = new Set<string>();

    for (const sk of validSkills) {
      discoveredPaths.add(sk.canonicalPath);
    }
    for (const ref of scan.referenceFiles) {
      discoveredPaths.add(ref.canonicalPath);
    }

    result.totalDiscovered = discoveredPaths.size;

    // 2. Fetch existing active sources and skills from database (if not dryRun or to compare)
    let existingSources: KnowledgeSource[] = [];
    const existingSkillsMap = new Map<string, SkillMetadata>();
    try {
      existingSources = await DbSkillRepository.listKnowledgeSources();
      const existingSkills = await DbSkillRepository.listSkills();
      for (const sk of existingSkills) {
        existingSkillsMap.set(sk.skillId, sk);
      }
    } catch (err) {
      if (!dryRun) {
        throw err;
      }
    }

    const existingMap = new Map<string, KnowledgeSource>();
    for (const src of existingSources) {
      existingMap.set(src.canonicalPath, src);
    }

    // 3. Ingest primary skills
    for (const sk of validSkills) {
      const existing = existingMap.get(sk.canonicalPath);
      const existingSkill = existingSkillsMap.get(sk.skillId);
      const isUnchanged =
        existing &&
        existing.contentHash === sk.contentHash &&
        existingSkill &&
        existingSkill.contentHash === sk.contentHash;

      if (isUnchanged) {
        result.skipped.push(sk.entrypointPath);
        continue;
      }

      const isUpdate = !!existing;
      const sourceId = `ks_${sk.skillId}`;
      const parsed = parseMarkdownDocument(sourceId, sk.rawContent);

      const isPreApproved = autoApproveSlugs.has(sk.skillId);
      const trust = SkillTrustPolicy.evaluateInitialTrust(
        sk.canonicalPath,
        isPreApproved,
        approver
      );

      const skillRecord: SkillMetadata = {
        skillId: sk.skillId,
        name: sk.name,
        description: sk.description,
        canonicalPath: sk.canonicalPath,
        entrypoint: sk.entrypointPath,
        references: sk.references,
        triggers: sk.triggers,
        roles: sk.roles,
        languages: sk.languages,
        sourceTrust: trust.sourceTrust,
        status: trust.status,
        approvedBy: trust.approvedBy,
        version: sk.version,
        contentHash: sk.contentHash,
        activeVersion: sk.version,
        scope: 'office',
        owner: 'system',
        metadata: {
          layout: sk.layout,
          chunkCount: parsed.chunks.length,
          frontmatter: parsed.frontmatter,
        },
      };

      const sourceRecord: KnowledgeSource = {
        id: sourceId,
        sourceType: 'skill',
        canonicalPath: sk.canonicalPath,
        title: sk.name,
        version: sk.version,
        status: trust.status,
        trustLevel: trust.sourceTrust,
        projectId: 'default',
        ownerId: 'system',
        aclPolicy: { visibility: 'internal' },
        language: sk.languages[0] || 'id',
        contentHash: sk.contentHash,
        embeddingModelId: null,
      };

      if (!dryRun) {
        await DbSkillRepository.upsertKnowledgeSource(sourceRecord);
        await DbSkillRepository.replaceChunks(sourceRecord.id, parsed.chunks);
        await DbSkillRepository.upsertSkill(skillRecord);
      }

      if (isUpdate) {
        result.updated.push(sk.entrypointPath);
      } else {
        result.indexed.push(sk.entrypointPath);
      }
    }

    // 4. Ingest reference files
    for (const ref of scan.referenceFiles) {
      const existing = existingMap.get(ref.canonicalPath);
      const isUnchanged = existing && existing.contentHash === ref.contentHash;
      const relPath = path.relative(process.cwd(), ref.canonicalPath);

      if (isUnchanged) {
        result.skipped.push(relPath);
        continue;
      }

      const isUpdate = !!existing;
      const refId = `ks_ref_${ref.parentSkillId}_${path.basename(ref.canonicalPath, '.md')}`;
      const parsed = parseMarkdownDocument(refId, ref.rawContent);

      const isPreApproved = autoApproveSlugs.has(ref.parentSkillId);
      const trust = SkillTrustPolicy.evaluateInitialTrust(
        ref.canonicalPath,
        isPreApproved,
        approver
      );

      const sourceRecord: KnowledgeSource = {
        id: refId,
        sourceType: 'reference',
        canonicalPath: ref.canonicalPath,
        title: `Reference: ${path.basename(ref.canonicalPath)}`,
        version: '1.0.0',
        status: trust.status,
        trustLevel: trust.sourceTrust,
        projectId: 'default',
        ownerId: 'system',
        aclPolicy: { visibility: 'internal' },
        language: 'id',
        contentHash: ref.contentHash,
        embeddingModelId: null,
      };

      if (!dryRun) {
        await DbSkillRepository.upsertKnowledgeSource(sourceRecord);
        await DbSkillRepository.replaceChunks(sourceRecord.id, parsed.chunks);
      }

      if (isUpdate) {
        result.updated.push(relPath);
      } else {
        result.indexed.push(relPath);
      }
    }

    // 5. Detect deleted/tombstoned entries
    for (const [canonPath, source] of existingMap.entries()) {
      // Check if file still exists on disk
      if (!fs.existsSync(canonPath)) {
        if (!dryRun) {
          await DbSkillRepository.tombstoneKnowledgeSource(canonPath);
        }
        result.tombstoned.push(canonPath);
      }
    }

    return result;
  }
}
