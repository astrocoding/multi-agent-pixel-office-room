import fs from 'node:fs';
import path from 'node:path';
import {
  computeSha256,
  safeParseFrontmatter,
} from './markdownParser.js';
import {
  SkillMetadataSchema,
  type SkillMetadata,
  type SourceTrustLevel,
  type SkillStatus,
} from './types.js';

export interface DiscoveredSkillFile {
  skillId: string;
  name: string;
  description: string;
  entrypointPath: string;
  canonicalPath: string;
  references: string[];
  triggers: string[];
  roles: string[];
  languages: string[];
  version: string;
  contentHash: string;
  rawContent: string;
  layout: 'directory' | 'legacy_flat';
  isDuplicateAlias: boolean;
  duplicateOf?: string;
}

export interface DiscoveryScanResult {
  skills: DiscoveredSkillFile[];
  referenceFiles: {
    canonicalPath: string;
    parentSkillId: string;
    contentHash: string;
    rawContent: string;
  }[];
  quarantined: {
    path: string;
    reason: string;
  }[];
}

export interface SkillDiscoveryOptions {
  allowlistedRoots?: string[];
  maxFileSizeBytes?: number; // default 2MB
  defaultStatus?: SkillStatus;
  defaultTrust?: SourceTrustLevel;
}

const DEFAULT_MAX_SIZE = 2 * 1024 * 1024; // 2MB

export class SkillDiscoveryService {
  private readonly allowlistedRoots: string[];
  private readonly maxFileSize: number;

  constructor(options: SkillDiscoveryOptions = {}) {
    this.maxFileSize = options.maxFileSizeBytes || DEFAULT_MAX_SIZE;
    const defaultRoot = path.resolve(process.cwd(), 'skills');
    this.allowlistedRoots = options.allowlistedRoots
      ? options.allowlistedRoots.map((r) => path.resolve(r))
      : [defaultRoot];
  }

