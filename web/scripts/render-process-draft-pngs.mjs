#!/usr/bin/env node
/**
 * Rasterize news-draft process maps to Korea100 portrait PNG (1800x2400).
 *
 * Usage:
 *   node scripts/render-process-draft-pngs.mjs
 *   node scripts/render-process-draft-pngs.mjs --day=2026-09-01 --quiet
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { renderProcessDraftPortraitSvg, PORTRAIT } from "./lib/render-process-draft-portrait.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const DEFAULT_DRAFT_ROOT = path.join(REPO_DIR, "docs/institution-candidates/process-drafts");

function argValue(name, fallback = null) {
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

async function renderOne(jsonPath, outDir) {
  const raw = await fs.readFile(jsonPath, "utf8");
  const institution = JSON.parse(raw);
  const svg = renderProcessDraftPortraitSvg(institution);
  const svgPath = path.join(outDir, `${institution.slug}.portrait.svg`);
  const pngPath = path.join(outDir, `${institution.slug}.png`);
  await fs.writeFile(svgPath, svg);
  await sharp(Buffer.from(svg))
    .resize(PORTRAIT.width, PORTRAIT.height, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toFile(pngPath);
  const meta = await sharp(pngPath).metadata();
  if (meta.width !== PORTRAIT.width || meta.height !== PORTRAIT.height) {
    throw new Error(`PNG size mismatch for ${institution.slug}: ${meta.width}x${meta.height}`);
  }
  return {
    slug: institution.slug,
    name: institution.name,
    png: path.relative(REPO_DIR, pngPath),
    portraitSvg: path.relative(REPO_DIR, svgPath),
    width: meta.width,
    height: meta.height,
  };
}

async function main() {
  const quiet = process.argv.includes("--quiet");
  const day = argValue("--day", localDateKst());
  const DRAFT_ROOT = path.resolve(argValue("--root", DEFAULT_DRAFT_ROOT));
  const dayDir = path.join(DRAFT_ROOT, day);
  try {
    await fs.access(dayDir);
  } catch {
    console.error(`missing drafts day dir: ${dayDir}`);
    process.exitCode = 1;
    return;
  }

  const files = (await fs.readdir(dayDir))
    .filter((name) => name.endsWith(".json") && (name.startsWith("inst-draft-") || name.startsWith("news-draft-")) && name !== "manifest.json")
    .sort();
  if (!files.length) {
    console.error(`no news-draft json in ${dayDir}`);
    process.exitCode = 1;
    return;
  }

  const pngDir = path.join(dayDir, "png");
  await fs.mkdir(pngDir, { recursive: true });

  const results = [];
  for (const file of files) {
    results.push(await renderOne(path.join(dayDir, file), pngDir));
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    day,
    width: PORTRAIT.width,
    height: PORTRAIT.height,
    count: results.length,
    note: "news-draft PNGs only; not production process-maps",
    items: results,
  };
  await fs.writeFile(path.join(pngDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(DRAFT_ROOT, "latest-png-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  // patch day README with png links if present
  const readmePath = path.join(dayDir, "README.md");
  try {
    let readme = await fs.readFile(readmePath, "utf8");
    if (!readme.includes("## PNG (1800×2400)")) {
      readme += [
        "",
        "## PNG (1800×2400)",
        "",
        ...results.map((r, i) => `${i + 1}. [${r.name}](./png/${path.basename(r.png)})`),
        "",
      ].join("\n");
      await fs.writeFile(readmePath, readme);
    }
  } catch {
    // ignore
  }

  if (!quiet) {
    console.log(`process-draft png ${results.length} → ${path.relative(REPO_DIR, pngDir)} (${PORTRAIT.width}x${PORTRAIT.height})`);
    for (const r of results) console.log(`- ${r.name}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
