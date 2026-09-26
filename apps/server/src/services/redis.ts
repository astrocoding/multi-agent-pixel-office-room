import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export interface ICacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<unknown>;
  del(key: string): Promise<number>;
}

class MemoryCacheFallback implements ICacheStore {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  public async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  public async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'> {
    let expiresAt: number | undefined;
    if (mode === 'EX' && duration) {
      expiresAt = Date.now() + duration * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  public async del(key: string): Promise<number> {
    const deleted = this.store.delete(key);
    return deleted ? 1 : 0;
  }
}

let redisClient: ICacheStore;
let isRedisConnected = false;

try {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy(times: number) {
      if (times > 3) {
        return null;
      }
      return Math.min(times * 100, 1000);
    },
  });

  client.on('connect', () => {
    isRedisConnected = true;
    console.log('[Redis] Connected to Redis successfully.');
  });

  client.on('error', (err: Error) => {
    console.warn('[Redis] Connection warning (using in-memory cache fallback):', err.message);
  });

  redisClient = client as unknown as ICacheStore;
} catch {
  console.warn('[Redis] Unable to instantiate client. Falling back to in-memory store.');
  redisClient = new MemoryCacheFallback();
}

export { redisClient, isRedisConnected };
