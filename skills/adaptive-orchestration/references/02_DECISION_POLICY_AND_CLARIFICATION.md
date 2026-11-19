# Zen Decision Policy: Analysis, Complexity, Routing and Clarification

Version: 1.0.0 | Status: proposed calibrated controller policy

## 1. Separate constructs: difficulty, uncertainty, risk, and resources

Do not collapse task complexity, safety risk, confidence and effort into one ambiguous model score. `complexity` predicts technical/organizational work. `risk` dictates controls. `uncertainty` determines what must be verified/clarified. `effort` is an estimated resource interval based on historical data.

**Determinism boundary:** The math and routing rules are deterministic *given a validated assessment*. An LLM's feature extraction is not inherently deterministic; record original evidence and a reason for every input, use fallback `'unknown'`, and enforce objective gates separately. Never report a risk/complexity score as empirical truth before calibration.

## 2. Weighted complexity vector: default heuristic only

Each dimension is an integer 0–4 or `null` if unknown. Use evidence references for nonzero ratings; never coerce `null` to zero. When unknown inputs change the operational tier, ask or perform bounded discovery.

| Dimension | Weight | 0 | 2 | 4 |
|---|---:|---|---|---|
| S: scope breadth | 0.20 | Single answer/field | One bounded component | Cross-system product |
| D: dependency complexity | 0.20 | No dependencies | 2–3 known dependencies | Deep/cyclic/conflicting integrations |
| I: integration novelty | 0.15 | No external integration | One established API | Multiple unverified external systems |
| U: requirements uncertainty | 0.20 | Explicit and testable | Some optional choices | Critical outputs/constraints unknown |
| V: validation/acceptance load | 0.15 | Simple deterministic check | Multiple module tests | Security/performance/E2E evidence required |
| C: coordination/conflict | 0.10 | Single agent, isolated | 2 roles with clear handoff | Multiple conflicting writes/owners |

`complexityScore = 25 * Σ(weight_i * value_i)` => 0..100 when all six values known. If any required dimension is unknown, return `needs_assessment` with a computed interval from known values (unknown 0..4), never a fake precise score.

Provisional tiers (tune using labeled tasks):

- 0–19: **Low / Sederhana** — solo Zen, D0–D1, minimal tools.
- 20–39: **Standard / Normal** — Zen + optional one specialist, D1–D2.
- 40–59: **Moderate / Menengah** — Zen + 1–2 targeted specialists, D2–D3.
- 60–79: **High / Kompleks** — DAG with review and dependencies, D3.
- 80–100: **Very High / Sangat Kompleks** — cross-system D3/D4, staged delivery, approvals and risk controls.

These labels are **routing heuristics, not objective measures of human difficulty**. For example a one-line production credential change may score low complexity but CRITICAL risk and require OWNER approval.

## 3. Risk assessment: separate from complexity

Choose the maximum of applicable policy triggers, not an average:

- `R0 informational`: public/authorized read-only explanation; no external effects.
- `R1 reversible`: isolated sandbox changes, reversible local artifacts, no sensitive data.
- `R2 controlled-write`: code/DB/test writes to authorized non-production environment; audit and verification required.
- `R3 sensitive`: authentication, production deployment, billing, private data export, changing permissions, external publications; explicit owner/human approval and hard tool gates.
- `R4 prohibited`: unauthorized access, bypassing approval, exfiltration, secret disclosure, unknown actor privileges; deny and safely explain.

When in doubt, fail closed on side effects. `approvalRequired` is derived in **code** from requested action + resource + environment + actor + state, never from model self-assurance. Do not count authorization as equivalent to business approval. If core policies are stricter, they prevail.

## 4. Decision result and evidence

A `DecisionRecord` must explain *at a high level*, with source references:

- `decisionId`, `taskId`, `actorId`, `policyVersion`, `time`.
- `intent`, `analysisDepth`, `complexityVector`, `complexityScoreOrRange`, `complexityTier`, `riskTier`, `confidenceBand`.
- `blockingUnknowns`, `nonBlockingAssumptions`, `questionToBoss?`, `optionsWithTradeoffs?`.
- `selectedCapabilities`, `assignedAgents`, `rationaleSummary`, `estimatedResources` (ranges + basis).
- `dependencies`, `acceptanceCriteria`, `permissions`, `approvalRequirement`, `evidenceRefs`, `limitationNotes`.

Do not log or expose a model's private chain-of-thought. A short *decision rationale* is sufficient and auditable.

## 5. Clarification gate

Ask when an unmade choice will materially alter architecture, data protection, price, reversibility, artifact structure or expected acceptance. Do NOT ask just because any optional preference is unknown. Classify as:

- `BLOCKING`: several credible implementations with materially different consequences; cannot execute correctly/safely without choice. Return `waiting_clarification`, suspend tool execution, preserve checkpoints.
- `RECOMMENDED`: can proceed with disclosed reversible assumption in sandbox, but explain how to change it.
- `OPTIONAL`: use default without disrupting progress.
- `FORBIDDEN_ACTION`: deny; a question cannot authorize prohibited activity.

