import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSameSubject, matchOrgRoundtrip, scoreCluster, matchAll, mergeOverlapping } from '../match.mjs';

const P = (pid, ms, msOrder, law, onCritical = false, name = pid) => ({ pid, ms, msOrder, name, onCritical, legal: [{ law, article: '제1조' }] });
const C = (pid, subjects, org, act, orgKind = 'org', extractStatus = 'ok') => ({ pid, subjects, org, act, orgKind, extractStatus });

const procs = [
  P('M1:eia:P02', 'M1', 0, '환경영향평가법', true), P('M2:tra:P01', 'M2', 1, '도시교통정비 촉진법', true),
  P('M2:tra:P03', 'M2', 1, '도시교통정비 촉진법', true), P('M1:eia:P03', 'M1', 0, '환경영향평가법', true),
  P('M9:air:P01', 'M9', 2, '군공항 이전 및 지원에 관한 특별법'), P('M9:air:P02', 'M9', 2, '군공항 이전 및 지원에 관한 특별법'),
];
const cards = {
  'M1:eia:P02': C('M1:eia:P02', ['traffic', 'air'], 'moef-climate', 'consult'),
  'M2:tra:P01': C('M2:tra:P01', ['traffic'], 'applicant', 'apply', 'applicant'),
  'M2:tra:P03': C('M2:tra:P03', ['air'], 'moef-climate', 'consult'),
  'M1:eia:P03': C('M1:eia:P03', ['air'], 'moef-climate', 'supplement'),
  'M9:air:P01': C('M9:air:P01', ['other:주민투표'], 'gwangju', 'deliberate'),
  'M9:air:P02': C('M9:air:P02', [], 'mnd', 'resolve'),
};

test('same-subject groups a subject examined under different laws, not the same law', () => {
  const cl = matchSameSubject(cards, procs);
  const traffic = cl.find((c) => c.key === 'traffic');
  assert.deepEqual(traffic.pids.sort(), ['M1:eia:P02', 'M2:tra:P01']);
  const air = cl.find((c) => c.key === 'air');
  assert.deepEqual(air.pids.sort(), ['M1:eia:P02', 'M1:eia:P03', 'M2:tra:P03']);
  assert.ok(!cl.find((c) => c.key === 'other:주민투표'), 'single-law subject must not form a cluster');
});

test('org-roundtrip groups consult/deliberate acts of a real org within adjacent milestones', () => {
  const cl = matchOrgRoundtrip(cards, procs);
  assert.equal(cl.length, 1);
  assert.equal(cl[0].key, 'moef-climate@M1');
  assert.deepEqual(cl[0].pids.sort(), ['M1:eia:P02', 'M2:tra:P03']); // P03 supplement is not consult
});

test('failed cards and non-org kinds are excluded', () => {
  const c2 = { ...cards, 'M1:eia:P02': { ...cards['M1:eia:P02'], extractStatus: 'failed' } };
  assert.equal(matchOrgRoundtrip(c2, procs).length, 0);
});

test('scoreCluster counts procs, distinct laws, milestones and critical procs', () => {
  assert.deepEqual(scoreCluster(['M1:eia:P02', 'M2:tra:P01'], procs), { procs: 2, laws: 2, milestones: 2, critical: 2 });
});

test('matchAll assigns cids, sorts by critical/laws/procs and keeps the airport out', () => {
  const all = matchAll(cards, procs);
  assert.ok(all.every((c) => !c.pids.some((p) => p.startsWith('M9:'))));
  assert.match(all[0].cid, /^[AC]-/);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].score.critical >= all[i].score.critical);
});

test('mergeOverlapping unions same-subject clusters sharing >= half their procedures, transitively, and leaves C-axis alone', () => {
  const cl = [
    { axis: 'same-subject', key: 'air', pids: ['a', 'b', 'c', 'd'] },
    { axis: 'same-subject', key: 'noise', pids: ['a', 'b', 'c', 'e'] },      // J(air,noise)=3/5=0.6
    { axis: 'same-subject', key: 'water', pids: ['a', 'b', 'e', 'f'] },      // J(noise,water)=3/5=0.6, J(air,water)=2/6
    { axis: 'same-subject', key: 'traffic', pids: ['a', 'x', 'y', 'z'] },    // J with any <= 1/7
    { axis: 'org-roundtrip', key: 'moef@M1', pids: ['a', 'b', 'c', 'd'] },  // identical pids but C axis → untouched
  ];
  const out = mergeOverlapping(cl);
  const m = out.find((c) => c.key === 'air+noise+water');
  assert.ok(m, 'transitive merge');
  assert.deepEqual([...m.pids].sort(), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(m.mergedFrom, ['air', 'noise', 'water']);
  assert.ok(out.find((c) => c.key === 'traffic'));
  assert.ok(out.find((c) => c.axis === 'org-roundtrip'));
  assert.equal(out.length, 3);
});

test('matchAll cids for merged clusters carry the joined key', () => {
  const procs2 = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ pid: id, ms: 'M', msOrder: 0, name: id, onCritical: false, legal: [{ law: i % 2 ? 'X법' : 'Y법', article: '제1조' }] }));
  const cards2 = Object.fromEntries(procs2.map((p) => [p.pid, { pid: p.pid, subjects: ['air', 'noise'], org: 'applicant', act: 'apply', orgKind: 'applicant', extractStatus: 'ok' }]));
  const all = matchAll(cards2, procs2);
  assert.equal(all.length, 1);
  assert.equal(all[0].cid, 'A-air-noise-01');
  assert.equal(all[0].pids.length, 5);
});
