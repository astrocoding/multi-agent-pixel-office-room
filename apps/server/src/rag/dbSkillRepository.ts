import { dbPool } from '../db/connection.js';
import type {
  SkillMetadata,
  SkillStatus,
  KnowledgeSource,
  MarkdownChunk,
} from '@agent-office/ai';

export class DbSkillRepository {
  /**
   * Upserts a skill record into skill_registry.
   */
  public static async upsertSkill(skill: SkillMetadata): Promise<void> {
    const id = skill.skillId.startsWith('sk_') ? skill.skillId : `sk_${skill.skillId}`;
    await dbPool.query(
      `
      INSERT INTO skill_registry (
        id, slug, name, description, version, entrypoint_path,
        "references", triggers, roles, languages, source_trust,
        status, approved_by, content_hash, active_version, metadata, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        version = EXCLUDED.version,
        entrypoint_path = EXCLUDED.entrypoint_path,
        "references" = EXCLUDED."references",
        triggers = EXCLUDED.triggers,
        roles = EXCLUDED.roles,
        languages = EXCLUDED.languages,
        content_hash = EXCLUDED.content_hash,
        active_version = EXCLUDED.active_version,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
    `,
      [
        id,
        skill.skillId,
        skill.name,
        skill.description,
        skill.version,
        skill.entrypoint,
        JSON.stringify(skill.references),
        JSON.stringify(skill.triggers),
        JSON.stringify(skill.roles),
        JSON.stringify(skill.languages),
        skill.sourceTrust,
        skill.status,
        skill.approvedBy,
        skill.contentHash,
        skill.activeVersion,
        JSON.stringify(skill.metadata || {}),
      ]
    );
  }

  /**
   * Fetches a skill by its slug / skillId.
   */
  public static async getSkillBySlug(slug: string): Promise<SkillMetadata | null> {
    const res = await dbPool.query(
      'SELECT * FROM skill_registry WHERE slug = $1 LIMIT 1;',
      [slug]
    );
    if (res.rows.length === 0) return null;
    return this.mapSkillRow(res.rows[0]);
  }

  /**
   * Lists skills with optional status and role filters.
   */
  public static async listSkills(filter?: {
    status?: SkillStatus;
    role?: string;
  }): Promise<SkillMetadata[]> {
    let query = 'SELECT * FROM skill_registry WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.status) {
      params.push(filter.status);
      query += ` AND status = $${params.length}`;
    }

    query += ' ORDER BY name ASC;';
    const res = await dbPool.query(query, params);

