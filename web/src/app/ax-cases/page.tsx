import type { Metadata } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hosungseo.github.io/korea100";
const ASSET_BASE = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ax-cases`;

export const metadata: Metadata = {
  title: "AI 행정 전후 비교",
  description:
    "AI 도구 도입 전후의 업무 체계도를 규정·추론(탐색)·대체·간소화·소멸로 나눠 비교한 케이스 스터디 9건. 법정 관문은 사라지지 않는다 — AI가 대체하는 것은 그 사이의 암묵지와 탐색비용이다.",
  alternates: { canonical: `${SITE_URL}/ax-cases/` },
};

type CaseEntry = {
  no: string;
  name: string;
  org: string;
  scope: "공무원판" | "시민판";
  work: string;
  asisImg: string;
  tobeImg: string;
  asisStat: string;
  tobeStat: string;
  point: string;
};

const CASES: CaseEntry[] = [
  {
    no: "1호",
    name: "AI 여비몬",
    org: "전남광주통합특별시",
    scope: "공무원판",
    work: "출장 여비 정산",
    asisImg: "01-yebimon-asis.png",
    tobeImg: "01-yebimon-tobe.png",
    asisStat: "20단계 = 규정 14 + 추론 6 · 반려 루프 2",
    tobeStat: "대체 5 · 간소화 2 · 소멸 1 — 사람 단계 20 → 14",
    point:
      "대체된 5개 중 4개는 공무원 여비 규정 제8조의2가 정한 의무의 이행 방식 자동화. 시리즈 전체에서 유일한 소멸(반려 루프)이 나온 케이스.",
  },
  {
    no: "2호",
    name: "세종사이렌",
    org: "세종시 재난안전상황실",
    scope: "공무원판",
    work: "재난 상황 대응",
    asisImg: "02-siren-asis.png",
    tobeImg: "02-siren-tobe.png",
    asisStat: "19단계 = 규정 11 + 추론 8 · 상황 지속 루프 1",
    tobeStat: "대체 5 · 간소화 2 · 소멸 0 — 사람 단계 19 → 14",
    point:
      "판단·발령·명령의 법정 관문은 하나도 사라지지 않고 AI는 그 사이의 속도를 바꾼다. 재난안전법 제74조의5제2항은 CCTV의 AI 분석을 이미 예정하고 있다.",
  },
  {
    no: "3호",
    name: "생성형 AI 민원답변·번역",
    org: "국민권익위원회 국민신문고",
    scope: "공무원판",
    work: "민원 답변 작성",
    asisImg: "03-minwon-asis.png",
    tobeImg: "03-minwon-tobe.png",
    asisStat: "13단계 = 규정 9 + 추론 4 · 루프 2",
    tobeStat: "대체 3 · 소멸 0 — 사람 단계 13 → 10",
    point:
      "신청·접수·기간·통지는 민원처리법이 정하지만, 가장 품이 드는 근거 검색·답변 작성·번역은 규정 밖 수작업 — 그 세 개가 통째로 AI 레인으로 넘어간다.",
  },
  {
    no: "4호",
    name: "수료증 AI 자동검수·취합",
    org: "군산시",
    scope: "공무원판",
    work: "법정의무교육 수료증 취합",
    asisImg: "04-gongedu-asis.png",
    tobeImg: "04-gongedu-tobe.png",
    asisStat: "9단계 = 규정 4 + 추론 5 · 독려 루프 1",
    tobeStat: "대체 3 · 간소화 1 · 소멸 0 — 사람 단계 9 → 6",
    point:
      "시리즈에서 추론 비중이 가장 높은 순수 서무 업무. 교육 실시와 점검·공표는 양성평등기본법 제31조가 정하지만 그 사이 수합·대조·검수·취합은 전부 규정 밖이다.",
  },
  {
    no: "5호",
    name: "문서 자동배부 6종 시스템",
    org: "전북개발공사",
    scope: "공무원판",
    work: "전자문서·민원 접수 배부",
    asisImg: "05-jbdc-asis.png",
    tobeImg: "05-jbdc-tobe.png",
    asisStat: "9단계 = 규정 3 + 추론 6 · 오배부 반송 루프 1",
    tobeStat: "대체 4 · 간소화 2 · 소멸 0 — 사람 단계 9 → 5",
    point:
      "배부 정확도 90%, 31만 건 축적, 약 3억5천만원 절감. 오배부 반송 루프는 사라지지 않고 잔여 10%로 줄어든다.",
  },
  {
    no: "6호",
    name: "민원신청서 작성 도우미",
    org: "군포시 민원봉사과",
    scope: "공무원판",
    work: "창구 신청서 작성 안내",
    asisImg: "06-gunpo-asis.png",
    tobeImg: "06-gunpo-tobe.png",
    asisStat: "7단계 = 규정 5 + 추론 2 · 재작성·보완 루프 2",
    tobeStat: "대체 1 · 간소화 2 · 소멸 0 — 루프 2 → 1(축소)",
    point:
      "대체보다 루프 축소형. 무저장·오프라인·어르신 친화 대화형 도우미가 창구의 반복 안내를 흡수하고, 접수·심사·교부의 법정 관문은 그대로다.",
  },
  {
    no: "7호",
    name: "살아있는 업무지침 '벼리'",
    org: "보건복지부",
    scope: "공무원판",
    work: "기초생활보장 급여 처리",
    asisImg: "07-byeori-asis.png",
    tobeImg: "07-byeori-tobe.png",
    asisStat: "9단계 = 규정 6 + 추론 3 · 이의 재검색 루프 1",
    tobeStat: "대체 2 · 간소화 2 · 소멸 0 — 암묵지 유실 구간 소거",
    point:
      "지침 수기 검색이 근거 답변으로, 구전 인수인계가 처리기록 승계로 바뀐다 — 이 지도의 파란 칸(암묵지) 자체를 저장하는 도구라는 점에서 특별한 케이스.",
  },
  {
    no: "시민판 1호",
    name: "모두의 민원콜",
    org: "행정안전부",
    scope: "시민판",
    work: "민원 소관기관 찾기",
    asisImg: "c1-minwoncall-asis.png",
    tobeImg: "c1-minwoncall-tobe.png",
    asisStat: "13단계 = 규정 7 + 탐색 6 · 뺑뺑이 루프 1",
    tobeStat: "대체 4 · 간소화 2 · 소멸 0 — 탐색 6 → 1",
    point:
      "시민판의 파란 칸은 '제도를 알아야 넘는 탐색 구간'. 자연어 한 문장이면 AI가 소관기관을 판별한다 — 번역·추측·뺑뺑이는 넘어가고 서식 탐색은 남는다.",
  },
  {
    no: "시민판 2호",
    name: "MY광양",
    org: "광양시",
    scope: "시민판",
    work: "출산 후 지원 신청 여정",
    asisImg: "c2-mygwangyang-asis.png",
    tobeImg: "c2-mygwangyang-tobe.png",
    asisStat: "15단계 = 규정 9 + 탐색 6 · 뒤늦은 신청 루프 1",
    tobeStat: "대체 4 · 간소화 2 · 소멸 0 — 탐색 6 → 0",
    point:
      "신청주의(사회보장급여법 제5조)와 조례 기한 1년이 만드는 '아는 만큼 받는 구조'를 통합 검색·통합 신청이 정면으로 푼다. 400개 서비스 중 출산 지원 여정에 앵커.",
  },
];

export default function AxCasesPage() {
  const publicCases = CASES.filter((c) => c.scope === "공무원판");
  const citizenCases = CASES.filter((c) => c.scope === "시민판");

  return (
    <main className="ax-cases-page">
      <header className="ax-cases-hero">
        <p>AI 행정 전후 비교 케이스 스터디</p>
        <h1>법정 관문은 사라지지 않는다 — AI가 대체하는 것은 그 사이다</h1>
        <span>
          AI 도구 도입 전(AS-IS)과 후(TO-BE)의 업무 체계도를 같은 문법으로
          그려 비교합니다. 케이스 9건 전체에서 법으로 정해진 절차의 소멸은 단
          1개(여비몬의 반려 루프)였습니다. AI가 통째로 가져간 것은 규정
          사이사이의 암묵지(공무원판)와 탐색비용(시민판)입니다.
        </span>
      </header>

      <section className="ax-cases-method" aria-label="읽는 법">
        <h2>읽는 법 — 색이 문법입니다</h2>
        <ul>
          <li>
            <i className="swatch sw-statute" />
            <div>
              <strong>초록 = 규정</strong> 법령·조례·행정규칙에 명문이 있는
              단계. 조문을 그대로 표기하며, 전 조문을 국가법령정보센터 원문과
              대조했습니다.
            </div>
          </li>
          <li>
            <i className="swatch sw-inferred" />
            <div>
              <strong>파랑 = 추론(공무원판) / 탐색(시민판)</strong> 규정에
              명문이 없어 실무를 추론으로 재구성한 암묵지 구간. 시민판에서는
              &lsquo;제도를 알아야 넘는 탐색 구간&rsquo;으로 재정의됩니다.
            </div>
          </li>
          <li>
            <i className="swatch sw-auto" />
            <div>
              <strong>보라 = AI 행위자</strong> TO-BE에서 AI 도구는 맨 오른쪽에
              전용 레인을 새로 얻습니다. 자동 사슬은 보라 실선으로 이어집니다.
            </div>
          </li>
          <li>
            <i className="swatch sw-replaced" />
            <div>
              <strong>바랜 주황 = 대체</strong> 수작업이 AI로 넘어간 단계.
              원래 자리에 흐리게 남고, 승계 화살표가 AI 레인으로 흘러갑니다.
            </div>
          </li>
          <li>
            <i className="swatch sw-removed" />
            <div>
              <strong>바랜 빨강 = 소멸 · 노랑 = 간소화</strong> 색상은 변화
              유형을, 흐림은 소멸 여부를 말합니다. 간소화는 남되 부담이
              줄어든 단계입니다.
            </div>
          </li>
        </ul>
      </section>

      <section className="ax-cases-stats" aria-label="시리즈 요약">
        <div>
          <strong>9</strong>
          <span>케이스 (공무원판 7 + 시민판 2)</span>
        </div>
        <div>
          <strong>114 → 82</strong>
          <span>사람이 밟는 단계 합계</span>
        </div>
        <div>
          <strong>1</strong>
          <span>법정 관문 소멸 (9건 통틀어)</span>
        </div>
        <div>
          <strong>100%</strong>
          <span>인용 조문 원문 대조</span>
        </div>
      </section>

      <section className="ax-cases-group">
        <h2>공무원판 — AI는 암묵지를 대체한다</h2>
        <p>
          신청·접수·결재·통지 같은 법정 관문 사이에는 규정에 없는 수작업이
          숨어 있습니다. 근거를 찾고, 대조하고, 취합하고, 옮겨 적는 파란
          구간 — 일곱 케이스 모두에서 AI가 가져간 것은 바로 이 구간입니다.
        </p>
        {publicCases.map((c) => (
          <CaseBlock key={c.no} entry={c} />
        ))}
      </section>

      <section className="ax-cases-group">
        <h2>시민판 — AI는 탐색비용을 대체한다</h2>
        <p>
          대국민 서비스는 레인을 뒤집어 시민을 주인공으로 그립니다. 시민판의
          파란 칸은 &lsquo;제도를 알아야 넘는 탐색 구간&rsquo; — 어느 기관
          소관인지, 무엇을 받을 수 있는지 알아내는 부담입니다. 공무원판의
          암묵지에 정확히 대응합니다.
        </p>
        {citizenCases.map((c) => (
          <CaseBlock key={c.no} entry={c} />
        ))}
      </section>

      <section className="ax-cases-note" aria-label="방법과 한계">
        <h2>방법과 한계</h2>
        <p>
          각 체계도의 초록 단계는 해당 법령·조례를 국가법령정보센터(DRF) 원문과
          대조해 조문 번호까지 표기했습니다. 파란 단계는 규정에 명문이 없어
          실무를 추론으로 재구성한 것으로, 기관에 따라 다를 수 있습니다. 도구
          기능은 언론 보도·AI 정부 실험실 공개 저장소·공개 목록에 근거하며,
          일부는 구상·시연 단계일 수 있습니다. 각 이미지 하단 각주에 케이스별
          근거를 남겼습니다.
        </p>
      </section>
    </main>
  );
}

function CaseBlock({ entry }: { entry: CaseEntry }) {
  return (
    <article className="ax-case">
      <header>
        <span className="ax-case-no">{entry.no}</span>
        <h3>
          {entry.name} <small>{entry.org}</small>
        </h3>
        <p>{entry.work}</p>
      </header>
      <div className="ax-case-sheets">
        <figure>
          <a
            href={`${ASSET_BASE}/${entry.asisImg}`}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={`${ASSET_BASE}/${entry.asisImg}`}
              alt={`${entry.name} 도입 전(AS-IS) 업무 체계도`}
              loading="lazy"
            />
          </a>
          <figcaption>
            <strong>AS-IS</strong> {entry.asisStat}
          </figcaption>
        </figure>
        <figure>
          <a
            href={`${ASSET_BASE}/${entry.tobeImg}`}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={`${ASSET_BASE}/${entry.tobeImg}`}
              alt={`${entry.name} AI 적용 후(TO-BE) 업무 체계도`}
              loading="lazy"
            />
          </a>
          <figcaption>
            <strong>AI 적용</strong> {entry.tobeStat}
          </figcaption>
        </figure>
      </div>
      <p className="ax-case-point">{entry.point}</p>
    </article>
  );
}
