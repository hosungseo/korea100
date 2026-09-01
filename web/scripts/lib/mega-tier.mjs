// 위상 계층(leadership tier) 분류 — 스크립트 쪽 정본.
//
// 결정주체 자유 텍스트를 총리·국무회의 / 국회 / 대통령 소속 위원회 / 부처 장관 /
// 지자체장 / 위원회·전문기관 / 실무·사업자로 접는다. 담당 표기는 제도별 자유
// 텍스트라 규칙 기반 휴리스틱이며, 복수 주체가 병기되면 가장 높은 위상을 취한다.
//
// 사이트 런타임(web/src/lib/mega-tier.ts)은 5계층만 쓰고, 워룸 지도·온톨로지
// 파생은 국회·대통령 소속 위원회를 따로 둔 7계층을 쓴다. 두 스크립트가 각자
// 사본을 들고 있으면 어휘가 갈라지므로 여기 한 곳에서만 정의한다.
//
// 워룸 정직성 규칙: "산업단지 지정권자"·"승인기관" 같은 역할명은 지정 경로
// 확정 전까지 특정 기관·계층으로 치환하지 않는다 → 어느 패턴에도 안 걸려
// field로 남는다. 예외로 위원장이 국무총리로 법정된 위원회만 cabinet에 둔다.

export const TIER_RANK = Object.freeze({
  cabinet: 6,
  legislature: 5,
  presidential_committee: 4,
  minister: 3,
  local: 2,
  committee: 1,
  field: 0,
});

export const TIER_LABEL = Object.freeze({
  cabinet: "총리·국무회의",
  legislature: "국회",
  presidential_committee: "대통령 소속 위원회",
  minister: "부처 장관",
  local: "지자체장",
  committee: "위원회·전문기관",
  field: "실무·사업자·기타",
});

/** 중앙정부 결정선 — 총리 테이블에 오르거나 국무위원이 직접 서명하는 계층. */
export const CENTRAL_TIERS = new Set(["cabinet", "legislature", "presidential_committee", "minister"]);
/** 정부 기관 결정선(중앙+지자체). 사업자·위원회·미특정 주체는 제외. */
export const GOVERNMENT_TIERS = new Set([...CENTRAL_TIERS, "local"]);

// 대통령 소속 위원회 — 그 심의·의결이 법정 요건인 위원회(지방시대위원회:
// 균형성장법 §62 대통령 소속, §9·§23·§31에서 심의·의결이 법정 절차).
// 일반 심의위원회와 급이 다르므로 별도 계층으로 둔다.
const PRESIDENTIAL_COMMITTEE_PATTERN = /^(지방시대위원회|국가자치분권균형성장회의|국토정책위원회)$/;
// 입법부 — 법률 제·개정이 선행조건인 관문(5극3특 법제 트랙 등). 위원회명에
// 붙는 "의회"(전력정책심의회)와 섞이지 않도록 토큰을 앵커로 잡는다.
const LEGISLATURE_PATTERN = /^(국회|국회 본회의|국회 상임위원회|지방의회|시·도의회)$/;
// 위원장=국무총리 법정 위원회(국가첨단전략산업법 §9, 전력망확충특별법 §6,
// 반도체특별법 위원회 규정) — 총리 테이블에 올라가는 의결이라 cabinet.
const PM_CHAIRED_COMMITTEE_PATTERN =
  /국가첨단전략산업위원회|국가기간전력망확충위원회|반도체산업경쟁력강화특별위원회/;
const CABINET_PATTERN = /국무회의|국무총리|국무조정실|대통령|청와대|범정부/;
// 부분 문자열 오매칭 주의 — "재정부서"의 '정부', "분산에너지사업자"의 '지사',
// "전력시장"의 '시장'이 걸리지 않도록 구체 토큰만 나열한다.
const APPLICANT_ACTOR_PATTERN =
  /^(신청인|제안자|사업시행자|사업자|사업주|기업|입주기업|외국인투자가|영업자|할당대상업체|건설사업자|소유자|토지소유자|주민)/;
const MINISTER_PATTERN =
  /장관|산업통상부|산업통상자원부|기획재정부|기후에너지환경부|행정안전부|국토교통부|고용노동부|과학기술정보통신부|문화체육관광부|농림축산식품부|해양수산부|중소벤처기업부|보건복지부|기획예산처|환경부|국방부|국가유산청|소방청|산림청|경찰청|조달청|기상청|중앙행정기관|중앙관서|중앙부처|주무부처|주관부처/;
