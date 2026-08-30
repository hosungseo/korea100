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
const procs = JSON.parse(readFileSync(join(WEB, "public/warroom/map/procedures.json"), "utf8")).byGate;
const outPath = join(WEB, "public/warroom/loop/briefing.txt");
const jsonPath = join(WEB, "public/warroom/loop/briefing.json");
const LOOP_URL = "https://hosungseo.github.io/korea100/warroom/loop/";

const p = loop.pipeline;

// '오늘 기사'의 기준일. 평소엔 수집일이지만, 월요일에 주말 기사를 묶거나
// 백테스트에서 과거 날짜를 재현할 때 밖에서 준다.
const SINCE = process.env.BRIEF_SINCE || loop.generatedAt;

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
    if (a.kind === "risk" && a.pubDate >= SINCE) riskHeads.push(`${g}: ${a.title}`);
    if (a.pubDate >= SINCE && p) headlines.push({ gate: g, press: p, title: a.title });
  }
}
const HEADLINES = headlines.slice(0, 40).map((h, i) => ({ i, ...h }));

// 오늘 신호가 붙은 관문의 절차 목록 — "이 기사가 어느 절차가 끝났다는 말인가"를
// 판별시키기 위한 것. 고위공무원이 모르는 건 단계가 아니라 단계 '안'이다.
const GATE_STEPS = {};
for (const [g, arr] of Object.entries(signals.byGate)) {
  if (!arr.some((a) => a.pubDate >= SINCE)) continue;
  const steps = [];
  for (const inst of procs[g] ?? []) {
    for (const s of inst.steps ?? []) {
      steps.push({ inst: inst.name, step: s.name, actor: s.actor,
                   basis: s.basis, deadline: s.deadline || undefined });
    }
  }
  if (steps.length) GATE_STEPS[g] = steps.slice(0, 24);
}
const HEADLINE_N = HEADLINES.length;

// 부처명은 모델이 가장 잘 지어내는 항목이다(동복댐 용수 건에 '국방부·국토부'를
// 붙인 적이 있다 — 환경부 소관인데). 기사 제목이나 그 관문 절차의 주체에
// 실제로 나온 부처만 남긴다. 약칭도 정식 명칭으로 되돌린다.
const MINISTRY_ALIAS = {
  국토부: "국토교통부", 산업부: "산업통상부", 환경부: "환경부",
  기재부: "기획재정부", 행안부: "행정안전부", 고용부: "고용노동부",
  해수부: "해양수산부", 과기부: "과학기술정보통신부", 복지부: "보건복지부",
  기후부: "기후에너지환경부", 국조실: "국무조정실",
};
const CORPUS = [
  ...HEADLINES.map((h) => h.title),
  ...riskHeads,                                   // "N50: 제목" 형태의 문자열이다
  ...Object.values(GATE_STEPS).flat().map((s) => `${s.actor ?? ""} ${s.basis ?? ""}`),
].join(" ");

/** 근거 없는 부처명을 떨어낸다. 반환: 정식 명칭 배열(중복 제거). */
function groundMinistries(names, gate) {
  const pool = CORPUS + " " + (GATE_STEPS[gate] ?? []).map((s) => s.actor ?? "").join(" ");
  const out = [];
  for (const raw of names ?? []) {
    const nm = MINISTRY_ALIAS[raw] ?? raw;
    // 약칭이 본문에 있으면 그것도 근거로 친다("국토부"만 나오는 기사가 흔하다)
    const alias = Object.keys(MINISTRY_ALIAS).find((k) => MINISTRY_ALIAS[k] === nm);
    if ((pool.includes(nm) || (alias && pool.includes(alias))) && !out.includes(nm)) {
      out.push(nm);
    }
  }
  return out;
}

// 어제 보도 3건 — 같은 사안을 또 리드로 세울 때 '달라진 것'을 요구하기 위해
// 덮어쓰기 전의 briefing.json 에서 읽는다(없으면 빈 배열).
let prevReports = [];
try {
  prevReports = JSON.parse(readFileSync(jsonPath, "utf8")).reports
    .map((r) => r.title).filter(Boolean);
} catch { /* 첫 실행·백테스트 초일 */ }

