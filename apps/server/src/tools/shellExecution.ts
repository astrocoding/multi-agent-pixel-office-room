import { exec } from 'child_process';
import path from 'path';
import os from 'os';
import fsSync from 'fs';
import { WorkspaceFsTools } from './workspaceFs.js';

export interface ShellExecResult {
  command: string;
  cwd: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  errorSnippet?: string;
}

export class ShellExecutionTool {
  // Blacklist of destructive commands that should never be run automatically
  private static DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\/($|\s+|\*)/i,
    /mkfs(\.[a-z0-9]+)?\s+/i,
    /dd\s+if=\/dev\/zero/i,
    /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // Fork bomb
    />\s*\/dev\/sd[a-z]/i,
    /chmod\s+-R\s+777\s+\//i,
    /shutdown(\s+.*)?$/i,
    /reboot(\s+.*)?$/i,
  ];

  public static isSafeCommand(cmd: string): { safe: boolean; reason?: string } {
    const trimmed = cmd.trim();
    if (!trimmed) {
      return { safe: false, reason: 'Command string cannot be empty.' };
    }

    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          safe: false,
          reason: `Security violation: Command matched prohibited destructive pattern (${pattern})`,
        };
      }
    }

    return { safe: true };
  }

  /**
   * Expands tilde (~) in commands so that quoted or unquoted paths like ~/Projects
   * are converted to absolute paths (/Users/<username>/Projects) preventing shell quoting failures.
   */
  public static expandTilde(cmd: string): string {
    const home = os.homedir();
    return cmd.replace(/(?<=^|[\s"'])~(?=[\/\\"']|$)/g, home);
  }

  /**
   * Executes a Unix/Bash shell command inside the workspace directory.
   * Supports: npm, pnpm, bun, node, php artisan, composer, git, grep, cat, mkdir, cd, ls, etc.
   */
  public static async executeBash(
    command: string,
    relativeCwd = '',
    timeoutMs = 45_000
  ): Promise<ShellExecResult> {
    const start = Date.now();
    const safety = this.isSafeCommand(command);
    if (!safety.safe) {
      return {
        command,
        cwd: relativeCwd,
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: safety.reason || 'Command rejected by security guardrail.',
        durationMs: 0,
        errorSnippet: safety.reason,
      };
    }

    const homeDir = os.homedir();
    const expandedCommand = this.expandTilde(command);
    const effectiveCwd = WorkspaceFsTools.resolveSafePath(relativeCwd);

    // Ensure working directory physically exists before running command
    try {
      if (!fsSync.existsSync(effectiveCwd)) {
        fsSync.mkdirSync(effectiveCwd, { recursive: true });
      }
    } catch {}

    const shellBin = process.platform === 'win32' ? undefined : process.env.SHELL || '/bin/zsh';

    const enhancedPath = [
      process.env.PATH || '',
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
      path.join(homeDir, '.bun/bin'),
      path.join(homeDir, '.cargo/bin'),
    ].filter(Boolean).join(':');

    return new Promise<ShellExecResult>((resolve) => {
      exec(
        expandedCommand,
        {
          cwd: effectiveCwd,
          shell: shellBin,
          timeout: timeoutMs,
          maxBuffer: 4 * 1024 * 1024, // 4MB buffer for build/compile logs
          env: {
            ...process.env,
            HOME: homeDir,
            PATH: enhancedPath,
            NODE_ENV: process.env.NODE_ENV || 'development',
            FORCE_COLOR: '0', // Clean plain text logs
            DATABASE_URL:
              process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/fastify_students_test',
            PGHOST: process.env.PGHOST || 'localhost',
            PGPORT: process.env.PGPORT || '5432',
            PGUSER: process.env.PGUSER || 'postgres',
            PGPASSWORD: process.env.PGPASSWORD || 'postgres',
            PGDATABASE: process.env.PGDATABASE || 'fastify_students_test',
          },
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - start;
          const exitCode = error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0;
          const isTimeout = error?.killed && error?.signal === 'SIGTERM';

          let outStr = stdout ? stdout.trim() : '';
          let errStr = stderr ? stderr.trim() : '';

          if (isTimeout) {
            errStr += `\n[Command timed out after ${timeoutMs}ms]`;
          }

          const success = !error && exitCode === 0;
          let errorSnippet: string | undefined;

          if (!success) {
            const rawErr = errStr || outStr || error?.message || 'Command returned non-zero exit code';
            const lines = rawErr.split('\n');
            errorSnippet = lines.slice(-8).join('\n').trim();
          }

          resolve({
            command,
            cwd: effectiveCwd,
            success,
            exitCode,
            stdout: outStr,
            stderr: errStr,
            durationMs,
            errorSnippet,
          });
        }
      );
    });
  }

  // Pre-baked helper: Run Git operations
  public static async executeGit(gitArgs: string, relativeCwd = ''): Promise<ShellExecResult> {
    return this.executeBash(`git ${gitArgs}`, relativeCwd);
  }

  // Pre-baked helper: Run Package Manager commands (npm, pnpm, bun)
  public static async executePackageManager(
    pm: 'npm' | 'pnpm' | 'bun',
    command: string,
    relativeCwd = '',
    timeoutMs = 90_000
  ): Promise<ShellExecResult> {
    return this.executeBash(`${pm} ${command}`, relativeCwd, timeoutMs);
  }

  // Pre-baked helper: Run PHP Artisan / Composer commands
  public static async executeArtisan(
    artisanCommand: string,
    relativeCwd = '',
    timeoutMs = 60_000
  ): Promise<ShellExecResult> {
    return this.executeBash(`php artisan ${artisanCommand}`, relativeCwd, timeoutMs);
  }
}

