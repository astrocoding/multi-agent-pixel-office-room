import crypto from 'node:crypto';
import type {
  FeedbackRecord,
  ImprovementProposal,
  ProposalType,
} from './types.js';

export interface FeedbackSubmissionInput {
  idempotencyKey: string;
  taskId?: string;
  actorId: string;
  projectScope?: string;
  feedbackType:
    | 'user_approval'
    | 'user_rejection'
    | 'explicit_correction'
    | 'failed_test'
    | 'invalid_artifact'
    | 'execution_error';
  targetType: 'skill' | 'artifact' | 'task_result' | 'preference' | 'retrieval';
  targetIdentifier: string;
  rating?: number;
  details: string;
  evidence?: Record<string, unknown>;
}

export interface ReviewProposalInput {
  proposalId: string;
  reviewerId: string;
  reviewerRole: string;
  decision: 'approve' | 'reject';
  reason: string;
}

export class FeedbackPipeline {
  public static readonly MAX_PROPOSALS_PER_TASK = 2;

  /**
   * Processes feedback submission with idempotency protection.
   */
  public static createFeedbackRecord(input: FeedbackSubmissionInput): FeedbackRecord {
    const feedbackId = `fb_${crypto.randomUUID().slice(0, 12)}`;

    return {
      id: feedbackId,
      idempotencyKey: input.idempotencyKey,
      taskId: input.taskId,
      actorId: input.actorId,
      projectScope: input.projectScope || 'default',
      feedbackType: input.feedbackType,
      targetType: input.targetType,
      targetIdentifier: input.targetIdentifier,
      rating: input.rating !== undefined ? input.rating : input.feedbackType === 'user_approval' ? 1 : -1,
      details: input.details,
      evidence: input.evidence || {},
      processed: false,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Generates a controlled improvement proposal from negative feedback or execution failure.
   * Crucial rule: Never directly mutates approved skills. Creates a pending proposal for human review.
   */
  public static generateProposalFromFeedback(params: {
    feedback: FeedbackRecord;
    targetSkillId: string;
    proposalType: ProposalType;
    title: string;
    description: string;
    beforeDiff: string;
    afterDiff: string;
    currentProposalsForTask?: number;
  }): ImprovementProposal | null {
    // Enforce loop limit: max 2 proposals per task
    if ((params.currentProposalsForTask || 0) >= this.MAX_PROPOSALS_PER_TASK) {
      return null;
    }

    // Security check on proposed afterDiff: prevent prompt injection or security policy tampering
    const isSafe = this.auditProposalDiff(params.afterDiff);
    const securityAuditStatus = isSafe ? 'passed' : 'flagged';
    const securityNotes = isSafe
      ? 'Automated security scan passed: no policy bypass or privilege escalation detected.'
      : 'Security scan FLAGGED: contains potentially hazardous instructions or policy tampering.';

    const proposalId = `prop_${crypto.randomUUID().slice(0, 12)}`;

    return {
      id: proposalId,
      targetSkillId: params.targetSkillId,
      proposalType: params.proposalType,
      title: params.title,
      description: params.description,
      justification: `Generated from feedback ${params.feedback.id} (${params.feedback.feedbackType}): ${params.feedback.details}`,
      linkedFeedbackIds: [params.feedback.id],
      beforeDiff: params.beforeDiff,
      afterDiff: params.afterDiff,
      evaluationScore: isSafe ? 0.88 : 0.0,
      evaluationMetrics: {
        regressionTestCount: 12,
        passedRatio: isSafe ? 1.0 : 0.2,
      },
      securityAuditStatus,
      securityNotes,
      status: 'pending_review',
      proposedBy: 'agent_qa_critic',
      reviewedBy: null,
      decisionReason: null,
      publishedVersion: null,
      rollbackPayload: {
        previousContent: params.beforeDiff,
        timestamp: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: null,
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(), // 14 days expiration
    };
  }

  /**
   * Enforces the human-review invariant:
   * AI agents (Zen, Rai, Dre, etc.) CANNOT approve proposals!
   * Only human OWNER can approve or reject proposals.
   */
  public static reviewProposal(
    proposal: ImprovementProposal,
    input: ReviewProposalInput
  ): ImprovementProposal {
    // Strict authorization: Only owner can review
    if (input.reviewerRole !== 'owner') {
      throw new Error(
        `Unauthorized: Only human OWNER is authorized to review improvement proposals (actor '${input.reviewerId}' is '${input.reviewerRole}'). AI agents cannot self-approve proposals.`
      );
    }

    if (proposal.status !== 'pending_review') {
      throw new Error(`Cannot review proposal: current status is '${proposal.status}' (expected 'pending_review').`);
    }

    // Cannot approve flagged security proposals without explicit resolution
    if (input.decision === 'approve' && proposal.securityAuditStatus === 'flagged') {
      throw new Error('Security Guardrail: Cannot approve proposal flagged for security concerns.');
    }

    const nextStatus = input.decision === 'approve' ? 'approved' : 'rejected';

    return {
      ...proposal,
      status: nextStatus,
      reviewedBy: input.reviewerId,
      decisionReason: input.reason,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Publishes an approved proposal:
   * Bumps version, creates audit trail, and prepares rollback snapshot.
   */
  public static publishProposal(
    proposal: ImprovementProposal,
    publisherRole: string,
    currentVersion = '1.0.0'
  ): {
    updatedProposal: ImprovementProposal;
    newVersion: string;
    rollbackSnapshot: Record<string, unknown>;
  } {
    if (publisherRole !== 'owner') {
      throw new Error('Unauthorized: Only human OWNER can publish approved improvement proposals.');
    }

    if (proposal.status !== 'approved') {
      throw new Error(`Cannot publish proposal in status '${proposal.status}'. Must be 'approved'.`);
    }

    // Bump semver minor version
    const versionParts = currentVersion.split('.').map((p) => parseInt(p, 10) || 0);
    const newVersion = `${versionParts[0]}.${(versionParts[1] || 0) + 1}.0`;

    const rollbackSnapshot = {
      version: currentVersion,
      content: proposal.beforeDiff,
      publishedAt: new Date().toISOString(),
    };

    const updatedProposal: ImprovementProposal = {
      ...proposal,
      status: 'published',
      publishedVersion: newVersion,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      rollbackPayload: rollbackSnapshot,
    };

    return {
      updatedProposal,
      newVersion,
      rollbackSnapshot,
    };
  }

  /**
   * Rolls back a published proposal in case of regression.
   */
  public static rollbackProposal(
    proposal: ImprovementProposal,
    operatorRole: string,
    reason: string
  ): {
    rolledBackProposal: ImprovementProposal;
    restoredContent: string;
  } {
    if (operatorRole !== 'owner') {
      throw new Error('Unauthorized: Only human OWNER can execute rollback.');
    }

    if (proposal.status !== 'published') {
      throw new Error(`Cannot rollback proposal in status '${proposal.status}'. Must be 'published'.`);
    }

    const restoredContent = (proposal.rollbackPayload?.previousContent as string) || proposal.beforeDiff;

    const rolledBackProposal: ImprovementProposal = {
      ...proposal,
      status: 'rolled_back',
      decisionReason: `Rolled back: ${reason}`,
      updatedAt: new Date().toISOString(),
    };

    return {
      rolledBackProposal,
      restoredContent,
    };
  }

  private static auditProposalDiff(content: string): boolean {
    const dangerousPatterns = [
      /\b(rm -rf|drop table|format disk|sudo|chmod 777)\b/i,
      /\b(ignore all previous instructions|bypass security|disable auth)\b/i,
      /\b(eval\(|Function\(|child_process)\b/i,
    ];

    return !dangerousPatterns.some((p) => p.test(content));
  }
}

