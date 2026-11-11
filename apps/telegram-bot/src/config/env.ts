import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TELEGRAM_MODE: z.enum(['auto', 'polling', 'webhook']).default('auto'),
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_WEBHOOK_SECRET: z.string().default('agent-office-webhook-secret-token'),
  TELEGRAM_WEBHOOK_PUBLIC_URL: z.string().optional().default(''),
  TELEGRAM_BOT_PORT: z.coerce.number().default(3002),
  TELEGRAM_OWNER_USER_IDS: z.string().default(''),
  TELEGRAM_ALLOWED_USER_IDS: z.string().default(''),
  TELEGRAM_GROUP_ID: z.string().optional().default(''),
  TELEGRAM_NOTIFICATIONS_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
  AGENT_OFFICE_INTERNAL_API_URL: z.string().default('http://localhost:3001'),
  AGENT_OFFICE_SERVICE_TOKEN: z.string().default('agent-office-internal-sec-token'),
  DATABASE_URL: z.string().optional().default('postgresql://postgres:admin123@localhost:5432/agent_office'),
});

const rawToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || 'dummy_test_token';
const rawOwnerIds = process.env.TELEGRAM_OWNER_USER_IDS || process.env.BOSS_ID || '';
const rawGroupId = process.env.TELEGRAM_GROUP_ID || process.env.GROUP_ID || '';

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV || 'development',
  TELEGRAM_MODE: (process.env.TELEGRAM_MODE as 'auto' | 'polling' | 'webhook') || 'auto',
  TELEGRAM_BOT_TOKEN: rawToken,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || 'agent-office-webhook-secret-token',
  TELEGRAM_WEBHOOK_PUBLIC_URL: process.env.TELEGRAM_WEBHOOK_PUBLIC_URL || '',
  TELEGRAM_BOT_PORT: process.env.TELEGRAM_BOT_PORT || 3002,
  TELEGRAM_OWNER_USER_IDS: rawOwnerIds,
  TELEGRAM_ALLOWED_USER_IDS: process.env.TELEGRAM_ALLOWED_USER_IDS || '',
  TELEGRAM_GROUP_ID: rawGroupId,
  TELEGRAM_NOTIFICATIONS_ENABLED: process.env.TELEGRAM_NOTIFICATIONS_ENABLED || 'true',
  AGENT_OFFICE_INTERNAL_API_URL: process.env.AGENT_OFFICE_INTERNAL_API_URL || 'http://localhost:3001',
  AGENT_OFFICE_SERVICE_TOKEN: process.env.AGENT_OFFICE_SERVICE_TOKEN || 'agent-office-internal-sec-token',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:admin123@localhost:5432/agent_office',
});

export function parseGroupIds(): number[] {
  if (!env.TELEGRAM_GROUP_ID) return [];
  return env.TELEGRAM_GROUP_ID.split(/[,;\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}

export function parseOwnerUserIds(): number[] {
  if (!env.TELEGRAM_OWNER_USER_IDS) return [];
  return env.TELEGRAM_OWNER_USER_IDS.split(/[,;\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

export function parseAllowedUserIds(): number[] {
  const owners = parseOwnerUserIds();
  if (!env.TELEGRAM_ALLOWED_USER_IDS) return owners;
  const allowed = env.TELEGRAM_ALLOWED_USER_IDS.split(/[,;\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
  return Array.from(new Set([...owners, ...allowed]));
}
