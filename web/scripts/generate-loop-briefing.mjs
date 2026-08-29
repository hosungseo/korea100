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
const jsonPath = join(WEB, "public/warroom/loop/briefing.json");
const LOOP_URL = "https://hosungseo.github.io/korea100/warroom/loop/";

const p = loop.pipeline;

// 판별 입력: 제안(요약 포함) + 관문 요약 + 리스크 헤드라인 + 후보
// 언론사 약칭 — 보도 항목에 "(동아)" 처럼 출처를 밝힌다. 도메인에서 기계적으로 뽑고
// 표에 없으면 생략한다(모델이 언론사를 지어내지 않도록 값을 직접 준다).
const PRESS = {
  "korea.kr": "정책브리핑", "yna.co.kr": "연합", "news1.kr": "뉴스1", "newsis.com": "뉴시스",
  "news.kbs.co.kr": "KBS", "imnews.imbc.com": "MBC", "news.sbs.co.kr": "SBS",
  "yonhapnewstv.co.kr": "연합뉴스TV", "donga.com": "동아", "chosun.com": "조선",
  "joongang.co.kr": "중앙", "hani.co.kr": "한겨레", "khan.co.kr": "경향",
  "hankookilbo.com": "한국", "munhwa.com": "문화", "seoul.co.kr": "서울",
  "mk.co.kr": "매경", "hankyung.com": "한경", "sedaily.com": "서울경제",
  "edaily.co.kr": "이데일리", "fnnews.com": "파이낸셜", "pressian.com": "프레시안",
  "ohmynews.com": "오마이", "imaeil.com": "매일신문", "kookje.co.kr": "국제",
  "jnilbo.com": "전남일보", "namdonews.com": "남도일보", "kwangju.co.kr": "광주일보",
  "gwangnam.co.kr": "광남일보", "honam.co.kr": "호남", "etnews.com": "전자",
  "dt.co.kr": "디지털타임스", "zdnet.co.kr": "지디넷", "thelec.kr": "디일렉",
};
const pressOf = (link) => {
  try {
    const h = new URL(link).hostname.replace(/^www\./, "");
    return PRESS[h] ?? PRESS[h.split(".").slice(-3).join(".")] ?? null;
  } catch { return null; }
};

const riskHeads = [];
const headlines = [];
for (const [g, arr] of Object.entries(signals.byGate)) {
  for (const a of arr) {
    const p = pressOf(a.link);
    if (a.kind === "risk" && a.pubDate >= loop.generatedAt) riskHeads.push(`${g}: ${a.title}`);
    if (a.pubDate >= loop.generatedAt && p) headlines.push({ gate: g, press: p, title: a.title });
  }
}
const HEADLINES = headlines.slice(0, 40).map((h, i) => ({ i, ...h }));
const HEADLINE_N = HEADLINES.length;

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
  headlines: HEADLINES,
  pendingGates: loop.pendingGates,
  pendingInsts: loop.pendingInsts,
};

const STATUSES = ["진행 전환 검토", "리스크 점검", "주시", "변동 없음"];
const FIELDS = ["군공항", "산단·인허가", "전력", "용수", "건축·가동"];

// 평문 브리핑을 구조에서 만든다 — 텔레그램 메시지와 한글 보고서가 같은 원천을 쓴다
function render(b) {
  const L = [`📡 ${b.title} (${b.date})`, "", "■ 주요 보도내용"];
  for (const r of b.reports) {
    L.push(`- ${r.press ? `(${r.press}) ` : ""}${r.title}`, `  ${r.body}`);
  }
  L.push("", "■ 분야별 절차 진행상황");
  for (const f of b.fields) L.push(`- ${f.name}: ${f.status}${f.gates?.length ? ` (${f.gates.join("·")})` : ""}`);
  L.push("", "■ 리스크·갈등");
  for (const r of b.risks) L.push(`- ${r.text}${r.gates?.length ? ` (${r.gates.join("·")})` : ""}`);
  L.push("", "■ 조치 필요사항");
  for (const a of b.actions) L.push(`- ${a}`);
  L.push(`※ ${b.pipeline}`, "", `상세: ${LOOP_URL}`);
  return L.join("\n");
}

// 산출물이 형식 계약을 지켰는지 기계로 판정한다(모델 말만 믿지 않는다)
function validate(b) {
  const bad = [];
  if (!b || typeof b !== "object") return ["JSON 아님"];
  if (!b.title || !b.date) bad.push("title/date");
  if (!Array.isArray(b.reports) || b.reports.length !== 3) bad.push("reports 3건 아님");
  for (const r of b.reports ?? []) {
    if (!Number.isInteger(r.headlineIndex)) bad.push("headlineIndex 없음");
    else if (r.headlineIndex < 0 || r.headlineIndex >= HEADLINE_N) {
      bad.push(`headlineIndex ${r.headlineIndex} 범위 밖(0~${HEADLINE_N - 1})`);
    }
  }
  if (!Array.isArray(b.fields) || b.fields.length !== 5) bad.push("fields 5건 아님");
  for (const f of b.fields ?? []) {
    if (!FIELDS.includes(f.name)) bad.push(`분야명 '${f.name}'`);
    if (!STATUSES.includes(f.status)) bad.push(`상태값 '${f.status}'`);
  }
  if (!Array.isArray(b.risks) || b.risks.length < 1) bad.push("risks 없음");
  if (!Array.isArray(b.actions) || b.actions.length < 1) bad.push("actions 없음");
  if (!b.pipeline) bad.push("pipeline");
  return bad;
}

