import test from "node:test";
import assert from "node:assert/strict";
import {
  MISC_CHAPTER, aggregateEdges, buildOverviewHeadline, fitLabel, groupLaneArticles, strokeWidthFor,
} from "../src/lib/law-map-overview-layout.mjs";

const lane = { id: "L1", name: "건축법", tier: "statute" };
const articles = [
  { id: "L1:제1조", chapter: null },
  { id: "L1:제2조", chapter: "제1장 총칙" },
  { id: "L1:제3조", chapter: "제1장 총칙" },
  { id: "L1:제4조", chapter: "제2장 건축" },
  { id: "L1:제5조", chapter: null },
];

test("groups articles by contiguous chapter runs; null-chapter runs become separate misc groups", () => {
  const groups = groupLaneArticles(lane, articles);
  assert.deepEqual(groups.map((g) => [g.id, g.title, g.articleIds]), [
    ["L1#misc0", MISC_CHAPTER, ["L1:제1조"]],
    ["L1#ch0", "제1장 총칙", ["L1:제2조", "L1:제3조"]],
    ["L1#ch1", "제2장 건축", ["L1:제4조"]],
    ["L1#misc1", MISC_CHAPTER, ["L1:제5조"]],
  ]);
  assert.ok(groups.every((g) => g.isLane === false));
});

test("a repeated chapter title under another 편 is a separate group kept in document order (민법·상법)", () => {
  const groups = groupLaneArticles({ id: "L1", name: "민법" }, [
    { id: "L1:제1조", chapter: "제1장 총칙" },
    { id: "L1:제2조", chapter: "제2장 인" },
    { id: "L1:제3조", chapter: "제1장 총칙" },
    { id: "L1:제4조", chapter: "제1장 총칙" },
  ]);
  assert.deepEqual(groups.map((g) => [g.id, g.title, g.articleIds.length]), [
    ["L1#ch0", "제1장 총칙", 1],
    ["L1#ch1", "제2장 인", 1],
    ["L1#ch2", "제1장 총칙", 2],
  ]);
});

