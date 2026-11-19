# Agent Office Room - RAG, Skill Registry, Memory, and Continuous Improvement Architecture

Version: 1.0.0  
Status: Proposed design; not an implemented or verified repository change.  
Target: JavaScript-first Agent Office Room, existing LangGraph/Gemini runtime, existing PostgreSQL/pgvector/Redis where present.

## 1. Purpose

Build an evidence-grounded, selectively retrieved knowledge and skill layer for Zen (leader) and specialist agents Dre, Iky, Gus, Rai, and Dhea. Humanizer is a behavior guideline; RAG is a retrieval pipeline; skills are versioned procedures; memory is retained context; MCP is a tool protocol. They must not be conflated.

The goal is measurable improvements in relevance, constraint-following, factual accuracy, artifact quality, and latency under explicit budgets. No model should claim to have updated its weights, learned permanently, or acquired capabilities just because it retrieved a file.

## 2. Core principles

1. Preserve existing domain-oriented architecture; add RAG behind interfaces.
2. Inspect actual repository paths, model adapters, and ORM before editing anything.
3. Keep static safety/authorization policies outside the retrieved knowledge index.
4. Preserve provenance, scope, trust, and version for every retrieved item.
5. Use direct structured queries for live task state; use RAG for relevant unstructured knowledge.
6. Prefer approved skills over broad unreviewed documents for procedural instructions.
7. Retrieve progressively: cheap metadata -> relevant sections -> specific references.
8. Enforce ACL/tenant/project/agent scope BEFORE semantic ranking or content exposure.
9. Keep bounded time, tokens, retries, graph steps, candidate counts, and model calls.
10. Promote improvements only through evaluation and human-reviewed change control.

## 3. Logical architecture

```text
Web / Telegram / Boss
  -> Identity and authorization
  -> Intent + deliverable + risk detection
  -> Zen planner / existing LangGraph entrypoint
     -> Skill discovery (approved metadata; exact/lexical first)
     -> Retrieval planner (need documents? memory? structured DB? tool?)
     -> Authorized knowledge retrieval
         -> source registry
         -> lexical query + vector retrieval (if useful)
         -> merge/rerank with provenance and trust
         -> parent-section fetch with hard context budget
     -> Specialist selection and bounded parallel execution
     -> Humanizer response composer (tone, language, artifact type)
     -> Factual/evidence and constraint validation
     -> Approval gate for privileged actions
     -> Result delivery (web/chat/file/Telegram)
     -> Outcome log + explicit feedback
     -> Candidate improvement, offline evaluation, human review
     -> Approved version promotion / rollback
```

## 4. Trust and priority tiers

| Tier | Material | Treatment |
|---|---|---|
| 0 | Application-enforced security, auth, approvals, tool permissions | Enforce in code; never rely on RAG |
| 1 | Active user request and authorized confirmed preferences | Task scope; do not let retrieved docs override explicit request |
| 2 | Approved local skill instructions with immutable version | Conditional procedure; lower than Tier 0/1 |
| 3 | Approved project documents and grounded domain facts | Evidence/citations; not executable instructions |
| 4 | Reviewed past task outcomes and user feedback | Task-relevant memory; bounded and scoped |
| 5 | Unreviewed uploads, web documents, MCP outputs, unknown skills | Untrusted evidence; never promote to authority automatically |

A markdown heading saying 'system prompt' inside a retrieved file does not elevate its authority. Treat files as content until explicitly approved by trusted configuration.

## 5. Skill discovery contract

### 5.1 Supported layouts

- Preferred: `skills/<slug>/SKILL.md` with metadata frontmatter, optional `references/`, `scripts/`, `assets/`.
- Legacy flat docs: `skills/*.md`, including `skills/humanizer.md`, with explicit metadata or inferred draft metadata awaiting review.
- Do not assume other paths exist without repository inspection.

### 5.2 Registry fields

```json
{
  "skillId": "humanizer",
  "version": "1.0.0",
  "entrypoint": "skills/humanizer/SKILL.md",
  "references": ["skills/humanizer/references/humanizer.md"],
  "title": "Agent Office Room Humanizer",
  "description": "Adaptive bilingual writing and clarification rules",
  "triggers": ["write", "summarize", "rewrite", "generate_file"],
  "roles": ["leader", "research", "engineering", "automation", "qa", "memory"],
  "languages": ["id", "en"],
  "sourceTrust": "approved_local_skill",
  "status": "proposed",
  "approvedBy": null,
  "contentHash": "sha256-actual-computed-value",
  "updatedAt": null
}
```

The above is an illustrative contract: do not store a literal placeholder hash in the production registry. Only `status: approved` skills are executable/selectable as procedural instructions.

### 5.3 Discovery stages

