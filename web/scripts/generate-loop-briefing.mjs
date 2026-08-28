#!/usr/bin/env node
// Daily policy briefing for the warroom loop — 장차관급 보고체.
// Input: loop/data.json + map/signals.json (신호 집계). claude -p가 개조식
// 동향 보고를 쓰고, 실패 시 기계식 요약으로 폴백한다.
// 원칙: 데이터에 없는 사실 금지, 신호(언론·브리핑) 기반임을 명시.
// Output: web/public/warroom/loop/briefing.txt
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const loop = JSON.parse(readFileSync(join(WEB, "public/warroom/loop/data.json"), "utf8"));
const signals = JSON.parse(readFileSync(join(WEB, "public/warroom/map/signals.json"), "utf8"));
const outPath = join(WEB, "public/warroom/loop/briefing.txt");
const URL = "https://hosungseo.github.io/korea100/warroom/loop/";

const p = loop.pipeline;

// 판별 입력: 제안(요약 포함) + 관문 요약 + 리스크 헤드라인 + 후보
const riskHeads = [];
for (const [g, arr] of Object.entries(signals.byGate)) {
  for (const a of arr) {
    if (a.kind === "risk" && a.pubDate >= loop.generatedAt) riskHeads.push(`${g}: ${a.title}`);
  }
}
const payload = {
  date: loop.generatedAt,
  totals: loop.totals,
  signals: p.signals,
  suggestions: p.suggestions.map((s) => ({
    gate: s.gate, name: s.name, current: s.current, suggest: s.suggest,
    basis: s.basis, summary: s.summary,
  })),
  gateSummary: signals.gateSummary,
  riskHeadlines: riskHeads.slice(0, 12),
  pendingGates: loop.pendingGates,
  pendingInsts: loop.pendingInsts,
};

const fallback = [
  `📡 워룸 루프 ${loop.generatedAt}`,
  `신호 ${p.signals.articles}건/${p.signals.gates}관문 · 상태 제안 ${p.suggestions.length}`,
  `후보 대기 — 관문 ${p.gateQueue.proposed} · 제도 ${p.instQueue.proposed}`,
  ...p.suggestions.slice(0, 3).map((s) => `· ${s.gate} ${s.name}: ${s.suggest} (${s.basis})`),
  `상세: ${URL}`,
].join("\n");

let text = fallback;
if (!process.argv.includes("--no-judge")) {
  try {
    const prompt =
      "너는 광주 군공항 이전·반도체 클러스터 사업 상황실의 수석 보좌관이다. 아래 데이터(언론·정책브리핑 " +
      "신호의 자동 집계)만 근거로, 장차관급 정책결정자가 아침에 읽는 일일 동향 보고를 작성하라.\n" +
      "원칙: ①데이터에 없는 사실·수치 지어내기 절대 금지 ②모든 내용은 언론·브리핑 '신호'이며 확정 " +
      "사실이 아님을 전제로 서술(단정 대신 '보도됨·주시 필요') ③관문 ID는 괄호로 병기 ④개조식 " +
      "보고체(–함/–필요/–예정/–주시) ⑤정책 용어 사용, 배경 맥락을 한 문장씩 붙여 판단을 보좌.\n" +
      "형식(텔레그램 평문, 전체 1,400자 이내):\n" +
      `📡 광주 반도체·군공항 일일 동향 (${loop.generatedAt})\n` +
      "\n■ 오늘의 판단 포인트 — 가장 중요한 국면 2~3건. 각 항목: 제목 줄 + 배경·의미 1문장 + 필요한 판단·유의점 1문장\n" +
      "\n■ 트랙별 동향 — 움직임 있는 트랙(군공항/산단·인허가/전력/용수/건축·가동)만 각 1줄\n" +
      "\n■ 리스크·갈등 — 1~3건, 각 1줄(배경 포함)\n" +
      "\n■ 파이프라인 — 신호·상태 전환 검토·신규 후보 수치 1줄\n" +
      `\n마지막 줄: 상세: ${URL}\n` +
      "본문만 출력(코드블록·설명 금지).\n\n데이터:\n" + JSON.stringify(payload);
    const out = execFileSync("claude", ["-p", prompt], { encoding: "utf8", timeout: 240_000 }).trim();
    if (out.length > 200 && out.includes("판단 포인트")) text = out.slice(0, 3900);
    else throw new Error("형식 미달 출력");
  } catch (e) {
    console.warn(`briefing judge skipped (${e.message}) — fallback 사용`);
  }
}

writeFileSync(outPath, text + "\n");
console.log(`loop briefing: ${text.length}자 -> ${outPath}`);
