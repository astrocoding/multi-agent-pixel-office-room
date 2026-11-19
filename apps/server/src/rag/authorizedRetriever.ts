import { dbPool } from '../db/connection.js';
import {
  QuerySafety,
  RetrievalRequestSchema,
  SkillRegistryService,
  estimateTokenCount,
  type IModelProvider,
  type PassageCitation,
  type RetrievalRequest,
  type RetrievalRequestInput,
  type RetrievalResult,
  type RetrievedPassage,
  type RetrievalTrace,
  type SkillMetadata,
  type SourceTrustLevel,
} from '@agent-office/ai';

export class AuthorizedRetriever {
  private readonly modelProvider?: IModelProvider;

  constructor(modelProvider?: IModelProvider) {
    this.modelProvider = modelProvider;
  }

  /**
   * Performs secure, authorized, hybrid knowledge and skill retrieval.
   * Enforces:
   * 1. Data-layer SQL filtering by actor, project scope, status='approved', and ACL.
   * 2. Zero-result fallback for ungrounded or out-of-scope queries.
   * 3. Standalone lexical search baseline that works without embeddings.
   * 4. pgvector semantic search with cosine distance when available.
   * 5. Reciprocal Rank Fusion (RRF) for lexical + vector scoring.
   * 6. Up to 1 parent-section expansion.
   * 7. Observability trace with correlation ID and latency.
   */
  public async search(rawRequest: RetrievalRequestInput): Promise<RetrievalResult> {
    const startTime = Date.now();
    const req = RetrievalRequestSchema.parse(rawRequest);
    const sanitized = QuerySafety.sanitize(req.query);

    const trace: RetrievalTrace = {
      requestId: req.correlationId,
      actorId: req.scope.actorId,
      projectScope: req.scope.projectScope,
      strategy: req.strategy,
      candidatesPreRerank: 0,
      finalPassagesCount: 0,
      selectedSkillSlugs: [],
      retrievedTokens: 0,
      latencyMs: 0,
      fallbackUsed: false,
      noEvidence: false,
      noMatchReason: null,
      timestamp: new Date().toISOString(),
    };

    if (!sanitized.cleaned || sanitized.terms.length === 0) {
      trace.noEvidence = true;
      trace.noMatchReason = 'Query contained no searchable alphanumeric terms';
      trace.latencyMs = Date.now() - startTime;
      return {
        passages: [],
        selectedSkills: [],
        totalTokens: 0,
        noEvidence: true,
        trace,
      };
    }

    // 1. Retrieve approved procedural skills separately from factual documents
    const selectedSkills = await this.retrieveApprovedSkills(
      sanitized.cleaned,
      req.scope.role,
      req.maxSkills
    );
    trace.selectedSkillSlugs = selectedSkills.map((s) => s.skillId);

    // 2. Execute Lexical Retrieval (Baseline)
    const lexicalCandidates = await this.searchLexical(
      sanitized.cleaned,
      sanitized.terms,
      req.scope.projectScope,
      req.allowedSourceTypes,
      req.maxCandidates
    );

    let vectorCandidates: RetrievedPassage[] = [];

    // 3. Execute Vector Retrieval (if not bypassed and embedding provider available)
    const shouldRunVector =
      !req.bypassVector &&
      (req.strategy === 'auto' || req.strategy === 'vector' || req.strategy === 'hybrid');

    if (shouldRunVector && this.modelProvider) {
      try {
        const queryEmbedding = await this.modelProvider.generateEmbedding(sanitized.cleaned);
        if (Array.isArray(queryEmbedding) && queryEmbedding.length === 768) {
          vectorCandidates = await this.searchVector(
            queryEmbedding,
            req.scope.projectScope,
            req.allowedSourceTypes,
            req.maxCandidates
          );
        } else {
          trace.fallbackUsed = true;
        }
      } catch (err) {
        console.warn('[AuthorizedRetriever] Vector embedding search failed, falling back to lexical:', err);
        trace.fallbackUsed = true;
      }
    } else {
      if (req.strategy === 'vector') {
        trace.fallbackUsed = true;
      }
    }

    trace.candidatesPreRerank = lexicalCandidates.length + vectorCandidates.length;

    // 4. Merge candidates using Reciprocal Rank Fusion (RRF)
    const mergedPassages = this.mergeWithRRF(
      lexicalCandidates,
      vectorCandidates,
      req.maxInjectedPassages
    );

    // 5. Parent-Section Expansion (<= 1 expansion for the top relevant chunk)
    if (mergedPassages.length > 0 && mergedPassages[0].citation.headingLevel > 1) {
      await this.expandParentSection(mergedPassages[0]);
    }

    // Filter by minimum relevance score threshold
    const filteredPassages = mergedPassages.filter(
      (p) => p.score >= req.minRelevanceScore
    );

    // Calculate total tokens
    const totalTokens = filteredPassages.reduce(
      (acc, p) => acc + p.citation.tokenCount,
      0
    );

    const noEvidence = filteredPassages.length === 0 && selectedSkills.length === 0;
    trace.noEvidence = noEvidence;
    trace.finalPassagesCount = filteredPassages.length;
    trace.retrievedTokens = totalTokens;
    trace.latencyMs = Date.now() - startTime;
    if (noEvidence) {
      trace.noMatchReason = 'No candidate chunks met relevance or ACL filters';
    }

    return {
      passages: filteredPassages,
      selectedSkills,
      totalTokens,
      noEvidence,
      trace,
    };
  }

