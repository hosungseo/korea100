import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNarrowPrompt, applyNarrow, normalizeRef } from '../narrow-tier.mjs';

const card = { id: 'I1', kind: 'merge', title: '협의 한 시계', why: '두 번 협의한다', lever: '협의 기한을 시행령에 통일' };
const cands = [
  { target: '환경부 — 환경영향평가법 제27조제3항', law: '환경영향평가법', article: '제27조제3항', clause: '③ 협의 요청시기 및 제출방법 등은 대통령령으로 정한다.', delegates: ['대통령령'],
    items: [{ ref: '환경영향평가법 시행령 제43조', tier: '대통령령', title: '협의 요청시기', text: '법 제27조제3항에 따른 협의 요청시기는…' },
            { ref: '환경영향평가법 시행규칙 제5조', tier: '부령', title: '서식', text: '별지 제1호서식' }] },
  { target: '국가유산청 — 매장유산법 제12조제2항', law: '매장유산법', article: '제12조제2항', clause: '② 발굴 허가를 받아야 한다.', delegates: [], items: [] },
];

test('prompt shows the delegating clause, the candidate articles and the no-invention rule', () => {
  const p = buildNarrowPrompt(card, cands);
  assert.match(p, /협의 요청시기 및 제출방법 등은 대통령령으로 정한다/);
  assert.match(p, /후보 1-1: 환경영향평가법 시행령 제43조/);
  assert.match(p, /후보 목록에 없는 조문은 절대 쓰지 않는다/);
  assert.match(p, /\[대상 2\].*위임 문구 없음/s);
});

test('applyNarrow accepts an in-scope candidate and lowers the tier', () => {
  const r = applyNarrow(card, cands, { targets: [
    { index: 1, inScope: true, article: '환경영향평가법 시행령 제43조', reason: '요청시기 위임 안' },
    { index: 2, inScope: false, article: null, reason: '법률이 직접 정한 허가 요건' }] });
  assert.equal(r.targets[0].tier, '대통령령');
  assert.equal(r.targets[1].inScope, false);
  assert.equal(r.needsStatute, true, '한 대상이 법률 사항이면 법률 개정 필요');
  assert.equal(r.requiredTier, '법률', '구속 층위 = 대상 중 가장 높은 것');
});

test('a card whose every target is in scope drops to the subordinate tier', () => {
  const only = [cands[0]];
  const r = applyNarrow(card, only, { targets: [{ index: 1, inScope: true, article: '환경영향평가법 시행령 제43조', reason: 'r' }] });
  assert.equal(r.requiredTier, '대통령령');
  assert.equal(r.needsStatute, false);
});

test('normalizeRef strips the tier parenthetical and the title quotes the model copies along', () => {
  assert.equal(normalizeRef('환경영향평가법 시행령 제47조 (대통령령) 「제출방법 및 협의 요청시기 등」'), '환경영향평가법 시행령 제47조');
  assert.equal(normalizeRef('산지관리법 시행령 제20조의2'), '산지관리법 시행령 제20조의2');
  assert.equal(normalizeRef('환경영향평가법 시행령 제43조'), '환경영향평가법 시행령 제43조');
});

test('a candidate quoted with its tier and title is accepted, not discarded', () => {
  const r = applyNarrow(card, cands, { targets: [{ index: 1, inScope: true, article: '환경영향평가법 시행령 제43조 (대통령령) 「협의 요청시기」', reason: 'r' }] });
  assert.equal(r.targets[0].inScope, true);
  assert.equal(r.targets[0].article, '환경영향평가법 시행령 제43조');
});

test('applyNarrow discards an article outside the candidate list instead of trusting it', () => {
  const r = applyNarrow(card, cands, { targets: [{ index: 1, inScope: true, article: '환경영향평가법 시행령 제999조', reason: '지어냄' }] });
  assert.equal(r.targets[0].inScope, false);
  assert.match(r.targets[0].reason, /후보 밖/);
});

test('a target with no verdict is treated as statute-level, not silently dropped', () => {
  const r = applyNarrow(card, cands, { targets: [] });
  assert.equal(r.targets.length, 2);
  assert.ok(r.targets.every((t) => !t.inScope));
  assert.deepEqual(r.targets.map((t) => t.reason), ['판정 없음', '판정 없음']);
});

test('out-of-range index is ignored', () => {
  const r = applyNarrow(card, cands, { targets: [{ index: 9, inScope: true, article: 'x' }] });
  assert.ok(r.targets.every((t) => !t.inScope));
});
