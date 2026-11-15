import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { ModelRouteMetrics, ModelCatalogItem, ModelTradeoffAttributes } from '@agent-office/shared';

export interface ModelRequestOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  imageAttachments?: { mimeType: string; base64Data: string }[];
  operationType?: string;
  taskId?: string;
  sessionId?: string;
  agentId?: string;
}

export interface ModelResponse {
  text: string;
  metrics: ModelRouteMetrics;
}

export interface StructuredModelResponse<T> {
  data: T;
  rawText: string;
  metrics: ModelRouteMetrics;
}

export interface IModelProvider {
  readonly id: string;
  readonly modelName: string;
  generateText(prompt: string, options?: ModelRequestOptions): Promise<ModelResponse>;
  generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: ModelRequestOptions
  ): Promise<StructuredModelResponse<T>>;
  generateEmbedding(text: string): Promise<number[]>;
  isHealthy(): Promise<boolean>;
}

export interface GeminiModelInfo extends ModelCatalogItem {}

/**
 * Gemini models catalog strictly ordered from CHEAPEST to HIGHEST capability.
 * Auto-router starts from Tier 1 (cheapest) and only falls forward to higher tiers
 * if lower tiers return 404 (deprecated/unavailable), 429 (quota), or 400.
 */
export const GEMINI_MODEL_CATALOG: GeminiModelInfo[] = [
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    version: 'v3.1-lite',
    tier: 1,
    category: 'text',
    costTier: 'cheapest',
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.2,
    description: 'Model seri 3 paling hemat biaya untuk tugas volume tinggi yang membutuhkan latensi ultra rendah.',
    strengths: ['Ultra-low latency', 'Lowest token cost', 'High throughput concurrency'],
    recommendedFor: ['Realtime dialogue stream', 'Status telemetry & notifications', 'Fast tool dispatching'],
    tradeoffs: {
      speed: 'Ultra Fast',
      cost: 'Cheapest',
      reasoning: 'Basic',
      contextWindow: '1M tokens',
    },
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    version: 'v3.5-lite',
    tier: 2,
    category: 'text',
    costTier: 'economy',
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.3,
    description: 'Varian ringan yang dirancang untuk throughput skala besar dengan kemampuan penalaran menengah yang seimbang.',
    strengths: ['Balanced speed & reasoning', 'Low latency', 'Economical token usage'],
    recommendedFor: ['Task directive breakdown', 'Workspace file summaries', 'Memory vector synthesis'],
    tradeoffs: {
      speed: 'Fast',
      cost: 'Economy',
      reasoning: 'Moderate',
      contextWindow: '1M tokens',
    },
  },
  {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    version: 'v3.0-preview',
    tier: 3,
    category: 'text',
    costTier: 'economy',
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.4,
    description: 'Model pratinjau Flash berbiaya ekonomis dengan pemahaman konteks visual multimodal.',
    strengths: ['Visual artifact comprehension', 'Fast multimodal processing', 'Cost efficiency'],
    recommendedFor: ['Multimodal file attachments', 'UI mockup extraction', 'Image inspect prompts'],
    tradeoffs: {
      speed: 'Fast',
      cost: 'Economy',
      reasoning: 'Moderate',
      contextWindow: '1M tokens',
    },
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    version: 'v3.6-stable',
    tier: 4,
    category: 'text',
    costTier: 'standard',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    description: 'Model efisien dengan penalaran andal untuk sistem produksi dan alur eksekusi kode terkalibrasi.',
    strengths: ['Robust code generation', 'Schema compliance', 'Fast execution pipeline'],
    recommendedFor: ['Backend/frontend code synthesis', 'File edits & refactoring', 'Test script authoring'],
    tradeoffs: {
      speed: 'Fast',
      cost: 'Standard',
      reasoning: 'Advanced',
      contextWindow: '1M tokens',
    },
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    version: 'v3.1-pro',
    tier: 5,
    category: 'text',
    costTier: 'advanced',
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.0,
    description: 'Model penalaran tingkat lanjut untuk alur kerja agentik multi-tahap dan arsitektur sistem kompleks.',
    strengths: ['Deep contextual reasoning', 'Multi-step agent planning', 'Complex schema deduction'],
    recommendedFor: ['Chief of Staff task roadmapping', 'System architecture design', 'Root cause debugging'],
    tradeoffs: {
      speed: 'Balanced',
      cost: 'Advanced',
      reasoning: 'Deep',
      contextWindow: '2M tokens',
    },
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    version: 'v3.8-enterprise',
    tier: 6,
    category: 'text',
    costTier: 'high_performance',
    inputCostPer1M: 0.3,
    outputCostPer1M: 1.2,
    description: 'Model Flash mutakhir untuk rekayasa perangkat lunak otonom, audit QA ketat, dan penanganan instruksi kritis.',
    strengths: ['High-performance autonomous engineering', 'Rigorous QA validation', 'Complex bash/tool automation'],
    recommendedFor: ['Autonomous task execution', 'Automated QA & Critic verification', 'Full pipeline delivery'],
    tradeoffs: {
      speed: 'Fast',
      cost: 'High Performance',
      reasoning: 'Deep',
      contextWindow: '2M tokens',
    },
  },
  /* =========================================================================
   * Nano Banana Image Generation Models Suite
   * ========================================================================= */
  {
    id: 'gemini-3.1-flash-lite-image',
    name: 'Nano Banana 2 Lite',
    version: 'v3.1-lite-image',
    tier: 7,
    category: 'image',
    costTier: 'cheapest',
    inputCostPer1M: 0.08,
    outputCostPer1M: 0.4,
    description: 'Versi paling ringan dan cepat untuk pembuatan gambar massal atau dengan latensi sangat rendah.',
    strengths: ['Pembuatan gambar massal (bulk)', 'Latensi sangat rendah', 'Biaya paling ekonomis'],
    recommendedFor: ['Bulk image generation', 'Low-latency game sprites & icons', 'Rapid visual brainstorming'],
    tradeoffs: {
      speed: 'Ultra Fast',
      cost: 'Cheapest',
      reasoning: 'Moderate',
      contextWindow: '1024x1024 (PNG, JPG, WEBP)',
    },
  },
  {
    id: 'gemini-2.5-flash-image',
    name: 'Nano Banana (Dasar)',
    version: 'v2.5-flash-image',
    tier: 8,
    category: 'image',
    costTier: 'economy',
    inputCostPer1M: 0.1,
    outputCostPer1M: 0.5,
    description: 'Model generasi awal untuk pembuatan dan pengeditan gambar berbasis percakapan.',
    strengths: ['Pengeditan gambar percakapan', 'Generasi visual dasar', 'Output gambar stabil'],
    recommendedFor: ['Conversational image edits', 'Avatar & badge creation', 'Basic illustrations'],
    tradeoffs: {
      speed: 'Fast',
      cost: 'Economy',
      reasoning: 'Moderate',
      contextWindow: '1024x1024 (PNG, JPG, WEBP)',
    },
  },
  {
    id: 'gemini-3.1-flash-image',
    name: 'Nano Banana 2',
    version: 'v3.1-flash-image',
    tier: 9,
    category: 'image',
    costTier: 'economy',
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.75,
    description: 'Model utama serbaguna yang menggabungkan kecepatan tinggi dengan kualitas visual tinggi dan rendering teks akurat.',
    strengths: ['Kualitas visual tinggi', 'Rendering teks & tipografi akurat', 'Serbaguna & cepat'],
    recommendedFor: ['UI mockups & wireframes', 'Logos & banners dengan teks', 'Aset grafis presentasi'],
    tradeoffs: {
      speed: 'Fast',
      cost: 'Economy',
      reasoning: 'Advanced',
      contextWindow: 'Multi-aspect 1024-2048px (PNG, JPG, WEBP)',
    },
  },
  {
    id: 'gemini-nano-banana-2.1',
    name: 'Nano Banana 2.1',
    version: 'v2.1-image',
    tier: 10,
    category: 'image',
    costTier: 'standard',
    inputCostPer1M: 0.2,
    outputCostPer1M: 0.9,
    description: 'Versi terbaru dengan pemahaman pengetahuan dunia yang lebih luas dan ketepatan pengeditan tinggi.',
    strengths: ['Pengetahuan dunia luas', 'Ketepatan pengeditan tinggi (precision edit)', 'Koherensi visual tinggi'],
    recommendedFor: ['Contextual graphic synthesis', 'Pengeditan detail gambar iteratif', 'Ilustrasi arsitektur & teknis'],
    tradeoffs: {
      speed: 'Fast',
      cost: 'Standard',
      reasoning: 'Advanced',
      contextWindow: 'Multi-aspect 1024-2048px (PNG, JPG, WEBP)',
    },
  },
  {
    id: 'gemini-3-pro-image',
    name: 'Nano Banana Pro',
    version: 'v3.0-pro-image',
    tier: 11,
    category: 'image',
    costTier: 'high_performance',
    inputCostPer1M: 0.35,
    outputCostPer1M: 1.5,
    description: 'Dioptimalkan untuk tata letak kompleks, tipografi tingkat studio, dan penalaran desain yang mendalam.',
    strengths: ['Tipografi tingkat studio', 'Tata letak & layout visual kompleks', 'Penalaran desain mendalam'],
    recommendedFor: ['Professional branding & posters', 'Komposisi desain grafis tingkat studio', 'Infografis & skema teknis rumit'],
    tradeoffs: {
      speed: 'Balanced',
      cost: 'High Performance',
      reasoning: 'Deep',
      contextWindow: 'Studio Resolution up to 4K (PNG, JPG, WEBP)',
    },
  },
];