  /**
   * Validates that a path is safely contained within an allowlisted root.
   * Resolves symlinks and ensures no path traversal or symlink escape.
   */
  public validatePathSafety(targetPath: string): { safe: boolean; realPath: string; reason?: string } {
    try {
      const resolved = path.resolve(targetPath);

      // 1. Lexical check: ensure relative path does not escape allowlisted roots
      const isLexicallyInside = this.allowlistedRoots.some((root) => {
        const relative = path.relative(root, resolved);
        return !relative.startsWith('..') && !path.isAbsolute(relative);
      });

      if (!isLexicallyInside) {
        return {
          safe: false,
          realPath: resolved,
          reason: `Security violation: Path '${resolved}' resolves outside allowlisted roots`,
        };
      }

      if (!fs.existsSync(resolved)) {
        return { safe: false, realPath: resolved, reason: 'File does not exist' };
      }

      // 2. Realpath check: resolve symlinks and re-verify containment
      const realPath = fs.realpathSync(resolved);

      const isInside = this.allowlistedRoots.some((root) => {
        const realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root;
        const relative = path.relative(realRoot, realPath);
        return !relative.startsWith('..') && !path.isAbsolute(relative);
      });

      if (!isInside) {
        return {
          safe: false,
          realPath,
          reason: `Security violation: Path '${realPath}' resolves outside allowlisted roots`,
        };
      }

      return { safe: true, realPath };
    } catch (err: unknown) {
      return {
        safe: false,
        realPath: targetPath,
        reason: `Failed to resolve path safety: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Safely reads file content verifying file size and UTF-8 validity.
   */
  public readFileSafely(filePath: string): { ok: boolean; content?: string; reason?: string } {
    const safety = this.validatePathSafety(filePath);
    if (!safety.safe) {
      return { ok: false, reason: safety.reason };
    }

    try {
      const stats = fs.statSync(safety.realPath);
      if (!stats.isFile()) {
        return { ok: false, reason: 'Target is not a regular file' };
      }

      if (stats.size > this.maxFileSize) {
        return {
          ok: false,
          reason: `File size ${stats.size} exceeds maximum allowable ${this.maxFileSize} bytes`,
        };
      }

      const buf = fs.readFileSync(safety.realPath);

      // Verify UTF-8 decoding (no invalid byte sequences)
      const content = buf.toString('utf8');
      // Check for null bytes or binary garbage
      if (content.includes('\0')) {
        return { ok: false, reason: 'File contains null bytes or binary content' };
      }

      return { ok: true, content };
    } catch (err: unknown) {
      return { ok: false, reason: `Error reading file: ${(err as Error).message}` };
    }
  }

  /**
   * Scans the skills directory, discovering:
   * 1. skills/<slug>/SKILL.md (preferred bundle)
   * 2. skills/<slug>/references/*.md
   * 3. skills/*.md (legacy flat)
   *
   * Deduplicates duplicate logical skills (e.g. humanizer.md vs humanizer/SKILL.md).
   */
  public scanSkillsDirectory(rootDir?: string): DiscoveryScanResult {
    const targetRoot = rootDir ? path.resolve(rootDir) : this.allowlistedRoots[0];
    const result: DiscoveryScanResult = {
      skills: [],
      referenceFiles: [],
      quarantined: [],
    };

    if (!fs.existsSync(targetRoot)) {
      return result;
    }

    // Map of logical skillId -> DiscoveredSkillFile to handle deduplication
    const discoveredSkillsMap = new Map<string, DiscoveredSkillFile>();

    const entries = fs.readdirSync(targetRoot, { withFileTypes: true });

    // Pass 1: Discover directory skills (<slug>/SKILL.md) first
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const slug = entry.name;
        // Ignore hidden directories
        if (slug.startsWith('.')) continue;

        const skillMdPath = path.join(targetRoot, slug, 'SKILL.md');
        if (fs.existsSync(skillMdPath)) {
          const readRes = this.readFileSafely(skillMdPath);
          if (!readRes.ok || !readRes.content) {
            result.quarantined.push({
              path: skillMdPath,
              reason: readRes.reason || 'Failed to read SKILL.md',
            });
            continue;
          }

          const relativeEntrypoint = path.relative(process.cwd(), skillMdPath);
          const meta = this.extractSkillMetadata(slug, skillMdPath, relativeEntrypoint, readRes.content);
          if (!meta) {
            result.quarantined.push({
              path: skillMdPath,
              reason: 'Failed to extract valid skill metadata',
            });
            continue;
          }

          const discovered: DiscoveredSkillFile = {
            skillId: meta.skillId,
            name: meta.name,
            description: meta.description,
            entrypointPath: relativeEntrypoint,
            canonicalPath: path.resolve(skillMdPath),
            references: meta.references,
            triggers: meta.triggers,
            roles: meta.roles,
            languages: meta.languages,
            version: meta.version,
            contentHash: meta.contentHash,
            rawContent: readRes.content,
            layout: 'directory',
            isDuplicateAlias: false,
          };

          discoveredSkillsMap.set(meta.skillId, discovered);

          // Check for references in references/ folder
          const refsDir = path.join(targetRoot, slug, 'references');
          if (fs.existsSync(refsDir) && fs.statSync(refsDir).isDirectory()) {
            const refEntries = fs.readdirSync(refsDir, { withFileTypes: true });
            for (const refEntry of refEntries) {
              if (refEntry.isFile() && refEntry.name.endsWith('.md')) {
                const refPath = path.join(refsDir, refEntry.name);
                const refRead = this.readFileSafely(refPath);
                if (refRead.ok && refRead.content) {
                  result.referenceFiles.push({
                    canonicalPath: path.resolve(refPath),
                    parentSkillId: meta.skillId,
                    contentHash: computeSha256(refRead.content),
                    rawContent: refRead.content,
                  });
                } else {
                  result.quarantined.push({
                    path: refPath,
                    reason: refRead.reason || 'Failed to read reference file',
                  });
                }
              }
            }
          }
        }
      }
    }

    // Pass 2: Discover legacy flat skills (*.md) in the root
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
        const filePath = path.join(targetRoot, entry.name);
        const slug = path.basename(entry.name, '.md').toLowerCase();

        const readRes = this.readFileSafely(filePath);
        if (!readRes.ok || !readRes.content) {
          result.quarantined.push({
            path: filePath,
            reason: readRes.reason || 'Failed to read flat skill file',
          });
          continue;
        }

        const relativeEntrypoint = path.relative(process.cwd(), filePath);
        const meta = this.extractSkillMetadata(slug, filePath, relativeEntrypoint, readRes.content);
        if (!meta) {
          result.quarantined.push({
            path: filePath,
            reason: 'Failed to extract valid skill metadata from flat file',
          });
          continue;
        }

        // Deduplication check: does a directory bundle already exist for this skillId?
        if (discoveredSkillsMap.has(meta.skillId)) {
          const existing = discoveredSkillsMap.get(meta.skillId)!;
          // Mark flat file as duplicate alias of the directory version
          const aliasFile: DiscoveredSkillFile = {
            skillId: meta.skillId,
            name: meta.name,
            description: meta.description,
            entrypointPath: relativeEntrypoint,
            canonicalPath: path.resolve(filePath),
            references: meta.references,
            triggers: meta.triggers,
            roles: meta.roles,
            languages: meta.languages,
            version: meta.version,
            contentHash: meta.contentHash,
            rawContent: readRes.content,
            layout: 'legacy_flat',
            isDuplicateAlias: true,
            duplicateOf: existing.entrypointPath,
          };
          result.skills.push(aliasFile);
        } else {
          // No directory version exists; accept legacy flat format
          const discovered: DiscoveredSkillFile = {
            skillId: meta.skillId,
            name: meta.name,
            description: meta.description,
            entrypointPath: relativeEntrypoint,
            canonicalPath: path.resolve(filePath),
            references: meta.references,
            triggers: meta.triggers,
            roles: meta.roles,
            languages: meta.languages,
            version: meta.version,
            contentHash: meta.contentHash,
            rawContent: readRes.content,
            layout: 'legacy_flat',
            isDuplicateAlias: false,
          };
          discoveredSkillsMap.set(meta.skillId, discovered);
        }
      }
    }

    // Add unique non-duplicate skills from map
    for (const skill of discoveredSkillsMap.values()) {
      result.skills.unshift(skill);
    }

    return result;
  }

  /**
   * Extracts SkillMetadata from frontmatter or Markdown body fallback.
   */
  public extractSkillMetadata(
    fallbackSlug: string,
    canonicalPath: string,
    entrypoint: string,
    rawContent: string
  ): SkillMetadata | null {
    try {
      const { frontmatter, body } = safeParseFrontmatter(rawContent);
      const contentHash = computeSha256(rawContent);

      const skillId = (
        frontmatter.id ||
        frontmatter.name ||
        fallbackSlug
      ).toLowerCase().trim();

      // Title detection: frontmatter title -> first H1 in body -> slug
      let title = frontmatter.title || frontmatter.name;
      if (!title) {
        const h1Match = body.match(/^#\s+(.+)$/m);
        title = h1Match ? h1Match[1].trim() : fallbackSlug;
      }

      const description =
        frontmatter.description ||
        frontmatter.desc ||
        'Agent Office Room procedural skill';

      const triggers: string[] = [];
      if (Array.isArray(frontmatter.triggers)) {
        triggers.push(...frontmatter.triggers);
      } else if (typeof frontmatter.triggers === 'string') {
        triggers.push(frontmatter.triggers);
      }
      if (Array.isArray(frontmatter.tags)) {
        triggers.push(...frontmatter.tags);
      } else if (typeof frontmatter.tags === 'string') {
        triggers.push(frontmatter.tags);
      }

      const roles: string[] = [];
      if (Array.isArray(frontmatter.roles)) {
        roles.push(...frontmatter.roles);
      } else if (typeof frontmatter.roles === 'string') {
        roles.push(frontmatter.roles);
      }
      if (Array.isArray(frontmatter.agents)) {
        roles.push(...frontmatter.agents);
      }

      const languages: string[] = [];
      if (Array.isArray(frontmatter.languages)) {
        languages.push(...frontmatter.languages);
      } else if (typeof frontmatter.languages === 'string') {
        languages.push(frontmatter.languages);
      }
      if (languages.length === 0) {
        languages.push('id', 'en');
      }

      const references = Array.isArray(frontmatter.references)
        ? frontmatter.references
        : [];

      // Extract markdown link references if references/ folder is used in body
      const refMatches = body.matchAll(/\[.*?\]\((references\/[a-zA-Z0-9_\-\.\/]+)\)/g);
      for (const m of refMatches) {
        if (!references.includes(m[1])) {
          references.push(m[1]);
        }
      }

      const version = frontmatter.version || '1.0.0';

      return SkillMetadataSchema.parse({
        skillId,
        name: title,
        description,
        canonicalPath: path.resolve(canonicalPath),
        entrypoint,
        references,
        triggers,
        roles,
        languages,
        sourceTrust: 'unreviewed_proposal',
        status: 'proposed',
        approvedBy: null,
        version,
        contentHash,
        activeVersion: version,
        scope: frontmatter.scope || 'office',
        owner: frontmatter.owner || 'system',
        metadata: {
          frontmatter: { ...frontmatter },
        },
      });
    } catch (err: unknown) {
      console.warn(`[SkillDiscovery] Failed to parse metadata for ${canonicalPath}:`, err);
      return null;
    }
  }
}
