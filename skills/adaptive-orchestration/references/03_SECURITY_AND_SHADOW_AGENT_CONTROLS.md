# Security, Safety and Anti-Shadow-Agent Controls

Version 1.0.0 | Scope: Agent Office Room multi-agent planning, tools, RAG, memory, MCP and artifact generation

## 1. The trust principle

An AI agent is not a principal of unlimited authority. Treat its plan, arguments, tool selections, proposed code, retrieved text and inter-agent messages as untrusted until checked by independent policy code. Neither a confident model reply nor a message signed "Zen" is authorization. Security must remain valid even when models hallucinate, are injected, or disagree.

The user's term **shadow agent** is modeled here as an undisclosed/unauthorized worker, tool execution path, persistent task or delegation that escapes the recorded plan, permission scope, audit trail, resource budget or human oversight. OWASP separately documents rogue-agent, goal-hijack and excessive-agency risks. Prevention requires more than prompt language.

## 2. Protected assets and adversary entry points

Protected: task and workflow authority; DB records and credentials; memory and cross-project private data; file system/repositories; model API keys and provider quotas; MCP credentials/tools; chat/Telegram identity and approvals; deployment environments; indexed skills/docs; audit history.

Inputs considered untrusted: Boss/user text for technical validation, attachments, retrieved documents, web pages, RAG chunks, MCP resource outputs, tool error messages, generated patches, inter-agent notes, remote templates, third-party skill packages, model replies and callback payloads.

## 3. Non-negotiable controls

### 3.1 Identities and permissions

- Authenticate every external actor through existing core identity. Never trust a Telegram handle, display name, prompt role claim, or agent-generated principal name.
- Bind each execution to a signed/trusted `runId`, `taskId`, `actorId`, `projectScope`, `agentId`, `policyVersion`, approved capabilities and expiry. Handoff references must bind to this envelope.
- Apply least privilege per agent and tool. Zen may plan but cannot grant itself OWNER. Gus may use only approved tool capabilities. Dhea may retrieve only authorized memory.
- Reauthorize each sensitive tool call at **time of use**, not just initial planning. Use expiration, state-version checks and one-time confirmation tokens for approvals.
- Agent registration and MCP server/tool registration require explicit administrator approval; refuse unknown dynamic tool/agent discovery by default.

### 3.2 Tool gateway

For each tool call: validate Zod/JSON schema -> verify actor/project/resource scope -> check allowed tool + method + environment + action -> classify side effects -> evaluate approval policy -> apply rate/timeout/budget -> execute with sandbox/least-privileged credentials -> verify outcome -> audit. Never call shell/SQL by concatenating model-generated strings. Use parameterized queries and safe identifier allowlists. Avoid SQL string templates for identifiers unless positively allowlisted.

For external web or resource tools, enforce destination/hostname/egress allowlists and SSRF protection; forbid arbitrary URLs to private metadata/localhost networks. File tools must use canonical allowed roots, path traversal/symlink checks, safe temp files, malware scanning where supported, and size/extension validation. Code runners need OS/container sandbox, no default secrets, constrained network, CPU/time/memory limits and isolated writable paths.

### 3.3 Prompt and knowledge integrity

- Treat retrieved materials as data; do not allow text to alter instruction priority, policy, tool grants, identity or target endpoints.
- Version/hash approved skills; only publish through review. Separate skill content from policy code; skill updates cannot change executable privilege rules.
- Filter retrieval at DB/service boundary by actor/project/ACL and approval. A post-search cosmetic filter is insufficient.
- Explicitly test prompt injection from attachments, README, web, memory, tool outputs, code comments and inter-agent notes; check for action attempts, secrets extraction and hidden persistence.
- Require source provenance and evidence for recommendations. Do not auto-commit model output as trusted memory.

### 3.4 Execution limits and kill switch