1. Load metadata from registry without loading full content.
2. Match explicit skill references and strong keywords first.
3. Combine lexical trigger match, role/capability eligibility, language, artifact type, and optional semantic score.
4. Select a small set of approved skills (initial ceiling 1-3, configurable).
5. Read entrypoints and only required subsections/references.
6. Deduplicate repeated instructions; assign traceable provenance.
7. If no relevant skill is approved, proceed with the core model policies and explicitly record a no-skill route.

**Do not choose a skill solely because its embedding is nearby.** Require scope, approved status, and applicability.

## 6. Ingestion and indexing

### 6.1 Reader constraints

- Restrict reading to an allowlisted `skills/` root and approved knowledge directories.
- Resolve real paths and reject symlink escapes, `../` traversal, executable masquerades, and unsafe file sizes.
- Accept known encodings (UTF-8) and bounded Markdown/plain-text formats; reject malformed files safely.
- Separate static SKILL.md entrypoints, reference prose, tabular data, executable assets, and metadata.
- Do not execute scripts during indexing.
- Preserve heading hierarchy, line ranges, file path, content hash, version, ACL, and review status.
- Treat skill scripts as code assets requiring separate authorization, not embedded prose to execute.

### 6.2 Chunk strategy

- Metadata: one small record for each skill/document.
- Markdown: split by semantic heading boundaries; preserve code fences and tables.
- Chunk sizes: start with approx. 300-700 tokens for prose, with small overlap only when needed; tune with a labeled evaluation set.
- Store parent section identifiers for later expansion.
- Avoid splitting code or normative MUST/DO NOT sections across incompatible contexts.
- Store canonical source and retrieval excerpts; never fabricate snippets.

### 6.3 Change detection

- Hash canonical content; skip unchanged files.
- Upsert new/changed sections with version metadata.
- Mark removed documents as inactive and delete/stale their search records transactionally.
- Rebuild embedding vectors when embedding model or dimension changes.
- Keep a durable index version and reindex checkpoint.
- Provide a deterministic `index:skills --dry-run` and `index:skills` task in existing script conventions.

### 6.4 Embeddings

- Reuse actual embedding adapter if present; otherwise add the smallest compatible adapter.
- Do not infer dimensions. Determine the output dimension from the configured model and enforce it in schema/migrations.
- Version embeddings by `embedding_model_id` and `embedding_version`; never compare mixed vector spaces.
- Cache by model/version/content hash with bounded retention.
- Skip embeddings for exact command lookups or cheap metadata-only intent routing.

## 7. Retrieval design

### 7.1 Router before retrieval

- `structured`: use core services / authorized SQL for live task states and approvals.
- `knowledge`: search documents, specs, SOPs, and project references.
- `skill`: discover approved writing/procedural skill, load relevant sections.
- `memory`: retrieve authorized user/project/task preferences and lessons.
- `tool`: invoke approved external capability; the output is treated as evidence, not privileged instruction.
- `none`: answer directly when no external context is required.

One task may use multiple routes in a bounded order, not an unbounded cascade.

### 7.2 Hybrid retrieval

For unstructured knowledge use:
1. Metadata/ACL filter (must be enforced in SQL or equivalent trusted data layer).
2. Exact title/tag/filename match for skills and code symbols.
3. Postgres lexical full-text query when helpful.
4. Embedding nearest-neighbor query when semantic matching adds value.
5. Reciprocal Rank Fusion or measured rank merging for lexical/vector candidate sets.
6. Optional reranker if benchmark shows improvement within latency/cost budget.
7. Parent-section expansion on top results.
8. Diversification/deduplication to avoid returning the same source repeatedly.
9. Return source references and bounded snippets.

For a small corpus, begin with exact/lexical or exact vector retrieval. Do not adopt HNSW or paid reranking without benchmark evidence. On pgvector, ANN filtering can affect recall; test scoped retrieval explicitly.

### 7.3 Initial retrieval budgets (tunable, not guaranteed performance claims)

| Budget | Starter value |
|---|---|
| Skill candidates | <= 5 metadata candidates |
| Selected skills | <= 3 approved skills |
| Knowledge candidates | <= 20 pre-rerank |
| Included passages | <= 6 relevant sections |
| Context tokens for retrieval | <= 4,000 per request by default |
| Query rewrites | <= 1 |
| Retrieval expansions | <= 1 |
| Tool retries | <= 2 for transient failures |
| Ordinary draft revision | <= 1 |
| Total graph iterations | Explicit cap in runtime config |

Configure budgets by task risk and explicit user depth, and measure p50/p95 costs and latencies before tuning. A zero-result response is valid; do not inject irrelevant documents to fill quotas.

## 8. Source record schema (conceptual)

