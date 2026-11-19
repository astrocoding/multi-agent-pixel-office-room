import test from 'node:test';
import assert from 'node:assert/strict';
import { IntentClassifier } from '@agent-office/ai';
import { AGENT_IDS } from '@agent-office/shared';

test('IntentClassifier: Deterministic Dangerous Command & High Risk Operations', () => {
  const dangerousInputs = [
    'rm -rf /var/www',
    'Tolong drop table users;',
    'drop database production_db',
    'delete from accounts where 1=1',
    'tolong hapus semua file konfigurasi',
    'sudo chmod 777 /etc/passwd',
  ];

  for (const input of dangerousInputs) {
    const profile = IntentClassifier.classifyDeterministic(input, 'web');
    assert.ok(profile, `Profile should be generated for input: ${input}`);
    assert.equal(profile.risk, 'critical', `Risk should be critical for: ${input}`);
    assert.equal(profile.requiresOwnerApproval, true, `Must require owner approval for: ${input}`);
    assert.ok(profile.approvalReason, 'Must provide approval reason');
    assert.ok(
      profile.targetSpecialists.includes(AGENT_IDS.ENGINEERING) ||
      profile.targetSpecialists.includes(AGENT_IDS.LEADER)
    );
  }
});

test('IntentClassifier: Artifact and File Creation Extraction', () => {
  const profileMd = IntentClassifier.classifyDeterministic('Tolong buatkan file docs/architecture.md mengenai sistem office', 'web');
  assert.ok(profileMd);
  assert.equal(profileMd.deliverable, 'markdown_file');
  assert.equal(profileMd.outputFilePath, 'docs/architecture.md');
  assert.equal(profileMd.requiresOwnerApproval, false);

  const profileJson = IntentClassifier.classifyDeterministic('Generate file config/settings.json untuk konfigurasi agent', 'web');
  assert.ok(profileJson);
  assert.equal(profileJson.deliverable, 'json');
  assert.equal(profileJson.outputFilePath, 'config/settings.json');

  const profileTs = IntentClassifier.classifyDeterministic('Simpan ke src/routes/user.ts untuk handler baru', 'web');
  assert.ok(profileTs);
  assert.equal(profileTs.deliverable, 'artifact');
  assert.equal(profileTs.outputFilePath, 'src/routes/user.ts');
});

test('IntentClassifier: Material Ambiguity Detection', () => {
  // Extremely vague inputs trigger exactly 1 focused question
  const ambiguousInputs = ['tolong', 'help', 'fix', 'perbaiki', 'run', 'abc'];

  for (const input of ambiguousInputs) {
    const profile = IntentClassifier.classifyDeterministic(input, 'web');
    assert.ok(profile);
    assert.equal(profile.isMateriallyAmbiguous, true, `Input "${input}" should be marked materially ambiguous`);
    assert.ok(profile.clarificationQuestion, 'Should provide clarification question');
    assert.ok(profile.clarificationOptions.length > 0, 'Should provide clarification options');
  }

  // Clear, complete request should NOT trigger ambiguity question
  const completeRequest = 'Tolong buatkan endpoint GET /api/users di Express dengan validasi Zod';
  const completeProfile = IntentClassifier.classifyDeterministic(completeRequest, 'web');
  assert.ok(completeProfile);
  assert.equal(completeProfile.isMateriallyAmbiguous, false, 'Complete request must not ask unnecessary questions');
});

test('IntentClassifier: Tone Styles and Language Detection', () => {
  const academicId = IntentClassifier.classifyDeterministic('Berikan analisis ilmiah dan metodologis mengenai efisiensi RAG', 'web');
  assert.equal(academicId?.tone, 'academic');
  assert.equal(academicId?.language, 'id');

  const casualId = IntentClassifier.classifyDeterministic('Hai bro, tolong santai aja ngobrol santai tentang progress tim', 'web');
  assert.equal(casualId?.tone, 'casual');
  assert.equal(casualId?.language, 'id');

  const technicalEn = IntentClassifier.classifyDeterministic('Design the technical architecture and code implementation of hybrid search in pgvector', 'web');
  assert.equal(technicalEn?.tone, 'technical');
  assert.equal(technicalEn?.language, 'en');

  const marketingId = IntentClassifier.classifyDeterministic('Buatkan draft promosi launching fitur baru untuk kampanye marketing produk kita', 'web');
  assert.equal(marketingId?.tone, 'marketing');

  const philosophicalId = IntentClassifier.classifyDeterministic('Refleksi filosofis tentang etika AI agen dalam mengambil keputusan otonom', 'web');
  assert.equal(philosophicalId?.tone, 'philosophical');
});

test('IntentClassifier: Specialist Assignment Routing', () => {
  const codeQuery = 'Tolong perbaiki bug pada endpoint dan buat kode fungsi backend baru';
  const codeProfile = IntentClassifier.classifyDeterministic(codeQuery, 'web');
  assert.ok(codeProfile?.targetSpecialists.includes(AGENT_IDS.ENGINEERING));
  assert.ok(codeProfile?.targetSpecialists.includes(AGENT_IDS.QA));

  const researchQuery = 'Lakukan riset mendalam dan investigasi perbandingan arsitektur hybrid search';
  const researchProfile = IntentClassifier.classifyDeterministic(researchQuery, 'web');
  assert.ok(researchProfile?.targetSpecialists.includes(AGENT_IDS.RESEARCH));

  const autoQuery = 'Buatkan pipeline deploy dan jadwalkan cron task otomatisasi';
  const autoProfile = IntentClassifier.classifyDeterministic(autoQuery, 'web');
  assert.ok(autoProfile?.targetSpecialists.includes(AGENT_IDS.AUTOMATION));
});

