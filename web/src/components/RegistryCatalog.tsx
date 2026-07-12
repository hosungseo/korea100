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
import type { InstitutionSummary } from "@/lib/types";
import CompareTray from "./CompareTray";
import styles from "./RegistryCatalog.module.css";

interface RegistryCatalogProps {
  institutions: InstitutionSummary[];
  categoryOrder: string[];
}

type SearchIndex = Record<string, string>;

const PAGE_SIZE = 12;
const MAX_COMPARE = 3;
const CATALOG_ASSET_BASE = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data`;

const CATEGORY_COLORS: Record<string, string> = {
  "등록": "#0f9f72",
  "발주": "#7c5c10",
  "공고": "#b45309",
  "입찰": "#315a78",
  "심사·평가": "#5b21b6",
  "계약·이행": "#0f766e",
  "사후관리·제재": "#be123c",
};

export default function RegistryCatalog({
  institutions,
  categoryOrder,
}: RegistryCatalogProps) {
  const searchParams = useSearchParams();
  const institutionBySlug = useMemo(
    () => new Map(institutions.map((institution) => [institution.slug, institution])),
    [institutions],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    institutions.forEach((institution) => {
      counts.set(institution.category, (counts.get(institution.category) ?? 0) + 1);
    });
    return counts;
  }, [institutions]);

  const initialCategory = searchParams.get("category");
  const initialComparison = (searchParams.get("compare") ?? "")
    .split(",")
    .filter((slug) => institutionBySlug.has(slug))
    .slice(0, MAX_COMPARE);

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [activeCategory, setActiveCategory] = useState(() =>
    initialCategory && categoryOrder.includes(initialCategory)
      ? initialCategory
      : "전체",
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedSlugs, setSelectedSlugs] = useState(initialComparison);
  const [searchIndex, setSearchIndex] = useState<SearchIndex | null>(null);
  const searchRequest = useRef<Promise<SearchIndex> | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    updateUrlParam(url, "q", query.trim());
    updateUrlParam(url, "category", activeCategory === "전체" ? "" : activeCategory);
    updateUrlParam(url, "compare", selectedSlugs.join(","));
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [activeCategory, query, selectedSlugs]);

  useEffect(() => {
    if (!query.trim() || searchIndex) return;
    let ignore = false;
    const request =
      searchRequest.current ?? fetchCatalogAsset<SearchIndex>("catalog-search.json");
    searchRequest.current = request;
    request
      .then((index) => {
        if (!ignore) setSearchIndex(index);
      })
      .catch(() => {
        if (!ignore) setSearchIndex({});
        searchRequest.current = null;
      });
    return () => {
      ignore = true;
    };
  }, [query, searchIndex]);

  const filtered = useMemo(() => {
    const tokens = query
      .trim()
      .toLocaleLowerCase("ko")
      .split(/\s+/)
      .filter(Boolean);
    return institutions
      .filter((institution) => {
        const basicText = [
          institution.name,
          institution.oneLiner,
          institution.type,
          institution.category,
          ...institution.laws,
        ]
          .join(" ")
          .toLocaleLowerCase("ko");
        const searchText = searchIndex?.[institution.slug] ?? basicText;
        return (
          (activeCategory === "전체" || institution.category === activeCategory) &&
          tokens.every((token) => searchText.includes(token))
        );
      })
      .sort((left, right) => left.priority - right.priority);
  }, [activeCategory, institutions, query, searchIndex]);

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
  const stats = institutions.reduce(
    (result, institution) => ({
      nodes: result.nodes + institution.processNodeCount,
      articles: result.articles + institution.articleReferences,
      verified:
        result.verified +
        (institution.verificationStatus === "article-verified" ? 1 : 0),
    }),
    { nodes: 0, articles: 0, verified: 0 },
  );

  function resetVisible() {
    setVisibleCount(PAGE_SIZE);
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

  return (
    <section id="institutions" className={styles.registry}>
      <div className={styles.statBand}>
        <div className={styles.searchBox}>
          <label htmlFor="registry-search">검색</label>
          <input
            id="registry-search"
            type="search"
            value={query}
            placeholder="제도"
            onChange={(event) => {
              setQuery(event.target.value);
              resetVisible();
            }}
          />
          {query ? (
            <button
              type="button"
              aria-label="검색어 지우기"
              title="검색어 지우기"
              onClick={() => {
                setQuery("");
                resetVisible();
              }}
            >
              ×
            </button>
          ) : (
            <span>전체 색인 {institutions.length}건</span>
          )}
        </div>
        <div className={styles.stats} aria-label="제도 대장 통계">
          <RegistryStat value={institutions.length} label="제도" />
          <RegistryStat value={stats.nodes} label="절차 노드" />
          <RegistryStat value={stats.articles} label="조문 인용 대조" />
          <RegistryStat value={stats.verified} label="조문 자동대조 완료" accent />
        </div>
      </div>

      <div className={styles.body}>
        <aside className={styles.rail} aria-label="주제별 바로가기">
          <div className={styles.railHeading}>주제별 바로가기</div>
          <div className={styles.railGroups}>
            {["전체", ...categoryOrder].map((category) => {
              const active = activeCategory === category;
              const color =
                category === "전체" ? "#0b1410" : CATEGORY_COLORS[category] ?? "#5d6b63";
              return (
                <button
                  key={category}
                  type="button"
                  className={styles.railItem}
                  aria-pressed={active}
                  style={{ "--category-color": color } as CSSProperties}
                  onClick={() => {
                    setActiveCategory(category);
                    resetVisible();
                    trackEvent("catalog_category", { category });
                  }}
                >
                  <span>
                    <i aria-hidden="true" />
                    {category}
                  </span>
                  <strong>
                    {category === "전체"
                      ? institutions.length
                      : (categoryCounts.get(category) ?? 0)}
                  </strong>
                </button>
              );
            })}
          </div>

        </aside>

        <div className={styles.tablePane}>
          <div className={styles.tableToolbar}>
            <p aria-live="polite">
              <strong>{activeCategory === "전체" ? "제도 대장" : activeCategory}</strong>
              <span> · {filtered.length}개 결과</span>
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className={styles.empty}>
              <strong>검색 결과가 없습니다.</strong>
              <span>검색어를 줄이거나 다른 분야를 선택해 보세요.</span>
            </div>
          ) : (
            <>
              <div className={styles.tableScroll}>
                <table className={styles.registryTable}>
                  <thead>
                    <tr>
                      <th scope="col">NO</th>
                      <th scope="col">제도</th>
                      <th scope="col">유형</th>
                      <th scope="col">조문 대조</th>
                      <th scope="col">비교</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleInstitutions.map((institution) => (
                      <RegistryRow
                        key={institution.slug}
                        institution={institution}
                        selected={selectedSlugs.includes(institution.slug)}
                        disabled={
                          selectedSlugs.length >= MAX_COMPARE &&
                          !selectedSlugs.includes(institution.slug)
                        }
                        onToggle={() => toggleCompare(institution.slug)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.mobileList}>
                {visibleInstitutions.map((institution) => (
                  <MobileRegistryRow
                    key={institution.slug}
                    institution={institution}
                    selected={selectedSlugs.includes(institution.slug)}
                    disabled={
                      selectedSlugs.length >= MAX_COMPARE &&
                      !selectedSlugs.includes(institution.slug)
                    }
                    onToggle={() => toggleCompare(institution.slug)}
                  />
                ))}
              </div>
            </>
          )}

          {visibleInstitutions.length < filtered.length && (
            <button
              type="button"
              className={styles.loadMore}
              onClick={() => {
                setVisibleCount((count) => count + PAGE_SIZE);
                trackEvent("catalog_load_more", {
                  visible_count: Math.min(visibleCount + PAGE_SIZE, filtered.length),
                });
              }}
            >
              제도 더 보기
              <span>{visibleInstitutions.length}/{filtered.length}</span>
            </button>
          )}
        </div>
      </div>

      <CompareTray
        selected={selectedInstitutions}
        onRemove={(slug) => toggleCompare(slug)}
      />
    </section>
  );
}

function RegistryStat({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div data-accent={accent ? "true" : undefined}>
      <strong>{value.toLocaleString("ko-KR")}</strong>
      <span>{label}</span>
    </div>
  );
}

function RegistryRow({
  institution,
  selected,
  disabled,
  onToggle,
}: {
  institution: InstitutionSummary;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const verification = verificationMeta(institution);
  const categoryColor = CATEGORY_COLORS[institution.category] ?? "#5d6b63";

  return (
    <tr style={{ "--category-color": categoryColor } as CSSProperties}>
      <td className={styles.numberCell}>
        {institution.priority.toString().padStart(2, "0")}
      </td>
      <td className={styles.nameCell}>
        <Link
          href={`/model/${institution.slug}/`}
          onClick={() =>
            trackEvent("institution_open", {
              slug: institution.slug,
              source: "registry",
            })
          }
        >
          <strong>{institution.name}</strong>
          <span>{institution.oneLiner}</span>
        </Link>
      </td>
      <td>{institution.type}</td>
      <td>
        <span className={styles.verificationLabel} data-tone={verification.tone}>
          <i aria-hidden="true" />
          {verification.label}
        </span>
      </td>
      <td className={styles.compareCell}>
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          aria-label={`${institution.name} 비교 ${selected ? "제외" : "추가"}`}
          title={disabled ? "최대 3개까지 비교할 수 있습니다" : undefined}
        />
      </td>
    </tr>
  );
}

function MobileRegistryRow({
  institution,
  selected,
  disabled,
  onToggle,
}: {
  institution: InstitutionSummary;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const verification = verificationMeta(institution);
  return (
    <article>
      <span className={styles.mobileNumber}>
        {institution.priority.toString().padStart(2, "0")}
      </span>
      <Link href={`/model/${institution.slug}/`}>
        <span className={styles.mobileTitleLine}>
          <strong>{institution.name}</strong>
          <i data-tone={verification.tone} aria-label={verification.label} />
        </span>
        <span className={styles.mobileDescription}>{institution.oneLiner}</span>
        <span className={styles.mobileMeta}>
          {institution.type} · {verification.label}
        </span>
      </Link>
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
        aria-label={`${institution.name} 비교 ${selected ? "제외" : "추가"}`}
      />
    </article>
  );
}

function verificationMeta(institution: InstitutionSummary) {
  if (institution.verificationStatus === "article-verified") {
    return { label: "자동대조 완료", tone: "verified" };
  }
  if (institution.verificationStatus === "source-linked") {
    return { label: "원문 연결", tone: "linked" };
  }
  return { label: "범위 지정", tone: "review" };
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
