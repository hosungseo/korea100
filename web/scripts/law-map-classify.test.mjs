import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyArticle, classifyStage, classifyActor, firstSentence, findSubject, findNominativeSubject,
  STAGES, ACTORS, STAGE_TITLE_CUES, ACTOR_CUES,
} from "./lib/law-map-classify.mjs";

function check(result, { stage, actor, minConfidence = 0, method }) {
  if (stage) assert.equal(result.stage, stage, `stage: ${JSON.stringify(result)}`);
  if (actor) assert.equal(result.actor, actor, `actor: ${JSON.stringify(result)}`);
  assert.ok(result.confidence >= minConfidence, `confidence ${result.confidence} < ${minConfidence}: ${JSON.stringify(result)}`);
  if (method) assert.equal(result.method, method);
  assert.ok(STAGES.includes(result.stage) && ACTORS.includes(result.actor));
  assert.ok(Array.isArray(result.evidence));
}

// ── 단계(stage) 하나씩 ─────────────────────────────────────────────

test("purpose: 목적 조문 → purpose × none, 장과 제목이 같은 쪽이면 단계 신뢰도 0.9", () => {
  const r = classifyArticle({ label: "제1조", title: "목적", chapter: "제1장 총칙", text: "이 법은 건축물의 대지ㆍ구조ㆍ설비 기준 및 용도 등을 정하여 공공복리의 증진에 이바지하는 것을 목적으로 한다." });
  check(r, { stage: "purpose", actor: "none", minConfidence: 0.8, method: "rule:title" });
  assert.equal(r.stageConfidence, 0.9);
  assert.ok(r.evidence.includes("stage/title:목적") && r.evidence.includes("stage/chapter:제1장 총칙"));
});

test("purpose: '정의'는 낱말 단위로만 — '건축협정의 관리'에는 걸리지 않는다", () => {
  assert.equal(classifyStage({ title: "정의", text: "① 이 법에서 사용하는 용어의 뜻은 다음과 같다." }).stage, "purpose");
  const r = classifyStage({ title: "건축협정의 관리", chapter: "제8장의2 건축협정", text: "건축협정인가권자는 건축협정을 인가하였을 때에는 건축협정 관리대장을 작성하여 관리하여야 한다." });
  assert.notEqual(r.stage, "purpose");
  assert.ok(!r.evidence.some((e) => e.includes("정의")));
});

test("standard: 제목 '…의 조경' + 건축주 주어 → standard × citizen 0.8", () => {
  const r = classifyArticle({ title: "대지의 조경", chapter: "제4장 건축물의 대지와 도로", text: "① 면적이 200제곱미터 이상인 대지에 건축을 하는 건축주는 용도지역 및 건축물의 규모에 따라 해당 지방자치단체의 조례로 정하는 바에 따라 대지에 조경이나 그 밖에 필요한 조치를 하여야 한다." });
  check(r, { stage: "standard", actor: "citizen", minConfidence: 0.8 });
  assert.ok(r.evidence.includes("actor/subject:건축주는"), "'건축을 하는'의 '하는'을 주어로 잡으면 안 된다");
  assert.ok(r.evidence.includes("actor/also:local(지방자치단체)"), "다른 주체는 근거에 남긴다");
});

test("procedure: 건축허가 → procedure, 주어 '…하려는 자는' → citizen, 허가권자는 also로", () => {
  const r = classifyArticle({ title: "건축허가", chapter: "제2장 건축물의 건축", text: "① 건축물을 건축하거나 대수선하려는 자는 특별자치시장ㆍ특별자치도지사 또는 시장ㆍ군수ㆍ구청장의 허가를 받아야 한다. 다만, 21층 이상의 건축물은 시ㆍ도지사의 허가를 받아야 한다.\n② 시장ㆍ군수는 제1항에 따른 건축허가를 하려면 미리 시ㆍ도지사의 승인을 받아야 한다." });
  check(r, { stage: "procedure", actor: "citizen", minConfidence: 0.8, method: "rule:title" });
  assert.ok(r.evidence.some((e) => e.startsWith("actor/also:local")));
  assert.ok(!r.evidence.some((e) => e.startsWith("actor/also:central")), "'구청장'이 '청장'(중앙) 단서에 걸리면 안 된다");
});

