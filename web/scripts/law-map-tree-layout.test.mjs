import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTreeLayout, collapseChildren, layoutSubtrees, nodeWidthFor, orphanParentIndex, pickParent, splitChapter, listNames,
} from "../src/lib/law-map-tree-layout.mjs";

const lane = (id, tier, name, extra = {}) => ({ id, tier, name, kind: tier, ...extra });
const art = (laneId, no, chapter) => ({ id: `${laneId}:제${no}조`, laneId, chapter });
const edge = (i, from, to, kind) => ({ id: `e${i}`, from, to, kind });

/** 법률 3장 · 시행령 1레인 3장 · 시행규칙 1레인(장 없음) · 행정규칙 2 · 자치법규. */
function sampleMap() {
  return {
    name: "표본법",
    lanes: [
      lane("L1", "statute", "표본법"),
      lane("D1", "decree", "표본법 시행령"),
      lane("R1", "rule", "표본법 시행규칙"),
      lane("A1", "adminRule", "표본 고시"),
      lane("A2", "adminRule", "표본 훈령"),
      lane("O1", "ordinance", "자치법규", { collapsed: { count: 580, items: [] } }),
    ],
    articles: [
      art("L1", 1, "제1장 총칙"), art("L1", 2, "제1장 총칙"),
      art("L1", 3, "제2장 건축"), art("L1", 4, "제2장 건축"),
      art("L1", 5, "제3장 벌칙"),
      art("D1", 1, "제1장 총칙"), art("D1", 2, "제2장 건축"), art("D1", 3, "제3장 보칙"),
      art("R1", 1, null), art("R1", 2, null),
    ],
    edges: [
      edge(1, "L1:제1조", "D1:제1조", "decree"),
      edge(2, "L1:제3조", "D1:제2조", "decree"),
      edge(3, "L1:제4조", "D1:제2조", "decree"),
      edge(4, "L1:제1조", "D1:제2조", "decree"),     // 제1장도 시행령 제2장에 보내지만 제2장(2건)이 더 많다
      edge(5, "D1:제2조", "R1:제1조", "rule"),
      edge(6, "D1:제2조", "R1:제2조", "rule"),
      edge(7, "L1:제3조", "R1:제1조", "rule"),       // 시행규칙 부모는 시행령 제2장(2건) → 법률 제2장에서 오는 건 건너가는 선
      edge(8, "L1:제3조", "A1", "adminRule"),
      edge(9, "R1:제1조", "A1", "adminRule"),
      edge(10, "R1:제2조", "A1", "adminRule"),
      edge(11, "L1:제1조", "O1", "ordinance"),
      edge(12, "L1:제1조", "O1", "ordinance"),
      edge(13, "L1:제1조", null, "decree"),          // 미해결은 뺀다
      edge(14, "L1:제2조", "L1:제3조", "cites"),      // 인용은 뺀다
    ],
  };
}

test("pickParent: most edges wins, ties go to the earlier document position", () => {
  assert.equal(pickParent([{ source: "a", count: 2, order: 5 }, { source: "b", count: 3, order: 9 }]), "b");
  assert.equal(pickParent([{ source: "a", count: 3, order: 5 }, { source: "b", count: 3, order: 1 }]), "b");
  assert.equal(pickParent([]), null);
});

test("orphanParentIndex maps the relative document position onto the statute chapters", () => {
  assert.equal(orphanParentIndex(0, 10, 4), 0);
  assert.equal(orphanParentIndex(5, 10, 4), 2);
  assert.equal(orphanParentIndex(9, 10, 4), 3);
  assert.equal(orphanParentIndex(0, 0, 4), 0);
  assert.equal(orphanParentIndex(3, 10, 0), -1);
});

