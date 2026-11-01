import type {
  IModelProvider,
  ModelRequestOptions,
  ModelResponse,
  StructuredModelResponse,
} from '../adapters/modelProvider.js';
import { FallbackProvider, GeminiProvider } from '../adapters/modelProvider.js';
import type { ModelRouteMetrics } from '@agent-office/shared';
import { z } from 'zod';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  coolDownDurationMs: number;
}

export interface RouterMetrics {
  primaryCalls: number;
  fallbackCalls: number;
  failures: number;
  lastFailureReason?: string;
  circuitState: CircuitBreakerState;
  activeModelName?: string;
  costTier?: string;
  isAutoRouter?: boolean;
}

export type OperationCompletionListener = (
  metrics: ModelRouteMetrics,
  context?: {
    operationType?: string;
    taskId?: string;
    sessionId?: string;
    agentId?: string;
  }
) => void;

export class ModelRouter {
  private primaryProvider: IModelProvider;
  private fallbackProvider: IModelProvider;
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;
  private onOperationCompleted?: OperationCompletionListener;
  private metrics: RouterMetrics = {
    primaryCalls: 0,
    fallbackCalls: 0,
    failures: 0,
    circuitState: 'CLOSED',
  };

  constructor(
    primaryProvider: IModelProvider,
    fallbackProvider: IModelProvider = new FallbackProvider(),
    config: CircuitBreakerConfig = { failureThreshold: 3, coolDownDurationMs: 30000 }
  ) {
    this.primaryProvider = primaryProvider;
    this.fallbackProvider = fallbackProvider;
    this.config = config;
  }

  public setOnOperationCompleted(fn: OperationCompletionListener): void {
    this.onOperationCompleted = fn;
  }

  private triggerOperationLogged(
    metrics: ModelRouteMetrics,
    options?: ModelRequestOptions
  ): void {
    if (this.onOperationCompleted) {
      try {
        this.onOperationCompleted(metrics, {
          operationType: options?.operationType || 'general_inference',
          taskId: options?.taskId,
          sessionId: options?.sessionId,
          agentId: options?.agentId,
        });
      } catch (err) {
        console.warn('[ModelRouter] Error triggering operation log:', err);
      }
    }
  }

  public getPrimaryProvider(): IModelProvider {
    return this.primaryProvider;
  }

  public getFallbackProvider(): IModelProvider {
    return this.fallbackProvider;
  }

  public isAutoRouter(): boolean {
    if (this.primaryProvider instanceof GeminiProvider) {
      return this.primaryProvider.isAutoRouter();
    }
    return true;
  }

  public getMetrics(): RouterMetrics {
    let activeModelName = this.primaryProvider.modelName;
    let costTier: string | undefined = 'unknown';
    let isAutoRouter = true;

    if (this.state === 'OPEN') {
      activeModelName = this.fallbackProvider.modelName;
      costTier = 'offline_fallback';
      isAutoRouter = false;
    } else if (this.primaryProvider instanceof GeminiProvider) {
      activeModelName = this.primaryProvider.modelName;
      costTier = this.primaryProvider.getActiveModelInfo()?.costTier || 'standard';
      isAutoRouter = this.primaryProvider.isAutoRouter();
    }

    return {
      ...this.metrics,
      circuitState: this.state,
      activeModelName,
      costTier,
      isAutoRouter,
    };
  }

  public getActiveModelName(): string {
    return this.getMetrics().activeModelName || 'unknown';
  }

  private checkCircuitState(): void {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.config.coolDownDurationMs) {
        this.state = 'HALF_OPEN';
        console.log('[ModelRouter] Circuit Breaker entering HALF_OPEN probe state');
      }
    }
  }

  public async executeWithFallback(
    operation: (provider: IModelProvider) => Promise<ModelResponse>,
    options?: ModelRequestOptions
  ): Promise<ModelResponse> {
    this.checkCircuitState();

    if (this.state === 'OPEN') {
      this.metrics.fallbackCalls++;
      const res = await operation(this.fallbackProvider);
      this.triggerOperationLogged(res.metrics, options);
      return res;
    }

    try {
      this.metrics.primaryCalls++;
      const result = await Promise.race([
        operation(this.primaryProvider),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Model execution timeout')), options?.timeoutMs || 25000)
        ),
      ]);

      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      this.triggerOperationLogged(result.metrics, options);
      return result;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.failureCount++;
      this.lastFailureTime = Date.now();
      this.metrics.failures++;
      this.metrics.lastFailureReason = errorMsg;

      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'OPEN';
        console.warn(`[ModelRouter] Circuit Breaker tripped to OPEN. Using offline fallback.`);
      }

      console.warn(`[ModelRouter] Primary provider failed (${errorMsg}). Routing to fallback.`);
      this.metrics.fallbackCalls++;
      const res = await operation(this.fallbackProvider);
      this.triggerOperationLogged(res.metrics, options);
      return res;
    }
  }

  public async generateText(prompt: string, options?: ModelRequestOptions): Promise<ModelResponse> {
    return this.executeWithFallback((p) => p.generateText(prompt, options), options);
  }

  public async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: ModelRequestOptions
  ): Promise<StructuredModelResponse<T>> {
    this.checkCircuitState();

    if (this.state === 'OPEN') {
      this.metrics.fallbackCalls++;
      const res = await this.fallbackProvider.generateStructured(prompt, schema, options);
      this.triggerOperationLogged(res.metrics, options);
      return res;
    }

    try {
      this.metrics.primaryCalls++;
      const result = await this.primaryProvider.generateStructured(prompt, schema, options);
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }
      this.triggerOperationLogged(result.metrics, options);
      return result;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.failureCount++;
      this.lastFailureTime = Date.now();
      this.metrics.failures++;
      this.metrics.lastFailureReason = errorMsg;

      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'OPEN';
        console.warn(`[ModelRouter] Circuit Breaker tripped to OPEN. Using offline fallback.`);
      }

      console.warn(`[ModelRouter] Primary structured generation failed (${errorMsg}). Using fallback.`);
      this.metrics.fallbackCalls++;
      const res = await this.fallbackProvider.generateStructured(prompt, schema, options);
      this.triggerOperationLogged(res.metrics, options);
      return res;
    }
  }

  public async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (this.state !== 'OPEN') {
        return await this.primaryProvider.generateEmbedding(text);
      }
    } catch {
      // ignore and use fallback
    }
    return await this.fallbackProvider.generateEmbedding(text);
  }
}