    let items = res.rows.map((r) => this.mapSkillRow(r));
    if (filter?.role) {
      items = items.filter((s) => s.roles.length === 0 || s.roles.includes(filter.role!));
    }
    return items;
  }

  /**
   * Updates skill approval status.
   */
  public static async updateSkillStatus(
    slug: string,
    status: SkillStatus,
    approvedBy?: string
  ): Promise<void> {
    const sourceTrust = status === 'approved' ? 'approved_local_skill' : 'unreviewed_proposal';
    await dbPool.query(
      `
      UPDATE skill_registry
      SET status = $1, approved_by = $2, source_trust = $3, updated_at = NOW()
      WHERE slug = $4;
    `,
      [status, approvedBy || null, sourceTrust, slug]
    );
  }

  /**
   * Upserts a knowledge source record.
   */
  public static async upsertKnowledgeSource(source: KnowledgeSource): Promise<void> {
    await dbPool.query(
      `
      INSERT INTO knowledge_sources (
        id, source_type, canonical_path, title, version, status,
        trust_level, project_id, owner_id, acl_policy, language,
        content_hash, embedding_model_id, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (canonical_path) DO UPDATE SET
        title = EXCLUDED.title,
        version = EXCLUDED.version,
        status = EXCLUDED.status,
        trust_level = EXCLUDED.trust_level,
        acl_policy = EXCLUDED.acl_policy,
        language = EXCLUDED.language,
        content_hash = EXCLUDED.content_hash,
        embedding_model_id = EXCLUDED.embedding_model_id,
        updated_at = NOW(),
        deleted_at = NULL;
    `,
      [
        source.id,
        source.sourceType,
        source.canonicalPath,
        source.title,
        source.version,
        source.status,
        source.trustLevel,
        source.projectId,
        source.ownerId,
        JSON.stringify(source.aclPolicy || {}),
        source.language,
        source.contentHash,
        source.embeddingModelId,
      ]
    );
  }

  /**
   * Fetches a knowledge source by its canonical path.
   */
  public static async getKnowledgeSourceByPath(
    canonicalPath: string
  ): Promise<KnowledgeSource | null> {
    const res = await dbPool.query(
      'SELECT * FROM knowledge_sources WHERE canonical_path = $1 AND deleted_at IS NULL LIMIT 1;',
      [canonicalPath]
    );
    if (res.rows.length === 0) return null;
    return this.mapSourceRow(res.rows[0]);
  }

  /**
   * Lists all active knowledge sources.
   */
  public static async listKnowledgeSources(): Promise<KnowledgeSource[]> {
    const res = await dbPool.query(
      'SELECT * FROM knowledge_sources WHERE deleted_at IS NULL ORDER BY created_at ASC;'
    );
    return res.rows.map((r) => this.mapSourceRow(r));
  }

  /**
   * Replaces chunks for a source transactionally.
   */
  public static async replaceChunks(
    sourceId: string,
    chunks: MarkdownChunk[]
  ): Promise<void> {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Delete previous chunks for this source
      await client.query('DELETE FROM knowledge_chunks WHERE source_id = $1;', [sourceId]);

      // 2. Insert new chunks
      for (const chunk of chunks) {
        await client.query(
          `
          INSERT INTO knowledge_chunks (
            id, source_id, parent_section_id, heading_path, heading_level,
            start_line, end_line, content, token_count, chunk_hash,
            visibility, search_vector, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_tsvector('simple', $8), NOW());
        `,
          [
            chunk.id,
            chunk.sourceId,
            chunk.parentSectionId,
            chunk.headingPath,
            chunk.headingLevel,
            chunk.startLine,
            chunk.endLine,
            chunk.content,
            chunk.tokenCount,
            chunk.chunkHash,
            chunk.visibility || 'internal',
          ]
        );
      }

      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves chunks for a given source ID.
   */
  public static async getChunksBySourceId(sourceId: string): Promise<MarkdownChunk[]> {
    const res = await dbPool.query(
      'SELECT * FROM knowledge_chunks WHERE source_id = $1 ORDER BY start_line ASC;',
      [sourceId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      sourceId: r.source_id,
      parentSectionId: r.parent_section_id,
      headingPath: r.heading_path,
      headingLevel: r.heading_level,
      startLine: r.start_line,
      endLine: r.end_line,
      content: r.content,
      tokenCount: r.token_count,
      chunkHash: r.chunk_hash,
      visibility: r.visibility,
      createdAt: r.created_at?.toISOString?.() || r.created_at,
    }));
  }

  /**
   * Marks a knowledge source as tombstoned (soft-deleted) and removes its chunks.
   */
  public static async tombstoneKnowledgeSource(canonicalPath: string): Promise<void> {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN;');

      const srcRes = await client.query(
        'SELECT id FROM knowledge_sources WHERE canonical_path = $1;',
        [canonicalPath]
      );
      if (srcRes.rows.length > 0) {
        const sourceId = srcRes.rows[0].id;
        await client.query('DELETE FROM knowledge_chunks WHERE source_id = $1;', [sourceId]);
        await client.query(
          `UPDATE knowledge_sources
           SET status = 'tombstone', deleted_at = NOW(), updated_at = NOW()
           WHERE id = $1;`,
          [sourceId]
        );
      }

      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  private static mapSkillRow(r: Record<string, unknown>): SkillMetadata {
    return {
      skillId: r.slug as string,
      name: r.name as string,
      description: (r.description as string) || '',
      canonicalPath: r.entrypoint_path as string,
      entrypoint: r.entrypoint_path as string,
      references: (r.references as string[]) || [],
      triggers: (r.triggers as string[]) || [],
      roles: (r.roles as string[]) || [],
      languages: (r.languages as string[]) || ['id', 'en'],
      sourceTrust: (r.source_trust as SkillMetadata['sourceTrust']) || 'unreviewed_proposal',
      status: (r.status as SkillStatus) || 'proposed',
      approvedBy: (r.approved_by as string | null) || null,
      version: (r.version as string) || '1.0.0',
      contentHash: r.content_hash as string,
      activeVersion: (r.active_version as string) || '1.0.0',
      scope: 'office',
      owner: 'system',
      metadata: (r.metadata as Record<string, unknown>) || {},
      createdAt: (r.created_at as Date)?.toISOString?.() || (r.created_at as string),
      updatedAt: (r.updated_at as Date)?.toISOString?.() || (r.updated_at as string),
    };
  }

  private static mapSourceRow(r: Record<string, unknown>): KnowledgeSource {
    return {
      id: r.id as string,
      sourceType: (r.source_type as KnowledgeSource['sourceType']) || 'skill',
      canonicalPath: r.canonical_path as string,
      title: r.title as string,
      version: (r.version as string) || '1.0.0',
      status: (r.status as KnowledgeSource['status']) || 'proposed',
      trustLevel: (r.trust_level as KnowledgeSource['trustLevel']) || 'unreviewed_proposal',
      projectId: (r.project_id as string) || 'default',
      ownerId: (r.owner_id as string) || 'system',
      aclPolicy: (r.acl_policy as Record<string, unknown>) || { visibility: 'internal' },
      language: (r.language as string) || 'id',
      contentHash: r.content_hash as string,
      embeddingModelId: (r.embedding_model_id as string | null) || null,
      createdAt: (r.created_at as Date)?.toISOString?.() || (r.created_at as string),
      updatedAt: (r.updated_at as Date)?.toISOString?.() || (r.updated_at as string),
      deletedAt: (r.deleted_at as Date)?.toISOString?.() || (r.deleted_at as string | null),
    };
  }
}
