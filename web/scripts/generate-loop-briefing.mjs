#!/usr/bin/env node
// Daily policy briefing for the warroom loop — 장차관급 보고체.
// Input: loop/data.json + map/signals.json (신호 집계). claude -p가 개조식
// 동향 보고를 쓰고, 실패 시 기계식 요약으로 폴백한다.
// 원칙: 데이터에 없는 사실 금지, 신호(언론·브리핑) 기반임을 명시.
// 구성(2026-08-29~): 주요 보도내용(전언) → 분야별 절차 진행상황(판정) → 리스크·갈등 → 조치 필요사항.
//   보도와 판정을 섹션으로 가른다 — 섞이면 "보도된 것인가 우리가 정한 것인가"가 흐려진다.
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
      "사실이 아님을 전제로 서술(단정 대신 '보도됨·주시 필요') ③보도된 것과 우리 판정을 섞지 말 것 — " +
      "무엇이 보도이고 무엇이 우리 판단인지 소제목으로 갈라 읽히게 한다 ④관문 ID는 괄호로 병기 ⑤개조식 " +
      "보고체(–함/–필요/–예정/–주시) ⑥정책 용어 사용, 배경 맥락을 한 문장씩 붙여 판단을 보좌 " +
      "⑦데이터의 영문 상태값(planned/active/completed/unknown)을 그대로 쓰지 말고 " +
      "계획·진행·완료·미정으로 옮겨 적을 것.\n" +
      "형식(한 장짜리 보고서에 들어가야 하므로 전체 950자 이내 — 넘기지 말 것):\n" +
      `📡 광주 반도체·군공항 일일 동향 (${loop.generatedAt})\n` +
      "\n■ 주요 보도내용 — 오늘 보도된 사실 3건. 각 항목: 제목 줄 + 보도 내용 1문장(80자 이내).\n" +
      "  여기에는 '보도된 것'만 쓴다. 우리 판정(상태 전환 검토·분류·대상 지정)과 요구사항은 " +
      "절대 쓰지 말고 아래 절차·조치 항목으로 보낸다. 문장은 '보도됨/전해짐/밝힘' 전언 형식으로 끝낸다.\n" +
      "\n■ 분야별 절차 진행상황 — 5개 분야(군공항/산단·인허가/전력/용수/건축·가동) 각 1줄(90자 이내).\n" +
      "  그 보도가 어느 관문(ID 병기)의 어느 절차에 걸리는지, 상태 전환 검토 대상인지를 쓴다. " +
      "여기가 우리 판정이다.\n" +
      "\n■ 리스크·갈등 — 3건, 각 1줄(70자 이내, 배경 포함)\n" +
      "\n■ 조치 필요사항 — 결정·확인이 필요한 것 2줄(70자 이내). 마지막 줄은 ※로 시작해 " +
      "판 수치(관문·절차·기관·상태 전환 검토·신규 후보) 1줄\n" +
      `\n마지막 줄: 상세: ${URL}\n` +
      "본문만 출력(코드블록·설명 금지).\n\n데이터:\n" + JSON.stringify(payload);
    const out = execFileSync("claude", ["-p", prompt], { encoding: "utf8", timeout: 240_000 }).trim();
    if (out.length > 200 && out.includes("주요 보도내용")) text = out.slice(0, 3900);
    else throw new Error("형식 미달 출력");
  } catch (e) {
    console.warn(`briefing judge skipped (${e.message}) — fallback 사용`);
  }
}

writeFileSync(outPath, text + "\n");
console.log(`loop briefing: ${text.length}자 -> ${outPath}`);
