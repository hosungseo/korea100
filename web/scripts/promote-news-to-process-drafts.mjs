#!/usr/bin/env node
/**
 * Turn news-candidates latest.json into Korea100-style process DRAFT maps.
 * Outputs JSON drafts + SVG structure maps. Does NOT write production catalog.
 *
 * Usage:
 *   node scripts/promote-news-to-process-drafts.mjs
 *   node scripts/promote-news-to-process-drafts.mjs --limit=8 --quiet
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { candidatesToProcessDrafts } from "./lib/news-to-process-draft.mjs";
import { renderProcessDraftSvg } from "./lib/render-process-draft-svg.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const FEED = path.join(REPO_DIR, "docs/news-candidates/latest.json");
const OUT_ROOT = path.join(REPO_DIR, "docs/news-candidates/process-drafts");

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function localDateKst(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

function writeIndex(dayDir, day, drafts) {
  const lines = [
    `# Korea100 process drafts from news (${day})`,
    "",
    "> **news-draft**: 자동 구조도 초안. 법령 검증 전 본 카탈로그 등재 금지.",
    "",
    `| # | name | slug | svg | source |`,
    `|---:|---|---|---|---|`,
  ];
  drafts.forEach((d, i) => {
    const src = d.sourceNews?.url ? `[link](${d.sourceNews.url})` : "";
    lines.push(`| ${i + 1} | ${d.name} | \`${d.slug}\` | [svg](./${d.slug}.svg) | ${src} |`);
  });
  lines.push("");
  fs.writeFileSync(path.join(dayDir, "README.md"), `${lines.join("\n")}\n`);
}

function main() {
  const quiet = process.argv.includes("--quiet");
  const limit = Number(argValue("--limit", "8"));
  if (!fs.existsSync(FEED)) {
    console.error(`missing feed: ${FEED}`);
    process.exitCode = 1;
    return;
  }
  const feed = JSON.parse(fs.readFileSync(FEED, "utf8"));
  const runDate = feed.runDate || localDateKst();
  const drafts = candidatesToProcessDrafts(feed.candidates ?? [], { limit, runDate });
  const dayDir = path.join(OUT_ROOT, runDate);
  fs.mkdirSync(dayDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    runDate,
    sourceFeedGeneratedAt: feed.generatedAt ?? null,
    limit,
    count: drafts.length,
    note: "news-draft process maps only; not production institutions",
    drafts: [],
  };

  for (const draft of drafts) {
    const jsonPath = path.join(dayDir, `${draft.slug}.json`);
    const svgPath = path.join(dayDir, `${draft.slug}.svg`);
    fs.writeFileSync(jsonPath, `${JSON.stringify(draft, null, 2)}\n`);
    fs.writeFileSync(svgPath, renderProcessDraftSvg(draft));
    manifest.drafts.push({
      slug: draft.slug,
      name: draft.name,
      json: path.relative(REPO_DIR, jsonPath),
      svg: path.relative(REPO_DIR, svgPath),
      sourceUrl: draft.sourceNews?.url ?? null,
    });
  }

  fs.writeFileSync(path.join(dayDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeIndex(dayDir, runDate, drafts);
  fs.writeFileSync(path.join(OUT_ROOT, "latest-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  // root index of days
  const days = fs
    .readdirSync(OUT_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  const rootMd = [
    "# news → process drafts",
    "",
    "뉴스 후보를 Korea100 스타일 **제도 구조도 초안(SVG)** 으로 변환한 산출물.",
    "검증 전 등재 금지. `docs/recipes/institution-creation` 으로만 승격.",
    "",
    ...days.map((d) => `- [${d}](./${d}/README.md)`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT_ROOT, "README.md"), rootMd);


  if (!process.argv.includes("--no-png")) {
    try {
      const args = [path.join(SCRIPT_DIR, "render-process-draft-pngs.mjs"), `--day=${runDate}`];
      if (quiet) args.push("--quiet");
      execFileSync(process.execPath, args, { cwd: WEB_DIR, stdio: "inherit" });
    } catch (error) {
      if (!quiet) console.warn(`png render skipped: ${error.message}`);
    }
  }

  if (!quiet) {
    console.log(`process-drafts ${drafts.length} → ${path.relative(REPO_DIR, dayDir)}`);
    for (const d of drafts) console.log(`- ${d.name}`);
  }
}

main();
