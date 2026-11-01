import { dbPool } from './connection.js';
import { AGENT_CONFIGS, AGENT_IDS, type AgentId } from '@agent-office/shared';

export async function initDatabase(): Promise<void> {
  const client = await dbPool.connect();
  try {
    // 1. Enable pgvector extension if available
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    } catch (e: unknown) {
      console.warn('[DB Init] pgvector extension could not be enabled, continuing with fallback:', (e as Error).message);
    }

    // 2. Tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(64) PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        assigned_agent_id VARCHAR(64),
        project_name VARCHAR(120) DEFAULT 'default',
        intent VARCHAR(120),
        qa_verdict VARCHAR(64),
        qa_notes TEXT,
        handoff_chain JSONB DEFAULT '[]'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        context_snapshot JSONB DEFAULT '{}'::jsonb,
        input_payload JSONB DEFAULT '{}'::jsonb,
        output_payload JSONB,
        plan JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Migration: ensure all columns exist if table was already created
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_name VARCHAR(120) DEFAULT 'default';
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS intent VARCHAR(120);
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS qa_verdict VARCHAR(64);
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS qa_notes TEXT;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS handoff_chain JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS decision JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS context_snapshot JSONB DEFAULT '{}'::jsonb;

      CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_project_name ON tasks(project_name);
    `);

    // 3. Task Activities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_activities (
        id VARCHAR(64) PRIMARY KEY,
        task_id VARCHAR(64) REFERENCES tasks(id) ON DELETE CASCADE,
        agent_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 4. Agent Memories table with pgvector
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_memories (
          id VARCHAR(64) PRIMARY KEY,
          agent_id VARCHAR(64) NOT NULL,
          memory_type VARCHAR(32) NOT NULL,
          content TEXT NOT NULL,
          summary TEXT,
          embedding vector(768),
          metadata JSONB DEFAULT '{}'::jsonb,
          importance INT DEFAULT 5,
          project_scope VARCHAR(120) DEFAULT 'default',
          intent_category VARCHAR(120),
          task_id VARCHAR(64),
          access_count INT DEFAULT 0,
          last_recalled_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
    } catch {
      // If vector column fails for any reason, fallback to JSONB/float array
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_memories (
          id VARCHAR(64) PRIMARY KEY,
          agent_id VARCHAR(64) NOT NULL,
          memory_type VARCHAR(32) NOT NULL,
          content TEXT NOT NULL,
          summary TEXT,
          embedding JSONB,
          metadata JSONB DEFAULT '{}'::jsonb,
          importance INT DEFAULT 5,
          project_scope VARCHAR(120) DEFAULT 'default',
          intent_category VARCHAR(120),
          task_id VARCHAR(64),
          access_count INT DEFAULT 0,
          last_recalled_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
    }

    // Migration for agent_memories to ensure new columns and indexes exist
    await client.query(`
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS project_scope VARCHAR(120) DEFAULT 'default';
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS intent_category VARCHAR(120);
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS task_id VARCHAR(64);
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS access_count INT DEFAULT 0;
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS last_recalled_at TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_agent_memories_task_id ON agent_memories(task_id);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_scope ON agent_memories(project_scope);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_created ON agent_memories(agent_id, created_at DESC);
    `);

    // 5. Agent Runtime States table
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_states (
        agent_id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        role VARCHAR(120) NOT NULL,
        state VARCHAR(32) NOT NULL DEFAULT 'idle',
        current_task_id VARCHAR(64),
        current_thought TEXT,
        position_x REAL NOT NULL,
        position_y REAL NOT NULL,
        desk_x REAL NOT NULL,
        desk_y REAL NOT NULL,
        last_active_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 6. Tool Learnings & Error Patterns table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tool_learnings (
        id VARCHAR(64) PRIMARY KEY,
        command_pattern TEXT NOT NULL,
        error_pattern TEXT,
        resolution_strategy TEXT NOT NULL,
        success_count INT DEFAULT 1,
        failure_count INT DEFAULT 0,
        context_tags JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 7. Workspace Artifacts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workspace_artifacts (
        id VARCHAR(64) PRIMARY KEY,
        task_id VARCHAR(64) REFERENCES tasks(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        file_type VARCHAR(32) NOT NULL,
        file_size INT NOT NULL,
        created_by VARCHAR(64) NOT NULL,
        summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 8. Real-time AI Workspace Chat Sessions & Message History
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
        project_scope VARCHAR(120) DEFAULT 'default',
        primary_intent VARCHAR(120),
        summary TEXT,
        context_snapshot JSONB DEFAULT '{}'::jsonb,
        target_agent_id VARCHAR(64) DEFAULT 'agent_leader',
        model_used VARCHAR(64),
        message_count INT DEFAULT 0,
        is_pinned BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_sessions_project ON chat_sessions(project_scope);

      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(64) PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        sender VARCHAR(64) NOT NULL,
        sender_name VARCHAR(120) NOT NULL,
        text TEXT NOT NULL,
        type VARCHAR(32) DEFAULT 'dialogue',
        intent VARCHAR(120),
        mentioned_agents JSONB DEFAULT '[]'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        attachments JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at ASC);

      -- 9. AI Model Operations & Tradeoff Evaluation History
      CREATE TABLE IF NOT EXISTS model_operations (
        id VARCHAR(64) PRIMARY KEY,
        model_name VARCHAR(120) NOT NULL,
        model_tier INT DEFAULT 1,
        cost_tier VARCHAR(32) DEFAULT 'cheapest',
        operation_type VARCHAR(64) NOT NULL,
        source VARCHAR(32) DEFAULT 'auto_router',
        agent_id VARCHAR(64),
        task_id VARCHAR(64),
        session_id VARCHAR(64),
        prompt_tokens INT DEFAULT 0,
        completion_tokens INT DEFAULT 0,
        total_tokens INT DEFAULT 0,
        latency_ms INT DEFAULT 0,
        cost_estimate REAL DEFAULT 0,
        success BOOLEAN DEFAULT true,
        error_message TEXT,
        tradeoff_metrics JSONB DEFAULT '{}'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_model_ops_model ON model_operations(model_name, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_model_ops_type ON model_operations(operation_type);
      CREATE INDEX IF NOT EXISTS idx_model_ops_task ON model_operations(task_id);
      CREATE INDEX IF NOT EXISTS idx_model_ops_created ON model_operations(created_at DESC);

      -- 10. Task Approvals Workflow
      CREATE TABLE IF NOT EXISTS task_approvals (
        id VARCHAR(64) PRIMARY KEY,
        task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        action_type VARCHAR(64) NOT NULL,
        action_description TEXT NOT NULL,
        risk_level VARCHAR(32) NOT NULL DEFAULT 'medium',
        reason TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        requested_by VARCHAR(64) NOT NULL,
        approved_by VARCHAR(64),
        decision_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_task_approvals_status ON task_approvals(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_task_approvals_task ON task_approvals(task_id);

      -- 11. Telegram Integration Tables
      CREATE TABLE IF NOT EXISTS telegram_identities (
        id VARCHAR(64) PRIMARY KEY,
        telegram_user_id BIGINT UNIQUE NOT NULL,
        telegram_username VARCHAR(120),
        role VARCHAR(32) NOT NULL DEFAULT 'user',
        mapped_actor_id VARCHAR(64) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_telegram_user_id ON telegram_identities(telegram_user_id);

      CREATE TABLE IF NOT EXISTS telegram_processed_updates (
        id VARCHAR(128) PRIMARY KEY,
        update_id BIGINT NOT NULL,
        chat_id BIGINT,
        user_id BIGINT,
        command VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'received',
        response_summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_telegram_updates_status ON telegram_processed_updates(status);

      CREATE TABLE IF NOT EXISTS telegram_sessions (
        id VARCHAR(64) PRIMARY KEY,
        chat_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        active_command VARCHAR(64),
        session_state VARCHAR(64) NOT NULL DEFAULT 'idle',
        data JSONB DEFAULT '{}'::jsonb,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_telegram_sessions_expires ON telegram_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS telegram_notification_preferences (
        chat_id BIGINT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        enabled BOOLEAN DEFAULT true,
        notify_task_completed BOOLEAN DEFAULT true,
        notify_task_failed BOOLEAN DEFAULT true,
        notify_approval_required BOOLEAN DEFAULT true,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Seed default chat session if table is empty
    const sessionCountRes = await client.query('SELECT COUNT(*) FROM chat_sessions;');
    if (parseInt(sessionCountRes.rows[0].count, 10) === 0) {
      const defaultSessionId = 'session_default';
      await client.query(
        `
        INSERT INTO chat_sessions (id, title, project_scope, target_agent_id, message_count)
        VALUES ($1, 'General Office Workspace', 'default', 'agent_leader', 1)
        ON CONFLICT (id) DO NOTHING;
      `,
        [defaultSessionId]
      );

      await client.query(
        `
        INSERT INTO chat_messages (id, session_id, sender, sender_name, text, type)
        VALUES ($1, $2, 'agent_leader', 'Zen (Leader)', 'Selamat pagi, Bos! Tim siap siaga di workstation masing-masing. Silakan panggil kami di chat (@Zen, @Iky, @Dre, @Gus, @Rai, @Dhea) atau tekan [E] untuk berdiskusi langsung.', 'announcement')
        ON CONFLICT (id) DO NOTHING;
      `,
        [`msg_${Date.now()}`, defaultSessionId]
      );
    }

    // Seed agent states if not existing
    for (const id of Object.keys(AGENT_CONFIGS) as AgentId[]) {
      const cfg = AGENT_CONFIGS[id];
      await client.query(
        `
        INSERT INTO agent_states (agent_id, name, role, state, position_x, position_y, desk_x, desk_y)
        VALUES ($1, $2, $3, 'idle', $4, $5, $4, $5)
        ON CONFLICT (agent_id) DO UPDATE SET
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          position_x = EXCLUDED.desk_x,
          position_y = EXCLUDED.desk_y,
          desk_x = EXCLUDED.desk_x,
          desk_y = EXCLUDED.desk_y;
      `,
        [cfg.id, cfg.name, cfg.role, cfg.deskX, cfg.deskY]
      );
    }

    console.log('[Database] Initialized successfully with all tables and agent states.');
  } finally {
    client.release();
  }
}

