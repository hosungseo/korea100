"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { LawMapIndexEntry } from "@/lib/law-map-types";
import styles from "./LawMapCatalog.module.css";

export default function LawMapCatalog({ laws }: { laws: LawMapIndexEntry[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.replace(/\s+/g, "");
    if (!q) return laws;
    return laws.filter((law) => `${law.name}${law.ministry ?? ""}${law.names.join("")}`.replace(/\s+/g, "").includes(q));
  }, [laws, query]);

  return (
    <section className={styles.catalog}>
      <div className={styles.searchBox}>
        <label htmlFor="law-map-search">검색</label>
        <input
          id="law-map-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="법령명·소관부처 (예: 건축법, 국토교통부)"
        />
        <span>{filtered.length} / {laws.length}</span>
      </div>
      <ul className={styles.grid}>
        {filtered.map((law) => (
          <li key={law.lawId}>
            <Link href={`/law/${law.lawId}/`} className={styles.card}>
              <strong>{law.name}</strong>
              <span>{law.ministry ?? "소관부처 미확인"}</span>
              <dl>
                <div><dt>조문</dt><dd>{law.articleCount}</dd></div>
                <div><dt>위임선</dt><dd>{law.edgeCount}</dd></div>
                <div><dt>제도</dt><dd>{law.institutionCount}</dd></div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
