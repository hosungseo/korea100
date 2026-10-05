import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyArticle, classifyStage, classifyActor, firstSentence, findSubject, findNominativeSubject,
  STAGES, ACTORS, STAGE_TITLE_CUES, ACTOR_CUES, CLASSIFIER_VERSION,
} from "./lib/law-map-classify.mjs";

function check(result, { stage, actor, minConfidence = 0, method }) {
  if (stage) assert.equal(result.stage, stage, `stage: ${JSON.stringify(result)}`);
  if (actor) assert.equal(result.actor, actor, `actor: ${JSON.stringify(result)}`);
  assert.ok(result.confidence >= minConfidence, `confidence ${result.confidence} < ${minConfidence}: ${JSON.stringify(result)}`);
  if (method) assert.equal(result.method, method);
  assert.ok(STAGES.includes(result.stage) && ACTORS.includes(result.actor));
  assert.ok(Array.isArray(result.evidence));
}
const secondaries = (r) => r.actors.filter((a) => a.role === "secondary").map((a) => a.actor);

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

test("procedure: 건축허가 → procedure, 주어 '…하려는 자는' → citizen, 허가권자는 secondary", () => {
  const r = classifyArticle({ title: "건축허가", chapter: "제2장 건축물의 건축", text: "① 건축물을 건축하거나 대수선하려는 자는 특별자치시장ㆍ특별자치도지사 또는 시장ㆍ군수ㆍ구청장의 허가를 받아야 한다. 다만, 21층 이상의 건축물은 시ㆍ도지사의 허가를 받아야 한다.\n② 시장ㆍ군수는 제1항에 따른 건축허가를 하려면 미리 시ㆍ도지사의 승인을 받아야 한다." });
  check(r, { stage: "procedure", actor: "citizen", minConfidence: 0.8, method: "rule:title" });
  assert.deepEqual(secondaries(r), ["local"]);
  assert.ok(!r.evidence.some((e) => e.startsWith("actor/also:central")), "'구청장'이 '청장'(중앙) 단서에 걸리면 안 된다");
});

test("operation: 건축물대장·통계·기본계획은 행정 운영 단계", () => {
  const r = classifyArticle({ title: "건축물대장", chapter: "제3장 건축물의 유지와 관리", text: "① 특별자치시장ㆍ특별자치도지사 또는 시장ㆍ군수ㆍ구청장은 건축물의 소유ㆍ이용 상태를 확인하기 위하여 건축물대장에 건축물과 그 대지의 현황을 적어서 보관하여야 한다." });
  check(r, { stage: "operation", actor: "local", minConfidence: 0.8, method: "rule:title" });
  assert.equal(classifyStage({ title: "건축통계 등", text: "허가권자는 건축통계를 국토교통부장관에게 보고하여야 한다." }).stage, "operation");
  const plan = classifyStage({ title: "기본계획의 수립", chapter: "제1장 총칙", text: "① 국토교통부장관은 5년마다 건축정책기본계획을 수립하여야 한다." });
  assert.equal(plan.stage, "operation", "기본계획은 purpose가 아니라 operation");
  const txt = classifyStage({ title: "건축행정의 효율화", text: "① 국토교통부장관은 건축행정 업무를 전산처리하기 위하여 종합적인 계획을 수립ㆍ시행할 수 있다." });
  assert.deepEqual([txt.stage, txt.method], ["operation", "rule:text"]);
});

test("organization: 위원회 설치 조문 → organization; 주어가 위원회면 committee", () => {
  const r = classifyArticle({ title: "분쟁위원회의 구성", chapter: "제9장 보칙", text: "① 분쟁위원회는 위원장과 부위원장 각 1명을 포함한 15명 이내의 위원으로 구성한다." });
  check(r, { stage: "organization", actor: "committee", minConfidence: 0.8 });
});

