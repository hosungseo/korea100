import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrg, loadOrgs, preserveHit, loadPreserve } from '../lib/normalize.mjs';

const orgs = loadOrgs();

test('alias resolves to org code and label', () => {
  assert.deepEqual(normalizeOrg('기후에너지환경부장관', orgs), { org: 'moef-climate', label: '기후에너지환경부', kind: 'org', also: [], unknown: false });
});

test('role names stay roles, never guessed into a ministry', () => {
  const r = normalizeOrg('산업단지 지정권자', orgs);
  assert.equal(r.kind, 'role'); assert.equal(r.org, 'designator'); assert.equal(r.unknown, false);
});

test('applicants map to applicant kind', () => {
  assert.equal(normalizeOrg('사업시행자', orgs).kind, 'applicant');
  assert.equal(normalizeOrg('사업시행자', orgs).org, 'applicant');
});

test('compound actor takes the first resolvable part and records the rest', () => {
  const r = normalizeOrg('기후에너지환경부·광주특별시', orgs); // exact alias exists → gwangju bucket wins
  assert.equal(r.unknown, false);
  const r2 = normalizeOrg('산림청·전문기관', orgs); // no exact alias; split on ·
  assert.equal(r2.org, 'kfs'); assert.deepEqual(r2.also, ['전문기관']);
});

test('unknown strings are kept verbatim and flagged', () => {
  const r = normalizeOrg('아무기관', orgs);
  assert.deepEqual(r, { org: '아무기관', label: '아무기관', kind: 'unknown', also: [], unknown: true });
});

test('preserveHit matches by name pattern and law', () => {
  const pv = loadPreserve();
  const hit = preserveHit({ name: '환경영향평가 본안 검토·협의 완료', legal: [{ law: '환경영향평가법', article: '제29조' }] }, pv);
  assert.equal(hit?.id, 'eia-main');
  assert.equal(preserveHit({ name: '주민투표', legal: [{ law: '농지법', article: '제1조' }] }, pv), null);
});