- Persistent queue, recorded graph states, idempotency keys and bounded parallelism.
- Hard ceilings for tokens, provider cost, tool invocations, wall-clock time, retries, handoffs, planning and replan count, and queued jobs.
- Cancel propagates to queue and providers where supported; revoke short-lived credentials. Do not promise reversal of external side effects.
- Detect unknown work without registered `taskId`, unexpected tool use, cross-scope calls, unapproved agents, repeated self-delegation, unexplained egress, unusual costs and attempts to disable logging. Quarantine/stop affected run and notify authorized operator.
- If core is unavailable or checkpoint incomplete, fail closed for write/external actions and return an explicit partial/error status.

### 3.5 Mandatory human approval

Require explicit current OWNER/privileged-user approval for production deployment, DB schema/data deletion, credential changes, permission changes, new MCP server, large external cost, irreversible publication, sensitive exports and other existing policy-defined actions. An agent may request approval but cannot self-confirm it. Approval should bind exact action, args hash, actor, scope, expiry, state version and environment; invalidate on drift.

LangGraph `interrupt()` can pause the graph, but the **core approval service** must verify the decision and guard actual tool execution. Interrupt nodes may replay on resume; avoid effects before interrupt. Idempotency and atomic compare-and-set state transitions prevent duplicate execution.

## 4. Risk-to-control matrix

| Attack or failure | Independent controls | Required negative test |
|---|---|---|
| SQL injection/DB tampering | Parameterized queries; DB role least privilege; identifier allowlist; row-level or service scope | Injection strings in filters/identifiers cannot mutate/read unauthorized data |
| Prompt injection/goal hijack | Source trust tiers; typed output; tool gateway; untrusted-content boundaries | Retrieved doc claiming 'system override' cannot make a tool call |
| Prompt tampering/skill poisoning | Approved hashes, versioned skills, review and source provenance | Modified unapproved skill is not selected |
| Prompt brute-force/burst, resource exhaustion | Auth, rate limits, request caps, concurrency budgets, circuit breaker | Flood does not create unbounded jobs/LLM spend |
| Shadow/rogue agent | Registered identity, run envelope, capability leases, audit/kill switch | Unknown agent or spawned background task denied |
| MCP tool poisoning | Approved server registry, schema validation, scope, egress, tools-as-data | Malicious tool description cannot grant permissions |
| Cross-agent message spoofing | Signed/trusted envelope, origin and task checks, output provenance | Specialist cannot impersonate Zen or OWNER |
| Sensitive-data exfiltration | DLP/redaction, outbound allowlist, per-action approval, resource ACL | Secret in context never sent to unapproved endpoint |
| Replay/duplicate effect | Idempotency keys, transactions, action-version approval | Replayed approval/deploy executes once at most |
| Shared code/DB conflict | Resource locks, isolated branches/worktrees, merge tests | Conflicting writes serialized, detected or rejected |
| Model provider fallback | Preserve policies and data residency, provider allowlist | Fallback never bypasses approval or scope |
| Misleading root-cause certainty | Evidence-linked hypotheses; differential diagnosis and tests | Missing logs yield 'unconfirmed', not definitive root cause |

## 5. Audit and evidence

Every material decision/action emits trace fields: `taskId`, `planId`, `agentId`, `principal`, `scope`, `toolId`, `actionId`, `actionHash`, `approvalId?`, `policyVersion`, `result`, `time`, `cost` and redacted `evidenceRefs`. Do not store full secret payloads or private chain-of-thought. Log failures and denied calls as well as successes.

Operational alerts include: unauthorized dispatch, forbidden tool call, privilege escalation attempt, unapproved MCP server registration, runaway fan-out, abnormal retry loops, repeated budget overruns and significant cross-project retrieval denials. No silent automatic remediation that changes security policy.

## 6. Minimum security release gate

`0` unauthorized privileged tool executions, `0` unapproved production writes, `0` successful cross-project memory retrievals, `0` unreviewed skill promotions, `0` accepted replayed approvals with side effects. Any violation is a **hard release blocker** regardless of overall quality score or cost improvement.

## 7. Security references

- OWASP Agentic Top 10 (2026): https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- OWASP LLM Top 10 (2026): https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/
- OWASP Prompt Injection glossary: https://genai.owasp.org/glossary/prompt-injection/
- NIST AI RMF GenAI Profile: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