const LOCAL_PATTERN =
  /시·도지사|도지사|시장·군수|시장등|군수|구청장|관할 구청|광주시|전라남도|광주특별시|통합특별시|지자체|지방자치단체|시·도|시·군·구|지적소관청|공공하수도관리청/;
const COMMITTEE_PATTERN = /위원회|심의|전문기관|심사|검토기관|의회|정책심의회/;

export function classifyTier(actor) {
  const text = String(actor ?? "");
  // 결정주체가 정확히 "정부"인 경우만 — 부분 문자열(재정부서의 '정부')을
  // 피하려고 패턴에 안 넣은 토큰이라 완전 일치로만 잡는다.
  if (text === "정부") return "cabinet";
  if (PM_CHAIRED_COMMITTEE_PATTERN.test(text)) return "cabinet";
  if (CABINET_PATTERN.test(text)) return "cabinet";
  if (LEGISLATURE_PATTERN.test(text)) return "legislature";
  if (PRESIDENTIAL_COMMITTEE_PATTERN.test(text)) return "presidential_committee";
  if (APPLICANT_ACTOR_PATTERN.test(text)) return "field";
  if (MINISTER_PATTERN.test(text)) return "minister";
  if (LOCAL_PATTERN.test(text)) return "local";
  if (COMMITTEE_PATTERN.test(text)) return "committee";
  return "field";
}

/** 병기된 주체 중 가장 높은 위상. decision이 있으면 decision, 없으면 lead. */
export function highestTier(actors) {
  let best = "field";
  for (const actor of actors ?? []) {
    const tier = classifyTier(actor);
    if (TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }
  return best;
}

/** 오버레이 마일스톤의 결정 위상 — actorRoles.decision 우선, 없으면 lead. */
export function milestoneTier(node) {
  const decision = node.actorRoles?.decision ?? [];
  const actors = decision.length ? decision : node.actorRoles?.lead ?? [];
  return highestTier(actors);
}

/**
 * 절차 단계 하나의 결정 위상 — 조문을 읽고 붙인 데이터가 있으면 그것을 쓰고,
 * 없으면 담당 표기 문자열 추정으로 물러선다. 어느 쪽이었는지를 함께 돌려주는 것이
 * 요점이다. 화면이 "장관급 결정 단계 22개"라고 쓸 때 그 22개가 데이터인지
 * 추정인지 말할 수 있어야 한다.
 */
export function stepTier(node) {
  const reviewed = node?.decision;
  if (reviewed?.source === "article-reviewed" && TIER_RANK[reviewed.tier] !== undefined) {
    return {
      tier: reviewed.tier,
      is_decision: Boolean(reviewed.is_decision),
      source: "article-reviewed",
      basis_article: reviewed.basis_article ?? null,
    };
  }
  // 조문이 권한자를 안 정했다고 판정된 단계는 추정으로 되돌아가지 않는다.
  // 모른다고 판정한 것을 추정으로 덮으면 판정한 의미가 없다.
  if (reviewed?.source === "unresolved") {
    return { tier: "unknown", is_decision: Boolean(reviewed.is_decision), source: "unresolved", basis_article: null };
  }
  return {
    tier: classifyTier(node?.actor),
    is_decision: isDecisionStep(node?.name),
    source: "heuristic",
    basis_article: null,
  };
}

// 결정성: 절차가 승인·지정·의결·고시류 관문인가. "A부터 B까지 신청·계획 작성" 같은
// 장문 절차명은 범위 서술에 결정 동사가 섞이므로 '까지' 뒤 꼬리만 판정한다.
const DECISION_PATTERN = /승인|허가|인가|지정|고시|의결|결정|처분|재가|협약|확정|심의|면제|판단|채택|청문/;
const APPLICANT_STEP_PATTERN = /신청|접수|작성|제출|준비|요청|신고/;
const STRONG_DECISION_PATTERN = /처분|의결|심의|승인|고시|확정|지정|면제|청문/;
const RECEIVING_TAIL_PATTERN = /(수령|이행|반영)$/;

export function isDecisionStep(stepName) {
  const base = String(stepName ?? "").replace(/\([^)]*\)/g, "").trim();
  const tail = base.includes("까지 ") ? base.slice(base.lastIndexOf("까지 ") + "까지 ".length) : base;
  if (RECEIVING_TAIL_PATTERN.test(tail)) return false;
  if (!DECISION_PATTERN.test(tail)) return false;
  if (APPLICANT_STEP_PATTERN.test(tail) && !STRONG_DECISION_PATTERN.test(tail)) return false;
  return true;
}
