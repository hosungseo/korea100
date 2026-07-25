// #4 Motion renderer — emits a self-contained animated SVG that reveals the
// existing portrait board one stage band at a time (G0→Gn), then loops. No JS,
// no external deps: the acclaimed static render is used as-is and white
// "curtains" over each stage band fade out on the motion schedule.
//
//   node scripts/generate-process-motion.mjs <slug>        # one board
//   node scripts/generate-process-motion.mjs <slug> --embed # inline PNG (portable)
//   node scripts/generate-process-motion.mjs --all          # every board

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMotionSchedule } from "./lib/process-motion.mjs";
import { WIDTH, HEIGHT } from "./generate-process-article-image.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const dataDir = path.join(webRoot, "data/institutions");
const mapDir = path.join(webRoot, "public/exports/process-maps");
const outDir = path.join(webRoot, "public/exports/process-motion");

const STEP_DUR = 0.85; // seconds each stage band takes to reveal
const REVEAL_DUR = 0.6; // fade duration within a step
const HOLD = 2.0; // seconds fully revealed before looping

function round(value) {
  return Math.round(value * 10) / 10;
}

function buildMotionSvg(schedule, imageHref) {
  const steps = schedule.steps;
  const cycle = steps.length * STEP_DUR + HOLD;
  const curtains = steps
    .map((step) => {
      const start = step.stageIndex * STEP_DUR;
      const end = start + REVEAL_DUR;
      const tStart = (start / cycle).toFixed(4);
      const tEnd = (end / cycle).toFixed(4);
      return (
        `<rect x="0" y="${round(step.top)}" width="${WIDTH}" height="${round(step.height)}" fill="#ffffff">` +
        `<animate attributeName="opacity" dur="${cycle.toFixed(2)}s" repeatCount="indefinite" ` +
        `values="1;1;0;0" keyTimes="0;${tStart};${tEnd};1" calcMode="linear"/>` +
        `</rect>`
      );
    })
    .join("\n    ");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">\n` +
    `  <image x="0" y="0" width="${WIDTH}" height="${HEIGHT}" xlink:href="${imageHref}"/>\n` +
    `  <g>\n    ${curtains}\n  </g>\n` +
    `</svg>\n`
  );
}

async function imageHrefFor(slug, embed) {
  const pngPath = path.join(mapDir, `${slug}.png`);
  if (embed) {
    const data = await fs.readFile(pngPath);
    return `data:image/png;base64,${data.toString("base64")}`;
  }
  // Relative to public/exports/process-motion/<slug>.svg
  return `../process-maps/${slug}.png`;
}

async function render(slug, embed) {
  const institution = JSON.parse(
    await fs.readFile(path.join(dataDir, `${slug}.json`), "utf8")
  );
  const schedule = buildMotionSchedule(institution);
  const href = await imageHrefFor(slug, embed);
  const svg = buildMotionSvg(schedule, href);
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${slug}.svg`);
  await fs.writeFile(outPath, svg);
  return { outPath, steps: schedule.stepCount };
}

const embed = process.argv.includes("--embed");
const all = process.argv.includes("--all");

if (all) {
  const slugs = (await fs.readdir(dataDir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  let count = 0;
  for (const slug of slugs) {
    await render(slug, embed);
    count += 1;
  }
  console.log(`모션 SVG ${count}개 생성 → ${path.relative(webRoot, outDir)}`);
} else {
  const slug = process.argv.find(
    (a, i) => i >= 2 && !a.startsWith("--")
  );
  if (!slug) {
    console.error("사용법: node scripts/generate-process-motion.mjs <slug> [--embed] | --all");
    process.exit(2);
  }
  const { outPath, steps } = await render(slug, embed);
  console.log(`모션 SVG 생성: ${path.relative(webRoot, outPath)} (${steps}단계 순차 점등)`);
}
