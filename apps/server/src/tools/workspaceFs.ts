import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';

export interface FileItemInfo {
  name: string;
  relativePath: string;
  isDirectory: boolean;
  sizeBytes: number;
  updatedAt: string;
}

export interface FsToolResult {
  success: boolean;
  output: string;
  data?: unknown;
  error?: string;
}

export class WorkspaceFsTools {
  private static workspaceRoot: string = path.resolve(process.cwd(), 'workspace');
  private static defaultBaseDir: string | null = null;

  public static setDefaultBaseDir(baseDir: string | null): void {
    this.defaultBaseDir = baseDir;
  }

  public static getDefaultBaseDir(): string | null {
    return this.defaultBaseDir;
  }

  public static setWorkspaceRoot(customPath: string): void {
    this.workspaceRoot = path.resolve(customPath);
    if (!fsSync.existsSync(this.workspaceRoot)) {
      fsSync.mkdirSync(this.workspaceRoot, { recursive: true });
    }
  }

  public static getWorkspaceRoot(): string {
    if (!fsSync.existsSync(this.workspaceRoot)) {
      fsSync.mkdirSync(this.workspaceRoot, { recursive: true });
    }
    return this.workspaceRoot;
  }

  // Path resolution supporting defaultBaseDir, workspace root, home (~), and absolute user paths
  public static resolveSafePath(targetRelPath: string, customBaseDir?: string): string {
    const trimmed = (targetRelPath || '').trim();
    const effectiveBase = customBaseDir || this.defaultBaseDir;

    if (!trimmed) {
      if (effectiveBase) {
        return this.resolveSafePath(effectiveBase);
      }
      return this.getWorkspaceRoot();
    }
    // Expand ~ to user home directory (e.g. ~/Projects -> /Users/zaenalalfian/Projects)
    if (trimmed.startsWith('~')) {
      const home = os.homedir();
      const sub = trimmed.replace(/^~[/\\]?/, '');
      return path.resolve(home, sub);
    }
    if (path.isAbsolute(trimmed)) {
      return path.resolve(trimmed);
    }
    if (effectiveBase) {
      const resolvedBase = this.resolveSafePath(effectiveBase);
      return path.resolve(resolvedBase, trimmed);
    }
    const root = this.getWorkspaceRoot();
    return path.resolve(root, trimmed);
  }

  // 1. Read file
  public static async readFile(filePath: string, maxBytes = 250_000, customBaseDir?: string): Promise<FsToolResult> {
    try {
      const fullPath = this.resolveSafePath(filePath, customBaseDir);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        return { success: false, output: `Path "${filePath}" is a directory, not a file.` };
      }
      if (stat.size > maxBytes) {
        const handle = await fs.open(fullPath, 'r');
        const buffer = Buffer.alloc(maxBytes);
        await handle.read(buffer, 0, maxBytes, 0);
        await handle.close();
        return {
          success: true,
          output: buffer.toString('utf-8') + `\n\n[Truncated: file size ${stat.size} exceeds ${maxBytes} bytes limit]`,
          data: { size: stat.size, truncated: true },
        };
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      return { success: true, output: content, data: { size: stat.size, truncated: false } };
    } catch (err: unknown) {
      return { success: false, output: `Failed to read file "${filePath}": ${(err as Error).message}` };
    }
  }

