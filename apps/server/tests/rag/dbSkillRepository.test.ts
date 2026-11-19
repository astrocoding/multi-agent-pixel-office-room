import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dbPool } from '../../src/db/connection.js';
import { initDatabase } from '../../src/db/schema.js';
import { DbSkillRepository } from '../../src/rag/dbSkillRepository.js';
import type { SkillMetadata, KnowledgeSource, MarkdownChunk } from '@agent-office/ai';

describe('Database Skill Repository Integration (Phase 1)', () => {
  let isDbAvailable = false;

  before(async () => {
    try {
      await initDatabase();
      isDbAvailable = true;
    } catch (e) {
      console.warn('[DB Test] PostgreSQL not reachable in sandbox, integration test will skip DB writes:', (e as Error).message);
      isDbAvailable = false;
    }
  });

  after(async () => {
    if (isDbAvailable) {
      try {
        // Clean up test data
        await dbPool.query("DELETE FROM skill_registry WHERE slug LIKE 'test_%';");
        await dbPool.query("DELETE FROM knowledge_sources WHERE id LIKE 'ks_test_%';");
      } catch {
        // ignore cleanup error
      }
    }
  });

  it('upserts and retrieves a skill by slug', async (t) => {
    if (!isDbAvailable) return t.skip('Database unavailable');

    const testSkill: SkillMetadata = {
      skillId: 'test_audit_skill',
      name: 'Test Audit Procedure',
      description: 'Used for automated integration testing',
      canonicalPath: '/workspace/skills/test_audit/SKILL.md',
      entrypoint: 'skills/test_audit/SKILL.md',
      references: ['references/ref1.md'],
      triggers: ['test_trigger', 'verify'],
      roles: ['qa', 'engineering'],
      languages: ['id', 'en'],
      sourceTrust: 'unreviewed_proposal',
      status: 'proposed',
      approvedBy: null,
      version: '1.0.0',
      contentHash: 'hash_test_123',
      activeVersion: '1.0.0',
      scope: 'office',
      owner: 'system',
      metadata: { test: true },
    };

    await DbSkillRepository.upsertSkill(testSkill);
    const fetched = await DbSkillRepository.getSkillBySlug('test_audit_skill');

    assert.ok(fetched !== null);
    assert.strictEqual(fetched.skillId, 'test_audit_skill');
    assert.strictEqual(fetched.name, 'Test Audit Procedure');
    assert.strictEqual(fetched.status, 'proposed');
    assert.deepStrictEqual(fetched.triggers, ['test_trigger', 'verify']);
  });

  it('updates skill approval status in database', async (t) => {
    if (!isDbAvailable) return t.skip('Database unavailable');

    await DbSkillRepository.updateSkillStatus('test_audit_skill', 'approved', 'admin_tester');
    const fetched = await DbSkillRepository.getSkillBySlug('test_audit_skill');

    assert.ok(fetched !== null);
    assert.strictEqual(fetched.status, 'approved');
    assert.strictEqual(fetched.approvedBy, 'admin_tester');
    assert.strictEqual(fetched.sourceTrust, 'approved_local_skill');
  });

  it('stores and replaces chunks transactionally for a source', async (t) => {
    if (!isDbAvailable) return t.skip('Database unavailable');

    const source: KnowledgeSource = {
      id: 'ks_test_source',
      sourceType: 'skill',
      canonicalPath: '/workspace/skills/test_audit/SKILL.md',
      title: 'Test Source',
      version: '1.0.0',
      status: 'approved',
      trustLevel: 'approved_local_skill',
      projectId: 'default',
      ownerId: 'system',
      aclPolicy: { visibility: 'internal' },
      language: 'id',
      contentHash: 'hash_source_abc',
      embeddingModelId: null,
    };

    await DbSkillRepository.upsertKnowledgeSource(source);

    const chunk1: MarkdownChunk = {
      id: 'chk_test_1',
      sourceId: source.id,
      parentSectionId: null,
      headingPath: 'Test Header',
      headingLevel: 1,
      startLine: 1,
      endLine: 10,
      content: '# Test Header\nFirst chunk content',
      tokenCount: 15,
      chunkHash: 'hash_chunk_1',
      visibility: 'internal',
    };

    await DbSkillRepository.replaceChunks(source.id, [chunk1]);
    const fetchedChunks = await DbSkillRepository.getChunksBySourceId(source.id);

    assert.strictEqual(fetchedChunks.length, 1);
    assert.strictEqual(fetchedChunks[0].headingPath, 'Test Header');
    assert.strictEqual(fetchedChunks[0].content, '# Test Header\nFirst chunk content');
  });

  it('tombstones a knowledge source and purges its chunks', async (t) => {
    if (!isDbAvailable) return t.skip('Database unavailable');

    await DbSkillRepository.tombstoneKnowledgeSource('/workspace/skills/test_audit/SKILL.md');
    const fetched = await DbSkillRepository.getKnowledgeSourceByPath('/workspace/skills/test_audit/SKILL.md');
    // Active query returns null because deleted_at IS NOT NULL
    assert.strictEqual(fetched, null);

    const remainingChunks = await DbSkillRepository.getChunksBySourceId('ks_test_source');
    assert.strictEqual(remainingChunks.length, 0);
  });
});

