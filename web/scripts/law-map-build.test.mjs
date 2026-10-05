import test from "node:test";
import assert from "node:assert/strict";
import { buildLawMap, extractArticleLabels, lawUrl, ordinanceSearchUrl } from "./lib/law-map-build.mjs";
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
  assert.equal(map.lanes[8].officialUrl, ordinanceSearchUrl("건축법"));
  assert.equal(ordinanceSearchUrl("건축법"), "https://www.law.go.kr/LSW/ordinSc.do?menuId=3&query=%EA%B1%B4%EC%B6%95%EB%B2%95");
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
  assert.equal(byKind.decree[0].targetTitle, "지형적 조건 등에 따른 도로의 구조와 너비");
  assert.equal(byKind.rule[0].targetTitle, "설계도서의 범위"); // 미해결이어도 제목은 둔다
  assert.ok(!("targetTitle" in byKind.cites[0]));
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
  assert.equal(report.unresolved.length, map.stats.unresolved);
  assert.deepEqual(report.addedAdminRules, ["건축물 안전영향평가 세부기준"]);
  assert.equal(report.droppedReferences, 1);
  assert.equal(report.selfReferences, 0);
  assert.deepEqual(report.ambiguousSources, []);
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

test("buildLawMap reports each unresolved edge once even when the record repeats", () => {
  const input = fixture();
  const dup = input.laws[0].delegated.records.find((r) => r.kind === "시행규칙" && r.targetLabel === "제1조의2");
  input.laws[0].delegated.records.push({ ...dup }, { ...dup });
  const { map, report } = buildLawMap(input);
  assert.equal(map.stats.unresolved, 3);
  assert.equal(report.unresolved.length, 3);
});

test("buildLawMap merges admin-rule lanes by name when lsStmd and lsDelegated cite different serials", () => {
  const input = fixture();
  // lsStmd에 같은 고시가 다른 일련번호로 두 번 → 레인 하나
  input.stmd.adminRules.push({ id: "x", serial: "2100000999999", name: "건축공사  감리세부기준", kind: "고시", effectiveOn: "2025-01-01" });
  // lsDelegated가 또 다른 일련번호로 같은 고시를 가리킴 → 기존 레인 재사용, addedAdminRules에 없음
  const admin = input.laws[0].delegated.records.find((r) => r.kind === "위임행정규칙");
  input.laws[0].delegated.records.push({ ...admin, targetSerial: "2100000888888", targetName: "건축공사 감리세부기준" });
  input.laws[0].delegated.records.push({ ...admin, targetSerial: "2100000888888", targetName: "건축공사 감리세부기준", fromClause: "제13조의2제3항" });
  const { map, report } = buildLawMap(input);
  const adminLanes = map.lanes.filter((l) => l.tier === "adminRule");
  assert.deepEqual(adminLanes.map((l) => l.name), [
    "건축행정시스템 운영규정", "건축공사 감리세부기준", "실내건축의 구조·시공방법 등에 관한 기준", "건축물 안전영향평가 세부기준",
  ]);
  const merged = map.edges.filter((e) => e.kind === "adminRule" && e.targetName === "건축공사 감리세부기준");
  assert.equal(merged.length, 2);
  assert.ok(merged.every((e) => e.to === "A2"));
  assert.deepEqual(report.addedAdminRules, ["건축물 안전영향평가 세부기준"]);
  assert.equal(map.stats.edgesByKind.adminRule, 3);
});

test("buildLawMap drops self-references (root law or the lane's own law) from cites and counts them", () => {
  const input = fixture();
  const cite = input.laws[0].delegated.records.find((r) => r.kind === "인용법령");
  input.laws[0].delegated.records.push(
    { ...cite, targetSerial: "273437", targetName: "건축법", targetLabel: "제11조", linkText: "「건축법」" },
    { ...cite, targetSerial: null, targetName: "건축법", targetLabel: null, linkText: "이 법" },
  );
  input.laws[1].delegated.records.push(
    { ...cite, from: { no: 3, branch: 3, label: "제3조의3", title: "도로" }, fromClause: null, targetName: "건축법 시행령", targetLabel: "제5조" },
    { ...cite, from: { no: 3, branch: 3, label: "제3조의3", title: "도로" }, fromClause: null, targetName: "건축법", targetLabel: "제2조" },
    { ...cite, from: { no: 3, branch: 3, label: "제3조의3", title: "도로" }, fromClause: null, targetName: "도로법", targetLabel: "제2조" },
  );
  const { map, report } = buildLawMap(input);
  const cites = map.edges.filter((e) => e.kind === "cites");
  assert.deepEqual(cites.map((e) => e.targetName), ["국토의 계획 및 이용에 관한 법률", "건설산업기본법", "녹색건축물 조성 지원법", "도로법"]);
  assert.equal(report.selfReferences, 4);
  assert.equal(map.stats.edgesByKind.cites, 4);
});

