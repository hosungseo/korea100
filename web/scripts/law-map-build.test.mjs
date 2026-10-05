import test from "node:test";
import assert from "node:assert/strict";
import { buildLawMap, extractArticleLabels, lawUrl } from "./lib/law-map-build.mjs";
import { parseLsDelegated, parseLsStmd } from "./lib/law-map-parsers.mjs";
import { DELEGATED_XML, STMD_XML } from "./law-map-fixtures.mjs";

function article(no, title, extra = {}) {
  return { no, branch: null, label: `제${no}조`, title, chapter: "제1장 총칙", text: `${title} 본문`, ...extra };
}

function fixture() {
  const stmd = parseLsStmd(STMD_XML);
  const delegated = parseLsDelegated(DELEGATED_XML);
  return {
    stmd,
    laws: [
      {
        tier: "statute",
        info: stmd.root,
        articles: [
          article(1, "목적"),
          article(2, "정의"),
          article(4, "건축위원회"),
          { no: 13, branch: 2, label: "제13조의2", title: "건축물 안전영향평가", chapter: "제2장", text: "x".repeat(400) },
        ],
        delegated,
      },
      {
        tier: "decree",
        info: stmd.decrees[0],
        articles: [
          { no: 3, branch: 3, label: "제3조의3", title: "도로의 구조와 너비", chapter: null, text: "" },
          { no: 5, branch: null, label: "제5조", title: "중앙건축위원회의 설치 등", chapter: null, text: "" },
        ],
        delegated: { law: { mst: "288849" }, records: [], dropped: 0 },
      },
      { tier: "rule", info: stmd.rules[0], articles: [article(1, "목적")], delegated: null },
      { tier: "rule", info: stmd.rules[1], articles: [article(3, "건축허가 신청")], delegated: null },
    ],
    institutions: [
      { slug: "building-permit", name: "건축허가", citations: [{ law: "건축법", article: "제2조·제4조" }, { law: "건축법", article: "제99조" }] },
      { slug: "unrelated", name: "무관", citations: [{ law: "도로법", article: "제1조" }] },
    ],
    generatedAt: "2026-10-05",
  };
}

test("lawUrl builds law.go.kr public links without spaces", () => {
  assert.equal(lawUrl("건축법 시행령"), "https://www.law.go.kr/법령/건축법시행령");
  assert.equal(lawUrl("건축법", "제11조"), "https://www.law.go.kr/법령/건축법/제11조");
});

test("extractArticleLabels reads every article in a citation string", () => {
  assert.deepEqual(extractArticleLabels("제32조·제33조, 제4조의2 및 제32조"), ["제32조", "제33조", "제4조의2"]);
  assert.deepEqual(extractArticleLabels("별표 1"), []);
});

test("buildLawMap lays out lanes in tier order and ids articles by lane", () => {
  const { map } = buildLawMap(fixture());
  assert.deepEqual(map.lanes.map((l) => [l.id, l.tier]), [
    ["L1", "statute"], ["D1", "decree"], ["R1", "rule"], ["R2", "rule"],
    ["A1", "adminRule"], ["A2", "adminRule"], ["A3", "adminRule"], ["A4", "adminRule"], ["O1", "ordinance"],
  ]);
  assert.equal(map.lanes[4].name, "건축행정시스템 운영규정");
  assert.equal(map.lanes[4].kind, "훈령");
  assert.equal(map.lanes[7].name, "건축물 안전영향평가 세부기준"); // lsDelegated에만 있는 행정규칙이 추가됨
  assert.equal(map.lanes[8].collapsed.count, 3);
  assert.equal(map.articles.find((a) => a.id === "D1:제3조의3").officialUrl, "https://www.law.go.kr/법령/건축법시행령/제3조의3");
  assert.equal(map.name, "건축법");
  assert.equal(map.lawId, "001823");
  assert.equal(map.ministry, "국토교통부");
});