  // 2. Write or create file
  public static async writeFile(filePath: string, content: string, customBaseDir?: string): Promise<FsToolResult> {
    try {
      const fullPath = this.resolveSafePath(filePath, customBaseDir);
      const parentDir = path.dirname(fullPath);
      await fs.mkdir(parentDir, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
      const lines = content.split('\n').length;
      return {
        success: true,
        output: `File "${filePath}" successfully written (${content.length} bytes, ${lines} lines).`,
        data: { path: filePath, bytes: content.length, lines },
      };
    } catch (err: unknown) {
      return { success: false, output: `Failed to write file "${filePath}": ${(err as Error).message}` };
    }
  }

  // 3. Precision surgical edit
  public static async editFile(filePath: string, target: string, replacement: string, customBaseDir?: string): Promise<FsToolResult> {
    try {
      const fullPath = this.resolveSafePath(filePath, customBaseDir);
      const content = await fs.readFile(fullPath, 'utf-8');
      if (!content.includes(target)) {
        return {
          success: false,
          output: `Edit target string not found in "${filePath}". Ensure exact character-for-character matching.`,
        };
      }

      const updated = content.replaceAll(target, replacement);
      await fs.writeFile(fullPath, updated, 'utf-8');
      return {
        success: true,
        output: `Successfully edited "${filePath}". Replacement applied cleanly.`,
        data: { path: filePath },
      };
    } catch (err: unknown) {
      return { success: false, output: `Failed to edit "${filePath}": ${(err as Error).message}` };
    }
  }

  // 4. List directory contents
  public static async listDirectory(
    dirPath = '',
    recursive = false,
    maxDepth = 3,
    currentDepth = 0,
    customBaseDir?: string
  ): Promise<FsToolResult> {
    try {
      const fullPath = this.resolveSafePath(dirPath, customBaseDir);
      if (!fsSync.existsSync(fullPath)) {
        return { success: false, output: `Directory "${dirPath}" does not exist.` };
      }

      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const items: FileItemInfo[] = [];

      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const entryPath = path.join(fullPath, entry.name);
        const rel = path.relative(this.getWorkspaceRoot(), entryPath);
        const isDir = entry.isDirectory();

        let size = 0;
        let updatedAt = new Date().toISOString();
        try {
          const st = await fs.stat(entryPath);
          size = st.size;
          updatedAt = st.mtime.toISOString();
        } catch {}

        items.push({
          name: entry.name,
          relativePath: rel,
          isDirectory: isDir,
          sizeBytes: size,
          updatedAt,
        });

        if (recursive && isDir && currentDepth < maxDepth) {
          const sub = await this.listDirectory(rel, true, maxDepth, currentDepth + 1, customBaseDir);
          if (sub.success && Array.isArray(sub.data)) {
            items.push(...(sub.data as FileItemInfo[]));
          }
        }
      }

      const formatted = items
        .map(
          (i) =>
            `${i.isDirectory ? '[DIR] ' : '[FILE]'} ${i.name}${i.isDirectory ? '/' : ''} (${i.isDirectory ? 'dir' : `${i.sizeBytes} B`})`
        )
        .join('\n');

      return {
        success: true,
        output: formatted || '(Directory is empty)',
        data: items,
      };
    } catch (err: unknown) {
      return { success: false, output: `Failed to list directory "${dirPath}": ${(err as Error).message}` };
    }
  }

  // 5. Create directory
  public static async createDirectory(dirPath: string, customBaseDir?: string): Promise<FsToolResult> {
    try {
      const fullPath = this.resolveSafePath(dirPath, customBaseDir);
      await fs.mkdir(fullPath, { recursive: true });
      return {
        success: true,
        output: `Directory "${dirPath}" created successfully.`,
        data: { path: dirPath },
      };
    } catch (err: unknown) {
      return { success: false, output: `Failed to create directory "${dirPath}": ${(err as Error).message}` };
    }
  }

  // 6. Delete file or directory
  public static async deleteFile(filePath: string, customBaseDir?: string): Promise<FsToolResult> {
    try {
      const fullPath = this.resolveSafePath(filePath, customBaseDir);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
      return { success: true, output: `Path "${filePath}" deleted successfully.` };
    } catch (err: unknown) {
      return { success: false, output: `Failed to delete "${filePath}": ${(err as Error).message}` };
    }
  }

  // 7. Search text patterns in workspace files
  public static async searchFiles(query: string, searchDir = ''): Promise<FsToolResult> {
    try {
      const list = await this.listDirectory(searchDir, true, 4);
      if (!list.success || !Array.isArray(list.data)) {
        return { success: false, output: `Could not list directory for search.` };
      }

      const fileItems = (list.data as FileItemInfo[]).filter((i) => !i.isDirectory);
      const matches: { file: string; line: number; text: string }[] = [];

      for (const item of fileItems) {
        if (
          item.name.endsWith('.png') ||
          item.name.endsWith('.jpg') ||
          item.name.endsWith('.ico') ||
          item.sizeBytes > 500_000
        ) {
          continue;
        }

        try {
          const res = await this.readFile(item.relativePath, 300_000);
          if (res.success && typeof res.output === 'string') {
            const lines = res.output.split('\n');
            lines.forEach((line, idx) => {
              if (line.toLowerCase().includes(query.toLowerCase())) {
                matches.push({
                  file: item.relativePath,
                  line: idx + 1,
                  text: line.trim().slice(0, 160),
                });
              }
            });
          }
        } catch {}
      }

      const formatted = matches.slice(0, 40).map((m) => `${m.file}:${m.line} -> ${m.text}`).join('\n');
      return {
        success: true,
        output: formatted || `No matches found for "${query}" in workspace.`,
        data: matches,
      };
    } catch (err: unknown) {
      return { success: false, output: `Search failed: ${(err as Error).message}` };
    }
  }
}

