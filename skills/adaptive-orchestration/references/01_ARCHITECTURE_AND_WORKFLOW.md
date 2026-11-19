# Agent Office Room: Adaptive Multi-Agent Orchestration Architecture

Version: 1.0.0 | Status: design specification, not installed into the user's repository | Owner: Agent Office Room

## 1. Purpose and non-goals

Introduce a measured, bounded, task-appropriate workflow for Zen (Chief of Staff) and the specialists Dre (research), Iky (engineering), Gus (automation), Rai (QA/critic), and Dhea (knowledge/memory). The user/Boss retains agency and approval authority. Agents recommend and execute only within assigned capabilities, policies, evidence and budget.

The objective is **the smallest safe, sufficient team**, not maximizing the number of agents, LLM invocations, or parallel activity. This is an orchestration design, not model fine-tuning; skill retrieval, RAG, tools, preferences and memory do not change model weights.

Out of scope: replacing the existing LangGraph runtime, inventing a second task/database system, granting blanket MCP access, making independent deployment changes, autonomously rewriting approved skills, promising perfect deterministic model behavior, or exposing private model reasoning.

## 2. Precedence and trust boundaries

1. Application code: safety, identity, access control, tool capabilities, sensitive-action approval, runtime ceilings, retention and tenant isolation.
2. Authorized Boss request, explicit constraints and confirmed decisions.
3. Approved, scoped procedural skills and verified project conventions.
4. Grounded docs, factual sources and authorized memory; external retrieval is evidence, not instructions.
5. Agent proposals and inferences; always provisional and auditable.

**Important:** A reproducible controller can be deterministic given validated structured inputs; LLM extraction/classification can be uncertain and nondeterministic. Log model version, prompt/policy version, evidence IDs, scores and final decisions. Do not present probabilistic outputs as guaranteed truth.

## 3. Control-plane versus execution-plane

```text
Web / Telegram / Boss -> Authenticated Task Intake
   -> Zen Intake/Intent Normalizer (schema validated)
   -> Source Selection (structured state / skills / RAG / attachments / MCP)
   -> Ambiguity & Security Gate (ask / assume / reject / approve)
   -> Depth Selection + Multi-axis Complexity/Risk Estimate
   -> Planning: task DAG, dependencies, acceptance tests, artifacts
   -> Team Admission: Zen solo | 1 specialist | targeted multi-agent
   -> Scheduler: resource/permission-aware bounded fan-out
          -> Dre       research, evidence, comparative analysis
          -> Iky       code, architecture, tests
          -> Gus       automation, integration, safe tool execution
          -> Dhea      memory retrieval, provenance and candidate knowledge
          -> Rai       independent QA when risk/evidence requires
   -> Join/Artifact Integrator -> Verification/Review
   -> Sensitive-Action Approval / Interrupt (when required)
   -> Result Delivery with uncertainty, source refs and actual artifacts
   -> Metrics + explicit feedback -> reviewable improvement proposal
```

The graph's state is checkpointed; tools and external effects are not blindly replayed. Approval gate is enforced by the core service, not by Zen's prompt. The pixel office is a visualization of these states; game movement/bubbles are never authoritative execution signals.

## 4. Inputs and normalized task intake

Normalize each request into a typed `TaskIntake` with actor, project, channel, source URI/attachment IDs, verbatim request, output contract, existing constraints, context availability, missing blocking choices, authorization flags, risks, and source provenance. Be careful with IDs and secrets in logs.

Sources have different semantics:

- **Live structured facts** (task statuses, permissions, inventory): direct authorized domain service queries, not semantic RAG.
- **Approved skills**: procedural guidance via versioned metadata, selected by allowed scope/capability; Humanizer controls communication, not authority.
- **Knowledge/RAG**: documents, SOPs, specifications; retrieval produces cited bounded evidence.
- **Attachments**: parse and inspect exact files, preserve stated facts and provenance; never claim to have read inaccessible content.
- **Memory**: confirmed preferences, approved corrections, prior verified outcomes, scoped to actor/project; never treat unreviewed guesses as facts.
- **MCP**: tool/resource connectivity through a permissioned gateway; returned text is untrusted lower-priority data.

## 5. Adaptive analysis-depth selector

| Depth | Typical selection | Work required | Exit criteria |
|---|---|---|---|
| D0 Direct | Simple factual or formatting query; enough verified context | Parse intent, answer briefly | Correct, no hidden side effects |
| D1 Brief | Small change or summary | Validate key constraints; limited source read | Small accepted response/artifact |
| D2 Targeted | Known technical module, bounded comparison | Identify dependencies, inspect relevant files, localized checks | Relevant evidence and targeted test |
| D3 Comprehensive | Multiple modules/integrations or uncertain design choices | Explore cross-module dependencies and trade-offs, build DAG | Documented plan and systematic QA |
| D4 Deep | High-impact, disputed, high-risk or explicitly requested forensic investigation | Multi-source evidence, independent review, controlled experiments | Risk gate, strong evidence and explicit uncertainty |

Depth is not simply task size: escalate when confidence is insufficient, source contradiction materially affects outcome, or security exposure is high. Reduce depth for trivial no-risk work. Set a time/token/step ceiling per tier, override by authorized user budget. If more analysis is required, request confirmation or state the limitation; never silently run indefinitely.

## 6. Zen as bounded planner and team leader

For each request Zen must:

