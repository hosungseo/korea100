"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InstitutionSummary } from "@/lib/types";
import styles from "./InstitutionDetail.module.css";

export default function InstitutionSwitcher({
  currentSlug,
  institutions,
}: {
  currentSlug: string;
  institutions: InstitutionSummary[];
}) {
  const router = useRouter();
  const currentIndex = Math.max(
    0,
    institutions.findIndex((institution) => institution.slug === currentSlug),
  );
  const previous = institutions[(currentIndex - 1 + institutions.length) % institutions.length];
  const next = institutions[(currentIndex + 1) % institutions.length];

  return (
    <nav className={styles.switcher} aria-label="제도 선택">
      <span>제도 선택</span>
      <select
        value={currentSlug}
        aria-label="제도 선택"
        onChange={(event) => router.push(`/model/${event.target.value}/`)}
      >
        {institutions.map((institution) => (
          <option value={institution.slug} key={institution.slug}>
            {institution.priority.toString().padStart(2, "0")} · {institution.name}
          </option>
        ))}
      </select>
      <div className={styles.switcherCommands}>
        <Link href={`/model/${previous.slug}/`} aria-label={`이전 제도: ${previous.name}`}>
          <span aria-hidden="true">←</span> 이전
        </Link>
        <Link href={`/model/${next.slug}/`} aria-label={`다음 제도: ${next.name}`}>
          다음 <span aria-hidden="true">→</span>
        </Link>
      </div>
      <strong>
        {currentIndex + 1}/{institutions.length}
      </strong>
    </nav>
  );
}
