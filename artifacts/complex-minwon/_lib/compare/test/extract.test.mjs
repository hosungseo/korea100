import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExtractPrompt, validateCard, extractAll } from '../extract.mjs';
import { loadOrgs } from '../lib/normalize.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.COMPARE_CLAUDE_BIN = path.join(here, 'fake-claude.mjs');

const proc = { pid: 'M1:eia-mini:P02', name: '협의 검토·의견 통보', action: '환경부장관은 평가서를 검토해 협의 의견을 통보한다.', actorRaw: '기후에너지환경부장관',
  type: 'task', outputs: ['협의 의견'], deadlineRaw: '45일',
  legal: [{ law: '환경영향평가법', article: '제29조제1항', text: '협의 의견을 통보하여야 한다.' }] };
const subjects = { traffic: '교통', air: '대기질' };

test('prompt carries the procedure, the subject taxonomy and the copy-only rule', () => {
  const p = buildExtractPrompt(proc, subjects);
  assert.match(p, /제29조제1항/); assert.match(p, /traffic/); assert.match(p, /새로 만들지|복사/);
  assert.match(p, /JSON만/);
});

test('validateCard accepts a card whose evidence is a subset of legal and normalises enums', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/claude/extract-ok.json'), 'utf8'));
  const { card, errors } = validateCard(raw, proc, subjects, loadOrgs());
  assert.deepEqual(errors, []);
  assert.equal(card.org, 'moef-climate'); assert.equal(card.orgKind, 'org');
  assert.deepEqual(card.subjects, ['traffic', 'air', 'other:도로점용']);
  assert.deepEqual(card.otherSubjects, ['도로점용']);
  assert.equal(card.extractStatus, 'ok');
});

test('validateCard rejects evidence not present in the procedure', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/claude/extract-bad-evidence.json'), 'utf8'));
  const { errors } = validateCard(raw, proc, subjects, loadOrgs());
  assert.ok(errors.some((e) => /evidence/.test(e)));
});

test('validateCard rejects bad enums and unknown subjects', () => {
  const raw = { orgRole: 'boss', act: 'consult', subjects: ['banana'], deemed: { is: false, basis: null }, clock: { days: null, basis: null, silentEffect: false }, evidence: [] };
  const { errors } = validateCard(raw, proc, subjects, loadOrgs());
  assert.ok(errors.some((e) => /orgRole/.test(e)));
  assert.ok(errors.some((e) => /subject banana/.test(e)));
});

test('extractAll writes ok cards, marks failures, and collects unknown orgs / other subjects', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-'));
  const procs = [
    { ...proc, pid: 'A', _fixture: 'extract-ok' },
    { ...proc, pid: 'B', actorRaw: '이상한기관', _fixture: 'extract-ok' },
    { ...proc, pid: 'C', _fixture: 'FAIL' },
  ];
  const res = extractAll(procs, { subjects, orgs: loadOrgs(), cacheDir: cache,
    promptFor: (p) => (p._fixture === 'FAIL' ? '@@FAIL@@' : `@@FIXTURE:${p._fixture}@@ ${p.pid}`) });
  assert.equal(res.cards.A.extractStatus, 'ok');
  assert.equal(res.cards.C.extractStatus, 'failed');
  assert.deepEqual(res.unknownOrgs, ['이상한기관']);
  assert.deepEqual(res.otherSubjects, [{ label: '도로점용', pids: ['A', 'B'] }]);
});