export const IMAGE_MODEL_CATALOG: GeminiModelInfo[] = GEMINI_MODEL_CATALOG.filter(
  (m) => m.category === 'image'
);

export function calculateModelCost(modelName: string, promptTokens: number, completionTokens: number): number {
  const info = GEMINI_MODEL_CATALOG.find((m) => m.id === modelName);
  const inputRate = info ? info.inputCostPer1M : 0.15;
  const outputRate = info ? info.outputCostPer1M : 0.6;
  return Number(((promptTokens * inputRate + completionTokens * outputRate) / 1_000_000).toFixed(6));
}

export class GeminiProvider implements IModelProvider {
  public readonly id = 'gemini';
  private apiKey: string;
  private candidateModels: string[];
  private activeModelIndex = 0;
  private isAutoRouterMode = true;
  private static globalUnavailableModels = new Set<string>();
  private failedModels = new Set<string>();
  private chatModelsCache = new Map<string, ChatGoogleGenerativeAI>();
  private embeddingModel: GoogleGenerativeAIEmbeddings;
  private onModelSwitchedCallback?: (newModel: string, reason: string) => void;

  constructor(apiKey: string, preferredModel?: string) {
    this.apiKey = apiKey;

    // Strict cheapest-first hierarchy by default
    const catalogModelIds = GEMINI_MODEL_CATALOG.map((m) => m.id);
    if (preferredModel && !catalogModelIds.includes(preferredModel)) {
      this.candidateModels = [preferredModel, ...catalogModelIds];
    } else if (preferredModel) {
      this.candidateModels = [
        preferredModel,
        ...catalogModelIds.filter((m) => m !== preferredModel),
      ];
    } else {
      this.candidateModels = [...catalogModelIds];
    }

    // Filter out globally known deprecated or unavailable models to ensure 0-delay instant routing
    this.candidateModels = this.candidateModels.filter(
      (m) => !GeminiProvider.globalUnavailableModels.has(m)
    );

    this.embeddingModel = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: 'text-embedding-004',
    });
  }

  public get modelName(): string {
    return this.candidateModels[this.activeModelIndex] || 'gemini-3.1-flash-lite';
  }

  public isAutoRouter(): boolean {
    return this.isAutoRouterMode;
  }

  public enableAutoRouter(): void {
    this.isAutoRouterMode = true;
    this.activeModelIndex = 0;
    if (this.onModelSwitchedCallback) {
      this.onModelSwitchedCallback(this.modelName, 'Enabled autonomous auto-router mode (cheapest-first)');
    }
  }

  public getCandidateModels(): string[] {
    return [...this.candidateModels];
  }

  public getActiveModelIndex(): number {
    return this.activeModelIndex;
  }

  public getActiveModelInfo(): GeminiModelInfo | undefined {
    return GEMINI_MODEL_CATALOG.find((m) => m.id === this.modelName);
  }

  public setOnModelSwitched(fn: (newModel: string, reason: string) => void): void {
    this.onModelSwitchedCallback = fn;
  }

  public switchModel(targetModel: string): boolean {
    this.isAutoRouterMode = false;
    const idx = this.candidateModels.indexOf(targetModel);
    if (idx !== -1) {
      this.activeModelIndex = idx;
      if (this.onModelSwitchedCallback) {
        this.onModelSwitchedCallback(targetModel, 'Manual user selection');
      }
      return true;
    }
    this.candidateModels.unshift(targetModel);
    this.activeModelIndex = 0;
    if (this.onModelSwitchedCallback) {
      this.onModelSwitchedCallback(targetModel, 'Manual user override');
    }
    return true;
  }

  private getChatModel(modelName: string): ChatGoogleGenerativeAI {
    let client = this.chatModelsCache.get(modelName);
    if (!client) {
      client = new ChatGoogleGenerativeAI({
        apiKey: this.apiKey,
        model: modelName,
        temperature: 0.3,
      });
      this.chatModelsCache.set(modelName, client);
    }
    return client;
  }

  /**
   * Automatically executes the operation with the cheapest model first.
   * If a model returns 404, 400, or 429 quota errors, it automatically falls forward
   * to the next tier and pins the successful model for future operations.
   */
  public async executeWithAutoRouter<T>(
    operation: (chatModel: ChatGoogleGenerativeAI, modelName: string) => Promise<T>
  ): Promise<T> {
    let lastError: unknown;

    while (this.activeModelIndex < this.candidateModels.length) {
      const currentModel = this.candidateModels[this.activeModelIndex];

      // Zero-delay instant skip if model is already known to have failed
      if (
        this.failedModels.has(currentModel) ||
        GeminiProvider.globalUnavailableModels.has(currentModel)
      ) {
        this.activeModelIndex++;
        continue;
      }

      const chatModel = this.getChatModel(currentModel);

      try {
        const result = await operation(chatModel, currentModel);
        return result;
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        this.failedModels.add(currentModel);

        const is404 =
          errMsg.includes('404') ||
          errMsg.toLowerCase().includes('not found') ||
          errMsg.toLowerCase().includes('is not supported');
        if (is404) {
          GeminiProvider.globalUnavailableModels.add(currentModel);
        }

        console.warn(
          `[GeminiAutoRouter] Model "${currentModel}" failed: ${errMsg.slice(0, 110)}.`
        );

        this.activeModelIndex++;
        // Fast-forward past any subsequent models that are already known failed
        while (
          this.activeModelIndex < this.candidateModels.length &&
          (this.failedModels.has(this.candidateModels[this.activeModelIndex]) ||
            GeminiProvider.globalUnavailableModels.has(this.candidateModels[this.activeModelIndex]))
        ) {
          this.activeModelIndex++;
        }

        if (this.activeModelIndex < this.candidateModels.length) {
          const nextModel = this.candidateModels[this.activeModelIndex];
          const reason = is404
            ? `Model ${currentModel} returned 404 (unavailable/deprecated)`
            : errMsg.includes('429')
            ? `Model ${currentModel} rate limit or quota reached`
            : `Model ${currentModel} error (${errMsg.slice(0, 50)})`;

          console.log(
            `[GeminiAutoRouter] Rapid auto-routing from "${currentModel}" to next tier: "${nextModel}"...`
          );

          if (this.onModelSwitchedCallback) {
            this.onModelSwitchedCallback(nextModel, reason);
          }
        } else {
          console.error(
            `[GeminiAutoRouter] All ${this.candidateModels.length} Gemini model tiers exhausted. Handing off to local fallback.`
          );
          break;
        }
      }
    }

    throw lastError || new Error('All Gemini model candidates exhausted');
  }

  public async generateText(prompt: string, options?: ModelRequestOptions): Promise<ModelResponse> {
    return this.executeWithAutoRouter(async (chatModel, modelName) => {
      const start = Date.now();
      const messages = [];
      if (options?.systemPrompt) {
        messages.push(new SystemMessage(options.systemPrompt));
      }

      if (options?.imageAttachments && options.imageAttachments.length > 0) {
        const parts: any[] = [{ type: 'text', text: prompt }];
        for (const img of options.imageAttachments) {
          parts.push({
            type: 'image_url',
            image_url: {
              url: `data:${img.mimeType};base64,${img.base64Data}`,
            },
          });
        }
        messages.push(new HumanMessage({ content: parts }));
      } else {
        messages.push(new HumanMessage(prompt));
      }

      const response = await chatModel.invoke(messages);
      const text = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      const latency = Date.now() - start;

      return {
        text,
        metrics: {
          provider: 'gemini',
          modelName,
          latencyMs: latency,
          tokenCount: {
            prompt: Math.ceil(prompt.length / 4),
            completion: Math.ceil(text.length / 4),
            total: Math.ceil((prompt.length + text.length) / 4),
          },
          success: true,
          timestamp: new Date().toISOString(),
        },
      };
    });
  }

  public async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: ModelRequestOptions
  ): Promise<StructuredModelResponse<T>> {
    const promptWithJson = `${prompt}\n\nIMPORTANT: Return ONLY valid, parseable JSON matching the requested structure without markdown fences or additional commentary.`;
    const res = await this.generateText(promptWithJson, options);

    let clean = res.text.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```/, '').replace(/```$/, '').trim();
    }

    try {
      const parsed = JSON.parse(clean);
      const safe = schema.safeParse(parsed);
      if (safe.success) {
        return {
          data: safe.data,
          rawText: res.text,
          metrics: res.metrics,
        };
      }
      return {
        data: parsed as T,
        rawText: res.text,
        metrics: res.metrics,
      };
    } catch {
      // Attempt to extract JSON object substring if model included banter
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const extracted = JSON.parse(match[0]);
          const safe = schema.safeParse(extracted);
          return {
            data: (safe.success ? safe.data : extracted) as T,
            rawText: res.text,
            metrics: res.metrics,
          };
        } catch {}
      }
      throw new Error(`Failed to parse structured JSON from model response: ${clean.slice(0, 80)}`);
    }
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    try {
      return await this.embeddingModel.embedQuery(text);
    } catch {
      // 768-dim vector fallback
      return FallbackProvider.createDeterministicEmbedding(text);
    }
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const ping = await this.generateText('ping', { maxTokens: 5, timeoutMs: 4000 });
      return ping.text.length > 0;
    } catch {
      return false;
    }
  }
}

