"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { InstitutionSummary } from "@/lib/types";
import styles from "./RegistryCatalog.module.css";

interface CompareTrayProps {
  selected: InstitutionSummary[];
  onRemove: (slug: string) => void;
}

export default function CompareTray({ selected, onRemove }: CompareTrayProps) {
  const [open, setOpen] = useState(false);
  const canCompare = selected.length >= 2;

  if (selected.length === 0) return null;

  return (
    <>
      <aside className={styles.compareTray} aria-label="비교 선반">
        <strong>비교 선반</strong>
        <div className={styles.compareChips}>
          {selected.map((institution) => (
            <span key={institution.slug}>
              {institution.name}
              <button
                type="button"
                onClick={() => {
                  if (selected.length <= 2) setOpen(false);
                  onRemove(institution.slug);
                }}
                aria-label={`${institution.name} 비교에서 제외`}
                title="비교에서 제외"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <p>
          {canCompare
            ? `${selected.length}/3 선택됨`
            : "2개 이상 선택하면 비교할 수 있습니다"}
        </p>
        <button
          type="button"
          className={styles.compareOpenButton}
          disabled={!canCompare}
          onClick={() => setOpen(true)}
        >
          같은 기준으로 비교 <span aria-hidden="true">→</span>
        </button>
      </aside>

      {open && canCompare && (
        <CompareDialog selected={selected} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function CompareDialog({
  selected,
  onClose,
}: {
  selected: InstitutionSummary[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const rows: Array<{
    label: string;
    render: (institution: InstitutionSummary) => React.ReactNode;
  }> = [
    { label: "분야 · 유형", render: (item) => `${item.category} · ${item.type}` },
    { label: "절차 노드", render: (item) => item.processNodeCount },
    { label: "행위자 레인", render: (item) => item.processLaneCount },
    { label: "판단 게이트", render: (item) => item.processGatewayCount },
    {
      label: "조문 검증",
      render: (item) =>
        item.articleReferences
          ? `${item.verifiedReferences}/${item.articleReferences}건 확인`
          : item.sourceCount
            ? `공식 원문 ${item.sourceCount}건`
            : "검증 준비 중",
    },
    { label: "핵심 병목", render: (item) => `${item.bottleneckCount}개` },
    { label: "법령 · 규정", render: (item) => item.laws.join(" · ") },
  ];

  return (
    <div className={styles.compareBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.compareDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>같은 기준으로 비교</span>
            <h2 id="compare-title">선택한 {selected.length}개 제도의 구조 지표</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="비교 닫기">
            ×
          </button>
        </header>

        <div className={styles.compareTableScroll}>
          <table>
            <thead>
              <tr>
                <th scope="col">비교 기준</th>
                {selected.map((institution) => (
                  <th scope="col" key={institution.slug}>
                    <span>{institution.priority.toString().padStart(2, "0")}</span>
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
                  {selected.map((institution) => (
                    <td key={institution.slug}>{row.render(institution)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
