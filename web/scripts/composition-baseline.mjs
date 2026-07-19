// #3 Golden baseline + #2 regression gate for composition quality.
//
// Because ~80% of boards currently exceed the ideal budget (horizontal loop
// edges routed behind cards), a hard budget gate is not yet realistic. Instead
// we freeze the CURRENT geometry as a golden baseline and fail CI when any
// board gets WORSE — more node-piercings or a materially higher score. This
// ratchets quality down without blocking today's known debt.
//
//   node scripts/composition-baseline.mjs --update   # write/refresh baseline
//   node scripts/composition-baseline.mjs            # check vs baseline (gate)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeComposition } from "./lib/process-composition.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const dataDir = path.join(webRoot, "data/institutions");
const baselineDir = path.join(__dirname, "quality-baseline");
const baselinePath = path.join(baselineDir, "composition-baseline.json");

const SCORE_TOLERANCE = 1; // ignore sub-point score jitter

async function collect() {
  const files = (await fs.readdir(dataDir)).filter((f) => f.endsWith(".json")).sort();
  const map = {};
  for (const file of files) {
    const institution = JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
    const { slug, score, metrics } = computeComposition(institution);
    map[slug] = {
      score,
      nodePiercings: metrics.nodePiercings,
      crossings: metrics.crossings,
      bendsPerEdgeMax: metrics.bendsPerEdgeMax,
      routeStretchMax: metrics.routeStretchMax,
    };
  }
  return map;
}

const update = process.argv.includes("--update");
const current = await collect();

if (update) {
  await fs.mkdir(baselineDir, { recursive: true });
  await fs.writeFile(
    baselinePath,
    `${JSON.stringify({ version: 1, boards: current }, null, 2)}\n`
  );
  console.log(
    `구성 품질 베이스라인 갱신: ${Object.keys(current).length}개 보드 → ${path.relative(webRoot, baselinePath)}`
  );
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(await fs.readFile(baselinePath, "utf8")).boards;
} catch {
  console.error(
    "베이스라인이 없습니다. 먼저 `node scripts/composition-baseline.mjs --update`를 실행하세요."
  );
  process.exit(2);
}

const regressions = [];
const newBoards = [];
for (const [slug, now] of Object.entries(current)) {
  const was = baseline[slug];
  if (!was) {
    newBoards.push(slug);
    continue;
  }
  const reasons = [];
  if (now.nodePiercings > was.nodePiercings)
    reasons.push(`관통 ${was.nodePiercings}→${now.nodePiercings}`);
  if (now.score > was.score + SCORE_TOLERANCE)
    reasons.push(`점수 ${was.score}→${now.score}`);
  if (reasons.length) regressions.push({ slug, reasons });
}

if (newBoards.length) {
  console.log(`신규 보드 ${newBoards.length}개 (베이스라인 미포함): ${newBoards.join(", ")}`);
  console.log("→ 검토 후 `--update`로 베이스라인에 편입하세요.");
}

if (regressions.length) {
  console.error(`\n❌ 구성 품질 회귀 ${regressions.length}건:`);
  for (const { slug, reasons } of regressions) {
    console.error(`  ✗ ${slug}: ${reasons.join(", ")}`);
  }
  console.error(
    "\n의도된 변경이면 `node scripts/composition-baseline.mjs --update`로 베이스라인을 갱신하세요."
  );
  process.exit(1);
}

console.log(
  `✅ 구성 품질 회귀 없음 — ${Object.keys(current).length}개 보드가 베이스라인 이내입니다.`
);
