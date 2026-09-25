import { Gemini, RoutedLlm, BaseLlm } from '@google/adk';

export interface AdkModelConfig {
  apiKey: string;
  preferredModel?: string;
  useInteractionsApi?: boolean;
}

/**
 * 6 Official Modern Gemini Model Tiers (strictly ordered cheapest/fastest to most capable):
 * 1. gemini-3.1-flash-lite: Seri 3 paling hemat biaya, latensi ultra-rendah
 * 2. gemini-3.5-flash-lite: Varian ringan high-throughput untuk automasi skala besar
 * 3. gemini-3-flash-preview: Model pratinjau Flash berbiaya rendah untuk multimodal
 * 4. gemini-3.6-flash: Model terkalibrasi latensi rendah untuk sistem produksi/QA
 * 5. gemini-3.1-pro-preview: Penalaran mendalam dan alur kerja agentik
 * 6. gemini-3.8-flash: Model Flash flagship untuk rekayasa perangkat lunak otonom
 */
export const ADK_MODEL_TIERS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.6-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.8-flash',
] as const;

/**
 * Specialist agent affinity ordering:
 * Each agent uses the most cost-efficient and specialized model for its domain,
 * with fast-failover to alternative tiers.
 */
export const SPECIALIST_MODEL_AFFINITY: Record<string, string[]> = {
  // Iky (Torvalds): Software Engineering, coding, terminal, compilation -> Flagship 3.8 Flash
  iky: [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
  ],
  torvalds: [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
  ],
  // Dre (Ada): Multimodal comprehension, image analysis, documents & web search -> 3 Flash Preview
  dre: [
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash',
  ],
  ada: [
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash',
  ],
  // Gus (Volt): High-throughput batch automation, operations, daemon scripts -> 3.5 Flash-Lite
  gus: [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash-preview',
  ],
  eca: [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash-preview',
  ],
  volt: [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash-preview',
  ],
  // Rai (Iris): Calibrated production verification, zero-hallucination critic -> 3.6 Flash
  rai: [
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3-flash-preview',
  ],
  iris: [
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
    'gemini-3-flash-preview',
  ],
  // Dhea (Mnemo): Knowledge & episodic memory recall -> 3.1 Flash-Lite (cheapest, instant)
  dhea: [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash',
  ],
  mnemo: [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash',
  ],
  // Zen (Atlas): Root Coordinator -> 3.1 Flash-Lite for fast economical triage & dialogue
  zen: [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash',
  ],
  atlas: [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.8-flash',
  ],
};

// Global memory of models that failed (e.g. 404 or quota exceeded) to guarantee 0ms routing delay
const knownDeadModels = new Set<string>();

/**
 * Creates an agent-specific RoutedLlm tailored to the specialist's operational domain.
 */
export function createAgentSpecificAdkModel(
  agentRole: string,
  config: AdkModelConfig
): {
  routedModel: BaseLlm;
  candidates: string[];
} {
  const apiKey = config.apiKey.trim();
  const useInteractionsApi = config.useInteractionsApi ?? false;
  const roleKey = agentRole.toLowerCase().trim();

  const affinity = SPECIALIST_MODEL_AFFINITY[roleKey] || SPECIALIST_MODEL_AFFINITY['atlas'];
  const candidates: string[] = [];

  // If user provided a specific preferred model for coordinator/atlas, place it first
  if (roleKey === 'atlas' && config.preferredModel) {
    const pref = config.preferredModel.trim();
    if (pref) candidates.push(pref);
  }

  for (const mId of affinity) {
    if (!candidates.includes(mId)) {
      candidates.push(mId);
    }
  }

  const modelMap: Record<string, BaseLlm> = {};
  for (const mId of candidates) {
    modelMap[mId] = new Gemini({
      model: mId,
      apiKey,
      useInteractionsApi,
    });
  }

  const routedModel = new RoutedLlm({
    models: modelMap,
    router: (_models, _req, errCtx) => {
      if (errCtx?.failedKeys) {
        for (const k of errCtx.failedKeys) {
          knownDeadModels.add(k);
        }
      }

      // Fast zero-delay selection: pick the first candidate that hasn't failed
      for (const mId of candidates) {
        const failedInCtx = errCtx?.failedKeys?.has(mId);
        const globallyDead = knownDeadModels.has(mId);
        if (!failedInCtx && !globallyDead) {
          return mId;
        }
      }

      // If all candidates in affinity list were marked dead, pick the last non-context-failed or last candidate
      for (const mId of candidates) {
        if (!errCtx?.failedKeys?.has(mId)) {
          return mId;
        }
      }

      return candidates[candidates.length - 1];
    },
  });

  return {
    routedModel,
    candidates,
  };
}

export function createAdkGeminiModels(config: AdkModelConfig): {
  primaryModel: BaseLlm;
  routedModel: BaseLlm;
  candidateModels: string[];
} {
  const apiKey = config.apiKey.trim();
  const preferred = (config.preferredModel || 'gemini-3.1-flash-lite').trim();
  const useInteractionsApi = config.useInteractionsApi ?? false;

  // Build candidate order starting from preferred, then falling forward
  const candidateModels: string[] = [preferred];
  for (const modelId of ADK_MODEL_TIERS) {
    if (!candidateModels.includes(modelId)) {
      candidateModels.push(modelId);
    }
  }

  const modelMap: Record<string, BaseLlm> = {};
  for (const mId of candidateModels) {
    modelMap[mId] = new Gemini({
      model: mId,
      apiKey,
      useInteractionsApi,
    });
  }

  const routedModel = new RoutedLlm({
    models: modelMap,
    router: (_models, _req, errCtx) => {
      if (errCtx?.failedKeys) {
        for (const k of errCtx.failedKeys) {
          knownDeadModels.add(k);
        }
      }

      for (const mId of candidateModels) {
        if (!knownDeadModels.has(mId) && (!errCtx?.failedKeys || !errCtx.failedKeys.has(mId))) {
          return mId;
        }
      }

      for (const mId of candidateModels) {
        if (!errCtx?.failedKeys?.has(mId)) {
          return mId;
        }
      }

      return candidateModels[candidateModels.length - 1];
    },
  });

  return {
    primaryModel: modelMap[preferred] || modelMap[candidateModels[0]],
    routedModel,
    candidateModels,
  };
}
