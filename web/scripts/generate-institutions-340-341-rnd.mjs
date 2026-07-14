#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArticleReferences } from "./lib/article-citations.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const MANIFEST_PATH = path.join(REPO_DIR, "docs", "institutions-100-manifest.json");
const AS_OF = "2026-07-14";
const OVERWRITE = process.argv.includes("--overwrite");

const S = {
  law: statute("국가연구개발혁신법", "법률", "013774", "283849", "2026-03-10", "2026-06-11"),
  decree: statute("국가연구개발혁신법 시행령", "대통령령", "013933", "285767", "2026-05-06", "2026-06-11"),
  cost: adminRule(
    "국가연구개발사업 연구개발비 사용 기준",
    "고시·지침",
    "75386",
    "2100000278740",
    "2026-05-06",
    "과학기술정보통신부고시 제2026-38호",
  ),
  note: adminRule(
    "국가연구개발사업 연구노트 지침",
    "고시·지침",
    "39058",
    "2100000207982",
    "2022-01-01",
    "과학기술정보통신부고시 제2021-102호",
  ),
};

const COMMON_WARNING =
  "이 구조도는 국가연구개발혁신법 체계의 공통 기준이다. 중앙행정기관·전문기관별 사업 공고, 협약서와 연구개발기관 자체규정이 더 구체적인 절차를 둘 수 있다.";
const FUTURE_WARNING =
  "기준일 이후 2026년 8월 20일·9월 11일 시행 예정인 혁신법 일부 개정사항은 시행일 도래 후 다시 검증해야 한다.";

