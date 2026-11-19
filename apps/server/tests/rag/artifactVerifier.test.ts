import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ArtifactVerifier } from '@agent-office/ai';

test('ArtifactVerifier: Non-existent file fails verification', () => {
  const fakePath = path.join(os.tmpdir(), `non_existent_${Date.now()}.json`);
  const result = ArtifactVerifier.verify(fakePath, 'json');

  assert.equal(result.verified, false);
  assert.equal(result.formatValid, false);
  assert.equal(result.fileSizeBytes, 0);
  assert.ok(result.reason?.includes('does not exist on disk'));
});

test('ArtifactVerifier: Directory path fails verification', () => {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'test_dir_'));
  const result = ArtifactVerifier.verify(dirPath, 'artifact');

  assert.equal(result.verified, false);
  assert.ok(result.reason?.includes('is a directory, not a file'));
  fs.rmdirSync(dirPath);
});

test('ArtifactVerifier: Empty (0-byte) file fails verification', () => {
  const emptyPath = path.join(os.tmpdir(), `empty_${Date.now()}.txt`);
  fs.writeFileSync(emptyPath, '');

  const result = ArtifactVerifier.verify(emptyPath, 'artifact');
  assert.equal(result.verified, false);
  assert.ok(result.reason?.includes('is empty (0 bytes)'));

  fs.unlinkSync(emptyPath);
});

test('ArtifactVerifier: JSON Syntax and Validity Checks', () => {
  const validJsonPath = path.join(os.tmpdir(), `valid_${Date.now()}.json`);
  fs.writeFileSync(validJsonPath, JSON.stringify({ status: 'ok', count: 42, active: true }));

  const validRes = ArtifactVerifier.verify(validJsonPath, 'json');
  assert.equal(validRes.verified, true);
  assert.equal(validRes.formatValid, true);
  assert.ok(validRes.fileSizeBytes > 0);

  fs.unlinkSync(validJsonPath);

  const invalidJsonPath = path.join(os.tmpdir(), `invalid_${Date.now()}.json`);
  fs.writeFileSync(invalidJsonPath, '{ invalid_json: missing_quotes, }');

  const invalidRes = ArtifactVerifier.verify(invalidJsonPath, 'json');
  assert.equal(invalidRes.verified, false);
  assert.equal(invalidRes.formatValid, false);
  assert.ok(invalidRes.reason?.includes('JSON syntax verification failed'));

  fs.unlinkSync(invalidJsonPath);
});

test('ArtifactVerifier: Markdown Format Verification', () => {
  const validMdPath = path.join(os.tmpdir(), `valid_${Date.now()}.md`);
  fs.writeFileSync(validMdPath, '# Project Specification\n\n- Feature A\n- Feature B\n');

  const validRes = ArtifactVerifier.verify(validMdPath, 'markdown_file');
  assert.equal(validRes.verified, true);
  assert.equal(validRes.formatValid, true);

  fs.unlinkSync(validMdPath);

  const trivialMdPath = path.join(os.tmpdir(), `trivial_${Date.now()}.md`);
  fs.writeFileSync(trivialMdPath, '   \n  ');

  const trivialRes = ArtifactVerifier.verify(trivialMdPath, 'markdown_file');
  assert.equal(trivialRes.verified, false);
  assert.ok(trivialRes.reason?.includes('Markdown verification failed: content too short'));

  fs.unlinkSync(trivialMdPath);
});

