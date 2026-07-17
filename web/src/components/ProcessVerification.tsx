"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import type {
  LegalSource,
  ProcessModel,
  ProcessNode,
  SourceVerification,
} from "@/lib/types";
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
  nested = false,
}: {
  result: NodeVerificationResult;
  inverse?: boolean;
  compact?: boolean;
  nested?: boolean;
}) {
  const visual = STATE_STYLE[result.state];
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const canOpen = result.bases.some(
    ({ articleTexts, sources }) => articleTexts.length > 0 || sources.length > 0,
  );
  const close = useCallback(() => setOpen(false), []);

  function showArticles(event: ReactMouseEvent<HTMLSpanElement>) {
    if (!canOpen) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLSpanElement>) {
    if (!canOpen || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <span
        className={canOpen ? "verification-mark is-interactive" : "verification-mark"}
        data-verification-state={result.state}
        data-article-popover-trigger={canOpen ? "true" : undefined}
        title={canOpen ? `${result.detail} 눌러서 조문 원문을 확인하세요.` : result.detail}
        role={canOpen && !nested ? "button" : undefined}
        tabIndex={canOpen && !nested ? 0 : undefined}
        aria-hidden={nested ? true : undefined}
        aria-haspopup={canOpen && !nested ? "dialog" : undefined}
        aria-expanded={canOpen && !nested ? open : undefined}
        aria-controls={canOpen && !nested && open ? dialogId : undefined}
        aria-label={canOpen && !nested ? `${result.label}: 근거 조문 원문 보기` : undefined}
        onClick={showArticles}
        onKeyDown={nested ? undefined : handleKeyDown}
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
          fontSize: compact ? 8.5 : 11,
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
      {open && createPortal(
        <ArticlePopover id={dialogId} result={result} onClose={close} />,
        document.body,
      )}
    </>
  );
}

function sourceIdentity(source: LegalSource): string | null {
  const type = source.sourceType ?? "statute";
  const id = type === "statute"
    ? source.mst
    : type === "admin-rule"
      ? source.adminRuleSerial
      : source.treatyId;
  return id ? `${type}:${id}` : null;
}

function sourceTypeLabel(source: LegalSource | undefined): string {
  if (source?.sourceType === "admin-rule") return "행정규칙";
  if (source?.sourceType === "treaty") return "조약";
  return "법령";
}

function ArticlePopover({
  id,
  result,
  onClose,
}: {
  id: string;
  result: NodeVerificationResult;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const articleCount = new Set(
    result.bases.flatMap(({ articleTexts }) =>
      articleTexts.map((entry) => `${entry.sourceKey}:${entry.citation}`),
    ),
  ).size;
  const sourceCount = new Set(
    result.bases.flatMap(({ sources }) => sources.map((source) => source.officialUrl)),
  ).size;
  const countLabel = articleCount > 0
    ? `${articleCount}개 조문`
    : `${sourceCount}개 공식 원문`;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (document.activeElement === dialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="article-popover-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        id={id}
        className="article-popover"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-detail`}
      >
        <header className="article-popover-head">
          <div className="article-popover-head-copy">
            <span className="article-popover-kicker">법적 근거 원문</span>
            <strong id={`${id}-title`}>
              <span aria-hidden="true">{STATE_STYLE[result.state].icon}</span>
              {result.label}
            </strong>
          </div>
          <div className="article-popover-head-actions">
            <span className="article-popover-count">{countLabel}</span>
            <button type="button" onClick={onClose} aria-label="조문 원문 닫기" title="닫기">
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </header>

        <div className="article-popover-scroll">
          <div className="article-popover-status">
            <span aria-hidden="true">{STATE_STYLE[result.state].icon}</span>
            <p id={`${id}-detail`} className="article-popover-detail">{result.detail}</p>
          </div>
          <div className="article-popover-list">
            {result.bases.map(({ basis, articleTexts, sources }, basisIndex) => (
              <section className="article-popover-basis" key={`${basis.law}:${basis.article}:${basisIndex}`}>
                {articleTexts.length > 0 ? articleTexts.map((entry, entryIndex) => {
                  const source = sources.find((candidate) => sourceIdentity(candidate) === entry.sourceKey) ?? sources[0];
                  return (
                    <article className="article-popover-article" key={`${entry.sourceKey}:${entry.citation}:${entryIndex}`}>
                      <div className="article-popover-source-heading">
                        <span>{sourceTypeLabel(source)}</span>
                        <h3>{source?.officialName ?? source?.law ?? basis.law}</h3>
                      </div>
                      <div className="article-popover-citation">
                        <strong>{entry.citation}</strong>
                        {entry.title ? <span>{entry.title}</span> : null}
                      </div>
                      <blockquote className="article-popover-source">
                        {entry.text || "조문 제목만 있고 별도 본문이 없습니다."}
                      </blockquote>
                      <dl className="article-popover-dates">
                        <div>
                          <dt>원문 확인</dt>
                          <dd><time dateTime={entry.checkedAt}>{entry.checkedAt}</time></dd>
                        </div>
                        {entry.effectiveOn && (
                          <div>
                            <dt>조문 시행</dt>
                            <dd><time dateTime={entry.effectiveOn}>{entry.effectiveOn}</time></dd>
                          </div>
                        )}
                      </dl>
                      {source && (
                        <a className="article-popover-cta" href={source.officialUrl} target="_blank" rel="noreferrer">
                          국가법령정보센터에서 최신 원문 확인 <span aria-hidden="true">↗</span>
                        </a>
                      )}
                    </article>
                  );
                }) : (
                  <article className="article-popover-article">
                    <h3>{basis.law}</h3>
                    <strong>{basis.article}</strong>
                    <p className="article-popover-nosource">
                      이 인용의 조문 본문 스냅샷은 아직 연결되지 않았습니다. 아래 공식 원문에서 최신 내용을 확인하세요.
                    </p>
                    {sources.map((source) => (
                      <a key={source.officialUrl} className="article-popover-cta" href={source.officialUrl} target="_blank" rel="noreferrer">
                        {source.officialName ?? source.law} 원문 보기 <span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </article>
                )}
              </section>
            ))}
          </div>
        </div>

        <footer className="article-popover-foot">
          <strong>확인 기준</strong>
          <span>표시 문구는 국가법령정보센터 현행 원문을 확인일 기준으로 저장한 사본입니다. 개정 여부와 사건별 적용은 공식 원문에서 다시 확인하세요.</span>
        </footer>
      </section>
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
            <div style={{ marginTop: 7, color: "#5d6b63", fontSize: 11 }}>
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
            color: "#5d6b63",
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
