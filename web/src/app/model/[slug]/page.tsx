import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getAllSlugs, getInstitution } from "@/lib/data";
import type { Institution } from "@/lib/types";
import ProcessBoard from "@/components/ProcessBoard";

// ── Static export params ──────────────────────────────────────────────────────

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const institution = getInstitution(slug);
  if (!institution) return { title: "제도 100" };
  return {
    title: `${institution.name} — 한 장으로 끝내는 대한민국 제도 100`,
    description: institution.oneLiner,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ModelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const institution = getInstitution(slug);
  if (!institution) notFound();

  return (
    <div style={{ background: "var(--color-canvas)" }}>
      <InstitutionHeader institution={institution} />
      <InstitutionCenter institution={institution} />
      <InstitutionBottom institution={institution} />
    </div>
  );
}

// ── Header Band ───────────────────────────────────────────────────────────────

function InstitutionHeader({ institution }: { institution: Institution }) {
  return (
    <section
      style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        padding: "48px 24px 36px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Breadcrumb */}
        <div
          style={{
            fontSize: 13,
            color: "var(--color-faint)",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/"
            style={{
              color: "var(--color-faint)",
              textDecoration: "none",
            }}
          >
            제도 100
          </Link>
          {institution.category && (
            <>
              <span>›</span>
              <Link
                href="/#institutions"
                style={{
                  color: "var(--color-faint)",
                  textDecoration: "none",
                }}
              >
                {institution.category}
              </Link>
            </>
          )}
          <span>›</span>
          <span style={{ color: "var(--color-muted)" }}>{institution.name}</span>
        </div>

        {/* Badges row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <TypeBadge>{institution.type}</TypeBadge>
          <StatusBadge status={institution.status} />
          {institution.verification && (
            <VerificationBadge verification={institution.verification} />
          )}
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: "var(--color-faint)",
              padding: "3px 8px",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
            }}
          >
            법령 기준일: {institution.asOfDate}
          </span>
        </div>

        {/* Title + one-liner */}
        <h1 className="model-page-title">
          {institution.name}
        </h1>
        <p
          style={{
            fontSize: 17,
            color: "var(--color-muted)",
            lineHeight: 1.7,
            maxWidth: 720,
            marginBottom: 24,
          }}
        >
          {institution.oneLiner}
        </p>

        {/* Legal basis chips */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            overflowX: "auto",
          }}
        >
          {institution.canvas.legalBasis.map((lb, i) => (
            <LegalChip key={i} law={lb.law} articles={lb.articles} kind={lb.kind} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TypeBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        padding: "3px 10px",
        borderRadius: 6,
        background: "var(--color-surface-muted)",
        color: "var(--color-muted)",
        border: "1px solid var(--color-border)",
      }}
    >
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: "full" | "canvas" }) {
  return status === "full" ? (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 6,
        background: "var(--color-accent-soft)",
        color: "var(--color-accent-dark)",
      }}
    >
      업무구조도 포함
    </span>
  ) : (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 6,
        background: "var(--color-surface-muted)",
        color: "var(--color-faint)",
      }}
    >
      구조도 준비 중
    </span>
  );
}

function VerificationBadge({
  verification,
}: {
  verification: NonNullable<Institution["verification"]>;
}) {
  const needsReview = verification.status === "needs-review";
  const article = verification.articleVerification;
  const label = article
    ? verification.status === "article-verified"
      ? `조문 ${article.verifiedReferences}건 확인`
      : article.missingReferences + article.uncheckableReferences === 0
        ? `조문 ${article.verifiedReferences}건 · 범위별 출처`
        : `조문 ${article.verifiedReferences}/${article.articleReferences}건 확인`
    : `원문 ${verification.sources.length}건${needsReview ? " · 범위 확인" : " 연결"}`;

  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 6,
        background: needsReview ? "#fef6e7" : "var(--color-accent-soft)",
        color: needsReview ? "#c78116" : "var(--color-accent-dark)",
      }}
    >
      {label}
    </span>
  );
}

function LegalChip({
  law,
  articles,
  kind,
}: {
  law: string;
  articles?: string;
  kind: string;
}) {
  const kindColor: Record<string, { bg: string; text: string }> = {
    법률: { bg: "#eef8f3", text: "#087452" },
    대통령령: { bg: "#f5f7f6", text: "#5d6b63" },
    부령: { bg: "#f5f7f6", text: "#5d6b63" },
    "고시·지침": { bg: "#fef6e7", text: "#c78116" },
    조례: { bg: "#fef6e7", text: "#c78116" },
  };
  const c = kindColor[kind] ?? { bg: "#f5f7f6", text: "#5d6b63" };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        background: c.bg,
        borderRadius: 6,
        border: "1px solid rgba(0,0,0,0.06)",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: c.text,
        }}
      >
        {kind}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#111714" }}>
        {law}
      </span>
      {articles && (
        <span
          style={{
            fontSize: 12,
            color: "#5d6b63",
            fontFamily: "var(--font-mono)",
          }}
        >
          {articles}
        </span>
      )}
    </div>
  );
}