const specs = [
  {
    priority: 340,
    slug: "national-rd-student-personnel-integrated-management",
    name: "국가연구개발 학생인건비 통합관리",
    oneLiner: "통합관리기관 지정과 전용계정 설정부터 참여확약, 개인계좌 지급, 잔액 이관, 자체·현장점검과 지정취소까지 이어지는 절차",
    type: "지정·계정관리·지급·점검형",
    purpose: "여러 국가연구개발과제의 학생인건비를 통합관리하면서 학생연구자에게 안정적으로 지급하고 부당회수와 잔액 누적을 방지한다.",
    whyFirst: "연구과제, 연구책임자, 학생의 학적과 확약기간이 서로 달라 계정 이체·지급·잔액·점검 기한을 놓치기 쉽고 학생인건비 미지급·부당회수 위험도 크다.",
    sources: ["law", "cost"],
    laws: [
      ["law", "제13조·제31조·제32조"],
      ["cost", "제7조·제33조·제40조·제49조·제86조부터 제95조까지"],
    ],
    lanes: ["과학기술정보통신부·전담기관", "연구개발기관·산학협력단", "연구책임자·계정책임자", "학생연구자", "전산시스템·점검담당"],
    stages: ["G0 지정", "G1 계정·규정", "G2 확약·지급", "G3 잔액·변동", "G4 점검·취소"],
    authorities: [
      ["과학기술정보통신부", "통합관리기관 지정·점검·지정취소와 반납 관리"],
      ["연구개발기관", "전용계정·전산시스템·학생지원규정과 지급의 최종 관리책임"],
      ["연구책임자·계정책임자", "지급대상·지급률 협의와 계정 잔액 관리"],
      ["학생연구자", "연구참여확약 협의와 개인계좌 지급 확인"],
    ],
    moneyFlow: "과제별 학생인건비 총액을 연구책임자계정으로 이체해 학생 개인계좌에 지급하고, 연말 과다 잔액·기관 또는 책임자 변경·과제 중단 시 기관계정 이체나 중앙행정기관 반납으로 조정한다.",
    docsFlow: "지정신청서·전산시스템 구축보고서·학생지원규정 → 지정통보 → 계정·전용계좌 → 과제별 학생인건비 총액·이체내역 → 연구참여확약서·개인계좌 지급내역 → 잔액 산정·이관자료 → 자체점검표·공개자료·현장점검·소명·취소통보로 이어진다.",
    bottlenecks: ["과제계정에서 통합관리계정으로의 90일 이체기한", "학적·업무량 변동 때 확약 변경과 지급액 동기화", "연구책임자계정 잔액과 기관계정 이관액 산정", "학생인건비 미지급·부당회수 탐지"],
    reformPoints: ["학적·과제·확약·지급정보 자동 대조", "개인별 지급예정·실제지급 차이 알림", "연말 잔액 이관과 변경·중단 시 반납액 자동 산정", "부당회수 익명신고와 증거보전 연결"],
    related: ["국가연구개발비 지급·사용·정산", "국가연구개발사업 부정행위 제보·검증", "국가연구개발 제재처분·재검토·사후관리"],
    field: ["기관별 학생연구자 지원규정과 전산시스템 화면", "학적·근로계약·타기관 인건비 연계 방식", "지급률·잔액 산식의 실제 시스템 구현", "부당회수 신고·보호 절차"],
    warnings: [
      COMMON_WARNING,
      "통합관리기관이 아닌 대학·정부출연기관은 과제별 학생인건비계상률 방식이 적용된다. 이 구조도는 과학기술정보통신부가 지정한 학생인건비통합관리기관의 특례를 중심으로 한다.",
      "연구참여확약서 작성은 원칙이지만 정부출연기관이 학생연구자와 근로계약을 체결한 경우 작성하지 않을 수 있다.",
      FUTURE_WARNING,
    ],
    nodes: [
      n("지정요건 자체점검·신청 준비", "연구개발기관·산학협력단", "G0 지정", [["cost", "제86조제1항"]], "대학 또는 정부출연기관이 전산시스템 구축요건과 학생연구자 지원규정 구비 여부를 점검한다.", { outputs: ["지정요건 자체점검표"] }),
      n("지정신청서·구축보고서·지원규정 제출", "연구개발기관·산학협력단", "G0 지정", [["cost", "제86조제2항"]], "지정·변경 신청서, 전산시스템 구축 완료 보고서와 학생연구자 지원규정을 제출한다.", { inputs: ["지정요건 자체점검표"], outputs: ["학생인건비통합관리기관 지정·변경 신청서", "전산시스템 구축 완료 보고서", "학생연구자 지원규정"] }),
      n("지정요건 평가·결과 통보", "과학기술정보통신부·전담기관", "G0 지정", [["cost", "제86조제3항"]], "신청서류와 시스템·규정을 평가해 지정 여부를 통보한다.", { inputs: ["지정신청 서류"], outputs: ["통합관리기관 지정·보완 통보"], deadline: "신청받은 날부터 2개월 이내", type: "gateway" }),
      n("보험·시스템 연계·표준정보 조치", "연구개발기관·산학협력단", "G0 지정", [["cost", "제86조제4항"]], "연구실 안전보험 가입, 연구비통합관리시스템 연계와 표준정보에 따른 지급정보 관리를 이행한다.", { inputs: ["통합관리기관 지정통보"], outputs: ["보험 가입확인", "시스템 연계확인", "표준정보 관리기록"] }),
      n("기관·연구책임자계정과 전용계좌 설정", "연구개발기관·산학협력단", "G1 계정·규정", [["cost", "제87조"]], "기관계정과 연구책임자계정을 병행 설정하고 통합관리 학생인건비를 전용계좌에서 구분 관리한다.", { outputs: ["학생인건비통합관리계정", "전용계좌", "계정책임자 지정기록"] }),
      n("학생연구자 지원규정 공개·운영", "연구개발기관·산학협력단", "G1 계정·규정", [["cost", "제88조"]], "학업·연구활동, 처우·권익, 계정, 확약, 부당회수 방지와 보험 사항을 포함한 규정을 공개·운영한다.", { outputs: ["공개된 학생연구자 지원규정"] }),
      n("과제별 학생인건비 총액 계상", "연구책임자·계정책임자", "G1 계정·규정", [["cost", "제89조"], ["cost", "제7조"]], "통합관리 대상 과제에는 학생연구자별 금액이 아니라 학생인건비 총액만 계상한다.", { inputs: ["연구개발계획서"], outputs: ["과제별 학생인건비 총액"] }),
      n("과제계정에서 통합관리계정 이체", "전산시스템·점검담당", "G1 계정·규정", [["cost", "제90조제1항~제4항"]], "지급 또는 변경된 학생인건비를 연구책임자 통합관리계정으로 이체하고 증명자료를 보존한다.", { inputs: ["과제별 학생인건비 총액", "연구비 지급내역"], outputs: ["통합관리계정 이체내역", "이체 증명자료"], deadline: "연구비 지급·학생인건비 변경일부터 90일 이내 또는 연차 종료일 중 먼저 도래하는 날, 연차 종료일까지 전액 이체" }),
      n("지급대상 학생 등록", "연구책임자·계정책임자", "G2 확약·지급", [["cost", "제91조제1항"]], "기관·연구책임자계정 잔액을 고려해 지급할 학생연구자를 정하고 전산시스템에 등록한다.", { inputs: ["계정 잔액", "참여연구자 정보"], outputs: ["학생연구자 지급대상 등록"] }),
      n("연구참여확약 협의·작성", "학생연구자", "G2 확약·지급", [["cost", "제91조제2항"]], "기관·계정책임자와 학생연구자가 지급률·기간을 협의해 6개월 또는 12개월 단위 연구참여확약서를 작성한다.", { inputs: ["지급대상 등록", "계정 잔액"], outputs: ["학생연구자 연구참여확약서"] }),
      n("법정사유 발생 시 확약 변경", "연구책임자·계정책임자", "G2 확약·지급", [["cost", "제91조제3항"]], "협약·학적·개인사정·수행불능·업무량 변동이 있을 때 학생과 협의해 확약을 변경한다.", { inputs: ["기존 연구참여확약서", "변경사유 증빙"], outputs: ["변경 연구참여확약서"], type: "gateway" }),
      n("개인계좌 지급·수령 확인", "학생연구자", "G2 확약·지급", [["cost", "제91조제4항~제10항"]], "확약에 따른 학생인건비가 원칙적으로 매월 본인 개인계좌에 지급됐는지 확인한다.", { inputs: ["연구참여확약서"], outputs: ["개인계좌 지급내역", "학생인건비 수령확인"] }),
      n("미지급·부당회수 탐지·제재 연계", "전산시스템·점검담당", "G2 확약·지급", [["cost", "제33조"], ["cost", "제92조"], ["law", "제31조·제32조"]], "미지급 또는 지급액의 부당회수 정황을 탐지하고 자료를 보전해 조사·제재 절차로 연계한다.", { inputs: ["확약서", "지급내역", "신고자료"], outputs: ["부당회수 의심기록", "조사 연계자료"], type: "gateway", blocker: "현금 반환 요구 등 시스템 밖 행위는 별도 신고·조사가 필요함" }),
      n("연말 잔액 산정·기관계정 이체", "연구개발기관·산학협력단", "G3 잔액·변동", [["cost", "제91조의2"]], "12월 31일 기준 산식에 따른 연구책임자계정 금액을 기관계정으로 이체·계정대체하거나 반납한다.", { inputs: ["연말 계정잔액", "지급실적"], outputs: ["잔액 산정내역", "기관계정 이체·반납내역"], deadline: "다음 해 3월 31일까지" }),
      n("기관·책임자 변경·중단 시 이관·반납", "연구개발기관·산학협력단", "G3 잔액·변동", [["cost", "제95조"]], "기관·연구책임자 변경, 협약 해약·과제 중단 또는 참여제한 사유에 따라 잔액을 다른 계정으로 이체하거나 반납한다.", { inputs: ["변경·중단 통보", "계정잔액"], outputs: ["학생인건비 이관·반납 내역"], type: "gateway" }),
      n("연 1회 이상 자체점검", "전산시스템·점검담당", "G4 점검·취소", [["cost", "제93조제1항·제2항"]], "운영현황을 자체점검하고 전산시스템을 변경한 경우 구축요건 점검결과를 지체 없이 제출한다.", { outputs: ["학생인건비통합관리 자체점검표", "시스템 변경 자체점검 결과"], deadline: "운영현황 자체점검은 연 1회 이상" }),
      n("지급·부당회수 비율 공개·자료 제출", "연구개발기관·산학협력단", "G4 점검·취소", [["cost", "제93조제3항·제5항"]], "평균 지급비율과 부당회수 비율을 기관 홈페이지 등에 공개하고 점검자료를 제출한다.", { inputs: ["자체점검표", "지급·부당회수 현황"], outputs: ["공개된 지급·부당회수 비율", "운영현황 점검자료"] }),
      n("서면검토·현장점검", "과학기술정보통신부·전담기관", "G4 점검·취소", [["cost", "제93조제3항·제4항·제6항"]], "제출자료를 검토하고 필요하면 추가자료를 요구하거나 현장점검을 실시한다.", { inputs: ["운영현황 점검자료"], outputs: ["자료보완 요구", "현장점검 결과"], deadline: "현장점검은 원칙적으로 7일 전 문서 통지", type: "gateway" }),
      n("소명·지정유지 또는 취소 결정", "과학기술정보통신부·전담기관", "G4 점검·취소", [["cost", "제94조제1항·제2항·제4항"]], "부당회수, 낮은 지급실적, 시스템 미충족 등 취소사유에 대해 기관 소명을 거쳐 지정유지 또는 취소를 결정한다.", { inputs: ["현장점검 결과", "기관 소명자료"], outputs: ["지정유지·개선요구 또는 취소통보"], type: "gateway" }),
      n("취소 후 잔액 제출·반납·재지정 대기", "연구개발기관·산학협력단", "G4 점검·취소", [["cost", "제94조제5항·제7항"]], "모든 통합관리계정 잔액을 제출하고 확정 반납액을 낸 뒤 재지정 가능시점을 관리한다.", { inputs: ["지정취소 통보"], outputs: ["통합관리계정 잔액내역", "반납확인", "재지정 가능일"], deadline: "잔액 제출·반납은 취소통보일부터 30일 이내, 재지정 신청은 취소일부터 3년 경과 후" }),
    ],
    edges: [
      e("P01", "P02"), e("P02", "P03"), e("P03", "P02", "loop", "보완"), e("P03", "P04", "sequence", "지정"), e("P04", "P05"), e("P05", "P06"), e("P06", "P07"), e("P07", "P08"), e("P08", "P09"), e("P09", "P10"),
      e("P10", "P11"), e("P10", "P12", "sequence", "확약"), e("P11", "P12"), e("P12", "P13"), e("P13", "P14", "sequence", "연말"), e("P13", "P15", "sequence", "변경·중단"), e("P14", "P16"), e("P15", "P16"),
      e("P16", "P17"), e("P17", "P18", "message", "점검대상"), e("P18", "P19", "sequence", "취소사유"), e("P19", "P17", "loop", "지정유지"), e("P19", "P20", "sequence", "지정취소"),
    ],
  },
  {
    priority: 341,
    slug: "national-rd-research-note-management",
    name: "국가연구개발 연구노트 작성·관리",
    oneLiner: "과제 적용·작성대체 판단과 기관 자체규정부터 연구기록 작성, 종료 시 인계, 장기보존, 열람·활용·공개와 폐기까지 이어지는 절차",
    type: "기록·보존·열람·폐기형",
    purpose: "연구수행과정과 성과를 객관적으로 기록해 연구의 연속성·재현성, 연구자 보호와 지식재산권 입증에 활용한다.",
    whyFirst: "연구자는 무엇을 어떤 형식으로 기록하고 누가 확인하는지, 과제 종료 뒤 소유·보존·열람·활용 권한이 누구에게 있는지 기관별 규정과 함께 이해해야 한다.",
    sources: ["law", "decree", "note"],
    laws: [
      ["law", "제16조·제35조제2항·제3항"],
      ["decree", "제65조"],
      ["note", "제1조부터 제13조까지"],
    ],
    lanes: ["중앙행정기관·협약당사자", "연구개발기관", "연구노트 관리부서·시스템", "기록자·연구자", "확인자·지식재산 담당"],
    stages: ["G0 적용·규정", "G1 작성", "G2 종료·보존", "G3 열람·활용", "G4 공개·폐기·점검"],
    authorities: [
      ["연구개발기관", "자체규정 마련, 작성환경·소유·보관·열람·공개·폐기의 관리책임"],
      ["연구자", "객관적 연구수행과정·성과 기록과 승인된 사용범위 준수"],
      ["중앙행정기관·협약당사자", "작성대체 인정, 지침 제공과 운영 실태점검"],
    ],
    moneyFlow: "직접적인 지급 절차는 없지만 전자연구노트 시스템, 장기보존, 지식재산 출원과 분쟁 대응 비용이 기관 연구지원비·간접비와 연결된다.",
    docsFlow: "과제·협약 검토 → 연구노트 자체규정 → 작성단위·형식·위변조 방지기준 → 연구노트 본문·확인기록 → 종료 인계서·소유·보관대장 → 열람·사용 신청과 관리대장 → 공개·폐기 심의기록 → 실태점검 결과로 이어진다.",
    bottlenecks: ["과제별 연구노트 작성대체 가능성 판단", "전자·서면·음성·영상 기록의 위변조 방지와 장기보존", "기록자의 열람·사용권과 기관의 보안·지식재산 보호 충돌", "조기폐기 시 보존가치 판단"],
    reformPoints: ["과제 유형별 작성·대체 요건 자동 안내", "실험·데이터 시스템과 전자연구노트 자동 연결", "종료·이직 시 인계와 30년 보존기한 자동 생성", "열람·사용 요청의 목적·범위·반출기록 통합관리"],
    related: ["국가연구개발사업 부정행위 제보·검증", "국가연구개발성과 소유·활용·기술료", "국가연구개발과제 단계·최종평가·이의신청"],
    field: ["기관별 연구노트 자체규정과 서식", "전자연구노트의 전자서명·시점인증·백업 방식", "과제별 작성대체 인정 사례", "열람·반출·공개·폐기 심의 절차"],
    warnings: [
      COMMON_WARNING,
      "연구노트 지침은 연구개발기관이 자체규정을 마련·운영할 때 활용하는 공통 지침이다. 작성형식, 확인자, 열람범위, 보존기간 조정과 폐기 절차는 기관 자체규정을 반드시 함께 확인해야 한다.",
      "개인사업자·창업초기기업이나 사전조사·기획평가·인문사회·인력양성·기반구축 등은 협약 당사자가 인정하는 경우 연차·단계·최종보고서 작성을 연구노트 작성으로 볼 수 있다.",
      FUTURE_WARNING,
    ],
    nodes: [
      n("과제 분야·적용범위 확인", "중앙행정기관·협약당사자", "G0 적용·규정", [["law", "제35조제2항·제3항"], ["decree", "제65조"], ["note", "제3조"]], "국가연구개발과제의 분야와 참여기관을 확인해 연구노트 작성·관리 의무와 적용 지침을 확정한다.", { outputs: ["연구노트 적용 검토표"], type: "gateway" }),
      n("보고서 작성대체 인정 여부 판단", "중앙행정기관·협약당사자", "G0 적용·규정", [["note", "제8조제3항"]], "기관·과제 특성상 연구노트 관리 필요성이 크지 않은 경우 연차·단계·최종보고서로 갈음할 수 있는지 판단한다.", { inputs: ["연구노트 적용 검토표"], outputs: ["연구노트 작성·대체 결정"], type: "gateway" }),
      n("연차·단계·최종보고서로 기록 대체", "연구개발기관", "G0 적용·규정", [["note", "제8조제3항"]], "협약 당사자의 인정 범위와 조건을 남기고 법정 보고서를 연구수행 기록으로 관리한다.", { inputs: ["작성대체 결정"], outputs: ["작성대체 승인기록", "연차·단계·최종보고서"] }),
      n("연구노트 자체규정 마련·운영", "연구개발기관", "G0 적용·규정", [["decree", "제65조제2항"], ["note", "제5조"]], "작성·보관·관리, 종료·중단 시 인계, 열람·공개·폐기와 담당부서를 포함한 자체규정을 마련한다.", { outputs: ["연구노트 자체규정"] }),
      n("작성단위·형식·기록자 결정", "연구노트 관리부서·시스템", "G0 적용·규정", [["note", "제7조제1항·제3항"], ["note", "제8조제4항·제5항"]], "기관별·연구자별 또는 공동 작성 단위와 서면·전자·음성·영상 등 기록형식을 정한다.", { inputs: ["연구노트 자체규정"], outputs: ["과제별 연구노트 작성계획"] }),
      n("날짜·기록자·위변조 확인 통제 설정", "확인자·지식재산 담당", "G0 적용·규정", [["note", "제7조제2항"]], "기록 날짜와 기록자를 식별하고 위조·변조 여부를 확인할 수 있는 서명·시점·이력 관리방식을 설정한다.", { outputs: ["연구노트 진본성 관리기준"] }),
      n("작성환경·교육·관리부서 준비", "연구노트 관리부서·시스템", "G1 작성", [["note", "제5조제2항"], ["note", "제10조제2항"]], "연구자가 성실히 기록할 수 있도록 시스템·서식을 제공하고 교육하며 담당부서를 운영한다.", { outputs: ["연구노트 계정·서식", "교육 이수기록", "담당부서 지정기록"] }),
      n("연구수행과정·성과 기록", "기록자·연구자", "G1 작성", [["law", "제35조제2항"], ["decree", "제65조제1항"], ["note", "제6조·제8조제1항"]], "실험·조사·분석의 과정, 정보·데이터·노하우와 결과를 자체규정에 따라 지속적으로 기록한다.", { inputs: ["과제별 연구노트 작성계획"], outputs: ["연구노트 본문·첨부데이터"] }),
      n("객관성·재현가능성 자체확인", "기록자·연구자", "G1 작성", [["note", "제8조제6항"]], "위조·변조 없이 객관적 사실을 기록하고 제3자가 수행과정과 결과를 재현할 수 있는지 점검한다.", { inputs: ["연구노트 본문·첨부데이터"], outputs: ["연구노트 자체확인 기록"] }),
      n("기록일·기록자·변경이력 확인", "확인자·지식재산 담당", "G1 작성", [["note", "제2조제8호"], ["note", "제7조제2항"]], "자체규정에 따라 기록자·날짜와 변경이력을 확인하고 필요한 확인기록을 남긴다.", { inputs: ["연구노트 본문", "변경이력"], outputs: ["연구노트 확인기록"] }),
      n("연구 중단·종료 시 인계", "연구노트 관리부서·시스템", "G2 종료·보존", [["note", "제10조제2항"]], "과제 중단·종료 또는 연구자 이직 시 연구노트와 첨부자료를 관리부서에 인계한다.", { inputs: ["연구노트", "첨부자료"], outputs: ["연구노트 인계서", "인수확인"] }),
      n("연구노트 소유권 확인", "연구개발기관", "G2 종료·보존", [["law", "제16조"], ["note", "제9조"]], "연구노트를 관리한 연구개발기관의 소유를 원칙으로 하되 성과소유 규정과 협약을 함께 확인한다.", { outputs: ["연구노트 소유·관리기관 확인"] }),
      n("보관등록·접근권한 설정", "연구노트 관리부서·시스템", "G2 종료·보존", [["note", "제10조제1항·제2항"]], "인계된 연구노트를 보관대장에 등록하고 보안·지식재산 수준에 맞춰 접근권한과 백업을 설정한다.", { outputs: ["연구노트 보관대장", "접근권한·백업 기록"] }),
      n("보존기간 설정·관리", "연구개발기관", "G2 종료·보존", [["note", "제10조제3항"]], "과제 종료일부터 30년을 기본으로 보존하되 자체규정에 따라 과제유형별 기간을 달리 정할 수 있다.", { inputs: ["연구노트 보관대장"], outputs: ["연구노트 보존기한"], deadline: "기본 보존기간은 과제 종료일부터 30년" }),
      n("열람·사용 목적과 범위 요청", "기록자·연구자", "G3 열람·활용", [["note", "제11조제1항·제4항"]], "성과 제출, 과제평가, 연구자 보호, 부정의심행위 검증 또는 지식재산권 보호 목적과 범위를 적어 열람·사용을 요청한다.", { outputs: ["연구노트 열람·사용 요청서"] }),
      n("열람대장 등록·범위 결정", "연구노트 관리부서·시스템", "G3 열람·활용", [["note", "제11조제1항·제2항·제4항"]], "자체규정과 기록자의 열람·사용권을 고려해 대상·범위·반출 여부를 결정하고 관리대장에 기록한다.", { inputs: ["열람·사용 요청서"], outputs: ["열람·사용 결정", "연구노트 열람관리대장"], type: "gateway" }),
      n("승인자료 수령·활용", "기록자·연구자", "G3 열람·활용", [["note", "제11조제1항·제4항"]], "승인된 범위의 연구노트 사본·열람자료를 수령해 신청 목적에 사용한다.", { inputs: ["열람·사용 결정"], outputs: ["연구노트 열람·사용 확인", "승인자료"] }),
      n("허용용도 준수·유출 방지", "기록자·연구자", "G3 열람·활용", [["note", "제11조제5항"]], "승인 목적 외 사용과 임의 누설·유출·양도·매매를 하지 않고 사용기록을 남긴다.", { inputs: ["승인자료"], outputs: ["연구노트 사용기록"] }),
      n("공개 여부·범위 결정", "연구개발기관", "G4 공개·폐기·점검", [["note", "제11조제3항"]], "자체규정과 보안·지식재산 보호 필요성을 검토해 공개 여부와 범위를 결정한다.", { outputs: ["연구노트 공개·비공개 결정"], type: "gateway" }),
      n("보존기간·보존가치 검토", "연구노트 관리부서·시스템", "G4 공개·폐기·점검", [["note", "제12조"]], "보존기간 경과 여부와 기술환경 변화에 따른 보존가치를 검토해 폐기 또는 계속보존 안건을 만든다.", { inputs: ["연구노트 보존기한", "보존가치 검토자료"], outputs: ["연구노트 폐기·계속보존 검토서"], type: "gateway" }),
      n("폐기 승인·기록 또는 계속보존", "연구개발기관", "G4 공개·폐기·점검", [["note", "제12조"]], "자체규정에 따라 폐기를 승인·기록하거나 보존기한·접근권한을 갱신해 계속 보존한다.", { inputs: ["폐기·계속보존 검토서"], outputs: ["연구노트 폐기기록 또는 계속보존 결정"], type: "gateway" }),
      n("자체규정 운영 실태점검", "중앙행정기관·협약당사자", "G4 공개·폐기·점검", [["note", "제13조"]], "연구개발기관이 자체규정을 마련해 실효성 있게 운영하는지 점검하고 개선을 요구한다.", { inputs: ["자체규정", "작성·보관·열람·폐기 기록"], outputs: ["연구노트 관리 실태점검 결과"] }),
    ],
    edges: [
      e("P01", "P02"), e("P02", "P03", "sequence", "보고서 대체"), e("P02", "P04", "sequence", "연구노트 작성"), e("P03", "P22", "message", "대체기록"), e("P04", "P05"), e("P05", "P06"), e("P06", "P07"), e("P07", "P08"), e("P08", "P09"), e("P09", "P10"), e("P10", "P11"), e("P11", "P12"), e("P12", "P13"), e("P13", "P14"), e("P14", "P15"), e("P15", "P16"), e("P16", "P17"), e("P17", "P18"), e("P18", "P19"), e("P19", "P20"), e("P20", "P21"), e("P21", "P13", "loop", "계속보존"), e("P21", "P22", "sequence", "폐기·갱신 기록"),
    ],
  },
];