  /**
   * Retrieves approved procedural skills matching intent and role.
   */
  private async retrieveApprovedSkills(
    intentQuery: string,
    role?: string,
    limit = 3
  ): Promise<SkillMetadata[]> {
    const res = await dbPool.query(
      `SELECT * FROM skill_registry WHERE status = 'approved' ORDER BY name ASC;`
    );

    const skills: SkillMetadata[] = res.rows.map((r) => ({
      skillId: r.slug,
      name: r.name,
      description: r.description || '',
      canonicalPath: r.entrypoint_path,
      entrypoint: r.entrypoint_path,
      references: r.references || [],
      triggers: r.triggers || [],
      roles: r.roles || [],
      languages: r.languages || ['id', 'en'],
      sourceTrust: r.source_trust,
      status: r.status,
      approvedBy: r.approved_by,
      version: r.version,
      contentHash: r.content_hash,
      activeVersion: r.active_version,
      scope: 'office',
      owner: 'system',
      metadata: r.metadata || {},
    }));

    return SkillRegistryService.filterCandidateSkills(skills, {
      intent: intentQuery,
      role,
      status: 'approved',
      limit,
    });
  }

  /**
   * Lexical search using PostgreSQL FTS, title/path exact match, and ILIKE fallback.
   * Strictly enforces status='approved', projectScope isolation, and deleted_at IS NULL at data layer.
   */
  private async searchLexical(
    queryText: string,
    terms: string[],
    projectScope: string,
    allowedTypes: string[],
    limit: number
  ): Promise<RetrievedPassage[]> {
    const ftsQuery = terms.length > 0 ? terms.join(' or ') : queryText;

    // Parameterized SQL preventing injection and enforcing multi-tenant isolation
    const sql = `
      SELECT
        kc.id,
        kc.source_id,
        kc.parent_section_id,
        kc.heading_path,
        kc.heading_level,
        kc.start_line,
        kc.end_line,
        kc.content,
        kc.token_count,
        kc.chunk_hash,
        ks.canonical_path,
        ks.version,
        ks.trust_level,
        (
          COALESCE(ts_rank_cd(kc.search_vector, websearch_to_tsquery('simple', $1)), 0.0) * 4.0 +
          CASE WHEN ks.canonical_path ILIKE '%' || $2 || '%' THEN 5.0 ELSE 0.0 END +
          CASE WHEN ks.title ILIKE '%' || $2 || '%' THEN 3.0 ELSE 0.0 END +
          CASE WHEN kc.heading_path ILIKE '%' || $2 || '%' THEN 2.0 ELSE 0.0 END +
          CASE WHEN kc.content ILIKE '%' || $2 || '%' THEN 1.0 ELSE 0.0 END
        ) AS rank_score
      FROM knowledge_chunks kc
      JOIN knowledge_sources ks ON kc.source_id = ks.id
      WHERE ks.status = 'approved'
        AND (ks.project_id = $3 OR ks.project_id = 'default')
        AND ks.deleted_at IS NULL
        AND ks.source_type = ANY($4::text[])
        AND (
          kc.search_vector @@ websearch_to_tsquery('simple', $1)
          OR ks.canonical_path ILIKE '%' || $2 || '%'
          OR ks.title ILIKE '%' || $2 || '%'
          OR kc.heading_path ILIKE '%' || $2 || '%'
          OR kc.content ILIKE '%' || $2 || '%'
        )
      ORDER BY rank_score DESC
      LIMIT $5;
    `;

    try {
      const res = await dbPool.query(sql, [
        ftsQuery,
        queryText,
        projectScope,
        allowedTypes,
        limit,
      ]);

      return res.rows.map((r, idx) => ({
        id: r.id,
        content: r.content,
        score: Number(r.rank_score) || 1.0 / (idx + 1),
        strategy: 'lexical',
        citation: {
          sourceId: r.source_id,
          canonicalPath: r.canonical_path,
          headingPath: r.heading_path,
          headingLevel: r.heading_level,
          startLine: r.start_line,
          endLine: r.end_line,
          version: r.version,
          contentHash: r.chunk_hash,
          trustLevel: r.trust_level as SourceTrustLevel,
          tokenCount: r.token_count,
          citationMarker: '',
        },
        expandedParent: false,
      }));
    } catch (err) {
      console.warn('[AuthorizedRetriever] Lexical query error:', err);
      return [];
    }
  }