test("organization: 위원회 설치 조문 → organization; 주어가 위원회면 committee", () => {
  const r = classifyArticle({ title: "분쟁위원회의 구성", chapter: "제9장 보칙", text: "① 분쟁위원회는 위원장과 부위원장 각 1명을 포함한 15명 이내의 위원으로 구성한다." });
  check(r, { stage: "organization", actor: "committee", minConfidence: 0.8 });
});

test("supervision: 이행강제금 → supervision × local(허가권자), '허가권자는'의 '자는'을 국민으로 오인하지 않는다", () => {
  const r = classifyArticle({ title: "이행강제금", chapter: "제9장 보칙", text: "① 허가권자는 제79조제1항에 따라 시정명령을 받은 후 시정기간 내에 시정명령을 이행하지 아니한 건축주등에 대하여는 이행강제금을 부과한다." });
  check(r, { stage: "supervision", actor: "local", minConfidence: 0.8 });
  assert.ok(!r.evidence.some((e) => e.startsWith("actor/joint:citizen")));
});

test("penalty: 벌칙 → penalty × citizen; 각 호만 있는 조문도 머리 문장이 있으면 '…자는'을 읽는다", () => {
  const r = classifyArticle({ title: "벌칙", chapter: "제10장 벌칙", text: "다음 각 호의 어느 하나에 해당하는 자는 2년 이하의 징역이나 2억원 이하의 벌금에 처한다.\n1. 제27조제2항에 따른 보고를 거짓으로 한 자" });
  check(r, { stage: "penalty", actor: "citizen", minConfidence: 0.8 });
  const fine = classifyArticle({ title: "과태료", chapter: "제10장 벌칙", text: "① 다음 각 호의 어느 하나에 해당하는 자에게는 200만원 이하의 과태료를 부과한다.\n1. 제19조제3항에 따른 변경을 신청하지 아니한 자" });
  check(fine, { stage: "penalty", actor: "citizen", minConfidence: 0.8 });
  assert.ok(fine.evidence.includes("actor/subject:자에게는"));
});

test("penalty: 양벌규정은 주어가 없어도 수범자 추정(0.5)으로 citizen, 근거에 추정임을 적는다", () => {
  const r = classifyArticle({ title: "양벌규정", chapter: "제10장 벌칙", text: "법인의 대표자나 법인 또는 개인의 대리인, 사용인, 그 밖의 종업원이 그 법인 또는 개인의 업무에 관하여 제106조의 위반행위를 하면 그 행위자를 벌하는 외에 그 법인 또는 개인에게도 해당 조문의 벌금형을 과한다." });
  check(r, { stage: "penalty", actor: "citizen" });
  assert.equal(r.actorConfidence, 0.5);
  assert.ok(r.evidence.includes("actor/stage:penalty→citizen(수범자 추정)"));
});

test("misc: 권한의 위임 → misc × central; 긴 단서가 짧은 단서를 품으면 긴 쪽만 남는다", () => {
  const r = classifyArticle({ title: "권한의 위임과 위탁", chapter: "제9장 보칙", text: "① 국토교통부장관은 이 법에 따른 권한의 일부를 대통령령으로 정하는 바에 따라 시ㆍ도지사에게 위임할 수 있다." });
  check(r, { stage: "misc", actor: "central", minConfidence: 0.8 });
  assert.ok(r.evidence.includes("stage/title:권한의 위임") && !r.evidence.includes("stage/title:위임"));
  assert.equal(r.stageConfidence, 0.9, "보칙 장과 일치");
});

// ── 주체(actor) 나머지 ────────────────────────────────────────────

