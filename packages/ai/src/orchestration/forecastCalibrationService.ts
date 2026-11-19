import { type ComplexityTier, type RiskTier } from '@agent-office/shared';

export interface TaskExecutionMetrics {
  taskId: string;
  taskType: string;
  complexityTier: ComplexityTier;
  riskTier: RiskTier;
  predictedDurationMs: number;
  actualWallTimeMs: number;
  predictedTokens: number;
  actualTokens: number;
  toolInvocations: number;
  success: boolean;
  revisionsCount: number;
  timestamp: string;
}

export interface ResourceForecastResult {
  estimatedDurationRangeMs: [number, number];
  estimatedTokens: number;
  confidence: 'high' | 'medium' | 'low' | 'insufficient_history';
  isCalibrated: boolean;
  sampleCount: number;
  basis: string;
}

export interface CalibrationStats {
  taskType: string;
  sampleCount: number;
  durationMAE: number;
  durationWAPE: number;
  tokenMAE: number;
  tokenWAPE: number;
}

export class ForecastCalibrationService {
  private static history: TaskExecutionMetrics[] = [];
  private static readonly MIN_SAMPLES_FOR_CALIBRATION = 5;

  // Bounded loop policy invariants
  public static readonly MAX_DRAFT_REVISIONS = 1;
  public static readonly MAX_REPLANS = 2;
  public static readonly MAX_RETRIES = 2;
  public static readonly MAX_CLARIFICATION_ROUNDS = 2;
  public static readonly MAX_PROPOSALS_PER_TASK = 1;

  public static recordExecution(metrics: TaskExecutionMetrics): void {
    this.history.push(metrics);
  }

  public static getHistory(): TaskExecutionMetrics[] {
    return [...this.history];
  }

  public static clearHistory(): void {
    this.history = [];
  }

  /**
   * Predicts required resources using historical median and p80/p90 intervals.
   * If insufficient samples exist, returns a wide conservative range and marks 'insufficient_history'.
   * Never fabricates single precise completion numbers without historical basis.
   */
  public static predictResources(
    taskType: string,
    complexityTier: ComplexityTier
  ): ResourceForecastResult {
    const matching = this.history.filter(
      (h) => h.taskType === taskType && h.complexityTier === complexityTier && h.success
    );

    if (matching.length < this.MIN_SAMPLES_FOR_CALIBRATION) {
      // Conservative fallback interval
      const baseDefaults: Record<ComplexityTier, [number, number]> = {
        low: [500, 3000],
        standard: [1500, 8000],
        moderate: [3000, 20000],
        high: [8000, 45000],
        very_high: [15000, 120000],
      };
      const tokenDefaults: Record<ComplexityTier, number> = {
        low: 150,
        standard: 350,
        moderate: 750,
        high: 1500,
        very_high: 3000,
      };

      return {
        estimatedDurationRangeMs: baseDefaults[complexityTier],
        estimatedTokens: tokenDefaults[complexityTier],
        confidence: 'insufficient_history',
        isCalibrated: false,
        sampleCount: matching.length,
        basis: `Sample count (${matching.length}) < ${this.MIN_SAMPLES_FOR_CALIBRATION}. Conservative uncalibrated interval applied.`,
      };
    }

    // Compute empirical percentiles (p50 median and p90 upper bound)
    const durations = matching.map((m) => m.actualWallTimeMs).sort((a, b) => a - b);
    const tokens = matching.map((m) => m.actualTokens).sort((a, b) => a - b);

    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p90 = durations[Math.ceil(durations.length * 0.9) - 1];
    const medianTokens = tokens[Math.floor(tokens.length * 0.5)];

    return {
      estimatedDurationRangeMs: [p50, p90],
      estimatedTokens: medianTokens,
      confidence: matching.length >= 15 ? 'high' : 'medium',
      isCalibrated: true,
      sampleCount: matching.length,
      basis: `Calibrated from ${matching.length} verified executions (p50-p90).`,
    };
  }

  /**
   * Calculates Mean Absolute Error (MAE) and Weighted Absolute Percentage Error (WAPE).
   */
  public static calculateErrorMetrics(taskType?: string): CalibrationStats[] {
    const types = taskType ? [taskType] : Array.from(new Set(this.history.map((h) => h.taskType)));
    const results: CalibrationStats[] = [];

    for (const t of types) {
      const items = this.history.filter((h) => h.taskType === t);
      if (items.length === 0) continue;

      let totalDurationAbsErr = 0;
      let totalDurationActual = 0;
      let totalTokenAbsErr = 0;
      let totalTokenActual = 0;

      for (const item of items) {
        totalDurationAbsErr += Math.abs(item.actualWallTimeMs - item.predictedDurationMs);
        totalDurationActual += item.actualWallTimeMs;
        totalTokenAbsErr += Math.abs(item.actualTokens - item.predictedTokens);
        totalTokenActual += item.actualTokens;
      }

      const durationMAE = Number((totalDurationAbsErr / items.length).toFixed(2));
      const durationWAPE = Number(
        (totalDurationActual > 0 ? (totalDurationAbsErr / totalDurationActual) * 100 : 0).toFixed(2)
      );
      const tokenMAE = Number((totalTokenAbsErr / items.length).toFixed(2));
      const tokenWAPE = Number(
        (totalTokenActual > 0 ? (totalTokenAbsErr / totalTokenActual) * 100 : 0).toFixed(2)
      );

      results.push({
        taskType: t,
        sampleCount: items.length,
        durationMAE,
        durationWAPE,
        tokenMAE,
        tokenWAPE,
      });
    }

    return results;
  }
}

