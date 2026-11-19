import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QuerySafety } from '@agent-office/ai';

describe('Query Safety & Search Sanitization (Phase 2)', () => {
  it('bounds query length to maximum 500 characters', () => {
    const hugeQuery = 'a'.repeat(800);
    const sanitized = QuerySafety.sanitize(hugeQuery);
    assert.ok(sanitized.cleaned.length <= 500);
  });

  it('extracts quoted exact phrases while cleaning unquoted terms', () => {
    const raw = 'find "agent communication protocol" and verify "task dispatch" in office';
    const sanitized = QuerySafety.sanitize(raw);

    assert.deepStrictEqual(sanitized.quotedPhrases, [
      'agent communication protocol',
      'task dispatch',
    ]);
    assert.ok(sanitized.terms.includes('office'));
    assert.ok(sanitized.terms.includes('communication'));
  });

  it('strips dangerous PostgreSQL FTS operators (! & | () : * < > `)', () => {
    const maliciousFts = '!(malicious & syntax) | test:* <drop> table; --';
    const sanitized = QuerySafety.sanitize(maliciousFts);

    assert.strictEqual(sanitized.cleaned.includes('!'), false);
    assert.strictEqual(sanitized.cleaned.includes('&'), false);
    assert.strictEqual(sanitized.cleaned.includes('|'), false);
    assert.strictEqual(sanitized.cleaned.includes('('), false);
    assert.strictEqual(sanitized.cleaned.includes(')'), false);
    assert.strictEqual(sanitized.cleaned.includes(':'), false);
    assert.strictEqual(sanitized.cleaned.includes('*'), false);
    assert.strictEqual(sanitized.cleaned.includes('<'), false);
    assert.strictEqual(sanitized.cleaned.includes('>'), false);
  });

  it('preserves technical identifiers and file paths (SKILL.md, package.json)', () => {
    const query = 'lookup skills/humanizer/SKILL.md and package.json configuration';
    const sanitized = QuerySafety.sanitize(query);

    assert.ok(sanitized.terms.some((t) => t.includes('SKILL.md') || t.includes('skills/humanizer/SKILL.md')));
    assert.ok(sanitized.terms.some((t) => t.includes('package.json')));
  });

  it('preserves Indonesian and English multi-word phrases cleanly', () => {
    const indonesianQuery = 'bagaimana aturan penulisan pesan telegram tanpa emoji';
    const sanitized = QuerySafety.sanitize(indonesianQuery);

    assert.ok(sanitized.terms.includes('aturan'));
    assert.ok(sanitized.terms.includes('penulisan'));
    assert.ok(sanitized.terms.includes('telegram'));
    assert.ok(sanitized.terms.includes('tanpa'));
    assert.ok(sanitized.terms.includes('emoji'));
  });

  it('validates empty and oversized queries safely', () => {
    assert.throws(
      () => QuerySafety.validate(''),
      /cannot be empty/
    );
    assert.throws(
      () => QuerySafety.validate('a'.repeat(600)),
      /exceeds maximum limit/
    );
    assert.doesNotThrow(() => QuerySafety.validate('valid search query'));
  });
});

