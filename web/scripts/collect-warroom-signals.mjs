#!/usr/bin/env node
// Collect news signals for warroom map gates.
// Sources: Naver News API (언론) + 정책브리핑 policyNewsList (정부 공식 보도).
// Pipeline: per-gate queries -> mechanical filters -> claude -p judge
// (relevance + kind classification + per-gate one-line summary).
// Signals are hints only — gate status stays official-evidence-based
// (워룸 정직성 규칙: 기사는 신호, 상태 확정은 공식 문서로).
// Env: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET / POLICY_BRIEFING_SERVICE_KEY
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parsePolicyBriefingXml } from "./lib/news-candidates.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "public/warroom/map/signals.json");
const dataPath = join(root, "public/warroom/map/data.json");
const candPath = join(root, "public/warroom/map/gate-candidates.json");
const candMdPath = join(root, "public/warroom/map/gate-candidates.md");

try {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^(NAVER_CLIENT_ID|NAVER_CLIENT_SECRET|POLICY_BRIEFING_SERVICE_KEY)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].trim();
  }
} catch { /* env may come from the caller (launchd runner) */ }
const clientId = process.env.NAVER_CLIENT_ID;
const clientSecret = process.env.NAVER_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET required");

// gate-cluster queries. `must`: every term must appear in title+description
// (Naver full-text matching alone is too loose for stock/politics noise).
const QUERIES = [
  { query: "광주 군공항 예비이전후보지", must: ["군공항"], gates: ["N04"] },
  { query: "광주 군공항 이전부지 선정", must: ["군공항", "이전"], gates: ["N31", "N32"] },
  { query: "광주 군공항 주민투표", must: ["군공항"], gates: ["N32"] },
  { query: "광주 군공항 기부 대 양여", must: ["군공항"], gates: ["N33", "N42"] },
  { query: "광주 군공항 종전부지 개발", must: ["종전부지"], gates: ["N34", "N35"] },
  { query: "광주 반도체 클러스터 지정", must: ["반도체", "광주"], gates: ["N03"] },
  { query: "광주 반도체 국가산업단지", must: ["반도체", "산업단지"], gates: ["N06", "N07", "N10"] },
  { query: "광주 반도체 산업단지계획 승인", must: ["산업단지"], gates: ["N36", "N37", "N10"] },
  { query: "광주 반도체 환경영향평가", must: ["환경영향평가"], gates: ["N09", "N11", "N12"] },
  { query: "광주 반도체 전력 계통", must: ["전력"], gates: ["N18", "N19", "N21"] },
  { query: "반도체 계통영향평가 면제 특례", must: ["계통"], gates: ["N20"] },
  { query: "광주 반도체 용수 공업용수", must: ["용수"], gates: ["N23", "N24"] },
  { query: "광주 반도체 팹 착공", must: ["반도체"], gates: ["N27", "N28"] },
  { query: "3대 메가프로젝트 반도체 추진", must: ["메가프로젝트"], gates: ["N02"] },
  { query: "광주 반도체 예비타당성 특례", must: ["반도체"], gates: ["N02", "N20"] },
];

const MAX_AGE_DAYS = 30;
// listings/schedules are not signals; other-region semiconductor news only
// counts when it also mentions this project's region
const JUNK_TITLE = /주요\s*일정|라인업|오늘의\s*일정|일정\]|단체장.*일정|부고|인사\]/;
const OTHER_REGION = /용인|평택|이천시|청주|오송|구미|천안|아산|새만금/;
const OUR_REGION = /광주|호남|전남|무안|서남권/;

const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'");

async function searchNaver(query) {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=20&sort=date`;
  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
  });
  if (!res.ok) throw new Error(`naver ${res.status} for "${query}"`);
  return (await res.json()).items ?? [];
}

// 정책브리핑(korea.kr) 보도자료 — 정부 공식 발표라 언론 기사보다 강한 신호
async function fetchBriefings() {
  const key = process.env.POLICY_BRIEFING_SERVICE_KEY;
  if (!key) { console.warn("POLICY_BRIEFING_SERVICE_KEY 없음 — 정책브리핑 생략"); return []; }
  const fmt = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
  const out = [];
  for (let off = 0; off < 15; off += 3) {
    const end = new Date(Date.now() - off * 86400_000);
    const start = new Date(end.getTime() - 2 * 86400_000);
    const url = new URL("https://apis.data.go.kr/1371000/policyNewsService/policyNewsList");
    url.search = new URLSearchParams({
      serviceKey: key, startDate: fmt(start), endDate: fmt(end), numOfRows: "100", pageNo: "1",
    }).toString();
    try {
      const xml = await (await fetch(url)).text();
      out.push(...parsePolicyBriefingXml(xml, "정책브리핑"));
    } catch (e) {
      console.warn(`정책브리핑 ${fmt(start)}~${fmt(end)} 실패: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}

const candidates = [];
const seen = new Set();
const cutoff = Date.now() - MAX_AGE_DAYS * 86400_000;

