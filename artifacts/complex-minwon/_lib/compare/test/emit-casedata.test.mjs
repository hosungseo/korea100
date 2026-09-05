import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCaseData, renderCaseDataModule } from '../emit-casedata.mjs';
import { loadProcedures } from '../load.mjs';
import { loadOrgs } from '../lib/normalize.mjs';

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const opts = { projectFile: path.join(FX, 'project.json'), pathFile: path.join(FX, 'path.json'), institutionsDir: path.join(FX, 'institutions') };
const procs = loadProcedures({ ...opts, milestones: ['M1', 'M2'] });
const card = (pid, org, orgLabel, orgKind) => ({ pid, org, orgLabel, orgKind, act: 'consult', subjects: [], extractStatus: 'ok' });
const cards = Object.fromEntries(procs.map((p) => [p.pid, /환경부/.test(p.actorRaw) ? card(p.pid, 'moef-climate', '기후에너지환경부', 'org') : /위원회/.test(p.actorRaw) ? card(p.pid, 'cmte-traffic', '교통영향평가심의위원회', 'org') : card(p.pid, 'applicant', '신청인·사업시행자', 'applicant')]));
const improvements = [{ id: 'I1', kind: 'merge', nodes: ['M1_0_P02', 'M2_1_P01'], pids: ['M1:eia-mini:P02', 'M2:traffic-mini:P01'], title: 't', why: 'w', lever: 'l', targets: ['x — 환경영향평가법 제29조제1항'] }];

const cd = buildCaseData({ procs, cards, improvements, project: JSON.parse(fs.readFileSync(path.join(FX, 'project.json'), 'utf8')), orgs: loadOrgs(), meta: { slug: 'fx', checkedAt: '2026-09-05' }, institutionsDir: path.join(FX, 'institutions') });

test('lanes: applicant first, committees last, every node lane/gate exists', () => {
  assert.equal(cd.lanes[0].name, '신청인·사업시행자');
  assert.equal(cd.lanes[cd.lanes.length - 1].name, '교통영향평가심의위원회');
  for (const n of cd.nodes) { assert.ok(cd.lanes.find((l) => l.id === n.lane), n.id); assert.ok(cd.gates.find((g) => g.id === n.gate), n.id); assert.ok(n.org); }
});

test('gates follow msOrder and node ids use ms_instIndex_nodeId', () => {
  assert.deepEqual(cd.gates.map((g) => g.id), ['M1', 'M2']);
  assert.ok(cd.nodes.find((n) => n.id === 'M1_0_P02'));
  assert.ok(cd.nodes.find((n) => n.id === 'M2_1_P01'));
  assert.equal(cd.nodes.find((n) => n.id === 'M1_0_P02').kind, 'rule');
  assert.deepEqual(cd.nodes.find((n) => n.id === 'M1_0_P02').basis, ['환경영향평가법 제29조제1항']);
});

test('edges: institution edges mapped by type, plus one seq edge per hard milestone dependency; all endpoints exist', () => {
  const ids = new Set(cd.nodes.map((n) => n.id));
  for (const [a, b] of cd.edges) { assert.ok(ids.has(a), a); assert.ok(ids.has(b), b); }
  assert.ok(cd.edges.some(([a, b, k]) => a === 'M1_0_P01' && b === 'M1_0_P02' && k === 'seq'));
  assert.ok(cd.edges.some(([a, b, k]) => a === 'M1_0_P02' && b === 'M1_0_P03' && k === 'opt'));
  assert.ok(cd.edges.some(([a, b, k]) => a === 'M1_0_P03' && b === 'M2_1_P01' && k === 'seq'), 'M1 last → M2 first');
  assert.ok(!cd.edges.some(([, b]) => b.endsWith('_P04')), 'edge to unloaded P04 dropped');
});

test('improvements pass through and reference existing nodes; module renders and imports', async () => {
  assert.equal(cd.improvements[0].id, 'I1');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cd-')), 'case-data.mjs');
  fs.writeFileSync(f, renderCaseDataModule(cd));
  const mod = await import('file://' + f);
  assert.equal(mod.nodes.length, cd.nodes.length); assert.equal(mod.meta.slug, 'fx'); assert.deepEqual(mod.groups, {});
});
