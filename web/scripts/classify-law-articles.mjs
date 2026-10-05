#!/usr/bin/env node
// 법령 지도 IR의 조문마다 규율 단계 × 주체 레인을 규칙으로 추론해 <lawId>.class.json을 쓴다.
//   node scripts/classify-law-articles.mjs --lawId 001823 [--sheet [--baseline <이전 class.json>]] [--raw-dir <dir>]
//   node scripts/classify-law-articles.mjs --all
// 본문은 DRF 원본 캐시(eflaw-<mst>-<date>.json, 메인 체크아웃·읽기 전용)에서 읽고, 없으면 300자 미리보기로 대신하며 신뢰도를 낮춘다.
// --sheet: docs/audits/law-map-classify-sample-<lawId>.md 표본 시트를 함께 쓴다(법률 40건 표본·층위별 행렬·저신뢰 10건·한계).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArticleList } from "./lib/law-map-parsers.mjs";
import { classifyArticle, STAGES, ACTORS, CLASSIFIER_VERSION } from "./lib/law-map-classify.mjs";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOT = path.dirname(WEB);
const DATA_DIR = path.join(WEB, "data", "law-map");
const TEXT_DIR = path.join(WEB, "public", "law-map");
const AUDIT_DIR = path.join(ROOT, "docs", "audits");
/** DRF 원본 캐시 위치 후보. --raw-dir(또는 LAW_MAP_RAW_DIR)가 있으면 그것만 본다. */
const DEFAULT_RAW_DIRS = [
  path.join(DATA_DIR, "raw"),
  "/Users/seohoseong/korea100/web/data/law-map/raw",
];
let rawDirs = process.env.LAW_MAP_RAW_DIR ? [process.env.LAW_MAP_RAW_DIR] : DEFAULT_RAW_DIRS;

const PREVIEW_PENALTY = 0.1; // 미리보기(300자)로만 판정했을 때 깎는 신뢰도
const CLASSIFIED_TIERS = new Set(["statute", "decree", "rule"]);

function parseArgs(argv) {
  const out = { lawIds: [], all: false, sheet: false, baseline: null, rawDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--all") out.all = true;
    else if (a === "--sheet") out.sheet = true;
    else if (a === "--baseline") out.baseline = argv[++i];
    else if (a === "--raw-dir") out.rawDir = argv[++i];
    else if (a.startsWith("--raw-dir=")) out.rawDir = a.slice("--raw-dir=".length);
    else if (a === "--lawId") out.lawIds.push(argv[++i]);
    else if (a.startsWith("--lawId=")) out.lawIds.push(a.slice("--lawId=".length));
  }
  return out;
}

