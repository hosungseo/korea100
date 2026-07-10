import type {
  LegalSource,
  ProcessModel,
  ProcessNode,
  ProcessNodeLegalBasis,
  SourceVerification,
  UnresolvedLegalSource,
} from "./types";

export type NodeVerificationState =
  | "article-verified"
  | "source-linked"
  | "scope-limited"
  | "needs-review"
  | "not-cited";

export interface BasisVerificationResult {
  basis: ProcessNodeLegalBasis;
  hasExplicitArticle: boolean;
  sources: LegalSource[];
  unresolved: UnresolvedLegalSource[];
}

export interface NodeVerificationResult {
  state: NodeVerificationState;
  label: string;
  detail: string;
  bases: BasisVerificationResult[];
  lowConfidence: boolean;
}

export interface ProcessVerificationSummary {
  totalNodes: number;
  legalNodes: number;
  articleVerifiedNodes: number;
  sourceLinkedNodes: number;
  scopeLimitedNodes: number;
  needsReviewNodes: number;
  fieldCheckNodes: number;
  articleReferences: number;
  verifiedReferences: number;
}

const LAW_ALIASES = new Map(
  [
    ["하도급법", "하도급거래 공정화에 관한 법률"],
    ["공정거래법", "독점규제 및 공정거래에 관한 법률"],
    ["배출권거래법", "온실가스 배출권의 할당 및 거래에 관한 법률"],
    ["배출권거래법 시행령", "온실가스 배출권의 할당 및 거래에 관한 법률 시행령"],
    ["인공지능 기본법", "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법"],
    ["인공지능 기본법 시행령", "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 시행령"],
    ["112신고의 운영 및 처리 등에 관한 법률", "112신고의 운영 및 처리에 관한 법률"],
  ].map(([alias, official]) => [compactLawName(alias), official]),
);

const COMPOSITE_LAWS = new Map(
  [
    [
      "근로기준법·노동조합 및 노동관계조정법",
      ["근로기준법", "노동조합 및 노동관계조정법"],
    ],
    [
      "방송심의에 관한 규정·정보통신에 관한 심의규정",
      ["방송심의에 관한 규정", "정보통신에 관한 심의규정"],
    ],
    ["난민법 및 행정소송법", ["난민법", "행정소송법"]],
    ["민법·상법 등 실체법", ["민법", "상법"]],
    ["법률구조법 시행령·공단 내부규정", ["법률구조법 시행령"]],
    ["인공지능 기본법 시행령·고시", ["인공지능 기본법 시행령"]],
  ].map(([law, targets]) => [compactLawName(law as string), targets as string[]]),
);

const EXPLICIT_ARTICLE = /제\s*\d+\s*조(?:의\s*\d+)?/;

export const unresolvedReasonLabels: Record<UnresolvedLegalSource["reasonCode"], string> = {
  "local-scope": "지역 지정 필요",
  "institution-scope": "적용 범위 지정 필요",
  "internal-rule": "내부규정 확인 필요",
  "external-official-document": "소관 부처 문서 확인",
  "title-needs-confirmation": "공식 제명 확인 필요",
};