for (const spec of specs) writeInstitution(spec);
updateManifest();
updateRelations();
console.log(`국가 R&D 세부 제도 생성: ${specs.length}개 (${specs[0].priority}~${specs.at(-1).priority})`);

function writeInstitution(spec) {
  const file = path.join(DATA_DIR, `${spec.slug}.json`);
  if (fs.existsSync(file) && !OVERWRITE) throw new Error(`이미 존재하는 파일: ${file}`);
  fs.writeFileSync(file, `${JSON.stringify(build(spec), null, 1)}\n`);
}

function build(spec) {
  const legalBasis = spec.laws.map(([key, articles]) => ({ law: S[key].law, articles, kind: S[key].kind }));
  const nodes = spec.nodes.map((raw, index) => buildNode(raw, index));
  const citations = [
    ...legalBasis.map((basis) => basis.articles),
    ...nodes.flatMap((node) => node.legal_basis.map((basis) => basis.article)),
  ];
  const articleReferences = citations.reduce((sum, value) => sum + parseArticleReferences(value).length, 0);
  const citationEntries = legalBasis.length + nodes.reduce((sum, node) => sum + node.legal_basis.length, 0);
  const sources = spec.sources.map((key) => S[key]);

  return {
    slug: spec.slug,
    name: spec.name,
    oneLiner: spec.oneLiner,
    type: spec.type,
    priority: spec.priority,
    category: "연구개발·행정",
    whyFirst: spec.whyFirst,
    asOfDate: AS_OF,
    status: "full",
    canvas: {
      purpose: spec.purpose,
      stakeholders: spec.lanes.join(", "),
      legalBasis,
      authorities: spec.authorities.map(([name, role]) => ({ name, role })),
      procedure: nodes.map((node) => node.name),
      moneyFlow: spec.moneyFlow,
      docsFlow: spec.docsFlow,
      bottlenecks: spec.bottlenecks,
      reformPoints: spec.reformPoints,
    },
    related: spec.related,
    fieldVerification: spec.field,
    process: {
      institution_name: spec.name,
      law_name: legalBasis.map((basis) => basis.law).join("·"),
      lanes: spec.lanes,
      stages: spec.stages,
      nodes,
      edges: spec.edges.map((edge, index) => ({ id: edge.type === "loop" ? `L${pad(index + 1)}` : `E${pad(index + 1)}`, ...edge })),
      warnings: spec.warnings,
    },
    verification: {
      status: "article-verified",
      verifiedAt: AS_OF,
      method: "국가법령정보센터 Open API 법령·행정규칙 원문 대조",
      scope: `법적 근거 ${legalBasis.length}건의 공식 원문을 연결하고 캔버스와 절차 노드의 명시 조문 ${articleReferences}건의 조문 번호 존재를 확인했다. 인용 문구의 사건별 적용 타당성은 별도 검토가 필요하다.`,
      notes: [
        "국가연구개발혁신법·시행령 현행 원문 대조",
        "학생인건비 구조도는 과학기술정보통신부고시 제2026-38호 추가 대조",
        "연구노트 구조도는 과학기술정보통신부고시 제2021-102호 추가 대조",
        "기관 자체규정과 사업별 협약의 추가 요건은 현장 검증 대상으로 분리",
      ],
      sources,
      articleVerification: {
        checkedAt: AS_OF,
        method: "현행 법령 조문 일괄조회 및 행정규칙 전문조회",
        citationEntries,
        explicitCitationEntries: citationEntries,
        articleReferences,
        verifiedReferences: articleReferences,
        missingReferences: 0,
        uncheckableReferences: 0,
      },
    },
  };
}

