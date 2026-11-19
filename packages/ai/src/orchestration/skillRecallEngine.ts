import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdownDocument } from '../rag/markdownParser.js';
import type { MarkdownChunk } from '../rag/types.js';

export interface IndexedSkillSummary {
  slug: string;
  name: string;
  description: string;
  path: string;
  references: string[];
  primaryContract?: string;
  securityBoundaries?: string;
}

export interface SkillRecallResult {
  found: boolean;
  slug: string;
  name: string;
  description: string;
  extractedGuidance: string;
  relevantSections: Array<{ heading: string; content: string }>;
  referencedFiles: string[];
}

export class SkillRecallEngine {
  private static cachedCatalog: IndexedSkillSummary[] | null = null;
  private static lastScannedTime = 0;
  private static readonly CACHE_TTL_MS = 60000; // 1 minute cache in memory

  /**
   * Scans and returns all available skills in the allowlisted skills directory.
   */
  public static listSkills(skillsRootDir?: string): IndexedSkillSummary[] {
    const root = skillsRootDir || path.resolve(process.cwd(), 'skills');
    const now = Date.now();

    if (this.cachedCatalog && now - this.lastScannedTime < this.CACHE_TTL_MS) {
      return this.cachedCatalog;
    }

    if (!fs.existsSync(root)) {
      return [];
    }

    const summaries: IndexedSkillSummary[] = [];
    const entries = fs.readdirSync(root, { withFileTypes: true });

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const skillPath = path.join(root, ent.name, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          const content = fs.readFileSync(skillPath, 'utf-8');
          const parsed = parseMarkdownDocument(ent.name, content);

          // Find references in references/ directory
          const refDir = path.join(root, ent.name, 'references');
          let references: string[] = [];
          if (fs.existsSync(refDir)) {
            references = fs
              .readdirSync(refDir)
              .filter((f) => f.endsWith('.md'))
              .map((f) => `references/${f}`);
          }

          // Extract primary contract and security boundaries
          const contractChunk = parsed.chunks.find((c: MarkdownChunk) =>
            c.headingPath.toLowerCase().includes('contract') || c.headingPath.toLowerCase().includes('primary')
          );
          const securityChunk = parsed.chunks.find((c: MarkdownChunk) =>
            c.headingPath.toLowerCase().includes('security') || c.headingPath.toLowerCase().includes('boundary')
          );

          summaries.push({
            slug: ent.name,
            name: (parsed.frontmatter.name as string) || ent.name,
            description: (parsed.frontmatter.description as string) || '',
            path: skillPath,
            references,
            primaryContract: contractChunk?.content,
            securityBoundaries: securityChunk?.content,
          });
        }
      }
    }

    this.cachedCatalog = summaries;
    this.lastScannedTime = now;
    return summaries;
  }

  /**
   * Directly recalls a skill by slug or name, filtering relevant sections based on query.
   */
  public static recallSkill(
    slugOrName: string,
    query?: string,
    skillsRootDir?: string
  ): SkillRecallResult {
    const skills = this.listSkills(skillsRootDir);
    const targetSlug = slugOrName.toLowerCase().replace(/\s+/g, '-');
    const skill = skills.find(
      (s) => s.slug.toLowerCase() === targetSlug || s.name.toLowerCase() === slugOrName.toLowerCase()
    );

    if (!skill || !fs.existsSync(skill.path)) {
      return {
        found: false,
        slug: slugOrName,
        name: slugOrName,
        description: '',
        extractedGuidance: `Skill '${slugOrName}' was not found in the approved skills directory.`,
        relevantSections: [],
        referencedFiles: [],
      };
    }

    const content = fs.readFileSync(skill.path, 'utf-8');
    const parsed = parseMarkdownDocument(skill.slug, content);

    let matchingChunks: MarkdownChunk[] = parsed.chunks;
    if (query && query.trim().length > 0) {
      const qLower = query.toLowerCase();
      const queryTerms = qLower.split(/\s+/).filter((t) => t.length > 2);
      matchingChunks = parsed.chunks.filter((c: MarkdownChunk) => {
        const text = `${c.headingPath} ${c.content}`.toLowerCase();
        return queryTerms.some((term) => text.includes(term));
      });
      if (matchingChunks.length === 0) {
        matchingChunks = parsed.chunks.slice(0, 3); // Fallback to overview chunks
      }
    }

    const sections = matchingChunks.map((c: MarkdownChunk) => ({
      heading: c.headingPath,
      content: c.content,
    }));

    const guidance = sections.map((s: { heading: string; content: string }) => `### ${s.heading}\n${s.content}`).join('\n\n');

    return {
      found: true,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      extractedGuidance: guidance,
      relevantSections: sections,
      referencedFiles: skill.references,
    };
  }

  /**
   * Safely reads an approved skill reference file without path traversal.
   */
  public static readSkillReference(
    skillSlug: string,
    refFileName: string,
    skillsRootDir?: string
  ): { success: boolean; content: string; error?: string } {
    const root = skillsRootDir || path.resolve(process.cwd(), 'skills');

    // Prevent path traversal
    if (refFileName.includes('..') || refFileName.startsWith('/') || refFileName.startsWith('\\')) {
      return {
        success: false,
        content: '',
        error: 'Path traversal forbidden: reference path cannot contain ".." or absolute paths.',
      };
    }

    const cleanRef = refFileName.startsWith('references/') ? refFileName.replace('references/', '') : refFileName;
    const fullPath = path.resolve(root, skillSlug, 'references', cleanRef);

    // Verify file stays within the skill directory
    const expectedDir = path.resolve(root, skillSlug, 'references');
    if (!fullPath.startsWith(expectedDir)) {
      return {
        success: false,
        content: '',
        error: 'Security violation: reference path escapes skill directory.',
      };
    }

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        content: '',
        error: `Reference file '${refFileName}' not found for skill '${skillSlug}'.`,
      };
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    return {
      success: true,
      content,
    };
  }

  /**
   * Generates tool descriptions for LangChain, Google ADK, and MCP.
   */
  public static getToolDefinitions() {
    return [
      {
        name: 'skill_recall',
        description:
          'Recalls specific procedural guidance and instructions from an approved skill in the skills directory (e.g. "humanizer", "adaptive-orchestration").',
        parameters: {
          skillName: { type: 'string', description: 'Slug or name of the skill to recall' },
          query: { type: 'string', description: 'Optional task or question to filter relevant sections' },
        },
      },
      {
        name: 'skill_list',
        description: 'Lists all available approved skills, descriptions, and reference documents.',
        parameters: {},
      },
      {
        name: 'skill_read_reference',
        description: 'Reads an in-depth reference document attached to an approved skill.',
        parameters: {
          skillName: { type: 'string', description: 'Slug of the skill' },
          referenceFileName: { type: 'string', description: 'Name of the reference file (e.g. 01_ARCHITECTURE_AND_WORKFLOW.md)' },
        },
      },
    ];
  }
}