export function compactLawName(value: string | undefined): string {
  return (value ?? "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .replace(/[「」『』“”‘’·ㆍ,;:/]/g, "")
    .trim();
}

function lawTargets(law: string): string[] {
  const compact = compactLawName(law);
  const targets = COMPOSITE_LAWS.get(compact);
  if (targets) return targets;

  const alias = LAW_ALIASES.get(compact);
  if (alias) return [alias];

  if (/\s+및\s+하위법령\s*$/.test(law)) {
    return [law.replace(/\s+및\s+하위법령\s*$/, "")];
  }

  return [law];
}

function sourceNames(source: LegalSource): string[] {
  return [source.law, source.officialName].filter((value): value is string => Boolean(value));
}

function sourceMatchesTarget(source: LegalSource, target: string): boolean {
  const targetKey = compactLawName(target);
  return sourceNames(source).some((name) => {
    const key = compactLawName(name);
    return key === targetKey || compactLawName(LAW_ALIASES.get(targetKey)) === key;
  });
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function findSources(law: string, sources: LegalSource[]): LegalSource[] {
  const targets = lawTargets(law);
  const matched = sources.filter((source) =>
    targets.some((target) => sourceMatchesTarget(source, target)),
  );

  if (/\s+및\s+하위법령\s*$/.test(law)) {
    const base = compactLawName(targets[0]);
    matched.push(
      ...sources.filter((source) =>
        sourceNames(source).some((name) => compactLawName(name).startsWith(base)),
      ),
    );
  }

  return uniqueBy(matched, (source) => source.officialUrl);
}

function significantTokens(value: string): string[] {
  const stop = new Set([
    "관련",
    "관한",
    "등에",
    "등의",
    "법률",
    "시행령",
    "시행규칙",
    "규정",
    "기준",
    "지침",
    "고시",
    "내부규정",
  ]);
  return value
    .replace(/[()·ㆍ,;:/]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stop.has(token));
}

function unresolvedDescriptorMatches(
  law: string,
  item: UnresolvedLegalSource,
  unresolved: UnresolvedLegalSource[],
): boolean {
  const lawKey = compactLawName(law);
  const itemKey = compactLawName(item.law);
  if (lawKey === itemKey) return true;
  if (Math.min(lawKey.length, itemKey.length) >= 6 && (lawKey.includes(itemKey) || itemKey.includes(lawKey))) {
    return true;
  }

  const markerByReason: Record<UnresolvedLegalSource["reasonCode"], RegExp> = {
    "local-scope": /조례|자치법규|회의규칙/,
    "institution-scope": /각\s*부처|해당|개별|업종별|기관별/,
    "internal-rule": /내부규정|내규/,
    "external-official-document": /지침|편람|계획|기준|통보|매뉴얼/,
    "title-needs-confirmation": /고시|지침|규정|가이드라인/,
  };
  if (!markerByReason[item.reasonCode].test(law)) return false;

  const lawTokens = new Set(significantTokens(law));
  const sharedToken = significantTokens(item.law).some((token) => lawTokens.has(token));
  const sameReasonCount = unresolved.filter((candidate) => candidate.reasonCode === item.reasonCode).length;
  return sharedToken || sameReasonCount === 1;
}

function findUnresolved(
  law: string,
  unresolved: UnresolvedLegalSource[],
): UnresolvedLegalSource[] {
  return unresolved.filter((item) => unresolvedDescriptorMatches(law, item, unresolved));
}

function articleAuditIsClean(verification: SourceVerification | undefined): boolean {
  const article = verification?.articleVerification;
  return Boolean(article && article.missingReferences === 0 && article.uncheckableReferences === 0);
}

export function getNodeVerification(
  node: ProcessNode,
  verification: SourceVerification | undefined,
): NodeVerificationResult {
  const lowConfidence = node.confidence !== undefined && node.confidence < 0.8;
  const legalBasis = node.legal_basis ?? [];

  if (legalBasis.length === 0) {
    return {
      state: "not-cited",
      label: "근거 미기재",
      detail: "이 노드에는 법적 근거가 기재되지 않았습니다.",
      bases: [],
      lowConfidence,
    };
  }

  if (!verification) {
    return {
      state: "needs-review",
      label: "출처 확인",
      detail: "기관 검증 메타데이터가 없어 공식 원문 연결 상태를 확인할 수 없습니다.",
      bases: legalBasis.map((basis) => ({
        basis,
        hasExplicitArticle: EXPLICIT_ARTICLE.test(basis.article),
        sources: [],
        unresolved: [],
      })),
      lowConfidence,
    };
  }

  const unresolved = verification.unresolved ?? [];
  const bases = legalBasis.map((basis) => ({
    basis,
    hasExplicitArticle: EXPLICIT_ARTICLE.test(basis.article),
    sources: findSources(basis.law, verification.sources),
    unresolved: findUnresolved(basis.law, unresolved),
  }));

  if (bases.some((basis) => basis.unresolved.length > 0)) {
    return {
      state: "scope-limited",
      label: "범위별 출처",
      detail: "공식 원문과 함께 지역·기관·내부규정 등 적용 범위를 추가로 지정해야 합니다.",
      bases,
      lowConfidence,
    };
  }

  if (bases.some((basis) => basis.hasExplicitArticle) && articleAuditIsClean(verification)) {
    return {
      state: "article-verified",
      label: "조문 확인",
      detail: "현행 공식 원문에서 이 노드가 인용한 명시 조문 번호의 존재를 확인했습니다.",
      bases,
      lowConfidence,
    };
  }

  if (bases.every((basis) => basis.sources.length > 0)) {
    return {
      state: "source-linked",
      label: "원문 연결",
      detail: "이 노드의 법적 근거에 대응하는 현행 공식 원문을 연결했습니다.",
      bases,
      lowConfidence,
    };
  }

  return {
    state: "needs-review",
    label: "출처 확인",
    detail: "이 노드의 법적 근거와 기관별 검증 출처를 직접 매칭해야 합니다.",
    bases,
    lowConfidence,
  };
}

export function summarizeProcessVerification(
  process: ProcessModel,
  verification: SourceVerification | undefined,
): ProcessVerificationSummary {
  const results = process.nodes.map((node) => getNodeVerification(node, verification));
  const article = verification?.articleVerification;

  return {
    totalNodes: process.nodes.length,
    legalNodes: process.nodes.filter((node) => (node.legal_basis?.length ?? 0) > 0).length,
    articleVerifiedNodes: results.filter((result) => result.state === "article-verified").length,
    sourceLinkedNodes: results.filter((result) => result.state === "source-linked").length,
    scopeLimitedNodes: results.filter((result) => result.state === "scope-limited").length,
    needsReviewNodes: results.filter((result) => result.state === "needs-review").length,
    fieldCheckNodes: results.filter((result) => result.lowConfidence).length,
    articleReferences: article?.articleReferences ?? 0,
    verifiedReferences: article?.verifiedReferences ?? 0,
  };
}
