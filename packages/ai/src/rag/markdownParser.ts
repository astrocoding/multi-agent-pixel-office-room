import { createHash } from 'node:crypto';
import type { MarkdownChunk, RawFrontmatter } from './types.js';

export interface ParsedMarkdownDocument {
  frontmatter: RawFrontmatter;
  rawBody: string;
  chunks: MarkdownChunk[];
  contentHash: string;
}

/**
 * Safely parses YAML frontmatter without eval, Function, or prototype pollution.
 */
export function safeParseFrontmatter(raw: string): { frontmatter: RawFrontmatter; body: string } {
  const lines = raw.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() !== '---') {
    return { frontmatter: {}, body: raw };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    // Malformed frontmatter (no closing fence)
    return { frontmatter: {}, body: raw };
  }

  const fmLines = lines.slice(1, endIdx);
  const body = lines.slice(endIdx + 1).join('\n');
  const result: Record<string, unknown> = Object.create(null);

  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of fmLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // List item under an active key
    if (trimmed.startsWith('- ') && currentKey) {
      const itemVal = stripQuotes(trimmed.slice(2).trim());
      if (!currentList) {
        currentList = [];
        result[currentKey] = currentList;
      }
      currentList.push(itemVal);
      continue;
    }

    // New key-value pair
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const valStr = trimmed.slice(colonIdx + 1).trim();

      // Guard against prototype pollution
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }

      currentKey = key;
      currentList = null;

      if (valStr.length === 0) {
        // May precede a multiline list
        result[key] = [];
        currentList = result[key] as string[];
      } else if (valStr.startsWith('[') && valStr.endsWith(']')) {
        // Inline array: [a, b, c]
        const items = valStr
          .slice(1, -1)
          .split(',')
          .map((s) => stripQuotes(s.trim()))
          .filter(Boolean);
        result[key] = items;
      } else {
        result[key] = parsePrimitive(valStr);
      }
    }
  }

  return { frontmatter: result as RawFrontmatter, body };
}

function stripQuotes(str: string): string {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1);
  }
  return str;
}

function parsePrimitive(val: string): unknown {
  const stripped = stripQuotes(val);
  if (stripped === 'true') return true;
  if (stripped === 'false') return false;
  if (stripped === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(stripped)) {
    const num = Number(stripped);
    if (!Number.isNaN(num)) return num;
  }
  return stripped;
}

export function computeSha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Standard token estimate for mixed English & Indonesian (~4 chars per token)
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

interface HeadingContext {
  id: string;
  level: number;
  title: string;
}

/**
 * Splits Markdown into heading-aware semantic chunks while preserving:
 * - Code fences (``` and ~~~)
 * - Markdown tables
 * - Line numbers (1-based)
 * - Parent section hierarchy
 * - SHA-256 chunk checksums
 */
export function chunkMarkdown(
  sourceId: string,
  rawContent: string,
  options: { maxChunkChars?: number } = {}
): MarkdownChunk[] {
  const maxChars = options.maxChunkChars || 3500;
  const lines = rawContent.split(/\r?\n/);
  const chunks: MarkdownChunk[] = [];

  let inCodeFence = false;
  let codeFenceMarker = '';

  interface SectionBuffer {
    headingContexts: HeadingContext[];
    headingPath: string;
    headingLevel: number;
    startLine: number;
    lines: string[];
    parentSectionId: string | null;
  }

  const headingStack: HeadingContext[] = [];

  let currentSection: SectionBuffer = {
    headingContexts: [],
    headingPath: '(Root)',
    headingLevel: 0,
    startLine: 1,
    lines: [],
    parentSectionId: null,
  };

  function flushCurrentSection(endLineNumber: number) {
    if (currentSection.lines.length === 0) return;

    const text = currentSection.lines.join('\n').trim();
    if (text.length === 0) return;

    const chunkId = `chk_${sourceId}_${chunks.length + 1}`;
    const chunkHash = computeSha256(text);
    const tokenCount = estimateTokenCount(text);

    chunks.push({
      id: chunkId,
      sourceId,
      parentSectionId: currentSection.parentSectionId,
      headingPath: currentSection.headingPath || '(Root)',
      headingLevel: currentSection.headingLevel,
      startLine: currentSection.startLine,
      endLine: endLineNumber,
      content: text,
      tokenCount,
      chunkHash,
      visibility: 'internal',
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    const trimmed = line.trim();

    // Check code fence toggle
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      const marker = trimmed.slice(0, 3);
      if (!inCodeFence) {
        inCodeFence = true;
        codeFenceMarker = marker;
      } else if (trimmed.startsWith(codeFenceMarker)) {
        inCodeFence = false;
        codeFenceMarker = '';
      }
      currentSection.lines.push(line);
      continue;
    }

    if (inCodeFence) {
      currentSection.lines.push(line);
      continue;
    }

    // Check heading (only outside code fences)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const hashes = headingMatch[1];
      const headingLevel = hashes.length;
      const headingTitle = headingMatch[2].trim();

      // Flush previous section
      flushCurrentSection(lineNum - 1);

      // Pop stack for hierarchy
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= headingLevel
      ) {
        headingStack.pop();
      }

      const parentSectionId =
        headingStack.length > 0 ? headingStack[headingStack.length - 1].id : null;

      const sectionContextId = `sec_${sourceId}_h${headingLevel}_${lineNum}`;
      const newCtx: HeadingContext = {
        id: sectionContextId,
        level: headingLevel,
        title: headingTitle,
      };
      headingStack.push(newCtx);

      const headingPath = headingStack.map((h) => h.title).join(' > ');

      currentSection = {
        headingContexts: [...headingStack],
        headingPath,
        headingLevel,
        startLine: lineNum,
        lines: [line],
        parentSectionId,
      };
      continue;
    }

    currentSection.lines.push(line);

    // If current section exceeds maxChars and we are NOT in a code fence or table, split cleanly
    const currentChars = currentSection.lines.reduce((acc, l) => acc + l.length + 1, 0);
    if (currentChars >= maxChars && !inCodeFence && !trimmed.startsWith('|')) {
      // Find a clean paragraph break if possible
      flushCurrentSection(lineNum);
      currentSection = {
        headingContexts: [...headingStack],
        headingPath: currentSection.headingPath,
        headingLevel: currentSection.headingLevel,
        startLine: lineNum + 1,
        lines: [],
        parentSectionId: currentSection.parentSectionId,
      };
    }
  }

  // Flush trailing section
  flushCurrentSection(lines.length);

  return chunks;
}

/**
 * Parses a complete Markdown document safely into frontmatter, raw body,
 * heading-aware chunks, and overall SHA-256 hash.
 */
export function parseMarkdownDocument(
  sourceId: string,
  rawContent: string
): ParsedMarkdownDocument {
  const contentHash = computeSha256(rawContent);
  const { frontmatter, body } = safeParseFrontmatter(rawContent);
  const chunks = chunkMarkdown(sourceId, body);

  return {
    frontmatter,
    rawBody: body,
    chunks,
    contentHash,
  };
}

