import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuleGrid, buildRuleHeadline, describeEvidence, STAGE_ORDER, ACTOR_ORDER, CELL_CHIP_LIMIT } from "../src/lib/law-map-rule-layout.mjs";

const WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function article(id, label, title, laneId = "L1") {
  return { id, laneId, no: 1, branch: null, label, title, chapter: null, officialUrl: "" };
}

const MAP = {
  schemaVersion: 1, lawId: "T", mst: "1", name: "시험법", ministry: null, effectiveOn: null, promulgatedOn: null, generatedAt: "2026-10-05",
  lanes: [
    { id: "L1", tier: "statute", name: "시험법", kind: "법률", officialUrl: "", articleCount: 8 },
    { id: "D1", tier: "decree", name: "시험법 시행령", kind: "대통령령", officialUrl: "", articleCount: 1 },
  ],
  articles: [
    article("L1:제1조", "제1조", "목적"),
    article("L1:제2조", "제2조", "건축허가"),
    article("L1:제3조", "제3조", "건축신고"),
    article("L1:제4조", "제4조", "대지의 조경"),
    article("L1:제5조", "제5조", "감독"),
    article("L1:제6조", "제6조", "이행강제금"),
    article("L1:제7조", "제7조", "삭제"),
    article("L1:제8조", "제8조", "수수께끼"),
    article("D1:제1조", "제1조", "시행령 조문", "D1"),
  ],
  edges: [
    { id: "e1", from: "L1:제2조", fromClause: null, to: "D1:제1조", kind: "decree", phrase: "", targetName: "" },
    { id: "e2", from: "L1:제2조", fromClause: null, to: "D1:제1조", kind: "decree", phrase: "", targetName: "" },
    { id: "e3", from: "L1:제3조", fromClause: null, to: "R1", kind: "rule", phrase: "", targetName: "" },
    { id: "e4", from: "L1:제3조", fromClause: null, to: null, kind: "rule", phrase: "", targetName: "", unresolved: true },
    { id: "e5", from: "L1:제4조", fromClause: null, to: null, kind: "cites", phrase: "", targetName: "" },
  ],
  institutions: [],
  stats: { articlesByTier: { statute: 8, decree: 1, rule: 0, adminRule: 0, ordinance: 0 }, edgesByKind: { decree: 2, rule: 2, adminRule: 0, ordinance: 0, cites: 1 }, unresolved: 1 },
};

const CLASS = {
  lawId: "T", generatedAt: "2026-10-05", method: "rule-based v0.1", stats: {},
  articles: {
    "L1:제1조": { stage: "purpose", actor: "none", confidence: 0.8, evidence: ["stage/title:목적"], method: "rule:title", actors: [{ actor: "none", role: "primary", evidence: [] }] },
    "L1:제2조": { stage: "procedure", actor: "citizen", confidence: 0.8, evidence: ["stage/title:허가", "actor/subject:자는"], method: "rule:title", actors: [{ actor: "citizen", role: "primary", evidence: [] }, { actor: "local", role: "secondary", evidence: ["cue:시장ㆍ군수ㆍ구청장"] }] },
    "L1:제3조": { stage: "procedure", actor: "citizen", confidence: 0.6, evidence: ["stage/title:신고", "actor/implicit-subject:신고"], method: "rule:title", actors: [{ actor: "citizen", role: "primary", evidence: [] }] },
    "L1:제4조": { stage: "standard", actor: "citizen", confidence: 0.8, evidence: ["stage/title:조경"], method: "rule:title" },
    "L1:제5조": { stage: "supervision", actor: "central", confidence: 0.8, evidence: ["stage/title:감독"], method: "rule:title" },
    "L1:제6조": { stage: "supervision", actor: "local", confidence: 0.4, evidence: ["stage/title:이행강제금"], method: "rule:title" },
    "L1:제7조": { stage: "unknown", actor: "none", confidence: 1, evidence: ["stage/title:삭제"], method: "rule:title", deleted: true },
    "L1:제8조": { stage: "unknown", actor: "unknown", confidence: 0, evidence: [], method: "unknown" },
    "D1:제1조": { stage: "standard", actor: "none", confidence: 0.6, evidence: [], method: "rule:text" },
  },
};

test("법률 조문만 격자에 올리고, 삭제 조문은 빼며, 빈 열·행은 떨어뜨린다", () => {
  const grid = buildRuleGrid(MAP, CLASS);
  assert.equal(grid.total, 7, "법률 8조 − 삭제 1 = 7 (시행령 조문은 세지 않는다)");
  assert.equal(grid.deleted, 1);
  assert.deepEqual(grid.columns.map((c) => c.stage), ["purpose", "standard", "procedure", "supervision", "unknown"]);
  assert.deepEqual(grid.rows.map((r) => r.actor), ["citizen", "local", "central", "none", "unknown"]);
  assert.equal(grid.columns.at(-1).label, "미분류");
  assert.equal(grid.rows.at(-1).label, "미분류");
  assert.ok(!grid.cells.some((c) => c.articles.some((a) => a.id.startsWith("D1:"))));
});

