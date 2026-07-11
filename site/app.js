const institutions = [
  {
    title: "환경영향평가",
    type: "협의ㆍ평가형",
    status: "포맷 기준 샘플",
    summary: "사업이 환경에 미치는 영향을 미리 검토하고 협의하는 대표 절차형 제도입니다.",
    actors: "사업자ㆍ평가대행자, 승인기관의 장, 주관 시장ㆍ군수ㆍ구청장, 주민 등, 협의기관의 장, 검토기관ㆍ전문가",
    focus: "G0-G8 단계 게이트, 현재 공 보유자, 주민 의견수렴, 협의기관 보완 루프, 사후환경영향조사",
    reason: "이미 법령 API 자료와 swimlane 샘플이 있고, 상태 인식형 업무구조도의 첫 기준으로 적합합니다."
  },
  {
    title: "예비타당성조사",
    type: "재정ㆍ평가형",
    status: "재정 평가 기준",
    summary: "대규모 재정사업을 추진하기 전에 경제성, 정책성, 지역균형 등을 검토하는 제도입니다.",
    actors: "기획재정부, 주무부처, 조사수행기관, 지방자치단체, 국회, 사업 수혜자",
    focus: "사업 요구, 대상 선정, 조사 착수, 비용ㆍ편익 분석, 종합평가, 결과 통보, 예산 반영",
    reason: "예산, 사업, 평가, 정치적 쟁점이 한 화면에 드러나 제도 모델의 설명력이 큽니다."
  },
  {
    title: "재건축ㆍ재개발 정비사업",
    type: "부동산ㆍ인허가형",
    status: "부동산 기준 샘플",
    summary: "노후 주거지를 정비하기 위해 조합, 토지등소유자, 지자체, 시공자가 얽히는 고복잡도 제도입니다.",
    actors: "토지등소유자, 조합, 시장ㆍ군수ㆍ구청장, 시공자, 정비사업전문관리업자, 분양 대상자",
    focus: "정비계획, 추진위원회, 조합설립인가, 사업시행인가, 관리처분계획, 착공ㆍ분양ㆍ이전고시",
    reason: "부동산 관련 제도 중 대중 수요와 절차 복잡도가 모두 커서 한 장 구조도 효과가 큽니다."
  },
  {
    title: "지방소멸대응기금",
    type: "재정배분형",
    status: "지역정책 연결",
    summary: "인구감소지역 등에 재원을 배분해 지역 활력 사업을 추진하도록 하는 기금 제도입니다.",
    actors: "행정안전부, 지방자치단체, 투자계획 평가단, 지방의회, 지역 주민",
    focus: "투자계획 수립, 평가, 배분, 집행, 성과관리, 지방의회 언급과 지역정책 연계",
    reason: "기존 지방의회ㆍ국회 API 관심사와 연결되고 홈페이지의 지역정책 이용자에게 맞습니다."
  },
  {
    title: "정보공개청구",
    type: "권리구제ㆍ참여형",
    status: "시민 접점",
    summary: "국민이 공공기관이 보유한 정보를 청구하고 공개 여부에 대해 불복할 수 있는 권리 행사 제도입니다.",
    actors: "청구인, 공공기관, 정보공개심의회, 제3자, 행정심판위원회, 법원",
    focus: "청구, 접수, 공개ㆍ비공개 결정, 제3자 의견, 이의신청, 행정심판ㆍ행정소송",
    reason: "시민 접점이 크고 비공개 결정 이후 권리구제 흐름까지 선명합니다."
  },
  {
    title: "행정심판",
    type: "권리구제형",
    status: "불복 절차 기준",
    summary: "위법하거나 부당한 행정처분에 대해 국민이 행정기관 내부 절차로 다툴 수 있는 제도입니다.",
    actors: "청구인, 피청구인, 행정심판위원회, 재결청, 보충서면 제출자",
    focus: "처분, 청구, 답변, 심리, 재결, 집행정지, 인용ㆍ기각 이후 절차",
    reason: "권리구제형 제도의 대표이며 다른 제도의 불복 단계와도 연결됩니다."
  },
  {
    title: "국민기초생활보장",
    type: "복지급여형",
    status: "복지 기준 샘플",
    summary: "소득과 재산이 일정 기준 이하인 가구에 생계ㆍ의료ㆍ주거ㆍ교육 급여를 보장하는 제도입니다.",
    actors: "신청인, 읍면동, 시군구, 보장기관, 국민연금공단 등 조사기관, 급여 수급자",
    focus: "신청, 소득ㆍ재산 조사, 수급자 선정, 급여 결정, 지급, 확인조사, 이의신청",
    reason: "복지 선정과 집행, 사각지대 논의를 한 장에 담기 좋은 대표 급여 제도입니다."
  },
  {
    title: "공공조달ㆍ국가계약",
    type: "재정ㆍ계약형",
    status: "실무 수요",
    summary: "공공기관이 물품, 용역, 공사를 구매하기 위해 입찰, 평가, 계약, 이행관리를 수행하는 제도입니다.",
    actors: "수요기관, 조달청, 입찰참가자, 계약상대자, 평가위원, 감사ㆍ감독기관",
    focus: "발주, 입찰공고, 참가자격, 제안평가, 낙찰, 계약 체결, 검사ㆍ검수, 대금 지급",
    reason: "나라장터와 국가계약은 실무 수요가 크고 돈과 문서 흐름을 보여주기 좋습니다."
  },
  {
    title: "국민건강보험",
    type: "사회보험형",
    status: "대중 친숙",
    summary: "국민이 보험료를 부담하고 질병ㆍ부상에 대해 보험급여를 받는 전국민 사회보험 제도입니다.",
    actors: "가입자, 사업장, 국민건강보험공단, 건강보험심사평가원, 의료기관, 보건복지부",
    focus: "자격, 보험료 부과ㆍ징수, 진료, 청구, 심사, 급여 지급, 이의신청",
    reason: "이용자 친숙도가 높고 돈의 흐름과 서비스 보장 구조를 설명하기 좋습니다."
  },
  {
    title: "개인정보 영향평가",
    type: "데이터ㆍ디지털형",
    status: "디지털 제도",
    summary: "개인정보 침해 위험이 큰 정보시스템을 도입ㆍ변경할 때 사전에 위험을 분석하고 개선하는 제도입니다.",
    actors: "공공기관, 개인정보보호책임자, 영향평가기관, 개인정보보호위원회, 정보주체",
    focus: "대상 판단, 평가기관 선정, 위험 분석, 개선계획, 제출ㆍ확인, 사후관리",
    reason: "공공기관 실무 수요가 있고 데이터ㆍ디지털 제도 축의 대표 사례로 쓸 수 있습니다."
  }
];