test("court: 법원이 주어면 court", () => {
  const r = classifyActor({ title: "재판의 특례", text: "① 법원은 제1항의 소송이 제기된 경우 분쟁위원회의 재정 내용을 참작하여야 한다." });
  assert.equal(r.actor, "court");
  assert.ok(r.confidence >= 0.8);
});

test("local: 공동 주어(장관, 시ㆍ도지사 및 시장ㆍ군수ㆍ구청장은)는 먼저 적힌 쪽을 고르고 나머지를 joint로 남긴다(0.5)", () => {
  const r = classifyActor({ title: "건축위원회", text: "① 국토교통부장관, 시ㆍ도지사 및 시장ㆍ군수ㆍ구청장은 다음 각 호의 사항을 조사ㆍ심의하기 위하여 각각 건축위원회를 두어야 한다." });
  assert.equal(r.actor, "central");
  assert.equal(r.confidence, 0.5);
  assert.ok(r.evidence.includes("joint:local(시ㆍ도지사)"));
});

test("actor: '…이/가' 주어도 토큰 자체가 주체 명사일 때만 읽는다(건축주가 ○, 허가가 ×)", () => {
  assert.deepEqual(findNominativeSubject("건축주가 허가를 받았거나 신고를 한 건축물의 공사를 완료한 후 사용승인을 신청하여야 한다.")?.actor, "citizen");
  assert.equal(findNominativeSubject("허가가 취소된 경우에는 공사를 중지하여야 한다."), null);
  const r = classifyActor({ title: "건축물의 사용승인", text: "① 건축주가 제11조에 따라 허가를 받은 건축물의 건축공사를 완료한 후 그 건축물을 사용하려면 허가권자에게 사용승인을 신청하여야 한다." });
  assert.equal(r.actor, "citizen");
  assert.equal(r.confidence, 0.7);
});

test("none: 위임 조문('…은 대통령령으로 정한다')은 주체 없음", () => {
  const r = classifyArticle({ title: "건축설비기준 등", chapter: "제7장 건축설비", text: "건축설비의 설치 및 구조에 관한 기준과 설계 및 공사감리에 관하여 필요한 사항은 대통령령으로 정한다." });
  check(r, { stage: "standard", actor: "none", minConfidence: 0.6 });
  assert.ok(r.evidence.includes("actor/text:…으로 정한다(위임 조문)"));
});

// ── 충돌·장 폴백·unknown ──────────────────────────────────────────

test("conflict: 제목이 두 단계에 걸리면 머리말을 1순위로 삼고 본문이 다른 후보를 밀면 그쪽 0.4", () => {
  // 허가(procedure) vs 제한(standard, 머리말) — 본문은 절차 단서가 많다 → procedure 0.4
  const r = classifyStage({ title: "건축허가 제한 등", chapter: "제2장 건축물의 건축", text: "① 국토교통부장관은 국토관리를 위하여 특히 필요하다고 인정하면 허가권자의 건축허가를 제한할 수 있다.\n② 제한하려면 주민의견을 청취한 후 건축위원회의 심의를 거쳐야 한다.\n③ 제한한 경우 즉시 공고하여야 하며, 허가권자에게 통보하여야 한다." });
  assert.equal(r.stage, "procedure");
  assert.equal(r.confidence, 0.4);
  assert.ok(r.evidence.includes("stage:title:제한(머리말)".replace("stage:", "")));
  // 수수료(misc, 머리말) vs 허가 — 본문이 수수료를 지지 → misc 0.5
  const fee = classifyStage({ title: "건축허가 등의 수수료", text: "① 허가를 신청하거나 신고를 하는 자는 허가권자나 신고수리자에게 수수료를 납부하여야 한다. ② 수수료는 국토교통부령으로 정하는 범위에서 조례로 정한다." });
  assert.equal(fee.stage, "misc");
  assert.equal(fee.confidence, 0.5);
});