function findRawFile(mst) {
  if (!mst) return null;
  for (const dir of rawDirs) {
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

/** 레인별 조문 본문: label → { text, source: "raw" }. 원본 파일이 없으면 빈 Map. */
function loadLaneTexts(lane) {
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
  return { texts, rawFile };
}

function emptyCounts(keys) {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

export function classifyLaw(lawId, { log = console.log, write = true } = {}) {
  const irPath = path.join(DATA_DIR, `${lawId}.json`);
  if (!fs.existsSync(irPath)) throw new Error(`IR 없음: ${irPath}`);
  const ir = JSON.parse(fs.readFileSync(irPath, "utf8"));
  const previewPath = path.join(TEXT_DIR, `${lawId}.text.json`);
  const previews = fs.existsSync(previewPath) ? JSON.parse(fs.readFileSync(previewPath, "utf8")) : {};

  const laneTexts = new Map();
  const missingRaw = [];
  const lanes = {}; // 레인별 본문 출처(헤더에 기록)
  for (const lane of ir.lanes) {
    if (!CLASSIFIED_TIERS.has(lane.tier)) continue;
    const loaded = loadLaneTexts(lane);
    laneTexts.set(lane.id, loaded);
    lanes[lane.id] = { tier: lane.tier, mst: lane.mst ?? null, rawFile: loaded.rawFile ? path.basename(loaded.rawFile) : null, source: loaded.rawFile ? "raw" : "preview" };
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

    const r = classifyArticle({ label: a.label, title: a.title, chapter: a.chapter, text, tier });
    let { confidence, stageConfidence, actorConfidence } = r;
    if (source === "preview") {
      confidence = Math.max(0, Math.round((confidence - PREVIEW_PENALTY) * 100) / 100);
      stageConfidence = Math.max(0, stageConfidence - PREVIEW_PENALTY);
      actorConfidence = Math.max(0, actorConfidence - PREVIEW_PENALTY);
      r.evidence.push("text:미리보기 300자만 사용");
    }
    // 파일에는 축별 방법·신뢰도를 되풀이하지 않는다(근거 문자열에 담겨 있다). 출처는 헤더 lanes에.
    const entry = { stage: r.stage, actor: r.actor, actors: r.actors, confidence, evidence: r.evidence, method: r.method };
    if (r.deleted) entry.deleted = true;
    articles[a.id] = entry;

    stats.total += 1;
    stats.textSource[source] += 1;
    stats.byTier[tier] ??= { total: 0, deleted: 0, matrix: {} };
    stats.byTier[tier].total += 1;
    if (r.deleted) { stats.deleted += 1; stats.byTier[tier].deleted += 1; continue; } // 아래 집계는 삭제 조문을 뺀다(표본 시트와 같은 기준)
    stats.byStage[r.stage] += 1;
    stats.byActor[r.actor] += 1;
    if (r.stage === "unknown") stats.unknownStage += 1;
    if (r.actor === "unknown") stats.unknownActor += 1;
    if (confidence < 0.5) stats.lowConfidence += 1;
    const cell = `${r.stage}×${r.actor}`;
    stats.byTier[tier].matrix[cell] = (stats.byTier[tier].matrix[cell] ?? 0) + 1;
    void stageConfidence; void actorConfidence;
  }

  const out = {
    lawId,
    name: ir.name,
    generatedAt: new Date().toISOString().slice(0, 10),
    method: CLASSIFIER_VERSION,
    note: "모든 값은 규칙 기반 추론이다. evidence가 비어 있거나 confidence가 낮은 조문은 사람이 확인해야 한다. stats는 삭제 조문을 뺀 수(deleted는 따로).",
    lanes,
    missingRaw,
    articles,
    stats,
  };
  if (write) {
    const outPath = path.join(DATA_DIR, `${lawId}.class.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(out)}\n`); // IR 파일과 같이 압축 JSON
    log(`${lawId} ${ir.name}: ${stats.total}조 → ${path.relative(WEB, outPath)} (unknown 단계 ${stats.unknownStage}, unknown 주체 ${stats.unknownActor}, 저신뢰 ${stats.lowConfidence}, 삭제 ${stats.deleted}${missingRaw.length ? `, 원본 없음 ${missingRaw.length}레인` : ""})`);
  }
  return { ir, out };
}

// ── 표본 시트 ──────────────────────────────────────────────────────

const STAGE_KO = { purpose: "목적·정의", standard: "기준·의무", procedure: "인허가·절차", operation: "행정 운영", organization: "조직", supervision: "감독·시정", penalty: "벌칙", misc: "보칙", unknown: "미상" };
const ACTOR_KO = { citizen: "국민·사업자", central: "중앙", local: "지방", committee: "위원회·기관", court: "법원", none: "없음", unknown: "미상" };
const TIER_KO = { statute: "법률", decree: "대통령령", rule: "부령" };
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const evid = (a) => a.evidence.map((e) => e.replace(/^stage\//, "S:").replace(/^actor\//, "A:")).join(", ");
const pct = (x, n) => (n ? `${x} (${Math.round((x / n) * 100)}%)` : "0");

function matrixTable(entries) {
  const m = {};
  let deleted = 0;
  for (const r of entries) {
    if (r.deleted) { deleted += 1; continue; }
    m[r.stage] ??= {};
    m[r.stage][r.actor] = (m[r.stage][r.actor] ?? 0) + 1;
  }
  const out = [];
  out.push(`| 단계 \\ 주체 | ${ACTORS.map((a) => `${ACTOR_KO[a]}<br>\`${a}\``).join(" | ")} | 계 |`);
  out.push(`|---|${ACTORS.map(() => "---:").join("|")}|---:|`);
  const colTotal = emptyCounts(ACTORS);
  for (const s of STAGES) {
    const row = m[s] ?? {};
    const total = ACTORS.reduce((n, a) => n + (row[a] ?? 0), 0);
    if (total === 0) continue;
    for (const a of ACTORS) colTotal[a] += row[a] ?? 0;
    out.push(`| ${STAGE_KO[s]} \`${s}\` | ${ACTORS.map((a) => row[a] ?? "·").join(" | ")} | ${total} |`);
  }
  const grand = ACTORS.reduce((n, a) => n + colTotal[a], 0);
  out.push(`| **계** | ${ACTORS.map((a) => `**${colTotal[a]}**`).join(" | ")} | **${grand}** |`);
  return { table: out, total: entries.length, deleted, live: grand };
}

const LIMITATIONS = [
  "- **주어가 생략된 조문**: 「건축신고」(법 제14조)처럼 \"…에게 신고를 하면 허가를 받은 것으로 본다\"는 문장에는 주어가 없다. v0.1은 '…에게 (신고|신청|제출)를 하면/하여야' 문형을 수범자(`citizen` 0.6, `implicit-subject:신고`)로 읽지만, 그 밖의 주어 생략 문형은 본문 기관명 빈도(0.4)에 기댄다.",
  "- **사물 주어의 기술기준**: 「설계하중」「콘크리트의 배합」 같은 하위법령 조문은 주어가 사물(압축강도는, 주근은)이다. v0.1은 시행령·부령에서 이 유형을 `none` 0.6(`thing-subject`)으로 둔다 — 수범자를 지어내지 않는다. 법률의 사물 주어 기준 조문(「대지의 안전」「건폐율」)은 여전히 `standard→citizen` 0.4 추정이다.",
  "- **제목 단서 충돌**: 「건축허가 제한 등」(허가=절차, 제한=기준)은 머리말 규칙과 본문 단서가 서로 다른 쪽을 가리켜 0.4다. 「건축자재등 품질인정기관의 지정ㆍ운영 등」(지정·인정=절차, 운영=조직)도 같다. 한 조문이 두 단계를 동시에 담는 경우라 단일 라벨 자체가 무리일 수 있다.",
  "- **공동 주어**: 「건축위원회」(법 제4조) \"국토교통부장관, 시ㆍ도지사 및 시장ㆍ군수ㆍ구청장은\"처럼 세 층위가 함께 주어이면 먼저 적힌 쪽을 `primary`, 나머지를 `actors[].role=secondary`로 둔다(0.5). 격자에는 primary 레인에만 놓이고 ↔ 표시로 보조 주체를 알린다.",
  "- **장 제목 폴백**: 총칙 장의 조문은 제목·본문 단서가 없을 때 `purpose` 0.5로 떨어진다. 특례·배제는 약한 단서(`misc` 0.6)로 잡았지만, 「통일성을 유지하기 위한 도의 조례」(제7조) 같은 것은 어느 단계에도 잘 안 맞는다.",
  "- **'공개'·'조정'·'재정'의 다의성**: 「공개 공지 등의 확보」의 공개(公開 아님), 「조정위원회와 재정위원회」의 조정·재정(분쟁조정, 財政 아님)은 절차 단서로 잡힌다. 머리말 규칙으로 대부분 걸러졌지만 근거에 흔적이 남는다.",
  "- **일반 의무 문형의 과대 대표**: 본문 단서 중 \"하여야 한다\"는 거의 모든 조문에 나와 가중치를 0.5로 낮췄는데도 제목 단서가 없는 조문은 `standard`로 쏠린다. 행정기관의 기록·통계 의무는 v0.1에서 `operation`(대장·통계·전산·계획 수립·실태조사·고시) 단계로 분리했지만, 제목에 단서가 없으면 여전히 `standard × local`로 들어간다.",
  "- **시행령·규칙의 조문 제목**: 「건축신고」「건축물대장」처럼 법률과 같은 제목을 쓰는 하위 조문은 법률과 같은 단계로 분류되지만, 실제 내용은 '그 절차의 세부 서식·기한'이다. 층위를 함께 보면 맞지만 단독 라벨로는 법률 조문과 구분되지 않는다.",
  "- **각 호만 있는 조문**: DRF 본문 파서(`lawArticleText`)가 각 호만 있는 조문의 머리 문장(\"다음 각 호의 어느 하나에 해당하는 자는 … 처한다\")을 떨어뜨린다. 이 CLI에서 원본 `조문내용`의 머리 문장을 다시 붙여 벌칙 조문의 주어를 살렸다. 파서 자체는 고치지 않았다(공유 코드).",
  "- **법원 레인**: 건축법에는 법원이 주어인 조문이 없어 `court`는 0건이다. 단서(법원·검찰·판사·검사의/검사가·사법경찰관·법관)는 들어 있지만 이 법에서는 검증되지 않았다.",
  "- **공무원은 수범자로 센다**: 「국가공무원법」류에서 '공무원은 …하여야 한다'의 공무원은 `citizen`(국민·사업자) 레인에 들어간다. 레인 이름이 어색하지만 '규율을 받는 쪽'이라는 뜻은 같다. 국회사무총장·법원행정처장·헌법재판소사무처장·중앙선거관리위원회사무총장 같은 헌법기관 사무기구는 v0.2부터 `constitutional` 레인.",
];

export function writeSampleSheet(ir, out, { baselinePath = null, log = console.log } = {}) {
  const tierOf = new Map(ir.lanes.map((l) => [l.id, l.tier]));
  const laneName = new Map(ir.lanes.map((l) => [l.id, l.name]));
  const titleOf = new Map(ir.articles.map((a) => [a.id, a.title]));
  const c = out;
  const lines = [];
  lines.push(`# 법령 지도 조문 분류 표본 — ${ir.name}(${c.lawId})`);
  lines.push("");
  lines.push(`생성: ${c.generatedAt} · 방법: ${c.method} · 스크립트: \`web/scripts/classify-law-articles.mjs --lawId ${c.lawId} --sheet\` · 결과: \`web/data/law-map/${c.lawId}.class.json\``);
  lines.push("");
  lines.push("모든 값은 **규칙 기반 추론**이다. 단계: 제목 단서(0.8, 장과 일치 0.9) → 제목 단서 충돌은 머리말·본문으로 해소(0.5/0.4) → 본문 단서(0.6) → 약한 제목 단서(특례·범위 등, 0.6) → 장 제목(0.5) 순으로 보고, 어느 단서도 없으면 `unknown`이다. 주체: 첫 항 첫 문장의 주어('…은/는' 0.8, '…이/가' 0.7, 공동 주어 0.5, 주어 생략형 '…에게 신고를 하면' 0.6)에서 읽고, 주어가 사물이면 제목·단계·본문 전체에서 유추한다(0.4~0.6; 하위법령 기술기준은 `none` 0.6). 표의 신뢰도는 두 축 중 낮은 쪽이다. `S:`는 단계 근거, `A:`는 주체 근거, `↔`는 보조 주체.");
  lines.push("");

  const statute = ir.articles.filter((a) => tierOf.get(a.laneId) === "statute");
  const sample = statute.filter((_, i) => i % 4 === 0).slice(0, 40);
  lines.push(`## 1. 법률 조문 표본 ${sample.length}건 (문서 순서로 4개마다 1건, 전체 ${statute.length}조)`);
  lines.push("");
  lines.push("| # | 조문 | 제목 | 단계 | 주체 | 신뢰도 | 근거 |");
  lines.push("|---|---|---|---|---|---|---|");
  sample.forEach((a, i) => {
    const r = c.articles[a.id];
    const sec = (r.actors ?? []).filter((x) => x.role === "secondary").map((x) => x.actor);
    lines.push(`| ${i + 1} | ${a.label} | ${esc(a.title)} | ${r.stage}${r.deleted ? " (삭제)" : ""} | ${r.actor}${sec.length ? ` ↔ ${sec.join("·")}` : ""} | ${r.confidence} | ${esc(evid(r))} |`);
  });
  lines.push("");

  lines.push("## 2. 단계 × 주체 행렬 (삭제 조문 제외, 주 주체 기준)");
  lines.push("");
  for (const tier of ["statute", "decree", "rule"]) {
    const entries = Object.entries(c.articles).filter(([id]) => tierOf.get(id.split(":")[0]) === tier).map(([, r]) => r);
    if (entries.length === 0) continue;
    const lanes = ir.lanes.filter((l) => l.tier === tier).map((l) => l.name);
    const { table, total, deleted, live } = matrixTable(entries);
    lines.push(`### ${TIER_KO[tier]} ${lanes.length > 1 ? `${lanes.length}건` : `(${lanes[0]})`} — ${total}조 중 삭제 ${deleted}, 분류 대상 ${live}`);
    if (lanes.length > 1) lines.push(`${lanes.join(" · ")}`);
    lines.push("");
    lines.push(...table);
    lines.push("");
  }

  lines.push("## 3. 미상·저신뢰 비율 (삭제 조문 제외)");
  lines.push("");
  lines.push("| 층위 | 분류 대상 | 단계 unknown | 주체 unknown | 신뢰도 < 0.5 | 보조 주체 있음 | 평균 신뢰도 |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  const agg = {};
  for (const [id, a] of Object.entries(c.articles)) {
    const t = tierOf.get(id.split(":")[0]);
    agg[t] ??= { n: 0, unkS: 0, unkA: 0, low: 0, sec: 0, conf: 0 };
    if (a.deleted) continue;
    const g = agg[t]; g.n += 1; if (a.stage === "unknown") g.unkS += 1; if (a.actor === "unknown") g.unkA += 1; if (a.confidence < 0.5) g.low += 1; if ((a.actors ?? []).length > 1) g.sec += 1; g.conf += a.confidence;
  }
  const all = { n: 0, unkS: 0, unkA: 0, low: 0, sec: 0, conf: 0 };
  for (const t of ["statute", "decree", "rule"]) {
    const g = agg[t];
    if (!g) continue;
    for (const k of Object.keys(all)) all[k] += g[k];
    lines.push(`| ${TIER_KO[t]} | ${g.n} | ${pct(g.unkS, g.n)} | ${pct(g.unkA, g.n)} | ${pct(g.low, g.n)} | ${pct(g.sec, g.n)} | ${g.n ? (g.conf / g.n).toFixed(2) : "-"} |`);
  }
  lines.push(`| **전체** | ${all.n} | ${pct(all.unkS, all.n)} | ${pct(all.unkA, all.n)} | ${pct(all.low, all.n)} | ${pct(all.sec, all.n)} | ${all.n ? (all.conf / all.n).toFixed(2) : "-"} |`);
  lines.push("");
  const delByTier = ["statute", "decree", "rule"].map((t) => `${TIER_KO[t]} ${Object.entries(c.articles).filter(([id, a]) => a.deleted && tierOf.get(id.split(":")[0]) === t).length}`).join("·");
  lines.push(`삭제 조문 ${c.stats.deleted}건(${delByTier})은 \`stage: unknown, actor: none, deleted: true\`로 따로 센다. 본문 출처: 원본 ${c.stats.textSource.raw}, 미리보기 ${c.stats.textSource.preview}, 없음 ${c.stats.textSource.none}.`);
  lines.push("");

  const order = new Map(ir.articles.map((a, i) => [a.id, i]));
  const low = Object.entries(c.articles)
    .filter(([, a]) => !a.deleted)
    .sort(([ia, a], [ib, b]) => a.confidence - b.confidence || order.get(ia) - order.get(ib))
    .slice(0, 10);
  lines.push("## 4. 신뢰도가 가장 낮은 10건");
  lines.push("");
  lines.push("| 조문 | 제목 | 단계 | 주체 | 신뢰도 | 근거 |");
  lines.push("|---|---|---|---|---|---|");
  for (const [id, a] of low) {
    const [laneId, label] = id.split(":");
    lines.push(`| ${laneName.get(laneId)} ${label} | ${esc(titleOf.get(id))} | ${a.stage} | ${a.actor} | ${a.confidence} | ${esc(evid(a) || "(없음)")} |`);
  }
  lines.push("");

  lines.push("## 5. 규칙이 가르지 못하는 것 (정직하게)");
  lines.push("");
  lines.push(...LIMITATIONS);
  lines.push("");
  lines.push("## 6. 다음 손볼 곳");
  lines.push("");
  lines.push("- 단서표(`web/scripts/lib/law-map-classify.mjs` 상단)는 데이터다. 이 표본에서 틀린 줄을 고치면 단서를 더하거나 빼는 것으로 대부분 대응된다.");
  lines.push("- 주체 축은 '첫 항 첫 문장 주어' 하나에 기대고 있다. 항마다 주어가 다른 조문(허가권자가 ①, 건축주가 ②)은 항 단위 분류로 내려가야 정확해진다.");
  lines.push("- 두 단계를 함께 담는 조문(허가+제한, 지정+운영)은 다중 라벨을 허용할지 결정이 필요하다.");
  lines.push("");

  if (baselinePath && fs.existsSync(baselinePath)) {
    const base = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const changed = Object.entries(c.articles)
      .filter(([id, a]) => base.articles[id] && !a.deleted && (base.articles[id].stage !== a.stage || base.articles[id].actor !== a.actor))
      .sort(([ia], [ib]) => order.get(ia) - order.get(ib));
    const stageOnly = changed.filter(([id, a]) => base.articles[id].stage !== a.stage && base.articles[id].actor === a.actor).length;
    const actorOnly = changed.filter(([id, a]) => base.articles[id].stage === a.stage && base.articles[id].actor !== a.actor).length;
    lines.push(`## 7. ${base.method} → ${c.method} 달라진 조문 (${changed.length}건: 단계만 ${stageOnly}, 주체만 ${actorOnly}, 둘 다 ${changed.length - stageOnly - actorOnly}) — 앞 10건`);
    lines.push("");
    lines.push(`기준: \`${path.basename(baselinePath)}\` (${base.generatedAt}, ${base.method})`);
    lines.push("");
    lines.push("| 조문 | 제목 | 이전 | 이후 | 신뢰도 | 바뀐 이유(근거) |");
    lines.push("|---|---|---|---|---|---|");
    // 법률 조문을 앞세우고, 층위 안에서는 문서 순서.
    const tierRank = { statute: 0, decree: 1, rule: 2 };
    changed.sort(([ia], [ib]) => (tierRank[tierOf.get(ia.split(":")[0])] - tierRank[tierOf.get(ib.split(":")[0])]) || (order.get(ia) - order.get(ib)));
    for (const [id, a] of changed.slice(0, 10)) {
      const b = base.articles[id];
      const [laneId, label] = id.split(":");
      const why = a.evidence.filter((e) => /operation|implicit-subject|thing-subject|joint|대장|통계|전산|계획|실태조사|고시/.test(e)).slice(0, 3).map((e) => e.replace(/^stage\//, "S:").replace(/^actor\//, "A:")).join(", ") || evid(a).slice(0, 80);
      lines.push(`| ${laneName.get(laneId)} ${label} | ${esc(titleOf.get(id))} | ${b.stage} × ${b.actor} (${b.confidence}) | ${a.stage} × ${a.actor} | ${a.confidence} | ${esc(why)} |`);
    }
    lines.push("");
  }

  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  const outPath = path.join(AUDIT_DIR, `law-map-classify-sample-${c.lawId}.md`);
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`);
  log(`표본 시트 → ${path.relative(ROOT, outPath)}`);
  return outPath;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { lawIds, all, sheet, baseline, rawDir } = parseArgs(process.argv.slice(2));
  if (rawDir) rawDirs = [path.resolve(rawDir)];
  const targets = all
    ? fs.readdirSync(DATA_DIR).filter((f) => /^\d+\.json$/.test(f)).map((f) => f.replace(/\.json$/, "")).sort()
    : lawIds;
  if (targets.length === 0) {
    console.error("사용법: node scripts/classify-law-articles.mjs --lawId <lawId> [--sheet [--baseline <class.json>]] | --all");
    process.exit(1);
  }
  const summary = { laws: 0, articles: 0, byTier: {} };
  for (const id of targets) {
    const { ir, out } = classifyLaw(id, { log: all ? () => {} : console.log });
    if (sheet) writeSampleSheet(ir, out, { baselinePath: baseline ? path.resolve(baseline) : null });
    summary.laws += 1;
    summary.articles += out.stats.total;
    const tierOf = new Map(ir.lanes.map((l) => [l.id, l.tier]));
    for (const [aid, a] of Object.entries(out.articles)) {
      const t = tierOf.get(aid.split(":")[0]);
      const g = (summary.byTier[t] ??= { total: 0, deleted: 0, unknownStage: 0, unknownActor: 0, lowConfidence: 0 });
      g.total += 1;
      if (a.deleted) { g.deleted += 1; continue; }
      if (a.stage === "unknown") g.unknownStage += 1;
      if (a.actor === "unknown") g.unknownActor += 1;
      if (a.confidence < 0.5) g.lowConfidence += 1;
    }
  }
  if (all) {
    console.log(`${summary.laws}개 법령, ${summary.articles}개 조문 분류`);
    for (const [t, g] of Object.entries(summary.byTier)) {
      const live = g.total - g.deleted;
      console.log(`  ${t}: ${g.total}조 (삭제 ${g.deleted}) · unknown 단계 ${g.unknownStage}/${live} (${Math.round((g.unknownStage / live) * 100)}%) · unknown 주체 ${g.unknownActor} · 저신뢰 ${g.lowConfidence}/${live} (${Math.round((g.lowConfidence / live) * 100)}%)`);
    }
  }
}
