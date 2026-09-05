import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrices, renderReview } from '../emit-review.mjs';

const procs = [
  { pid: 'M1:eia:P02', ms: 'M1', msName: '환평', msOrder: 0, onCritical: true, name: '협의 검토', legal: [{ law: '환경영향평가법', article: '제29조제1항' }], institution: 'eia' },
  { pid: 'M2:tra:P01', ms: 'M2', msName: '교통', msOrder: 1, onCritical: true, name: '평가서 제출', legal: [{ law: '도시교통정비 촉진법', article: '제16조제1항' }], institution: 'tra' },
  { pid: 'M2:tra:P03', ms: 'M2', msName: '교통', msOrder: 1, onCritical: true, name: '대기 재협의', legal: [{ law: '도시교통정비 촉진법', article: '제18조' }], institution: 'tra' },
];
const cards = {
  'M1:eia:P02': { pid: 'M1:eia:P02', subjects: ['traffic', 'air'], org: 'moef-climate', orgLabel: '기후에너지환경부', orgKind: 'org', act: 'consult', clock: { days: 45 }, extractStatus: 'ok' },
  'M2:tra:P01': { pid: 'M2:tra:P01', subjects: ['traffic'], org: 'applicant', orgLabel: '신청인', orgKind: 'applicant', act: 'apply', clock: { days: null }, extractStatus: 'ok' },
  'M2:tra:P03': { pid: 'M2:tra:P03', subjects: ['air'], org: 'moef-climate', orgLabel: '기후에너지환경부', orgKind: 'org', act: 'consult', clock: { days: null }, extractStatus: 'ok' },
};
const verdicts = [{ cid: 'A-traffic-01', axis: 'same-subject', key: 'traffic', pids: ['M1:eia:P02', 'M2:tra:P01'], passed: true, pairs: [{ a: 'M1:eia:P02', b: 'M2:tra:P01', verdict: 'partial', mergeable: true, reason: '같은 교통량' }] }];
const improvements = [{ id: 'I1', cid: 'A-traffic-01', kind: 'merge', title: '교통량 한 번', pids: ['M1:eia:P02', 'M2:tra:P01'] }];
const subjects = { traffic: '교통', air: '대기질' };

test('A matrix: rows = subjects, cols = laws, cell lists pids; passed cluster is flagged', () => {
  const { A } = buildMatrices({ procs, cards, verdicts, subjects });
  assert.deepEqual(A.cols, ['환경영향평가법', '도시교통정비 촉진법']);
  const row = A.rows.find((r) => r.key === 'traffic');
  assert.deepEqual(row.cells['환경영향평가법'].pids, ['M1:eia:P02']);
  assert.equal(row.cells['도시교통정비 촉진법'].pids.length, 1);
  assert.equal(row.passedCid, 'A-traffic-01');
});

test('C matrix: rows = real orgs only, cols = milestones in msOrder, cell = consult/deliberate count', () => {
  const { C } = buildMatrices({ procs, cards, verdicts, subjects });
  assert.deepEqual(C.cols.map((c) => c.ms), ['M1', 'M2']);
  assert.deepEqual(C.rows.map((r) => r.org), ['moef-climate']);
  assert.equal(C.rows[0].cells.M1.count, 1); assert.equal(C.rows[0].cells.M2.count, 1);
  assert.equal(C.cols[0].critical, true);
});

test('renderReview produces a self-contained page with both tables, cluster list and the click panel data', () => {
  const html = renderReview({ procs, cards, verdicts, improvements, subjects, meta: { title: '테스트', asOf: '2026-09-05' } });
  assert.match(html, /<table id="matA"/); assert.match(html, /<table id="matB"/);
  assert.match(html, /A-traffic-01/); assert.match(html, /I1/);
  assert.match(html, /const DATA = \{/); assert.match(html, /제29조제1항/);
  assert.ok(!/<script src=/.test(html), 'no external scripts');
});
