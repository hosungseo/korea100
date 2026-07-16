"use client";

import type { ProcessModel, ProcessNode, SourceVerification } from "@/lib/types";
import {
  getNodeVerification,
  summarizeProcessVerification,
  unresolvedReasonLabels,
  type NodeVerificationResult,
  type NodeVerificationState,
} from "@/lib/process-verification";

const STATE_STYLE: Record<
  NodeVerificationState,
  { icon: string; color: string; background: string; border: string }
> = {
  "article-verified": {
    icon: "✓",
    color: "#087452",
    background: "#e7f7ef",
    border: "#a9ddc8",
  },
  "source-linked": {
    icon: "↗",
    color: "#315a78",
    background: "#edf5fa",
    border: "#bfd5e3",
  },
  "scope-limited": {
    icon: "!",
    color: "#9a650f",
    background: "#fef6e7",
    border: "#ead19b",
  },
  "needs-review": {
    icon: "!",
    color: "#a33a2b",
    background: "#fff1ef",
    border: "#edc0b8",
  },
  "not-cited": {
    icon: "-",
    color: "#68766f",
    background: "#f5f7f6",
    border: "#d3ddd7",
  },
};

export function VerificationMark({
  result,
  inverse = false,
  compact = false,
}: {
  result: NodeVerificationResult;
  inverse?: boolean;
  compact?: boolean;
}) {
  const visual = STATE_STYLE[result.state];
  return (
    <span
      data-verification-state={result.state}
      title={result.detail}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        maxWidth: "100%",
        minHeight: compact ? 16 : 20,
        padding: compact ? "1px 5px" : "2px 7px",
        borderRadius: 4,
        border: `1px solid ${inverse ? "rgba(255,255,255,.42)" : visual.border}`,
        background: inverse ? "rgba(255,255,255,.14)" : visual.background,
        color: inverse ? "#ffffff" : visual.color,
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true" style={{ flexShrink: 0 }}>
        {visual.icon}
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{result.label}</span>
    </span>
  );
}

// 인용에서 조(제N조/제N조의M)와 항(제M항)을 추출해 표시·링크에 쓴다.
function parseArticleParts(article: string): { jo: string | null; hang: string | null } {
  const jo = article.match(/제\s*\d+\s*조(?:의\s*\d+)?/)?.[0]?.replace(/\s+/g, "") ?? null;
  const hang = article.match(/제\s*\d+\s*항/)?.[0]?.replace(/\s+/g, "") ?? null;
  return { jo, hang };
}

// 채번(라벨) 규칙: 법령명이 서로 다른 근거가 섞이므로 각 버튼·행에 법령 약칭을 붙인다.
// 잘 알려진 약칭 맵 + "…시행령/…시행규칙" 접미 유지, 계약예규는 "(계약예규)" 접두 제거.
const LAW_SHORT_NAMES: [RegExp, string][] = [
  [/^국가를 당사자로 하는 계약에 관한 법률/, "국가계약법"],
  [/^지방자치단체를 당사자로 하는 계약에 관한 법률/, "지방계약법"],
  [/^조달사업에 관한 법률/, "조달사업법"],
  [/^중소기업제품 구매촉진 및 판로지원에 관한 법률/, "판로지원법"],
  [/^전자조달의 이용 및 촉진에 관한 법률/, "전자조달법"],
  [/^하도급거래 공정화에 관한 법률/, "하도급법"],
  [/^녹색제품 구매촉진에 관한 법률/, "녹색제품법"],
  [/^중증장애인생산품 우선구매 특별법/, "중증장애인생산품법"],
  [/^여성기업지원에 관한 법률/, "여성기업법"],
  [/^장애인기업활동 촉진법/, "장애인기업법"],
  [/^국고금 관리법/, "국고금관리법"],
];

export function shortLawName(law: string): string {
  const cleaned = law.replace(/^\(계약예규\)\s*/, "");
  for (const [pattern, short] of LAW_SHORT_NAMES) {
    if (pattern.test(cleaned)) {
      const suffix = cleaned.match(/시행령|시행규칙/)?.[0];
      return suffix ? `${short} ${suffix}` : short;
    }
  }
  return cleaned;
}

// 근거별 [조문 확인] 버튼 — 팝업 없이 법제처 해당 조문으로 바로 이동한다(운영자 지시, 2026-07-16).
// 법령(statute)은 조 단위 딥링크(officialUrl/제N조), 행정규칙은 규칙 본문으로 이동.
// 라벨은 조까지, 항이 있으면 항까지 표기한다.
export function ArticleLinkButtons({ result }: { result: NodeVerificationResult }) {
  const linked = result.bases.filter(({ sources }) => sources[0]?.officialUrl);
  if (linked.length === 0) return null;
  return (
    <span className="article-link-buttons">
      {linked.map(({ basis, sources }, index) => {
        const { jo, hang } = parseArticleParts(basis.article ?? "");
        const source = sources[0];
        const deepable = jo && /law\.go\.kr\/(법령|행정규칙)\//.test(source.officialUrl);
        const href = deepable ? `${source.officialUrl.replace(/\/+$/, "")}/${jo}` : source.officialUrl;
        const label = jo ? `${jo}${hang ?? ""}` : "조문 확인";
        return (
          <a
            key={`${basis.law}:${basis.article}:${index}`}
            className="article-link-button"
            href={href}
            target="_blank"
            rel="noreferrer"
            title={`${basis.law} ${basis.article} — 국가법령정보센터 현행 원문으로 이동`}
            onClick={(event) => event.stopPropagation()}
          >
            ✓ {label} ↗
          </a>
        );
      })}
    </span>
  );
}