// ── Center — Process Board or Stepper ─────────────────────────────────────────

function InstitutionCenter({ institution }: { institution: Institution }) {
  return (
    <section style={{ padding: "40px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {institution.status === "full" && institution.process ? (
          <FullProcessSection
            process={institution.process}
            verification={institution.verification}
          />
        ) : (
          <CanvasStepperSection institution={institution} />
        )}
      </div>
    </section>
  );
}

function FullProcessSection({
  process,
  verification,
}: {
  process: NonNullable<Institution["process"]>;
  verification?: Institution["verification"];
}) {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 680,
            color: "var(--color-ink)",
            marginBottom: 4,
          }}
        >
          법령상 업무구조도
        </h2>
        <p style={{ fontSize: 14, color: "var(--color-muted)" }}>
          법령상 대표 절차와 노드별 공식 원문 검증 상태를 함께 표시합니다.
        </p>
      </div>
      <div
        style={{
          background: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
          padding: "20px 0 4px",
        }}
      >
        <div
          style={{
            marginBottom: 18,
            padding: "8px 12px",
            background: "#f7f9f8",
            borderLeft: "3px solid var(--color-border-strong)",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--color-muted)",
          }}
        >
          실제 사건의 진행 현황이 아니라, 법령상 절차와 대표적인 병목을 설명하는 참고 모델입니다.
        </div>
        <ProcessBoard process={process} verification={verification} compact={false} />
      </div>

      {/* Warnings */}
      {process.warnings && process.warnings.length > 0 && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            background: "#fef6e7",
            borderRadius: 8,
            fontSize: 13,
            color: "#c78116",
          }}
        >
          <strong>주의:</strong> {process.warnings.join(" / ")}
        </div>
      )}
    </div>
  );
}

