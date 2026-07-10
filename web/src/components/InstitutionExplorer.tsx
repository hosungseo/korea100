"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { Institution } from "@/lib/types";

interface Props {
  institutions: Institution[];
  categoryOrder: string[];
}

const PAGE_SIZE = 12;

const categoryColors: Record<string, string> = {
  "국토·환경·안전": "#0f9f72",
  "재정과 예산": "#315a78",
  "민원·권리구제·참여": "#8a5a2b",
  "국가 운영과 권력 통제": "#4b5563",
  "복지와 사회보험": "#b54b7b",
  "데이터·디지털·공공서비스": "#2563eb",
  "지방자치와 지역": "#7c3aed",
  "노동·교육·인적자원": "#b45309",
  "인허가·규제·산업": "#0f766e",
  "외교·국방·치안·생활 기반": "#be123c",
};

export default function InstitutionExplorer({ institutions, categoryOrder }: Props) {
  const [activeCategory, setActiveCategory] = useState("전체");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"priority" | "name">("priority");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    institutions.forEach((institution) => {
      if (!institution.category) return;
      counts.set(institution.category, (counts.get(institution.category) ?? 0) + 1);
    });
    return counts;
  }, [institutions]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = institutions.filter((institution) => {
      const matchesCategory =
        activeCategory === "전체" || institution.category === activeCategory;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        institution.name.toLowerCase().includes(normalizedQuery) ||
        institution.oneLiner.toLowerCase().includes(normalizedQuery) ||
        institution.canvas.legalBasis.some((basis) =>
          basis.law.toLowerCase().includes(normalizedQuery)
        );

      return matchesCategory && matchesQuery;
    });

    return result.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "ko")
        : a.priority - b.priority
    );
  }, [institutions, activeCategory, query, sort]);

  const visibleInstitutions = filtered.slice(0, visibleCount);
  const hasFilters = activeCategory !== "전체" || query.trim().length > 0;
  const processCount = institutions.filter(
    (institution) => institution.process?.nodes.length
  ).length;

  function selectCategory(category: string) {
    setActiveCategory(category);
    setVisibleCount(PAGE_SIZE);
  }

  function updateQuery(value: string) {
    setQuery(value);
    setVisibleCount(PAGE_SIZE);
  }

  function updateSort(value: "priority" | "name") {
    setSort(value);
    setVisibleCount(PAGE_SIZE);
  }

  function resetFilters() {
    setActiveCategory("전체");
    setQuery("");
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <section id="institutions" className="institution-explorer">
      <div className="institution-explorer-inner">
        <header className="explorer-heading">
          <div>
            <p>제도 카탈로그</p>
            <h2>필요한 제도를 바로 찾아보세요</h2>
          </div>
          <span>
            제도 {institutions.length}개 · 업무구조도 {processCount}개
          </span>
        </header>

        <div className="explorer-controls">
          <div className="explorer-search-row">
            <div className="explorer-search">
              <label className="sr-only" htmlFor="institution-search">
                제도 검색
              </label>
              <input
                id="institution-search"
                type="search"
                aria-label="제도 검색"
                placeholder="제도명·설명·법령명 검색"
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => updateQuery("")}
                  aria-label="검색어 지우기"
                  title="검색어 지우기"
                >
                  ×
                </button>
              )}
            </div>

            <div className="explorer-sort" role="group" aria-label="정렬 방식">
              <button
                type="button"
                aria-pressed={sort === "priority"}
                onClick={() => updateSort("priority")}
              >
                우선순위
              </button>
              <button
                type="button"
                aria-pressed={sort === "name"}
                onClick={() => updateSort("name")}
              >
                가나다
              </button>
            </div>
          </div>

          <div className="category-tabs" role="group" aria-label="제도 분야">
            {["전체", ...categoryOrder].map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={activeCategory === category}
                onClick={() => selectCategory(category)}
              >
                <span>{category}</span>
                <small>
                  {category === "전체"
                    ? institutions.length
                    : (categoryCounts.get(category) ?? 0)}
                </small>
              </button>
            ))}
          </div>
        </div>

        <div className="explorer-result" aria-live="polite">
          <p>
            <strong>{filtered.length}</strong>개 결과
            {visibleInstitutions.length < filtered.length && (
              <span> · {visibleInstitutions.length}개 표시 중</span>
            )}
          </p>
          {hasFilters && (
            <button type="button" onClick={resetFilters}>
              필터 초기화
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="explorer-empty">
            <strong>검색 결과가 없습니다.</strong>
            <p>검색어를 줄이거나 다른 분야를 선택해 보세요.</p>
          </div>
        ) : (
          <div className="institution-grid">
            {visibleInstitutions.map((institution) => (
              <InstitutionCard key={institution.slug} institution={institution} />
            ))}
          </div>
        )}

        {visibleInstitutions.length < filtered.length && (
          <div className="explorer-more">
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            >
              제도 더 보기
              <span>
                {visibleInstitutions.length}/{filtered.length}
              </span>
            </button>
          </div>
        )}

        <div className="explorer-request">
          <p>
            <strong>찾는 제도가 없나요?</strong>
            분석이 필요한 제도를 다음 제작 순서에 반영합니다.
          </p>
          <Link href="/request/">제도 분석 제안</Link>
        </div>
      </div>
    </section>
  );
}

function InstitutionCard({ institution }: { institution: Institution }) {
  const articleVerification = institution.verification?.articleVerification;
  const isReviewNeeded = institution.verification?.status === "needs-review";
  const verificationLabel = articleVerification
    ? `조문 ${articleVerification.verifiedReferences}/${articleVerification.articleReferences}`
    : institution.verification
      ? `원문 ${institution.verification.sources.length}`
      : "검증 준비 중";
  const category = institution.category ?? "기타";
  const categoryColor = categoryColors[category] ?? "#5d6b63";

  return (
    <Link
      href={`/model/${institution.slug}/`}
      className="institution-card"
      style={{ "--category-color": categoryColor } as CSSProperties}
    >
      <div className="institution-card-header">
        <div>
          <span>#{institution.priority.toString().padStart(2, "0")}</span>
          <span>{institution.type}</span>
        </div>
        <span data-review={isReviewNeeded ? "true" : undefined}>
          {verificationLabel}
        </span>
      </div>

      <p className="institution-card-category">
        <i aria-hidden="true" />
        {category}
      </p>

      <h3>{institution.name}</h3>
      <p className="institution-card-description">{institution.oneLiner}</p>

      <div className="institution-card-meta">
        <span>업무 {institution.process?.nodes.length ?? 0}</span>
        <span>법적 근거 {institution.canvas.legalBasis.length}</span>
        <span aria-hidden="true">→</span>
      </div>
    </Link>
  );
}
