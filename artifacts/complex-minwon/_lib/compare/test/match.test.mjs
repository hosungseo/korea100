import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSameSubject, matchOrgRoundtrip, scoreCluster, matchAll } from '../match.mjs';

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