const list = document.querySelector(".institution-list");
const detailTitle = document.querySelector("#detail-title");
const detailSummary = document.querySelector("#detail-summary");
const detailType = document.querySelector("#detail-type");
const detailStatus = document.querySelector("#detail-status");
const detailActors = document.querySelector("#detail-actors");
const detailFocus = document.querySelector("#detail-focus");
const detailReason = document.querySelector("#detail-reason");

function renderRows() {
  list.innerHTML = institutions.map((item, index) => `
    <button class="institution-row${index === 0 ? " is-active" : ""}" type="button" data-index="${index}" aria-pressed="${index === 0}">
      <span class="row-index">${String(index + 1).padStart(2, "0")}</span>
      <span>
        <span class="row-title">${item.title}</span>
        <span class="row-summary">${item.summary}</span>
      </span>
      <span class="row-type">${item.type}</span>
    </button>
  `).join("");
}

function updateDetail(index) {
  const selected = institutions[index];
  detailTitle.textContent = selected.title;
  detailSummary.textContent = selected.summary;
  detailType.textContent = selected.type;
  detailStatus.textContent = selected.status;
  detailActors.textContent = selected.actors;
  detailFocus.textContent = selected.focus;
  detailReason.textContent = selected.reason;

  document.querySelectorAll(".institution-row").forEach((row, rowIndex) => {
    const active = rowIndex === index;
    row.classList.toggle("is-active", active);
    row.setAttribute("aria-pressed", String(active));
  });
}

renderRows();
updateDetail(0);

list.addEventListener("click", (event) => {
  const row = event.target.closest(".institution-row");
  if (!row) return;
  updateDetail(Number(row.dataset.index));
});

document.querySelector(".request-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get("institution") || "").trim();
  const state = form.querySelector(".form-state");
  if (!name) {
    state.textContent = "알고 싶은 제도명을 입력해주세요.";
    return;
  }
  const subject = encodeURIComponent(`[제도100] 제작 요청 — ${name}`);
  const body = encodeURIComponent(
    [
      `[제도명] ${name}`,
      `[헷갈리는 지점] ${String(data.get("pain") || "")}`,
      `[사용자 유형] ${String(data.get("reader") || "")}`,
    ].join("\n"),
  );
  window.location.href = `mailto:hosung.seo2026@gmail.com?subject=${subject}&body=${body}`;
});