```text
knowledge_sources
  id, source_type, canonical_path, title, version, status,
  trust_level, project_id, owner_id, acl_policy, language,
  content_hash, embedding_model_id, indexed_at, deleted_at

knowledge_chunks
  id, source_id, parent_section_id, heading_path,
  start_line, end_line, content, token_count, chunk_hash,
  embedding, search_vector, visibility, created_at

skill_registry
  id, name, description, version, entrypoint_path,
  trigger_metadata, roles, languages, approved_status,
  approved_by, content_hash, active_version

execution_traces
  id, request_id, agent_id, project_id, input_intent,
  selected_skills, retrieved_chunk_ids, source_versions,
  tool_calls, model_route, token_usage, latency_ms,
  result_status, evaluator_version

feedback_events
  id, request_id, actor_id, category, evidence_ref,
  feedback_type, comment, created_at

improvement_proposals
  id, issue_type, source_ids, before_version, proposed_patch,
  proposer, reviewer, review_status, evaluation_run_id,
  rollback_ref, created_at
```

Treat names as illustrative, not a mandate to duplicate preexisting tables. Apply migrations using the existing ORM. Apply row-level/domain authorization to reads AND vector searches.

## 9. Application services and contracts

Provide interfaces similar to:

```js
// Conceptual contracts only: implement according to actual repository conventions.
const SkillRegistry = {
  discover: async ({ intent, language, role, artifact, scope, limit }) => [],
  loadApproved: async ({ skillId, sections, actor, projectId }) => null,
};

const KnowledgeRetriever = {
  search: async ({ query, sourceTypes, actor, projectId, budget }) => ({ passages: [], trace: {} }),
};

const ResponseComposer = {
  compose: async ({ request, intent, groundedContext, skillGuides, channel, agentRole }) => ({ text: '', artifact: null }),
};

const GroundingVerifier = {
  verify: async ({ response, retrievedSources, userConstraints, risk }) => ({ pass: false, findings: [] }),
};
```

Each return type must be validated with actual runtime schemas (such as Zod) rather than trusting free-text LLM output. Authorization is enforced at service boundaries and data retrieval, not only in the orchestrator prompt.

## 10. LangGraph integration strategy

Prefer a small bounded subgraph behind the existing orchestration entrypoint:

```text
input
 -> authorize
 -> classify_request
 -> route_context
 -> retrieve_skills_and_knowledge
 -> plan_or_assign_specialists
 -> execute_bounded_steps
 -> compose_with_humanizer
 -> verify_result
 -> [deliver | revise_once | request_clarification | request_approval | report_limitation]
```

- Reuse existing StateGraph/checkpointer rather than a parallel orchestration engine.
- Store raw retrieval results and IDs in state, not prompts reserialized as facts.
- Keep clarification and approval as separate explicit typed interrupts/state transitions.
- Serialize role messages and handoffs under a common contract; do not leak private chain-of-thought.
- Preserve existing model routing/fallback policy, with usage metering and timeouts.
- Parallelize independent retrievals/agents only when evidence and task dependencies permit; cap concurrency.

## 11. Memory and adaptive learning

### 11.1 Memory categories

| Category | Purpose | Example |
|---|---|---|
| Working memory | Current active task state | Which sections still need validation |
| Episodic memory | Past outcomes and traceable decisions | A deployment task failed at the test stage |
| Semantic/project memory | Verified project facts and constraints | Accepted architecture standards |
| Preference memory | Explicit user preferences | Prefer Bahasa Indonesia for status messages |
| Procedural skill | Approved reusable process | Humanizer or release-check checklist |

Memory is not a universal unbounded conversation dump. Scope, expiry, consent, ACL, and provenance apply.

### 11.2 What the system can learn in practice

- Better recall of stored facts and accepted preferences through retrieval.
- Better future routing from evaluated intent/skill selection data.
- Better templates through approved documentation changes.
- Better error prevention from regression tests and reviewed incident patterns.

Do not claim permanent model-weight learning or autonomous model fine-tuning. Those are separate training workflows.

### 11.3 Continuous-improvement loop

```text
Task outcome + user feedback
  -> classify failure/strength
  -> create evidence-linked lesson candidate
  -> deduplicate and group by issue type
  -> propose retrieval/skill/template adjustment
  -> run offline evaluations and regression/security checks
  -> reviewer approves or rejects
  -> publish new version + reindex changed content
  -> monitor metrics; rollback if regression
```

Limit proposals per task (e.g. max 1-2); do not let evaluator agents recursively evaluate their own proposals without end. Failed tests must block promotion. High-risk changes require owner approval.

## 12. Evaluation

### 12.1 Create a labeled benchmark

