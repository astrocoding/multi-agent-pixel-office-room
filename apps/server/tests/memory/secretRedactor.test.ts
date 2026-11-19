import test from 'node:test';
import assert from 'node:assert/strict';
import { SecretRedactor } from '@agent-office/ai';

test('SecretRedactor: Redacts API keys and access tokens', () => {
  const dummyOpenAiKey = ['sk', 'proj'].join('-') + '-mock' + '0'.repeat(32);
  const dummyGoogleKey = ['AI', 'za'].join('') + 'SyMock' + '0'.repeat(29);
  const dummyGithubToken = ['gh', 'p'].join('') + '_mock' + '0'.repeat(32);
  const dummyAwsKey = ['AK', 'IA'].join('') + 'MOCK' + '0'.repeat(12);
  const dummySlackToken = ['xox', 'b'].join('') + '-mock' + '0'.repeat(20);

  const input = `
    Here are the production keys:
    OpenAI: ${dummyOpenAiKey}
    Google: ${dummyGoogleKey}
    GitHub: ${dummyGithubToken}
    AWS: ${dummyAwsKey}
    Slack: ${dummySlackToken}
  `;

  const res = SecretRedactor.redact(input);

  assert.equal(res.detectedCount, 5);
  assert.ok(res.secretTypes.includes('openai_api_key'));
  assert.ok(res.secretTypes.includes('google_api_key'));
  assert.ok(res.secretTypes.includes('github_token'));
  assert.ok(res.secretTypes.includes('aws_access_key'));
  assert.ok(res.secretTypes.includes('slack_token'));

  assert.equal(res.redactedText.includes(dummyOpenAiKey), false);
  assert.equal(res.redactedText.includes(dummyGoogleKey), false);
  assert.equal(res.redactedText.includes(dummyGithubToken), false);
  assert.equal(res.redactedText.includes(dummyAwsKey), false);
  assert.equal(res.redactedText.includes(dummySlackToken), false);
  assert.ok(res.redactedText.includes('[REDACTED_OPENAI_KEY]'));
  assert.ok(res.redactedText.includes('[REDACTED_GOOGLE_API_KEY]'));
  assert.ok(res.redactedText.includes('[REDACTED_GITHUB_TOKEN]'));
  assert.ok(res.redactedText.includes('[REDACTED_AWS_KEY]'));
  assert.ok(res.redactedText.includes('[REDACTED_SLACK_TOKEN]'));
});

test('SecretRedactor: Redacts database URLs with passwords and Bearer/JWT tokens', () => {
  const dummyJwt = [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
    'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  ].join('.');

  const input = `
    DATABASE_URL=postgresql://postgres:SuperSecretPassword123!@localhost:5432/agent_office
    Authorization: Bearer ${dummyJwt}
  `;

  const res = SecretRedactor.redact(input);

  assert.equal(res.redactedText.includes('SuperSecretPassword123!'), false);
  assert.ok(res.redactedText.includes('[REDACTED_DB_PASSWORD]'));
  assert.ok(
    res.redactedText.includes('[REDACTED_BEARER_TOKEN]') ||
    res.redactedText.includes('[REDACTED_JWT_TOKEN]')
  );
});

test('SecretRedactor: Redacts Private Keys', () => {
  const privateKey = [
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIEowIBAAKCAQEA0Y3yZ...sample...key...data...',
    '-----END RSA PRIVATE KEY-----',
  ].join('\n');

  const res = SecretRedactor.redact(privateKey);
  assert.ok(res.secretTypes.includes('private_key'));
  assert.ok(res.redactedText.includes('[REDACTED_PRIVATE_KEY]'));
  assert.equal(res.redactedText.includes('MIIEowIBAAKCAQEA0Y3yZ'), false);
});

test('SecretRedactor: Preserves safe text and code without false positives', () => {
  const safeText = 'The system uses PostgreSQL database running on port 5432 with vector similarity search.';
  const res = SecretRedactor.redact(safeText);

  assert.equal(res.detectedCount, 0);
  assert.equal(res.redactedText, safeText);
});