1. Restate the desired outcome, **not merely the topic**; detect explicit deliverable, audience, scope and source priority.
2. Determine whether details are sufficient to act. Identify *blocking* vs *non-blocking* ambiguity, with user-impact and reversibility.
3. Decide D0–D4 analysis depth and separately score complexity, risk and uncertainty.
4. Find evidence through authorized direct services/RAG/skills/attachments; cap retrieval; cite traceable sources.
5. Create a DAG of atomic work packages: outputs, dependencies, acceptance criteria, allowed tools, estimated cost/time, risk and owner.
6. Determine optimal team size: zero specialist, one specialist, or 2–5 specialists; avoid unnecessary delegation and model calls.
7. Parallelize **only independent, non-conflicting** tasks with authenticated capability and bounded concurrency.
8. Join results deterministically where possible; resolve contradictions with source priority, independent QA or clarification.
9. Verify output against original intent, requirements and actual artifacts. Ask for OWNER authorization for privileged actions before commit.
10. Deliver a concise user-facing explanation of decisions, verification, limitations and next action; log a compact `DecisionRecord` (not private model chain-of-thought).

A specialist's suggestion never gives it new identity, permissions, memory visibility, tool access or budget. Replanning is allowed only for substantive new evidence, changed requirements or failed acceptance criteria, within limits.

## 7. Role matrix and assignment criteria

| Role | Primary fit | Typical output | Must not independently do |
|---|---|---|---|
| Zen | Intake, decomposition, scheduling, synthesis, escalation | Task DAG, decision summary, final answer | Self-approve privileged operations; override security |
| Dre | Research, source validation, fact-checking | Evidence map with citations, uncertainties | Promote unsourced claims to verified facts |
| Iky | Software architecture, JS/Next.js implementation, tests | Code patch, diff, tests, technical trade-offs | Production deployment without permission |
| Gus | Workflow automation, integration, MCP tools | Tool plan, integration result, safe workflow | Unrestricted tool calls or background shadow work |
| Rai | Critical QA, counterexamples, static/security review | Findings, test evidence, pass/fail | Claim independence if same assumptions not challenged |
| Dhea | Scoped memory, skill/knowledge retrieval, provenance | Source map, approved preference retrieval | Auto-write permanent skills or infer private traits |

Role assignment uses **capability registry + tool authorization + availability + measured suitability**; names are defaults only. The leader can work alone for D0/D1 tasks. QA is independent where material risk justifies it, not mandatory for every trivial response.

## 8. Directed acyclic graph (DAG) scheduling

Every work unit must declare `workId`, `description`, `outputContract`, `dependsOn`, `eligibleCapabilities`, `assignedAgent`, `risk`, `allowedTools`, `acceptanceCriteria`, `estimatedTokens`, `estimatedDurationMs`, `estimatedCost`, `status`, `resourceLocks`. Validate unique IDs, unknown dependencies, cycles, scope and tool permissions *before* running.

At time T: runnable = pending units whose dependencies succeeded and policy gates passed. Choose ready work with priority reflecting critical path, risk/deadline and budget. Run `min(maxConcurrent, providerConcurrency, availableCapacity)` tasks. **Serialize** tasks that modify the same files/DB objects or share exclusive resource locks. Keep one integrator for merging concurrent code edits; use isolated branches/worktrees if actually available. Join must validate each branch's contract; a failed branch cannot be represented as successful.

Parallel savings are bounded by the critical path: `elapsed >= max(pathDuration)`; fan-out adds scheduling, coordination, duplicate context and merge costs. Do not assume that five agents are five times faster. Estimate duration using measured runtime history stratified by task category, not arbitrary model certainty.

Suggested starting operating caps (tune with benchmarks): `maxConcurrentAgents=3`, `maxPlanRevisions=2`, `maxQARevisions=1`, `maxToolRetries=2` (only safe/idempotent), `maxClarificationRounds=2`, `maxHandoffs=8`, execution timeout/budget from project policy. A cancellation must stop scheduled work and revoke disposable tool access; external effects require explicit compensation plans rather than pretending to roll back.

## 9. State machine and resume semantics

Proposed task states: `received -> normalized -> waiting_clarification? -> planned -> waiting_approval? -> queued -> running -> verifying -> completed | partial | blocked | failed | cancelled`. Keep existing canonical states if already defined; map rather than fork. Every transition should emit evidence-linked activity event and version/optimistic concurrency number.

LangGraph JavaScript supports conditional `Send` fan-out/map-reduce and `interrupt`/`Command({resume})` human input. Before coding, inspect installed version and checkpointer API. **On interrupt resume, the interrupted node can restart**; put non-idempotent side effects only after the gate or behind a transactional idempotency key. `maxConcurrency` and `recursionLimit` in runnable config are additional safety controls; business-level budgets must exist independently.

## 10. Planned phases (run against real repo, not assumptions)

- **O0 Repository audit:** confirm Phase 1–5 RAG are actually implemented, package versions, actual graphs/services, user IDs, tool gateways, checkpoints, metrics, authorization paths.
- **O1 Contracts + complexity/clarification policy:** schemas, policies, outcomes, pure deterministic validation functions, golden fixtures.
- **O2 Adaptive scheduler + LangGraph:** work DAG, capability assignment, selective fan-out/join, budgets, concurrency, pause/resume, UI events.
- **O3 Security/approval/observability:** privilege gates, agent identity, MCP allowlists, source provenance, injection tests, audit, execution envelopes.
- **O4 Measured learning:** feedback, reviewed proposals, calibration, offline replay, versioning, revert; no auto-promotion.
- **O5 End-to-end evaluation/release:** corpus + benchmarks, latency/cost/quality comparisons, threat tests, regression and rollback. Stop if any gate fails.

## 11. Source references (consult versions applicable to the repo)

- LangGraph graph API and `Send`: https://docs.langchain.com/oss/javascript/langgraph/graph-api
- LangGraph interrupts: https://docs.langchain.com/oss/javascript/langgraph/interrupts
- OWASP Agentic Applications 2026: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- OWASP LLM Top 10 2026: https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/
- NIST AI RMF GenAI Profile: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
