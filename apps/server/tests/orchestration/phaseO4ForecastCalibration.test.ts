import test from 'node:test';
import assert from 'node:assert/strict';
import { ForecastCalibrationService } from '@agent-office/ai';

test('PHASE O4: ForecastCalibrationService - Insufficient History Labeling (No Fabricated Times)', () => {
  ForecastCalibrationService.clearHistory();

  // 0 or sparse samples must return uncalibrated conservative interval
  const res = ForecastCalibrationService.predictResources('code_implementation', 'standard');
  assert.equal(res.isCalibrated, false);
  assert.equal(res.confidence, 'insufficient_history');
  assert.ok(res.estimatedDurationRangeMs[0] > 0);
  assert.ok(res.estimatedDurationRangeMs[1] > res.estimatedDurationRangeMs[0]);
  assert.ok(res.basis.includes('Sample count (0) < 5'));
});

test('PHASE O4: ForecastCalibrationService - Empirical Calibration with MAE & WAPE', () => {
  ForecastCalibrationService.clearHistory();

  // Record 6 verified executions of 'code_implementation' (standard complexity)
  const actualDurations = [2000, 2500, 2200, 2800, 2100, 2400];
  const actualTokens = [300, 350, 320, 400, 310, 340];

  for (let i = 0; i < actualDurations.length; i++) {
    ForecastCalibrationService.recordExecution({
      taskId: `task_rec_${i}`,
      taskType: 'code_implementation',
      complexityTier: 'standard',
      riskTier: 'R2',
      predictedDurationMs: 2500,
      actualWallTimeMs: actualDurations[i],
      predictedTokens: 350,
      actualTokens: actualTokens[i],
      toolInvocations: 2,
      success: true,
      revisionsCount: 0,
      timestamp: new Date().toISOString(),
    });
  }

  // Now prediction should be calibrated
  const calibrated = ForecastCalibrationService.predictResources('code_implementation', 'standard');
  assert.equal(calibrated.isCalibrated, true);
  assert.ok(calibrated.confidence === 'medium' || calibrated.confidence === 'high');
  assert.equal(calibrated.sampleCount, 6);
  assert.ok(calibrated.estimatedDurationRangeMs[0] >= 2000);
  assert.ok(calibrated.estimatedDurationRangeMs[1] <= 3000);

  // Check MAE and WAPE statistics
  const stats = ForecastCalibrationService.calculateErrorMetrics('code_implementation');
  assert.equal(stats.length, 1);
  assert.equal(stats[0].sampleCount, 6);
  assert.ok(stats[0].durationMAE > 0);
  assert.ok(stats[0].durationWAPE > 0 && stats[0].durationWAPE < 30);
  assert.ok(stats[0].tokenMAE > 0);
  assert.ok(stats[0].tokenWAPE > 0 && stats[0].tokenWAPE < 30);
});

test('PHASE O4: Bounded Review Loops - Constant Hard Ceilings', () => {
  assert.equal(ForecastCalibrationService.MAX_DRAFT_REVISIONS, 1);
  assert.equal(ForecastCalibrationService.MAX_REPLANS, 2);
  assert.equal(ForecastCalibrationService.MAX_RETRIES, 2);
  assert.equal(ForecastCalibrationService.MAX_CLARIFICATION_ROUNDS, 2);
  assert.equal(ForecastCalibrationService.MAX_PROPOSALS_PER_TASK, 1);
});

