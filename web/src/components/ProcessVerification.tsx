"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [open, setOpen] = useState(false);
  const visual = STATE_STYLE[result.state];
  const canOpen = result.bases.length > 0;
  return (
    <>
      <span
        data-verification-state={result.state}
        title={canOpen ? `${result.detail} (눌러서 조문 보기)` : result.detail}
        role={canOpen ? "button" : undefined}
        tabIndex={canOpen ? 0 : undefined}
        aria-haspopup={canOpen ? "dialog" : undefined}
        onClick={
          canOpen
            ? (event) => {
                event.stopPropagation();
                event.preventDefault();
                setOpen(true);
              }
            : undefined
        }
        onKeyDown={
          canOpen
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                  event.preventDefault();
                  setOpen(true);
                }
              }
            : undefined
        }
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
          cursor: canOpen ? "pointer" : undefined,
        }}
      >
        <span aria-hidden="true" style={{ flexShrink: 0 }}>
          {visual.icon}
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{result.label}</span>
      </span>
      {open && canOpen && (
        <ArticlePopover result={result} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// 근거법령 바로가기를 인용 조문 위치로 딥링크한다.
// law.go.kr 국문 주소는 /법령|행정규칙/<법령명>/<제N조(의M)> 꼴을 받으면
// 해당 조문(joNo)으로 화면을 이동시킨다. 패턴을 못 읽으면 법령 첫 화면 폴백.
function articleDeepUrl(officialUrl: string, article: string): string {
  const m = String(article).match(/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/);
  if (!m || !/law\.go\.kr\/(법령|행정규칙)\//.test(officialUrl)) return officialUrl;
  return `${officialUrl.replace(/\/+$/, "")}/제${m[1]}조${m[2] ? `의${m[2]}` : ""}`;
}

function ArticlePopover({
  result,
  onClose,
}: {
  result: NodeVerificationResult;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const visual = STATE_STYLE[result.state];
  return createPortal(
    <div
      className="article-popover-backdrop"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <section
        className="article-popover"
        role="dialog"
        aria-modal="true"
        aria-label="인용 조문 근거"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="article-popover-head">
          <span style={{ color: visual.color }}>
            {visual.icon} {result.label}
          </span>
          <button type="button" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <p className="article-popover-detail">{result.detail}</p>
        <div className="article-popover-list">
          {result.bases.map(({ basis, sources, sourceText, articleTitle, effectiveOn }, index) => (
            <article key={`${basis.law}:${basis.article}:${index}`}>
              <strong>{basis.law}</strong>
              <span className="article-popover-article">
                {basis.article}
                {articleTitle ? ` (${articleTitle})` : ""}
              </span>
              {sourceText ? (
                <pre className="article-popover-source">{sourceText}</pre>
              ) : (
                <p className="article-popover-nosource">
                  이 조문의 현행 원문은 아직 수록되지 않았습니다. 아래 근거법령 바로가기로 국가법령정보센터 원문을 확인하세요.
                </p>
              )}
              {(effectiveOn || result.checkedAt) && (
                <p className="article-popover-dates">
                  {effectiveOn ? `현행 시행일 ${effectiveOn}` : ""}
                  {effectiveOn && result.checkedAt ? " · " : ""}
                  {result.checkedAt ? `원문 확인일 ${result.checkedAt}` : ""}
                </p>
              )}
              {sources[0]?.officialUrl && (
                <a
                  className="article-popover-cta"
                  href={articleDeepUrl(sources[0].officialUrl, basis.article)}
                  target="_blank"
                  rel="noreferrer"
                >
                  근거법령 바로가기 ↗
                </a>
              )}
            </article>
          ))}
        </div>
        <footer className="article-popover-foot">
          조문 원문은 국가법령정보센터 현행 원문의 확인일 기준 사본입니다. 최신 개정 여부는 근거법령 바로가기로 확인하세요.
        </footer>
      </section>
    </div>,
    document.body,
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

      {result.bases.map(({ basis, hasExplicitArticle, sources, unresolved }, index) => (
        <div
          key={`${basis.law}:${basis.article}:${index}`}
          style={{
            padding: "11px 0",
            borderTop: "1px solid #dde5df",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 10,
              marginBottom: 3,
            }}
          >
            <strong style={{ fontSize: 13, color: "#111714", lineHeight: 1.4 }}>
              {basis.law}
            </strong>
            {hasExplicitArticle && result.state === "article-verified" && (
              <span
                style={{
                  flexShrink: 0,
                  color: "#087452",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                조문 번호 확인
              </span>
            )}
          </div>
          <div
            style={{
              color: "#5d6b63",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {basis.article}
          </div>
          {basis.text && (
            <p style={{ margin: "5px 0 0", color: "#5d6b63", fontSize: 12, lineHeight: 1.55 }}>
              {basis.text}
            </p>
          )}

          {sources.map((source) => (
            <a
              key={source.officialUrl}
              href={source.officialUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginTop: 7,
                marginRight: 10,
                color: "#315a78",
                fontSize: 11,
                fontWeight: 650,
                textDecoration: "none",
              }}
            >
              공식 원문
              {source.effectiveOn ? ` · 시행 ${source.effectiveOn}` : ""}
              <span aria-hidden="true">↗</span>
            </a>
          ))}

          {unresolved.map((item) => (
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

          {verification && sources.length === 0 && unresolved.length === 0 && (
            <div style={{ marginTop: 7, color: "#87938d", fontSize: 11 }}>
              기관 단위 검증 결과에 포함 · 개별 출처명 직접 매칭 필요
            </div>
          )}
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
