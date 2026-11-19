# Evidence-Driven Improvement and Measurement Plan

Version 1.0.0 | Status: acceptance/measurement design, not empirical performance claim

## 1. Definition of 'learning'

For Agent Office Room, continual improvement means **reviewed system adaptation** in retrieval, decision rules, skill versions, plan templates and calibrated resource forecasts, not unsupervised weight updates or agents changing their own privileges. No automatic permanent adoption of a model-generated plan, observed user habit, or one-off error as true instruction.

Learning stages:

1. Record a task *event* (inputs and outcome references, scope, protected data redaction).
2. Compare results to explicitly approved acceptance criteria and tests.
3. Capture **explicit** user corrections or permissioned feedback, including intent/format and whether preference is reusable.
4. Produce a typed improvement **proposal** with evidence, failure class and expected benefit.
5. Deduplicate and rank proposals (frequency, severity, impact, confidence, reversibility).
6. Evaluate candidate offline against a frozen benchmark + security negatives + regression test + latency/cost.
7. Seek human approval for changes to approved skills, policies, prompts and shared memory.
8. Publish a versioned change and targeted reindex; monitor canary where supported.
9. Roll back on degraded quality, higher incident risk or unacceptable cost.

Use feedback explicitness labels: `explicit_user`, `test_verified`, `reviewer_verified`, `model_hypothesis`; the last type is never sufficient for promotion. Preference scope: `task_only`, `project`, `user_global` with consent/authorization and expiry. Never infer sensitive user traits from habits. Respect corrections, withdrawal and deletion.

## 2. Error taxonomy

`misinterpreted_intent`, `missing_requirement`, `over_questioning`, `unnecessary_agent`, `wrong_agent`, `unnecessary_database`, `wrong_dependency`, `unsafe_tool`, `unsupported_fact`, `missing_citation`, `hallucinated_artifact`, `poor_clarification`, `excessive_cost`, `slow_response`, `format_mismatch`, `privacy_violation`, `incomplete_verification`, `unconfirmed_root_cause`, `runaway_loop`.

Each failure should link to evidence and root-cause status: `unknown`, `suspected`, `tested`, `confirmed`. Do not invent causal explanations. Correct local workflow errors immediately when safe; propose policy/skill-wide changes for review.

## 3. Metrics: definitions and how to measure

| Dimension | Measurement | Target/gate (initial proposal, NOT established performance) |
|---|---|---|
| Intent accuracy | Correct intent on labeled tasks / labeled total | >= 0.90 pilot, tune by domain |
| Critical-ambiguity recall | Blocking ambiguities asked or held / labeled blocking cases | >= 0.95; minimize false alarms |
| Unnecessary clarification rate | Nonblocking questions / tasks assessed | <= 0.15 pilot |
| Skill routing precision@k | Relevant approved skills selected / selected | >= 0.90 on labeled set |
| Source attribution | Supported factual claims with correct traceable provenance / claims needing citation | >= 0.95 pilot |
| Unsupported assertion rate | Unsupported important claims / important claims checked | <= 0.02 pilot |
| Requirements compliance | Constraints met / testable user constraints | >= 0.95 pilot |
| Task success | Passed acceptance tests / executed tasks | improve over baseline; no fabricated target |
| Tool safety | Unauthorized privileged execution count | **0, release blocking** |
| Cross-scope leakage | Confirmed cross-project disclosure count | **0, release blocking** |
| Decision economy | Agents used vs minimum sufficient labeled team | non-inferior quality with lower cost |
| Forecast calibration | MAE, WAPE by type and tier; p80 interval coverage | compare held-out baseline |
| Latency | End-to-end p50/p95 including queue and calls | no significant regression unless risk justifies |
| Token/cost | Per successful task; not merely per call | compare at same quality/security |
| Review burden | Human review minutes/task and approvals | track; avoid unnecessary escalation |
| Recovery | Failed/retried runs ending in verified state | measure objectively; no hidden partial successes |

Numeric thresholds are **proposed pilot acceptance goals**, not best-practice universal constants or claims about the current system. Set pilot cases, raters, and baselines with owner approval; strengthen gates for high-risk tasks. Use confidence intervals on sampled metrics where practical.

## 4. Benchmark design

Create at least 40 labeled tasks before claiming broad improvement. Suggested distribution: >=8 simple/solo tasks, >=8 clarification cases including Next.js/DB/auth, >=8 moderate multi-step cases, >=8 high-risk/security cases, >=8 mixed source/attachment/RAG and language cases. Split into development and **held-out** evaluation; do not tune against held-out answers. Ensure ID/English variants and real privacy-safe fixtures.

Compare fixed scenario seeds/inputs where APIs support reproducibility, same environment/model version/budget, and baseline vs orchestration-enabled policy. Blind review where possible and use explicit scoring rubrics. Record sample size and confidence; latency/cost alone cannot compensate for correctness or authorization failure.

## 5. Workload forecast feedback

Persist for every completed run: `taskType`, `complexityFeatures`, `riskTier`, `selectedAgents`, DAG critical path, `estimatedTimeRange`, `actualWallTime`, `queueWait`, `toolCalls`, `inputTokens`, `outputTokens`, `costObservedOrUnknown`, success, revisions, failure categories and approval wait. Do not use actual human approval delay as model-only processing time.

After sufficient samples in comparable buckets, compute median/p80/p90 plus MAE/WAPE, track uncertainty. If buckets are sparse, widen intervals and label them 'low evidence'. Re-estimate only after a real workload breakdown, not by magical self-evaluation. Track whether adding an agent actually improved *quality-adjusted* latency net of communication overhead.

## 6. Bounded self-review cycles

- Local draft correction: at most one normal revision; extra revisions require measured improvement/policy permission.
- Replans: max two per task, only on material new facts, changed constraints or failing acceptance tests.
- Retry: max two only for classified transient/idempotent failures with bounded backoff; no retried irreversible actions unless core idempotency protects them.
- Clarifications: max two decision-critical rounds by default, then block with explicit unresolved items.
- Feedback proposals: generate at most one deduplicated candidate per actionable failure class per task; no recursive candidate proposals from proposal evaluation.
- Separate offline evaluation worker. Never silently apply changes to prompt/skill/model/tool policies mid-run.

## 7. Acceptance and release gating

Must satisfy: all mandatory security zero-tolerance tests; correct behavior for no-DB requests; respect consent and project scope; meaningful measurable quality improvement or non-inferiority with lower resource cost; instrumented budgets and timeouts; stable rollback, checkpoint and retry; useful user-facing explanation for uncertainty; no fabricated results. If success criteria are not met, mark phase FAIL/PARTIAL and report what remains, without manufacturing statistics.