export class FallbackProvider implements IModelProvider {
  public readonly id = 'mock-fallback';
  public readonly modelName = 'local-rule-engine';

  public async generateText(prompt: string, options?: ModelRequestOptions): Promise<ModelResponse> {
    const start = Date.now();
    let text = `[Fallback Response] Processed: "${prompt.slice(0, 100)}..."`;

    if (options?.systemPrompt?.includes('Atlas')) {
      text = `I have received the task. Collaborating with Research and Engineering to execute high-impact steps.`;
    } else if (options?.systemPrompt?.includes('Ada')) {
      text = `Analysis complete: Requirements verified, domain patterns synthesized, and dependencies mapped.`;
    } else if (options?.systemPrompt?.includes('Torvalds')) {
      text = `Engineering execution: Implemented modular TypeScript domain architecture with strict type safety and zero technical debt.`;
    } else if (options?.systemPrompt?.includes('Volt')) {
      text = `Automation pipeline active: Scheduled task execution queue, bound Socket.IO stream, and configured job workers.`;
    } else if (options?.systemPrompt?.includes('Iris')) {
      text = `QA Verdict: APPROVED. Zero hallucinations detected, strict schema compliance verified, edge cases covered.`;
    } else if (options?.systemPrompt?.includes('Mnemo')) {
      text = `Memory indexed: Key decisions persisted in pgvector and active session context synced with Redis cache.`;
    }

    return {
      text,
      metrics: {
        provider: 'mock-fallback',
        modelName: this.modelName,
        latencyMs: Date.now() - start,
        tokenCount: {
          prompt: Math.ceil(prompt.length / 4),
          completion: Math.ceil(text.length / 4),
          total: Math.ceil((prompt.length + text.length) / 4),
        },
        success: true,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: ModelRequestOptions
  ): Promise<StructuredModelResponse<T>> {
    const start = Date.now();

    // Default structured plan for office tasks
    const mockPlan = {
      summary: 'Automated multi-agent execution plan.',
      steps: [
        {
          stepIndex: 1,
          assignedTo: 'agent_research',
          objective: 'Investigate domain context and compile reference brief.',
          expectedOutput: 'Context summary and architectural requirements.',
        },
        {
          stepIndex: 2,
          assignedTo: 'agent_engineering',
          objective: 'Implement modular TypeScript logic adhering to system standards.',
          expectedOutput: 'Clean implementation modules.',
        },
        {
          stepIndex: 3,
          assignedTo: 'agent_qa',
          objective: 'Audit implementation, verify acceptance criteria, and ensure zero logic regression.',
          expectedOutput: 'QA approval verdict.',
        },
        {
          stepIndex: 4,
          assignedTo: 'agent_memory',
          objective: 'Store architectural decision record into pgvector episodic memory.',
          expectedOutput: 'Persisted vector memory ID.',
        },
      ],
    };

    return {
      data: mockPlan as unknown as T,
      rawText: JSON.stringify(mockPlan),
      metrics: {
        provider: 'mock-fallback',
        modelName: this.modelName,
        latencyMs: Date.now() - start,
        tokenCount: { prompt: 50, completion: 150, total: 200 },
        success: true,
        timestamp: new Date().toISOString(),
      },
    };
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    return FallbackProvider.createDeterministicEmbedding(text);
  }

  public static createDeterministicEmbedding(text: string, dim = 768): number[] {
    const vec = new Array(dim).fill(0);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      vec[i % dim] = (vec[i % dim] + (code / 255)) % 1;
    }
    // Normalize vector
    let norm = 0;
    for (let i = 0; i < dim; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) {
      vec[i] = Number((vec[i] / norm).toFixed(6));
    }
    return vec;
  }

  public async isHealthy(): Promise<boolean> {
    return true;
  }
}