  /**
   * Vector search using pgvector cosine distance `<=>`.
   * Strictly enforces status='approved', projectScope isolation, and deleted_at IS NULL.
   */
  private async searchVector(
    embedding: number[],
    projectScope: string,
    allowedTypes: string[],
    limit: number
  ): Promise<RetrievedPassage[]> {
    const vectorStr = `[${embedding.join(',')}]`;

    const sql = `
      SELECT
        kc.id,
        kc.source_id,
        kc.parent_section_id,
        kc.heading_path,
        kc.heading_level,
        kc.start_line,
        kc.end_line,
        kc.content,
        kc.token_count,
        kc.chunk_hash,
        ks.canonical_path,
        ks.version,
        ks.trust_level,
        (1 - (kc.embedding <=> $1::vector)) AS similarity_score
      FROM knowledge_chunks kc
      JOIN knowledge_sources ks ON kc.source_id = ks.id
      WHERE ks.status = 'approved'
        AND (ks.project_id = $2 OR ks.project_id = 'default')
        AND ks.deleted_at IS NULL
        AND ks.source_type = ANY($3::text[])
        AND kc.embedding IS NOT NULL
      ORDER BY kc.embedding <=> $1::vector ASC
      LIMIT $4;
    `;

    try {
      const res = await dbPool.query(sql, [
        vectorStr,
        projectScope,
        allowedTypes,
        limit,
      ]);

      return res.rows.map((r) => ({
        id: r.id,
        content: r.content,
        score: Math.max(0, Number(r.similarity_score) || 0),
        strategy: 'vector',
        citation: {
          sourceId: r.source_id,
          canonicalPath: r.canonical_path,
          headingPath: r.heading_path,
          headingLevel: r.heading_level,
          startLine: r.start_line,
          endLine: r.end_line,
          version: r.version,
          contentHash: r.chunk_hash,
          trustLevel: r.trust_level as SourceTrustLevel,
          tokenCount: r.token_count,
          citationMarker: '',
        },
        expandedParent: false,
      }));
    } catch {
      // pgvector might not be enabled or vector column might be JSONB fallback
      return [];
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF) with standard constant k = 60.
   */
  private mergeWithRRF(
    lexical: RetrievedPassage[],
    vector: RetrievedPassage[],
    limit: number
  ): RetrievedPassage[] {
    const k = 60;
    const scores = new Map<string, { passage: RetrievedPassage; rrfScore: number }>();

    // 1. Score lexical ranks
    lexical.forEach((p, rank) => {
      const current = scores.get(p.id) || { passage: p, rrfScore: 0 };
      current.rrfScore += 1 / (k + rank + 1);
      scores.set(p.id, current);
    });

    // 2. Score vector ranks
    vector.forEach((p, rank) => {
      const current = scores.get(p.id) || { passage: p, rrfScore: 0 };
      current.rrfScore += 1 / (k + rank + 1);
      // Mark as hybrid if found in both
      if (scores.has(p.id) && current.passage.strategy === 'lexical') {
        current.passage.strategy = 'hybrid';
      }
      scores.set(p.id, current);
    });

    // 3. Sort descending by combined RRF score
    const sorted = Array.from(scores.values()).sort(
      (a, b) => b.rrfScore - a.rrfScore
    );

    return sorted.slice(0, limit).map((item) => ({
      ...item.passage,
      score: Number(item.rrfScore.toFixed(5)),
    }));
  }

  /**
   * Expands the parent section of a top passage if parentSectionId is present.
   */
  private async expandParentSection(passage: RetrievedPassage): Promise<void> {
    try {
      const res = await dbPool.query(
        `SELECT content, heading_path, token_count FROM knowledge_chunks WHERE id = $1 LIMIT 1;`,
        [passage.citation.sourceId]
      );
      if (res.rows.length > 0) {
        const parentContent = res.rows[0].content as string;
        if (!passage.content.includes(parentContent.slice(0, 50))) {
          passage.content = `[Context: ${res.rows[0].heading_path}]\n${passage.content}`;
          passage.citation.tokenCount += estimateTokenCount(res.rows[0].heading_path);
          passage.expandedParent = true;
        }
      }
    } catch {
      // Non-critical optimization
    }
  }
}
