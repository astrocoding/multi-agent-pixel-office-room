import type { SkillMetadata, SkillStatus, SourceTrustLevel } from './types.js';

export class SkillTrustPolicy {
  /**
   * Only skills with status === 'approved' can be executed/injected as procedural instructions.
   */
  public static isSkillApproved(skill: Pick<SkillMetadata, 'status'>): boolean {
    return skill.status === 'approved';
  }

  /**
   * Validates whether a skill has the required approval and trust tier to be loaded
   * by Zen or specialist agents as an active procedural guideline.
   */
  public static canExecuteAsProcedure(
    skill: Pick<SkillMetadata, 'status' | 'sourceTrust'>
  ): boolean {
    if (skill.status !== 'approved') {
      return false;
    }
    // Only approved local repository skills or system builtins are allowed
    return (
      skill.sourceTrust === 'approved_local_skill' ||
      skill.sourceTrust === 'system_builtin'
    );
  }

  /**
   * Asserts approval before procedural loading. Throws if not approved.
   */
  public static assertCanExecuteAsProcedure(
    skill: Pick<SkillMetadata, 'skillId' | 'status' | 'sourceTrust'>
  ): void {
    if (!this.canExecuteAsProcedure(skill)) {
      throw new Error(
        `[SecurityPolicy] Skill '${skill.skillId}' cannot be loaded as procedural instruction. Status: '${skill.status}', Trust: '${skill.sourceTrust}'. Requires explicit approval.`
      );
    }
  }

  /**
   * Evaluates the initial status and trust level for newly discovered skills.
   * By default, all newly discovered files start as 'proposed' and 'unreviewed_proposal'.
   * Never auto-promote unreviewed markdown to approved.
   */
  public static evaluateInitialTrust(
    _canonicalPath: string,
    manuallyApproved = false,
    approver?: string
  ): { status: SkillStatus; sourceTrust: SourceTrustLevel; approvedBy: string | null } {
    if (manuallyApproved) {
      return {
        status: 'approved',
        sourceTrust: 'approved_local_skill',
        approvedBy: approver || 'system_admin',
      };
    }

    return {
      status: 'proposed',
      sourceTrust: 'unreviewed_proposal',
      approvedBy: null,
    };
  }
}

