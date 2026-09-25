/**
 * Office Standard Operating Procedures (SOP) & Knowledge Base
 * Used for RAG Grounding and Decision-Making by Leader (Zen) and Specialist Agents.
 */

export interface SopDocument {
  id: string;
  title: string;
  category: 'architecture' | 'engineering' | 'qa' | 'security' | 'workflow';
  summary: string;
  guidelines: string[];
  mandatoryRules: string[];
}

export const OFFICE_SOPS: Record<string, SopDocument> = {
  'sop-clean-architecture': {
    id: 'sop-clean-architecture',
    title: 'SOP-01: Clean Code, Modularity, and Architecture Guidelines',
    category: 'architecture',
    summary:
      'Standard principles for code structure, separation of concerns, and clean API design across TypeScript, Node, PHP/Laravel, and Python projects.',
    guidelines: [
      'Separate business domain logic from transport layers (HTTP controllers, CLI commands, WebSocket handlers).',
      'Follow SOLID principles: single responsibility, open/closed, dependency inversion.',
      'Always type functions, parameters, and return types explicitly in TypeScript/Node.',
      'Never hardcode database credentials, API keys, or machine-specific absolute paths.',
      'Write clean, readable comments only where complex logic genuinely warrants explanation.',
      'Prefer in-memory data structures, file repositories, or mock services when external databases (MySQL, Postgres, Redis) are intentionally omitted.',
    ],
    mandatoryRules: [
      'Never place business logic directly in route definitions.',
      'All user inputs must be validated with schemas (Zod, FormRequests, or strict typeguards).',
      'Code must compile cleanly without linting errors or broken import paths.',
    ],
  },

  'sop-qa-testing': {
    id: 'sop-qa-testing',
    title: 'SOP-02: Quality Assurance, Verification, and Zero-Hallucination Testing',
    category: 'qa',
    summary:
      'Strict protocols for Rai (QA Critic) to audit and verify deliverables before issuing approvals to Boss.',
    guidelines: [
      'Audit every single acceptance criterion specified by the Boss in the task directive.',
      'Verify that all required files actually exist on disk and are non-empty using inspect_directory or read_file.',
      'Execute automated tests, endpoint curl checks, or syntax validations via execute_bash whenever practical.',
      'Hunt for unhandled edge cases: empty inputs, boundary values, network timeouts, null payloads.',
      'Verify that code follows clean formatting and standard idioms for the targeted framework.',
    ],
    mandatoryRules: [
      'QA must NEVER issue an "APPROVED" verdict if any core requirement is unverified or missing.',
      'If discrepancies are found, QA must issue "REQUEST_CHANGES" with specific remediation steps.',
      'Zero tolerance for hallucinated files or mock claims without actual file inspection.',
    ],
  },

  'sop-security-guardrails': {
    id: 'sop-security-guardrails',
    title: 'SOP-03: Security Protocols, Safe Execution, and Human-In-The-Loop',
    category: 'security',
    summary:
      'Defense protocols against SQL injection, Prompt injection, destructive terminal operations, and data loss.',
    guidelines: [
      'Always parameterize SQL queries ($1, $2, ...) to prevent SQL injection.',
      'Isolate LLM prompts from untrusted database text using safe encapsulation tags.',
      'Inspect bash commands before execution for dangerous patterns (e.g. recursive deletes, forced resets).',
      'If an operation is destructive or irreversible (rm -rf, git reset --hard, drop table), STOP and require Human-In-The-Loop approval from the Boss.',
      'Never expose private keys, API secrets, or passwords in chat speech bubbles or logs.',
    ],
    mandatoryRules: [
      'Destructive commands targeting root, system directories, or entire databases are strictly blocked.',
      'Human-in-the-Loop confirmation is mandatory for all mission-critical or financial operations.',
    ],
  },

  'sop-task-orchestration': {
    id: 'sop-task-orchestration',
    title: 'SOP-04: Multi-Agent Task Orchestration, Allocation & Parallelism',
    category: 'workflow',
    summary:
      'Leadership protocols for Zen to evaluate complexity, choose the optimal execution strategy, and allocate tasks.',
    guidelines: [
      'Trivial tasks (status checks, simple queries): Answer directly or route solely to Dhea/Memory.',
      'Moderate tasks (isolated coding or research): Allocate to single specialist (Iky or Dre).',
      'Complex tasks (full feature implementation): Decompose into structured phases (Planning -> Scaffolding -> Implementation -> QA Verification -> Archival).',
      'Parallel Execution: Whenever 2 or more subtasks are decoupled (e.g. Dre investigates docs while Iky writes boilerplate, or Iky writes code while Rai drafts test scripts), run them in parallel to minimize latency.',
      'Always ensure final deliverable is synthesized and reported back clearly in Indonesian to the Boss.',
    ],
    mandatoryRules: [
      'Zen must never do the low-level coding when Iky is available.',
      'Completed tasks must always be indexed into pgvector long-term memory and Redis cache by Dhea.',
    ],
  },
};

/**
 * Searches SOP documents by keyword or category.
 */
export function searchOfficeSop(query: string): SopDocument[] {
  const q = query.toLowerCase().trim();
  if (!q) {
    return Object.values(OFFICE_SOPS);
  }

  return Object.values(OFFICE_SOPS).filter((sop) => {
    return (
      sop.title.toLowerCase().includes(q) ||
      sop.category.toLowerCase().includes(q) ||
      sop.summary.toLowerCase().includes(q) ||
      sop.guidelines.some((g) => g.toLowerCase().includes(q)) ||
      sop.mandatoryRules.some((r) => r.toLowerCase().includes(q))
    );
  });
}

