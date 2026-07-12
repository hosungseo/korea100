"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/client-events";
import type {
  InstitutionSummary,
  InstitutionComparison,
  SourceVerificationStatus,
} from "@/lib/types";

interface Props {
  institutions: InstitutionSummary[];
  categoryOrder: string[];
}

type SortMode = "priority" | "name";
type VerificationFilter = "all" | SourceVerificationStatus;

const PAGE_SIZE = 12;
const MAX_COMPARE = 3;
const CATALOG_ASSET_BASE = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data`;

type SearchIndex = Record<string, string>;
type ComparisonIndex = Record<string, InstitutionComparison>;
type ComparableInstitution = InstitutionSummary & InstitutionComparison;

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
  const searchParams = useSearchParams();

  const types = useMemo(
    () =>
      [...new Set(institutions.map((institution) => institution.type))].sort(
        (a, b) => a.localeCompare(b, "ko")
      ),
    [institutions]
  );

  const institutionBySlug = useMemo(
    () => new Map(institutions.map((institution) => [institution.slug, institution])),
    [institutions]
  );

  const initialComparison = (searchParams.get("compare") ?? "")
    .split(",")
    .filter((slug) => institutionBySlug.has(slug))
    .slice(0, MAX_COMPARE);
  const initialCategory = searchParams.get("category");
  const initialType = searchParams.get("type");
  const initialVerification = searchParams.get("verification");

  const [activeCategory, setActiveCategory] = useState(() =>
    initialCategory && categoryOrder.includes(initialCategory)
      ? initialCategory
      : "전체"
  );
  const [activeType, setActiveType] = useState(() =>
    initialType && types.includes(initialType) ? initialType : "전체 유형"
  );
  const [verificationFilter, setVerificationFilter] =
    useState<VerificationFilter>(() =>
      initialVerification === "article-verified" ||
      initialVerification === "needs-review" ||
      initialVerification === "source-linked"
        ? initialVerification
        : "all"
    );
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [sort, setSort] = useState<SortMode>(() =>
    searchParams.get("sort") === "name" ? "name" : "priority"
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedSlugs, setSelectedSlugs] = useState(initialComparison);
  const [compareOpen, setCompareOpen] = useState(
    searchParams.get("view") === "compare" && initialComparison.length >= 2
  );
  const [searchIndex, setSearchIndex] = useState<SearchIndex | null>(null);
  const [comparisonIndex, setComparisonIndex] =
    useState<ComparisonIndex | null>(null);
  const [comparisonError, setComparisonError] = useState("");
  const searchRequest = useRef<Promise<SearchIndex> | null>(null);
  const comparisonRequest = useRef<Promise<ComparisonIndex> | null>(null);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    institutions.forEach((institution) => {
      counts.set(institution.category, (counts.get(institution.category) ?? 0) + 1);
    });
    return counts;
  }, [institutions]);

  useEffect(() => {
    const url = new URL(window.location.href);

    updateUrlParam(url, "q", query.trim());
    updateUrlParam(
      url,
      "category",
      activeCategory === "전체" ? "" : activeCategory
    );
    updateUrlParam(url, "type", activeType === "전체 유형" ? "" : activeType);
    updateUrlParam(
      url,
      "verification",
      verificationFilter === "all" ? "" : verificationFilter
    );
    updateUrlParam(url, "sort", sort === "priority" ? "" : sort);
    updateUrlParam(url, "compare", selectedSlugs.join(","));
    updateUrlParam(
      url,
      "view",
      compareOpen && selectedSlugs.length >= 2 ? "compare" : ""
    );

    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [
    activeCategory,
    activeType,
    compareOpen,
    query,
    selectedSlugs,
    sort,
    verificationFilter,
  ]);

  useEffect(() => {
    if (!query.trim() || searchIndex) return;
    let ignore = false;
    const request =
      searchRequest.current ??
      fetchCatalogAsset<SearchIndex>("catalog-search.json");
    searchRequest.current = request;
    request
      .then((data) => {
        if (!ignore) setSearchIndex(data);
      })
      .catch(() => {
        if (!ignore) setSearchIndex({});
        searchRequest.current = null;
      });
    return () => {
      ignore = true;
    };
  }, [query, searchIndex]);

  useEffect(() => {
    if (!compareOpen || comparisonIndex || comparisonError) return;
    let ignore = false;
    const request =
      comparisonRequest.current ??
      fetchCatalogAsset<ComparisonIndex>("catalog-compare.json");
    comparisonRequest.current = request;
    request
      .then((data) => {
        if (!ignore) setComparisonIndex(data);
      })
      .catch(() => {
        if (!ignore) {
          setComparisonError("비교 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
        comparisonRequest.current = null;
      });
    return () => {
      ignore = true;
    };
  }, [compareOpen, comparisonError, comparisonIndex]);

  const filtered = useMemo(() => {
    const queryTokens = query
      .trim()
      .toLocaleLowerCase("ko")
      .split(/\s+/)
      .filter(Boolean);
    const result = institutions.filter((institution) => {
      const matchesCategory =
        activeCategory === "전체" || institution.category === activeCategory;
      const matchesType =
        activeType === "전체 유형" || institution.type === activeType;
      const matchesVerification =
        verificationFilter === "all" ||
        institution.verificationStatus === verificationFilter;
      const basicSearchText = [
        institution.name,
        institution.oneLiner,
        institution.type,
        institution.category,
      ]
        .join(" ")
        .toLocaleLowerCase("ko");
      const searchText = searchIndex?.[institution.slug] ?? basicSearchText;
      const matchesQuery = queryTokens.every((token) =>
        searchText.includes(token)
      );

      return (
        matchesCategory && matchesType && matchesVerification && matchesQuery
      );
    });

    return result.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "ko")
        : a.priority - b.priority
    );
  }, [
    institutions,
    activeCategory,
    activeType,
    query,
    searchIndex,
    sort,
    verificationFilter,
  ]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || !searchIndex) return;
    const timer = window.setTimeout(() => {
      trackEvent("catalog_search", {
        query_length: normalizedQuery.length,
        result_count: filtered.length,
        zero_result: filtered.length === 0,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [filtered.length, query, searchIndex]);

  const visibleInstitutions = filtered.slice(0, visibleCount);
  const selectedInstitutions = selectedSlugs
    .map((slug) => institutionBySlug.get(slug))
    .filter((institution): institution is InstitutionSummary => Boolean(institution));
  const selectedComparisons = selectedInstitutions
    .map((institution) => {
      const details = comparisonIndex?.[institution.slug];
      return details ? { ...institution, ...details } : null;
    })
    .filter(
      (institution): institution is ComparableInstitution => Boolean(institution)
    );
  const hasFilters =
    activeCategory !== "전체" ||
    activeType !== "전체 유형" ||
    verificationFilter !== "all" ||
    query.trim().length > 0;
  const processCount = institutions.filter(
    (institution) => institution.processNodeCount > 0
  ).length;

  function resetVisibleCount() {
    setVisibleCount(PAGE_SIZE);
    setCompareOpen(false);
  }

  function resetFilters() {
    setActiveCategory("전체");
    setActiveType("전체 유형");
    setVerificationFilter("all");
    setQuery("");
    setVisibleCount(PAGE_SIZE);
    setCompareOpen(false);
  }

  function toggleCompare(slug: string) {
    setSelectedSlugs((current) => {
      if (current.includes(slug)) {
        trackEvent("comparison_remove", { slug, selected_count: current.length - 1 });
        return current.filter((item) => item !== slug);
      }
      if (current.length >= MAX_COMPARE) return current;
      trackEvent("comparison_add", { slug, selected_count: current.length + 1 });
      return [...current, slug];
    });
  }

  function showComparison() {
    if (selectedSlugs.length < 2) return;
    trackEvent("comparison_open", { selected_count: selectedSlugs.length });
    setCompareOpen(true);
    window.requestAnimationFrame(() => {
      document.getElementById("institution-comparison")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
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
                placeholder="제도·법령·기관·문서·유의사항 검색"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  resetVisibleCount();
                }}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    resetVisibleCount();
                  }}
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
                onClick={() => {
                  setSort("priority");
                  resetVisibleCount();
                  trackEvent("catalog_sort", { sort: "priority" });
                }}
              >
                우선순위
              </button>
              <button
                type="button"
                aria-pressed={sort === "name"}
                onClick={() => {
                  setSort("name");
                  resetVisibleCount();
                  trackEvent("catalog_sort", { sort: "name" });
                }}
              >
                가나다
              </button>
            </div>
          </div>

          <div className="explorer-filter-row">
            <div className="category-tabs" role="group" aria-label="제도 분야">
              {["전체", ...categoryOrder].map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={activeCategory === category}
                  onClick={() => {
                    setActiveCategory(category);
                    resetVisibleCount();
                    trackEvent("catalog_category", { category });
                  }}
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

            <div className="explorer-selects">
              <label>
                <span className="sr-only">제도 유형</span>
                <select
                  aria-label="제도 유형"
                  value={activeType}
                  onChange={(event) => {
                    setActiveType(event.target.value);
                    resetVisibleCount();
                    trackEvent("catalog_type", { type: event.target.value });
                  }}
                >
                  <option>전체 유형</option>
                  {types.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">검증 상태</span>
                <select
                  aria-label="검증 상태"
                  value={verificationFilter}
                  onChange={(event) => {
                    setVerificationFilter(
                      event.target.value as VerificationFilter
                    );
                    resetVisibleCount();
                    trackEvent("catalog_verification", {
                      verification: event.target.value,
                    });
                  }}
                >
                  <option value="all">전체 검증</option>
                  <option value="article-verified">원문 검증 완료</option>
                  <option value="needs-review">범위 확인 필요</option>
                  <option value="source-linked">원문 연결</option>
                </select>
              </label>
            </div>
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

        {compareOpen && selectedInstitutions.length >= 2 &&
          (selectedComparisons.length >= 2 ? (
            <ComparisonPanel
              institutions={selectedComparisons}
              onClose={() => setCompareOpen(false)}
            />
          ) : (
            <div
              id="institution-comparison"
              className="comparison-loading"
              role="status"
            >
              {comparisonError || "비교 데이터를 불러오는 중입니다."}
            </div>
          ))}

        {filtered.length === 0 ? (
          <div className="explorer-empty">
            <strong>검색 결과가 없습니다.</strong>
            <p>검색어를 줄이거나 다른 분야를 선택해 보세요.</p>
          </div>
        ) : (
          <div className="institution-grid">
            {visibleInstitutions.map((institution) => (
              <InstitutionCard
                key={institution.slug}
                institution={institution}
                selected={selectedSlugs.includes(institution.slug)}
                compareDisabled={
                  selectedSlugs.length >= MAX_COMPARE &&
                  !selectedSlugs.includes(institution.slug)
                }
                onToggleCompare={() => toggleCompare(institution.slug)}
              />
            ))}
          </div>
        )}

        {visibleInstitutions.length < filtered.length && (
          <div className="explorer-more">
            <button
              type="button"
              onClick={() => {
                setVisibleCount((count) => count + PAGE_SIZE);
                trackEvent("catalog_load_more", {
                  visible_count: Math.min(
                    visibleInstitutions.length + PAGE_SIZE,
                    filtered.length
                  ),
                });
              }}
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

      {selectedInstitutions.length > 0 && (
        <div className="compare-toolbar" role="region" aria-label="제도 비교">
          <div>
            <strong>{selectedInstitutions.length}/{MAX_COMPARE} 선택</strong>
            <span>
              {selectedInstitutions.map((institution) => institution.name).join(" · ")}
            </span>
          </div>
          <button type="button" onClick={() => setSelectedSlugs([])}>
            선택 해제
          </button>
          <button
            type="button"
            disabled={selectedInstitutions.length < 2}
            onClick={showComparison}
          >
            {compareOpen && !comparisonIndex ? "불러오는 중" : "비교 보기"}
          </button>
        </div>
      )}
    </section>
  );
}

function InstitutionCard({
  institution,
  selected,
  compareDisabled,
  onToggleCompare,
}: {
  institution: InstitutionSummary;
  selected: boolean;
  compareDisabled: boolean;
  onToggleCompare: () => void;
}) {
  const isReviewNeeded = institution.verificationStatus === "needs-review";
  const verificationLabel = institution.articleReferences
    ? `조문 ${institution.verifiedReferences}/${institution.articleReferences}`
    : institution.sourceCount
      ? `원문 ${institution.sourceCount}`
      : "검증 준비 중";
  const categoryColor = categoryColors[institution.category] ?? "#5d6b63";

  return (
    <article
      className="institution-card"
      data-selected={selected ? "true" : undefined}
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

      <Link
        href={`/model/${institution.slug}/`}
        className="institution-card-link"
        onClick={() =>
          trackEvent("institution_open", {
            slug: institution.slug,
            source: "catalog",
          })
        }
      >
        <p className="institution-card-category">
          <i aria-hidden="true" />
          {institution.category}
        </p>
        <h3>{institution.name}</h3>
        <p className="institution-card-description">{institution.oneLiner}</p>
      </Link>

      <div className="institution-card-meta">
        <span>업무 {institution.processNodeCount}</span>
        <span>법적 근거 {institution.legalBasisCount}</span>
        <button
          type="button"
          aria-pressed={selected}
          disabled={compareDisabled}
          onClick={onToggleCompare}
          title={
            compareDisabled
              ? "최대 3개까지 비교할 수 있습니다"
              : selected
                ? "비교에서 제외"
                : "비교에 추가"
          }
        >
          {selected ? "비교됨" : "+ 비교"}
        </button>
      </div>
    </article>
  );
}

function ComparisonPanel({
  institutions,
  onClose,
}: {
  institutions: ComparableInstitution[];
  onClose: () => void;
}) {
  const rows: Array<{
    label: string;
    render: (institution: ComparableInstitution) => React.ReactNode;
  }> = [
    { label: "분야·유형", render: (item) => `${item.category} · ${item.type}` },
    { label: "목적", render: (item) => item.purpose },
    { label: "대상·이해관계자", render: (item) => item.stakeholders },
    { label: "핵심 기관", render: (item) => item.authorityNames.join(" · ") },
    { label: "주요 법령", render: (item) => item.legalBasisNames.join(" · ") },
    {
      label: "업무 구조",
      render: (item) =>
        `${item.processNodeCount}개 업무 · ${item.processStageCount}단계 · ${item.processLaneCount}개 행위자 레인`,
    },
    { label: "적용 대상", render: (item) => item.applicability },
    { label: "제출서류", render: (item) => item.submittedDocuments },
    {
      label: "유의사항",
      render: (item) => item.keyBottlenecks.join(" / "),
    },
  ];

  return (
    <section id="institution-comparison" className="comparison-panel">
      <header>
        <div>
          <p>제도 비교</p>
          <h3>같은 기준으로 구조를 비교합니다</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="비교 닫기">
          ×
        </button>
      </header>
      <div className="comparison-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">비교 기준</th>
              {institutions.map((institution) => (
                <th scope="col" key={institution.slug}>
                  <Link href={`/model/${institution.slug}/`}>
                    {institution.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {institutions.map((institution) => (
                  <td key={institution.slug}>{row.render(institution)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function updateUrlParam(url: URL, key: string, value: string) {
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
}

async function fetchCatalogAsset<T>(file: string): Promise<T> {
  const response = await fetch(`${CATALOG_ASSET_BASE}/${file}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Failed to load ${file}`);
  return (await response.json()) as T;
}
