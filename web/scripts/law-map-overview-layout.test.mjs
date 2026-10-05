import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_RULE_ALL, MISC_CHAPTER, aggregateEdges, buildNodeMap, buildOverviewHeadline, distributeHeights, fitLabel, groupLaneArticles, strokeWidthFor,
} from "../src/lib/law-map-overview-layout.mjs";

const lane = { id: "L1", name: "건축법", tier: "statute" };
const articles = [
  { id: "L1:제1조", chapter: null },
  { id: "L1:제2조", chapter: "제1장 총칙" },
  { id: "L1:제3조", chapter: "제1장 총칙" },
  { id: "L1:제4조", chapter: "제2장 건축" },
  { id: "L1:제5조", chapter: null },
];

test("groups articles by chapter in document order, null chapters into one misc group", () => {
  const groups = groupLaneArticles(lane, articles);
  assert.deepEqual(groups.map((g) => [g.id, g.title, g.articleIds.length]), [
    ["L1#misc", MISC_CHAPTER, 2],
    ["L1#ch0", "제1장 총칙", 2],
    ["L1#ch1", "제2장 건축", 1],
  ]);
  assert.deepEqual(groups[0].articleIds, ["L1:제1조", "L1:제5조"]);
  assert.equal(groups[0].isLane, false);
});

test("a lane without chapters becomes one lane-named group", () => {
  const groups = groupLaneArticles({ id: "R3", name: "건축물대장 규칙" }, [{ id: "R3:제1조", chapter: null }, { id: "R3:제2조", chapter: null }]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, "R3#lane");
  assert.equal(groups[0].title, "건축물대장 규칙");
  assert.equal(groups[0].isLane, true);
  assert.deepEqual(groups[0].articleIds, ["R3:제1조", "R3:제2조"]);
});

test("node map sends collapsed articles to their group and expanded ones to themselves", () => {
  const groups = groupLaneArticles(lane, articles);
  const lanes = [lane, { id: "A1", tier: "adminRule" }, { id: "O1", tier: "ordinance" }];
  const closed = buildNodeMap(groups, lanes, new Set());
  assert.equal(closed.get("L1:제2조"), "L1#ch0");
  assert.equal(closed.get("A1"), "A1");
  assert.equal(closed.get("O1"), "O1");
  const open = buildNodeMap(groups, lanes, new Set(["L1#ch0"]));
  assert.equal(open.get("L1:제2조"), "L1:제2조");
  assert.equal(open.get("L1:제4조"), "L1#ch1");
});

test("more than 12 admin-rule lanes collapse into one box", () => {
  const lanes = Array.from({ length: 13 }, (_, i) => ({ id: `A${i + 1}`, tier: "adminRule" }));
  const map = buildNodeMap([], lanes, new Set());
  assert.equal(map.get("A1"), ADMIN_RULE_ALL);
  assert.equal(map.get("A13"), ADMIN_RULE_ALL);
  const few = buildNodeMap([], lanes.slice(0, 12), new Set());
  assert.equal(few.get("A12"), "A12");
});

test("aggregates edges per (from, to, kind), skipping cites, hidden kinds and self loops", () => {
  const groups = groupLaneArticles(lane, articles);
  const lanes = [lane, { id: "A1", tier: "adminRule" }];
  const nodeMap = buildNodeMap(groups, lanes, new Set());
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

test("distributeHeights fills the available height proportionally with a minimum", () => {
  const heights = distributeHeights([10, 1, 30], 200, { min: 20, maxUnit: 100 });
  assert.equal(heights[1], 20);
  assert.ok(heights.every((h) => h >= 20));
  assert.ok(Math.abs(heights.reduce((s, h) => s + h, 0) - 200) < 1e-6);
  assert.ok(heights[2] > heights[0]);
});

test("distributeHeights falls back to minimums when nothing fits and respects maxUnit when sparse", () => {
  assert.deepEqual(distributeHeights([5, 5, 5], 30, { min: 20, maxUnit: 100 }), [20, 20, 20]);
  assert.deepEqual(distributeHeights([10, 20], 10000, { min: 20, maxUnit: 8 }), [80, 160]);
});

test("buildOverviewHeadline counts delegating statute articles and names the busiest chapter", () => {
  const map = {
    name: "건축법",
    lanes: [{ id: "L1", tier: "statute" }, { id: "D1", tier: "decree" }],
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
  assert.ok(h.subtitle.includes("선 굵기 = 위임 건수"));
});

test("buildOverviewHeadline drops the chapter clause when the statute has no chapters", () => {
  const map = {
    name: "짧은 법",
    lanes: [{ id: "L1", tier: "statute" }],
    articles: [{ id: "L1:제1조", laneId: "L1", chapter: null }],
    edges: [{ from: "L1:제1조", kind: "decree" }],
  };
  const h = buildOverviewHeadline(map);
  assert.equal(h.topChapter, null);
  assert.equal(h.title, "「짧은 법」 조문 1개 중 1개가 시행령·시행규칙에 세부를 맡기고 있습니다.");
});