test("collapseChildren keeps up to collapseAbove connected children and folds orphans from two", () => {
  const kids = (n, orphan) => Array.from({ length: n }, (_, i) => ({ id: `${orphan ? "o" : "c"}${i}`, orphan, order: orphan ? 100 + i : i }));
  const small = collapseChildren([...kids(3, false), kids(1, true)[0]], 4);
  assert.equal(small.kept.length, 4);
  assert.equal(small.connected, null);
  assert.equal(small.orphans, null);
  const big = collapseChildren([...kids(5, false), ...kids(3, true)], 4);
  assert.equal(big.kept.length, 0);
  assert.equal(big.connected.length, 5);
  assert.equal(big.orphans.length, 3);
  const mixed = collapseChildren([...kids(2, false), ...kids(2, true)], 4);
  assert.deepEqual(mixed.kept.map((k) => k.id), ["c0", "c1"]);
  assert.equal(mixed.orphans.length, 2);
});

test("layoutSubtrees: subtree width is the wider of node and children; parent is centered over children", () => {
  const childrenOf = new Map([["p", ["a", "b"]], ["q", ["c"]]]);
  const widthOf = new Map([["p", 50], ["a", 100], ["b", 100], ["q", 120], ["c", 40]]);
  const { xOf, subtreeW, width } = layoutSubtrees(["p", "q"], childrenOf, widthOf, { siblingGap: 10, treeGap: 20 });
  assert.equal(subtreeW.get("p"), 210);
  assert.equal(xOf.get("a"), 0);
  assert.equal(xOf.get("b"), 110);
  assert.equal(xOf.get("p"), 80);                   // (210 - 50) / 2
  assert.equal(subtreeW.get("q"), 120);             // node wider than its child
  assert.equal(xOf.get("q"), 230);
  assert.equal(xOf.get("c"), 230 + 40);             // child centered under the parent
  assert.equal(width, 350);
});

test("nodeWidthFor grows with the square root and is clamped", () => {
  assert.equal(nodeWidthFor(0, 96, 200, 28), 96);
  assert.equal(nodeWidthFor(25, 96, 200, 28), 140);
  assert.equal(nodeWidthFor(400, 96, 200, 28), 200);
});

test("splitChapter and listNames", () => {
  assert.deepEqual(splitChapter("제8장의2 건축협정"), { no: "제8장의2", rest: "건축협정" });
  assert.deepEqual(splitChapter("건축법 시행규칙"), { no: null, rest: "건축법 시행규칙" });
  assert.deepEqual(listNames(["a", "b", "c"], 2), { items: ["a", "b"], more: 1 });
});

test("buildTreeLayout: decree chapters hang under the statute chapter that delegates most; orphans attach by relative position", () => {
  const L = buildTreeLayout(sampleMap());
  const byId = new Map(L.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get("D1#ch0").parentId, "L1#ch0");
  assert.equal(byId.get("D1#ch1").parentId, "L1#ch1");           // 2건 > 1건
  assert.equal(byId.get("D1#ch2").orphan, true);
  assert.equal(byId.get("D1#ch2").parentId, "L1#ch2");           // index 2/3 → 법률 3장 중 세 번째
  // 시행규칙(장 없음 → 레인 묶음)은 rule선이 가장 많은 시행령 제2장 아래
  assert.equal(byId.get("R1#lane").parentId, "D1#ch1");
  assert.equal(byId.get("R1#lane").row, 2);
  // 행정규칙: A1은 R1(2건) 아래, A2는 선이 없어 고아 상자
  assert.equal(byId.get("adm:R1#lane").meta.laneIds[0], "A1");
  assert.equal(byId.get("adm:R1#lane").label, "행정규칙 1건");
  const orphanAdmin = L.nodes.find((n) => n.kind === "adminRules" && n.orphan);
  assert.ok(orphanAdmin);
  assert.deepEqual(orphanAdmin.meta.laneIds, ["A2"]);
  // 조례: 출발 묶음별 위임 건수 상자
  assert.equal(byId.get("ord:L1#ch0").label, "조례 위임 2건");
  assert.equal(byId.get("ord:L1#ch0").meta.total, 580);
  // 조문·레인 → 노드
  assert.equal(L.nodeOf.get("L1:제3조"), "L1#ch1");
  assert.equal(L.nodeOf.get("A1"), "adm:R1#lane");
  assert.equal(L.nodeOf.get("O1"), "ord:L1#ch0");
});