test("chapter fallback: 제목·본문 단서가 없으면 장 제목으로 0.5, method rule:chapter", () => {
  const r = classifyStage({ title: "통일성을 유지하기 위한 도의 조례", chapter: "제1장 총칙", text: "도 단위로 통일성을 유지할 필요가 있으면 도의 조례로 정하는 바에 따른다." });
  // '조례'는 약한 제목 단서(misc)이므로 먼저 걸린다 → 약한 단서 없는 제목으로 다시 확인
  const r2 = classifyStage({ title: "리모델링에 대비한 지원 등", chapter: "제1장 총칙", text: "리모델링이 쉬운 구조의 공동주택의 건축을 촉진한다." });
  assert.equal(r.method, "rule:title");
  assert.deepEqual([r2.stage, r2.confidence, r2.method], ["purpose", 0.5, "rule:chapter"]);
  assert.deepEqual(r2.evidence, ["chapter:제1장 총칙"]);
});

test("unknown: 단서가 전혀 없으면 unknown, 근거 비움, 신뢰도 0", () => {
  const r = classifyArticle({ title: "특별건축구역의 건축물", chapter: "제8장 특별건축구역 등", text: "특별건축구역에서 건축하는 건축물의 범위는 다음 각 호와 같다." });
  assert.equal(r.stage, "unknown");
  assert.equal(r.stageConfidence, 0);
  assert.equal(r.stageMethod, "unknown");
  const empty = classifyArticle({ title: "", chapter: null, text: "" });
  assert.deepEqual([empty.stage, empty.actor, empty.confidence, empty.method], ["unknown", "unknown", 0, "unknown"]);
});

test("deleted: 삭제 조문은 단계 unknown × 주체 none, deleted 표시, 신뢰도 1", () => {
  const r = classifyArticle({ title: "삭제", chapter: "제3장 건축물의 유지와 관리", text: "삭제 <2019.4.30>" });
  assert.deepEqual([r.stage, r.actor, r.confidence, r.deleted], ["unknown", "none", 1, true]);
});

test("floor: 축별 신뢰도가 0.4 미만이면 그 축은 unknown이 된다", () => {
  const r = classifyArticle({ title: "결합건축 대상지", chapter: "제8장의3 결합건축", text: "다음 각 호의 어느 하나에 해당하는 지역에서 대지간의 최단거리가 100미터 이내인 2개의 대지의 건축주가 서로 합의한 경우 결합건축을 할 수 있다." });
  assert.ok(r.stage === "unknown" ? r.stageConfidence < 0.4 : r.stageConfidence >= 0.4);
  assert.ok(r.actor === "unknown" ? r.actorConfidence < 0.4 : r.actorConfidence >= 0.4);
});

// ── 보조 함수 ────────────────────────────────────────────────────

test("firstSentence/findSubject: 첫 항 첫 문장만 보고, 접속사·관형사형·조사 결합은 주어로 삼지 않는다", () => {
  const s = firstSentence("① 제11조에 해당하는 허가 대상 건축물이라 하더라도 다음 각 호의 어느 하나에 해당하는 경우에는 미리 신고를 하면 건축허가를 받은 것으로 본다. <개정 2014.1.14>\n1. 바닥면적의 합계가 85제곱미터 이내의 증축\n② 제1항에 따른 신고를 한 자는 착공하여야 한다.");
  assert.ok(s.endsWith("받은 것으로 본다."));
  assert.equal(findSubject(s), null, "'해당하는'·'경우에는'·'받은'은 주어가 아니다");
  assert.equal(findSubject("시ㆍ도지사 또는 시장ㆍ군수ㆍ구청장은 심의 결과를 공개하여야 한다.")?.token, "시장ㆍ군수ㆍ구청장은");
  assert.equal(findSubject("건축주, 설계자, 공사시공자 또는 공사감리자(이하 \"건축관계자\"라 한다)는 업무를 수행할 때 적용의 완화를 요청할 수 있다.")?.token, "한다)는");
});

test("단서표는 데이터로 노출되어 튜닝할 수 있다", () => {
  assert.ok(STAGE_TITLE_CUES.some((r) => r.stage === "penalty" && r.cues.includes("과태료")));
  assert.ok(ACTOR_CUES.some((r) => r.actor === "local"));
});
