#!/usr/bin/env node
/**
 * Korea100 full pipeline 1→4 with audit gates.
 *
 * 1) discover news candidates (signal feed + archive)
 * 2) extract institution candidates into queue (deterministic judge + optional claude)
 * 3) promote clear-basis drafts (SVG/PNG)
 * 4) register clear-basis proposed into institutions (law DRF verified), capped
 *
 * Usage:
 *   node scripts/pipeline-institution-full.mjs --quiet
 *   node scripts/pipeline-institution-full.mjs --max-register=2 --no-claude-judge
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createAuditSession } from "./lib/pipeline-audit.mjs";
import { extractInstitutionCandidatesFromFeed } from "./lib/deterministic-institution-judge.mjs";
import { hasClearLegalBasis } from "./lib/institution-candidate-to-process-draft.mjs";
import { searchLaws, pickBestLawMatch } from "./lib/law-drf-client.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const QUEUE = path.join(REPO_DIR, "docs/institution-candidates/queue.json");
const QUEUE_MD = path.join(REPO_DIR, "docs/institution-candidates/queue.md");
const FEED = path.join(REPO_DIR, "docs/news-candidates/latest.json");
const MANIFEST = path.join(REPO_DIR, "docs/institutions-100-manifest.json");

function argValue(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
}
function hasFlag(name) {
  return process.argv.includes(name);
}
function runNode(rel, args = []) {
  execFileSync(process.execPath, [path.join(SCRIPT_DIR, rel), ...args], {
    cwd: WEB_DIR,
    stdio: hasFlag("--quiet") ? "pipe" : "inherit",
    env: process.env,
    timeout: 600_000,
  });
}

function todayKst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function loadJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeQueueMd(queue) {
  const open = (queue.candidates || []).filter((c) => c.status === "proposed");
  const rejected = (queue.candidates || []).filter((c) => c.status === "rejected").slice(-8);
  const lines = [
    `# korea100 신규 제도 후보 검토 큐 (${todayKst()})`,
    "",
    "정책브리핑/뉴스는 **발굴 신호**. 구조도·등재 대상은 **제도 후보**.",
    "",
    "## proposed",
    "",
    ...open.map((c) =>
      [
        `## ${c.name}`,
        `- 근거: ${c.basis}`,
        `- 소관: ${c.ministry}`,
        `- 출처: ${c.source} · 최초 ${c.firstSeen}`,
        `- 근거: ${c.why || ""}`,
        ...(c.articles || []).slice(0, 2).map((a) => `- ${a.publishedAt || ""} [${a.title}](${a.url || "#"})`),
        "",
      ].join("\n"),
    ),
    "## recent rejected",
    "",
    ...rejected.map((c) => `- **${c.name}**: ${c.rejectReason || c.basis}`),
    "",
  ];
  fs.writeFileSync(QUEUE_MD, lines.join("\n"));
}

async function enrichBasisWithLawSearch(candidate, audit) {
  if (!candidate.basis || candidate.basis === "확인 필요") {
    const searched = await searchLaws(candidate.name, { limit: 5 });
    const matched = pickBestLawMatch(candidate.name, searched.laws);
    audit.gate("basis-law-search", Boolean(matched), {
      name: candidate.name,
      matched: matched?.name || null,
      mst: matched?.mst || null,
    });
    if (matched?.name) {
      candidate.basis = matched.name;
      candidate.basisMst = matched.mst;
      return true;
    }
    return false;
  }
  // validate existing basis hint
  const q = String(candidate.basis).split(/[—,(]/)[0].trim();
  const searched = await searchLaws(q, { limit: 5 });
  const matched = pickBestLawMatch(q, searched.laws);
  const ok = Boolean(matched?.mst);
  audit.gate("basis-law-validate", ok, {
    name: candidate.name,
    basis: candidate.basis,
    matched: matched?.name || null,
    mst: matched?.mst || null,
    total: searched.total,
  });
  if (ok) {
    candidate.basis = matched.name;
    candidate.basisMst = matched.mst;
  }
  return ok;
}

async function main() {
  const audit = createAuditSession({ repoDir: REPO_DIR });
  const maxRegister = Number(argValue("--max-register", "2"));
  const noClaude = hasFlag("--no-claude-judge") || true; // cron default deterministic
  let status = "ok";

  try {
    // ---- Stage 1 ----
    audit.stage("1-discover-candidates", "running");
    runNode("discover-news-candidates.mjs", hasFlag("--quiet") ? ["--quiet"] : []);
    const feed = loadJson(FEED, null);
    const feedOk = Boolean(feed?.candidates?.length && feed?.sourceCounts);
    if (!audit.gate("stage1-feed-exists", feedOk, {
      candidates: feed?.candidates?.length || 0,
      sourceCounts: feed?.sourceCounts || null,
      generatedAt: feed?.generatedAt || null,
    })) {
      throw new Error("stage1 feed invalid");
    }
    // archive day-latest gate
    const day = feed.runDate || todayKst();
    const archiveDay = path.join(REPO_DIR, "docs/news-candidates/archive", day, "day-latest.json");
    audit.gate("stage1-archive-day-latest", fs.existsSync(archiveDay), { path: path.relative(REPO_DIR, archiveDay) });
    audit.count("newsCandidates", feed.candidates.length);
    audit.stage("1-discover-candidates", "ok", { candidates: feed.candidates.length });

    // ---- Stage 2 ----
    audit.stage("2-institution-candidates", "running");
    const manifest = loadJson(MANIFEST, []);
    const names = (Array.isArray(manifest) ? manifest : []).map((m) => m.name).filter(Boolean);
    let queue = loadJson(QUEUE, { candidates: [] });
    const before = (queue.candidates || []).length;

    // optional legacy claude judge (off by default in cron)
    if (!noClaude && !hasFlag("--no-claude-judge")) {
      try {
        runNode("discover-institution-candidates.mjs", ["--no-collect"]);
        queue = loadJson(QUEUE, queue);
        audit.gate("stage2-claude-judge", true, {});
      } catch (error) {
        audit.gate("stage2-claude-judge", false, { error: error.message });
      }
    }

    const extracted = extractInstitutionCandidatesFromFeed(feed.candidates, {
      existingNames: names,
      queueNames: (queue.candidates || []).map((c) => c.name),
    });
    let added = 0;
    for (const c of extracted.slice(0, 12)) {
      // law-search enrichment gate
      let okBasis = false;
      try {
        okBasis = await enrichBasisWithLawSearch(c, audit);
      } catch (error) {
        audit.gate("basis-law-search-error", false, { name: c.name, error: error.message });
      }
      if (!okBasis && c.basis === "확인 필요") {
        // still enqueue but marked weak
        c.auditFlags = ["weak-basis"];
      }
      if ((queue.candidates || []).some((q) => q.name === c.name)) continue;
      if (names.includes(c.name)) continue;
      queue.candidates = queue.candidates || [];
      queue.candidates.push({
        ...c,
        firstSeen: todayKst(),
      });
      added += 1;
    }
    // reject weak basis sitting too long? not here.

    // clear-basis annotation
    for (const c of queue.candidates || []) {
      if (c.status === "proposed") {
        c.clearBasis = hasClearLegalBasis(c);
      }
    }
    queue.updatedAt = todayKst();
    queue.note =
      "pipeline 1-4: briefing=signal, queue=institution candidates, drafts/register only clear-basis";
    fs.mkdirSync(path.dirname(QUEUE), { recursive: true });
    fs.writeFileSync(QUEUE, `${JSON.stringify(queue, null, 1)}\n`);
    writeQueueMd(queue);

    const proposed = (queue.candidates || []).filter((c) => c.status === "proposed");
    const clearProposed = proposed.filter((c) => hasClearLegalBasis(c));
    audit.count("queueTotal", (queue.candidates || []).length);
    audit.count("proposed", proposed.length);
    audit.count("clearProposed", clearProposed.length);
    audit.count("stage2Added", added);
    audit.gate("stage2-queue-written", fs.existsSync(QUEUE), { added, before, after: (queue.candidates || []).length });
    audit.stage("2-institution-candidates", "ok", { added, proposed: proposed.length, clearProposed: clearProposed.length });

    // ---- Stage 3 ----
    audit.stage("3-process-drafts", "running");
    try {
      runNode("promote-institution-candidate-drafts.mjs", [
        "--status=proposed",
        `--limit=${Math.max(clearProposed.length, 1)}`,
        ...(hasFlag("--quiet") ? ["--quiet"] : []),
      ]);
      const draftManifest = path.join(
        REPO_DIR,
        "docs/institution-candidates/process-drafts/latest-manifest.json",
      );
      const dm = loadJson(draftManifest, null);
      audit.gate("stage3-draft-manifest", Boolean(dm?.count >= 0), {
        count: dm?.count ?? null,
        runDate: dm?.runDate ?? null,
      });
      const pngManifest = path.join(
        REPO_DIR,
        "docs/institution-candidates/process-drafts/latest-png-manifest.json",
      );
      const pm = loadJson(pngManifest, null);
      audit.gate("stage3-png", Boolean(pm?.count > 0 || dm?.count === 0), {
        pngCount: pm?.count ?? 0,
      });
      audit.count("drafts", dm?.count ?? 0);
      audit.count("draftPngs", pm?.count ?? 0);
      audit.stage("3-process-drafts", "ok", { drafts: dm?.count ?? 0 });
    } catch (error) {
      audit.error(error.message, { stage: 3 });
      audit.stage("3-process-drafts", "error", { error: error.message });
      // non-fatal for stage4 if drafts fail
    }

    // ---- Stage 4 ----
    audit.stage("4-register", "running");
    try {
      const out = execFileSync(
        process.execPath,
        [
          path.join(SCRIPT_DIR, "register-clear-basis-from-queue.mjs"),
          `--limit=${maxRegister}`,
          ...(hasFlag("--quiet") ? ["--quiet"] : []),
          ...(hasFlag("--dry-run-register") ? ["--dry-run"] : []),
        ],
        { cwd: WEB_DIR, encoding: "utf8", timeout: 900_000, env: process.env },
      );
      if (!hasFlag("--quiet")) process.stdout.write(out);
      const last = out.trim().split(/\n/).pop();
      let parsed = {};
      try {
        parsed = JSON.parse(last);
      } catch {
        parsed = {};
      }
      audit.gate("stage4-register-ran", true, parsed);
      audit.count("registered", parsed.registered ?? 0);
      audit.stage("4-register", "ok", parsed);
    } catch (error) {
      status = "partial";
      audit.error(error.message, { stage: 4 });
      audit.stage("4-register", "error", { error: error.message });
    }
  } catch (error) {
    status = "error";
    audit.error(error.message);
  }

  const summary = audit.finish(status);
  if (!hasFlag("--quiet")) {
    console.log(
      `pipeline ${summary.status} runId=${summary.runId} counts=${JSON.stringify(summary.counts)}`,
    );
    console.log(`audit ${summary.paths.summary}`);
  }
  console.log(
    JSON.stringify({
      pipeline: "institution-full-1to4",
      status: summary.status,
      runId: summary.runId,
      counts: summary.counts,
      audit: summary.paths.summary,
    }),
  );
  if (summary.status === "error") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
