import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:admin123@localhost:5432/agent_office';

export const dbPool = new pg.Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
});

dbPool.on('error', (err) => {
  console.error('[Database Pool Error]:', err.message);
});

