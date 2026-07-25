import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeComposition,
  compositionScore,
  budgetViolations,
} from "./lib/process-composition.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data/institutions");

async function load(slug) {
  return JSON.parse(await fs.readFile(path.join(dataDir, `${slug}.json`), "utf8"));
}

test("detects edges routed behind unrelated cards (node-piercing)", async () => {
  // ISMS-P is the densest board and still routes several edges behind cards.
  const result = computeComposition(await load("isms-p-certification-audit"));
  assert.ok(result.metrics.nodePiercings > 0);
  assert.ok(result.metrics.piercingOffenders.length === result.metrics.nodePiercings);
  assert.ok(result.violations.some((v) => v.startsWith("node-piercing")));
});

test("gutter router keeps in-row/return edges out from behind cards", async () => {
  // administrative-appeal's L09 (P07→P05) used to hide behind P06; the gutter
  // rerouting must keep this board free of node-piercings.
  const result = computeComposition(
    await load("administrative-appeal-procedure-review")
  );
  assert.equal(result.metrics.nodePiercings, 0);
});

test("metrics are finite and route stretch is floored, never exploding", async () => {
  const result = computeComposition(
    await load("administrative-appeal-procedure-review")
  );
  const m = result.metrics;
  assert.equal(m.nodes, 12);
  assert.equal(m.edges, 14);
  assert.ok(Number.isFinite(m.crossings) && m.crossings >= 0);
  assert.ok(m.routeStretchMax >= 1 && m.routeStretchMax < 10);
  assert.ok(m.bendsPerEdgeMax >= 1);
});

test("score is monotonic in node-piercings", () => {
  const base = {
    nodePiercings: 0,
    crossings: 2,
    bendsPerEdgeMax: 2,
    routeStretchMax: 1.2,
    adjustedLabels: 0,
  };
  const worse = { ...base, nodePiercings: 3 };
  assert.ok(compositionScore(worse) > compositionScore(base));
});

test("budget violations flag over-budget boards only", () => {
  const clean = {
    nodePiercings: 0,
    crossings: 1,
    bendsPerEdgeMax: 2,
    routeStretchMax: 1.1,
    adjustedLabels: 0,
  };
  assert.equal(budgetViolations(clean).length, 0);
  const messy = { ...clean, nodePiercings: 5, crossings: 40 };
  assert.ok(budgetViolations(messy).length >= 2);
});
