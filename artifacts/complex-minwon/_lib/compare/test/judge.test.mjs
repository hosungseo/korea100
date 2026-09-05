import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildJudgePrompt, applyVerdict, judgeAll } from '../judge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.COMPARE_CLAUDE_BIN = path.join(here, 'fake-claude.mjs');

const procs = [
  { pid: 'M1:eia:P02', name: '환경영향평가 본안 검토·협의 완료', action: 'a', actorRaw: '환경부', legal: [{ law: '환경영향평가법', article: '제29조제1항', text: 't' }] },
  { pid: 'M2:tra:P01', name: '교통영향평가서 제출', action: 'b', actorRaw: '사업시행자', legal: [{ law: '도시교통정비 촉진법', article: '제16조제1항', text: 't' }] },
  { pid: 'M1:eia:P03', name: '보완 요구', action: 'c', actorRaw: '환경부', legal: [{ law: '환경영향평가법', article: '제30조', text: 't' }] },
];
const cluster = { cid: 'A-traffic-01', axis: 'same-subject', key: 'traffic', pids: procs.map((p) => p.pid), score: {} };
const preserve = [{ id: 'eia-main', pattern: '본안 검토|협의 완료', law: '환경영향평가법', allowed: ['shorten', 'automate'] }];

test('prompt lists every pair once with both procedures and their articles', () => {
  const p = buildJudgePrompt(cluster, procs);
  assert.match(p, /M1:eia:P02.*M2:tra:P01/s); assert.match(p, /제16조제1항/);
  assert.match(p, /삭제|폐지.*제안하지/);
});

test('applyVerdict passes when any pair is mergeable, restricts kinds by preserve, ignores drop suggestions', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/claude/judge-pass.json'), 'utf8'));
  const v = applyVerdict(cluster, raw, procs, preserve);
  assert.equal(v.passed, true);
  assert.deepEqual(v.allowedKinds, ['automate', 'shorten']); // eia-main in cluster → merge removed, DEFAULT_KINDS order kept
  assert.deepEqual(v.preserveHits, ['eia-main']);
  assert.equal(v.pairs.length, 2);
  assert.ok(!('suggest' in v.pairs[0]), 'drop suggestion is not carried into verdicts');
  assert.deepEqual(v.ignored, [{ a: 'M1:eia:P02', b: 'M2:tra:P01', suggest: 'drop' }]);
});

test('applyVerdict fails a cluster with no mergeable pair and drops pairs naming unknown pids', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/claude/judge-none.json'), 'utf8'));
  const v = applyVerdict(cluster, raw, procs, preserve);
  assert.equal(v.passed, false); assert.equal(v.pairs.length, 0);
});

test('allowedKinds default is merge/automate/shorten and empty allowed list fails the cluster', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/claude/judge-pass.json'), 'utf8'));
  const v1 = applyVerdict(cluster, raw, procs, []);
  assert.deepEqual(v1.allowedKinds, ['merge', 'automate', 'shorten']);
  const v2 = applyVerdict(cluster, raw, procs, [{ id: 'vote', pattern: '본안', law: '환경영향평가법', allowed: [] }]);
  assert.equal(v2.passed, false); assert.equal(v2.reason, 'preserve:vote allows no kind');
});

test('judgeAll runs one call per cluster and records failures', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-'));
  const clusters = [{ ...cluster, cid: 'ok' }, { ...cluster, cid: 'bad' }];
  const res = judgeAll(clusters, procs, preserve, { cacheDir: cache, promptFor: (c) => (c.cid === 'bad' ? '@@FAIL@@' : `@@FIXTURE:judge-pass@@ ${c.cid}`) });
  assert.equal(res.find((v) => v.cid === 'ok').passed, true);
  assert.equal(res.find((v) => v.cid === 'bad').judgeStatus, 'failed');
});