test("buildTreeLayout: connectors carry per-kind counts and non-parent delegations become cross edges", () => {
  const L = buildTreeLayout(sampleMap());
  const conn = (p, c) => L.connectors.find((k) => k.parentId === p && k.childId === c);
  assert.equal(conn("L1#ch1", "D1#ch1").count, 2);
  assert.equal(conn("L1#ch1", "D1#ch1").byKind.decree, 2);
  assert.equal(conn("D1#ch1", "R1#lane").count, 2);
  assert.equal(conn("R1#lane", "adm:R1#lane").byKind.adminRule, 2);
  assert.equal(conn("L1#ch0", "ord:L1#ch0").count, 2);
  assert.ok(!L.connectors.some((k) => k.childId === "D1#ch2"), "orphans have no connector");
  const cross = L.crossEdges.map((c) => `${c.from}>${c.to}>${c.kind}×${c.count}`).sort();
  assert.deepEqual(cross, ["L1#ch0>D1#ch1>decree×1", "L1#ch1>R1#lane>rule×1", "L1#ch1>adm:R1#lane>adminRule×1"]);
});

test("buildTreeLayout: geometry — rows top-down, parent centered over children, no overlap among siblings", () => {
  const L = buildTreeLayout(sampleMap());
  const byId = new Map(L.nodes.map((n) => [n.id, n]));
  const rowsY = L.rows.map((r) => r.y);
  assert.deepEqual([...rowsY].sort((a, b) => a - b), rowsY);
  assert.equal(L.rows.length, 4);
  for (const n of L.nodes) assert.ok([n.x, n.y, n.w, n.h].every(Number.isFinite), `finite geometry for ${n.id}`);
  // 법률 제2장의 자식: 시행령 제2장(줄 1) + 고아 행정규칙 상자(줄 3, 상대 위치로 붙음). 부모는 그 전체 폭의 가운데.
  const p = byId.get("L1#ch1");
  const kids = L.nodes.filter((n) => n.parentId === "L1#ch1");
  assert.deepEqual(kids.map((k) => k.id).sort(), ["D1#ch1", "adm:L1#ch1:orphan"]);
  const left = Math.min(...kids.map((k) => k.x));
  const right = Math.max(...kids.map((k) => k.x + k.w));
  assert.ok(Math.abs((p.x + p.w / 2) - (left + right) / 2) < 0.2, "parent centered over all of its children");
  // 자식이 하나뿐인 기둥은 부모와 자식의 가운데가 같다
  const q = byId.get("L1#ch2");
  const qKid = byId.get("D1#ch2");
  assert.ok(Math.abs((q.x + q.w / 2) - (qKid.x + qKid.w / 2)) < 0.2);
  const row0 = L.nodes.filter((n) => n.row === 0).sort((a, b) => a.x - b.x);
  for (let i = 1; i < row0.length; i++) assert.ok(row0[i].x >= row0[i - 1].x + row0[i - 1].w, "statute pillars do not overlap");
  assert.ok(L.width >= Math.max(...L.nodes.map((n) => n.x + n.w)) - 0.2);
  assert.ok(L.height >= Math.max(...L.nodes.map((n) => n.y + n.h)) - 0.2);
  // 잎 상자는 같은 부모 밑에서 세로로 쌓인다
  const adm = byId.get("adm:R1#lane");
  assert.equal(adm.row, 3);
  assert.equal(adm.y, L.rows[3].y);
});

