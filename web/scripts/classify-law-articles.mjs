#!/usr/bin/env node
// 법령 지도 IR의 조문마다 규율 단계 × 주체 레인을 규칙으로 추론해 <lawId>.class.json을 쓴다.
//   node scripts/classify-law-articles.mjs --lawId 001823
//   node scripts/classify-law-articles.mjs --all
// 본문은 DRF 원본 캐시(eflaw-<mst>-<date>.json, 메인 체크아웃·읽기 전용)에서 읽고, 없으면 300자 미리보기로 대신하며 신뢰도를 낮춘다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArticleList } from "./lib/law-map-parsers.mjs";
import { classifyArticle, STAGES, ACTORS } from "./lib/law-map-classify.mjs";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(WEB, "data", "law-map");
const TEXT_DIR = path.join(WEB, "public", "law-map");
const RAW_DIRS = [
  process.env.LAW_MAP_RAW_DIR,
  path.join(DATA_DIR, "raw"),
  "/Users/seohoseong/korea100/web/data/law-map/raw",
].filter(Boolean);

const PREVIEW_PENALTY = 0.1; // 미리보기(300자)로만 판정했을 때 깎는 신뢰도

function parseArgs(argv) {
  const out = { lawIds: [], all: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--all") out.all = true;
    else if (a === "--lawId") out.lawIds.push(argv[++i]);
    else if (a.startsWith("--lawId=")) out.lawIds.push(a.slice("--lawId=".length));
  }
  return out;
}

function findRawFile(mst) {
  if (!mst) return null;
  for (const dir of RAW_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const hit = fs.readdirSync(dir).filter((f) => f.startsWith(`eflaw-${mst}-`) && f.endsWith(".json")).sort().at(-1);
    if (hit) return path.join(dir, hit);
  }
  return null;
}

/** 조문내용의 머리 문장("제109조(벌칙) 다음 각 호의 … 처한다.")에서 조문 번호·제목을 뗀 것. 각 호만 있는 조문은 parseArticleList의 text에 이 문장이 빠진다. */
function leadSentences(payload) {
  const units = payload?.["법령"]?.["조문"]?.["조문단위"];
  const map = new Map();
  for (const unit of Array.isArray(units) ? units : []) {
    if (unit?.["조문여부"] !== "조문") continue;
    const no = unit["조문번호"];
    const branch = unit["조문가지번호"];
    if (!/^\d+$/.test(no ?? "")) continue;
    const label = /^\d+$/.test(branch ?? "") && Number(branch) > 0 ? `제${no}조의${branch}` : `제${no}조`;
    const lead = String(unit["조문내용"] ?? "").replace(/^제\d+조(의\d+)?\s*(\([^)]*\))?\s*/, "").trim();
    if (lead && !map.has(label)) map.set(label, lead);
  }
  return map;
}

/** 레인별 조문 본문: label → { text, source: "raw" | "preview" | "none" }. */
function loadLaneTexts(lane, previews) {
  const rawFile = findRawFile(lane.mst);
  const texts = new Map();
  if (rawFile) {
    const payload = JSON.parse(fs.readFileSync(rawFile, "utf8"));
    const leads = leadSentences(payload);
    for (const a of parseArticleList(payload)) {
      const lead = leads.get(a.label);
      const text = lead && !a.text.startsWith(lead.slice(0, 20)) && !/^①/.test(a.text) ? `${lead}\n${a.text}` : a.text;
      texts.set(a.label, { text, source: "raw", chapter: a.chapter });
    }
  }
  return { texts, rawFile, previews };
}