test("열 순서는 STAGE_ORDER, 행 순서는 ACTOR_ORDER를 따르고 셀은 행 → 열 순으로 나온다", () => {
  const grid = buildRuleGrid(MAP, CLASS);
  assert.deepEqual(STAGE_ORDER, ["purpose", "standard", "procedure", "operation", "organization", "supervision", "penalty", "misc"]);
  assert.deepEqual(ACTOR_ORDER, ["citizen", "local", "central", "committee", "court", "none"]);
  assert.deepEqual(grid.cells.map((c) => `${c.actor}/${c.stage}`), [
    "citizen/standard", "citizen/procedure", "local/supervision", "central/supervision", "none/purpose", "unknown/unknown",
  ]);
  assert.deepEqual(grid.cellOf("procedure", "citizen").articles.map((a) => a.label), ["제2조", "제3조"], "문서 순서");
  assert.equal(grid.cellOf("penalty", "citizen"), null);
});

test("칩은 신뢰도·점선 여부·보조 주체·근거를 들고 가고, 셀 배지는 시행령·시행규칙 위임만 센다", () => {
  const grid = buildRuleGrid(MAP, CLASS);
  const cell = grid.cellOf("procedure", "citizen");
  const [permit, report] = cell.articles;
  assert.equal(permit.lowConfidence, false);
  assert.deepEqual(permit.secondary, [{ actor: "local", evidence: ["cue:시장ㆍ군수ㆍ구청장"] }]);
  assert.deepEqual(report.secondary, []);
  assert.deepEqual(permit.delegations, { decree: 2, rule: 0 });
  assert.deepEqual(report.delegations, { decree: 0, rule: 1 }, "미해결 위임(to=null)은 세지 않는다");
  assert.deepEqual(cell.delegations, { decree: 2, rule: 1 });
  assert.deepEqual(grid.cellOf("standard", "citizen").delegations, { decree: 0, rule: 0 }, "인용(cites)은 배지에 넣지 않는다");
  assert.equal(grid.cellOf("supervision", "local").articles[0].lowConfidence, true);
  assert.equal(grid.lowConfidence, 2, "0.4 한 건 + 미분류 0 한 건");
  assert.equal(grid.withSecondary, 1);
  assert.equal(grid.method, "rule-based v0.1");
});

test("머리말: 수범자 레인의 큰 두 칸 + 감독·절차가 가장 많은 행정기관 레인의 가장 큰 칸, 받침에 따라 은/는", () => {
  const grid = buildRuleGrid(MAP, CLASS);
  assert.equal(grid.headline.title, "「시험법」은 국민·사업자에게 인허가·절차 2개 조문과 기준·의무 1개 조문을 지우고, 지방자치단체가 감독·시정 1개 조문을 맡습니다.");
  assert.equal(grid.headline.subtitle, "세로 = 누구에게 적용되는가 · 가로 = 규율 단계 · 점선 = 추론 신뢰도 0.5 미만");
  assert.deepEqual(buildRuleHeadline(MAP, CLASS), grid.headline, "단독 호출도 같은 문장");
  const vowel = buildRuleHeadline({ ...MAP, name: "국가공무원 인사" }, CLASS);
  assert.ok(vowel.title.startsWith("「국가공무원 인사」는 "));
});

test("머리말: 수범자 칸이 없으면 행정기관 문장만, 분류가 없으면 안내 문장", () => {
  const onlyAuthority = { ...CLASS, articles: { "L1:제5조": CLASS.articles["L1:제5조"] } };
  assert.equal(buildRuleHeadline(MAP, onlyAuthority).title, "「시험법」은 중앙행정기관이 감독·시정 1개 조문을 맡습니다.", "'기관'은 받침이 있어 '이'");
  assert.equal(buildRuleHeadline(MAP, null).title, "「시험법」은 조문 분류가 아직 없습니다.");
  assert.equal(buildRuleGrid(MAP, null).total, 0);
  assert.deepEqual(buildRuleGrid(MAP, null).columns, []);
});

test("describeEvidence는 축 접두어를 읽기 좋게 바꾸고 개수를 자른다", () => {
  assert.deepEqual(describeEvidence(["stage/title:허가", "actor/subject:자는", "actor/also:local(허가권자)"], 2), ["단계 · title:허가", "주체 · subject:자는"]);
  assert.deepEqual(describeEvidence(undefined), []);
});

test("실데이터 회귀: 건축법 class.json이 있으면 격자가 법률 조문 수와 맞고 칩 한도 상수가 쓰인다", { skip: !fs.existsSync(path.join(WEB_DIR, "data/law-map/001823.class.json")) }, () => {
  const map = JSON.parse(fs.readFileSync(path.join(WEB_DIR, "data/law-map/001823.json"), "utf8"));
  const cls = JSON.parse(fs.readFileSync(path.join(WEB_DIR, "data/law-map/001823.class.json"), "utf8"));
  const grid = buildRuleGrid(map, cls);
  const statute = map.articles.filter((a) => a.laneId === "L1").length;
  assert.equal(grid.total + grid.deleted, statute);
  assert.ok(grid.columns.length >= 6 && grid.rows.length >= 4);
  assert.ok(grid.cells.some((c) => c.articles.length > CELL_CHIP_LIMIT), "접히는 칸이 하나는 있어야 +N 동작을 볼 수 있다");
  assert.match(grid.headline.title, /^「건축법」은 국민·사업자에게 .+을 지우고, .+[가이] .+을 맡습니다\.$/);
});
