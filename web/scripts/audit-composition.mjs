// #1 Composition quality audit — ranks all institution boards by how messy
// their rendered geometry is (node-piercings, crossings, bends, route stretch).
//
//   node scripts/audit-composition.mjs            # ranked report + JSON
//   node scripts/audit-composition.mjs --top 30   # show worst 30 (default 20)
//   node scripts/audit-composition.mjs --quiet     # write JSON only

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeComposition } from "./lib/process-composition.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const dataDir = path.join(webRoot, "data/institutions");
const auditDir = path.join(webRoot, "../docs/audits");

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const topN = Number(arg("--top", 20));
const quiet = process.argv.includes("--quiet");

const files = (await fs.readdir(dataDir)).filter((f) => f.endsWith(".json")).sort();

const results = [];
const failures = [];
for (const file of files) {
  const institution = JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8"));
  try {
    results.push(computeComposition(institution));
  } catch (error) {
    failures.push({ slug: institution.slug ?? file, error: error.message.split("\n")[0] });
  }
}

results.sort((a, b) => b.score - a.score || b.metrics.nodePiercings - a.metrics.nodePiercings);

const withPiercings = results.filter((r) => r.metrics.nodePiercings > 0);
const overBudget = results.filter((r) => r.violations.length > 0);
const totalScore = results.reduce((sum, r) => sum + r.score, 0);

const report = {
  generatedAt: new Date().toISOString().slice(0, 10),
  institutions: results.length,
  failures,
  summary: {
    meanScore: round(totalScore / (results.length || 1)),
    withNodePiercings: withPiercings.length,
    overBudget: overBudget.length,
    worstSlug: results[0]?.slug ?? null,
  },
  ranking: results.map((r) => ({
    slug: r.slug,
    name: r.name,
    score: r.score,
    violations: r.violations,
    ...r.metrics,
  })),
};

await fs.mkdir(auditDir, { recursive: true });
const outPath = path.join(auditDir, `composition-${report.generatedAt}.json`);
await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);

if (!quiet) {
  console.log(`\n구성 품질 감사 — 기관 ${report.institutions}개`);
  console.log(
    `평균 점수 ${report.summary.meanScore} · 노드관통 보유 ${withPiercings.length}개 · 예산초과 ${overBudget.length}개\n`
  );
  console.log(
    `${"순위".padStart(4)}  ${"점수".padStart(7)}  ${"관통".padStart(4)}  ${"교차".padStart(4)}  ${"꺾임".padStart(4)}  ${"우회".padStart(5)}  기관`
  );
  console.log("─".repeat(78));
  results.slice(0, topN).forEach((r, i) => {
    const m = r.metrics;
    console.log(
      `${String(i + 1).padStart(4)}  ${String(r.score).padStart(7)}  ` +
        `${String(m.nodePiercings).padStart(4)}  ${String(m.crossings).padStart(4)}  ` +
        `${String(m.bendsPerEdgeMax).padStart(4)}  ${String(m.routeStretchMax).padStart(5)}  ` +
        `${r.name ?? r.slug}${r.violations.length ? "  ⚠ " + r.violations.join(", ") : ""}`
    );
  });
  if (failures.length) {
    console.log(`\n렌더 실패 ${failures.length}개:`);
    failures.forEach((f) => console.log(`  ✗ ${f.slug}: ${f.error}`));
  }
  console.log(`\n리포트: ${path.relative(webRoot, outPath)}`);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
