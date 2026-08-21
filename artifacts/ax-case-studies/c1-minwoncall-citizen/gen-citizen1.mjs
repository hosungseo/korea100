import fs from "node:fs";

// ── 시민판 1호: 행안부 '모두의 민원콜' — 시민 여정 전후 비교 ──────────
// 시민판 문법: 파랑 = "제도를 알아야 넘는 탐색 구간"(추론→탐색 라벨 후처리).
// 규정은 본 세션 DRF 원문 대조: 민원처리법 §8·9·16·17·19·27·35 /
// 부패방지권익위법 §12 제15호·제16호(민원 안내·상담, 정부민원안내콜센터).

const N = (id, gate, lane, kind, name, sub, tag) => ({ id, gate, lane, kind, name, sub, tag });

const DIR = "/private/tmp/claude-501/-Users-seohoseong/e453ea98-61a3-4e5d-97d4-ff8971c09387/scratchpad";
const TPL = fs.readFileSync(`${DIR}/sheet-template.js`, "utf8");
const { sheet } = new Function(`${TPL}\nreturn { sheet };`)();

// citizen-version relabeling: blue means "exploration burden", not "inferred practice"
const citizen = (html) => html
  .replaceAll(">추론</em>", ">탐색</em>")
  .replaceAll("추론(암묵지) <b>", "탐색(제도 문해) <b>")
  .replaceAll("추론 — 규정에 없는 암묵지·실무 관행", "탐색 — 제도를 알아야 넘는 구간(시민의 제도 문해 부담)");

const LANES = ["시민", "잘못 찾아간 기관", "소관 기관", "안내·시스템(110·국민신문고)"];
const LANES_T = [...LANES, "모두의 민원콜(AI)"];
const GATES = ["G0 문제 인지", "G1 소관 탐색", "G2 문의·뺑뺑이", "G3 신청·접수", "G4 이송·재배정", "G5 처리·통지"];

const asisNodes = [
  N("P01", 0, 0, "inferred", "내 문제를 '민원 언어'로 번역", "무슨 민원인지부터 알아야 함 — 제도 문해 부담"),
  N("P02", 1, 0, "inferred", "소관기관 추측·인터넷 검색", "부처·지자체·공공기관 중 어디?"),
  N("P03", 1, 3, "statute", "110 안내·상담", "부패방지권익위법 제12조제15호·제16호(정부민원안내콜센터)"),
  N("P04", 2, 1, "inferred", "대표번호 전화 — “우리 소관 아님”", "기관 뺑뺑이"),
  N("P05", 2, 1, "inferred", "안내받은 기관에 재문의", "뺑뺑이 반복"),
  N("P06", 3, 0, "inferred", "서식 찾기·요구 서류 파악", "기관마다 다른 서식 — 탐색"),
  N("P07", 3, 0, "statute", "민원 신청(문서·전자)", "민원처리법 제8조"),
  N("P08", 3, 2, "statute", "접수", "민원처리법 제9조"),
  N("P09", 4, 2, "statute", "비소관 시 이송·이송 통지", "민원처리법 제16조(민원문서의 이송)"),
  N("P10", 4, 0, "inferred", "이송 후 행방 추적·재확인", "어느 기관으로 갔는지 시민이 확인"),
  N("P11", 5, 2, "statute", "처리기간 기산·관리", "민원처리법 제17조·제19조"),
  N("P12", 5, 2, "statute", "처리결과 통지", "민원처리법 제27조"),
  N("P13", 5, 0, "statute", "거부처분 이의신청", "민원처리법 제35조"),
];
const asisEdges = [
  ["P01","P02"],["P02","P04"],["P04","P05"],["P05","P02","loop","다시 탐색"],
  ["P02","P03"],["P03","P06"],["P05","P06"],["P06","P07"],["P07","P08"],
  ["P08","P09"],["P09","P10"],["P09","P11"],["P11","P12"],["P12","P13"],
];