const fallback = [

  `📡 워룸 루프 ${loop.generatedAt}`,
  `신호 ${p.signals.articles}건/${p.signals.gates}관문 · 상태 제안 ${p.suggestions.length}`,
  `후보 대기 — 관문 ${p.gateQueue.proposed} · 제도 ${p.instQueue.proposed}`,
  ...p.suggestions.slice(0, 3).map((s) => `· ${s.gate} ${s.name}: ${s.suggest} (${s.basis})`),
  `상세: ${LOOP_URL}`,
].join("\n");

let text = fallback;
let brief = null;
if (!process.argv.includes("--no-judge")) {
  try {
    const prompt =
      // 어투 지시는 KISA 범정부오피스의 "행정공문 어투 변환" 프롬프트에서 차용했다.
      // 핵심은 두 가지 — 화자를 '일 잘하는 공무원'으로 못 박고, 의미 보존을 절대 조건으로 건다.
      "너는 광주 군공항 이전·반도체 클러스터 사업 상황실의 수석 보좌관이다. 일 잘하는 공무원처럼 쓴다.\n" +
      "아래 데이터(언론·정책브리핑 신호의 자동 집계)만 근거로, 장차관급 정책결정자가 아침에 읽는 " +
      "일일 동향 보고를 만든다. 행정공문 어투로 쓰되 원 자료의 의미가 달라지면 절대 안 된다.\n" +
      "이해하기 쉽고 자연스럽게, 국민 눈높이에 맞는 표현을 쓴다. 관용적 상투어와 과장은 피한다.\n" +
      "원칙: ①데이터에 없는 사실·수치·언론사 지어내기 절대 금지 ②모든 내용은 '신호'이며 확정 사실이 " +
      "아니다 — 보도내용은 '보도됨/전해짐' 전언으로 끝낸다 ③보도된 것과 우리 판정을 섞지 말 것 " +
      "④영문 상태값(planned/active 등)을 쓰지 말고 한국어로 옮긴다.\n" +
      "출력은 **JSON 객체 하나만**. 코드블록·설명·인사말 금지. 스키마:\n" +
      `{"title":"광주 반도체·군공항 일일 동향","date":"${loop.generatedAt}",\n` +
      ' "reports":[{"headlineIndex":숫자,"title":"보도 제목 26자 이내",' +
      '"body":"보도 내용 1문장 38자 이내, 전언체"}]  // 정확히 3건,\n' +
      ` "fields":[{"name":${JSON.stringify(FIELDS)} 중 하나,"status":${JSON.stringify(STATUSES)} 중 하나,` +
      '"gates":["N31","N32"]}]  // 5개 분야 전부, 순서 그대로,\n' +
      ' "risks":[{"text":"리스크 1줄 34자 이내","gates":["N50"]}]  // 3건,\n' +
      ' "actions":["결정·확인이 필요한 것 1줄 34자 이내"]  // 2건,\n' +
      ' "pipeline":"관문·절차·기관·전환 검토·신규 후보 수치 1줄"}\n' +
      "headlineIndex 는 그 항목의 근거가 된 데이터 headlines 배열의 i 값이다. 반드시 하나를 " +
      "지목하라 — 언론사 이름은 그 번호로 코드가 붙이므로 직접 쓰지 않는다.\n" +
      "status 는 그 분야에서 우리가 판에 취할 조치다(정책 상황 서술이 아니다).\n\n데이터:\n" +
      JSON.stringify(payload);
    const out = execFileSync("claude", ["-p", prompt], { encoding: "utf8", timeout: 240_000 });
    const m = out.match(/\{[\s\S]*\}/);          // 앞뒤 잡담이 붙어도 객체만 집는다
    if (!m) throw new Error("JSON 객체를 찾지 못함");
    const parsed = JSON.parse(m[0]);
    const bad = validate(parsed);
    if (bad.length) throw new Error(`형식 위반: ${bad.join(", ")}`);
    // 언론사는 모델이 쓰지 않고, 지목한 번호로 코드가 붙인다(창작 차단)
    for (const r of parsed.reports) {
      const h = HEADLINES[r.headlineIndex];
      r.press = h ? h.press : null;
      r.sourceTitle = h ? h.title : null;

    }
    brief = parsed;
    text = render(parsed);
  } catch (e) {
    console.warn(`briefing judge skipped (${e.message}) — fallback 사용`);
  }
}

writeFileSync(outPath, text + "\n");
if (brief) writeFileSync(jsonPath, JSON.stringify(brief, null, 2) + "\n");
console.log(`loop briefing: ${text.length}자 -> ${outPath}${brief ? " (+ briefing.json)" : " (폴백)"}`);