Each clarification should be specific, short, answered with options where useful, and distinguish a recommendation from a requirement. Ask at most 1–3 decision-critical questions in the first round; avoid perpetual follow-ups. On non-answer, do not silently convert blocking ambiguity into permission.

## 6. Worked example: “Implementasikan Full-Stack Web JavaScript FE dan API dengan Next.js”

Known: JS; Next.js; frontend + API. Unknown: product purpose/data model, persistence, authentication, hosting, external integrations, deliverable and test acceptance. There is insufficient basis to invent database requirements.

**Zen's first chat response (Bahasa Indonesia):**

> Saya bisa mulai dari struktur Next.js untuk frontend dan API, tetapi ada dua keputusan yang mengubah arsitekturnya:
>
> 1. Apakah data perlu tersimpan permanen? **Tanpa database** cocok untuk API stateless/proxy atau integrasi API eksternal; **SQL (PostgreSQL)** cocok untuk transaksi, relasi, dan laporan; **NoSQL (MongoDB)** cocok bila pola dokumen dan akses datanya memang menguntungkan. Saya tidak merekomendasikan memilih NoSQL hanya karena dianggap lebih fleksibel.
> 2. Aplikasi ini perlu **login/role dan operasi data pengguna**, atau cukup frontend + API publik sederhana?
>
> Rekomendasi awal: mulai tanpa database bila belum ada kebutuhan data persisten. Jika ada entitas bisnis dan transaksi, pertimbangkan PostgreSQL. Setelah dua jawaban tersebut, saya bisa membuat struktur modul dan acceptance criteria yang tepat.

If the Boss says *stateless frontend + API without auth*, Zen must remove DB/ORM/auth tasks, likely select Zen+Iky only, build a bounded task DAG, and avoid fabricating schema/migrations. If a transactional product + auth is required, broaden the scope, add security review and D3 depth; the system should present relational-vs-document tradeoffs and authorize DB provisioning separately.

## 7. Team admission and plan comparison

Evaluate *candidate plans*: Zen solo, Zen+one specialist, or multiple specialists. For each, estimate quality confidence, expected latency range, tokens, cash cost, coordination overhead, conflict risk and authorization. Reject candidates violating security or hard budget before weighted scoring. Select the **Pareto-efficient** candidate that best meets acceptance criteria under a declared preference (e.g., fastest under cost cap; cheapest under SLA).

If no empirical calibration exists, use conservative labeled *ranges* and default to fewer agents. Escalate to parallelism when at least two independent work units have measurable benefit over handoff cost. Never parallelize a serial dependency chain or two writes to the same shared resource without isolation.

## 8. Time and resource forecasts

For completed tasks, record actual `wallTimeMs`, `queueMs`, `agentComputeMs`, per-agent model calls, token usage, cost when available, tool latency, retry counts, outcome and error class. Use historical median and p80/p90 by `(taskType, complexityTier, toolProfile, modelFamily, environment)`. Begin with `insufficient_history` when fewer than configured examples exist; avoid fabricated completion times. Calibrate predicted vs actual values with MAE and WAPE; interval coverage on held-out tasks. Account for DAG critical path and capacity constraints.

Feedback is not a proof of model learning. It is a signal to propose data/skill/policy adjustments, subject to offline eval and approval.

## 9. Counter-sycophancy and corrective behavior

- Do not automatically praise or agree with the Boss. Describe tradeoffs and evidence without condescension.
- When the Boss's plan increases risk/cost or contradicts constraints, identify the **specific issue**, consequences and a feasible alternative.
- Distinguish facts, assumptions, preferences, hypotheses and unknowns.
- Never invent root cause without evidence. Express `suspected root cause` + tests + confirmation state.
- Accept clear user corrections, but do not allow them to override safety, identity or approval policy.
- If unknown, state exactly which evidence is missing, and ask only decision-critical questions.

## 10. Examples of team selection

| Request | Typical path (subject to actual assessment) | Why |
|---|---|---|
| “Ringkas paragraf ini” | Zen only, D0/D1 | No extra specialist or RAG needed |
| “Buat README dari repo” | Zen + Iky, optional Dhea | Must inspect actual code; avoid invented features |
| “Bandingkan 3 papers terlampir” | Zen + Dre, Rai if scientific stakes | Grounded retrieval + claim validation |
| “Perbaiki UI card pixel” | Zen + Iky, targeted QA | Single bounded UI task, no DB |
| “Next.js frontend + stateless API” | Zen + Iky | Do not invent database |
| “Build Next.js + auth + payments + database” | Zen + Iky + Gus + Rai, Dhea if past decisions relevant | Dependencies, security, real tools and QA; explicit payment/deploy approval |
| “Hapus database produksi” | Zen asks for approved operational scope and requires R3 controls; R4 if unauthorized | Small code change can be very high risk |