const tobeNodes = [
  ...asisNodes.filter((n) => !["P01","P02","P04","P05"].includes(n.id)).map((n) => {
    if (n.id === "P09") return N("P09", 4, 2, "changed", "비소관 시 이송(축소)", "민원처리법 제16조 — 첫 제출이 정확해져 이송 자체가 줄어듦");
    if (n.id === "P10") return N("P10", 4, 0, "changed", "이송 후 행방 확인", "라우팅 경로 안내로 추적 부담 축소");
    return n;
  }),
  N("A01", 0, 4, "auto", "자연어 문의 — 한 문장으로 시작", "'무슨 민원인지' 몰라도 됨"),
  N("P01", 0, 0, "replaced", "'민원 언어'로 번역", "자연어 접수로 대체", "A01로 대체"),
  N("A02", 1, 4, "auto", "AI 소관기관 판별·라우팅", "자연어→소관기관 자동 연결"),
  N("P02", 1, 0, "replaced", "소관기관 추측·검색", "자동 판별로 대체", "A02로 대체"),
  N("P04", 2, 1, "replaced", "대표번호 뺑뺑이 전화", "라우팅으로 대체", "A02로 대체"),
  N("P05", 2, 1, "replaced", "안내받은 기관 재문의", "라우팅으로 대체", "A02로 대체"),
];
const tobeEdges = [
  ["A01","A02","auto"],["A02","P03"],["A02","P06","auto"],
  ["P03","P06"],["P06","P07"],["P07","P08"],["P08","P09"],["P09","P10"],
  ["P09","P11"],["P11","P12"],["P12","P13"],
  ["P01","A01","replace"],["P02","A02","replace"],["P04","A02","replace"],["P05","A02","replace"],
];

const basis = "근거(본 세션 국가법령정보센터 DRF 원문 대조): 민원 처리에 관한 법률 제8조(민원의 신청)·제9조(접수)·제16조(민원문서의 이송)·제17조·제19조(처리기간)·제27조(처리결과의 통지)·제35조(거부처분 이의신청) · 부패방지 및 국민권익위원회의 설치와 운영에 관한 법률 제12조제15호(민원사항에 관한 안내·상담)·제16호(정부민원안내콜센터의 설치·운영). <b>시민판에서 파란 칸은 규정 밖 실무가 아니라 '제도를 알아야 넘는 탐색 구간'</b> — 공무원판의 암묵지에 대응하는 시민의 제도 문해 부담입니다. 도구 사실은 OPL 후보 리스트(행정안전부 박인창 — '모두의 민원콜' 자연어→소관기관 라우팅, 공공데이터 카탈로그 MCP) 기반이며, 세부 기능은 구상·시연 단계일 수 있어 AI 적용판은 제품 취지에 따른 재구성입니다.";

fs.writeFileSync(`${DIR}/citizen1-minwoncall-asis.html`, citizen(sheet({
  variant: "시민판 1호 · AS-IS", lanes: LANES, gates: GATES, basisNote: basis,
  title: "민원 한 건을 내려면, 시민은 먼저 <b>제도를 공부해야 한다</b>",
  subtitle: "이번엔 시민이 주인공 레인입니다. 신청·접수·이송·처리기간·통지는 민원처리법이 정하지만(초록), 내 문제가 '무슨 민원'인지 번역하고 소관기관을 찾아 뺑뺑이 도는 일(파랑)은 전부 시민 몫 — 제도를 아는 만큼만 빨라지는 구간입니다.",
  nodes: asisNodes, edges: asisEdges,
  headline: "전 단계 13 = 규정 7 + 탐색 6 · 뺑뺑이 루프 1",
})));
fs.writeFileSync(`${DIR}/citizen1-minwoncall-tobe.html`, citizen(sheet({
  variant: "시민판 1호 · AI 적용", lanes: LANES_T, gates: GATES, width: 1680, toolLane: true, basisNote: basis,
  title: "'모두의 민원콜'이 다섯 번째 레인으로 — <b>4개 대체, 탐색은 서식 찾기만 남는다</b>",
  subtitle: "행안부 주무관이 개발한 자연어 라우팅을 새 레인으로 세웠습니다. 한 문장으로 말하면 AI가 소관기관을 판별해 연결하고 — 번역·추측·뺑뺑이가 통째로 넘어갑니다. 첫 제출이 정확해져 이송·추적도 가벼워집니다. 신청·접수·통지의 법정 관문과 서식 탐색은 그대로 남습니다.",
  nodes: tobeNodes, edges: tobeEdges,
  headline: "대체 4 · 간소화 2 · 소멸 0 · 자동 2 — 탐색 6 → 1 · 시민 단계 13 → 9",
})));
console.log("written citizen1-minwoncall");