test("buildLawMap resolves edges, collapses ordinances, keeps cites without boxes", () => {
  const { map, report } = buildLawMap(fixture());
  const byKind = Object.groupBy(map.edges, (e) => e.kind);
  assert.equal(byKind.decree.length, 3);
  assert.deepEqual([byKind.decree[0].from, byKind.decree[0].to, byKind.decree[0].fromClause], ["L1:제2조", "D1:제3조의3", "제2조제1항제11호"]);
  // 시행규칙 제1조의2는 조문 목록에 없다 → 미해결
  assert.equal(byKind.rule.length, 2);
  assert.equal(byKind.rule[0].to, null);
  assert.equal(byKind.rule[0].unresolved, true);
  assert.equal(byKind.rule[0].targetLabel, "제1조의2");
  // 조례 2건은 출발 조문 하나당 한 선으로 접힌다
  assert.equal(byKind.ordinance.length, 1);
  assert.equal(byKind.ordinance[0].to, "O1");
  // 인용법령은 박스 없이 선만
  assert.equal(byKind.cites.length, 3);
  assert.ok(byKind.cites.every((e) => e.to === null && !e.unresolved));
  // 행정규칙 위임은 레인 박스로
  assert.equal(byKind.adminRule[0].to, "A4");
  assert.equal(map.stats.unresolved, 3);
  assert.deepEqual(map.stats.edgesByKind, { decree: 3, rule: 2, adminRule: 1, ordinance: 1, cites: 3 });
  assert.deepEqual(map.stats.articlesByTier, { statute: 4, decree: 2, rule: 2, adminRule: 0, ordinance: 0 });
  assert.equal(report.unresolved.length, 3);
  assert.deepEqual(report.addedAdminRules, ["건축물 안전영향평가 세부기준"]);
  assert.equal(report.droppedReferences, 1);
  assert.ok(map.edges.every((e, i) => e.id === `e${i + 1}`));
  assert.ok(map.edges.every((e) => typeof e.targetName === "string" && e.targetName.length > 0));
});

test("buildLawMap falls back to the only lane of a tier for header-less delegations, and not when ambiguous", () => {
  const { map, report } = buildLawMap(fixture());
  const fromArt4 = map.edges.filter((e) => e.from === "L1:제4조" && e.fromClause === "제4조제5항");
  // 시행령 레인이 하나뿐 → 제5조는 해결, 제5조의2는 조문이 없어 미해결(레인은 찾음)
  const decrees = fromArt4.filter((e) => e.kind === "decree");
  assert.deepEqual(decrees.map((e) => [e.to, e.targetLabel, e.targetName, e.unresolved ?? false]), [
    ["D1:제5조", "제5조", "건축법 시행령", false],
    [null, "제5조의2", "건축법 시행령", true],
  ]);
  // 시행규칙 레인이 둘 → 어느 레인인지 모름 → lane-missing
  const rules = fromArt4.filter((e) => e.kind === "rule");
  assert.deepEqual(rules.map((e) => [e.to, e.targetLabel, e.targetName, e.unresolved]), [
    [null, "제2조", "국토교통부령", true],
  ]);
  assert.deepEqual(
    report.unresolved.filter((u) => u.from === "L1:제4조").map((u) => [u.kind, u.reason, u.targetLabel]),
    [["decree", "article-missing", "제5조의2"], ["rule", "lane-missing", "제2조"]],
  );
  // 인용법령 추정도 선으로 남는다
  const cite = fromArt4.find((e) => e.kind === "cites");
  assert.equal(cite.targetName, "녹색건축물 조성 지원법");
  assert.equal(cite.to, null);
});

test("buildLawMap maps institution citations to article ids and reports misses", () => {
  const { map, report, texts } = buildLawMap(fixture());
  assert.deepEqual(map.institutions, [{ slug: "building-permit", name: "건축허가", articles: ["L1:제2조", "L1:제4조"] }]);
  assert.deepEqual(report.institutionMisses, [{ slug: "building-permit", law: "건축법", article: "제99조" }]);
  assert.equal(texts["L1:제1조"], "목적 본문");
  assert.equal(texts["L1:제13조의2"].length, 301); // 300자 + 말줄임
  assert.ok(!("D1:제3조의3" in texts));
});