test("supervision: 이행강제금 → supervision × local(허가권자), '허가권자는'의 '자는'을 국민으로 오인하지 않는다", () => {
  const r = classifyArticle({ title: "이행강제금", chapter: "제9장 보칙", text: "① 허가권자는 제79조제1항에 따라 시정명령을 받은 후 시정기간 내에 시정명령을 이행하지 아니한 건축주등에 대하여는 이행강제금을 부과한다." });
  check(r, { stage: "supervision", actor: "local", minConfidence: 0.8 });
  assert.ok(!r.evidence.some((e) => e.startsWith("actor/joint:citizen")));
  assert.deepEqual(secondaries(r), ["citizen"], "이행강제금을 받는 건축주는 보조 주체");
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

// ── 부분 문자열·다의어 오탐 (v0.2) ─────────────────────────────────

test("cue: '인공지능'의 공지, '공공단체'의 공단, '협회의'의 회의는 걸리지 않는다", () => {
  const ai = classifyStage({ title: "인공지능 윤리원칙", text: "국가는 인공지능 윤리원칙을 제정하여 공표할 수 있다." });
  assert.ok(!ai.evidence.some((e) => e.includes("공지")), JSON.stringify(ai));
  assert.notEqual(ai.stage, "standard");
  assert.equal(classifyStage({ title: "공개 공지 등의 확보", text: "건축물은 공개 공지를 확보하여야 한다." }).stage, "standard", "진짜 空地는 여전히 기준");
  const body = classifyActor({ title: "협조 요청", text: "① 인사혁신처장은 행정기관ㆍ공공단체, 그 밖의 관련 기관에 자료의 제공을 요청할 수 있다." });
  assert.equal(body.actor, "central");
  assert.ok(!body.evidence.some((e) => e.includes("공단")), "공공단체 ≠ 공단");
  assert.equal(classifyActor({ title: "x", text: "① 한국산업안전보건공단은 사업장을 점검할 수 있다." }).actor, "committee", "진짜 공단은 위원회·기관");
  const assoc = classifyStage({ title: "협회의 설립", text: "사업자는 협회를 설립할 수 있다." });
  assert.ok(!assoc.evidence.some((e) => e === "title:회의"), JSON.stringify(assoc));
  assert.ok(classifyStage({ title: "회의", text: "위원회의 회의는 재적위원 과반수의 출석으로 개의한다." }).stage === "organization");
});

test("cue: '설치'는 조직 명사 뒤에서만 organization, 시설·승강기 설치는 standard", () => {
  assert.equal(classifyStage({ title: "건축안전센터의 설치", text: "지방자치단체의 장은 지역건축안전센터를 설치할 수 있다." }).stage, "organization");
  assert.equal(classifyStage({ title: "위원회 설치", text: "국토교통부에 중앙건축위원회를 둔다." }).stage, "organization");
  const lift = classifyStage({ title: "승강기의 설치", text: "① 건축주는 6층 이상인 건축물을 건축하려면 승강기를 설치하여야 한다." });
  assert.equal(lift.stage, "standard", JSON.stringify(lift));
  assert.equal(classifyStage({ title: "안전시설", text: "사업자는 안전시설을 갖추어야 한다." }).stage, "standard");
});

test("cue: 檢事 vs 檢査, 재정적 지원, 법률구조, 일시정지, 진로 지도", () => {
  const prosecutor = classifyArticle({ title: "검사의 직무", text: "① 검사는 범죄수사, 공소의 제기 및 그 유지에 필요한 사항을 그 직무로 한다." });
  assert.equal(prosecutor.actor, "court");
  assert.notEqual(prosecutor.stage, "supervision", JSON.stringify(prosecutor));
  assert.equal(classifyStage({ title: "보고와 검사 등", text: "장관은 소속 공무원으로 하여금 검사하게 할 수 있다." }).stage, "supervision", "檢査는 여전히 감독");
  const fund = classifyStage({ title: "재정적 지원", text: "국가는 사업자에게 재정적 지원을 할 수 있다." });
  assert.ok(!fund.evidence.some((e) => e.includes("재정")), JSON.stringify(fund));
  assert.equal(classifyStage({ title: "분쟁의 재정", text: "재정은 문서로써 하여야 한다." }).stage, "procedure", "裁定은 절차");
  const aid = classifyStage({ title: "법률구조", text: "국가는 법률구조 사업을 지원한다." });
  assert.ok(!aid.evidence.some((e) => e.includes("구조")), JSON.stringify(aid));
  assert.equal(classifyStage({ title: "건축물의 구조", text: "건축물은 하중에 안전한 구조를 가져야 한다." }).stage, "standard");
  const pause = classifyStage({ title: "운행의 일시정지", text: "운전자는 신호에 따라 일시정지하여야 한다." });
  assert.ok(!pause.evidence.some((e) => e.includes("정지")), JSON.stringify(pause));
  const guide = classifyStage({ title: "진로 지도", text: "학교의 장은 학생의 진로를 지도하여야 한다." });
  assert.notEqual(guide.stage, "supervision", JSON.stringify(guide));
  assert.equal(classifyStage({ title: "지도ㆍ감독", text: "장관은 지도ㆍ감독할 수 있다." }).stage, "supervision");
});

// ── 주체(actor) 단서 보강·새 레인 ──────────────────────────────────

test("actor: 처장·교육감·국무총리·대통령·소속 장관 → central, 위원장 → committee, 검찰총장·사법경찰관·법관 → court", () => {
  assert.equal(classifyActor({ title: "x", text: "① 인사혁신처장은 공무원의 인사에 관한 사무를 관장한다." }).actor, "central");
  assert.equal(classifyActor({ title: "x", text: "① 교육감은 학교를 지도ㆍ감독한다." }).actor, "central");
  assert.equal(classifyActor({ title: "x", text: "① 국무총리는 위원회의 위원장이 된다." }).actor, "central");
  assert.equal(classifyActor({ title: "x", text: "① 대통령은 대통령령으로 정하는 바에 따라 공무원을 임명한다." }).actor, "central", "대통령령은 주체가 아니다");
  assert.equal(classifyActor({ title: "x", text: "① 소속 장관은 소속 공무원을 임용한다." }).actor, "central");
  assert.equal(classifyActor({ title: "x", text: "① 위원장은 위원회를 대표하고 회무를 총괄한다." }).actor, "committee");
  assert.equal(classifyActor({ title: "x", text: "① 검찰총장은 검찰사무를 총괄한다." }).actor, "court");
  assert.equal(classifyActor({ title: "x", text: "① 사법경찰관은 범죄를 수사한다." }).actor, "court");
  assert.equal(classifyActor({ title: "x", text: "① 법관은 헌법과 법률에 의하여 양심에 따라 심판한다." }).actor, "court");
});

test("actor: 헌법기관 사무기구는 새 레인 constitutional, 긴 단서가 겹치는 짧은 단서(법원·처장·총장·위원회)를 이긴다", () => {
  assert.deepEqual(ACTORS, ["citizen", "central", "local", "committee", "court", "constitutional", "none", "unknown"]);
  const r = classifyActor({ title: "x", text: "① 법원행정처장은 소속 공무원의 인사에 관한 사무를 관장한다." });
  assert.equal(r.actor, "constitutional");
  assert.ok(!r.evidence.some((e) => /also:(court|central)/.test(e)), JSON.stringify(r));
  assert.deepEqual(r.actors, [{ actor: "constitutional", role: "primary" }], "같은 자리의 처장(central)·법원(court)은 겹침으로 지워진다");
  assert.equal(classifyActor({ title: "x", text: "① 국회사무총장은 국회공무원을 임용한다." }).actor, "constitutional");
  assert.equal(classifyActor({ title: "x", text: "① 중앙선거관리위원회사무총장은 선거관리위원회 소속 공무원을 임용한다." }).actor, "constitutional");
  assert.equal(classifyActor({ title: "x", text: "① 법원은 소송이 제기된 경우 이를 심리한다." }).actor, "court", "맨 법원은 여전히 법원");
});

test("actor: 공무원과 '누구든지'는 수범자(citizen)", () => {
  const r = classifyArticle({ title: "실비 변상 등", text: "① 공무원은 보수 외에 대통령령등으로 정하는 바에 따라 직무 수행에 필요한 실비 변상을 받을 수 있다." });
  check(r, { stage: "standard", actor: "citizen", minConfidence: 0.8 });
  const anyone = classifyArticle({ title: "위법ㆍ부당한 인사행정 신고", text: "① 누구든지 위법 또는 부당한 인사행정 운영이 발생하였다고 인정되는 경우에는 중앙인사관장기관의 장에게 신고할 수 있다." });
  check(anyone, { stage: "procedure", actor: "citizen" });
  assert.equal(anyone.actorConfidence, 0.7);
  assert.deepEqual(secondaries(anyone), ["central"]);
  assert.equal(classifyActor({ title: "x", text: "① 장관은 소속 공무원으로 하여금 검사하게 할 수 있다." }).actor, "central", "'소속 공무원으로 하여금'은 수범자가 아니다");
});

// ── 주어 구간: 머리가 primary, 접속사로 이어진 것만 joint, 나머지는 secondary ─

test("span: '허가권자에게 신고한 건축주는' → citizen primary, local secondary(접속사 아님)", () => {
  const r = classifyArticle({ title: "건축신고", text: "① 허가권자에게 신고한 건축주는 공사를 시작할 수 있다." });
  assert.equal(r.actor, "citizen");
  assert.ok(r.actorConfidence >= 0.8, "공동 주어가 아니므로 0.5로 깎지 않는다");
  assert.deepEqual(r.actors, [{ actor: "citizen", role: "primary" }, { actor: "local", role: "secondary", evidence: ["cue:허가권자"] }]);
  assert.ok(!r.evidence.some((e) => e.startsWith("actor/joint:")));
});

test("span: 공동 주어(장관, 시ㆍ도지사 및 시장ㆍ군수ㆍ구청장은)는 머리(구청장=local)가 primary, 앞 단서는 joint(0.5)", () => {
  const r = classifyActor({ title: "건축위원회", text: "① 국토교통부장관, 시ㆍ도지사 및 시장ㆍ군수ㆍ구청장은 다음 각 호의 사항을 조사ㆍ심의하기 위하여 각각 건축위원회를 두어야 한다." });
  assert.equal(r.actor, "local");
  assert.equal(r.confidence, 0.5);
  assert.ok(r.evidence.includes("joint:central(국토교통부장관)"));
  assert.deepEqual(r.actors.map((a) => [a.actor, a.role]), [["local", "primary"], ["central", "secondary"]]);
  assert.deepEqual(r.actors[1].evidence, ["joint:국토교통부장관"]);
  const two = classifyActor({ title: "x", text: "① 국가나 지방자치단체는 건축물을 건축하려는 경우 미리 허가권자와 협의하여야 한다." });
  assert.deepEqual([two.actor, two.confidence, secondaries(two)], ["local", 0.5, ["central"]]);
});

test("span: 주어 토큰이 사물이고 구간에 주체가 있으면('허가권자의 처분은') 그 주체를 0.5로", () => {
  const r = classifyActor({ title: "x", text: "① 허가권자의 처분은 서면으로 하여야 한다." });
  assert.deepEqual([r.actor, r.confidence], ["local", 0.5]);
  assert.ok(r.evidence.includes("span:허가권자"));
});

test("actor: '…이/가' 주어도 토큰 자체가 주체 명사일 때만 읽는다(건축주가 ○, 허가가 ×); 사물 주제 뒤 행위자('시험은 처장이 실시')도 읽는다", () => {
  assert.equal(findNominativeSubject("건축주가 허가를 받았거나 신고를 한 건축물의 공사를 완료한 후 사용승인을 신청하여야 한다.")?.actor, "citizen");
  assert.equal(findNominativeSubject("허가가 취소된 경우에는 공사를 중지하여야 한다."), null);
  const r = classifyActor({ title: "건축물의 사용승인", text: "① 건축주가 제11조에 따라 허가를 받은 건축물의 건축공사를 완료한 후 그 건축물을 사용하려면 허가권자에게 사용승인을 신청하여야 한다." });
  assert.equal(r.actor, "citizen");
  assert.equal(r.confidence, 0.7);
  assert.deepEqual(r.actors.map((a) => a.actor), ["citizen", "local"]);
  const exam = classifyActor({ title: "시험 실시기관", stage: "procedure", text: "① 행정기관 소속 공무원의 채용시험, 그 밖의 시험은 인사혁신처장 또는 인사혁신처장이 지정하는 소속기관의 장이 실시한다.\n② 국회ㆍ법원ㆍ헌법재판소ㆍ선거관리위원회 소속 공무원의 시험은 각 기관의 장이 실시한다." });
  assert.deepEqual([exam.actor, exam.confidence], ["central", 0.5]);
  assert.ok(exam.evidence.includes("agent:인사혁신처장이"));
});

test("implicit subject: 주어 없는 '…에게 신고를 하면' 문형 → citizen 0.6, 기관은 secondary", () => {
  const r = classifyArticle({ title: "건축신고", chapter: "제2장 건축물의 건축", text: "① 제11조에 해당하는 허가 대상 건축물이라 하더라도 다음 각 호의 어느 하나에 해당하는 경우에는 미리 특별자치시장ㆍ특별자치도지사 또는 시장ㆍ군수ㆍ구청장에게 국토교통부령으로 정하는 바에 따라 신고를 하면 건축허가를 받은 것으로 본다.\n1. 바닥면적의 합계가 85제곱미터 이내의 증축" });
  check(r, { stage: "procedure", actor: "citizen" });
  assert.equal(r.actorConfidence, 0.6);
  assert.ok(r.evidence.includes("actor/implicit-subject:신고"));
  assert.deepEqual(r.actors.map((a) => [a.actor, a.role]), [["citizen", "primary"], ["local", "secondary"]]);
});

test("thing-subject: 시행령·부령 기술기준의 사물 주어는 none 0.6, 법률은 수범자 추정 0.4(협의 상대 기관은 근거에만)", () => {
  const r = classifyArticle({ tier: "rule", title: "콘크리트의 배합", text: "① 콘크리트의 압축강도는 설계기준강도 이상이어야 한다.\n② 물ㆍ시멘트비는 60퍼센트 이하로 하여야 한다." });
  check(r, { stage: "standard", actor: "none" });
  assert.equal(r.actorConfidence, 0.6);
  assert.ok(r.evidence.includes("actor/thing-subject:압축강도는"));
  const statute = classifyArticle({ tier: "statute", title: "건축물의 마감재료 등", text: "① 대통령령으로 정하는 용도의 건축물의 벽, 반자 등 내부의 마감재료는 방화에 지장이 없는 재료로 하되, 관계 중앙행정기관의 장과 협의하여 국토교통부령으로 정하는 기준에 따른 것이어야 한다." });
  assert.deepEqual([statute.stage, statute.actor, statute.actorConfidence], ["standard", "citizen", 0.4]);
  assert.ok(statute.evidence.includes("actor/body:central(중앙행정기관의 장)"), "협의 상대는 근거로만 남는다");
  assert.equal(classifyArticle({ tier: "rule", title: "구조안전의 확인", text: "① 허가권자는 구조 안전 확인 서류를 제출받아 확인하여야 한다." }).actor, "local");
});

test("none: 위임 조문('…은 대통령령으로 정한다', '대통령령등으로 정한다')은 주체 없음", () => {
  const r = classifyArticle({ title: "건축설비기준 등", chapter: "제7장 건축설비", text: "건축설비의 설치 및 구조에 관한 기준과 설계 및 공사감리에 관하여 필요한 사항은 대통령령으로 정한다." });
  check(r, { stage: "standard", actor: "none", minConfidence: 0.6 });
  assert.ok(r.evidence.includes("actor/text:…으로 정한다(위임 조문)"));
  assert.deepEqual(r.actors, [{ actor: "none", role: "primary" }], "primary에는 근거를 되풀이하지 않는다");
  assert.equal(classifyActor({ title: "x", text: "직위분류제에 관하여는 이 법에 규정한 것 외에는 대통령령등으로 정한다." }).actor, "none");
});

// ── 충돌·장 폴백·unknown ──────────────────────────────────────────

test("conflict: 제목이 두 단계에 걸리면 머리말을 1순위로 삼고 본문이 다른 후보를 밀면 그쪽 0.4", () => {
  const r = classifyStage({ title: "건축허가 제한 등", chapter: "제2장 건축물의 건축", text: "① 국토교통부장관은 국토관리를 위하여 특히 필요하다고 인정하면 허가권자의 건축허가를 제한할 수 있다.\n② 제한하려면 주민의견을 청취한 후 건축위원회의 심의를 거쳐야 한다.\n③ 제한한 경우 즉시 공고하여야 하며, 허가권자에게 통보하여야 한다." });
  assert.equal(r.stage, "procedure");
  assert.equal(r.confidence, 0.4);
  assert.ok(r.evidence.includes("title:제한(머리말)"));
  const fee = classifyStage({ title: "건축허가 등의 수수료", text: "① 허가를 신청하거나 신고를 하는 자는 허가권자나 신고수리자에게 수수료를 납부하여야 한다. ② 수수료는 국토교통부령으로 정하는 범위에서 조례로 정한다." });
  assert.equal(fee.stage, "misc");
  assert.equal(fee.confidence, 0.5);
});

test("chapter fallback: 제목·본문 단서가 없으면 장 제목으로 0.5, method rule:chapter", () => {
  const r = classifyStage({ title: "리모델링에 대비한 지원 등", chapter: "제1장 총칙", text: "리모델링이 쉬운 구조의 공동주택의 건축을 촉진한다." });
  assert.deepEqual([r.stage, r.confidence, r.method], ["purpose", 0.5, "rule:chapter"]);
  assert.deepEqual(r.evidence, ["chapter:제1장 총칙"]);
  const weak = classifyStage({ title: "통일성을 유지하기 위한 도의 조례", chapter: "제1장 총칙", text: "도 단위로 통일성을 유지할 필요가 있으면 도의 조례로 정하는 바에 따른다." });
  assert.deepEqual([weak.stage, weak.confidence], ["misc", 0.6], "'조례'는 약한 제목 단서라 장 폴백보다 먼저");
});

test("unknown: 단서가 전혀 없으면 unknown, 근거 비움, 신뢰도 0, actors 비움", () => {
  const r = classifyArticle({ title: "특별건축구역의 건축물", chapter: "제8장 특별건축구역 등", text: "특별건축구역에서 건축하는 건축물의 범위는 다음 각 호와 같다." });
  assert.equal(r.stage, "unknown");
  assert.equal(r.stageConfidence, 0);
  assert.equal(r.stageMethod, "unknown");
  const empty = classifyArticle({ title: "", chapter: null, text: "" });
  assert.deepEqual([empty.stage, empty.actor, empty.confidence, empty.method, empty.actors], ["unknown", "unknown", 0, "unknown", []]);
});

test("deleted: 삭제 조문은 단계 unknown × 주체 none, deleted 표시, 신뢰도 1", () => {
  const r = classifyArticle({ title: "삭제", chapter: "제3장 건축물의 유지와 관리", text: "삭제 <2019.4.30>" });
  assert.deepEqual([r.stage, r.actor, r.confidence, r.deleted], ["unknown", "none", 1, true]);
  assert.deepEqual(r.actors, [{ actor: "none", role: "primary" }]);
});

test("floor: 축별 신뢰도가 0.4 미만이면 그 축은 unknown이 된다", () => {
  const r = classifyArticle({ title: "결합건축 대상지", chapter: "제8장의3 결합건축", text: "다음 각 호의 어느 하나에 해당하는 지역에서 대지간의 최단거리가 100미터 이내인 2개의 대지의 건축주가 서로 합의한 경우 결합건축을 할 수 있다." });
  assert.ok(r.stage === "unknown" ? r.stageConfidence < 0.4 : r.stageConfidence >= 0.4);
  assert.ok(r.actor === "unknown" ? r.actorConfidence < 0.4 : r.actorConfidence >= 0.4);
});

// ── 회귀 묶음: PR #173 리뷰의 표본(건축법·국가공무원법 실제 첫 문장) ─────────

const REGRESSION = [
  { law: "건축법", label: "제4조의3", title: "건축위원회 회의록의 공개", chapter: "제1장 총칙", text: "시ㆍ도지사 또는 시장ㆍ군수ㆍ구청장은 제4조의2제1항에 따른 심의를 신청한 자가 요청하는 경우에는 대통령령으로 정하는 바에 따라 건축위원회 심의의 일시ㆍ장소ㆍ안건ㆍ내용ㆍ결과 등이 기록된 회의록을 공개하여야 한다.", stage: "procedure", actor: "local" },
  { law: "건축법", label: "제6조", title: "기존의 건축물 등에 관한 특례", chapter: "제1장 총칙", text: "허가권자는 법령의 제정ㆍ개정이나 그 밖에 대통령령으로 정하는 사유로 대지나 건축물이 이 법에 맞지 아니하게 된 경우에는 대통령령으로 정하는 범위에서 해당 지방자치단체의 조례로 정하는 바에 따라 건축을 허가할 수 있다.", stage: "misc", actor: "local" },
  { law: "건축법", label: "제24조", title: "건축시공", chapter: "제2장 건축물의 건축", text: "① 공사시공자는 제15조제2항에 따른 계약대로 성실하게 공사를 수행하여야 하며, 이 법과 이 법에 따른 명령이나 처분, 그 밖의 관계 법령에 맞게 건축물을 건축하여 건축주에게 인도하여야 한다. ② 공사시공자는 건축물의 공사현장에 설계도서를 갖추어 두어야 한다.", stage: "standard", actor: "citizen" },
  { law: "건축법", label: "제29조", title: "공용건축물에 대한 특례", chapter: "제2장 건축물의 건축", text: "① 국가나 지방자치단체는 제11조, 제14조, 제19조, 제20조 및 제83조에 따른 건축물을 건축ㆍ대수선ㆍ용도변경하거나 가설건축물을 건축하거나 공작물을 축조하려는 경우에는 대통령령으로 정하는 바에 따라 미리 건축물의 소재지를 관할하는 허가권자와 협의하여야 한다.", stage: "misc", actor: "local", secondary: ["central"] },
  { law: "건축법", label: "제52조", title: "건축물의 마감재료 등", chapter: "제5장 건축물의 구조 및 재료 등", text: "① 대통령령으로 정하는 용도 및 규모의 건축물의 벽, 반자, 지붕 등 내부의 마감재료[제52조의4제1항의 복합자재의 경우 심재(心材)를 포함한다]는 방화에 지장이 없는 재료로 하되, 관계 중앙행정기관의 장과 협의하여 국토교통부령으로 정하는 기준에 따른 것이어야 한다.", stage: "standard", actor: "citizen" },
  { law: "국가공무원법", label: "제4조", title: "일반직공무원의 계급 구분 등", chapter: "제1장 총칙", text: "① 일반직공무원은 1급부터 9급까지의 계급으로 구분하며, 직군(職群)과 직렬(職列)별로 분류한다. 다만, 고위공무원단에 속하는 공무원은 그러하지 아니하다.", stage: "purpose", actor: "citizen" },
  { law: "국가공무원법", label: "제8조의3", title: "관계 기관 등에 대한 협조 요청", chapter: "제2장 중앙인사관장기관", text: "① 인사혁신처장은 소관 업무를 수행하기 위하여 필요하면 행정기관ㆍ공공단체, 그 밖의 관련 기관에 자료ㆍ정보의 제공이나 의견 제출 등의 협조를 요청할 수 있다. ② 제1항에 따라 협조를 요청받은 기관은 특별한 사유가 없으면 이에 따라야 한다.", stage: "procedure", actor: "central" },
  { law: "국가공무원법", label: "제14조의2", title: "임시위원의 임명", chapter: "제3장 직위분류제", text: "① 제14조제3항부터 제5항까지의 규정에 따른 소청심사위원회 위원의 제척ㆍ기피 또는 회피 등으로 심사ㆍ결정에 참여할 수 있는 위원 수가 3명 미만이 된 경우에는 3명이 될 때까지 국회사무총장, 법원행정처장, 헌법재판소사무처장, 중앙선거관리위원회사무총장 또는 인사혁신처장은 임시위원을 임명하여 해당 사건의 심사ㆍ결정에 참여하도록 하여야 한다.", stage: "procedure", actor: "central", secondary: ["constitutional"] },
  { law: "국가공무원법", label: "제17조의2", title: "위법ㆍ부당한 인사행정 신고", chapter: "제2장 중앙인사관장기관", text: "① 누구든지 위법 또는 부당한 인사행정 운영이 발생하였거나 발생할 우려가 있다고 인정되는 경우에는 중앙인사관장기관의 장에게 신고할 수 있다.", stage: "procedure", actor: "citizen", secondary: ["central"] },
  { law: "국가공무원법", label: "제18조", title: "통계 보고", chapter: "제2장 중앙인사관장기관", text: "① 국회사무총장, 법원행정처장, 헌법재판소사무처장, 중앙선거관리위원회사무총장 또는 인사혁신처장은 국회ㆍ법원ㆍ헌법재판소ㆍ선거관리위원회 또는 행정 각 기관의 인사에 관한 통계보고 제도를 정하여 실시하고 정기 또는 수시로 필요한 보고를 받을 수 있다.", stage: "operation", actor: "central", secondary: ["constitutional"] },
  { law: "국가공무원법", label: "제22조의2", title: "직무분석", chapter: "제3장 직위분류제", text: "① 중앙인사관장기관의 장 또는 소속 장관은 합리적인 인사관리를 위하여 필요하면 직무분석을 실시할 수 있다.", stage: "operation", actor: "central" },
  { law: "국가공무원법", label: "제48조", title: "실비 변상 등", chapter: "제6장 보수", text: "① 공무원은 보수 외에 대통령령등으로 정하는 바에 따라 직무 수행에 필요한 실비(實費) 변상을 받을 수 있다.", stage: "standard", actor: "citizen" },
];

for (const c of REGRESSION) {
  test(`회귀: ${c.law} ${c.label} ${c.title} → ${c.stage} × ${c.actor}`, () => {
    const r = classifyArticle({ tier: "statute", title: c.title, chapter: c.chapter, text: c.text });
    assert.deepEqual([r.stage, r.actor], [c.stage, c.actor], JSON.stringify(r.evidence));
    if (c.secondary) for (const s of c.secondary) assert.ok(secondaries(r).includes(s), `secondary ${s} 기대: ${JSON.stringify(r.actors)}`);
    assert.ok(r.confidence >= 0.4);
  });
}

// ── 보조 함수·상수 ───────────────────────────────────────────────

test("firstSentence/findSubject: 첫 항 첫 문장만 보고, 접속사·관형사형·조사 결합은 주어로 삼지 않는다", () => {
  const s = firstSentence("① 제11조에 해당하는 허가 대상 건축물이라 하더라도 다음 각 호의 어느 하나에 해당하는 경우에는 미리 신고를 하면 건축허가를 받은 것으로 본다. <개정 2014.1.14>\n1. 바닥면적의 합계가 85제곱미터 이내의 증축\n② 제1항에 따른 신고를 한 자는 착공하여야 한다.");
  assert.ok(s.endsWith("받은 것으로 본다."));
  assert.equal(findSubject(s), null, "'해당하는'·'경우에는'·'받은'은 주어가 아니다");
  assert.equal(findSubject("시ㆍ도지사 또는 시장ㆍ군수ㆍ구청장은 심의 결과를 공개하여야 한다.")?.token, "시장ㆍ군수ㆍ구청장은");
  assert.equal(findSubject("건축주, 설계자, 공사시공자 또는 공사감리자(이하 \"건축관계자\"라 한다)는 업무를 수행할 때 적용의 완화를 요청할 수 있다.")?.token, "한다)는");
});

test("상수: 단계 순서에 operation, 주체에 constitutional이 있고 단서표는 데이터로 노출된다", () => {
  assert.deepEqual(STAGES, ["purpose", "standard", "procedure", "operation", "organization", "supervision", "penalty", "misc", "unknown"]);
  assert.equal(CLASSIFIER_VERSION, "rule-based v0.2");
  assert.ok(STAGE_TITLE_CUES.some((r) => r.stage === "penalty" && r.cues.includes("과태료")));
  assert.ok(STAGE_TITLE_CUES.some((r) => r.stage === "operation" && r.cues.includes("대장")));
  assert.ok(!STAGE_TITLE_CUES.some((r) => r.stage === "purpose" && r.cues.includes("기본계획")), "기본계획은 purpose에서 빠졌다");
  assert.ok(!STAGE_TITLE_CUES.some((r) => r.cues.includes("공지") || r.cues.includes("회의") || r.cues.includes("검사")), "다의어·부분 문자열 단서는 RegExp로만");
  assert.ok(ACTOR_CUES.some((r) => r.actor === "constitutional"));
});
