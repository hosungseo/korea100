import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "공유 이미지",
  robots: { index: false, follow: false },
};

export default function OgCardPage() {
  return (
    <main className="og-card-page">
      <div className="og-card-brand">
        <span aria-hidden="true" />
        법령 기준 제도 모델
      </div>
      <h1>대한민국 제도 100</h1>
      <p>법령부터 실제 업무 흐름까지, 한 장으로 읽는 국가 운영 카탈로그</p>

      <section className="og-card-metrics">
        <div>
          <strong>100</strong>
          <span>제도 모델</span>
        </div>
        <div>
          <strong>1,573</strong>
          <span>업무 노드</span>
        </div>
        <div>
          <strong>3,721</strong>
          <span>확인 조문</span>
        </div>
        <div>
          <strong>433</strong>
          <span>공식 원문</span>
        </div>
      </section>

      <section className="og-card-flow" aria-label="제도 모델 구성">
        <div><span>01</span><strong>법령 근거</strong></div>
        <i aria-hidden="true" />
        <div><span>02</span><strong>권한과 기관</strong></div>
        <i aria-hidden="true" />
        <div><span>03</span><strong>업무 절차</strong></div>
        <i aria-hidden="true" />
        <div><span>04</span><strong>문서·예산</strong></div>
        <i aria-hidden="true" />
        <div><span>05</span><strong>병목과 개선</strong></div>
      </section>

      <footer>hosungseo.github.io/korea100</footer>
    </main>
  );
}
