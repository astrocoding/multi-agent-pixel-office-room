import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeParseFrontmatter,
  chunkMarkdown,
  parseMarkdownDocument,
  computeSha256,
  estimateTokenCount,
} from '@agent-office/ai';

describe('Safe Markdown Parser (Phase 1)', () => {
  it('parses valid YAML frontmatter with primitive values and arrays', () => {
    const raw = `---
name: humanizer
version: 1.2.0
triggers:
  - write
  - summarize
roles:
  - leader
  - engineering
languages: ["id", "en"]
active: true
maxTokens: 4000
---
# Humanizer Content
Some text here.`;

    const { frontmatter, body } = safeParseFrontmatter(raw);
    assert.strictEqual(frontmatter.name, 'humanizer');
    assert.strictEqual(frontmatter.version, '1.2.0');
    assert.deepStrictEqual(frontmatter.triggers, ['write', 'summarize']);
    assert.deepStrictEqual(frontmatter.roles, ['leader', 'engineering']);
    assert.deepStrictEqual(frontmatter.languages, ['id', 'en']);
    assert.strictEqual(frontmatter.active, true);
    assert.strictEqual(frontmatter.maxTokens, 4000);
    assert.strictEqual(body.includes('# Humanizer Content'), true);
  });

  it('resists prototype pollution in frontmatter', () => {
    const malicious = `---
__proto__:
  polluted: "yes"
constructor:
  prototype:
    polluted: "yes"
name: safe_skill
---
# Safe`;

    const { frontmatter } = safeParseFrontmatter(malicious);
    assert.strictEqual(frontmatter.name, 'safe_skill');
    // Ensure Object prototype was not polluted
    assert.strictEqual((({} as Record<string, unknown>).polluted), undefined);
  });

  it('handles malformed frontmatter gracefully without crashing', () => {
    const unclosed = `---
name: broken_skill
no closing fence
# Body content`;

    const { frontmatter, body } = safeParseFrontmatter(unclosed);
    assert.deepStrictEqual(frontmatter, {});
    assert.strictEqual(body.includes('broken_skill'), true);
  });

  it('does NOT split headings inside code fences (``` and ~~~)', () => {
    const md = `# Top Heading

Some introductory text.

\`\`\`markdown
# This is a fake heading inside code
## Another fake sub-heading inside code
\`\`\`

~~~bash
# Bash comment that looks like a heading
echo "Hello"
~~~

## Real Sub Heading

Real content here.`;

    const chunks = chunkMarkdown('src_test', md);

    // There should be exactly 2 chunks: "Top Heading" (including both code blocks) and "Top Heading > Real Sub Heading"
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].headingPath, 'Top Heading');
    assert.strictEqual(chunks[0].content.includes('# This is a fake heading inside code'), true);
    assert.strictEqual(chunks[0].content.includes('echo "Hello"'), true);
    assert.strictEqual(chunks[1].headingPath, 'Top Heading > Real Sub Heading');
  });

  it('preserves Markdown tables intact in chunks', () => {
    const md = `# Evaluation Matrix

| Metric | Baseline | Target |
| :--- | :--- | :--- |
| Latency | 250ms | 180ms |
| Grounding | 92% | 98% |
| Token Budget | 4000 | 3500 |

Footer notes below table.`;

    const chunks = chunkMarkdown('src_table', md);
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].content.includes('| Metric | Baseline | Target |'), true);
    assert.strictEqual(chunks[0].content.includes('| Latency | 250ms | 180ms |'), true);
  });

  it('tracks heading hierarchy, levels, and parentSectionId', () => {
    const md = `# Level 1 Header

Text in Level 1.

## Level 2 Header A

Text in 2A.

### Level 3 Header A1

Text in 3A1.

## Level 2 Header B

Text in 2B.`;

    const chunks = chunkMarkdown('src_hier', md);
    assert.strictEqual(chunks.length, 4);

    assert.strictEqual(chunks[0].headingPath, 'Level 1 Header');
    assert.strictEqual(chunks[0].headingLevel, 1);
    assert.strictEqual(chunks[0].parentSectionId, null);

    assert.strictEqual(chunks[1].headingPath, 'Level 1 Header > Level 2 Header A');
    assert.strictEqual(chunks[1].headingLevel, 2);
    assert.ok(chunks[1].parentSectionId !== null);

    assert.strictEqual(chunks[2].headingPath, 'Level 1 Header > Level 2 Header A > Level 3 Header A1');
    assert.strictEqual(chunks[2].headingLevel, 3);
    assert.ok(chunks[2].parentSectionId !== null);

    assert.strictEqual(chunks[3].headingPath, 'Level 1 Header > Level 2 Header B');
    assert.strictEqual(chunks[3].headingLevel, 2);
  });

  it('computes accurate 1-based startLine and endLine for each chunk', () => {
    const md = `# Line One
Line Two
Line Three

## Line Five
Line Six
Line Seven`;

    const chunks = chunkMarkdown('src_lines', md);
    assert.strictEqual(chunks.length, 2);

    assert.strictEqual(chunks[0].startLine, 1);
    assert.strictEqual(chunks[0].endLine, 4);

    assert.strictEqual(chunks[1].startLine, 5);
    assert.strictEqual(chunks[1].endLine, 7);
  });

  it('produces deterministic SHA-256 hashes and positive token counts', () => {
    const content = 'Test deterministic content string';
    const hash1 = computeSha256(content);
    const hash2 = computeSha256(content);
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);

    const tokens = estimateTokenCount(content);
    assert.ok(tokens > 0);
  });

  it('guarantees zero code execution during parsing of scripts or tags', () => {
    const injected = `---
name: injection_test
payload: "<script>process.exit(99)</script>"
---
# Dangerous Document
<script>
  // If this executes, process would crash or set global
  globalThis.__EXPLOITED__ = true;
</script>
\`\`\`javascript
eval("globalThis.__EXPLOITED_EVAL__ = true");
\`\`\`
`;

    const doc = parseMarkdownDocument('inj_test', injected);
    assert.strictEqual(doc.frontmatter.name, 'injection_test');
    assert.strictEqual((globalThis as unknown as Record<string, unknown>).__EXPLOITED__, undefined);
    assert.strictEqual((globalThis as unknown as Record<string, unknown>).__EXPLOITED_EVAL__, undefined);
    assert.ok(doc.chunks.length > 0);
  });
});

