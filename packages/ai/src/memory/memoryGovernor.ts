import type {
  MemoryCategory,
  MemoryVisibility,
  RetentionPolicy,
  ScopedMemoryRecord,
  VerificationState,
} from './types.js';

export interface MemoryAccessScope {
  actorId: string;
  role?: 'owner' | 'member' | 'guest';
  projectScope: string;
  tenantId?: string;
}

export class MemoryGovernor {
  public static readonly MAX_WRITES_PER_TASK = 5;

  /**
   * Evaluates if the current actor is permitted to read a target memory record
   * based on tenant, project scope, and visibility ACL rules.
   */
  public static isReadAuthorized(record: ScopedMemoryRecord, scope: MemoryAccessScope): boolean {
    const tenantId = scope.tenantId || 'default';
    if (record.tenantId !== tenantId) {
      return false; // Strict tenant isolation
    }

    // Deleted records are never accessible
    if (record.deletedAt) {
      return false;
    }

    // Expired records are not accessible
    if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
      return false;
    }

    // Public records are readable by anyone in same tenant
    if (record.visibility === 'public') {
      return true;
    }

    // Owner role has read access within same tenant
    if (scope.role === 'owner') {
      return true;
    }

    // Private records can only be read by the author/actor
    if (record.visibility === 'private') {
      return record.actorId === scope.actorId;
    }

    // Project-scoped records require matching project scope
    if (record.visibility === 'project') {
      return record.projectScope === scope.projectScope || record.projectScope === 'default';
    }

    // Internal visibility allows any registered project member
    if (record.visibility === 'internal') {
      return true;
    }

    return false;
  }

  /**
   * Evaluates if the current actor is permitted to write or modify a memory record.
   */
  public static isWriteAuthorized(
    category: MemoryCategory,
    visibility: MemoryVisibility,
    scope: MemoryAccessScope
  ): boolean {
    // Guests cannot write any memories
    if (scope.role === 'guest') {
      return false;
    }

    // Procedural memory (skills/SOPs) can only be written by Owner or explicit governance pipeline
    if (category === 'procedural' && scope.role !== 'owner') {
      return false;
    }

    return true;
  }

  /**
   * Enforces the non-promotion invariant:
   * AI Agents or automated inferences can NEVER directly write verified_truth.
   * Only human owners or verified automated test assertions can set verified_truth.
   */
  public static enforceVerificationState(
    requestedState: VerificationState,
    scope: MemoryAccessScope,
    isAutomatedAgent: boolean
  ): VerificationState {
    if (isAutomatedAgent && requestedState === 'verified_truth') {
      // Degrade to model_inference or observed_fact
      return 'model_inference';
    }

    if (requestedState === 'verified_truth' && scope.role !== 'owner') {
      return 'user_claim';
    }

    return requestedState;
  }

  /**
   * Computes expiration timestamp based on retention policy.
   */
  public static computeExpiration(policy: RetentionPolicy, baseTime = Date.now()): string | null {
    switch (policy) {
      case 'session':
        return new Date(baseTime + 24 * 3600 * 1000).toISOString(); // 24 hours
      case '30_days':
        return new Date(baseTime + 30 * 24 * 3600 * 1000).toISOString();
      case '90_days':
        return new Date(baseTime + 90 * 24 * 3600 * 1000).toISOString();
      case 'permanent':
      default:
        return null;
    }
  }

  /**
   * Filters memories for retrieval, ensuring ACL and active validity.
   */
  public static filterAuthorizedMemories(
    records: ScopedMemoryRecord[],
    scope: MemoryAccessScope
  ): ScopedMemoryRecord[] {
    return records.filter((r) => this.isReadAuthorized(r, scope));
  }
}

