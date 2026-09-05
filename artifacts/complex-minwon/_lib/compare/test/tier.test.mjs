import test from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, delegationsIn, articleText, articleKeyOf, paraNoOf, scopedText, findImplementing, classifyTarget, classifyCard } from '../lib/tier.mjs';

const statute = { articles: [
  { no: '27', branch: '', title: '협의 요청', body: '제27조(협의 요청)', paras: [
    { no: '①', body: '① 승인기관장등은 협의를 요청하여야 한다.', hos: [] },
    { no: '③', body: '③ 작성방법, 협의 요청시기 및 제출방법 등은 대통령령으로 정한다.', hos: [] } ] },
  { no: '18', branch: '2', title: '타당성조사', body: '제18조의2(타당성조사)', paras: [
    { no: '①', body: '① 조사의 방법은 농림축산식품부령으로 정한다.', hos: [] } ] },
  { no: '11', branch: '', title: '평가항목', body: '제11조(평가항목)', paras: [
    { no: '①', body: '① 승인기관장등은 평가항목을 정하여야 한다.', hos: [] } ] },
] };
const decree = { articles: [
  { no: '43', branch: '', title: '협의 요청시기', body: '제43조(협의 요청시기)', paras: [{ no: '①', body: '① 법 제27조제3항에 따른 협의 요청시기는 다음과 같다.', hos: [] }] },
  { no: '9', branch: '', title: '심의기간', body: '제9조(심의기간)', paras: [{ no: '①', body: '① 법 제11조에 따른 심의기간은 10일로 한다.', hos: [] }] },
  { no: '99', branch: '', title: '무관', body: '제99조(무관)', paras: [{ no: '①', body: '① 법 제110조와 관련 없다.', hos: [] }] },
] };
const rule = { articles: [ { no: '5', branch: '', title: '서식', body: '제5조(서식)', paras: [{ no: '①', body: '① 법 제27조에 따른 신청서는 별지 제1호서식에 따른다.', hos: [] }] } ] };
const laws = new Map([['환경영향평가법', statute], ['환경영향평가법 시행령', decree], ['환경영향평가법 시행규칙', rule]]);

test('tierOf reads the instrument tier from the law name', () => {
  assert.equal(tierOf('환경영향평가법'), '법률');
  assert.equal(tierOf('환경영향평가법 시행령'), '대통령령');
  assert.equal(tierOf('환경영향평가법 시행규칙'), '부령');
  assert.equal(tierOf('산업입지의 개발에 관한 통합지침'), '행정규칙');
  assert.equal(tierOf('광주광역시 도시계획 조례'), '자치법규');
});

test('delegationsIn finds downward delegation phrases, and only real ones', () => {
  assert.deepEqual(delegationsIn('제출방법 등은 대통령령으로 정한다.'), ['대통령령']);
  assert.deepEqual(delegationsIn('조사의 방법은 농림축산식품부령으로 정한다.'), ['부령']);
  assert.deepEqual(delegationsIn('총리령으로 정하는 바에 따라 한다.'), ['부령']);
  assert.deepEqual(delegationsIn('승인기관장등은 협의를 요청하여야 한다.'), []);
});

test('articleText joins body, paragraphs and items', () => {
  assert.match(articleText(statute.articles[0]), /대통령령으로 정한다/);
  assert.equal(articleText(null), '');
});

test('articleKeyOf handles 제N조 and 제N조의M', () => {
  assert.equal(articleKeyOf('제27조제3항'), '27');
  assert.equal(articleKeyOf('제18조의2'), '18의2');
  assert.equal(articleKeyOf('없음'), null);
});

test('paraNoOf and scopedText narrow delegation detection to the cited paragraph', () => {
  assert.equal(paraNoOf('제27조제3항'), 3);
  assert.equal(paraNoOf('제27조'), null);
  assert.match(scopedText(statute.articles[0], '제27조제3항'), /대통령령/);
  assert.doesNotMatch(scopedText(statute.articles[0], '제27조제1항'), /대통령령/);
  assert.match(scopedText(statute.articles[0], '제27조'), /대통령령/, 'no paragraph cited → whole article');
});

test('findImplementing returns only subordinate articles citing that statute article', () => {
  const r = findImplementing(laws, '환경영향평가법', '27');
  assert.deepEqual(r.map((x) => `${x.law} ${x.article}`), ['환경영향평가법 시행령 제43조', '환경영향평가법 시행규칙 제5조']);
  assert.deepEqual(findImplementing(laws, '환경영향평가법', '11').map((x) => x.article), ['제9조']);
  assert.deepEqual(findImplementing(laws, '환경영향평가법 시행령', '43'), [], 'only statutes have implementing articles');
});

test('classifyTarget reports tier, delegation and implementing provisions', () => {
  const t = classifyTarget(laws, '기후에너지환경부 — 환경영향평가법 제27조제3항');
  assert.equal(t.tier, '법률'); assert.equal(t.snapshot, true);
  assert.deepEqual(t.delegates, ['대통령령']);
  assert.deepEqual(t.implementing.map((x) => x.article), ['제43조'], '제3항을 지목한 하위 조문만');
  assert.equal(t.implementingArticleLevel, 2, '조 단위로는 시행규칙까지 2건');
  const bad = classifyTarget(laws, '형식이상함');
  assert.equal(bad.ok, false);
});

test('classifyCard: a card whose statute article delegates downward can be done below the statute', () => {
  const c = classifyCard(laws, { id: 'I1', kind: 'merge', title: 't', targets: ['환경부 — 환경영향평가법 제27조제3항'] });
  assert.equal(c.requiredTier, '대통령령'); // 제3항이 위임한 곳까지
  assert.equal(c.needsStatute, false);
  assert.equal(c.statuteOnly, false);
});

test('classifyCard: a card resting on a pure statutory duty needs a statute amendment', () => {
  const c = classifyCard(laws, { id: 'I2', kind: 'merge', title: 't', targets: ['환경부 — 환경영향평가법 제27조제1항'] });
  assert.equal(c.needsStatute, true);
  assert.equal(c.requiredTier, '법률');
});
