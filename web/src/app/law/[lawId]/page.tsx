import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getLawMap, getLawMapClass, getLawMapIds, projectLawMapClassForClient } from "@/lib/law-map-data";
import { EDGE_LABELS, EDGE_ORDER, TIER_LABELS } from "@/components/law-map-constants";
import LawMapBoard from "@/components/LawMapBoard";
import styles from "./page.module.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hosungseo.github.io/korea100";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export async function generateStaticParams() {
  return getLawMapIds().map((lawId) => ({ lawId }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ lawId: string }> }): Promise<Metadata> {
  const { lawId } = await params;
  const map = getLawMap(lawId);
  if (!map) return { title: "법령 지도" };
  const t = map.stats.articlesByTier;
  const description = `${map.name}의 법률·시행령·시행규칙 조문 ${t.statute + t.decree + t.rule}개와 위임 관계 ${map.edges.length}건을 클릭해 따라가는 지도`;
  return {
    title: `${map.name} 법령 지도`,
    description,
    alternates: { canonical: `${SITE_URL}/law/${lawId}/` },
    openGraph: { title: `${map.name} 법령 지도 — 대한민국 제도 지도`, description, type: "article", url: `${SITE_URL}/law/${lawId}/` },
  };
}

export default async function LawMapPage({ params }: { params: Promise<{ lawId: string }> }) {
  const { lawId } = await params;
  const map = getLawMap(lawId);
  if (!map) notFound();
  const t = map.stats.articlesByTier;
  // 클라이언트에는 법률 조문의 분류만(필드도 최소로) 보낸다. 전체 파일은 감사 시트 쪽에서 쓴다.
  const classMap = projectLawMapClassForClient(getLawMapClass(lawId), map);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <nav className={styles.crumbs} aria-label="위치">
          <Link href="/law/">법령 지도</Link>
          <span aria-hidden>›</span>
          <span>{map.name}</span>
        </nav>
        <h1>{map.name}</h1>
        <p className={styles.meta}>
          {map.ministry ?? "소관부처 미확인"} · 시행 {map.effectiveOn ?? "—"} · 법제처 조회 {map.generatedAt} ·{" "}
          <a href={map.lanes[0].officialUrl} target="_blank" rel="noreferrer">법제처 원문 ↗</a>
        </p>
        <dl className={styles.stats}>
          <div><dt>{TIER_LABELS.statute} 조문</dt><dd>{t.statute}</dd></div>
          <div><dt>{TIER_LABELS.decree} 조문</dt><dd>{t.decree}</dd></div>
          <div><dt>{TIER_LABELS.rule} 조문</dt><dd>{t.rule}</dd></div>
          {EDGE_ORDER.map((kind) => (
            <div key={kind}><dt>{EDGE_LABELS[kind]}</dt><dd>{map.stats.edgesByKind[kind]}</dd></div>
          ))}
          <div><dt>연결 제도</dt><dd>{map.institutions.length}</dd></div>
          <div><dt>미해결 위임</dt><dd>{map.stats.unresolved}</dd></div>
        </dl>
      </header>
      <LawMapBoard map={map} classMap={classMap} textUrl={`${BASE_PATH}/law-map/${lawId}.text.json`} />
    </main>
  );
}
