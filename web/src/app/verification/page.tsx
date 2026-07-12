import type { Metadata } from "next";
import VerificationQueue from "@/components/VerificationQueue";
import {
  getFieldVerificationQueue,
  getInstitutionSummaries,
  getRegistryStats,
} from "@/lib/data";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hosungseo.github.io/korea100";

export const metadata: Metadata = {
  title: "검증 현황",
  description:
    "법령 원문 검증 범위와 실제 운영 확인이 필요한 현장 검증 항목을 공개합니다.",
  alternates: { canonical: `${SITE_URL}/verification/` },
};

export default function VerificationPage() {
  const queue = getFieldVerificationQueue();
  const institutions = getInstitutionSummaries();
  const stats = getRegistryStats(institutions);
  const needsScopeReview = stats.needsReviewCount;
  const numberFormat = new Intl.NumberFormat("ko-KR");

  return (
    <main className="verification-page">
      <header>
        <p>검증 공개 대장</p>
        <h1>법령으로 확인한 것과 현장에서 확인할 것을 구분합니다</h1>
        <span>
          명시 조문은 공식 원문의 번호 존재 여부를 확인했습니다. 아래 항목은 실제
          처리, 내부 절차, 시스템 운용처럼 추가 근거가 필요한 운영 사실입니다.
        </span>
      </header>

      <section className="verification-stats" aria-label="검증 현황 요약">
        <div>
          <strong>
            {numberFormat.format(stats.verifiedReferences)}/
            {numberFormat.format(stats.articleReferences)}
          </strong>
          <span>명시 조문 확인</span>
        </div>
        <div>
          <strong>{numberFormat.format(stats.sourceCount)}</strong>
          <span>공식 원문 연결</span>
        </div>
        <div>
          <strong>{needsScopeReview}</strong>
          <span>범위 지정 필요 제도</span>
        </div>
        <div>
          <strong>{queue.total}</strong>
          <span>현장 검증 항목</span>
        </div>
      </section>

      <section className="verification-principles">
        <div>
          <strong>조문 확인</strong>
          <span>현행 공식 원문에 인용한 조문 번호가 존재하는지 확인</span>
        </div>
        <div>
          <strong>범위 확인</strong>
          <span>지역·기관·내부규정·연도별 문서처럼 적용 대상을 지정해야 하는 근거</span>
        </div>
        <div>
          <strong>현장 검증</strong>
          <span>공개 문서나 복수 실무자 확인이 필요한 실제 운영 설명</span>
        </div>
      </section>

      <VerificationQueue entries={queue.entries} />
    </main>
  );
}