function CanvasStepperSection({ institution }: { institution: Institution }) {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 680,
            color: "var(--color-ink)",
            marginBottom: 4,
          }}
        >
          절차 개요
        </h2>
        <p style={{ fontSize: 14, color: "var(--color-muted)" }}>
          대표 흐름 단계입니다. 상태 인식형 업무구조도는 추후 추가됩니다.
        </p>
      </div>
      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: 18,
          border: "1px solid var(--color-border)",
          padding: "28px 24px",
        }}
      >
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {institution.canvas.procedure.map((step, i) => {
            const isLast = i === institution.canvas.procedure.length - 1;
            return (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: 16,
                  paddingBottom: isLast ? 0 : 20,
                  position: "relative",
                }}
              >
                {/* Step number + connector */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "var(--color-accent-soft)",
                      border: "1.5px solid var(--color-accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--color-accent-dark)",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  {!isLast && (
                    <div
                      style={{
                        width: 1,
                        flex: 1,
                        background: "var(--color-border)",
                        marginTop: 6,
                        minHeight: 16,
                      }}
                    />
                  )}
                </div>
                {/* Step text */}
                <div
                  style={{
                    fontSize: 15,
                    color: "var(--color-text)",
                    lineHeight: 1.6,
                    paddingTop: 4,
                  }}
                >
                  {step}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ── Bottom 2-col Grid ─────────────────────────────────────────────────────────

function InstitutionBottom({ institution }: { institution: Institution }) {
  const { canvas } = institution;

  return (
    <section
      style={{
        padding: "0 24px 72px",
        borderTop: "1px solid var(--color-border)",
        background: "var(--color-surface-muted)",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", paddingTop: 40 }}>
        {institution.verification && (
          <SourceVerificationPanel verification={institution.verification} />
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 16,
          }}
        >
          {/* Purpose */}
          <CanvasPanel title="제도의 목적">
            <p style={bodyStyle}>{canvas.purpose}</p>
          </CanvasPanel>

          {/* Stakeholders */}
          <CanvasPanel title="이해관계자">
            <p style={bodyStyle}>{canvas.stakeholders}</p>
          </CanvasPanel>

          {/* Authorities */}
          <CanvasPanel title="권한 구조">
            <ul style={{ ...listStyle }}>
              {canvas.authorities.map((a, i) => (
                <li key={i} style={listItemStyle}>
                  <strong style={{ color: "var(--color-ink)", fontWeight: 600 }}>
                    {a.name}
                  </strong>
                  <br />
                  <span style={{ fontSize: 13, color: "var(--color-muted)" }}>
                    {a.role}
                  </span>
                </li>
              ))}
            </ul>
          </CanvasPanel>

          {/* Money flow */}
          <CanvasPanel title="돈의 흐름">
            <p style={bodyStyle}>{canvas.moneyFlow}</p>
          </CanvasPanel>

          {/* Docs flow */}
          <CanvasPanel title="문서·데이터 흐름">
            <p style={bodyStyle}>{canvas.docsFlow}</p>
          </CanvasPanel>

          {/* Bottlenecks */}
          <CanvasPanel title="병목과 쟁점" accent="warning">
            <ul style={{ ...listStyle, paddingLeft: 0 }}>
              {canvas.bottlenecks.map((b, i) => (
                <li
                  key={i}
                  style={{
                    ...listItemStyle,
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      color: "var(--color-warning)",
                      marginTop: 2,
                    }}
                  >
                    ▲
                  </span>
                  <span style={{ fontSize: 14, color: "var(--color-text)" }}>
                    {b}
                  </span>
                </li>
              ))}
            </ul>
          </CanvasPanel>

          {/* Reform points */}
          <CanvasPanel title="개혁 포인트">
            <ul style={{ ...listStyle, paddingLeft: 0 }}>
              {canvas.reformPoints.map((r, i) => (
                <li
                  key={i}
                  style={{
                    ...listItemStyle,
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      color: "var(--color-accent)",
                      marginTop: 2,
                    }}
                  >
                    ▸
                  </span>
                  <span style={{ fontSize: 14, color: "var(--color-text)" }}>
                    {r}
                  </span>
                </li>
              ))}
            </ul>
          </CanvasPanel>

          {/* Related */}
          {institution.related.length > 0 && (
            <CanvasPanel title="관련 제도">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {institution.related.map((rel, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 13,
                      padding: "4px 10px",
                      background: "var(--color-surface-muted)",
                      color: "var(--color-muted)",
                      borderRadius: 9999,
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {rel}
                  </span>
                ))}
              </div>
            </CanvasPanel>
          )}

          {/* Field verification */}
          {institution.fieldVerification.length > 0 && (
            <CanvasPanel title="현장 검증 필요" accent="warning">
              <ul style={{ ...listStyle, paddingLeft: 0 }}>
                {institution.fieldVerification.map((fv, i) => (
                  <li
                    key={i}
                    style={{
                      ...listItemStyle,
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        color: "var(--color-warning)",
                        marginTop: 2,
                      }}
                    >
                      ⚠
                    </span>
                    <span style={{ fontSize: 14, color: "var(--color-text)" }}>
                      {fv}
                    </span>
                  </li>
                ))}
              </ul>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--color-faint)",
                  marginTop: 12,
                  fontStyle: "italic",
                }}
              >
                법령상 구조와 실제 운영 사이의 차이를 확인이 필요한 항목입니다.
              </p>
            </CanvasPanel>
          )}
        </div>

        {/* As-of date notice */}
        <div
          style={{
            marginTop: 40,
            padding: "16px 20px",
            background: "var(--color-surface)",
            borderRadius: 10,
            border: "1px solid var(--color-border)",
            fontSize: 13,
            color: "var(--color-muted)",
          }}
        >
          <strong style={{ color: "var(--color-ink)" }}>법령 기준일:</strong>{" "}
          {institution.asOfDate} · 이 페이지는 법률 자문이 아닌 참고자료입니다.
          오류·제보:{" "}
          <a
            href="mailto:ghtjd10855@gmail.com"
            style={{ color: "var(--color-accent-dark)" }}
          >
            ghtjd10855@gmail.com
          </a>
        </div>
      </div>
    </section>
  );
}

function SourceVerificationPanel({
  verification,
}: {
  verification: NonNullable<Institution["verification"]>;
}) {
  const article = verification.articleVerification;
  const hasArticleIssues = Boolean(
    article && article.missingReferences + article.uncheckableReferences > 0,
  );
  const needsReview = verification.status === "needs-review";
  const statusLabel =
    verification.status === "article-verified"
      ? "조문 번호 확인 완료"
      : verification.status === "source-linked"
        ? "공식 원문 연결 완료"
        : hasArticleIssues
          ? "조문 재검수 필요"
          : "조문 확인 · 범위별 출처 필요";
  const reasonLabels: Record<string, string> = {
    "local-scope": "지역 지정 필요",
    "institution-scope": "적용 범위 지정 필요",
    "internal-rule": "내부규정",
    "external-official-document": "부처 문서",
    "title-needs-confirmation": "공식 제명 확인 필요",
  };

  return (
    <section
      style={{
        marginBottom: 24,
        padding: "20px 0",
        borderTop: "1px solid var(--color-border)",
        borderBottom: "1px solid var(--color-border)",
      }}
      aria-labelledby="source-verification-title"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <h2
            id="source-verification-title"
            style={{ fontSize: 16, fontWeight: 680, color: "var(--color-ink)", margin: 0 }}
          >
            공식 법령 출처
          </h2>
          <p style={{ fontSize: 12, color: "var(--color-faint)", margin: "4px 0 0" }}>
            {verification.method} · {verification.verifiedAt}
          </p>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 650,
            padding: "4px 9px",
            color: needsReview ? "#9a650f" : "var(--color-accent-dark)",
            background: needsReview ? "#fef6e7" : "var(--color-accent-soft)",
            borderRadius: 6,
          }}
        >
          {statusLabel}
        </span>
      </div>
      <p style={{ ...bodyStyle, marginBottom: 14 }}>{verification.scope}</p>
      {article && (
        <p
          style={{
            fontSize: 12,
            color: "var(--color-muted)",
            lineHeight: 1.6,
            margin: "0 0 14px",
          }}
        >
          명시 조문 {article.articleReferences}건 · 확인 {article.verifiedReferences}건 · 불일치{" "}
          {article.missingReferences}건 · 자동 검증 불가 {article.uncheckableReferences}건
        </p>
      )}
      {verification.notes && verification.notes.length > 0 && (
        <ul style={{ ...listStyle, marginBottom: 14, paddingLeft: 18 }}>
          {verification.notes.map((note) => (
            <li key={note} style={{ ...listItemStyle, color: "var(--color-warning)" }}>
              {note}
            </li>
          ))}
        </ul>
      )}
      {verification.unresolved && verification.unresolved.length > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 12px",
            background: "#fef6e7",
            borderLeft: "3px solid var(--color-warning)",
          }}
        >
          <strong style={{ display: "block", fontSize: 12, color: "#9a650f", marginBottom: 6 }}>
            범위·원문 지정 {verification.unresolved.length}건
          </strong>
          <ul style={{ ...listStyle, margin: 0, paddingLeft: 18 }}>
            {verification.unresolved.map((item) => (
              <li key={`${item.kind}:${item.law}`} style={{ ...listItemStyle, fontSize: 12 }}>
                <strong>{reasonLabels[item.reasonCode] ?? item.reasonCode}</strong> · {item.law} ·{" "}
                {item.reason}
                <span style={{ display: "block", color: "var(--color-muted)" }}>
                  다음 확인: {item.nextStep}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        {verification.sources.map((source) => (
          <a
            key={`${source.sourceType ?? "statute"}:${source.law}`}
            href={source.officialUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              padding: "10px 0",
              borderTop: "1px solid var(--color-border)",
              color: "var(--color-ink)",
              textDecoration: "none",
            }}
          >
            <strong style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{source.law}</strong>
            <span style={{ display: "block", fontSize: 11, color: "var(--color-faint)", lineHeight: 1.5 }}>
              {source.kind}
              {source.effectiveOn ? ` · 시행 ${source.effectiveOn}` : ""}
              {!source.effectiveOn && source.promulgatedOn ? ` · 공포 ${source.promulgatedOn}` : ""}
              <br />
              {(source.sourceType ?? "statute") === "statute" && (
                <>법령 ID {source.lawId} · MST {source.mst}</>
              )}
              {source.sourceType === "admin-rule" && (
                <>행정규칙 ID {source.adminRuleId} · 일련번호 {source.adminRuleSerial}</>
              )}
              {source.sourceType === "treaty" && (
                <>조약번호 {source.treatyNumber} · ID {source.treatyId}</>
              )}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

// Shared panel styles
function CanvasPanel({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: "warning";
  children: React.ReactNode;
}) {
  const accentColor =
    accent === "warning" ? "var(--color-warning)" : "var(--color-border-strong)";

  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: 12,
        border: "1px solid var(--color-border)",
        padding: "20px",
        borderTop: `3px solid ${accentColor}`,
      }}
    >
      <h3
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: accent === "warning" ? "var(--color-warning)" : "var(--color-faint)",
          marginBottom: 14,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

const bodyStyle: React.CSSProperties = {
  fontSize: 14,
  color: "var(--color-text)",
  lineHeight: 1.75,
  margin: 0,
};

const listStyle: React.CSSProperties = {
  padding: 0,
  margin: 0,
  listStyle: "none",
};

const listItemStyle: React.CSSProperties = {
  paddingBottom: 10,
  marginBottom: 10,
  borderBottom: "1px solid var(--color-border)",
  lineHeight: 1.55,
};
