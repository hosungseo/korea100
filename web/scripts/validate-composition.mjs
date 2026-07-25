// #2 Composition validation gate — runs the real render geometry for every
// board and fails on structural problems the JSON-level `validate:data` can't
// see: hard layout throws (canvas overflow, collinear overlap, label overflow)
// plus the newly-surfaced node-piercing class (edges routed behind unrelated
// cards). Ceilings are set above today's known debt so this passes now and
// blocks egregiously worse new boards. Use --strict to enforce the ideal budget.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeComposition,
  COMPOSITION_BUDGET,
} from "./lib/process-composition.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data/institutions");

const strict = process.argv.includes("--strict");

// Watermark ceilings: no single board may exceed these. Set above the current
// worst (ISMS-P, the pathological dense outlier: 24 piercings / 66 crossings)
// with headroom, so today's known debt passes but a wildly worse new board is
// caught immediately. Fine-grained per-board regressions are the baseline
// gate's job; this only stops egregious new outliers.
const CEILING = strict
  ? { nodePiercings: COMPOSITION_BUDGET.maxNodePiercings, crossings: COMPOSITION_BUDGET.maxCrossings }
  : { nodePiercings: 26, crossings: 72 };

const files = (await fs.readdir(dataDir)).filter((f) => f.endsWith(".json")).sort();

const renderErrors = [];
const overCeiling = [];
for (const file of files) {
  const institution = JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
  let result;
  try {
    result = computeComposition(institution); // buildLayout throws on hard failures
  } catch (error) {
    renderErrors.push({ slug: institution.slug ?? file, error: error.message.split("\n")[0] });
    continue;
  }
  const m = result.metrics;
  const breaches = [];
  if (m.nodePiercings > CEILING.nodePiercings)
    breaches.push(`관통 ${m.nodePiercings}>${CEILING.nodePiercings}`);
  if (m.crossings > CEILING.crossings)
    breaches.push(`교차 ${m.crossings}>${CEILING.crossings}`);
  if (breaches.length) overCeiling.push({ slug: result.slug, breaches });
}

console.log(
  `구성 검증 (${strict ? "strict/이상예산" : "watermark"} 모드) — 보드 ${files.length}개`
);

let failed = false;
if (renderErrors.length) {
  failed = true;
  console.error(`\n❌ 렌더 실패 ${renderErrors.length}개:`);
  renderErrors.forEach((e) => console.error(`  ✗ ${e.slug}: ${e.error}`));
}
if (overCeiling.length) {
  failed = true;
  console.error(`\n❌ 상한 초과 ${overCeiling.length}개:`);
  overCeiling.forEach((b) => console.error(`  ✗ ${b.slug}: ${b.breaches.join(", ")}`));
}

if (failed) {
  process.exit(1);
}
console.log("✅ 모든 보드가 렌더 가능하며 상한 이내입니다.");
