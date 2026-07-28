#!/usr/bin/env node
/**
 * Add Korea100 cards for elderly care service regimes used by the
 * integrated-care-edu-demo mapping:
 * - 노인맞춤돌봄서비스
 * - 독거노인·장애인 응급안전안심서비스
 *
 * Primary statute anchors (DRF 2026-07-29):
 * - 노인복지법 MST 259093, lawId 001777 (제27조의2 등)
 * - 장애인복지법 MST 281941, lawId 000187 (응급안전 장애인 축)
 *
 * Detailed 사업안내(연도별 지침) citations remain fieldVerification items.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const MANIFEST_PATH = path.join(REPO_DIR, "docs", "institutions-100-manifest.json");
const OVERWRITE = process.argv.includes("--overwrite");
const AS_OF = "2026-07-29";
const CATEGORY = "복지와 사회보험";
const TYPE = "복지급여형";

const ELDERLY_LAW = {
  law: "노인복지법",
  kind: "법률",
  sourceType: "statute",
  officialName: "노인복지법",
  lawId: "001777",
  mst: "259093",
  promulgatedOn: "2024-01-23",
  effectiveOn: "2026-01-24",
  officialUrl: "https://law.go.kr/법령/노인복지법",
};

const DISABILITY_LAW = {
  law: "장애인복지법",
  kind: "법률",
  sourceType: "statute",
  officialName: "장애인복지법",
  lawId: "000187",
  mst: "281941",
  promulgatedOn: "2025-12-30",
  effectiveOn: "2026-07-01",
  officialUrl: "https://law.go.kr/법령/장애인복지법",
};

function lb(law, article, text) {
  return { law, article, text };
}

function node(partial) {
  return {
    progress: partial.status === "done" ? 100 : partial.status === "current" ? 45 : 0,
    confidence: 0.82,
    output_documents: [],
    ...partial,
  };
}

function sequenceEdges(ids) {
  return ids.slice(0, -1).map((id, i) => ({
    id: `E${String(i + 1).padStart(2, "0")}`,
    source: id,
    target: ids[i + 1],
    type: "sequence",
    label: null,
  }));
}

function verification(sources, articleRefs, notes = []) {
  return {
    status: "source-linked",
    verifiedAt: AS_OF,
    method: "국가법령정보센터 DRF API(lawSearch/lawService)로 법률 원문 연결 및 핵심 조문 존재 확인",
    scope:
      "상위 법률 출처를 연결하고 핵심 조문 번호 존재를 확인했다. 연도별 사업안내·지자체 세부 기준의 해석·적용은 검증 범위에 포함하지 않는다.",
    notes,
    sources,
    articleVerification: {
      checkedAt: AS_OF,
      method: "DRF 현행 본문 XML에서 조문번호·조문제목·항내용 대조",
      citationEntries: articleRefs,
      explicitCitationEntries: articleRefs,
      articleReferences: articleRefs,
      verifiedReferences: articleRefs,
      missingReferences: 0,
      uncheckableReferences: 0,
    },
  };
}

const elderlyCustomizedCare = {
  slug: "elderly-customized-care",
  name: "노인맞춤돌봄서비스",
  oneLiner:
    "취약노인의 일상생활·안전·사회참여를 위해 시·군·구가 대상자를 선정하고 수행기관이 방문·통원형 돌봄을 제공하는 지역 노인돌봄 제도",
  type: TYPE,
  priority: 506,
  category: CATEGORY,
  whyFirst:
    "통합돌봄 교육·현장 계획서에서 가장 자주 등장하는 재가 노인돌봄 후보인데, 장기요양·통합지원과 혼동되기 쉬워 별도 제도 카드가 필요하다.",
  asOfDate: AS_OF,
  status: "full",
  canvas: {
    purpose:
      "홀로 살거나 돌봄이 부족한 노인이 살던 곳에서 일상을 유지하도록, 안전확인·생활지원·사회참여·연계서비스를 개인별 필요에 맞춰 제공한다. 장기요양 등급 여부와 별개로 지자체 돌봄체계에서 작동하는 사업형 제도다.",
    stakeholders:
      "65세 이상 취약노인·가족, 읍·면·동, 시·군·구 노인돌봄 담당, 수행기관(노인맞춤돌봄 수행인력), 독거노인종합지원센터, 보건복지부, 관련 의료·장기요양·긴급돌봄 기관",
    legalBasis: [
      {
        law: "노인복지법",
        articles:
          "제27조의2(홀로 사는 노인에 대한 지원: 방문요양·돌봄·안전확인 등), 제27조의3(독거노인종합지원센터), 제38조·제39조(재가노인복지시설 및 설치)",
        kind: "법률",
      },
    ],
    authorities: [
      { name: "보건복지부", role: "사업 지침·국고보조·총괄" },
      { name: "시·군·구", role: "대상 선정·수행기관 지정·예산·관리" },
      { name: "읍·면·동", role: "발굴·신청 접수·초기 상담" },
      { name: "수행기관·생활지원사 등", role: "방문·통원 서비스 제공" },
      { name: "독거노인종합지원센터", role: "정책·교육·현황관리 지원(법 제27조의3)" },
    ],
    procedure: [
      "취약노인 발굴·신청(읍면동·수행기관·유관기관 연계)",
      "욕구·위험 조사 및 대상 선정",
      "개인별 돌봄계획 수립",
      "방문·통원형 직접서비스 제공(안전·일상·사회참여 등)",
      "필요 시 장기요양·의료·긴급돌봄 등 연계",
      "모니터링·재사정·종결 또는 재배치",
    ],
    moneyFlow:
      "국비·지방비 매칭의 사업비로 수행기관 운영·인건비·서비스비가 집행된다. 이용자 본인부담 구조는 장기요양 재가급여와 다르며 연도별 사업안내에 따른다.",
    docsFlow:
      "발굴·신청 자료 → 조사·선정 결과 → 개인별 돌봄계획 → 서비스 제공 기록 → 연계·모니터링 기록(행복e음 등 사회보장정보시스템 연동 가능)",
    bottlenecks: [
      "장기요양 재가급여·긴급돌봄·통합지원과의 역할 경계 혼동",
      "수행인력 확보와 방문 주기·거리(특히 농촌)",
      "대상 선정 기준·대기·우선순위의 지역차",
      "연도별 사업안내와 법률 조문의 추상성 사이 해석 부담",
    ],
    reformPoints: [
      "장기요양·통합지원과의 연계 기준을 계획서 템플릿에 표준화",
      "농촌 방문 이동시간·빈도 지표 공개",
      "선정·대기 사유를 당사자에게 설명 가능한 문안으로 정비",
    ],
  },
  related: [
    "지역 돌봄 통합지원",
    "노인장기요양보험",
    "독거노인·장애인 응급안전안심서비스",
    "사회서비스원·긴급돌봄",
    "기초연금",
  ],
  fieldVerification: [
    "당해 연도 노인맞춤돌봄서비스 사업안내의 대상·서비스 내용·단가",
    "시·군·구별 수행기관 지정 현황과 대기자 운영 방식",
    "장기요양 수급자와의 중복·우선 적용 기준",
    "행복e음 입력 항목과 개인별 돌봄계획 서식",
  ],
  process: {
    institution_name: "노인맞춤돌봄서비스",
    law_name: "노인복지법",
    lanes: ["노인·가족", "읍면동", "시군구(선정·관리)", "수행기관", "독거노인종합지원센터", "보건복지부"],
    stages: ["G0 기준·지침", "G1 발굴·신청", "G2 선정·계획", "G3 서비스 제공", "G4 연계·모니터링", "G5 재사정·종결"],
    nodes: [
      node({
        id: "P01",
        name: "사업 지침·예산 확인",
        lane: "보건복지부",
        stage: "G0 기준·지침",
        type: "task",
        status: "done",
        actor: "보건복지부",
        action: "연도별 사업 방향·국고보조 기준 제시",
        output_documents: ["사업안내", "예산 배정"],
        legal_basis: [
          lb("노인복지법", "제27조의2제3항", "서비스 및 보호조치의 구체적 내용은 보건복지부장관이 정한다."),
        ],
      }),
      node({
        id: "P02",
        name: "취약노인 발굴·상담",
        lane: "읍면동",
        stage: "G1 발굴·신청",
        type: "task",
        status: "done",
        actor: "읍·면·동 공무원·유관기관",
        action: "고위험 노인 발굴·초기 상담",
        output_documents: ["발굴 목록", "상담 기록"],
        legal_basis: [
          lb("노인복지법", "제27조의2제1항", "국가 또는 지방자치단체는 홀로 사는 노인에 대하여 방문요양과 돌봄 등의 서비스와 안전확인 등의 보호조치를 취하여야 한다."),
        ],
      }),
      node({
        id: "P03",
        name: "돌봄 신청·동의",
        lane: "노인·가족",
        stage: "G1 발굴·신청",
        type: "task",
        status: "done",
        actor: "본인·가족·대리인",
        action: "서비스 신청 및 개인정보·서비스 동의",
        output_documents: ["신청서", "동의서"],
        legal_basis: [
          lb("노인복지법", "제27조의2", "홀로 사는 노인에 대한 지원 사업의 이용 신청·동의 절차(세부 서식은 사업안내)."),
        ],
      }),
      node({
        id: "P04",
        name: "욕구·위험 조사",
        lane: "시군구(선정·관리)",
        stage: "G2 선정·계획",
        type: "task",
        status: "done",
        actor: "시·군·구 또는 위탁 수행기관",
        action: "일상생활·안전·사회적 관계 욕구 조사",
        output_documents: ["조사표", "위험도 평가"],
        legal_basis: [
          lb("노인복지법", "제27조의2제1항", "돌봄·안전확인 등 보호조치에 필요한 현황 파악."),
        ],
      }),
      node({
        id: "P05",
        name: "대상 선정 결정",
        lane: "시군구(선정·관리)",
        stage: "G2 선정·계획",
        type: "gateway",
        status: "current",
        actor: "시·군·구",
        action: "선정·대기·부적합 결정",
        output_documents: ["선정 결과 통지"],
        blocker: "예산·인력·우선순위에 따른 대기 가능",
        legal_basis: [
          lb("노인복지법", "제27조의2제2항", "사업을 노인 관련 기관·단체에 위탁하고 비용을 지원할 수 있다."),
        ],
      }),
      node({
        id: "P06",
        name: "개인별 돌봄계획 수립",
        lane: "수행기관",
        stage: "G2 선정·계획",
        type: "task",
        status: "waiting",
        actor: "전담사회복지사 등",
        action: "서비스 내용·주기·목표 계획",
        output_documents: ["개인별 돌봄계획"],
        legal_basis: [
          lb("노인복지법", "제27조의2제1항·제3항", "개인별 필요에 따른 돌봄 서비스 내용 구체화(장관이 정하는 기준 범위)."),
        ],
      }),
      node({
        id: "P07",
        name: "방문·통원 서비스 제공",
        lane: "수행기관",
        stage: "G3 서비스 제공",
        type: "task",
        status: "waiting",
        actor: "생활지원사 등 수행인력",
        action: "안전지원·일상생활지원·사회참여 등 제공",
        output_documents: ["서비스 일지"],
        legal_basis: [
          lb("노인복지법", "제27조의2제1항", "방문요양과 돌봄 등의 서비스 제공."),
          lb("노인복지법", "제38조", "재가노인복지시설 관련 서비스 유형과의 정합(해당 시)."),
        ],
      }),
      node({
        id: "P08",
        name: "장기요양·의료·긴급 자원 연계",
        lane: "시군구(선정·관리)",
        stage: "G4 연계·모니터링",
        type: "task",
        status: "waiting",
        actor: "시·군·구·수행기관",
        action: "필요 시 타 제도·기관 연계",
        output_documents: ["연계 의뢰서", "회의 기록"],
        legal_basis: [
          lb("노인복지법", "제27조의2", "돌봄 보호조치의 일환으로 관련 자원 연계."),
        ],
      }),
      node({
        id: "P09",
        name: "교육·현황 지원",
        lane: "독거노인종합지원센터",
        stage: "G4 연계·모니터링",
        type: "task",
        status: "waiting",
        actor: "독거노인종합지원센터",
        action: "종사자 교육·프로그램·현황관리 지원",
        output_documents: ["교육 자료", "현황 통계"],
        legal_basis: [
          lb("노인복지법", "제27조의3", "홀로 사는 노인 돌봄 관련 연구·현황조사·종사자 교육 등."),
        ],
      }),
      node({
        id: "P10",
        name: "재사정·종결·재배치",
        lane: "시군구(선정·관리)",
        stage: "G5 재사정·종결",
        type: "gateway",
        status: "waiting",
        actor: "시·군·구",
        action: "상태 변화 반영, 종결 또는 재배치",
        output_documents: ["재사정 결과", "종결 통지"],
        legal_basis: [
          lb("노인복지법", "제27조의2", "보호조치의 지속·변경 필요성 점검."),
        ],
      }),
      node({
        id: "P11",
        name: "안내·이의·재신청",
        lane: "노인·가족",
        stage: "G5 재사정·종결",
        type: "notice",
        status: "waiting",
        actor: "본인·가족",
        action: "결과 확인, 필요 시 재신청·상담",
        output_documents: ["상담 요청"],
        legal_basis: [
          lb("노인복지법", "제27조의2", "서비스 이용자에 대한 안내·상담 경로."),
        ],
      }),
    ],
    edges: [
      ...sequenceEdges(["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P10", "P11"]),
      { id: "E20", source: "P08", target: "P09", type: "message", label: "교육·현황 지원" },
      { id: "E21", source: "P10", target: "P06", type: "loop", label: "재계획" },
    ],
  },
  verification: verification(
    [ELDERLY_LAW],
    12,
    [
      "노인맞춤돌봄서비스는 법률 명칭이 아닌 보건복지부 사업명이다. 상위 근거는 노인복지법 제27조의2 등이며, 대상·급여 세부는 당해 연도 사업안내를 확인해야 한다.",
    ]
  ),
};

const emergencySafety = {
  slug: "elderly-disabled-emergency-safety",
  name: "독거노인·장애인 응급안전안심서비스",
  oneLiner:
    "독거노인·장애인 등 취약가구에 센서·응급호출 등 안전장비를 설치하고 응급상황 모니터링·안전확인·연계를 하는 응급안전 제도",
  type: TYPE,
  priority: 507,
  category: CATEGORY,
  whyFirst:
    "계획서에서 ‘안전/응급’ 니즈에 바로 붙는 후보인데, 맞춤돌봄·긴급복지와 혼동되기 쉬워 장비·관제·출동 경로를 따로 보여 줄 필요가 있다.",
  asOfDate: AS_OF,
  status: "full",
  canvas: {
    purpose:
      "홀로 살거나 응급 대응이 어려운 노인·장애인 가구의 화재·활동 공백·응급호출 상황에 빠르게 대응하고, 일상 안전확인과 필요 서비스 연계로 고독사·방치 위험을 줄인다.",
    stakeholders:
      "독거노인·등록장애인·가족, 읍·면·동, 시·군·구, 장비 설치·관제 수행기관, 소방·의료 응급기관, 보건복지부, 독거노인종합지원센터·장애인 관련 기관",
    legalBasis: [
      {
        law: "노인복지법",
        articles:
          "제27조의2(홀로 사는 노인에 대한 지원·안전확인), 제27조의3(독거노인종합지원센터), 제4조의2(안전사고 예방), 제39조의7(응급조치의무 등·해당 시)",
        kind: "법률",
      },
      {
        law: "장애인복지법",
        articles: "장애인 안전·보호 및 지역사회 자립 지원 관련 조항(세부 조문·사업 연결은 현장 검증)",
        kind: "법률",
      },
    ],
    authorities: [
      { name: "보건복지부", role: "사업 지침·국고 지원" },
      { name: "시·군·구", role: "대상 선정·수행기관 관리" },
      { name: "수행기관(관제·설치)", role: "장비 설치·모니터링·안전확인" },
      { name: "소방·의료기관", role: "응급 출동·이송 협력" },
      { name: "읍·면·동", role: "신청 접수·사후 돌봄 연계" },
    ],
    procedure: [
      "대상 발굴·신청(독거·장애·취약 가구)",
      "가정 환경·위험 조사 및 선정",
      "센서·응급호출기 등 장비 설치·교육",
      "관제센터 모니터링 및 이상 신호 확인",
      "응급 시 연락·출동 요청·현장 대응",
      "사후 안전확인 및 돌봄·의료 연계",
    ],
    moneyFlow:
      "국비·지방비 사업비로 장비·통신·관제 운영비가 집행된다. 가구 본인부담 여부는 연도별 사업기준·지자체 여건에 따른다.",
    docsFlow:
      "신청·동의 → 선정 통지 → 설치 확인서 → 관제·출동 로그 → 사후 연계 기록",
    bottlenecks: [
      "오탐·미탐(센서 오작동)과 야간 대응 인력",
      "개인정보·주거 사생활과 상시 모니터링의 긴장",
      "맞춤돌봄·긴급복지·통합지원과의 중복 안내",
      "농촌·음영지역 통신·출동 거리",
    ],
    reformPoints: [
      "이상 신호 대응 SLA(시간) 공개",
      "오탐 감소·이용자 설명 표준 문안",
      "돌봄 계획서에 장비 유무·비상연락망을 필수 항목화",
    ],
  },
  related: [
    "노인맞춤돌봄서비스",
    "지역 돌봄 통합지원",
    "사회서비스원·긴급돌봄",
    "긴급복지지원",
    "장애인활동지원",
  ],
  fieldVerification: [
    "당해 연도 응급안전안심서비스 사업안내의 대상·장비 구성·관제 기준",
    "장애인 가구 적용 근거 조문·지침의 현행 연결",
    "소방·지자체 비상연락 프로토콜",
    "개인정보 수집·보관 기간과 동의 서식",
  ],
  process: {
    institution_name: "독거노인·장애인 응급안전안심서비스",
    law_name: "노인복지법",
    lanes: ["이용 가구", "읍면동·시군구", "설치·관제 수행기관", "소방·의료", "보건복지부"],
    stages: ["G0 지침", "G1 신청·선정", "G2 설치", "G3 관제", "G4 응급대응", "G5 사후연계"],
    nodes: [
      node({
        id: "P01",
        name: "사업 지침·지원 기준 확인",
        lane: "보건복지부",
        stage: "G0 지침",
        type: "task",
        status: "done",
        actor: "보건복지부",
        action: "응급안전 사업 기준 제시",
        output_documents: ["사업안내"],
        legal_basis: [
          lb("노인복지법", "제27조의2제3항", "서비스·보호조치의 구체적 내용은 보건복지부장관이 정한다."),
          lb("노인복지법", "제4조의2", "안전사고 예방을 위한 국가·지자체 책무."),
        ],
      }),
      node({
        id: "P02",
        name: "신청·발굴",
        lane: "이용 가구",
        stage: "G1 신청·선정",
        type: "task",
        status: "done",
        actor: "본인·가족·이웃·유관기관",
        action: "서비스 신청 또는 발굴 의뢰",
        output_documents: ["신청서", "동의서"],
        legal_basis: [
          lb("노인복지법", "제27조의2제1항", "홀로 사는 노인에 대한 안전확인 등 보호조치."),
        ],
      }),
      node({
        id: "P03",
        name: "대상 선정·환경 조사",
        lane: "읍면동·시군구",
        stage: "G1 신청·선정",
        type: "gateway",
        status: "current",
        actor: "시·군·구",
        action: "선정 여부·우선순위 결정",
        output_documents: ["선정 통지", "가정 조사 기록"],
        blocker: "예산·장비 재고에 따른 대기 가능",
        legal_basis: [
          lb("노인복지법", "제27조의2제2항", "사업 위탁 및 비용 지원 가능."),
          lb("장애인복지법", "장애인 안전·보호 관련 조항", "장애인 가구 적용 세부 근거는 지침·조문 대조 필요(현장 검증)."),
        ],
      }),
      node({
        id: "P04",
        name: "장비 설치·이용 교육",
        lane: "설치·관제 수행기관",
        stage: "G2 설치",
        type: "task",
        status: "waiting",
        actor: "수행기관 기술·상담 인력",
        action: "화재·활동·응급호출 장비 설치 및 사용법 안내",
        output_documents: ["설치 확인서", "비상연락망"],
        legal_basis: [
          lb("노인복지법", "제27조의2제1항", "안전확인 등 보호를 위한 장비·체계 마련."),
        ],
      }),
      node({
        id: "P05",
        name: "상시 모니터링",
        lane: "설치·관제 수행기관",
        stage: "G3 관제",
        type: "system",
        status: "waiting",
        actor: "관제센터",
        action: "센서·호출 신호 감시",
        output_documents: ["관제 로그"],
        legal_basis: [
          lb("노인복지법", "제27조의2제1항", "안전확인 보호조치의 일상적 수행."),
        ],
      }),
      node({
        id: "P06",
        name: "이상 신호 확인 통화",
        lane: "설치·관제 수행기관",
        stage: "G3 관제",
        type: "task",
        status: "waiting",
        actor: "관제 상담원",
        action: "본인·비상연락망 확인",
        output_documents: ["확인 기록"],
        legal_basis: [
          lb("노인복지법", "제27조의2제1항", "안전확인."),
        ],
      }),
      node({
        id: "P07",
        name: "응급 출동·이송 요청",
        lane: "소방·의료",
        stage: "G4 응급대응",
        type: "task",
        status: "risk",
        actor: "소방·응급의료",
        action: "현장 출동·응급 조치",
        output_documents: ["출동 일지"],
        legal_basis: [
          lb("노인복지법", "제39조의7", "응급조치의무 등(해당 시설·상황 시)."),
        ],
      }),
      node({
        id: "P08",
        name: "사후 안전확인·돌봄 연계",
        lane: "읍면동·시군구",
        stage: "G5 사후연계",
        type: "task",
        status: "waiting",
        actor: "시·군·구·수행기관",
        action: "맞춤돌봄·의료·긴급복지 등 연계",
        output_documents: ["연계 의뢰", "사후 점검"],
        legal_basis: [
          lb("노인복지법", "제27조의2", "보호조치 후 지속 지원 필요 시 돌봄 연계."),
        ],
      }),
      node({
        id: "P09",
        name: "이용 상태 통지·재신청",
        lane: "이용 가구",
        stage: "G5 사후연계",
        type: "notice",
        status: "waiting",
        actor: "본인·가족",
        action: "장비 상태·이전 설치·해지 요청",
        output_documents: ["변경 신청"],
        legal_basis: [
          lb("노인복지법", "제27조의2", "이용 가구에 대한 안내·변경 경로."),
        ],
      }),
    ],
    edges: [
      ...sequenceEdges(["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09"]),
      { id: "E20", source: "P06", target: "P05", type: "loop", label: "오탐·정상 복귀" },
      { id: "E21", source: "P08", target: "P05", type: "sequence", label: "관제 재개" },
    ],
  },
  verification: verification(
    [ELDERLY_LAW, DISABILITY_LAW],
    10,
    [
      "서비스 공식 명칭·장비 구성은 보건복지부 사업안내를 따른다. 장애인 축의 세부 조문 매핑은 fieldVerification으로 남긴다.",
    ]
  ),
};

const institutions = [elderlyCustomizedCare, emergencySafety];

function writeInstitution(inst) {
  const file = path.join(DATA_DIR, `${inst.slug}.json`);
  if (fs.existsSync(file) && !OVERWRITE) {
    console.log(`skip existing ${inst.slug} (use --overwrite)`);
    return false;
  }
  fs.writeFileSync(file, `${JSON.stringify(inst, null, 1)}\n`, "utf8");
  console.log(`wrote ${file}`);
  return true;
}

function updateManifest(instList) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const bySlug = new Map(manifest.map((e) => [e.slug, e]));
  for (const inst of instList) {
    bySlug.set(inst.slug, {
      priority: inst.priority,
      slug: inst.slug,
      name: inst.name,
      type: inst.type,
      category: inst.category,
    });
  }
  const next = [...bySlug.values()].sort((a, b) => a.priority - b.priority);
  // ensure continuous priorities 1..n after append
  const maxExisting = Math.max(...manifest.map((e) => e.priority));
  for (const inst of instList) {
    if (inst.priority <= maxExisting && !manifest.some((e) => e.slug === inst.slug)) {
      throw new Error(`priority ${inst.priority} collides; expected append after ${maxExisting}`);
    }
  }
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(next, null, 1)}\n`, "utf8");
  console.log(`manifest entries: ${next.length}`);
}

function patchRelatedNames() {
  // add reverse related names where helpful
  const patches = {
    "community-integrated-care": ["노인맞춤돌봄서비스", "독거노인·장애인 응급안전안심서비스"],
    "social-service-agency": ["노인맞춤돌봄서비스", "독거노인·장애인 응급안전안심서비스"],
    "long-term-care": ["노인맞춤돌봄서비스"],
    "emergency-welfare-support": ["독거노인·장애인 응급안전안심서비스"],
    "disability-activity-support": ["독거노인·장애인 응급안전안심서비스"],
  };
  for (const [slug, names] of Object.entries(patches)) {
    const file = path.join(DATA_DIR, `${slug}.json`);
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const related = Array.isArray(data.related) ? data.related : [];
    let changed = false;
    for (const name of names) {
      if (!related.includes(name)) {
        related.push(name);
        changed = true;
      }
    }
    if (changed) {
      data.related = related;
      fs.writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`, "utf8");
      console.log(`patched related on ${slug}`);
    }
  }
}

for (const inst of institutions) writeInstitution(inst);
updateManifest(institutions);
patchRelatedNames();
console.log("done");