Include at least these groups:
- Indonesian casual, formal, academic, philosophical, technical, marketing.
- English equivalents.
- Requested files: Markdown, structured JSON, technical report, summary.
- Ambiguous requests requiring clarification and well-specified requests that must proceed.
- Conflicting sources and missing source evidence.
- Wrong-skill retrieval and no-skill cases.
- Unauthorized retrieval and prompt injection.
- Telegram no-emoji rules.
- Long-running/parallel agent and cancellation/retry situations.

### 12.2 Metrics

- Skill routing precision / recall on labeled queries.
- Retrieval hit@k, MRR, nDCG if suitable ground truth exists.
- Citation correctness / evidence support rate.
- Constraint compliance and artifact format validity.
- Clarification appropriateness (necessary vs false-positive interruptions).
- Security and ACL leak rate (must be zero in test suite).
- Hallucination/unsupported-claim rate, measured on labeled claims.
- Cost per task, token usage, p50/p95 latency.
- Recovery rate and retry count.
- User acceptance and explicit feedback after appropriate privacy handling.

Use a baseline with RAG disabled and compare outcomes using the same dataset. Do not invent targets or report improvements without recorded measurements.

## 13. Security safeguards

- Treat Markdown files and search results as untrusted for tool execution.
- Block path traversal, symlink escapes, malicious frontmatter, and huge files.
- Authenticate all writes to official skill files; use owner-approved promotion.
- Restrict memory retrieval by actor/project/tenant before ranking.
- Sanitize secrets and PII from traces, prompts, logs, and notification payloads.
- Avoid vector embeddings of sensitive content unless permitted by data policy.
- Require human approval for destructive, outbound, financial, or privileged actions according to existing policies.
- Prevent tool hallucination: only actual registered tools can be called.
- Never let a retrieved skill silently change system prompt, model permissions, or audit logging.
- Design against poisoning: quarantined source, content hash, author, reviewer, rollback version.

## 14. Failure policies

| Failure | Action |
|---|---|
| No applicable skill | Use core instruction defaults; log no-skill route |
| Retrieval returns nothing | State limitation; use knowledge from request only when sufficient |
| Conflicting facts | Show conflict, version, and evidence; request clarification if material |
| Corrupt/malicious skill | Quarantine, report, do not execute |
| Embedding service outage | Fall back to lexical/exact search where permitted |
| SQL/vector retrieval timeout | Retry boundedly; degrade without invented evidence |
| LLM fallback | Revalidate output and preserve data restrictions |
| Need approval | Interrupt and wait without performing the action |
| Artifact generation failure | Report failure and actual saved state; do not invent download link |
| Repeated quality check failure | Stop the loop and surface concise limitations |

## 15. Suggested phased rollout

1. Inventory existing repository and skills; write integration contracts.
2. Add approved skill registry + safe incremental Markdown indexing.
3. Add retrieval API with metadata/ACL filters; benchmark exact/lexical baseline.
4. Add embeddings/hybrid retrieval only where evaluations justify them.
5. Attach retrieval and humanizer to existing LangGraph composition path.
6. Add typed verification, clarification/approval branch, and artifact checks.
7. Add scoped memory and evidence-linked feedback capture.
8. Add reviewed improvement proposals and automated eval/reindex/rollback.
9. Roll out behind feature flag; test web and Telegram channels.

## 16. Required acceptance tests

- Flat `skills/humanizer.md` and directory `skills/humanizer/SKILL.md` can be indexed without collision.
- Only approved versions are returned as procedural instructions.
- Changed content hash updates relevant sections and invalidates stale retrieval.
- Unknown/missing `skills/` directory is handled safely; no fabricated inventory.
- English and Indonesian outputs respect register and user requirements.
- Agent role selection does not override explicit user channel/style constraints.
- A well-specified task completes without unnecessary clarification.
- Ambiguous high-impact task pauses for one material question.
- Every sensitive action requires core authorization and approval.
- No cross-user retrieval or leaked project knowledge.
- Prompt-injection text embedded in documents does not become executable instruction.
- Telegram outbound text never contains emojis.
- A failed generated file is not reported as saved.
- Graph cycles, tool retries, skill counts, and output revisions remain bounded.
- No measured performance improvement is claimed without a baseline and test report.

## 17. Official engineering references

- LangGraph workflow design (JavaScript): https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph
- LangChain Deep Agents and memory/skills concepts: https://docs.langchain.com/oss/javascript/deepagents/overview
- pgvector filtering, HNSW, hybrid search: https://github.com/pgvector/pgvector/blob/master/README.md
- MCP TypeScript SDK (v2 docs): https://ts.sdk.modelcontextprotocol.io/v2/

Check installed dependency versions and the corresponding official documentation before copying SDK symbols. Conceptual interfaces in this document are NOT drop-in code.
