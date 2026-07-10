import Link from "next/link";
import { getAllInstitutions, getInstitution, getCategoryOrder } from "@/lib/data";
import type { Institution } from "@/lib/types";
import ProcessBoard from "@/components/ProcessBoard";
import InstitutionExplorer from "@/components/InstitutionExplorer";

export default function HomePage() {
  const institutions = getAllInstitutions();
  const categoryOrder = getCategoryOrder();
  const eia = getInstitution("environmental-impact-assessment");

  return (
    <>
      <Hero />
      {eia?.process && (
        <ProcessPreview process={eia.process} verification={eia.verification} />
      )}
      <InstitutionExplorer institutions={institutions} categoryOrder={categoryOrder} />
    </>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section
      style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        padding: "72px 24px 64px",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Eyebrow */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            background: "var(--color-accent-soft)",
            borderRadius: 9999,
            marginBottom: 28,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--color-accent)",
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--color-accent-dark)",
            }}
          >
            제도 모델 참고자료
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: "clamp(32px, 6vw, 64px)",
            fontWeight: 720,
            lineHeight: 0.98,
            letterSpacing: "-0.01em",
            color: "var(--color-ink)",
            marginBottom: 28,
          }}
        >
          한 장으로 끝내는
          <br />
          대한민국 제도 100
        </h1>

        {/* Tagline */}
        <p
          style={{
            fontSize: "clamp(16px, 2vw, 20px)",
            fontWeight: 500,
            color: "var(--color-accent-dark)",
            marginBottom: 20,
            letterSpacing: "-0.005em",
          }}
        >
          기업에는 비즈니스 모델이 있듯이, 국가에는 제도 모델이 있다.
        </p>

        {/* Description */}
        <p
          style={{
            fontSize: 16,
            color: "var(--color-muted)",
            lineHeight: 1.75,
            maxWidth: 640,
            marginBottom: 36,
          }}
        >
          대한민국 주요 제도를 법령·조직·절차·예산·문서를 한 장 구조도로 정리합니다.
          누가 결정하고, 누가 집행하며, 어떤 서류와 예산이 오가는지,
          어디서 막히는지를 한눈에 파악할 수 있습니다.
          공무원·보좌진·연구자·기자·정책학생 모두를 위한 참고 자료입니다.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link
            href="#institutions"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 22px",
              background: "var(--color-ink)",
              color: "#fff",
              borderRadius: 9999,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
              transition: "background 140ms ease-out",
            }}
          >
            제도 목록 보기
          </Link>
          <Link
            href="/request/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 22px",
              background: "transparent",
              color: "var(--color-ink)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: 9999,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
              transition: "border-color 140ms ease-out, background 140ms ease-out",
            }}
          >
            다음 제도 요청하기
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Process Preview ───────────────────────────────────────────────────────────

function ProcessPreview({
  process,
  verification,
}: {
  process: NonNullable<Institution["process"]>;
  verification?: Institution["verification"];
}) {
  return (
    <section
      style={{
        background: "var(--color-surface-tint)",
        borderBottom: "1px solid var(--color-border)",
        padding: "48px 24px",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Section header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 28,
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--color-accent-dark)",
                marginBottom: 6,
              }}
            >
              법령상 업무구조도 미리보기
            </div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 680,
                color: "var(--color-ink)",
                margin: 0,
              }}
            >
              환경영향평가 — 대표 절차와 병목
            </h2>
          </div>
          <Link
            href="/model/environmental-impact-assessment/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-accent-dark)",
              textDecoration: "none",
              padding: "8px 16px",
              border: "1px solid var(--color-accent)",
              borderRadius: 6,
              background: "var(--color-surface)",
              transition: "background 140ms ease-out",
              whiteSpace: "nowrap",
            }}
          >
            전체 보기 →
          </Link>
        </div>

        {/* Compact board */}
        <div
          style={{
            background: "var(--color-surface)",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            padding: "20px 24px",
            boxShadow: "0 8px 24px rgba(16,33,24,.04)",
          }}
        >
          <ProcessBoard process={process} verification={verification} compact={true} />
        </div>
      </div>
    </section>
  );
}
