import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBlockedRailNudge,
  buildProcessEdgeRouteSlots,
} from "../src/lib/process-layout.mjs";

test("spreads shared ports and overlapping row channels", () => {
  const edges = [
    { id: "E01", source: "A", target: "B", type: "sequence" },
    { id: "E02", source: "A", target: "C", type: "sequence" },
    { id: "E03", source: "D", target: "E", type: "message" },
  ];
  const positions = new Map([
    ["A", { stageIndex: 0, groupIndex: 2 }],
    ["B", { stageIndex: 3, groupIndex: 0 }],
    ["C", { stageIndex: 3, groupIndex: 0 }],
    ["D", { stageIndex: 0, groupIndex: 0 }],
    ["E", { stageIndex: 0, groupIndex: 2 }],
  ]);

  const slots = buildProcessEdgeRouteSlots(edges, positions);

  assert.notEqual(slots.get("E01").sourcePort, slots.get("E02").sourcePort);
  assert.equal(new Set(edges.map((edge) => slots.get(edge.id).channel)).size, 3);
  assert.notEqual(slots.get("E01").rail, slots.get("E02").rail);
  assert.notEqual(slots.get("E01").approach, slots.get("E02").approach);
});

test("routes long edges along the target rail away from their source", () => {
  const edges = [
    { id: "RIGHT", source: "LEFT", target: "RIGHT_TARGET", type: "sequence" },
    { id: "LEFT", source: "RIGHT", target: "LEFT_TARGET", type: "sequence" },
  ];
  const positions = new Map([
    ["LEFT", { stageIndex: 0, groupIndex: 0 }],
    ["RIGHT_TARGET", { stageIndex: 3, groupIndex: 2 }],
    ["RIGHT", { stageIndex: 0, groupIndex: 2 }],
    ["LEFT_TARGET", { stageIndex: 3, groupIndex: 0 }],
  ]);

  const slots = buildProcessEdgeRouteSlots(edges, positions);

  assert.equal(slots.get("RIGHT").railSide, 1);
  assert.equal(slots.get("LEFT").railSide, -1);
});

test("fans blocked source rails monotonically away from the card", () => {
  assert.deepEqual(
    [0, 1, 2, 3].map((channel) => buildBlockedRailNudge(channel, 1, 13)),
    [0, 13, 26, 39],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((channel) => buildBlockedRailNudge(channel, -1, 13)),
    [-0, -13, -26, -39],
  );
});