const payload = {
  date: loop.generatedAt,
  prevReports,
  totals: loop.totals,
  signals: p.signals,
  suggestions: p.suggestions.map((s) => ({
    gate: s.gate, name: s.name, current: s.current, suggest: s.suggest,
    basis: s.basis, summary: s.summary,
  })),
  gateSummary: signals.gateSummary,
  riskHeadlines: riskHeads.slice(0, 12),
  headlines: HEADLINES,
  gateSteps: GATE_STEPS,
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
    for (const x of r.extraIndexes ?? []) {
      if (!Number.isInteger(x) || x < 0 || x >= HEADLINE_N) bad.push(`extraIndexes ${x}`);
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
  for (const a of b.advances ?? []) {
    const steps = GATE_STEPS[a.gate];
    if (!steps) bad.push(`advances 관문 '${a.gate}' 없음`);
    else if (!steps.some((s) => s.step === a.step)) bad.push(`advances 절차 '${a.step}' 없음`);
  }
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
      "원칙: ①데이터에 없는 사실·수치·언론사 지어내기 절대 금지 ②모든 내용은 '신호'이며 확정 " +
      "사실이 아니다 — 다만 '보도됨·전해짐' 같은 전언 종결어미는 쓰지 말 것(출처를 이미 밝히므로 " +
      "군더더기다) ③보도된 것과 우리 판정을 섞지 말 것 " +
      "④영문 상태값(planned/active 등)을 쓰지 말고 한국어로 옮긴다 " +
      "⑤'관문·신호로 분류' 같은 시스템 내부 용어를 본문에 쓰지 않는다.\n" +
      // 서술방법은 행안부 자치행정과 「지방행정 여론·동향」 보고를 따른다.
      "서술방법(정부 동향 보고 문체):\n" +
      "  ㄱ. 개조식 명사형 종결 — '~선정', '~집계', '~예정', '~전망', '~우려', '~추진', '~방침'. " +
      "'~이다·~있다·~됐다·~어렵다' 같은 서술형 어미로 끝내면 실패다.\n" +
      "  ㄴ. 데이터에 있는 수치·날짜·규모는 버리지 말고 그대로 살린다 — " +
      "'다수 피해'보다 '46명 피해', '조만간'보다 '10월'이 좋은 문장이다.\n" +
      "  ㄷ. risks 는 '벌어진 일 + 판에 미치는 파급' 두 마디로 — 예: '보상 갈등으로 설명회 연기, " +
      "용수 일정 지연 우려'. 현상만 쓰고 끝내면 반쪽이다.\n" +
      "  ㄹ. body 는 남은 절차·다음 일정이 데이터에 있으면 그것을 우선 담는다 — " +
      "동향 보고의 핵심은 '다음에 무엇이 오는가'다.\n" +
      "출력은 **JSON 객체 하나만**. 코드블록·설명·인사말 금지. 스키마:\n" +
      `{"title":"광주 반도체·군공항 일일 동향","date":"${loop.generatedAt}",\n` +
      ' "reports":[{"headlineIndex":숫자,"extraIndexes":[숫자]  // 사실을 보탠 다른 기사 번호(없으면 생략),' +
      '"title":"보도 제목 26자 이내",' +
      '"body":"제목에 없는 정보만 40자 내외(최대 58자)"}]  // 정확히 3건,\n' +
      ` "fields":[{"name":${JSON.stringify(FIELDS)} 중 하나,"status":${JSON.stringify(STATUSES)} 중 하나,` +
      '"gates":["N31","N32"]}]  // 5개 분야 전부, 순서 그대로,\n' +
      ' "risks":[{"text":"리스크 1줄 34자 이내","gates":["N50"],' +
      '"detail":"text 를 한 겹 더 파고든 구체 서술 40~50자(두 줄에 들어가야 한다)",' +
      '"ministries":["기사에서 이 건에 걸린 것으로 보이는 중앙부처"],' +
      '"interlock":"부처가 둘 이상일 때만, 어느 부처의 무엇이 늦으면 어느 부처가 막히는지 1줄 30자 이내"}]  // 3건,\n' +
      ' "actions":["결정·확인이 필요한 것 1줄 34자 이내"]  // 2건,\n' +
      ' "pipeline":"관문·절차·기관·전환 검토·신규 후보 수치 1줄",\n' +
      ' "advances":[{"gate":"N32","step":"gateSteps 의 step 문자열 그대로","verdict":"일어남",' +
      '"evidence":"근거가 된 기사 제목"}]  // 0~3건}\n' +
      "headlineIndex 는 그 항목의 근거가 된 데이터 headlines 배열의 i 값이다. 반드시 하나를 " +
      "지목하라 — 언론사 이름은 그 번호로 코드가 붙이므로 직접 쓰지 않는다.\n" +
      "보도 3건 고르는 법:\n" +
      "  · 우선순위 — ①시한이 박힌 정부 공식 발표 ②[단독]·최초 확인 보도 ③부처 업무보고·" +
      "국무회의 의결 ④사업지 현장 사건(파업·집단 반발) ⑤일반 진행 보도. " +
      "정치 공방·지자체 홍보성·타지역 사업 기사는 뽑지 않는다.\n" +
      "  · 같은 사건은 몸통 기사(회의·발표 자체)를 고른다 — 파편·반응 기사를 대표로 세우지 말 것.\n" +
      "  · 3건이 같은 주제로 겹치면 실패 — 진행·리스크·결정을 섞는다.\n" +
      "  · prevReports(어제 보도)와 같은 사안이면 어제와 달라진 것이 title 에 드러나야 한다. " +
      "달라진 게 없으면 다른 기사를 고른다.\n" +
      "body 는 title 을 되풀이하지 않는다. title 에 없는 것만 담는다 — 배경·수치·일정·쟁점·" +
      "이해관계자 반응 중 하나. title 을 풀어 쓴 문장이면 실패다.\n" +
      "body 의 모든 사실은 headlineIndex·extraIndexes 로 지목한 기사 안에 있어야 한다. " +
      "다른 기사의 수치·사실을 보탰으면 그 번호를 extraIndexes 에 전부 적는다. " +
      "법정 처리기한·절차 상식(공람 20일, 주민투표 잔존 등)을 기사 사실처럼 쓰지 말 것 — " +
      "근거 조문·기한은 코드가 주석으로 붙인다.\n" +
      "status 는 그 분야에서 우리가 판에 취할 조치다(정책 상황 서술이 아니다).\n" +
      // 부처 하나로 닫히는 일은 그 부처가 알아서 한다. 국무조정실이 봐야 하는 것은
      // 부처 사이에 걸쳐 아무도 끝까지 책임지지 않는 구간이다.
      "risks 의 detail — text 를 되풀이하지 말고 한 겹 더 들어간다. 무엇이 쟁점인지, " +
      "누가 무엇을 요구하는지, 언제까지 풀어야 하는지 중 기사에 있는 것을 쓴다. " +
      "text 를 늘려 쓴 문장이면 실패다. 수치·법령 조문은 여기 말고 따로 쓴다.\n" +
      "risks 의 ministries·interlock — 기사에 여러 부처가 얽혀 보이면 반드시 잡아낸다:\n" +
      "  · 한 부처 소관 사안이면 ministries 는 1개, interlock 은 빈 문자열.\n" +
      "  · 둘 이상이면 전부 적고, interlock 에 '무엇이 늦으면 무엇이 막히는지'를 쓴다.\n" +
      "    예: '환경영향평가 지연 시 국방부 부지 확정 불가', '전력 계통 미확정 시 착공 지연'.\n" +
      "  · 부처 이름은 기사·데이터에 나온 것만 쓴다. 소관을 추측해 지어내지 말 것.\n" +
      "  · 협의·합의·이견·부처 간·범정부·조정 같은 말이 기사에 있으면 다부처 신호다.\n" +
      "  · risks 를 고를 때 여러 부처가 걸린 건을 한 부처짜리보다 앞에 둔다.\n" +
      "risks 는 오늘 기사에 문면 근거가 있어야 한다 — 관문 지식으로 리스크를 만들지 말 것" +
      "(기사에 없는 '규정 미제정' 류 금지):\n" +
      "  · 칼럼·사설만 근거면 text 앞에 '(칼럼) ' 을 붙여 근거 성격을 밝힌다.\n" +
      "  · interlock 은 기사 문면이나 관문 의존관계로 입증되는 연쇄만 — 병렬 절차를 " +
      "인과로 잇지 말 것(전력계획 지연→용수계획 불가 같은 창작이 대표 실패).\n" +
      "  · 장관·전문가의 조건부 발언·전망은 '발언 제기 + 파급' 구조로 쓴다 — 가정문을 " +
      "벌어진 일처럼 쓰면 실패다.\n" +
      "  · 사업지 현장의 노동·쟁의 기사(파업·교섭 결렬)가 오늘 있으면 반드시 리스크 " +
      "후보로 검토한다 — 현장 파업은 민간 갈등이 아니라 공정 리스크다.\n" +
      "advances: gateSteps 에 든 절차 중, 오늘 기사가 '실제로 일어났다'고 말하는 것만 고른다.\n" +
      "  '필요하다·요구했다·전망이다·검토 중이다'는 일어난 게 아니다 — 넣지 말 것.\n" +
      "  '확정·의결·선정·고시·체결·접수'처럼 그 절차가 끝났음이 분명할 때만 verdict 를 '일어남'으로 한다.\n" +
      "  제목에 통과·의결·확정·선정·고시·접수·체결이 있는 기사는 하나하나 advances 후보로 " +
      "검토하라 — 완료 사건을 놓치는 것도 실패다.\n" +
      "  3중 일치 — ①절차 명칭 ②행위 주체 ③대상 사업이 gateSteps 정의와 맞을 때만 넣는다. " +
      "'유치 신청'≠'승인 신청', '로드맵 발표'≠법정 계획 확정.\n" +
      "  '심의 및 공고' 같은 복합 절차는 전 단계가 기사로 확인될 때만 — 앞부분만 확인되면 넣지 않는다.\n" +
      "  해당 없으면 빈 배열. 지어내지 말 것 — step 은 gateSteps 의 문자열을 그대로 복사한다.\n\n데이터:\n" +
      JSON.stringify(payload);
    const out = execFileSync("claude", ["-p", prompt], { encoding: "utf8", timeout: 240_000 });
    const m = out.match(/\{[\s\S]*\}/);          // 앞뒤 잡담이 붙어도 객체만 집는다
    if (!m) throw new Error("JSON 객체를 찾지 못함");
    const parsed = JSON.parse(m[0]);
    const bad = validate(parsed);
    if (bad.length) throw new Error(`형식 위반: ${bad.join(", ")}`);
    // 부처명은 근거가 있는 것만 남긴다. 걸러낸 뒤 하나 이하로 줄면
    // '부처 간 물림'이라는 전제가 무너지므로 interlock 도 함께 버린다.
    for (const r of parsed.risks ?? []) {
      const kept = groundMinistries(r.ministries, (r.gates ?? [])[0]);
      const dropped = (r.ministries ?? []).length - kept.length;
      if (dropped > 0) console.warn(`  근거 없는 부처명 ${dropped}개 제거: ${r.text}`);
      r.ministries = kept;
      if (kept.length < 2) r.interlock = "";
    }
    // 언론사는 모델이 쓰지 않고, 지목한 번호로 코드가 붙인다(창작 차단)
    for (const r of parsed.reports) {
      const h = HEADLINES[r.headlineIndex];
      r.press = h ? h.press : null;
      r.sourceTitle = h ? h.title : null;
      // 사실을 보탠 기사도 제목으로 남긴다 — 검수 때 출처 추적이 끊기지 않게
      r.extraTitles = (r.extraIndexes ?? [])
        .map((i) => HEADLINES[i]?.title).filter(Boolean);
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
