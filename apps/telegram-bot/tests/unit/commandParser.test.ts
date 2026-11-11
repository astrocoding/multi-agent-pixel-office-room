import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandParser } from '../../src/domains/commands/infrastructure/commandParser.js';

describe('CommandParser', () => {
  it('parses simple commands without arguments', () => {
    const res = CommandParser.parse('/start');
    assert.strictEqual(res.isCommand, true);
    assert.strictEqual(res.commandName, 'start');
    assert.deepStrictEqual(res.args, []);
    assert.strictEqual(res.rawArgs, '');
  });

  it('handles case-insensitivity and bot mention username stripping', () => {
    const res = CommandParser.parse('/STATUS@AgentOfficeRoomBot');
    assert.strictEqual(res.isCommand, true);
    assert.strictEqual(res.commandName, 'status');
    assert.deepStrictEqual(res.args, []);
  });

  it('parses commands with multiple arguments', () => {
    const res = CommandParser.parse('/chat zen Halo apa kabar');
    assert.strictEqual(res.isCommand, true);
    assert.strictEqual(res.commandName, 'chat');
    assert.deepStrictEqual(res.args, ['zen', 'Halo', 'apa', 'kabar']);
    assert.strictEqual(res.rawArgs, 'zen Halo apa kabar');
  });

  it('parses commands with single quoted or multi-word raw arguments', () => {
    const res = CommandParser.parse('/task Buat fitur autentikasi JWT');
    assert.strictEqual(res.isCommand, true);
    assert.strictEqual(res.commandName, 'task');
    assert.strictEqual(res.rawArgs, 'Buat fitur autentikasi JWT');
  });

  it('identifies non-command input', () => {
    const res = CommandParser.parse('Halo Zen tolong bantu saya');
    assert.strictEqual(res.isCommand, false);
    assert.strictEqual(res.commandName, '');
    assert.strictEqual(res.rawArgs, 'Halo Zen tolong bantu saya');
  });

  it('handles empty or whitespace strings', () => {
    const res = CommandParser.parse('   ');
    assert.strictEqual(res.isCommand, false);
    assert.strictEqual(res.rawArgs, '');
  });
});