test("buildLawMap matches header-less rule delegations to the lane whose 법종구분 equals the link text", () => {
  const input = fixture();
  input.laws[3].info = { ...input.laws[3].info, kind: "행정안전부령" };
  const headless = {
    from: { no: 2, branch: null, label: "제2조", title: "정의" }, kind: "시행규칙", targetSerial: null, targetName: null,
    targetLabel: "제3조", targetTitle: "건축허가 신청", fromClause: "제2조제3항", linkText: "행정안전부령", phrase: "행정안전부령으로 정하는",
  };
  input.laws[0].delegated.records.push(headless, { ...headless, targetLabel: "제9조", targetTitle: "없는 조문" });
  const { map, report } = buildLawMap(input);
  const hits = map.edges.filter((e) => e.fromClause === "제2조제3항");
  assert.deepEqual(hits.map((e) => [e.to, e.targetName, e.targetLabel, e.unresolved ?? false]), [
    ["R2:제3조", "건축법 시행규칙", "제3조", false],
    [null, "건축법 시행규칙", "제9조", true],
  ]);
  assert.deepEqual(
    report.unresolved.filter((u) => u.from === "L1:제2조" && u.kind === "rule").map((u) => [u.reason, u.targetLabel]),
    [["article-missing", "제1조의2"], ["article-missing", "제9조"]],
  );
  // 제4조의 머리글 없는 국토교통부령 위임은 여전히 레인이 하나(R1)로 좁혀진다
  const art4 = map.edges.find((e) => e.from === "L1:제4조" && e.kind === "rule");
  assert.deepEqual([art4.to, art4.unresolved ?? false], [null, true]); // R1 제2조는 조문 목록에 없음 → article-missing
  assert.equal(art4.targetName, "건축물대장의 기재 및 관리 등에 관한 규칙");
});

test("buildLawMap picks the branch article for ordinance delegations by matching the phrase against article text", () => {
  const input = fixture();
  input.laws[0].articles.push(
    { no: 4, branch: 2, label: "제4조의2", title: "건축위원회의 건축 심의 등", chapter: "제1장 총칙", text: "제4조의2(건축위원회의 건축 심의 등) ① 심의를 받아야 한다. ⑤ 각 건축위원회의 조직ㆍ운영은 조례로 정한다." },
    { no: 4, branch: 3, label: "제4조의3", title: "건축위원회 회의록의 공개", chapter: "제1장 총칙", text: "제4조의3(건축위원회 회의록의 공개) 공개한다." },
  );
  const ordinance = input.laws[0].delegated.records.find((r) => r.kind === "위임자치법규");
  // 어느 조문 원문에도 없는 문장 → 기본 조문 유지 + ambiguousSources
  input.laws[0].delegated.records.push({ ...ordinance, targetSerial: "1", targetName: "가평군 건축 조례", phrase: "⑥ 수수료는 조례로 정한다." });
  const { map, report } = buildLawMap(input);
  const ordinances = map.edges.filter((e) => e.kind === "ordinance");
  // 픽스처의 조례 2건은 "·"(U+00B7) 문장이 제4조의2 원문("ㆍ")에만 있어 가지 조문으로 간다
  assert.deepEqual(ordinances.map((e) => [e.from, e.to]), [["L1:제4조의2", "O1"], ["L1:제4조", "O1"]]);
  assert.deepEqual(report.ambiguousSources, [{
    rootLawId: "001823", lawId: "001823", from: "L1:제4조", kind: "ordinance", phrase: "⑥ 수수료는 조례로 정한다.",
    candidates: ["L1:제4조", "L1:제4조의2", "L1:제4조의3"],
  }]);
  // 가지 조문이 없는 레인에서는 대조하지 않는다
  assert.equal(buildLawMap(fixture()).report.ambiguousSources.length, 0);
});

