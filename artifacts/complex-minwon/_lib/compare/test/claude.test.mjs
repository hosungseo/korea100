import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callJson } from '../lib/claude.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.COMPARE_CLAUDE_BIN = path.join(here, 'fake-claude.mjs');

function withLog(fn) {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cl-')), 'log');
  process.env.COMPARE_FAKE_LOG = log;
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-'));
  return fn({ log, cache, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).length : 0) });
}

test('parses the JSON object embedded in the reply', () => withLog(({ cache }) => {
  const r = callJson('@@ECHO:{"a":1}', { stage: 't', cacheDir: cache });
  assert.deepEqual(r.data, { a: 1 });
  assert.equal(r.cached, false);
}));

test('second identical call is served from cache without invoking claude', () => withLog(({ cache, calls }) => {
  callJson('@@ECHO:{"b":2}', { stage: 't', cacheDir: cache });
  const r = callJson('@@ECHO:{"b":2}', { stage: 't', cacheDir: cache });
  assert.equal(r.cached, true);
  assert.equal(calls(), 1);
}));

test('fresh:true bypasses the cache', () => withLog(({ cache, calls }) => {
  callJson('@@ECHO:{"c":3}', { stage: 't', cacheDir: cache });
  callJson('@@ECHO:{"c":3}', { stage: 't', cacheDir: cache, fresh: true });
  assert.equal(calls(), 2);
}));

test('retries once on parse failure then returns failed:true', () => withLog(({ cache, calls }) => {
  const r = callJson('@@FAIL@@', { stage: 't', cacheDir: cache });
  assert.equal(r.failed, true);
  assert.equal(r.data, null);
  assert.equal(calls(), 2);
}));

test('cache record keeps prompt hash and raw reply', () => withLog(({ cache }) => {
  const r = callJson('@@ECHO:{"d":4}', { stage: 't', cacheDir: cache });
  const rec = JSON.parse(fs.readFileSync(r.cacheFile, 'utf8'));
  assert.equal(rec.promptSha1.length, 40);
  assert.match(rec.raw, /"d":4/);
}));
