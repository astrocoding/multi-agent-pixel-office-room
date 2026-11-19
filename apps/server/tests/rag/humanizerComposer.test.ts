import test from 'node:test';
import assert from 'node:assert/strict';
import { HumanizerComposer, type RequestProfile } from '@agent-office/ai';
import type { PassageCitation } from '@agent-office/ai';

const baseProfile: RequestProfile = {
  intentCategory: 'query_information',
  userGoal: 'Explain RAG architecture',
  deliverable: 'summary',
  language: 'id',
  tone: 'professional',
  audience: 'boss',
  depth: 'standard',
  risk: 'low',
  requiresOwnerApproval: false,
  isMateriallyAmbiguous: false,
  clarificationOptions: [],
  targetSpecialists: ['agent_leader'],
  constraints: [],
};

test('HumanizerComposer: Telegram Channel Emoji-Free Enforcement', () => {
  const contentWithEmojis = '🚀 Sistem berhasil di-deploy! 🎉 Database connected 💻 dan API siap digunakan. 🤖';
  const cleaned = HumanizerComposer.enforceTelegramPolicy(contentWithEmojis);

  assert.equal(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}]/u.test(cleaned), false);
  assert.equal(cleaned.includes('🚀'), false);
  assert.equal(cleaned.includes('🎉'), false);
  assert.equal(cleaned.includes('💻'), false);
  assert.equal(cleaned.includes('🤖'), false);
  assert.ok(cleaned.includes('Sistem berhasil di-deploy!'));
  assert.ok(cleaned.includes('Database connected dan API siap digunakan.'));
});

test('HumanizerComposer: NPC Speech Bubble Formatting', () => {
  const longStatus = 'Memproses analisis dependensi paket npm dan memverifikasi modul postgres serta langchain di dalam workspace monorepo';
  const bubble = HumanizerComposer.formatNpcBubble(longStatus, 'Zen');

  assert.ok(bubble.length <= 100, `Bubble length ${bubble.length} should be <= 100 chars`);
  assert.ok(bubble.endsWith('...'), 'Should truncate with ellipsis when exceeding bound');

  const shortStatus = 'Mengompilasi modul TypeScript';
  const shortBubble = HumanizerComposer.formatNpcBubble(shortStatus, 'Iky');
  assert.equal(shortBubble, 'Mengompilasi modul TypeScript');
});

test('HumanizerComposer: Tone Register Adaptations (ID & EN)', () => {
  const rawId = 'Arsitektur RAG menggunakan hybrid reciprocal rank fusion antara lexical PostgreSQL FTS dan semantic pgvector.';

  // Academic ID
  const academicOut = HumanizerComposer.compose({
    profile: { ...baseProfile, tone: 'academic', language: 'id' },
    rawContent: rawId,
  });
  assert.ok(academicOut.includes('Berdasarkan analisis metodologis dan bukti sistem terverifikasi'));
  assert.ok(academicOut.includes(rawId));

  // Philosophical ID
  const philOut = HumanizerComposer.compose({
    profile: { ...baseProfile, tone: 'philosophical', language: 'id' },
    rawContent: rawId,
  });
  assert.ok(philOut.includes('Meninjau pertimbangan arsitektural dan implikasi mendasar'));
  assert.ok(philOut.includes(rawId));

  // Academic EN
  const rawEn = 'The RAG architecture utilizes hybrid reciprocal rank fusion combining lexical FTS and vector search.';
  const academicEn = HumanizerComposer.compose({
    profile: { ...baseProfile, tone: 'academic', language: 'en' },
    rawContent: rawEn,
  });
  assert.ok(academicEn.includes('Based on verified evidence and systematic analysis'));
  assert.ok(academicEn.includes(rawEn));

  // Technical
  const techOut = HumanizerComposer.compose({
    profile: { ...baseProfile, tone: 'technical' },
    rawContent: rawId,
  });
  assert.equal(techOut, rawId, 'Technical tone preserves exact content without artificial wrappers');
});

test('HumanizerComposer: Verifiable Source Citations Footers', () => {
  const citations: PassageCitation[] = [
    {
      sourceId: 'ks_humanizer',
      canonicalPath: 'skills/humanizer/SKILL.md',
      headingPath: 'Guidelines > Tone Guidelines',
      headingLevel: 2,
      startLine: 12,
      endLine: 45,
      version: '1.0.0',
      contentHash: 'hash_123',
      trustLevel: 'approved_canonical',
      tokenCount: 150,
      citationMarker: '[1]',
    },
    {
      sourceId: 'ks_rag_spec',
      canonicalPath: 'docs/RAG_ARCHITECTURE_SPEC.md',
      headingPath: 'Architecture > Pipeline',
      headingLevel: 2,
      startLine: 50,
      endLine: 80,
      version: '1.0.0',
      contentHash: 'hash_456',
      trustLevel: 'approved_canonical',
      tokenCount: 180,
      citationMarker: '[2]',
    },
  ];

  const result = HumanizerComposer.compose({
    profile: { ...baseProfile, deliverable: 'markdown_file' },
    rawContent: 'Implementasi pipeline retrieval telah diverifikasi.',
    citations,
  });

  assert.ok(result.includes('### Referensi Terverifikasi:'));
  assert.ok(result.includes('[1] skills/humanizer/SKILL.md (Lines 12-45, v1.0.0)'));
  assert.ok(result.includes('[2] docs/RAG_ARCHITECTURE_SPEC.md (Lines 50-80, v1.0.0)'));
});

test('HumanizerComposer: Telegram Channel Automatically Cleans Emojis in Final Output', () => {
  const raw = '🎉 Hasil audit selesai! Kode 100% compliant dengan spesifikasi RAG. 🚀';
  const delivered = HumanizerComposer.compose({
    profile: baseProfile,
    rawContent: raw,
    channel: 'telegram',
  });

  assert.equal(delivered.includes('🎉'), false);
  assert.equal(delivered.includes('🚀'), false);
  assert.ok(delivered.includes('Hasil audit selesai! Kode 100% compliant dengan spesifikasi RAG.'));
});