for (const q of QUERIES) {
  const items = await searchNaver(q.query);
  for (const it of items) {
    const title = strip(it.title);
    const desc = strip(it.description ?? "");
    const blob = title + " " + desc;
    if (!q.must.every((t) => blob.includes(t))) continue;
    if (JUNK_TITLE.test(title)) continue;
    if (OTHER_REGION.test(blob) && !OUR_REGION.test(blob)) continue;
    const ts = Date.parse(it.pubDate);
    if (Number.isNaN(ts) || ts < cutoff) continue;
    const key = title.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      title, desc, gates: q.gates, query: q.query, source: "언론",
      link: it.originallink || it.link,
      pubDate: new Date(ts).toISOString().slice(0, 10),
    });
  }
  await new Promise((r) => setTimeout(r, 120));
}
const naverCount = candidates.length;

for (const b of await fetchBriefings()) {
  const blob = `${b.title} ${b.body}`;
  if (!/광주|호남|전남|무안|군공항|서남권/.test(blob)) continue;
  const gates = [...new Set(QUERIES.filter((q) => q.must.every((t) => blob.includes(t))).flatMap((q) => q.gates))];
  if (!gates.length) continue;
  const ts = Date.parse(b.publishedAt ?? "");
  if (Number.isNaN(ts) || ts < cutoff) continue;
  const key = b.title.slice(0, 40);
  if (seen.has(key)) continue;
  seen.add(key);
  candidates.push({
    title: b.title, desc: (b.body ?? "").slice(0, 160), gates, query: "정책브리핑",
    source: "정책브리핑", link: b.url,
    pubDate: new Date(ts).toISOString().slice(0, 10),
  });
}
console.log(`후보: 언론 ${naverCount} + 정책브리핑 ${candidates.length - naverCount}`);

// LLM judge: relevance filter + kind classification + per-gate summary.
// --no-judge to skip; on failure we keep the mechanical result (kind=context).
const KIND = { p: "progress", r: "risk", d: "decision", c: "context" };
let judged = candidates.map((c) => ({ ...c, kind: "context" }));
let gateSummary = {};
if (!process.argv.includes("--no-judge") && candidates.length) {
  try {
    const payload = candidates.map((c, i) => ({
      i, g: c.gates.join(","), s: c.source, t: c.title, d: c.desc.slice(0, 110),
    }));
    const prompt =
      "광주 군공항 이전(전남 무안)·광주 반도체 클러스터 사업 상황판의 기사 판별기다. " +
      "각 항목: i=번호, g=매칭된 관문 ID, s=출처(언론/정책브리핑), t=제목, d=요약. " +
      "이 사업의 해당 절차 진행·결정·지연·쟁점을 실질적으로 다루는 항목만 남기고, " +
      "타지역 사업(용인 등)·단순 동정·행사·주식 시황·무관한 정치 공방은 버려라. " +
      "남긴 항목마다 종류를 붙여라: p=절차 진행·완료 신호, r=지연·갈등·반대 신호, " +
      "d=결정·심의 임박 신호, c=맥락 참고. " +
      "그리고 기사가 남은 관문마다 그 관문의 현재 상황을 25자 내외 한국어 한 줄로 요약하라. " +
      'JSON 하나만 출력: {"keep":[[i,"p|r|d|c"],...],"sum":{"관문ID":"한 줄",...}}\n' +
      JSON.stringify(payload);
    const out = execFileSync("claude", ["-p", prompt], { encoding: "utf8", timeout: 240_000 });
    const jsonText = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonText);
    const kindOf = new Map(parsed.keep.map(([i, k]) => [i, KIND[k] ?? "context"]));
    judged = candidates.map((c, i) => (kindOf.has(i) ? { ...c, kind: kindOf.get(i) } : null)).filter(Boolean);
    gateSummary = parsed.sum ?? {};
    console.log(`judge: ${candidates.length} -> ${judged.length}, 요약 ${Object.keys(gateSummary).length}관문`);
  } catch (e) {
    console.warn(`judge skipped (${e.message}) — keeping mechanical result`);
  }
}

const byGate = {};
for (const c of judged) {
  for (const g of c.gates) {
    (byGate[g] ||= []).push({
      title: c.title, link: c.link, pubDate: c.pubDate, kind: c.kind,
      ...(c.source === "정책브리핑" ? { source: c.source } : {}),
    });
  }
}
// ── 신규 절차 후보 발굴 ──────────────────────────────────────────────
// 관문 쿼리에 안 걸린 광역 기사에서 "지도에 없는 행정 절차"를 찾아
// 후보 큐(gate-candidates.json)에 쌓는다. 후보는 지도에 반영되지 않으며
// 사람이 근거 법령을 확인해 정식 관문으로 등재해야 한다(정직성 규칙).
const DISCOVERY_QUERIES = [
  "광주 반도체 클러스터", "광주 군공항 이전", "호남 반도체 산업단지", "광주 반도체 지원",
];

