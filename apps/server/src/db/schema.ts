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

      -- Phase 4 Scoped Memory Governance Columns
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS actor_id VARCHAR(64) DEFAULT 'boss';
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) DEFAULT 'default';
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS visibility VARCHAR(32) DEFAULT 'project';
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS verification_state VARCHAR(32) DEFAULT 'observed_fact';
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS confidence REAL DEFAULT 1.0;
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS source_provenance JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS retention_policy VARCHAR(32) DEFAULT 'permanent';
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS superseded_by VARCHAR(64);
      ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_agent_memories_task_id ON agent_memories(task_id);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_scope ON agent_memories(project_scope);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_created ON agent_memories(agent_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_actor ON agent_memories(actor_id);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_tenant ON agent_memories(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_visibility ON agent_memories(visibility);
      CREATE INDEX IF NOT EXISTS idx_agent_memories_active ON agent_memories(deleted_at, expires_at);
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

      -- 12. Task Terminal Tool Execution Logs (Real-time tracking of bash commands, file tools, and API executions)
      CREATE TABLE IF NOT EXISTS task_terminal_logs (
        id VARCHAR(64) PRIMARY KEY,
        task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tool_name VARCHAR(64) NOT NULL,
        command TEXT,
        parameters JSONB DEFAULT '{}'::jsonb,
        stdout TEXT,
        stderr TEXT,
        exit_code INT DEFAULT 0,
        execution_time_ms INT DEFAULT 0,
        executed_by VARCHAR(64) NOT NULL,
        success BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_terminal_logs_task ON task_terminal_logs(task_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS idx_terminal_logs_agent ON task_terminal_logs(executed_by);

      -- 13. Task Roadmaps & Multi-Agent Execution Flows
      CREATE TABLE IF NOT EXISTS task_roadmaps (
        id VARCHAR(64) PRIMARY KEY,
        task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        step_number INT NOT NULL,
        stage VARCHAR(64) NOT NULL,
        agent_id VARCHAR(64) NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        result_summary TEXT,
        tool_calls JSONB DEFAULT '[]'::jsonb,
        duration_ms INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_task_roadmaps_task ON task_roadmaps(task_id, step_number ASC);

      -- 14. Task Deliverables & QA Verification Audit History
      CREATE TABLE IF NOT EXISTS task_deliverables (
        id VARCHAR(64) PRIMARY KEY,
        task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        deliverable_type VARCHAR(64) DEFAULT 'final_solution',
        content TEXT NOT NULL,
        qa_verdict VARCHAR(64) DEFAULT 'APPROVED',
        qa_notes TEXT,
        qa_tests_run JSONB DEFAULT '[]'::jsonb,
        tested_by VARCHAR(64),
        solver_name VARCHAR(120) NOT NULL,
        handoff_chain JSONB DEFAULT '[]'::jsonb,
        evaluation_metrics JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_task_deliverables_task ON task_deliverables(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_deliverables_verdict ON task_deliverables(qa_verdict);
    `);

    // 15. Agent Learning Patterns & Behavior Cycle Memory (pgvector-backed)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_learning_patterns (
          id VARCHAR(64) PRIMARY KEY,
          pattern_type VARCHAR(64) NOT NULL,
          title TEXT NOT NULL,
          intent_category VARCHAR(120),
          context_summary TEXT NOT NULL,
          pattern_content TEXT NOT NULL,
          task_id VARCHAR(64),
          agent_id VARCHAR(64) NOT NULL,
          success_rate REAL DEFAULT 1.0,
          application_count INT DEFAULT 1,
          embedding vector(768),
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
    } catch {
      await client.query(`
        CREATE TABLE IF NOT EXISTS agent_learning_patterns (
          id VARCHAR(64) PRIMARY KEY,
          pattern_type VARCHAR(64) NOT NULL,
          title TEXT NOT NULL,
          intent_category VARCHAR(120),
          context_summary TEXT NOT NULL,
          pattern_content TEXT NOT NULL,
          task_id VARCHAR(64),
          agent_id VARCHAR(64) NOT NULL,
          success_rate REAL DEFAULT 1.0,
          application_count INT DEFAULT 1,
          embedding JSONB,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
    }

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_learning_patterns_type ON agent_learning_patterns(pattern_type);
      CREATE INDEX IF NOT EXISTS idx_learning_patterns_intent ON agent_learning_patterns(intent_category);
      CREATE INDEX IF NOT EXISTS idx_learning_patterns_task ON agent_learning_patterns(task_id);
    `);

    // 16. Skill Registry (Phase 1 RAG: Versioned, approved-only markdown skill catalog)
    await client.query(`
      CREATE TABLE IF NOT EXISTS skill_registry (
        id VARCHAR(64) PRIMARY KEY,
        slug VARCHAR(120) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
        entrypoint_path TEXT NOT NULL,
        "references" JSONB DEFAULT '[]'::jsonb,
        triggers JSONB DEFAULT '[]'::jsonb,
        roles JSONB DEFAULT '[]'::jsonb,
        languages JSONB DEFAULT '[]'::jsonb,
        source_trust VARCHAR(64) NOT NULL DEFAULT 'unreviewed_proposal',
        status VARCHAR(32) NOT NULL DEFAULT 'proposed',
        approved_by VARCHAR(64),
        content_hash VARCHAR(64) NOT NULL,
        active_version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_skill_registry_slug ON skill_registry(slug);
      CREATE INDEX IF NOT EXISTS idx_skill_registry_status ON skill_registry(status);
    `);

    // 17. Knowledge Sources (Phase 1 RAG: Canonical documents, skills, references, and specs)
    await client.query(`
      CREATE TABLE IF NOT EXISTS knowledge_sources (
        id VARCHAR(64) PRIMARY KEY,
        source_type VARCHAR(64) NOT NULL DEFAULT 'skill',
        canonical_path TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
        status VARCHAR(32) NOT NULL DEFAULT 'proposed',
        trust_level VARCHAR(64) NOT NULL DEFAULT 'unreviewed_proposal',
        project_id VARCHAR(120) DEFAULT 'default',
        owner_id VARCHAR(64) DEFAULT 'system',
        acl_policy JSONB DEFAULT '{"visibility": "internal"}'::jsonb,
        language VARCHAR(32) DEFAULT 'id',
        content_hash VARCHAR(64) NOT NULL,
        embedding_model_id VARCHAR(120),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_knowledge_sources_path ON knowledge_sources(canonical_path);
      CREATE INDEX IF NOT EXISTS idx_knowledge_sources_status ON knowledge_sources(status);
      CREATE INDEX IF NOT EXISTS idx_knowledge_sources_type ON knowledge_sources(source_type);
    `);

    // 18. Knowledge Chunks (Phase 1 RAG: Heading-aware Markdown chunks with hash & token count)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
          id VARCHAR(64) PRIMARY KEY,
          source_id VARCHAR(64) NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
          parent_section_id VARCHAR(64),
          heading_path TEXT NOT NULL,
          heading_level INT NOT NULL DEFAULT 1,
          start_line INT NOT NULL,
          end_line INT NOT NULL,
          content TEXT NOT NULL,
          token_count INT NOT NULL DEFAULT 0,
          chunk_hash VARCHAR(64) NOT NULL,
          embedding vector(768),
          search_vector tsvector,
          visibility VARCHAR(32) DEFAULT 'internal',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
    } catch {
      await client.query(`
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
          id VARCHAR(64) PRIMARY KEY,
          source_id VARCHAR(64) NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
          parent_section_id VARCHAR(64),
          heading_path TEXT NOT NULL,
          heading_level INT NOT NULL DEFAULT 1,
          start_line INT NOT NULL,
          end_line INT NOT NULL,
          content TEXT NOT NULL,
          token_count INT NOT NULL DEFAULT 0,
          chunk_hash VARCHAR(64) NOT NULL,
          embedding JSONB,
          search_vector tsvector,
          visibility VARCHAR(32) DEFAULT 'internal',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
    }

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source ON knowledge_chunks(source_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_hash ON knowledge_chunks(chunk_hash);
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_parent ON knowledge_chunks(parent_section_id);
    `);

    // 14. Phase 4 Feedback & Governed Improvement Proposals
    await client.query(`
      CREATE TABLE IF NOT EXISTS governance_feedbacks (
        id VARCHAR(64) PRIMARY KEY,
        idempotency_key VARCHAR(128) UNIQUE NOT NULL,
        task_id VARCHAR(64),
        actor_id VARCHAR(64) NOT NULL,
        project_scope VARCHAR(120) DEFAULT 'default',
        feedback_type VARCHAR(32) NOT NULL,
        target_type VARCHAR(32) NOT NULL,
        target_identifier TEXT NOT NULL,
        rating INT DEFAULT 0,
        details TEXT NOT NULL,
        evidence JSONB DEFAULT '{}'::jsonb,
        processed BOOLEAN DEFAULT false,
        proposal_id VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_gov_feedbacks_task ON governance_feedbacks(task_id);
      CREATE INDEX IF NOT EXISTS idx_gov_feedbacks_target ON governance_feedbacks(target_type, target_identifier);
      CREATE INDEX IF NOT EXISTS idx_gov_feedbacks_actor ON governance_feedbacks(actor_id);

      CREATE TABLE IF NOT EXISTS governance_proposals (
        id VARCHAR(64) PRIMARY KEY,
        target_skill_id VARCHAR(120) NOT NULL,
        proposal_type VARCHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        justification TEXT NOT NULL,
        linked_feedback_ids JSONB DEFAULT '[]'::jsonb,
        before_diff TEXT NOT NULL,
        after_diff TEXT NOT NULL,
        evaluation_score REAL DEFAULT 0.0,
        evaluation_metrics JSONB DEFAULT '{}'::jsonb,
        security_audit_status VARCHAR(32) DEFAULT 'pending',
        security_notes TEXT,
        status VARCHAR(32) DEFAULT 'pending_review',
        proposed_by VARCHAR(64) NOT NULL,
        reviewed_by VARCHAR(64),
        decision_reason TEXT,
        published_version VARCHAR(32),
        rollback_payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        published_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_gov_proposals_status ON governance_proposals(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_gov_proposals_target ON governance_proposals(target_skill_id);
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

