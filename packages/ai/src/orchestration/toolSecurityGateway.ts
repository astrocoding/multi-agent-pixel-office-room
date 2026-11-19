import { createHmac } from 'node:crypto';
import { AGENT_IDS, type AgentId } from '@agent-office/shared';

export interface SignedRunEnvelope {
  runId: string;
  taskId: string;
  actorId: string;
  actorRole: 'owner' | 'member' | 'guest';
  projectScope: string;
  agentId: AgentId;
  capabilities: string[];
  expiresAt: number;
  signature: string;
}

export interface ToolAuthorizationResult {
  authorized: boolean;
  requiresOwnerApproval: boolean;
  approvalReason?: string;
  rejectionReason?: string;
  sanitizedParams?: Record<string, unknown>;
}

export class ToolSecurityGateway {
  private static readonly SECRET_KEY = process.env.APP_SECRET || 'agent_office_internal_secret_key';

  // Strict allowlist of capabilities per specialist
  public static readonly AGENT_TOOL_ALLOWLIST: Record<AgentId, string[]> = {
    [AGENT_IDS.LEADER]: ['skill_recall', 'skill_list', 'skill_read_reference', 'file_read', 'search_knowledge_sop'],
    [AGENT_IDS.RESEARCH]: ['skill_recall', 'file_read', 'web_docs_search', 'search_knowledge_sop'],
    [AGENT_IDS.ENGINEERING]: ['skill_recall', 'file_read', 'file_write', 'file_edit', 'execute_bash'],
    [AGENT_IDS.AUTOMATION]: ['skill_recall', 'execute_bash', 'file_read', 'file_write'],
    [AGENT_IDS.QA]: ['skill_recall', 'file_read', 'execute_bash'],
    [AGENT_IDS.MEMORY]: ['skill_recall', 'memory_recall', 'memory_store', 'search_knowledge_sop'],
  };

  /**
   * Generates a signed execution envelope for a delegated task run.
   */
  public static createEnvelope(input: {
    runId: string;
    taskId: string;
    actorId: string;
    actorRole: 'owner' | 'member' | 'guest';
    projectScope: string;
    agentId: AgentId;
    capabilities: string[];
    ttlMs?: number;
  }): SignedRunEnvelope {
    const expiresAt = Date.now() + (input.ttlMs || 300000); // 5 min default
    const payload = `${input.runId}:${input.taskId}:${input.actorId}:${input.actorRole}:${input.projectScope}:${input.agentId}:${expiresAt}`;
    const signature = createHmac('sha256', this.SECRET_KEY).update(payload).digest('hex');

    return {
      runId: input.runId,
      taskId: input.taskId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      projectScope: input.projectScope,
      agentId: input.agentId,
      capabilities: input.capabilities,
      expiresAt,
      signature,
    };
  }

  /**
   * Verifies the authenticity and validity of an execution envelope.
   */
  public static verifyEnvelope(envelope: SignedRunEnvelope): boolean {
    if (Date.now() > envelope.expiresAt) {
      return false; // Expired
    }
    const payload = `${envelope.runId}:${envelope.taskId}:${envelope.actorId}:${envelope.actorRole}:${envelope.projectScope}:${envelope.agentId}:${envelope.expiresAt}`;
    const expectedSig = createHmac('sha256', this.SECRET_KEY).update(payload).digest('hex');
    return expectedSig === envelope.signature;
  }

  /**
   * Detects and blocks shadow agents (unregistered or spoofed agent IDs).
   */
  public static isRegisteredAgent(agentId: string): boolean {
    const validIds = Object.values(AGENT_IDS) as string[];
    return validIds.includes(agentId);
  }

  /**
   * Authorizes a tool call at time-of-use with least-privilege checks.
   */
  public static authorizeToolCall(
    envelope: SignedRunEnvelope,
    toolName: string,
    params: Record<string, unknown>
  ): ToolAuthorizationResult {
    // 1. Verify envelope signature
    if (!this.verifyEnvelope(envelope)) {
      return {
        authorized: false,
        requiresOwnerApproval: false,
        rejectionReason: 'Invalid or expired execution envelope token.',
      };
    }

    // 2. Anti-shadow agent check
    if (!this.isRegisteredAgent(envelope.agentId)) {
      return {
        authorized: false,
        requiresOwnerApproval: false,
        rejectionReason: `Access Denied: Agent '${envelope.agentId}' is not a registered agent.`,
      };
    }

    // 3. Agent tool allowlist check
    const allowedTools = this.AGENT_TOOL_ALLOWLIST[envelope.agentId] || [];
    if (!allowedTools.includes(toolName)) {
      return {
        authorized: false,
        requiresOwnerApproval: false,
        rejectionReason: `Policy Violation: Agent '${envelope.agentId}' is not authorized to invoke tool '${toolName}'.`,
      };
    }

    // 4. Path traversal and file security check
    const filePath = (params.filePath as string) || (params.path as string);
    if (filePath && typeof filePath === 'string') {
      if (filePath.includes('..') || filePath.startsWith('/etc/') || filePath.startsWith('/var/')) {
        return {
          authorized: false,
          requiresOwnerApproval: false,
          rejectionReason: `Path Traversal Blocked: Path '${filePath}' attempts to escape the project sandbox.`,
        };
      }
    }

    // 5. Sensitive action & command check (Owner approval gate)
    const cmd = (params.command as string) || '';
    if (typeof cmd === 'string' && cmd.length > 0) {
      const lowerCmd = cmd.toLowerCase();
      const isDangerous =
        lowerCmd.includes('rm -rf') ||
        lowerCmd.includes('drop table') ||
        lowerCmd.includes('deploy') ||
        lowerCmd.includes('sudo') ||
        lowerCmd.includes('chmod 777');

      if (isDangerous) {
        if (envelope.actorRole !== 'owner') {
          return {
            authorized: false,
            requiresOwnerApproval: true,
            approvalReason: `Sensitive shell execution '${cmd}' requires explicit Owner authorization.`,
            rejectionReason: 'Privileged command requires Owner approval.',
          };
        }
        return {
          authorized: true,
          requiresOwnerApproval: true,
          approvalReason: `Owner confirmation required for privileged command: '${cmd}'`,
        };
      }
    }

    return {
      authorized: true,
      requiresOwnerApproval: false,
      sanitizedParams: params,
    };
  }

  /**
   * Demarcates untrusted text as DATA so LLMs do not execute injected instructions.
   */
  public static demarcateUntrustedData(content: string, sourceLabel: string): string {
    return `[START_UNTRUSTED_EXTERNAL_DATA: ${sourceLabel}]\n${content}\n[END_UNTRUSTED_EXTERNAL_DATA: ${sourceLabel}]`;
  }
}