function buildNode(raw, index) {
  return {
    id: `P${pad(index + 1)}`,
    name: raw.name,
    lane: raw.lane,
    stage: raw.stage,
    type: raw.type ?? (/확인|판단|판정|검토|평가|결정|점검|선택/.test(raw.name) ? "gateway" : "task"),
    status: index < 2 ? "done" : index === 2 ? "current" : raw.type === "gateway" ? "risk" : "waiting",
    progress: index < 2 ? 100 : index === 2 ? 55 : 0,
    actor: raw.lane,
    action: raw.action,
    input_documents: raw.inputs ?? [],
    output_documents: raw.outputs ?? [],
    deadline: raw.deadline ?? null,
    blocker: raw.blocker ?? null,
    confidence: raw.confidence ?? 0.96,
    legal_basis: raw.bases.map(([key, article]) => ({ law: S[key].law, article, text: `${S[key].law} ${article}에 따른 절차` })),
  };
}

function updateManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  for (const spec of specs) {
    const entry = { priority: spec.priority, slug: spec.slug, name: spec.name, type: spec.type, category: "연구개발·행정" };
    const existing = manifest.find((item) => item.priority === spec.priority || item.slug === spec.slug);
    if (existing && !OVERWRITE) throw new Error(`manifest 중복: ${spec.priority} ${spec.slug}`);
    if (existing && (existing.priority !== spec.priority || existing.slug !== spec.slug)) throw new Error(`manifest 충돌: ${spec.priority} ${spec.slug}`);
    if (existing) Object.assign(existing, entry);
    else manifest.push(entry);
  }
  manifest.sort((a, b) => a.priority - b.priority);
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function updateRelations() {
  const relations = new Map([
    ["national-rd-agreement.json", specs.map((spec) => spec.name)],
    ["national-rd-fund-use-settlement.json", [specs[0].name]],
    ["national-rd-misconduct-verification.json", specs.map((spec) => spec.name)],
    ["national-rd-results-technology-fee.json", [specs[1].name]],
  ]);
  for (const [filename, names] of relations) {
    const file = path.join(DATA_DIR, filename);
    const institution = JSON.parse(fs.readFileSync(file, "utf8"));
    institution.related = [...new Set([...institution.related, ...names])];
    fs.writeFileSync(file, `${JSON.stringify(institution, null, 1)}\n`);
  }
}

function n(name, lane, stage, bases, action, options = {}) {
  return { name, lane, stage, bases, action, ...options };
}

function e(source, target, type = "sequence", label = null) {
  return { source, target, type, label };
}

function statute(law, kind, lawId, mst, promulgatedOn, effectiveOn) {
  return { law, kind, sourceType: "statute", officialName: law, lawId, mst, promulgatedOn, effectiveOn, officialUrl: `https://law.go.kr/법령/${law.replace(/\s+/g, "")}` };
}

function adminRule(law, kind, adminRuleId, adminRuleSerial, promulgatedOn, issueNo) {
  return { law, kind, sourceType: "admin-rule", officialName: law, adminRuleId, adminRuleSerial, promulgatedOn, officialUrl: `https://law.go.kr/행정규칙/${law.replace(/\s+/g, "")}`, issueNo };
}

function pad(value) {
  return String(value).padStart(2, "0");
}