function emptyCounts(keys) {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

export function classifyLaw(lawId, { log = console.log } = {}) {
  const irPath = path.join(DATA_DIR, `${lawId}.json`);
  if (!fs.existsSync(irPath)) throw new Error(`IR 없음: ${irPath}`);
  const ir = JSON.parse(fs.readFileSync(irPath, "utf8"));
  const previewPath = path.join(TEXT_DIR, `${lawId}.text.json`);
  const previews = fs.existsSync(previewPath) ? JSON.parse(fs.readFileSync(previewPath, "utf8")) : {};

  const laneTexts = new Map();
  const missingRaw = [];
  for (const lane of ir.lanes) {
    if (!["statute", "decree", "rule"].includes(lane.tier)) continue;
    const loaded = loadLaneTexts(lane, previews);
    laneTexts.set(lane.id, loaded);
    if (!loaded.rawFile) missingRaw.push(`${lane.id} ${lane.name}`);
  }

  const articles = {};
  const stats = {
    byStage: emptyCounts(STAGES),
    byActor: emptyCounts(ACTORS),
    byTier: {},
    unknownStage: 0,
    unknownActor: 0,
    lowConfidence: 0,
    deleted: 0,
    textSource: { raw: 0, preview: 0, none: 0 },
    total: 0,
  };
  const tierOf = new Map(ir.lanes.map((l) => [l.id, l.tier]));

  for (const a of ir.articles) {
    const tier = tierOf.get(a.laneId);
    if (!laneTexts.has(a.laneId)) continue; // 행정규칙·자치법규 레인은 조문이 없다
    const lane = laneTexts.get(a.laneId);
    const fromRaw = lane.texts.get(a.label);
    const preview = previews[a.id];
    let text = fromRaw?.text ?? "";
    let source = fromRaw ? "raw" : "none";
    if (!fromRaw && typeof preview === "string" && preview.length > 0) { text = preview; source = "preview"; }

    const r = classifyArticle({ label: a.label, title: a.title, chapter: a.chapter, text });
    let { confidence, stageConfidence, actorConfidence } = r;
    if (source === "preview") {
      confidence = Math.max(0, Math.round((confidence - PREVIEW_PENALTY) * 100) / 100);
      stageConfidence = Math.max(0, stageConfidence - PREVIEW_PENALTY);
      actorConfidence = Math.max(0, actorConfidence - PREVIEW_PENALTY);
      r.evidence.push("text:미리보기 300자만 사용");
    }
    const entry = {
      stage: r.stage,
      actor: r.actor,
      confidence,
      evidence: r.evidence,
      method: r.method,
      stageMethod: r.stageMethod,
      actorMethod: r.actorMethod,
      stageConfidence,
      actorConfidence,
      textSource: source,
    };
    if (r.deleted) entry.deleted = true;
    articles[a.id] = entry;

    stats.total += 1;
    stats.byStage[r.stage] += 1;
    stats.byActor[r.actor] += 1;
    stats.textSource[source] += 1;
    if (r.stage === "unknown") stats.unknownStage += 1;
    if (r.actor === "unknown") stats.unknownActor += 1;
    if (confidence < 0.5 && !r.deleted) stats.lowConfidence += 1;
    if (r.deleted) stats.deleted += 1;
    stats.byTier[tier] ??= { total: 0, matrix: {} };
    stats.byTier[tier].total += 1;
    const cell = `${r.stage}×${r.actor}`;
    stats.byTier[tier].matrix[cell] = (stats.byTier[tier].matrix[cell] ?? 0) + 1;
  }

  const out = {
    lawId,
    name: ir.name,
    generatedAt: new Date().toISOString().slice(0, 10),
    method: "rule-based v0",
    note: "모든 값은 규칙 기반 추론이다. evidence가 비어 있거나 confidence가 낮은 조문은 사람이 확인해야 한다.",
    missingRaw,
    articles,
    stats,
  };
  const outPath = path.join(DATA_DIR, `${lawId}.class.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  log(`${lawId} ${ir.name}: ${stats.total}조 → ${path.relative(WEB, outPath)} (unknown 단계 ${stats.unknownStage}, unknown 주체 ${stats.unknownActor}, 저신뢰 ${stats.lowConfidence}, 삭제 ${stats.deleted}${missingRaw.length ? `, 원본 없음 ${missingRaw.length}레인` : ""})`);
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { lawIds, all } = parseArgs(process.argv.slice(2));
  const targets = all
    ? fs.readdirSync(DATA_DIR).filter((f) => /^\d+\.json$/.test(f)).map((f) => f.replace(/\.json$/, "")).sort()
    : lawIds;
  if (targets.length === 0) {
    console.error("사용법: node scripts/classify-law-articles.mjs --lawId <lawId> [--lawId …] | --all");
    process.exit(1);
  }
  for (const id of targets) classifyLaw(id);
}
