import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProcedures } from '../load.mjs';

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const opts = { projectFile: path.join(FX, 'project.json'), pathFile: path.join(FX, 'path.json'), institutionsDir: path.join(FX, 'institutions') };

test('flattens milestones × institutions × nodes, honouring nodeIds', () => {
  const procs = loadProcedures({ ...opts, milestones: ['M1', 'M2', 'M9'] });
  assert.equal(procs.length, 3 + 3 + 2);
  assert.ok(!procs.some((p) => p.nodeId === 'P04'), 'P04 is outside nodeIds and must not be loaded');
});

test('pid, ids and legal are copied verbatim', () => {
  const [p] = loadProcedures({ ...opts, milestones: ['M2'] });
  assert.equal(p.pid, 'M2:traffic-mini:P01');
  assert.equal(p.ms, 'M2'); assert.equal(p.institution, 'traffic-mini'); assert.equal(p.nodeId, 'P01');
  assert.deepEqual(p.legal, [{ law: '도시교통정비 촉진법', article: '제16조제1항', text: '교통영향평가를 실시하여야 한다.' }]);
  assert.equal(p.actorRaw, '사업시행자');
  assert.deepEqual(p.outputs, ['교통영향평가서']);
  assert.equal(p.deadlineRaw, null);
});

test('gateIndex, msOrder and onCritical come from stages and path.json', () => {
  const procs = loadProcedures({ ...opts, milestones: ['M1', 'M2', 'M9'] });
  const by = (ms) => procs.find((p) => p.ms === ms);
  assert.equal(by('M1').gateIndex, 1); assert.equal(by('M9').gateIndex, 2);
  assert.equal(by('M1').onCritical, true); assert.equal(by('M9').onCritical, false);
  // msOrder: eta start asc → M1(0), M9(0) tie → id order M1 < M9; M2(100)
  assert.equal(by('M1').msOrder, 0); assert.equal(by('M9').msOrder, 1); assert.equal(by('M2').msOrder, 2);
});

test('milestones filter defaults to all and unknown ids throw', () => {
  assert.equal(loadProcedures(opts).length, 8);
  assert.throws(() => loadProcedures({ ...opts, milestones: ['NOPE'] }), /unknown milestone NOPE/);
});

test('institutions option loads a standalone institution as pseudo-milestone', () => {
  const procs = loadProcedures({ ...opts, institutions: ['traffic-mini'] });
  assert.equal(procs.length, 4);
  assert.equal(procs[0].ms, 'INST:traffic-mini');
  assert.equal(procs[0].onCritical, false);
});
