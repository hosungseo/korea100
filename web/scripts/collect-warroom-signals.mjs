#!/usr/bin/env node
// Collect news signals for warroom map gates via Naver News API.
// Signals are hints only — gate status stays official-evidence-based
// (워룸 정직성 규칙: 기사는 신호, 상태 확정은 공식 문서로).
// Env: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (web/.env.local)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "public/warroom/map/signals.json");

for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^(NAVER_CLIENT_ID|NAVER_CLIENT_SECRET)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}
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

async function search(query) {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=20&sort=date`;
  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
  });
  if (!res.ok) throw new Error(`naver ${res.status} for "${query}"`);
  return (await res.json()).items ?? [];
}

const candidates = [];
const seen = new Set();
const cutoff = Date.now() - MAX_AGE_DAYS * 86400_000;

for (const q of QUERIES) {
  const items = await search(q.query);
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
      title, desc, gates: q.gates, query: q.query,
      link: it.originallink || it.link,
      pubDate: new Date(ts).toISOString().slice(0, 10),
    });
  }
  await new Promise((r) => setTimeout(r, 120));
}

// LLM relevance judge (claude -p) — drops other-project, politics-only and
// human-interest items the keyword filters cannot. --no-judge to skip;
// on any failure we keep the mechanical result rather than losing the run.
let judged = candidates;
if (!process.argv.includes("--no-judge") && candidates.length) {
  try {
    const payload = candidates.map((c, i) => ({ i, q: c.query, t: c.title, d: c.desc.slice(0, 110) }));
    const prompt =
      "광주 군공항 이전(전남 무안)·광주 반도체 클러스터 사업 상황판의 기사 필터다. " +
      "각 항목의 q는 그 기사가 매칭된 관문 질의다. 이 사업의 해당 절차 진행·결정·지연·쟁점을 " +
      "실질적으로 다루는 기사만 남겨라. 타지역 사업(용인 등), 단순 동정·행사·주식 시황, " +
      "사업과 무관한 정치 공방은 버려라. 남길 항목의 i만 JSON 배열로 출력하라. 다른 텍스트 금지.\n" +
      JSON.stringify(payload);
    const out = execFileSync("claude", ["-p", prompt], { encoding: "utf8", timeout: 180_000 });
    const m = out.match(/\[[\d,\s]*\]/);
    if (!m) throw new Error("no JSON array in judge output");
    const keep = new Set(JSON.parse(m[0]));
    judged = candidates.filter((_, i) => keep.has(i));
    console.log(`judge: ${candidates.length} -> ${judged.length}`);
  } catch (e) {
    console.warn(`judge skipped (${e.message}) — keeping mechanical result`);
  }
}

const byGate = {};
for (const c of judged) {
  for (const g of c.gates) {
    (byGate[g] ||= []).push({ title: c.title, link: c.link, pubDate: c.pubDate });
  }
}
const kept = judged.length;

for (const g of Object.keys(byGate)) {
  byGate[g].sort((a, b) => b.pubDate.localeCompare(a.pubDate));
  byGate[g] = byGate[g].slice(0, 8);
}

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  windowDays: MAX_AGE_DAYS,
  note: "네이버 뉴스 신호 — 관문 상태 확정 근거 아님(공식 문서로 확인 후 데이터 갱신)",
  byGate,
};
writeFileSync(outPath, `${JSON.stringify(data, null, 1)}\n`);
console.log(
  `warroom signals: ${kept} articles -> ${Object.keys(byGate).length} gates (${outPath})`,
);
for (const [g, arr] of Object.entries(byGate)) console.log(` ${g}: ${arr.length}`);
