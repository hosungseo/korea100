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
      <Hero institutions={institutions} />
      <InstitutionExplorer institutions={institutions} categoryOrder={categoryOrder} />
      {eia?.process && (
        <ProcessPreview process={eia.process} verification={eia.verification} />
      )}
    </>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero({ institutions }: { institutions: Institution[] }) {
  const stats = institutions.reduce(
    (summary, institution) => ({
      nodes: summary.nodes + (institution.process?.nodes.length ?? 0),
      verifiedArticles:
        summary.verifiedArticles +
        (institution.verification?.articleVerification?.verifiedReferences ?? 0),
      sources: summary.sources + (institution.verification?.sources.length ?? 0),
    }),
    { nodes: 0, verifiedArticles: 0, sources: 0 }
  );

  return (
    <section className="home-hero">
      <div className="home-hero-inner">
        <div className="home-hero-kicker">
          <span aria-hidden="true" />
          법령 기준 제도 모델
        </div>

        <h1>대한민국 제도 100</h1>
        <p className="home-hero-lead">
          법령부터 실제 업무 흐름까지, 한 장으로 읽는 국가 운영 카탈로그
        </p>
        <p className="home-hero-copy">
          누가 결정하고 집행하는지, 어떤 문서와 예산이 오가는지, 어디에서
          병목이 생기는지를 제도별 구조도로 정리했습니다.
        </p>

        <div className="home-hero-stats" aria-label="제도 100 데이터 현황">
          <div>
            <strong>{institutions.length.toLocaleString("ko-KR")}</strong>
            <span>제도 모델</span>
          </div>
          <div>
            <strong>{stats.nodes.toLocaleString("ko-KR")}</strong>
            <span>업무 노드</span>
          </div>
          <div>
            <strong>{stats.verifiedArticles.toLocaleString("ko-KR")}</strong>
            <span>확인 조문</span>
          </div>
          <div>
            <strong>{stats.sources.toLocaleString("ko-KR")}</strong>
            <span>공식 원문</span>
          </div>
        </div>

        <div className="home-hero-actions">
          <Link href="#institutions">제도 찾기</Link>
          <Link href="/request/">분석할 제도 제안</Link>
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
        background: "#f3f7fa",
        borderBottom: "1px solid var(--color-border)",
        borderTop: "1px solid var(--color-border)",
        padding: "52px 24px",
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
                letterSpacing: 0,
                textTransform: "uppercase",
                color: "var(--color-accent-dark)",
                marginBottom: 6,
              }}
            >
              업무구조도 예시
            </div>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 680,
                color: "var(--color-ink)",
                margin: 0,
              }}
            >
              환경영향평가의 대표 절차와 병목
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