async function discoverCandidates() {
  if (process.argv.includes("--no-judge")) return { added: 0 };
  const gateList = JSON.parse(readFileSync(dataPath, "utf8")).nodes
    .map((n) => `${n.id} ${n.name}`);
  let prev = { candidates: [] };
  try { prev = JSON.parse(readFileSync(candPath, "utf8")); } catch { /* first run */ }

  const pool = [];
  for (const q of DISCOVERY_QUERIES) {
    for (const it of await searchNaver(q)) {
      const title = strip(it.title);
      const desc = strip(it.description ?? "");
      const blob = title + " " + desc;
      if (JUNK_TITLE.test(title)) continue;
      if (!OUR_REGION.test(blob)) continue;
      if (OTHER_REGION.test(blob) && !OUR_REGION.test(blob)) continue;
      const ts = Date.parse(it.pubDate);
      if (Number.isNaN(ts) || ts < cutoff) continue;
      const key = title.slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({
        title, desc: desc.slice(0, 140),
        link: it.originallink || it.link,
        pubDate: new Date(ts).toISOString().slice(0, 10),
      });
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  if (!pool.length) return { added: 0 };

  let added = 0;
  try {
    const prompt =
      "광주 군공항 이전(전남 무안)·광주 반도체 클러스터 사업의 관문 지도 관리자다.\n" +
      "기존 관문:\n" + gateList.join("\n") + "\n" +
      "기존 후보: " + (prev.candidates.map((c) => c.proc).join(", ") || "없음") + "\n" +
      "아래 기사들이 구체적으로 언급하는 행정 절차(인허가·심의·협약·계획 승인·지정 등) 중 " +
      "기존 관문·기존 후보 어디에도 없는 것만 신규 후보로 제안하라. " +
      "정치 공방·전망·일반 동정은 절차가 아니다. 확신 없으면 제안하지 마라.\n" +
      'JSON만 출력: {"candidates":[{"proc":"절차명","stage":"G0~G7 추정","actors":"주체 추정",' +
      '"basis":"근거 법령·제도 단서(모르면 확인 필요)","why":"한 줄 근거","refs":[기사 i 배열]}]}\n' +
      JSON.stringify(pool.map((p, i) => ({ i, t: p.title, d: p.desc })));
    const out = execFileSync("claude", ["-p", prompt], { encoding: "utf8", timeout: 240_000 });
    const parsed = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    const today = new Date().toISOString().slice(0, 10);
    for (const c of parsed.candidates ?? []) {
      if (!c.proc || prev.candidates.some((p) => p.proc === c.proc)) continue;
      prev.candidates.push({
        proc: c.proc, stage: c.stage ?? "?", actors: c.actors ?? "?",
        basis: c.basis ?? "확인 필요", why: c.why ?? "", status: "proposed",
        firstSeen: today,
        articles: (c.refs ?? []).map((i) => pool[i]).filter(Boolean)
          .map((p) => ({ title: p.title, link: p.link, pubDate: p.pubDate })),
      });
      added++;
    }
  } catch (e) {
    console.warn(`discovery judge skipped (${e.message})`);
    return { added: 0 };
  }

  prev.updatedAt = new Date().toISOString().slice(0, 10);
  prev.note = "기사에서 발굴한 신규 절차 후보 — 근거 법령 확인 후 정식 관문으로 등재(지도 미반영)";
  writeFileSync(candPath, `${JSON.stringify(prev, null, 1)}\n`);

  const open = prev.candidates.filter((c) => c.status === "proposed");
  const md = [
    `# 워룸 관문 후보 검토 큐 (${prev.updatedAt})`,
    "",
    "기사에서 발굴한 **미검증 절차 후보**입니다. 근거 법령을 확인해 정식 관문으로",
    "등재하거나 기각하세요(gate-candidates.json의 status를 accepted/rejected로).",
    "",
    ...open.map((c) => [
      `## ${c.proc}`,
      `- 추정 단계: ${c.stage} · 주체: ${c.actors}`,
      `- 근거 단서: ${c.basis}`,
      `- 제안 근거: ${c.why} (최초 ${c.firstSeen})`,
      ...c.articles.slice(0, 3).map((a) => `- ${a.pubDate} [${a.title}](${a.link})`),
      "",
    ].join("\n")),
  ].join("\n");
  writeFileSync(candMdPath, md + "\n");
  return { added, open: open.length };
}

const disc = await discoverCandidates();
console.log(`new-candidates: ${disc.added}${disc.open != null ? ` (미처리 ${disc.open})` : ""}`);

const KIND_RANK = { risk: 3, decision: 2, progress: 1, context: 0 };
for (const g of Object.keys(byGate)) {
  byGate[g].sort((a, b) => b.pubDate.localeCompare(a.pubDate) || KIND_RANK[b.kind] - KIND_RANK[a.kind]);
  byGate[g] = byGate[g].slice(0, 8);
}

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  windowDays: MAX_AGE_DAYS,
  note: "언론·정책브리핑 신호 — 관문 상태 확정 근거 아님(공식 문서로 확인 후 데이터 갱신)",
  gateSummary,
  byGate,
};
writeFileSync(outPath, `${JSON.stringify(data, null, 1)}\n`);
const kindCount = {};
for (const c of judged) kindCount[c.kind] = (kindCount[c.kind] ?? 0) + 1;
console.log(
  `warroom signals: ${judged.length} articles -> ${Object.keys(byGate).length} gates`,
  JSON.stringify(kindCount),
);
