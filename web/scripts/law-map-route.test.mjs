import test from "node:test";
import assert from "node:assert/strict";
import { countEdgeKinds, findRoute, indexEdgesByNode } from "../src/lib/law-map-route.mjs";

const edges = [
  { id: "e1", from: "L1:제11조", to: "D1:제8조", kind: "decree" },
  { id: "e2", from: "D1:제8조", to: "R1:제6조", kind: "rule" },
  { id: "e3", from: "L1:제11조", to: "A1", kind: "adminRule" },
  { id: "e4", from: "L1:제11조", to: null, kind: "cites" },
  { id: "e5", from: "L1:제12조", to: null, kind: "rule", unresolved: true },
  { id: "e6", from: "L1:제11조", to: "O1", kind: "ordinance" },
];

test("findRoute returns the shortest downward path", () => {
  assert.deepEqual(findRoute(edges, "L1:제11조", "R1:제6조"), { nodes: ["L1:제11조", "D1:제8조", "R1:제6조"], edges: ["e1", "e2"] });
  assert.deepEqual(findRoute(edges, "L1:제11조", "A1"), { nodes: ["L1:제11조", "A1"], edges: ["e3"] });
});

test("findRoute returns null when no path exists and a trivial route for same node", () => {
  assert.equal(findRoute(edges, "R1:제6조", "L1:제11조"), null);
  assert.equal(findRoute(edges, "L1:제12조", "R1:제6조"), null);
  assert.deepEqual(findRoute(edges, "D1:제8조", "D1:제8조"), { nodes: ["D1:제8조"], edges: [] });
});

test("indexEdgesByNode lists edges touching each node", () => {
  const index = indexEdgesByNode(edges);
  assert.deepEqual(index.get("D1:제8조").map((e) => e.id), ["e1", "e2"]);
  assert.deepEqual(index.get("L1:제11조").map((e) => e.id), ["e1", "e3", "e4", "e6"]);
  assert.equal(index.get("없음"), undefined);
});

test("countEdgeKinds tallies every kind", () => {
  assert.deepEqual(countEdgeKinds(edges), { decree: 1, rule: 2, adminRule: 1, ordinance: 1, cites: 1 });
});
