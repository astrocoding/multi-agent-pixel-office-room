import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { dbPool } from '../../src/db/connection.js';
import { initDatabase } from '../../src/db/schema.js';
import { AuthorizedRetriever } from '../../src/rag/authorizedRetriever.js';
import { DbSkillRepository } from '../../src/rag/dbSkillRepository.js';
import { FallbackProvider, type KnowledgeSource, type MarkdownChunk } from '@agent-office/ai';

describe('Authorized Knowledge Retriever Integration (Phase 2)', () => {
  let isDbAvailable = false;
  let retriever: AuthorizedRetriever;
  const fallbackProvider = new FallbackProvider();

  before(async () => {
    try {
      await initDatabase();
      isDbAvailable = true;
      retriever = new AuthorizedRetriever(fallbackProvider);

      // Seed a test document with restricted ACL (finance project)
      const financeSource: KnowledgeSource = {
        id: 'ks_test_finance_secret',
        sourceType: 'doc',
        canonicalPath: 'docs/finance/budget_2027.md',
        title: 'Confidential Finance Budget 2027',
        version: '1.0.0',
        status: 'approved',
        trustLevel: 'approved_local_skill',
        projectId: 'finance_dept',
        ownerId: 'cfo',
        aclPolicy: { visibility: 'finance_only' },
        language: 'en',
        contentHash: 'hash_finance_sec',
        embeddingModelId: null,
      };
      await DbSkillRepository.upsertKnowledgeSource(financeSource);

      const financeChunk: MarkdownChunk = {
        id: 'chk_test_finance_1',
        sourceId: financeSource.id,
        parentSectionId: null,
        headingPath: 'Budget Forecast',
        headingLevel: 1,
        startLine: 1,
        endLine: 20,
        content: '# Budget Forecast\nConfidential quarterly revenue targets for 2027.',
        tokenCount: 25,
        chunkHash: 'hash_chk_fin_1',
        visibility: 'internal',
      };
      await DbSkillRepository.replaceChunks(financeSource.id, [financeChunk]);

      // Seed a proposed/unapproved document
      const unapprovedSource: KnowledgeSource = {
        id: 'ks_test_unapproved_draft',
        sourceType: 'doc',
        canonicalPath: 'docs/drafts/unreviewed_plan.md',
        title: 'Unreviewed Secret Architecture Draft',
        version: '0.1.0',
        status: 'proposed', // Unapproved!
        trustLevel: 'unreviewed_proposal',
        projectId: 'default',
        ownerId: 'intern',
        aclPolicy: { visibility: 'internal' },
        language: 'en',
        contentHash: 'hash_unapp_draft',
        embeddingModelId: null,
      };
      await DbSkillRepository.upsertKnowledgeSource(unapprovedSource);

      const unapprovedChunk: MarkdownChunk = {
        id: 'chk_test_unapproved_1',
        sourceId: unapprovedSource.id,
        parentSectionId: null,
        headingPath: 'Draft Ideas',
        headingLevel: 1,
        startLine: 1,
        endLine: 10,
        content: '# Draft Ideas\nUnreviewed draft ideas that should never be returned by RAG.',
        tokenCount: 20,
        chunkHash: 'hash_chk_unapp_1',
        visibility: 'internal',
      };
      await DbSkillRepository.replaceChunks(unapprovedSource.id, [unapprovedChunk]);

    } catch (e) {
      console.warn('[Retriever Test] Database setup failed:', (e as Error).message);
      isDbAvailable = false;
    }
  });

  after(async () => {
    if (isDbAvailable) {
      try {
        await dbPool.query("DELETE FROM knowledge_sources WHERE id LIKE 'ks_test_%';");
      } catch {
        // cleanup ignore
      }
    }
  });

  it('retrieves relevant chunks using English technical queries', async (t) => {
    if (!isDbAvailable) return t.skip('Database unavailable');

    const result = await retriever.search({
      query: 'non-negotiable boundaries emoji',
      scope: {
        actorId: 'user_boss',
        projectScope: 'default',
        channel: 'web',
      },
      bypassVector: true, // test lexical baseline
    });

    assert.strictEqual(result.noEvidence, false);
    assert.ok(result.passages.length > 0);
    const topPassage = result.passages[0];
    assert.ok(
      topPassage.content.toLowerCase().includes('emoji') ||
      topPassage.citation.headingPath.toLowerCase().includes('boundaries')
    );
  });

  it('retrieves relevant chunks using Indonesian queries', async (t) => {
    if (!isDbAvailable) return t.skip('Database unavailable');

    const result = await retriever.search({
      query: 'pedoman penulisan humanizer untuk telegram',
      scope: {
        actorId: 'user_boss',
        projectScope: 'default',
        channel: 'telegram',
      },
    });

    assert.strictEqual(result.noEvidence, false);
    assert.ok(result.passages.length > 0 || result.selectedSkills.length > 0);
    assert.ok(result.selectedSkills.some((s) => s.skillId === 'humanizer'));
  });

  it('retrieves exact filenames and code identifiers', async (t) => {
    if (!isDbAvailable) return t.skip('Database unavailable');

    const result = await retriever.search({
      query: 'skills/humanizer/SKILL.md',
      scope: {
        actorId: 'user_boss',
        projectScope: 'default',
        channel: 'web',
      },
    });

    assert.strictEqual(result.noEvidence, false);
    assert.ok(result.passages.some((p) => p.citation.canonicalPath.includes('SKILL.md')));
  });

  it('enforces ACL isolation across projects at the SQL data layer', async (t) => {
    if (!isDbAvailable) return t.skip('Database unavailable');

    // Query from 'marketing_dept' looking for 'Confidential Finance Budget 2027'
    const unauthorizedResult = await retriever.search({
      query: 'Confidential Finance Budget 2027',
      scope: {
        actorId: 'marketer_1',
        projectScope: 'marketing_dept', // Different project!
        channel: 'web',
      },
    });

    // Must NOT find the finance document
    assert.strictEqual(
      unauthorizedResult.passages.some((p) => p.citation.canonicalPath.includes('budget_2027.md')),
      false
    );

    // Query from 'finance_dept' looking for the same document
    const authorizedResult = await retriever.search({
      query: 'Confidential Finance Budget 2027',
      scope: {
        actorId: 'accountant_1',
        projectScope: 'finance_dept', // Authorized project!
        channel: 'web',
      },
    });

    // MUST find the document
    assert.ok(
      authorizedResult.passages.some((p) => p.citation.canonicalPath.includes('budget_2027.md'))
    );
  });

  it('blocks unapproved, disabled, or draft documents from appearing in results', async (t) => {
    if (!isDbAvailable) return t.skip('Database unavailable');

    const result = await retriever.search({
      query: 'Unreviewed Secret Architecture Draft ideas',
      scope: {
        actorId: 'user_boss',
        projectScope: 'default',
        channel: 'web',
      },
    });

    // Unapproved documents (status = 'proposed') must never be returned
    assert.strictEqual(
      result.passages.some((p) => p.citation.canonicalPath.includes('unreviewed_plan.md')),
      false
    );
  });

  it('returns clean zero-evidence indicator for ungrounded queries', async (t) => {
    if (!isDbAvailable) return t.skip('Database unavailable');

    const result = await retriever.search({
      query: 'completely nonexistent quantum teleportation recipe xyzzz12345',
      scope: {
        actorId: 'user_boss',
        projectScope: 'default',
        channel: 'web',
      },
    });

    assert.strictEqual(result.noEvidence, true);
    assert.strictEqual(result.passages.length, 0);
  });
});

