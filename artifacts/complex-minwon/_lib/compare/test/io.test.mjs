import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson, sha1, cachePath } from '../lib/io.mjs';

test('writeJson then readJson round-trips with trailing newline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-'));
  const f = path.join(dir, 'a', 'b.json');
  writeJson(f, { x: 1, y: ['가'] });
  assert.equal(fs.readFileSync(f, 'utf8').endsWith('\n'), true);
  assert.deepEqual(readJson(f), { x: 1, y: ['가'] });
});

test('sha1 is stable for equal objects regardless of key order', () => {
  assert.equal(sha1({ a: 1, b: 2 }), sha1({ b: 2, a: 1 }));
  assert.notEqual(sha1({ a: 1 }), sha1({ a: 2 }));
  assert.match(sha1('x'), /^[0-9a-f]{40}$/);
});

test('cachePath puts stage and hash under CACHE dir', () => {
  const p = cachePath('extract', 'abc');
  assert.match(p, /\.cache\/extract\/abc\.json$/);
});