test("buildTreeLayout: collapse rule folds more than collapseAbove connected children into one summary that keeps its children", () => {
  const m = sampleMap();
  // 법률 제1장에서 시행령 6개 레인(장 없음)에 각각 위임
  for (let i = 2; i <= 7; i++) {
    m.lanes.push(lane(`D${i}`, "decree", `규정 ${i}`));
    m.articles.push(art(`D${i}`, 1, null));
    m.edges.push(edge(100 + i, "L1:제2조", `D${i}:제1조`, "decree"));
  }
  // 그중 D3에서 시행규칙 R2로 위임 → R2는 요약 상자 아래 붙는다
  m.lanes.push(lane("R2", "rule", "규정 3 시행규칙"));
  m.articles.push(art("R2", 1, null));
  m.edges.push(edge(200, "D3:제1조", "R2:제1조", "rule"));
  const L = buildTreeLayout(m, { collapseAbove: 4 });
  const byId = new Map(L.nodes.map((n) => [n.id, n]));
  const summary = L.nodes.find((n) => n.kind === "summary" && n.parentId === "L1#ch0");
  assert.ok(summary, "summary box exists under 법률 제1장");
  assert.equal(summary.label, "시행령 7장");                      // D1#ch0(장 있음) + D2..D7(장 없음) → 섞이면 "장"
  assert.equal(summary.meta.childIds.length, 7);
  assert.equal(summary.meta.items.length, 7);
  assert.ok(!byId.has("D3#lane"), "collapsed chapters are not drawn individually");
  assert.equal(byId.get("R2#lane").parentId, summary.id);
  assert.equal(L.nodeOf.get("D3:제1조"), summary.id);
  const conn = L.connectors.find((k) => k.childId === summary.id);
  assert.equal(conn.count, 7);
  const withSix = buildTreeLayout(m, { collapseAbove: 8 });
  assert.ok(withSix.nodes.some((n) => n.id === "D3#lane"), "raising the threshold keeps chapters individual");
});

test("buildTreeLayout: a tier with zero lanes yields no NaN and skips that row", () => {
  const m = sampleMap();
  m.lanes = m.lanes.filter((l) => l.tier !== "rule");
  m.articles = m.articles.filter((a) => a.laneId !== "R1");
  m.edges = m.edges.filter((e) => !e.from.startsWith("R1") && !(e.to ?? "").startsWith("R1"));
  const L = buildTreeLayout(m);
  assert.ok(L.nodes.length > 0);
  for (const n of L.nodes) assert.ok([n.x, n.y, n.w, n.h].every(Number.isFinite), `finite geometry for ${n.id}`);
  assert.ok(Number.isFinite(L.width) && Number.isFinite(L.height));
  assert.deepEqual(L.rows.map((r) => r.row), [0, 1, 3]);
  assert.equal(L.rows[2].y, L.rows[1].y + L.rows[1].h + 52);
});

test("buildTreeLayout: repeated chapter titles stay separate nodes in document order", () => {
  const m = {
    name: "민법",
    lanes: [lane("L1", "statute", "민법")],
    articles: [art("L1", 1, "제1장 총칙"), art("L1", 2, "제2장 인"), art("L1", 3, "제1장 총칙")],
    edges: [],
  };
  const L = buildTreeLayout(m);
  const row0 = L.nodes.filter((n) => n.row === 0).sort((a, b) => a.x - b.x);
  assert.deepEqual(row0.map((n) => [n.id, n.label]), [["L1#ch0", "제1장 총칙"], ["L1#ch1", "제2장 인"], ["L1#ch2", "제1장 총칙"]]);
  assert.equal(L.connectors.length, 0);
  assert.equal(L.crossEdges.length, 0);
});

test("buildTreeLayout: a map without statute chapters returns an empty layout", () => {
  const L = buildTreeLayout({ name: "빈 법", lanes: [lane("L1", "statute", "빈 법")], articles: [], edges: [] });
  assert.equal(L.nodes.length, 0);
  assert.equal(L.width, 0);
  assert.ok(L.headline.title.includes("빈 법"));
});
