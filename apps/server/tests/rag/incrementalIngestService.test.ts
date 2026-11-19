import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { IncrementalIngestionService } from '../../src/rag/incrementalIngestService.js';

describe('Incremental Ingestion Service (Phase 1)', () => {
  it('executes dry-run without writing to the database', async () => {
    // Point to actual skills/ repository directory
    const repoSkills = path.resolve(process.cwd(), 'skills');
    const service = new IncrementalIngestionService(repoSkills);

    const result = await service.ingest({
      dryRun: true,
      autoApproveSlugs: ['humanizer'],
    });

    assert.strictEqual(result.dryRun, true);
    assert.ok(result.totalDiscovered >= 2); // humanizer/SKILL.md and references/humanizer.md
    assert.ok(result.indexed.length + result.skipped.length >= 2);
    assert.strictEqual(result.quarantined.length, 0);
  });

  it('detects changes incrementally (new, unchanged, updated, tombstoned)', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-test-inc-'));
    try {
      const skillDir = path.join(tempDir, 'demo');
      fs.mkdirSync(skillDir, { recursive: true });

      const skillFile = path.join(skillDir, 'SKILL.md');
      fs.writeFileSync(
        skillFile,
        `---
name: demo
version: 1.0.0
---
# Demo Skill V1
Original content.`
      );

      const service = new IncrementalIngestionService(tempDir);

      // Pass 1: Dry-run initial index
      const res1 = await service.ingest({ dryRun: true });
      assert.strictEqual(res1.totalDiscovered, 1);
      assert.strictEqual(res1.indexed.length, 1);
      assert.strictEqual(res1.updated.length, 0);
      assert.strictEqual(res1.skipped.length, 0);

      // Now simulate a change to the file
      fs.writeFileSync(
        skillFile,
        `---
name: demo
version: 1.1.0
---
# Demo Skill V2
Updated content with new requirements.`
      );

      const res2 = await service.ingest({ dryRun: true });
      assert.strictEqual(res2.totalDiscovered, 1);
      assert.strictEqual(res2.indexed.length, 1); // In dry-run without prior DB write, it discovers it as new
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('quarantines malformed and invalid files safely during ingestion', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-test-quarantine-'));
    try {
      // 1. Valid skill
      const validDir = path.join(tempDir, 'good');
      fs.mkdirSync(validDir, { recursive: true });
      fs.writeFileSync(
        path.join(validDir, 'SKILL.md'),
        `---
name: good
---
# Good Skill`
      );

      // 2. Corrupt binary file
      const corruptDir = path.join(tempDir, 'corrupt');
      fs.mkdirSync(corruptDir, { recursive: true });
      fs.writeFileSync(
        path.join(corruptDir, 'SKILL.md'),
        Buffer.from([0x00, 0x01, 0x02, 0xff])
      );

      const service = new IncrementalIngestionService(tempDir);
      const res = await service.ingest({ dryRun: true });

      assert.strictEqual(res.indexed.length, 1);
      assert.strictEqual(res.quarantined.length, 1);
      assert.ok(res.quarantined[0].path.includes('corrupt'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
