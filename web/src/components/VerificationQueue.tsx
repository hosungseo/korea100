"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FieldVerificationEntry } from "@/lib/types";
import { trackEvent } from "@/lib/client-events";

const PAGE_SIZE = 30;

export default function VerificationQueue({
  entries,
}: {
  entries: FieldVerificationEntry[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체 분야");
  const [domain, setDomain] = useState("전체 영역");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const categories = useMemo(
    () => [...new Set(entries.map((entry) => entry.category))],
    [entries]
  );
  const domains = useMemo(
    () => [...new Set(entries.map((entry) => entry.domain))],
    [entries]
  );
  const filtered = useMemo(() => {
    const token = query.trim().toLocaleLowerCase("ko");
    return entries.filter(
      (entry) =>
        (category === "전체 분야" || entry.category === category) &&
        (domain === "전체 영역" || entry.domain === domain) &&
        (!token ||
          `${entry.institutionName} ${entry.item} ${entry.suggestedEvidence}`
            .toLocaleLowerCase("ko")
            .includes(token))
    );
  }, [category, domain, entries, query]);
  const visible = filtered.slice(0, visibleCount);

  function resetCount() {
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <section className="verification-queue" aria-label="현장 검증 항목">
      <div className="verification-queue-controls">
        <label>
          <span className="sr-only">현장 검증 검색</span>
          <input
            type="search"
            placeholder="제도명·검증 항목 검색"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              resetCount();
            }}
          />
        </label>
        <label>
          <span className="sr-only">제도 분야</span>
          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              resetCount();
              trackEvent("verification_filter", {
                filter: "category",
                value: event.target.value,
              });
            }}
          >
            <option>전체 분야</option>
            {categories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">검증 영역</span>
          <select
            value={domain}
            onChange={(event) => {
              setDomain(event.target.value);
              resetCount();
              trackEvent("verification_filter", {
                filter: "domain",
                value: event.target.value,
              });
            }}
          >
            <option>전체 영역</option>
            {domains.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="verification-queue-result" aria-live="polite">
        <span>
          <strong>{filtered.length}</strong>개 항목 · {visible.length}개 표시 중
        </span>
        {(query || category !== "전체 분야" || domain !== "전체 영역") && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setCategory("전체 분야");
              setDomain("전체 영역");
              resetCount();
            }}
          >
            필터 초기화
          </button>
        )}
      </div>

      <div className="verification-entry-list">
        {visible.map((entry) => (
          <article key={entry.id} className="verification-entry">
            <header>
              <span>{entry.id}</span>
              <span>{entry.domain}</span>
              <span>검증 대기</span>
            </header>
            <h2>
              <Link href={`/model/${entry.slug}/`}>{entry.institutionName}</Link>
            </h2>
            <p>{entry.item}</p>
            <footer>
              <span>권장 근거: {entry.suggestedEvidence}</span>
              <a
                href={buildVerificationIssueUrl(entry)}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  trackEvent("verification_report_open", {
                    id: entry.id,
                    slug: entry.slug,
                  })
                }
              >
                공개 근거 제보
              </a>
            </footer>
          </article>
        ))}
      </div>

      {visible.length < filtered.length && (
        <div className="verification-more">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            검증 항목 더 보기 · {visible.length}/{filtered.length}
          </button>
        </div>
      )}
    </section>
  );
}

function buildVerificationIssueUrl(entry: FieldVerificationEntry) {
  const title = encodeURIComponent(`[현장 검증] ${entry.institutionName} · ${entry.id}`);
  const body = encodeURIComponent(
    [
      `## 검증 항목\n${entry.item}`,
      `## 제안하는 근거\n공식 문서 URL 또는 공개된 확인 근거를 적어주세요.`,
      `## 확인 범위\n기관·지역·업무 역할과 확인일을 적어주세요.`,
      `\n> 개인정보나 비공개 내부자료는 포함하지 마세요.`,
    ].join("\n\n")
  );
  return `https://github.com/hosungseo/korea100/issues/new?title=${title}&body=${body}&labels=field-verification`;
}