// 법적 근거 행 목록 — 요지 대신 **인용 단위의 원문**을 보여준다(운영자 지시, 2026-07-16).
// 조 인용이면 조 원문, 항 인용이면 populate가 항 단위로 추출한 그 항의 원문만.
// 라벨 채번: 법령 약칭 + 조(항) + (조문 제목). 원문 미수록이면 요약으로 대체하지 않고 안내만.
export function ArticleBasisRows({ result }: { result: NodeVerificationResult }) {
  if (result.bases.length === 0) return <p>명시 조문 확인 필요</p>;
  return (
    <div className="article-basis-rows">
      {result.bases.map(({ basis, sources, sourceText, articleTitle }, index) => {
        const { jo, hang } = parseArticleParts(basis.article ?? "");
        const source = sources[0];
        const deepable = source?.officialUrl && jo && /law\.go\.kr\/(법령|행정규칙)\//.test(source.officialUrl);
        const href = deepable
          ? `${source.officialUrl.replace(/\/+$/, "")}/${jo}`
          : source?.officialUrl;
        const label = `${shortLawName(basis.law)} ${jo ? `${jo}${hang ?? ""}` : basis.article}`;
        return (
          <article key={`${basis.law}:${basis.article}:${index}`} className="article-basis-row">
            <div className="article-basis-head">
              <strong>
                {label}
                {articleTitle ? <span className="article-basis-title">({articleTitle})</span> : null}
              </strong>
              {href && (
                <a
                  className="article-link-button"
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  title={`${basis.law} ${basis.article} — 국가법령정보센터 현행 원문으로 이동`}
                  onClick={(event) => event.stopPropagation()}
                >
                  원문 ↗
                </a>
              )}
            </div>
            {sourceText ? (
              <pre className="article-basis-source">{sourceText}</pre>
            ) : (
              <p className="article-basis-nosource">원문 미수록 — [원문 ↗]에서 확인</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="process-verification-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function ProcessVerificationSummaryBar({
  process,
  verification,
  compact = false,
}: {
  process: ProcessModel;
  verification?: SourceVerification;
  compact?: boolean;
}) {
  const summary = summarizeProcessVerification(process, verification);
  const unresolvedSources = verification?.unresolved?.length ?? 0;
  const checkedLabel = verification?.articleVerification
    ? `명시 조문 ${summary.verifiedReferences}/${summary.articleReferences}건 확인`
    : "공식 출처 검증 정보 없음";

  return (
    <div
      className={`process-verification-summary${compact ? " is-compact" : ""}`}
      data-process-verification-summary="true"
    >
      <div className="process-verification-summary-copy">
        <span>법적 근거 검증</span>
        <strong>{checkedLabel}</strong>
        {verification && (
          <small>
            기준일 {verification.verifiedAt}
            {unresolvedSources > 0 ? ` · 범위별 출처 ${unresolvedSources}건` : ""}
          </small>
        )}
      </div>
      <div className="process-verification-metrics" aria-label="업무구조도 검증 요약">
        <Metric label="근거 노드" value={`${summary.legalNodes}/${summary.totalNodes}`} />
        <Metric
          label="원문 확인"
          value={summary.articleVerifiedNodes + summary.sourceLinkedNodes}
        />
        <Metric
          label="추가 확인"
          value={summary.scopeLimitedNodes + summary.needsReviewNodes}
        />
        <Metric label="현장 검증" value={summary.fieldCheckNodes} />
      </div>
    </div>
  );
}

export function NodeLegalVerification({
  node,
  verification,
}: {
  node: ProcessNode;
  verification?: SourceVerification;
}) {
  const result = getNodeVerification(node, verification);

  return (
    <div data-node-verification={result.state}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <VerificationMark result={result} />
        <p style={{ margin: 0, color: "#5d6b63", fontSize: 12, lineHeight: 1.55 }}>
          {result.detail}
        </p>
      </div>

      <ArticleBasisRows result={result} />

      {result.bases.flatMap(({ unresolved }) => unresolved).map((item) => (
        <div
          key={`${item.reasonCode}:${item.law}`}
          style={{
            marginTop: 8,
            paddingLeft: 9,
            borderLeft: "2px solid #c78116",
            color: "#7b5415",
            fontSize: 11,
            lineHeight: 1.55,
          }}
        >
          <strong>{unresolvedReasonLabels[item.reasonCode]}</strong> · {item.law}
          <span style={{ display: "block", color: "#5d6b63" }}>
            다음 확인: {item.nextStep}
          </span>
        </div>
      ))}

      {verification?.articleVerification && (
        <p
          style={{
            margin: "9px 0 0",
            paddingTop: 9,
            borderTop: "1px solid #dde5df",
            color: "#87938d",
            fontSize: 10.5,
            lineHeight: 1.5,
          }}
        >
          검증 범위는 조문 번호의 현행 원문 존재 여부입니다. 해석과 사건별 적용 판단은 포함하지 않습니다.
        </p>
      )}
    </div>
  );
}

export function VerificationLegend() {
  const items: Array<{ state: NodeVerificationState; label: string }> = [
    { state: "article-verified", label: "조문 확인" },
    { state: "source-linked", label: "원문 연결" },
    { state: "scope-limited", label: "범위별 출처" },
    { state: "needs-review", label: "출처 확인" },
  ];

  return (
    <div className="process-legend-group">
      <strong>검증</strong>
      <div className="process-legend-items">
        {items.map(({ state, label }) => {
          const visual = STATE_STYLE[state];
          return (
            <span key={state}>
              <i
                aria-hidden="true"
                style={{
                  color: visual.color,
                  background: visual.background,
                  borderColor: visual.border,
                }}
              >
                {visual.icon}
              </i>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
