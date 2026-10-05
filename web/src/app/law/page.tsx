import type { Metadata } from "next";
import { getLawMapIndex } from "@/lib/law-map-data";
import LawMapCatalog from "@/components/LawMapCatalog";
import styles from "./[lawId]/page.module.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hosungseo.github.io/korea100";

export const metadata: Metadata = {
  title: "법령 지도",
  description: "법률·시행령·시행규칙 조문과 위임 관계를 클릭해 따라가는 법령 구조 지도",
  alternates: { canonical: `${SITE_URL}/law/` },
};

export default function LawMapIndexPage() {
  const index = getLawMapIndex();
  const laws = index?.laws ?? [];
  const articles = laws.reduce((sum, law) => sum + law.articleCount, 0);
  const edges = laws.reduce((sum, law) => sum + law.edgeCount, 0);

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <h1>법령 지도</h1>
        <p className={styles.meta}>
          법률 한 건을 법률·시행령·시행규칙·행정규칙·자치법규 층으로 펼치고, 조문 사이 위임선을 클릭해 따라갑니다.
          출처는 국가법령정보센터(법제처)이며 조회일은 각 지도에 적혀 있습니다.
        </p>
        <dl className={styles.stats}>
          <div><dt>법률</dt><dd>{laws.length}</dd></div>
          <div><dt>조문</dt><dd>{articles}</dd></div>
          <div><dt>위임선</dt><dd>{edges}</dd></div>
          <div><dt>생성</dt><dd>{index?.generatedAt ?? "—"}</dd></div>
        </dl>
      </header>
      <LawMapCatalog laws={laws} />
    </main>
  );
}