test("a lane without chapters becomes one lane-named group", () => {
  const groups = groupLaneArticles({ id: "R3", name: "건축물대장 규칙" }, [{ id: "R3:제1조", chapter: null }, { id: "R3:제2조", chapter: null }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "R3#lane");
  assert.equal(groups[0].title, "건축물대장 규칙");
  assert.equal(groups[0].isLane, true);
  assert.deepEqual(groups[0].articleIds, ["R3:제1조", "R3:제2조"]);
});

test("aggregates edges per (from, to, kind), skipping cites, hidden kinds and self loops", () => {
  const nodeMap = new Map();
  for (const g of groupLaneArticles(lane, articles)) for (const id of g.articleIds) nodeMap.set(id, g.id);
  nodeMap.set("A1", "A1");
  nodeMap.set("D1:제3조", "D1#ch0");
  nodeMap.set("D1:제4조", "D1#ch0");
  const edges = [
    { id: "e1", from: "L1:제2조", to: "D1:제3조", kind: "decree" },
    { id: "e2", from: "L1:제3조", to: "D1:제4조", kind: "decree" },
    { id: "e3", from: "L1:제4조", to: "D1:제3조", kind: "decree" },
    { id: "e4", from: "L1:제2조", to: "A1", kind: "adminRule" },
    { id: "e5", from: "L1:제2조", to: null, kind: "cites" },
    { id: "e6", from: "L1:제2조", to: "L1:제3조", kind: "rule" },
  ];
  const all = aggregateEdges(edges, nodeMap, new Set(["decree", "rule", "adminRule", "ordinance", "cites"]));
  assert.deepEqual(all.map((a) => [a.from, a.to, a.kind, a.count]), [
    ["L1#ch0", "D1#ch0", "decree", 2],
    ["L1#ch1", "D1#ch0", "decree", 1],
    ["L1#ch0", "A1", "adminRule", 1],
  ]);
  const onlyAdmin = aggregateEdges(edges, nodeMap, new Set(["adminRule"]));
  assert.deepEqual(onlyAdmin.map((a) => a.id), ["L1#ch0>A1>adminRule"]);
});

test("stroke width grows with the square root and is clamped to 1..6", () => {
  assert.equal(strokeWidthFor(1), 1);
  assert.equal(strokeWidthFor(4), 2);
  assert.equal(strokeWidthFor(100), 6);
});

test("fitLabel keeps short text and truncates long text with an ellipsis", () => {
  assert.equal(fitLabel("총칙", 100, 10), "총칙");
  const cut = fitLabel("제5장 건축물의 구조 및 재료 등", 60, 10);
  assert.ok(cut.endsWith("…"));
  assert.ok(cut.length < "제5장 건축물의 구조 및 재료 등".length);
  assert.equal(fitLabel("건축", 5, 10), "");
});

test("buildOverviewHeadline counts delegating statute articles and names the busiest chapter", () => {
  const map = {
    name: "건축법",
    lanes: [{ id: "L1", name: "건축법", tier: "statute" }, { id: "D1", name: "건축법 시행령", tier: "decree" }],
    articles: [
      { id: "L1:제1조", laneId: "L1", chapter: "제1장 총칙" },
      { id: "L1:제2조", laneId: "L1", chapter: "제1장 총칙" },
      { id: "L1:제3조", laneId: "L1", chapter: "제2장 건축" },
      { id: "D1:제1조", laneId: "D1", chapter: null },
    ],
    edges: [
      { from: "L1:제1조", kind: "decree" },
      { from: "L1:제1조", kind: "rule" },        // same article, counted once
      { from: "L1:제3조", kind: "decree" },
      { from: "L1:제2조", kind: "cites" },       // not a delegation
      { from: "D1:제1조", kind: "rule" },        // not a statute article
    ],
  };
  const h = buildOverviewHeadline(map);
  assert.equal(h.delegatingCount, 2);
  assert.equal(h.topChapter, "제1장 총칙");
  assert.equal(h.title, "「건축법」 조문 3개 중 2개가 시행령·시행규칙에 세부를 맡기고, 가장 많이 맡기는 장은 「제1장 총칙」입니다.");
  assert.ok(h.subtitle.includes("자리 = 어느 장을 받치는가"));
});

test("buildOverviewHeadline counts the busiest chapter per contiguous run, not per repeated title", () => {
  const map = {
    name: "민법",
    lanes: [{ id: "L1", name: "민법", tier: "statute" }],
    articles: [
      { id: "L1:제1조", laneId: "L1", chapter: "제1장 총칙" },
      { id: "L1:제2조", laneId: "L1", chapter: "제2장 인" },
      { id: "L1:제3조", laneId: "L1", chapter: "제1장 총칙" },
    ],
    // 두 "제1장 총칙"은 합치면 2건이지만 따로 세면 각 1건 → 제2장 인(2건)이 가장 많다.
    edges: [
      { from: "L1:제1조", kind: "decree" },
      { from: "L1:제3조", kind: "decree" },
      { from: "L1:제2조", kind: "decree" },
      { from: "L1:제2조", kind: "rule" },
    ],
  };
  assert.equal(buildOverviewHeadline(map).topChapter, "제2장 인");
});

test("buildOverviewHeadline drops the chapter clause when the statute has no chapters", () => {
  const map = {
    name: "짧은 법",
    lanes: [{ id: "L1", name: "짧은 법", tier: "statute" }],
    articles: [{ id: "L1:제1조", laneId: "L1", chapter: null }],
    edges: [{ from: "L1:제1조", kind: "decree" }],
  };
  const h = buildOverviewHeadline(map);
  assert.equal(h.topChapter, null);
  assert.equal(h.title, "「짧은 법」 조문 1개 중 1개가 시행령·시행규칙에 세부를 맡기고 있습니다.");
});
