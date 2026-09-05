import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCardPrompt, validateTargets, emitCards, renderImprovementsModule } from '../emit-cards.mjs';
import { loadLaws } from '../../verify-basis.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.COMPARE_CLAUDE_BIN = path.join(here, 'fake-claude.mjs');
const laws = loadLaws(path.join(here, 'fixtures/laws'));

const procs = [
  { pid: 'M1:eia:P02', ms: 'M1', institution: 'eia', nodeId: 'P02', name: '협의 검토', action: 'a', actorRaw: '환경부', legal: [{ law: '환경영향평가법', article: '제29조제1항', text: 't' }] },
  { pid: 'M2:tra:P01', ms: 'M2', institution: 'tra', nodeId: 'P01', name: '교통영향평가서 제출', action: 'b', actorRaw: '사업시행자', legal: [{ law: '도시교통정비 촉진법', article: '제16조제1항', text: 't' }] },
];
const nodeIdOf = (pid) => pid.replace(/:/g, '_');
const verdict = { cid: 'A-traffic-01', axis: 'same-subject', key: 'traffic', pids: procs.map((p) => p.pid), passed: true, allowedKinds: ['merge', 'automate', 'shorten'],
  pairs: [{ a: 'M1:eia:P02', b: 'M2:tra:P01', verdict: 'partial', mergeable: true, reason: '같은 교통량', blockingArticle: null }], preserveHits: [] };

test('prompt states allowed kinds, the pair reasons and the "소관 ≠ 수행기관" rule', () => {
  const p = buildCardPrompt(verdict, procs);
  assert.match(p, /merge\|automate\|shorten/); assert.match(p, /같은 교통량/); assert.match(p, /소관/);
});

test('validateTargets keeps targets found in cluster legal or in law snapshots, rejects the rest', () => {
  const t = ['기후에너지환경부 — 환경영향평가법 제29조제1항', '국토교통부 — 도시교통정비 촉진법 제16조제1항', '국토교통부 — 도시교통정비 촉진법 제99조', '형식이 이상함'];
  const r = validateTargets(t, procs, laws);
  assert.deepEqual(r.ok, t.slice(0, 2));
  assert.equal(r.rejected.length, 2);
  assert.match(r.rejected[0].why, /스냅샷 없음|없음/);
});

test('emitCards builds improvements with sequential ids and case-data node ids, drops cards with no valid target or disallowed kind', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-'));
  const v2 = { ...verdict, cid: 'C-x-01', allowedKinds: ['shorten'] }; // card-ok.json says merge → disallowed
  const res = emitCards([verdict, v2], procs, laws, { cacheDir: cache, nodeIdOf, promptFor: (v) => `@@FIXTURE:card-ok@@ ${v.cid}` });
  assert.equal(res.improvements.length, 1);
  const c = res.improvements[0];
  assert.equal(c.id, 'I1'); assert.equal(c.kind, 'merge');
  assert.deepEqual(c.nodes, ['M1_eia_P02', 'M2_tra_P01']);
  assert.deepEqual(c.targets, ['기후에너지환경부 — 환경영향평가법 제29조제1항', '국토교통부 — 도시교통정비 촉진법 제16조제1항']);
  assert.equal(res.rejected.length, 1); assert.match(res.rejected[0].why, /kind merge not allowed/);
});

test('renderImprovementsModule emits a valid ESM module', async () => {
  const src = renderImprovementsModule([{ id: 'I1', kind: 'merge', nodes: ['A'], pids: ['a'], title: 't', why: 'w', lever: 'l', targets: ['x — y 제1조'] }]);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'im-')), 'improvements.mjs');
  fs.writeFileSync(f, src);
  const mod = await import('file://' + f);
  assert.equal(mod.improvements[0].id, 'I1');
});