test("buildLawMap matches ordinance phrases across curly and straight quotes", () => {
  const input = fixture();
  // 라인텍스트는 둥근 따옴표(“시ㆍ도지사”), 조문 원문은 곧은 따옴표("시ㆍ도지사") → 가지 조문 제5조의5로 간다
  input.laws[1].articles.push(
    { no: 5, branch: 5, label: "제5조의5", title: "지방건축위원회", chapter: null, text: '제5조의5(지방건축위원회) ① 8. 도지사(이하 "시ㆍ도지사"라 한다) 및 시장이 지정ㆍ공고한 지역에서 건축조례로 정하는 건축물' },
  );
  input.laws[1].articles[1].text = "제5조(중앙건축위원회의 설치 등) ① 국토교통부에 둔다.";
  input.laws[1].delegated.records.push({
    from: { no: 5, branch: null, label: "제5조", title: "중앙건축위원회의 설치 등" }, kind: "위임자치법규", targetSerial: "1", targetName: "서울특별시 건축 조례",
    targetLabel: null, targetTitle: null, fromClause: null, linkText: "건축조례", phrase: "8. 도지사(이하 “시·도지사”라 한다) 및 시장이 지정·공고한 지역에서 건축조례로 정하는 건축물",
  });
  const { map, report } = buildLawMap(input);
  const ordinance = map.edges.find((e) => e.kind === "ordinance" && e.from.startsWith("D1:"));
  assert.equal(ordinance.from, "D1:제5조의5");
  assert.deepEqual(report.ambiguousSources, []);
});

test("buildLawMap reports unresolved edges per clause so the report count equals stats.unresolved", () => {
  const input = fixture();
  const dup = input.laws[0].delegated.records.find((r) => r.kind === "시행규칙" && r.targetLabel === "제1조의2");
  // 같은 조문 → 같은 없는 도착 조문이지만 조항호목이 다른 두 선
  input.laws[0].delegated.records.push({ ...dup, fromClause: "제2조제2항" });
  const { map, report } = buildLawMap(input);
  const hits = report.unresolved.filter((u) => u.from === "L1:제2조" && u.targetLabel === "제1조의2");
  assert.deepEqual(hits.map((u) => u.fromClause), ["제2조제1항제14호", "제2조제2항"]);
  assert.ok(hits.every((u) => u.rootLawId === "001823" && u.lawId === "001823"));
  assert.equal(map.stats.unresolved, 4);
  assert.equal(report.unresolved.length, 4);
});

test("buildLawMap resolves header-less delegations to the only lane that has the target article (label + title)", () => {
  const input = fixture();
  // 국토교통부령 레인이 둘(R1·R2)이고 제18조(가설건축물의 건축허가)는 R2에만 있다
  input.laws[3].articles.push(article(18, "가설건축물의 건축허가"));
  input.laws[2].articles.push(article(18, "다른 제목의 제18조"));
  const headless = {
    from: { no: 2, branch: null, label: "제2조", title: "정의" }, kind: "시행규칙", targetSerial: null, targetName: null,
    targetLabel: "제18조", targetTitle: "가설건축물의 건축허가", fromClause: "제2조제4항", linkText: "국토교통부령", phrase: "국토교통부령으로 정하는",
  };
  // 제목이 없으면 조문번호만으로는 두 레인 모두 맞아 여전히 lane-missing
  input.laws[0].delegated.records.push(headless, { ...headless, targetTitle: null, fromClause: "제2조제5항" });
  const { map, report } = buildLawMap(input);
  const titled = map.edges.find((e) => e.fromClause === "제2조제4항");
  assert.deepEqual([titled.to, titled.targetName, titled.unresolved ?? false], ["R2:제18조", "건축법 시행규칙", false]);
  const untitled = map.edges.find((e) => e.fromClause === "제2조제5항");
  assert.deepEqual([untitled.to, untitled.targetName, untitled.unresolved], [null, "국토교통부령", true]);
  assert.deepEqual(report.unresolved.filter((u) => u.fromClause === "제2조제5항").map((u) => u.reason), ["lane-missing"]);
});

test("buildLawMap maps institution citations to article ids and reports misses", () => {
  const { map, report, texts } = buildLawMap(fixture());
  assert.deepEqual(map.institutions, [{ slug: "building-permit", name: "건축허가", articles: ["L1:제2조", "L1:제4조"] }]);
  assert.deepEqual(report.institutionMisses, [{ slug: "building-permit", law: "건축법", article: "제99조" }]);
  assert.equal(texts["L1:제1조"], "목적 본문");
  assert.equal(texts["L1:제13조의2"].length, 301); // 300자 + 말줄임
  assert.ok(!("D1:제3조의3" in texts));
});
