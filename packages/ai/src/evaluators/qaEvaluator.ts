import { z } from 'zod';

export const qaEvaluationSchema = z.object({
  verdict: z.enum(['APPROVED', 'REQUEST_CHANGES']),
  confidenceScore: z.number().min(0).max(1),
  strengths: z.array(z.string()),
  issues: z.array(z.string()),
  remediationSuggestions: z.array(z.string()),
});

export type QaEvaluation = z.infer<typeof qaEvaluationSchema>;

export class QaEvaluator {
  public static evaluateResult(
    taskObjective: string,
    specialistOutput: string
  ): QaEvaluation {
    const issues: string[] = [];
    const strengths: string[] = [];
    const suggestions: string[] = [];

    if (specialistOutput.length < 20) {
      issues.push('Specialist output is too brief to verify thoroughness.');
      suggestions.push('Provide more concrete implementation details or verification evidence.');
    } else {
      strengths.push('Output provides substantive domain context.');
    }

    if (taskObjective.toLowerCase().includes('code') && !specialistOutput.includes('{') && !specialistOutput.includes('function') && !specialistOutput.includes('class')) {
      issues.push('Code objective requested but output lacks executable structure.');
      suggestions.push('Include TypeScript interfaces or function signatures.');
    }

    const verdict = issues.length === 0 ? 'APPROVED' : 'REQUEST_CHANGES';
    const confidenceScore = issues.length === 0 ? 0.95 : 0.65;

    return {
      verdict,
      confidenceScore,
      strengths,
      issues,
      remediationSuggestions: suggestions,
    };
  }
}

