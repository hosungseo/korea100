#!/usr/bin/env node
/**
 * policy briefing/news  →  institution-candidates queue  →  process DRAFT maps
 *
 * Briefings are discovery signals only.
 * Structure maps are built for named 제도 candidates, not for headlines.
 *
 * Usage:
 *   node scripts/promote-institution-candidate-drafts.mjs
 *   node scripts/promote-institution-candidate-drafts.mjs --limit=10 --status=proposed --quiet
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  institutionCandidatesToProcessDrafts,
} from "./lib/institution-candidate-to-process-draft.mjs";
import { renderProcessDraftSvg } from "./lib/render-process-draft-svg.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const QUEUE = path.join(REPO_DIR, "docs/institution-candidates/queue.json");
const OUT_ROOT = path.join(REPO_DIR, "docs/institution-candidates/process-drafts");

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
    `# Institution-candidate process drafts (${day})`,
    "",
    "> 정책브리핑/뉴스는 **발굴 신호**. 구조도 대상은 **제도 후보 이름**.",
    "> institution-draft · 법령 미검증 · 본 카탈로그 등재 금지.",
    "",
    `| # | institution | basis | svg | signal |`,
    `|---:|---|---|---|---|`,
  ];
  drafts.forEach((d, i) => {
    const basis = d.sourceInstitutionCandidate?.basis ?? "";
    const src = d.sourceNews?.url ? `[기사](${d.sourceNews.url})` : "";
    lines.push(`| ${i + 1} | **${d.name}** | ${basis.slice(0, 40)} | [svg](./${d.slug}.svg) | ${src} |`);
  });
  lines.push("");
  fs.writeFileSync(path.join(dayDir, "README.md"), `${lines.join("\n")}\n`);
}

function main() {
  const quiet = process.argv.includes("--quiet");
  const limit = Number(argValue("--limit", "12"));
  const status = argValue("--status", "proposed");
  const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
  const runDate = localDateKst();

  if (!fs.existsSync(QUEUE)) {
    console.error(`missing institution queue: ${QUEUE}`);
    process.exitCode = 1;
    return;
  }

  const queue = JSON.parse(fs.readFileSync(QUEUE, "utf8"));
  const drafts = institutionCandidatesToProcessDrafts(queue, { limit, statuses, runDate });
  if (!drafts.length) {
    if (!quiet) console.log("no institution candidates matched");
    return;
  }

  const dayDir = path.join(OUT_ROOT, runDate);
  fs.mkdirSync(dayDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    runDate,
    pipeline: "briefing-signal → institution-candidate → process-draft",
    statuses,
    limit,
    count: drafts.length,
    note: "Maps model 제도 candidates, not policy-briefing headlines",
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
      basis: draft.sourceInstitutionCandidate?.basis ?? null,
      ministry: draft.sourceInstitutionCandidate?.ministry ?? null,
      json: path.relative(REPO_DIR, jsonPath),
      svg: path.relative(REPO_DIR, svgPath),
      signalUrl: draft.sourceNews?.url ?? null,
    });
  }

  fs.writeFileSync(path.join(dayDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeIndex(dayDir, runDate, drafts);
  fs.writeFileSync(path.join(OUT_ROOT, "latest-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const days = fs
    .readdirSync(OUT_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  fs.writeFileSync(
    path.join(OUT_ROOT, "README.md"),
    [
      "# institution-candidate → process drafts",
      "",
      "정책브리핑·뉴스로 **후보 제도를 찾고**, 그 제도 이름에 대해 구조도 초안을 만든다.",
      "브리핑 기사 자체를 프로세스로 그리지 않는다.",
      "",
      ...days.map((d) => `- [${d}](./${d}/README.md)`),
      "",
    ].join("\n"),
  );

  if (!process.argv.includes("--no-png")) {
    try {
      const args = [
        path.join(SCRIPT_DIR, "render-process-draft-pngs.mjs"),
        `--day=${runDate}`,
        `--root=${OUT_ROOT}`,
      ];
      if (quiet) args.push("--quiet");
      execFileSync(process.execPath, args, { cwd: WEB_DIR, stdio: "inherit" });
    } catch (error) {
      if (!quiet) console.warn(`png render skipped: ${error.message}`);
    }
  }

  if (!quiet) {
    console.log(`institution process-drafts ${drafts.length} → ${path.relative(REPO_DIR, dayDir)}`);
    for (const d of drafts) console.log(`- ${d.name}`);
  }
}

main();
