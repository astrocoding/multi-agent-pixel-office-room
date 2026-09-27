import type { ToolLearningRecord } from '@agent-office/shared';
import { dbPool } from '../db/connection.js';

export class ToolLearningStore {
  // In-memory cache for ultra-fast instant recall
  private static memoryCache: Map<string, ToolLearningRecord> = new Map();

  // Pre-seed known common error patterns & adaptive solutions
  static {
    this.seedDefaultLearnings();
  }

  private static seedDefaultLearnings(): void {
    const defaultLearnings: ToolLearningRecord[] = [
      {
        id: 'learn_npm_missing_pkg',
        commandPattern: 'npm (run|test|build)|pnpm (run|test|build)|bun run',
        errorPattern: 'MODULE_NOT_FOUND|Cannot find module|command not found',
        resolutionStrategy:
          'Check package.json dependencies. Run `pnpm install` or `pnpm add <module>` before retrying the command.',
        contextTags: ['npm', 'pnpm', 'node', 'dependencies'],
        successCount: 15,
        failureCount: 0,
      },
      {
        id: 'learn_php_artisan_env',
        commandPattern: 'php artisan migrate|php artisan serve',
        errorPattern: 'SQLSTATE|No database selected|Access denied|database does not exist',
        resolutionStrategy:
          'Ensure .env file exists with DB_CONNECTION, DB_HOST, DB_DATABASE, and run `php artisan config:clear`. If database is missing, create it or verify credentials.',
        contextTags: ['php', 'laravel', 'artisan', 'mysql', 'postgres'],
        successCount: 12,
        failureCount: 0,
      },
      {
        id: 'learn_git_detached_head',
        commandPattern: 'git commit|git push',
        errorPattern: 'HEAD detached|You are in detached HEAD state',
        resolutionStrategy:
          'Create or checkout a named branch using `git checkout -b <branch-name>` before committing.',
        contextTags: ['git', 'version-control'],
        successCount: 8,
        failureCount: 0,
      },
      {
        id: 'learn_vite_port_in_use',
        commandPattern: 'vite|npm run dev|pnpm dev',
        errorPattern: 'EADDRINUSE|address already in use',
        resolutionStrategy:
          'Target port is currently bound. Pass `--port <nextPort>` or inspect running processes.',
        contextTags: ['vite', 'ports', 'networking'],
        successCount: 10,
        failureCount: 0,
      },
      {
        id: 'learn_tsc_syntax_error',
        commandPattern: 'tsc|pnpm build',
        errorPattern: 'TS[0-9]+:|error TS',
        resolutionStrategy:
          'Inspect the specific file and line reported by TypeScript. Fix type mismatch, missing property, or import specifier.',
        contextTags: ['typescript', 'build', 'tsc'],
        successCount: 20,
        failureCount: 0,
      },
    ];

    for (const l of defaultLearnings) {
      this.memoryCache.set(l.id, l);
    }
  }

  /**
   * Records a new learning or updates success/failure counts.
   */
  public static async recordLearning(
    commandPattern: string,
    errorPattern: string,
    resolutionStrategy: string,
    contextTags: string[] = []
  ): Promise<ToolLearningRecord> {
    const id = `learn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: ToolLearningRecord = {
      id,
      commandPattern,
      errorPattern,
      resolutionStrategy,
      contextTags,
      successCount: 1,
      failureCount: 0,
    };

    this.memoryCache.set(id, record);

    // Save to PostgreSQL if available
    try {
      await dbPool.query(
        `
        INSERT INTO tool_learnings (id, command_pattern, error_pattern, resolution_strategy, success_count, failure_count, context_tags)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          resolution_strategy = EXCLUDED.resolution_strategy,
          success_count = tool_learnings.success_count + 1,
          updated_at = NOW();
      `,
        [
          record.id,
          record.commandPattern,
          record.errorPattern || '',
          record.resolutionStrategy,
          record.successCount,
          record.failureCount,
          JSON.stringify(record.contextTags),
        ]
      );
    } catch {}

    return record;
  }

  /**
   * Ultra-fast recall of relevant past solutions matching a command or error string.
   */
  public static findRelevantLearnings(query: string): ToolLearningRecord[] {
    const qLower = query.toLowerCase();
    const results: ToolLearningRecord[] = [];

    for (const item of this.memoryCache.values()) {
      let isMatch = false;

      // Check command regex or substring
      try {
        const cmdRe = new RegExp(item.commandPattern, 'i');
        if (cmdRe.test(query)) isMatch = true;
      } catch {
        if (item.commandPattern.toLowerCase().includes(qLower)) isMatch = true;
      }

      // Check error pattern
      if (item.errorPattern) {
        try {
          const errRe = new RegExp(item.errorPattern, 'i');
          if (errRe.test(query)) isMatch = true;
        } catch {
          if (item.errorPattern.toLowerCase().includes(qLower)) isMatch = true;
        }
      }

      // Check context tags
      if (item.contextTags.some((t) => qLower.includes(t.toLowerCase()))) {
        isMatch = true;
      }

      if (isMatch) {
        results.push(item);
      }
    }

    // Sort by success count
    return results.sort((a, b) => b.successCount - a.successCount).slice(0, 3);
  }
}

