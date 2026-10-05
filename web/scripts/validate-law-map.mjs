#!/usr/bin/env node
// 법령 지도 IR 무결성 검증. 파일이 하나도 없으면 통과(아직 생성 전).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STAGES, ACTORS } from "./lib/law-map-classify.mjs";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(WEB, "data", "law-map");
const TEXT_DIR = path.join(WEB, "public", "law-map");
const TIERS = new Set(["statute", "decree", "rule", "adminRule", "ordinance"]);
const KINDS = new Set(["decree", "rule", "adminRule", "ordinance", "cites"]);
const KIND_TO_TIER = { decree: "decree", rule: "rule", adminRule: "adminRule", ordinance: "ordinance" };
// 조문 분류(class.json) 허용 값은 분류기에서 가져온다(복제하지 않는다).
const CLASS_STAGES = new Set(STAGES);
const CLASS_ACTORS = new Set(ACTORS);
let classifiedTotal = 0;
let classFiles = 0;

const errors = [];
const fail = (scope, msg) => errors.push(`${scope}: ${msg}`);

if (!fs.existsSync(DATA_DIR)) {
  console.log("법령 지도 데이터 없음 — 검증 건너뜀");
  process.exit(0);
}
const files = fs.readdirSync(DATA_DIR).filter((f) => /^\d+\.json$/.test(f)).sort();
const maps = [];
for (const file of files) {
  const scope = `law-map/${file}`;
  const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  if (/OC=[A-Za-z0-9]/.test(raw)) fail(scope, "OC 값이 들어 있습니다");
  const map = JSON.parse(raw);
  maps.push(map);
  if (map.schemaVersion !== 1) fail(scope, `schemaVersion ${map.schemaVersion}`);
  if (`${map.lawId}.json` !== file) fail(scope, `lawId ${map.lawId}가 파일명과 다릅니다`);

  const laneIds = new Map();
  const adminRuleNames = new Map();
  for (const lane of map.lanes) {
    if (laneIds.has(lane.id)) fail(scope, `레인 id 중복 ${lane.id}`);
    laneIds.set(lane.id, lane);
    if (!TIERS.has(lane.tier)) fail(scope, `레인 ${lane.id} tier ${lane.tier}`);
    if (!lane.name || !lane.officialUrl) fail(scope, `레인 ${lane.id} name/officialUrl 누락`);
    if (lane.tier === "adminRule") {
      const key = lane.name.replace(/\s+/g, "");
      if (adminRuleNames.has(key)) fail(scope, `행정규칙 레인 이름 중복 ${lane.name}`);
      adminRuleNames.set(key, lane);
    }
  }
  if (map.lanes[0]?.tier !== "statute" || map.lanes.at(-1)?.tier !== "ordinance") fail(scope, "레인 순서: 첫 레인은 statute, 마지막은 ordinance여야 합니다");

  const articleIds = new Set();
  const countByLane = new Map();
  for (const a of map.articles) {
    if (articleIds.has(a.id)) fail(scope, `조문 id 중복 ${a.id}`);
    articleIds.add(a.id);
    if (!laneIds.has(a.laneId)) fail(scope, `조문 ${a.id}의 레인 ${a.laneId} 없음`);
    if (a.id !== `${a.laneId}:${a.label}`) fail(scope, `조문 id ${a.id}가 laneId:label과 다릅니다`);
    countByLane.set(a.laneId, (countByLane.get(a.laneId) ?? 0) + 1);
  }
  for (const lane of map.lanes) {
    if ((countByLane.get(lane.id) ?? 0) !== lane.articleCount) fail(scope, `레인 ${lane.id} articleCount ${lane.articleCount} ≠ 실제 ${countByLane.get(lane.id) ?? 0}`);
  }

  const edgeIds = new Set();
  const edgesByKind = { decree: 0, rule: 0, adminRule: 0, ordinance: 0, cites: 0 };
  let unresolved = 0;
  for (const e of map.edges) {
    if (edgeIds.has(e.id)) fail(scope, `위임선 id 중복 ${e.id}`);
    edgeIds.add(e.id);
    if (!KINDS.has(e.kind)) { fail(scope, `위임선 ${e.id} kind ${e.kind}`); continue; }
    edgesByKind[e.kind] += 1;
    if (e.unresolved) unresolved += 1;
    if (!articleIds.has(e.from)) fail(scope, `위임선 ${e.id} from ${e.from} 없음`);
    if (e.kind === "cites") {
      if (e.to !== null) fail(scope, `인용 위임선 ${e.id}는 to가 null이어야 합니다`);
      continue;
    }
    if (e.to === null) {
      if (!e.unresolved) fail(scope, `위임선 ${e.id} to=null인데 unresolved가 아닙니다`);
      continue;
    }
    const lane = laneIds.get(e.to) ?? laneIds.get(e.to.split(":")[0]);
    if (!lane) { fail(scope, `위임선 ${e.id} to ${e.to} 레인 없음`); continue; }
    if (lane.tier !== KIND_TO_TIER[e.kind]) fail(scope, `위임선 ${e.id} kind ${e.kind}가 레인 tier ${lane.tier}와 다릅니다`);
    if ((e.kind === "decree" || e.kind === "rule") && !articleIds.has(e.to)) fail(scope, `위임선 ${e.id} to 조문 ${e.to} 없음`);
    if ((e.kind === "adminRule" || e.kind === "ordinance") && e.to !== lane.id) fail(scope, `위임선 ${e.id} to는 레인 id여야 합니다`);
  }
  for (const k of Object.keys(edgesByKind)) {
    if (map.stats.edgesByKind[k] !== edgesByKind[k]) fail(scope, `stats.edgesByKind.${k} ${map.stats.edgesByKind[k]} ≠ ${edgesByKind[k]}`);
  }
  if (map.stats.unresolved !== unresolved) fail(scope, `stats.unresolved ${map.stats.unresolved} ≠ ${unresolved}`);
  for (const tier of TIERS) {
    const expected = map.lanes.filter((l) => l.tier === tier).reduce((s, l) => s + l.articleCount, 0);
    if (map.stats.articlesByTier[tier] !== expected) fail(scope, `stats.articlesByTier.${tier} ${map.stats.articlesByTier[tier]} ≠ ${expected}`);
  }
  for (const inst of map.institutions) {
    for (const id of inst.articles) if (!articleIds.has(id)) fail(scope, `제도 ${inst.slug}의 조문 ${id} 없음`);
  }

  const textPath = path.join(TEXT_DIR, `${map.lawId}.text.json`);
  if (!fs.existsSync(textPath)) fail(scope, "text.json 없음");
  else {
    const textRaw = fs.readFileSync(textPath, "utf8");
    if (/OC=[A-Za-z0-9]/.test(textRaw)) fail(scope, "text.json에 OC 값이 들어 있습니다");
    for (const id of Object.keys(JSON.parse(textRaw))) if (!articleIds.has(id)) fail(scope, `text.json 키 ${id}가 조문에 없습니다`);
  }

  // 조문 분류(<lawId>.class.json)가 있으면: 키 ⊆ 조문 id, 단계·주체는 허용 값, 신뢰도는 0~1, OC 없음.
  const classPath = path.join(DATA_DIR, `${map.lawId}.class.json`);
  if (fs.existsSync(classPath)) {
    const classScope = `law-map/${map.lawId}.class.json`;
    const classRaw = fs.readFileSync(classPath, "utf8");
    if (/OC=[A-Za-z0-9]/.test(classRaw)) fail(classScope, "OC 값이 들어 있습니다");
    const cls = JSON.parse(classRaw);
    if (cls.lawId !== map.lawId) fail(classScope, `lawId ${cls.lawId}가 IR과 다릅니다`);
    if (typeof cls.method !== "string" || !cls.method) fail(classScope, "method 누락");
    let classified = 0;
    for (const [id, c] of Object.entries(cls.articles ?? {})) {
      classified += 1;
      if (!articleIds.has(id)) fail(classScope, `분류 키 ${id}가 조문에 없습니다`);
      if (!CLASS_STAGES.has(c.stage)) fail(classScope, `${id} stage ${c.stage}`);
      if (!CLASS_ACTORS.has(c.actor)) fail(classScope, `${id} actor ${c.actor}`);
      if (typeof c.confidence !== "number" || c.confidence < 0 || c.confidence > 1) fail(classScope, `${id} confidence ${c.confidence}`);
      if (!Array.isArray(c.evidence)) fail(classScope, `${id} evidence가 배열이 아닙니다`);
      if (c.stage !== "unknown" && c.evidence.length === 0 && !c.deleted) fail(classScope, `${id} 단계 ${c.stage}인데 근거가 없습니다`);
      for (const a of c.actors ?? []) {
        if (!CLASS_ACTORS.has(a.actor) || !["primary", "secondary"].includes(a.role)) fail(classScope, `${id} actors ${JSON.stringify(a)}`);
      }
    }
    classifiedTotal += classified;
    classFiles += 1;
  }
}

