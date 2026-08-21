import type { Metadata } from "next";
import generated from "./cases.generated.json";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hosungseo.github.io/korea100";
const ASSET_BASE = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/ax-cases`;
const SHEETS = `${ASSET_BASE}/sheets`;

type GeneratedCase = {
  id: number;
  slug: string;
  org: string;
  work: string;
  stage: string;
  citizen: boolean;
  group: string;
  asisTitle: string;
  tobeTitle: string;
  asisHeadline: string;
  tobeHeadline: string;
  sources: string[];
  stats: {
    steps: number;
    statute: number;
    inferred: number;
    replaced: number;
    changed: number;
    removed: number;
    auto: number;
  };
};

const GENERATED = generated as GeneratedCase[];
// 정밀 9건은 위쪽 상세 블록에서 이미 다루므로 목록에서는 제외한다(데이터·집계에는 포함)
const EXPANDED = GENERATED.filter((c) => c.group !== "정밀 사례");

const AGG = GENERATED.reduce(
  (s, c) => ({
    steps: s.steps + c.stats.steps,
    statute: s.statute + c.stats.statute,
    inferred: s.inferred + c.stats.inferred,
    replaced: s.replaced + c.stats.replaced,
    changed: s.changed + c.stats.changed,
    removed: s.removed + c.stats.removed,
  }),
  { steps: 0, statute: 0, inferred: 0, replaced: 0, changed: 0, removed: 0 },
);

const GROUP_ORDER = [
  "중앙부처",
  "광역지자체",
  "기초지자체",
  "경찰·소방·군 등 특수직역",
  "공공기관·공기업",
  "공직자 자체 개발",
  "정부 공공 깃랩",
  "사례집·수상",
  "기타",
];

export const metadata: Metadata = {
  title: "AI 행정 전후 비교",
  description:
    `AI 도구 도입 전후의 업무 체계도를 규정·추론(탐색)·대체·간소화·소멸로 나눠 비교한 케이스 ${GENERATED.length}건. 법정 관문은 사라지지 않는다 — AI가 대체하는 것은 그 사이의 암묵지와 탐색비용이다.`,
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
          그려 비교합니다. 137건에서 업무 단계 1,575개를 분해했더니, AI가 가져간
          573개 중 <b>97.4%가 규정 밖 실무</b>였고 절차 자체의 소멸은 4개(0.25%)뿐
          이었습니다. 법이 이행 방법까지 정해 둔 곳에서만 규정 단계도 넘어갑니다.
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
          <strong>{GENERATED.length}</strong>
          <span>케이스 (정밀 9 + 확장 {EXPANDED.length})</span>
        </div>
        <div>
          <strong>{AGG.steps.toLocaleString("ko-KR")}</strong>
          <span>분해한 업무 단계</span>
        </div>
        <div>
          <strong>{AGG.replaced.toLocaleString("ko-KR")}</strong>
          <span>AI가 가져간 단계(대체)</span>
        </div>
        <div>
          <strong>{AGG.removed}</strong>
          <span>절차 자체의 소멸</span>
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

      <section className="ax-cases-group" id="expanded">
        <h2>확장 사례 {EXPANDED.length}건 — 같은 문법으로 한 번에</h2>
        <p>
          중앙부처·지자체·공공기관·특수직역에서 실제로 쓰이는 사례를 모아 같은
          색 문법으로 그렸습니다. 각 사례의 <b>AS-IS</b>와 <b>AI 적용</b>을 눌러
          체계도를 펼쳐 보세요. 위 아홉 건이 조문까지 손으로 대조한 정밀판이라면,
          여기부터는 귀납을 위한 규모 확보가 목적입니다 — 한계는 아래에 밝혔습니다.
        </p>
        {GROUP_ORDER.filter((g) => EXPANDED.some((c) => c.group === g)).map(
          (group) => (
            <div key={group} className="ax-case-group-block">
              <h3>
                {group}{" "}
                <small>
                  {EXPANDED.filter((c) => c.group === group).length}건
                </small>
              </h3>
              <ul className="ax-case-list">
                {EXPANDED.filter((c) => c.group === group).map((c) => (
                  <li key={c.slug}>
                    <div className="ax-case-list-head">
                      <strong>{c.org}</strong>
                      <span>{c.work}</span>
                      {c.stage ? <em>{c.stage}</em> : null}
                    </div>
                    <p className="ax-case-list-stat">
                      단계 {c.stats.steps} (규정 {c.stats.statute} · 추론{" "}
                      {c.stats.inferred}) → 대체 {c.stats.replaced} · 간소화{" "}
                      {c.stats.changed} · 소멸 {c.stats.removed}
                    </p>
                    <div className="ax-case-list-links">
                      <a href={`${SHEETS}/${c.slug}-asis.html`} target="_blank" rel="noreferrer">
                        AS-IS 체계도
                      </a>
                      <a href={`${SHEETS}/${c.slug}-tobe.html`} target="_blank" rel="noreferrer">
                        AI 적용 체계도
                      </a>
                      {c.sources[0] ? (
                        <a href={c.sources[0].split(" ")[0]} target="_blank" rel="noreferrer">
                          출처
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </section>

      <section className="ax-cases-note" aria-label="방법과 한계">
        <h2>방법과 한계</h2>
        <p>
          <b>사례 선별</b>은 네 가지를 모두 통과한 것만 실었습니다 — ① 누구의
          무슨 일인지 지목할 수 있는가 ② 도입 전 절차를 재구성할 수 있는가 ③
          어떤 단계가 어떻게 바뀌었는가 ④ 실제로 쓰이고 있는가. 법령 검색기나
          문서 변환기 같은 <b>범용 도구는 업무가 아니라 도구</b>라서 제외했고,
          계획·구상 단계도 뺐습니다.
        </p>
        <p>
          <b>초록(규정) 단계</b>는 법령·조례에 명문이 있는 절차입니다. 인용한
          조문은 <b>법제처 국가법령정보 공동활용 API로 전수 대조</b>했습니다 —
          확장 사례에서 62개 법령·137개 조문을 검사해 현재 오류 0입니다(검사기가
          없는 조문·없는 법령을 실제로 잡아내는지 음성 대조군으로 확인했습니다).
          <b>파란(추론) 단계</b>는
          규정에 명문이 없어 실무를 재구성한 것이라 기관마다 다를 수 있습니다.
          공공기관·공기업은 법령이 아니라 사규·내규로 움직이는 부분이 많아 파란
          칸의 비중이 특히 높습니다 — 이는 오류가 아니라 그 조직의 성격입니다.
        </p>
        <p>
          <b>도구 기능과 수치</b>는 언론 보도·정부 공공 깃랩 저장소·공식
          사례집에 나온 것만 인용했으며, 각 체계도 하단 각주에 근거를 남겼습니다.
          체계도는 업무의 구조를 보여주기 위한 재구성이지 기관의 공식 절차도가
          아닙니다. 오류를 발견하시면 알려주세요.
        </p>
      </section>
    </main>
  );
}

function CaseBlock({ entry }: { entry: CaseEntry }) {
  // PNG와 같은 이름의 HTML 시트가 sheets/ 에 있다 (예: 01-yebimon-asis.png → p01-yebimon-asis.html)
  const sheetSlug = `p${entry.asisImg.replace("-asis.png", "")}`;
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
            <a
              className="ax-sheet-link"
              href={`${SHEETS}/${sheetSlug}-asis.html`}
              target="_blank"
              rel="noreferrer"
            >
              HTML 시트
            </a>
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
            <a
              className="ax-sheet-link"
              href={`${SHEETS}/${sheetSlug}-tobe.html`}
              target="_blank"
              rel="noreferrer"
            >
              HTML 시트
            </a>
          </figcaption>
        </figure>
      </div>
      <p className="ax-case-point">{entry.point}</p>
    </article>
  );
}
