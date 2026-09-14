import styles from "./JointHomeTaxGuide.module.css";

const NOTICE = "https://ems.nts.go.kr/nts/na/ntt/selectNttInfo.do?bbsId=1028&mi=2201&nttSn=1354762";
const FORM = "https://www.law.go.kr/flDownload.do?bylClsCd=110202&flSeq=162508503&gubun=";

/** 2026년 현행 안내. 개인별 세액을 계산하거나 절세 결과를 판정하지 않는다. */
export default function JointHomeTaxGuide() {
  return (
    <section className={styles.guide} aria-labelledby="joint-home-guide-title">
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>2026년 기준 · 신청 전 비교</p>
          <h2 id="joint-home-guide-title">한 집, 두 가지 과세방식</h2>
          <p>특례가 항상 유리한 것은 아닙니다. 부부 각각의 세액 합계와 특례 적용 세액을 비교하세요.</p>
        </div>
        <div className={styles.period}><span>최초·변경·취소 신청</span><strong>9.16 — 9.30</strong><span>과세기준일은 6월 1일</span></div>
      </header>

      <div className={styles.comparison}>
        <article>
          <h3>특례 미적용 · 각각 과세</h3>
          <p className={styles.amount}>각 <strong>9억 원</strong> 공제</p>
          <ul>
            <li>각자의 지분 공시가격으로 인별 계산</li>
            <li>이 공동명의 주택에 대한 1세대 1주택 연령·보유기간 세액공제 미적용</li>
            <li>지분이 다르면 두 사람의 과세표준도 달라짐</li>
          </ul>
        </article>
        <article className={styles.special}>
          <h3>특례 적용 · 한 사람에게 과세</h3>
          <p className={styles.amount}>합산 후 <strong>12억 원</strong> 공제</p>
          <ul>
            <li>배우자의 지분까지 합산하여 계산</li>
            <li>합의한 납세의무자의 연령·보유기간별 세액공제</li>
            <li>해당 세액공제는 합계 최대 80% 한도</li>
          </ul>
        </article>
      </div>

      <p className={styles.change}><strong>2026년 달라진 점</strong> 지분율과 관계없이 부부 합의로 납세의무자 1명을 정합니다. 선택한 사람의 연령·보유기간이 공제 기준입니다.</p>
      <details className={styles.checklist}>
        <summary>신청 전 확인할 것 · 계속 적용과 변경의 차이</summary>
        <ul>
          <li>법률상 부부가 공동소유한 주택인지, 부부 모두 거주자인지, 다른 세대원의 주택·부속토지가 있는지 6월 1일 기준으로 확인합니다.</li>
          <li>최초 신청은 별지 제30호서식과 혼인관계증명서 1부를 제출합니다. 건물등기사항증명서는 담당 공무원이 공동이용으로 확인합니다.</li>
          <li>기존 신청사항에 변동이 없고 요건을 계속 충족하면 매년 다시 신청하지 않습니다.</li>
          <li>소유자·지분율 변경, 납세의무자 변경, 특례 취소는 변경신청 대상입니다.</li>
          <li>납세의무자 본인의 일시적 2주택·상속주택·지방 저가주택 등은 별도 요건과 주택 수 산정 제외 신청을 확인합니다. 공동명의 특례 신청만으로 자동 제외되지 않습니다.</li>
        </ul>
      </details>

      <nav className={styles.links} aria-label="공동명의 특례 공식 안내">
        <a href={FORM} target="_blank" rel="noreferrer">공식 신청서 PDF ↗</a>
        <a href={NOTICE} target="_blank" rel="noreferrer">국세청 2026년 안내 ↗</a>
        <a href="https://www.hometax.go.kr/" target="_blank" rel="noreferrer">홈택스 모의계산·신청 ↗</a>
        <a href="#process">신청 절차 보기 ↓</a>
      </nav>
      <p className={styles.source}>근거: 종합부동산세법 제8조·제9조제5항·제10조의2, 시행령 제5조의2, 시행규칙 제4조의12·별지 제30호서식. 확인일 2026.9.14. 공제액만으로 유불리를 판단하지 않으며 재산세 공제·세부담 상한 등은 실제 세액 계산에 함께 반영합니다.</p>
    </section>
  );
}
