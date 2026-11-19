import { type WorkUnit, type WorkPlan } from '@agent-office/shared';

export interface DAGValidationResult {
  isValid: boolean;
  cyclesDetected: string[][];
  missingDependencies: Array<{ workId: string; missingDep: string }>;
  conflictingLocks: Array<{ lock: string; workIds: string[] }>;
  criticalPath: string[];
  totalEstimatedDurationMs: number;
}

export interface ExecutionStage {
  stageIndex: number;
  parallelUnits: WorkUnit[];
  activeLocks: string[];
}

export class DAGScheduler {
  private static readonly DEFAULT_MAX_CONCURRENCY = 3;

  /**
   * Validates that the work units form a valid Directed Acyclic Graph (DAG):
   * 1. No cycles (dependency loops).
   * 2. No missing dependencies.
   * 3. Detects resource lock conflicts between units that might run concurrently.
   * 4. Computes critical path and total duration.
   */
  public static validate(workUnits: WorkUnit[]): DAGValidationResult {
    const unitMap = new Map<string, WorkUnit>();
    for (const u of workUnits) {
      unitMap.set(u.workId, u);
    }

    const missingDependencies: Array<{ workId: string; missingDep: string }> = [];
    for (const u of workUnits) {
      for (const dep of u.dependsOn) {
        if (!unitMap.has(dep)) {
          missingDependencies.push({ workId: u.workId, missingDep: dep });
        }
      }
    }

    // Cycle detection via DFS
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cyclesDetected: string[][] = [];

    const detectCycles = (workId: string, path: string[]) => {
      visited.add(workId);
      recStack.add(workId);

      const unit = unitMap.get(workId);
      if (unit) {
        for (const dep of unit.dependsOn) {
          if (!visited.has(dep)) {
            detectCycles(dep, [...path, dep]);
          } else if (recStack.has(dep)) {
            cyclesDetected.push([...path, dep]);
          }
        }
      }

      recStack.delete(workId);
    };

    for (const u of workUnits) {
      if (!visited.has(u.workId)) {
        detectCycles(u.workId, [u.workId]);
      }
    }

    // Compute Critical Path using topological levels
    const { stages, conflictingLocks } = this.planExecutionStages(workUnits, this.DEFAULT_MAX_CONCURRENCY);
    const criticalPath: string[] = [];
    let totalEstimatedDurationMs = 0;

    for (const stage of stages) {
      let maxStageDuration = 0;
      let longestUnit = stage.parallelUnits[0];
      for (const u of stage.parallelUnits) {
        if (u.estimatedDurationMs >= maxStageDuration) {
          maxStageDuration = u.estimatedDurationMs;
          longestUnit = u;
        }
      }
      if (longestUnit) {
        criticalPath.push(longestUnit.workId);
        totalEstimatedDurationMs += maxStageDuration;
      }
    }

    return {
      isValid: missingDependencies.length === 0 && cyclesDetected.length === 0,
      cyclesDetected,
      missingDependencies,
      conflictingLocks,
      criticalPath,
      totalEstimatedDurationMs,
    };
  }

  /**
   * Plans bounded parallel execution stages respecting:
   * 1. Dependency ordering (a unit can only run after all its dependencies are completed).
   * 2. Exclusive resource locks (units modifying the same file or DB table are serialized).
   * 3. Max concurrency cap (defaults to maxConcurrentAgents = 3).
   */
  public static planExecutionStages(
    workUnits: WorkUnit[],
    maxConcurrency = DAGScheduler.DEFAULT_MAX_CONCURRENCY
  ): {
    stages: ExecutionStage[];
    conflictingLocks: Array<{ lock: string; workIds: string[] }>;
  } {
    const completedWorkIds = new Set<string>();
    const remainingUnits = [...workUnits];
    const stages: ExecutionStage[] = [];
    const conflictingLocksMap = new Map<string, string[]>();

    let stageCounter = 0;
    while (remainingUnits.length > 0) {
      // Find all units whose dependencies have completed
      const runnableCandidates = remainingUnits.filter((u) =>
        u.dependsOn.every((depId) => completedWorkIds.has(depId))
      );

      if (runnableCandidates.length === 0) {
        // Deadlock or cycle encountered
        break;
      }

      const stageUnits: WorkUnit[] = [];
      const stageLocks = new Set<string>();

      for (const candidate of runnableCandidates) {
        if (stageUnits.length >= maxConcurrency) {
          break; // Concurrency budget reached for this stage
        }

        // Check resource lock conflicts with already scheduled units in this stage
        const hasLockConflict = candidate.resourceLocks.some((lock) => stageLocks.has(lock));
        if (hasLockConflict) {
          for (const lock of candidate.resourceLocks) {
            if (stageLocks.has(lock)) {
              const existing = conflictingLocksMap.get(lock) || [];
              conflictingLocksMap.set(lock, Array.from(new Set([...existing, candidate.workId])));
            }
          }
          continue; // Defer candidate to next stage to avoid race conditions
        }

        // Add candidate to current stage
        stageUnits.push(candidate);
        for (const lock of candidate.resourceLocks) {
          stageLocks.add(lock);
        }
      }

      if (stageUnits.length === 0) {
        // Force at least 1 candidate if all were blocked by locks
        const forced = runnableCandidates[0];
        stageUnits.push(forced);
        for (const lock of forced.resourceLocks) {
          stageLocks.add(lock);
        }
      }

      // Record stage
      stages.push({
        stageIndex: stageCounter++,
        parallelUnits: stageUnits,
        activeLocks: Array.from(stageLocks),
      });

      // Mark units as completed for subsequent stages
      for (const u of stageUnits) {
        completedWorkIds.add(u.workId);
        const idx = remainingUnits.findIndex((r) => r.workId === u.workId);
        if (idx !== -1) {
          remainingUnits.splice(idx, 1);
        }
      }
    }

    const conflictingLocks = Array.from(conflictingLocksMap.entries()).map(([lock, workIds]) => ({
      lock,
      workIds,
    }));

    return { stages, conflictingLocks };
  }
}

