import Link from "next/link";
import { Suspense } from "react";
import { buildProcessLaneGroups } from "@/lib/process-layout.mjs";
import { formatProcessWarnings } from "@/lib/process-warnings.mjs";
import type { Institution, InstitutionSummary } from "@/lib/types";
import InstitutionSwitcher from "./InstitutionSwitcher";
import ProcessExplorer from "./ProcessExplorer";
import styles from "./InstitutionDetail.module.css";

export default function InstitutionDetailView({
  institution,
  institutions,
  relatedSlugs,
}: {
  institution: Institution;
  institutions: InstitutionSummary[];
  relatedSlugs: Map<string, string>;
}) {
  const process = institution.process;
  const processWarnings = formatProcessWarnings(process?.warnings);
  const article = institution.verification?.articleVerification;
  const verification = verificationMeta(institution);
  const stats = [
    { value: process?.nodes.length ?? institution.canvas.procedure.length, label: "절차 노드" },
    { value: process?.lanes.length ?? 0, label: "행위 레인" },
    { value: process?.stages.length ?? institution.canvas.procedure.length, label: "게이트" },
    {
      value: article
        ? `${article.verifiedReferences}/${article.articleReferences}`
        : institution.verification?.sources.length ?? 0,
      label: "조문 확인",
      accent: "verified",
    },
    {
      value: institution.canvas.bottlenecks.length,
      label: "병목 구간",
      accent: "warning",
    },
  ];

  return (
    <div className={styles.detail}>
      <InstitutionSwitcher
        currentSlug={institution.slug}
        institutions={institutions}
      />

      <section className={styles.titleBand}>
        <div className={styles.titleTop}>
          <div className={styles.titleCopy}>
            <div className={styles.titleMeta}>
              <span className={styles.priority}>
                NO {institution.priority.toString().padStart(2, "0")}
              </span>
              <span className={styles.category}>{institution.category}</span>
              <span>{institution.type}</span>
              <span className={styles.verificationBadge} data-tone={verification.tone}>
                <i aria-hidden="true" />
                {verification.label}
              </span>
            </div>
            <h1>{institution.name}</h1>
            <p>{institution.oneLiner}</p>
          </div>

          <div className={styles.detailActions}>
            <Link href={`/?compare=${institution.slug}#institutions`}>
              비교 선반에 담기
            </Link>
          </div>
        </div>

        <div className={styles.detailStats} aria-label="제도 구조 통계">
          {stats.map((stat) => (
            <div key={stat.label} data-accent={stat.accent}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="process" className={styles.processSection}>
        <header className={styles.sectionHeading}>
          <div>
            <h2>업무구조도</h2>
            <p>노드 상태는 제도 흐름 설명용 편집 상태입니다</p>
          </div>
          <div className={styles.legend} aria-label="노드 상태 범례">
            <span><i data-tone="done" />완료</span>
            <span><i data-tone="current" />현재</span>
            <span><i data-tone="risk" />위험·회귀</span>
            <span><i data-tone="waiting" />대기</span>
          </div>
        </header>

        <div className={styles.processPanel}>
          {process ? (
            <Suspense fallback={<div className="process-explorer-loading">업무구조도를 불러오는 중입니다.</div>}>
              <ProcessExplorer
                process={process}
                verification={institution.verification}
                slug={institution.slug}
                laneGroups={buildProcessLaneGroups(process.lanes, institution.slug)}
              />
            </Suspense>
          ) : (
            <ol className={styles.procedureFallback}>
              {institution.canvas.procedure.map((step, index) => (
                <li key={step}>
                  <span>{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          )}
        </div>

        {processWarnings.length > 0 && (
          <p className={styles.processWarning}>{processWarnings.join(" / ")}</p>
        )}
      </section>

      <OnePageCanvas
        institution={institution}
        relatedSlugs={relatedSlugs}
      />

      <footer className={styles.disclaimer}>
        <strong>검증:</strong> {institution.verification?.scope ?? "공식 원문 검증 준비 중"}
        <span>
          이 콘텐츠는 제도 이해를 위한 참고 자료이며 법률 자문이나 정부기관의 공식 해석을 대신하지 않습니다.
        </span>
      </footer>
    </div>
  );
}

function OnePageCanvas({
  institution,
  relatedSlugs,
}: {
  institution: Institution;
  relatedSlugs: Map<string, string>;
}) {
  const { canvas, verification } = institution;
  const sourceByLaw = new Map(
    (verification?.sources ?? []).flatMap((source) => [
      [source.law, source],
      [source.officialName ?? source.law, source],
    ]),
  );

  return (
    <section id="institution-one-page" className={styles.canvasSection}>
      <header className={styles.sectionHeading}>
        <div>
          <h2>한 장 캔버스</h2>
          <p>법령 · 조직 · 절차 · 예산 · 문서</p>
        </div>
        <time dateTime={institution.asOfDate}>기준일 {institution.asOfDate}</time>
      </header>

      <div className={styles.canvasGrid}>
        <CanvasBlock title="목적과 법적 근거" size="wide">
          <p>{canvas.purpose}</p>
          <div className={styles.legalRows}>
            {canvas.legalBasis.map((basis) => {
              const source = sourceByLaw.get(basis.law);
              return (
                <div key={`${basis.kind}:${basis.law}`}>
                  {source ? (
                    <a href={source.officialUrl} target="_blank" rel="noreferrer">
                      {basis.law}
                    </a>
                  ) : (
                    <strong>{basis.law}</strong>
                  )}
                  <span>{basis.articles ?? "적용 범위 확인 필요"}</span>
                  <small>{basis.kind}</small>
                </div>
              );
            })}
          </div>
        </CanvasBlock>

        <CanvasBlock title="권한 관계">
          <div className={styles.authorityList}>
            {canvas.authorities.map((authority) => (
              <div key={authority.name}>
                <strong>{authority.name}</strong>
                <span>{authority.role}</span>
              </div>
            ))}
          </div>
        </CanvasBlock>

        <CanvasBlock title="돈의 흐름">
          <p>{canvas.moneyFlow}</p>
        </CanvasBlock>

        <CanvasBlock title="문서의 흐름">
          <p>{canvas.docsFlow}</p>
        </CanvasBlock>

        <CanvasBlock title="병목" tone="warning">
          <ul>
            {canvas.bottlenecks.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </CanvasBlock>

        <CanvasBlock title="개선점" tone="accent" size="wide">
          <ul className={styles.twoColumnList}>
            {canvas.reformPoints.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </CanvasBlock>

        <CanvasBlock title="관련 제도">
          <div className={styles.relatedLinks}>
            {institution.related.map((name) => {
              const slug = relatedSlugs.get(name);
              return slug ? (
                <Link href={`/model/${slug}/`} key={name}>{name}</Link>
              ) : (
                <span key={name}>{name}</span>
              );
            })}
          </div>
        </CanvasBlock>

        <CanvasBlock title="현장 검증 필요" tone="field" size="wide">
          <ul className={styles.twoColumnList}>
            {institution.fieldVerification.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </CanvasBlock>
      </div>
    </section>
  );
}

function CanvasBlock({
  title,
  tone,
  size,
  children,
}: {
  title: string;
  tone?: "warning" | "accent" | "field";
  size?: "wide";
  children: React.ReactNode;
}) {
  return (
    <article className={styles.canvasBlock} data-tone={tone} data-size={size}>
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function verificationMeta(institution: Institution) {
  const article = institution.verification?.articleVerification;
  if (institution.verification?.status === "article-verified") {
    return {
      tone: "verified",
      label: article
        ? `조문 검증 ${article.verifiedReferences}/${article.articleReferences}`
        : "조문 검증 완료",
    };
  }
  if (institution.verification?.status === "source-linked") {
    return { tone: "linked", label: "공식 원문 연결" };
  }
  return { tone: "review", label: "범위 지정 필요" };
}
