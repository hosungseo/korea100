"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Institution } from "@/lib/types";

interface Props {
  institutions: Institution[];
  categoryOrder: string[];
}

export default function InstitutionExplorer({ institutions, categoryOrder }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>("전체");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"priority" | "name">("priority");

  const fullCount = institutions.length;
  const boardCount = institutions.filter((i) => i.status === "full").length;

  const filtered = useMemo(() => {
    let result = institutions;

    if (activeCategory !== "전체") {
      result = result.filter((inst) => inst.category === activeCategory);
    }

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter(
        (inst) =>
          inst.name.toLowerCase().includes(q) ||
          inst.oneLiner.toLowerCase().includes(q) ||
          inst.canvas.legalBasis.some((lb) => lb.law.toLowerCase().includes(q))
      );
    }

    if (sort === "name") {
      result = [...result].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
    // priority order is preserved from server (already sorted)

    return result;
  }, [institutions, activeCategory, query, sort]);

  return (
    <section id="institutions" style={{ padding: "64px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Section header */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "var(--color-faint)",
              marginBottom: 8,
            }}
          >
            제도 목록
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                fontSize: 28,
                fontWeight: 680,
                color: "var(--color-ink)",
                margin: 0,
              }}
            >
              공개된 제도 모델
            </h2>
            <span
              style={{
                fontSize: 14,
                color: "var(--color-muted)",
                fontWeight: 500,
              }}
            >
              제도 {fullCount}개 · 업무구조도 {boardCount}개
            </span>
          </div>
        </div>

        {/* Controls */}
        <div
          style={{
            marginBottom: 24,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Search + sort toggle */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              type="search"
              placeholder="이름·설명·법령명 검색..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: "1 1 200px",
                minWidth: 180,
                padding: "8px 16px",
                fontSize: 14,
                border: "1px solid var(--color-border)",
                borderRadius: 9999,
                background: "var(--color-surface)",
                color: "var(--color-ink)",
                outline: "none",
                fontFamily: "var(--font-sans)",
              }}
            />
            <button
              onClick={() =>
                setSort((s) => (s === "priority" ? "name" : "priority"))
              }
              style={{
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                border: "1px solid var(--color-border)",
                borderRadius: 9999,
                background: "var(--color-surface)",
                color: "var(--color-muted)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-sans)",
              }}
            >
              {sort === "priority" ? "우선순위순" : "이름순"}
            </button>
          </div>

          {/* Category filter chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["전체", ...categoryOrder].map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    padding: "5px 14px",
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    border: "1px solid",
                    borderColor: isActive
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                    borderRadius: 9999,
                    background: isActive
                      ? "var(--color-accent-soft)"
                      : "var(--color-surface)",
                    color: isActive
                      ? "var(--color-accent-dark)"
                      : "var(--color-muted)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results count when filtering */}
        {(activeCategory !== "전체" || query.trim()) && (
          <div
            style={{
              marginBottom: 16,
              fontSize: 13,
              color: "var(--color-faint)",
            }}
          >
            {filtered.length}개 표시 중
          </div>
        )}

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div
            style={{
              padding: "64px 24px",
              textAlign: "center",
              color: "var(--color-faint)",
              background: "var(--color-surface)",
              borderRadius: 18,
              border: "1px solid var(--color-border)",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>—</div>
            <p style={{ fontSize: 15, margin: 0 }}>
              검색 결과가 없습니다. 다른 키워드나 분야를 선택해 보세요.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(272px, 1fr))",
              gap: 12,
            }}
          >
            {filtered.map((inst) => (
              <InstitutionCard key={inst.slug} institution={inst} />
            ))}
          </div>
        )}

        {/* Request CTA */}
        <div
          style={{
            marginTop: 48,
            padding: "32px",
            background: "var(--color-surface)",
            borderRadius: 18,
            border: "1px solid var(--color-border)",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 16,
              color: "var(--color-muted)",
              marginBottom: 16,
            }}
          >
            분석이 필요한 제도가 있으신가요? 다음 제작 순서에 반영합니다.
          </p>
          <Link
            href="/request/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 24px",
              background: "var(--color-accent)",
              color: "#fff",
              borderRadius: 9999,
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            제도 제작 요청하기
          </Link>
        </div>
      </div>
    </section>
  );
}

function InstitutionCard({ institution }: { institution: Institution }) {
  const isCanvas = institution.status === "canvas";
  const articleVerification = institution.verification?.articleVerification;
  const verificationLabel = articleVerification
    ? institution.verification?.status === "article-verified"
      ? `조문 ${articleVerification.verifiedReferences}건 확인`
      : articleVerification.missingReferences + articleVerification.uncheckableReferences === 0
        ? `조문 ${articleVerification.verifiedReferences}건 · 범위별 출처`
        : `조문 ${articleVerification.verifiedReferences}/${articleVerification.articleReferences}건 확인`
    : institution.verification
      ? `원문 ${institution.verification.sources.length}건 연결`
      : "";

  return (
    <Link
      href={`/model/${institution.slug}/`}
      className="card-link"
      style={{
        display: "block",
        textDecoration: "none",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: "16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Priority + type + board badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--color-faint)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          #{institution.priority.toString().padStart(2, "0")}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            padding: "2px 7px",
            borderRadius: 4,
            background: "var(--color-surface-muted)",
            color: "var(--color-muted)",
            border: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          {institution.type}
        </span>
        {!isCanvas && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 4,
              background: "var(--color-accent-soft)",
              color: "var(--color-accent-dark)",
              border: "1px solid rgba(15,159,114,0.2)",
              flexShrink: 0,
            }}
          >
            업무구조도
          </span>
        )}
        {institution.verification && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 4,
              background:
                institution.verification.status === "needs-review"
                  ? "#fef6e7"
                  : "var(--color-accent-soft)",
              color:
                institution.verification.status === "needs-review"
                  ? "#c78116"
                  : "var(--color-accent-dark)",
              flexShrink: 0,
            }}
          >
            {verificationLabel}
          </span>
        )}
      </div>

      {/* Name */}
      <h3
        style={{
          fontSize: 15,
          fontWeight: 680,
          color: "var(--color-ink)",
          marginBottom: 6,
          lineHeight: 1.3,
        }}
      >
        {institution.name}
      </h3>

      {/* One-liner — 2-line clamp */}
      <p
        style={
          {
            fontSize: 13,
            color: "var(--color-muted)",
            lineHeight: 1.55,
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          } as React.CSSProperties
        }
      >
        {institution.oneLiner}
      </p>
    </Link>
  );
}
