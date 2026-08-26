// 위상 계층(leadership tier) 분류 — 절차 담당(actor) 자유 텍스트를
// 총리·국무회의 / 부처 장관 / 지자체장 / 위원회·전문기관 / 실무·사업자로 접는다.
// 담당 표기는 제도별 자유 텍스트(350여 종)라 규칙 기반 휴리스틱이며,
// 복수 주체가 병기되면 가장 높은 위상을 취한다.

export type MegaTier = "cabinet" | "minister" | "local" | "committee" | "field";

export const TIER_ORDER: MegaTier[] = [
  "cabinet",
  "minister",
  "local",
  "committee",
  "field",
];

export const TIER_META: Record<MegaTier, { label: string; hint: string }> = {
  cabinet: { label: "총리·국무회의", hint: "범정부 마일스톤" },
  minister: { label: "부처 장관", hint: "중앙행정기관" },
  local: { label: "지자체장", hint: "시·도지사와 시·군·구청장" },
  committee: { label: "위원회·전문기관", hint: "심의·심사기구" },
  field: { label: "실무·사업자", hint: "신청·이행·검사" },
};

// 부분 문자열 오매칭 주의 — "재정부서"의 '정부', "분산에너지사업자"의 '지사',
// "전력시장"의 '시장'이 걸리지 않도록 구체 토큰만 나열한다.
const CABINET_PATTERN = /국무회의|국무총리|대통령|청와대|범정부/;
const APPLICANT_ACTOR_PATTERN =
  /^(신청인|제안자|사업시행자|사업자|사업주|기업|입주기업|외국인투자가|영업자|할당대상업체|건설사업자|소유자|토지소유자|주민)/;
const MINISTER_PATTERN =
  /장관|산업통상부|산업통상자원부|기획재정부|기후에너지환경부|행정안전부|국토교통부|고용노동부|과학기술정보통신부|문화체육관광부|농림축산식품부|해양수산부|중소벤처기업부|보건복지부|기획예산처|환경부|국방부|국가유산청|소방청|산림청|경찰청|조달청|기상청|중앙행정기관|중앙관서|중앙부처|주무부처|주관부처/;
const LOCAL_PATTERN =
  /시·도지사|도지사|시장·군수|시장등|군수|구청장|관할 구청|광주시|전라남도|전남광주시|지자체|지방자치단체|시·도|시·군·구|지적소관청|공공하수도관리청|산단 지정권자/;
const COMMITTEE_PATTERN =
  /위원회|심의|전문기관|심사|검토기관|의회|정책심의회/;

export function classifyTier(actor: string, stepName = ""): MegaTier {
  const blob = `${actor} ${stepName}`;
  if (CABINET_PATTERN.test(blob)) return "cabinet";
  if (APPLICANT_ACTOR_PATTERN.test(actor)) return "field";
  if (MINISTER_PATTERN.test(actor)) return "minister";
  if (LOCAL_PATTERN.test(actor)) return "local";
  if (COMMITTEE_PATTERN.test(actor)) return "committee";
  return "field";
}

// 결정성: 절차가 승인·지정·의결·고시류 관문인가. "A부터 B까지 신청·계획 작성" 같은
// 장문 절차명은 범위 서술에 결정 동사가 섞이므로 '까지' 뒤 꼬리만 판정한다.
const DECISION_PATTERN =
  /승인|허가|인가|지정|고시|의결|결정|처분|재가|협약|확정|심의|면제|판단|채택|청문/;
const APPLICANT_STEP_PATTERN = /신청|접수|작성|제출|준비|요청|신고/;
const STRONG_DECISION_PATTERN = /처분|의결|심의|승인|고시|확정|지정|면제|청문/;
const RECEIVING_TAIL_PATTERN = /(수령|이행|반영)$/;

export function isDecisionStep(stepName: string): boolean {
  const base = stepName.replace(/\([^)]*\)/g, "").trim();
  const tail = base.includes("까지 ")
    ? base.slice(base.lastIndexOf("까지 ") + "까지 ".length)
    : base;
  if (RECEIVING_TAIL_PATTERN.test(tail)) return false;
  if (!DECISION_PATTERN.test(tail)) return false;
  if (APPLICANT_STEP_PATTERN.test(tail) && !STRONG_DECISION_PATTERN.test(tail))
    return false;
  return true;
}