// 고아 분류 파일: IR이 없는 <lawId>.class.json은 실패.
for (const f of fs.readdirSync(DATA_DIR).filter((f) => /^\d+\.class\.json$/.test(f))) {
  const lawId = f.replace(/\.class\.json$/, "");
  if (!files.includes(`${lawId}.json`)) fail(`law-map/${f}`, "IR(<lawId>.json)이 없는 분류 파일입니다");
}

const indexPath = path.join(DATA_DIR, "index.json");
if (files.length > 0) {
  if (!fs.existsSync(indexPath)) fail("law-map/index.json", "없음");
  else {
    const indexRaw = fs.readFileSync(indexPath, "utf8");
    if (/OC=[A-Za-z0-9]/.test(indexRaw)) fail("law-map/index.json", "OC 값이 들어 있습니다");
    const index = JSON.parse(indexRaw);
    const indexed = new Set(index.laws.map((l) => l.lawId));
    for (const m of maps) if (!indexed.has(m.lawId)) fail("law-map/index.json", `${m.lawId} 누락`);
    for (const id of indexed) if (!maps.some((m) => m.lawId === id)) fail("law-map/index.json", `${id} 파일 없음`);
  }
}

// 빌드 보고서(가장 최근 것)에도 OC가 새지 않았는지 본다. 보고서에는 오류 메시지·URL이 그대로 실리기 때문이다.
const AUDIT_DIR = path.join(path.dirname(WEB), "docs", "audits");
if (fs.existsSync(AUDIT_DIR)) {
  const latest = fs.readdirSync(AUDIT_DIR).filter((f) => /^law-map-build-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1);
  if (latest && /OC=[A-Za-z0-9]/.test(fs.readFileSync(path.join(AUDIT_DIR, latest), "utf8"))) fail(`audits/${latest}`, "OC 값이 들어 있습니다");
}

if (errors.length > 0) {
  console.error(`법령 지도 검증 실패: ${errors.length}건`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
const articles = maps.reduce((s, m) => s + m.articles.length, 0);
const edges = maps.reduce((s, m) => s + m.edges.length, 0);
console.log(`법령 지도 검증 성공: 법률 ${maps.length}건, 조문 ${articles}개, 위임선 ${edges}개${classFiles ? `, 조문 분류 ${classFiles}건 ${classifiedTotal}개` : ""}`);
