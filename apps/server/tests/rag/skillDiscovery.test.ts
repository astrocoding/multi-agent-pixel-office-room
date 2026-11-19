import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillDiscoveryService } from '@agent-office/ai';

describe('Skill Discovery Service (Phase 1)', () => {
  it('discovers directory skills and their reference files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-test-skills-'));
    try {
      // Create skills/my-skill/SKILL.md
      const skillDir = path.join(tempDir, 'my-skill');
      const refsDir = path.join(skillDir, 'references');
      fs.mkdirSync(refsDir, { recursive: true });

      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---
name: my-skill
title: My Specialized Skill
description: Test procedure
triggers: ["code", "build"]
roles: ["engineering"]
languages: ["id", "en"]
---
# Specialized Skill
Content here.`
      );

      fs.writeFileSync(
        path.join(refsDir, 'spec.md'),
        `# Specialized Specification
Details of the spec.`
      );

      const discovery = new SkillDiscoveryService({
        allowlistedRoots: [tempDir],
      });

      const res = discovery.scanSkillsDirectory(tempDir);
      assert.strictEqual(res.skills.length, 1);
      assert.strictEqual(res.skills[0].skillId, 'my-skill');
      assert.strictEqual(res.skills[0].layout, 'directory');
      assert.strictEqual(res.skills[0].isDuplicateAlias, false);
      assert.strictEqual(res.referenceFiles.length, 1);
      assert.strictEqual(res.referenceFiles[0].parentSkillId, 'my-skill');
      assert.strictEqual(res.quarantined.length, 0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('discovers legacy flat skills (*.md)', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-test-flat-'));
    try {
      fs.writeFileSync(
        path.join(tempDir, 'release.md'),
        `---
name: release-checker
description: Verifies release health
triggers: ["release", "deploy"]
---
# Release Checker
Check list here.`
      );

      const discovery = new SkillDiscoveryService({
        allowlistedRoots: [tempDir],
      });

      const res = discovery.scanSkillsDirectory(tempDir);
      assert.strictEqual(res.skills.length, 1);
      assert.strictEqual(res.skills[0].skillId, 'release-checker');
      assert.strictEqual(res.skills[0].layout, 'legacy_flat');
      assert.strictEqual(res.skills[0].isDuplicateAlias, false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('deduplicates duplicate logical skills (directory SKILL.md vs flat *.md)', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-test-dedup-'));
    try {
      // 1. Directory version: humanizer/SKILL.md
      const dirSkill = path.join(tempDir, 'humanizer');
      fs.mkdirSync(dirSkill, { recursive: true });
      fs.writeFileSync(
        path.join(dirSkill, 'SKILL.md'),
        `---
name: humanizer
version: 2.0.0
---
# Humanizer Directory Bundle`
      );

      // 2. Legacy flat version: humanizer.md
      fs.writeFileSync(
        path.join(tempDir, 'humanizer.md'),
        `---
name: humanizer
version: 1.0.0
---
# Humanizer Legacy Flat`
      );

      const discovery = new SkillDiscoveryService({
        allowlistedRoots: [tempDir],
      });

      const res = discovery.scanSkillsDirectory(tempDir);
      // There are 2 skill entries in res.skills: 1 primary (directory) and 1 flagged as duplicate alias
      const primary = res.skills.filter((s) => !s.isDuplicateAlias);
      const duplicates = res.skills.filter((s) => s.isDuplicateAlias);

      assert.strictEqual(primary.length, 1);
      assert.strictEqual(primary[0].skillId, 'humanizer');
      assert.strictEqual(primary[0].layout, 'directory');
      assert.strictEqual(primary[0].version, '2.0.0');

      assert.strictEqual(duplicates.length, 1);
      assert.strictEqual(duplicates[0].skillId, 'humanizer');
      assert.strictEqual(duplicates[0].layout, 'legacy_flat');
      assert.strictEqual(duplicates[0].isDuplicateAlias, true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects path traversal and paths outside allowlisted roots', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-test-traversal-'));
    try {
      const discovery = new SkillDiscoveryService({
        allowlistedRoots: [tempDir],
      });

      // Attempting to validate a path pointing outside tempDir (e.g. /etc/hosts or /tmp)
      const outsidePath = path.resolve(tempDir, '../../etc/hosts');
      const check = discovery.validatePathSafety(outsidePath);
      assert.strictEqual(check.safe, false);
      assert.ok(check.reason?.includes('outside allowlisted roots'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('rejects symlink escape pointing outside allowlisted root', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-test-symlink-'));
    const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-secret-'));
    try {
      const secretFile = path.join(secretDir, 'secret.md');
      fs.writeFileSync(secretFile, '# Leaked Secret Data');

      // Create a symlink inside tempDir pointing to secretFile outside
      const symlinkPath = path.join(tempDir, 'escaped.md');
      try {
        fs.symlinkSync(secretFile, symlinkPath);
      } catch {
        // Skip if OS permissions restrict symlink creation
        return;
      }

      const discovery = new SkillDiscoveryService({
        allowlistedRoots: [tempDir],
      });

      const check = discovery.validatePathSafety(symlinkPath);
      assert.strictEqual(check.safe, false);
      assert.ok(check.reason?.includes('outside allowlisted roots'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(secretDir, { recursive: true, force: true });
    }
  });

  it('quarantines oversized files exceeding maxFileSizeBytes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-test-size-'));
    try {
      const hugeFile = path.join(tempDir, 'huge.md');
      // Create a file of 1500 bytes with limit 1000 bytes
      fs.writeFileSync(hugeFile, 'A'.repeat(1500));

      const discovery = new SkillDiscoveryService({
        allowlistedRoots: [tempDir],
        maxFileSizeBytes: 1000,
      });

      const res = discovery.scanSkillsDirectory(tempDir);
      assert.strictEqual(res.skills.length, 0);
      assert.strictEqual(res.quarantined.length, 1);
      assert.ok(res.quarantined[0].reason.includes('exceeds maximum allowable'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('quarantines files containing binary/null bytes', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-test-binary-'));
    try {
      const binFile = path.join(tempDir, 'corrupt.md');
      const buf = Buffer.from([0x23, 0x20, 0x54, 0x65, 0x73, 0x74, 0x00, 0x01, 0x02]);
      fs.writeFileSync(binFile, buf);

      const discovery = new SkillDiscoveryService({
        allowlistedRoots: [tempDir],
      });

      const res = discovery.scanSkillsDirectory(tempDir);
      assert.strictEqual(res.skills.length, 0);
      assert.strictEqual(res.quarantined.length, 1);
      assert.ok(res.quarantined[0].reason.includes('null bytes or binary'));
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('handles empty or missing skills root directory gracefully', () => {
    const nonExistent = path.join(os.tmpdir(), 'does-not-exist-dir-12345');
    const discovery = new SkillDiscoveryService({
      allowlistedRoots: [nonExistent],
    });

    const res = discovery.scanSkillsDirectory(nonExistent);
    assert.deepStrictEqual(res.skills, []);
    assert.deepStrictEqual(res.referenceFiles, []);
    assert.deepStrictEqual(res.quarantined, []);
  });
});

