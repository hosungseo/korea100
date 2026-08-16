#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const MANIFEST_PATH = path.join(REPO_DIR, "docs", "institutions-100-manifest.json");
const AS_OF = "2026-08-17";
const OVERWRITE = process.argv.includes("--overwrite");

function statute(law, lawId, mst, promulgatedOn, effectiveOn, urlName) {
  return {
    law,
    kind: "법률",
    sourceType: "statute",
    officialName: law,
    lawId,
    mst,
    promulgatedOn,
    effectiveOn,
    officialUrl: "https://law.go.kr/법령/" + urlName,
  };
}

const S = {
  militaryNoise: statute("군용비행장ㆍ군사격장 소음 방지 및 피해 보상에 관한 법률", "013608", "276303", "2025-10-01", "2025-10-01", "군용비행장군사격장소음방지및피해보상에관한법률"),
  undergroundSafety: statute("지하안전관리에 관한 특별법", "012468", "271251", "2025-05-27", "2025-05-27", "지하안전관리에관한특별법"),
  constructionTech: statute("건설기술 진흥법", "001807", "276921", "2025-10-01", "2025-10-01", "건설기술진흥법"),
  waste: statute("폐기물관리법", "001771", "276797", "2025-10-01", "2026-03-26", "폐기물관리법"),
  chemicalRegistration: statute("화학물질의 등록 및 평가 등에 관한 법률", "011857", "279805", "2025-11-11", "2026-05-12", "화학물질의등록및평가등에관한법률"),
  groundwater: statute("지하수법", "000262", "276791", "2025-10-01", "2025-10-01", "지하수법"),
  sewerage: statute("하수도법", "001815", "276803", "2025-10-01", "2025-10-01", "하수도법"),
  airRegion: statute("대기관리권역의 대기환경개선에 관한 특별법", "013458", "276713", "2025-10-01", "2025-10-01", "대기관리권역의대기환경개선에관한특별법"),
  nuclearSafety: statute("원자력안전법", "011435", "286119", "2026-05-19", "2026-05-19", "원자력안전법"),
  developmentGains: statute("개발이익 환수에 관한 법률", "001829", "286507", "2026-06-02", "2026-06-02", "개발이익환수에관한법률"),
  industrialCluster: statute("산업집적활성화 및 공장설립에 관한 법률", "001463", "286569", "2026-06-02", "2026-06-02", "산업집적활성화및공장설립에관한법률"),
  road: statute("도로법", "001821", "280119", "2025-12-02", "2026-06-03", "도로법"),
};

function step(name, lane, stage, sourceKey, articles, outputDocuments, extra = {}) {
  return { name, lane, stage, sourceKey, articles, outputDocuments, ...extra };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function buildNode(raw, index) {
  const source = S[raw.sourceKey];
  const status = index < 2 ? "done" : index === 2 ? "current" : "waiting";
  return {
    id: "P" + pad(index + 1),
    name: raw.name,
    lane: raw.lane,
    stage: raw.stage,
    type: raw.type ?? "task",
    status,
    progress: status === "done" ? 100 : status === "current" ? 40 : 0,
    actor: raw.actor ?? raw.lane,
    action: raw.action ?? raw.name + "에 필요한 적용요건과 자료를 확인하고 법정 산출물을 다음 담당기관에 인계한다.",
    output_documents: raw.outputDocuments,
    confidence: raw.confidence ?? 0.9,
    legal_basis: raw.articles.map((article) => ({
      law: source.law,
      article,
      text: source.law + " " + article + "에 따른 절차와 산출물. 세부 문턱ㆍ서식ㆍ기한은 현행 하위법령과 고시를 함께 확인한다.",
    })),
  };
}

function sequenceEdges(nodeCount, extras = []) {
  const edges = [];
  for (let index = 1; index < nodeCount; index += 1) {
    edges.push({ id: "E" + pad(index), source: "P" + pad(index), target: "P" + pad(index + 1), type: "sequence", label: null });
  }
  extras.forEach(([source, target, type, label], index) => {
    edges.push({ id: (type === "loop" ? "L" : "M") + pad(index + 1), source, target, type, label });
  });
  return edges;
}

const specs = [
  {
    priority: 545,
    slug: "military-airfield-noise-measures-compensation",
    name: "군용비행장 소음대책지역·저감·보상",
    oneLiner: "군용비행장 소음영향도 조사부터 소음대책지역 지정·고시, 기본·시행계획, 자동측정망, 보상금 신청·결정·이의절차까지의 경로",
    type: "군공항 소음대책·보상형",
    category: "국방·보훈·병무",
    whyFirst: "대체 군공항은 건설·이전 승인과 별개로 주변지역 소음영향 조사, 대책지역 지정, 저감계획과 보상 산출물이 필요하다.",
    sourceKeys: ["militaryNoise"],
    legalArticles: { militaryNoise: "제5조·제7조·제8조, 제13조~제16조" },
    lanes: ["국방부", "지방자치단체", "군용비행장 운영기관", "지역소음대책심의위원회"],
    stages: ["G0 영향조사", "G1 지역지정", "G2 대책계획", "G3 측정·저감", "G4 보상", "G5 이의·환류"],
    nodes: [
      step("군용비행장 소음영향도 조사", "국방부", "G0 영향조사", "militaryNoise", ["제5조"], ["소음영향도 조사결과", "소음등고선도"]),
      step("소음대책지역 지정안 작성·주민의견 수렴", "국방부", "G1 지역지정", "militaryNoise", ["제5조"], ["소음대책지역 지정안", "주민의견 수렴결과"]),
      step("소음대책지역 지정·고시", "국방부", "G1 지역지정", "militaryNoise", ["제5조"], ["소음대책지역 지정고시", "지형도면"], { type: "notice" }),
      step("소음 방지·피해 보상 기본계획 수립", "국방부", "G2 대책계획", "militaryNoise", ["제7조"], ["소음 방지·피해 보상 기본계획"]),
      step("연도별 시행계획·저감사업 확정", "지방자치단체", "G2 대책계획", "militaryNoise", ["제7조"], ["연도별 시행계획", "저감사업 목록"]),
      step("자동소음측정망 설치·상시 측정", "군용비행장 운영기관", "G3 측정·저감", "militaryNoise", ["제8조"], ["자동소음측정망 설치결과", "소음측정자료"]),
      step("보상금 신청·산정·심의·결정", "지방자치단체", "G4 보상", "militaryNoise", ["제13조~제15조"], ["보상금 신청서", "보상금 결정통지"], { type: "gateway" }),
      step("이의신청·재심의와 대책계획 환류", "지역소음대책심의위원회", "G5 이의·환류", "militaryNoise", ["제16조"], ["이의신청 결정", "대책계획 환류사항"]),
    ],
    extras: [["P08", "P07", "loop", "보상 재심의"]],
  },
  {
    priority: 546,
    slug: "underground-safety-impact-assessment",
    name: "지하안전평가·착공후지하안전조사",
    oneLiner: "굴착 깊이·사업규모 판정부터 지하안전평가서 작성, 협의·재협의, 협의내용 이행, 착공후지하안전조사와 결과 제출까지의 경로",
    type: "지하안전 평가·사후조사형",
    category: "국토·교통·주거",
    whyFirst: "대규모 산단·팹·관로의 굴착은 깊이와 규모에 따라 독립적인 평가·협의·사후조사 산출물을 만들며 착공과 준공일정을 좌우한다.",
    sourceKeys: ["undergroundSafety"],
    legalArticles: { undergroundSafety: "제14조~제20조" },
    lanes: ["사업시행자", "승인기관", "국토교통부·전문기관", "지하안전평가 전문기관"],
    stages: ["G0 적용판정", "G1 평가작성", "G2 협의", "G3 승인조건", "G4 공사·이행", "G5 사후조사"],
    nodes: [
      step("굴착깊이·면적·사업유형별 적용경로 판정", "사업시행자", "G0 적용판정", "undergroundSafety", ["제14조"], ["지하안전평가 적용판정서"]),
      step("지반·지하수·인접시설 기초조사", "지하안전평가 전문기관", "G1 평가작성", "undergroundSafety", ["제15조"], ["지반·지하수 조사서", "인접시설 현황도"]),
      step("지하안전평가서 작성·승인기관 제출", "사업시행자", "G1 평가작성", "undergroundSafety", ["제15조"], ["지하안전평가서"]),
      step("평가서 검토·보완과 관계기관 협의", "국토교통부·전문기관", "G2 협의", "undergroundSafety", ["제16조"], ["검토의견", "보완서", "협의결과"], { type: "gateway" }),
      step("사업계획 반영·변경 시 재협의", "승인기관", "G3 승인조건", "undergroundSafety", ["제17조·제18조"], ["협의내용 반영확인", "재협의 결과"]),
      step("협의내용 이행계획·관리대장 작성", "사업시행자", "G4 공사·이행", "undergroundSafety", ["제19조"], ["협의내용 이행계획", "이행관리대장"]),
      step("굴착공사 계측·이행상황 점검", "사업시행자", "G4 공사·이행", "undergroundSafety", ["제19조"], ["굴착계측 기록", "이행점검 결과"]),
      step("착공후지하안전조사 실시", "지하안전평가 전문기관", "G5 사후조사", "undergroundSafety", ["제20조"], ["착공후지하안전조사서"]),
      step("월별·최종 조사결과 제출과 안전조치", "사업시행자", "G5 사후조사", "undergroundSafety", ["제20조"], ["월별 조사결과", "최종 조사보고서", "안전조치 결과"]),
    ],
    extras: [["P04", "P03", "loop", "평가서 보완"], ["P09", "P06", "message", "사후조사 환류"]],
  },
  {
    priority: 547,
    slug: "construction-safety-quality-management-plan",
    name: "건설공사 안전·품질관리계획",
    oneLiner: "건설공사 규모·공종 판정부터 품질관리계획과 안전관리계획 작성·승인, 품질시험·안전점검, 종합보고서 제출까지의 경로",
    type: "건설 안전·품질계획 이행형",
    category: "국토·교통·주거",
    whyFirst: "대규모 기반시설과 팹 건설은 건축허가와 별개로 공사 전 안전·품질계획, 공사 중 시험·점검, 완료 후 보고서라는 독립 게이트를 가진다.",
    sourceKeys: ["constructionTech"],
    legalArticles: { constructionTech: "제54조·제55조, 제62조·제62조의2" },
    lanes: ["건설사업자", "발주청·인허가기관", "건설엔지니어링사업자", "국토교통부·전문기관"],
    stages: ["G0 적용판정", "G1 계획작성", "G2 검토·승인", "G3 착공", "G4 시험·점검", "G5 종합보고"],
    nodes: [
      step("공사규모·구조·공종별 안전·품질계획 적용판정", "발주청·인허가기관", "G0 적용판정", "constructionTech", ["제55조·제62조"], ["안전·품질계획 적용판정서"]),
      step("품질관리계획·품질시험계획 작성", "건설사업자", "G1 계획작성", "constructionTech", ["제55조"], ["품질관리계획", "품질시험계획"]),
      step("안전관리계획·공종별 안전대책 작성", "건설사업자", "G1 계획작성", "constructionTech", ["제62조·제62조의2"], ["안전관리계획", "공종별 안전대책"]),
      step("계획 검토·승인과 인허가기관 제출", "발주청·인허가기관", "G2 검토·승인", "constructionTech", ["제55조·제62조"], ["계획 승인서", "인허가기관 제출확인"], { type: "gateway" }),
      step("착공 전 안전교육·품질조직·계측체계 가동", "건설사업자", "G3 착공", "constructionTech", ["제55조·제62조"], ["착공 전 이행확인서", "품질·안전 조직표"]),
      step("자재·공정 품질시험과 검사", "건설엔지니어링사업자", "G4 시험·점검", "constructionTech", ["제55조"], ["품질시험 성적서", "검사기록"]),
      step("정기·정밀 안전점검과 보완조치", "건설엔지니어링사업자", "G4 시험·점검", "constructionTech", ["제62조"], ["안전점검 보고서", "보완조치 결과"]),
      step("현장점검·시정명령 이행", "국토교통부·전문기관", "G4 시험·점검", "constructionTech", ["제54조"], ["현장점검 결과", "시정명령 이행서"]),
      step("안전관리 종합보고서·품질기록 인계", "건설사업자", "G5 종합보고", "constructionTech", ["제55조·제62조"], ["안전관리 종합보고서", "품질기록 인계서"]),
    ],
    extras: [["P07", "P05", "loop", "점검 보완"]],
  },
  {
    priority: 548,
    slug: "business-waste-generator-management",
    name: "사업장폐기물 배출자 신고·처리·전산관리",
    oneLiner: "사업장폐기물 종류·발생량 판정부터 배출자 신고, 처리계획, 위탁계약, 전자 인계·인수와 실적보고까지의 경로",
    type: "사업장폐기물 배출·인계형",
    category: "기후·환경·에너지",
    whyFirst: "반도체 팹은 폐기물처리업 허가 여부와 별개로 배출자에게 신고·적정처리·전자 인계·실적관리 의무가 발생한다.",
    sourceKeys: ["waste"],
    legalArticles: { waste: "제17조·제18조·제45조" },
    lanes: ["입주기업·배출자", "광주시·관할기관", "폐기물 운반·처리업체", "한국환경공단·올바로시스템"],
    stages: ["G0 분류", "G1 신고", "G2 계약", "G3 배출·인계", "G4 확인", "G5 실적관리"],
    nodes: [
      step("폐기물 종류·발생량·유해성 분류와 적용판정", "입주기업·배출자", "G0 분류", "waste", ["제17조"], ["폐기물 분류표", "배출자 의무 적용판정서"]),
      step("사업장폐기물 배출자 신고·처리계획 제출", "입주기업·배출자", "G1 신고", "waste", ["제17조"], ["사업장폐기물 배출자 신고서", "폐기물 처리계획"]),
      step("신고 수리·보완과 변경관리", "광주시·관할기관", "G1 신고", "waste", ["제17조"], ["신고 수리결과", "변경신고 확인"]),
      step("허가 처리업체 적격성 확인·위탁계약", "입주기업·배출자", "G2 계약", "waste", ["제18조"], ["처리업체 적격성 확인서", "폐기물 위탁계약서"]),
      step("보관기준 준수·배출량 계량", "입주기업·배출자", "G3 배출·인계", "waste", ["제17조·제18조"], ["폐기물 보관대장", "배출량 계량기록"]),
      step("전자 인계·인수서 작성·전송", "한국환경공단·올바로시스템", "G3 배출·인계", "waste", ["제45조"], ["전자 인계·인수서"]),
      step("운반·처리 완료와 적정처리 확인", "폐기물 운반·처리업체", "G4 확인", "waste", ["제18조"], ["운반·처리 완료확인", "적정처리 증빙"]),
      step("폐기물 발생·처리 실적보고와 기록보존", "입주기업·배출자", "G5 실적관리", "waste", ["제17조·제45조"], ["폐기물 발생·처리 실적보고", "기록보존대장"]),
    ],
    extras: [["P07", "P04", "loop", "부적정 처리 재위탁"]],
  },
  {
    priority: 549,
    slug: "chemical-registration-hazard-risk-assessment",
    name: "화학물질 등록·유해성심사·위해성평가",
    oneLiner: "제조·수입량과 물질 동일성 판정부터 등록·신고·면제확인, 공동제출, 유해성심사·위해성평가, 공급망 정보제공까지의 경로",
    type: "화학물질 등록·평가형",
    category: "기후·환경·에너지",
    whyFirst: "화학사고 예방계획·취급시설 허가와 별개로 원료물질의 제조·수입 단계에서 등록·평가·정보제공 의무가 먼저 성립할 수 있다.",
    sourceKeys: ["chemicalRegistration"],
    legalArticles: { chemicalRegistration: "제10조~제15조, 제18조, 제24조, 제29조" },
    lanes: ["제조·수입자", "환경부", "국립환경과학원", "공동등록 협의체·공급망"],
    stages: ["G0 물질판정", "G1 등록경로", "G2 자료제출", "G3 심사", "G4 위해성", "G5 정보전달"],
    nodes: [
      step("물질 동일성·제조수입량·용도별 적용판정", "제조·수입자", "G0 물질판정", "chemicalRegistration", ["제10조"], ["물질 동일성 확인서", "연간 제조·수입량 산정표"]),
      step("등록·신고·면제확인 경로 결정", "제조·수입자", "G1 등록경로", "chemicalRegistration", ["제10조·제11조"], ["등록경로 판정서", "등록면제 확인신청"]),
      step("기존·신규 화학물질 등록·신고 신청", "제조·수입자", "G1 등록경로", "chemicalRegistration", ["제10조·제12조"], ["화학물질 등록신청서", "신고서"]),
      step("유해성·용도·노출 자료 작성", "제조·수입자", "G2 자료제출", "chemicalRegistration", ["제14조"], ["유해성 자료", "용도·노출정보", "안전사용 지침"]),
      step("동일물질 공동제출·자료사용권 조정", "공동등록 협의체·공급망", "G2 자료제출", "chemicalRegistration", ["제15조"], ["공동제출 합의서", "자료사용권 확인"]),
      step("등록자료 검토·보완과 등록결정", "환경부", "G3 심사", "chemicalRegistration", ["제10조~제15조"], ["자료 보완요구", "등록결정 통지"], { type: "gateway" }),
      step("유해성심사·결과 통지", "국립환경과학원", "G3 심사", "chemicalRegistration", ["제18조"], ["유해성심사 결과"]),
      step("위해성평가·위해관리 조치", "국립환경과학원", "G4 위해성", "chemicalRegistration", ["제24조"], ["위해성평가 결과", "위해관리 조치사항"]),
      step("하위사용자 정보제공·변경등록 관리", "공동등록 협의체·공급망", "G5 정보전달", "chemicalRegistration", ["제12조·제29조"], ["화학물질 정보제공서", "변경등록·신고 결과"]),
    ],
    extras: [["P06", "P04", "loop", "등록자료 보완"]],
  },
  {
    priority: 550,
    slug: "groundwater-development-use-permit",
    name: "지하수 개발·이용허가·영향조사·준공",
    oneLiner: "지하수 개발·이용 규모 판정부터 영향조사, 허가·신고, 굴착·시설공사, 준공신고, 수질검사와 원상복구까지의 경로",
    type: "지하수 개발·이용 관리형",
    category: "기후·환경·에너지",
    whyFirst: "공업용수도와 별개로 공사·비상·운영용 지하수를 개발하면 영향조사·허가·준공·수질검사 의무가 발생할 수 있다.",
    sourceKeys: ["groundwater"],
    legalArticles: { groundwater: "제7조~제9조, 제15조, 제20조" },
    lanes: ["사업시행자·이용자", "광주시·관할기관", "지하수영향조사기관", "수질검사기관"],
    stages: ["G0 적용판정", "G1 영향조사", "G2 허가·신고", "G3 굴착·공사", "G4 준공", "G5 수질·종료"],
    nodes: [
      step("취수량·용도·시설규모별 허가·신고 경로 판정", "사업시행자·이용자", "G0 적용판정", "groundwater", ["제7조·제8조"], ["지하수 개발·이용 적용판정서"]),
      step("지하수영향조사·보전대책 작성", "지하수영향조사기관", "G1 영향조사", "groundwater", ["제7조"], ["지하수영향조사서", "지하수 보전대책"]),
      step("개발·이용 허가신청 또는 신고", "사업시행자·이용자", "G2 허가·신고", "groundwater", ["제7조·제8조"], ["지하수 개발·이용 허가신청서 또는 신고서"]),
      step("영향·시설기준 검토와 허가·수리", "광주시·관할기관", "G2 허가·신고", "groundwater", ["제7조·제8조"], ["허가서 또는 신고수리", "허가조건"], { type: "gateway" }),
      step("굴착·취수시설 설치와 계량장치 구축", "사업시행자·이용자", "G3 굴착·공사", "groundwater", ["제7조~제9조"], ["굴착·시설 설치기록", "계량장치 확인"]),
      step("개발·이용시설 준공신고·확인", "광주시·관할기관", "G4 준공", "groundwater", ["제9조"], ["지하수시설 준공신고서", "준공확인"]),
      step("정기 수질검사·취수량 기록", "수질검사기관", "G5 수질·종료", "groundwater", ["제20조"], ["지하수 수질검사 성적서", "취수량 기록"]),
      step("이용종료 신고·원상복구", "사업시행자·이용자", "G5 수질·종료", "groundwater", ["제15조"], ["이용종료 신고", "원상복구 확인서"]),
    ],
    extras: [["P04", "P02", "loop", "영향조사 보완"]],
  },
  {
    priority: 551,
    slug: "sewer-connection-originator-charge",
    name: "배수설비 연결·준공검사·하수도 원인자부담금",
    oneLiner: "오수량·연결점 판정부터 배수설비 설치신고, 공공하수도 연결공사, 준공검사, 원인자부담금 산정·부과·납부까지의 경로",
    type: "하수도 연결·부담금형",
    category: "기후·환경·에너지",
    whyFirst: "공공폐수처리시설 계획과 별개로 개별 부지의 배수설비 연결·준공검사 및 증가 오수량에 따른 원인자부담금이 입주·가동의 선행조건이 된다.",
    sourceKeys: ["sewerage"],
    legalArticles: { sewerage: "제27조·제61조" },
    lanes: ["입주기업·사업시행자", "광주시·공공하수도관리청", "배수설비 시공자", "하수도 사용료·부담금 담당부서"],
    stages: ["G0 용량판정", "G1 설치신고", "G2 연결공사", "G3 준공검사", "G4 부담금", "G5 사용개시"],
    nodes: [
      step("오수량·수질·처리구역·연결점 판정", "입주기업·사업시행자", "G0 용량판정", "sewerage", ["제27조·제61조"], ["오수량·수질 산정서", "하수도 연결점 협의서"]),
      step("배수설비 설치신고·설계도서 제출", "입주기업·사업시행자", "G1 설치신고", "sewerage", ["제27조"], ["배수설비 설치신고서", "배수설비 설계도서"]),
      step("설치신고 검토·수리와 연결조건 통보", "광주시·공공하수도관리청", "G1 설치신고", "sewerage", ["제27조"], ["설치신고 수리", "하수도 연결조건"]),
      step("배수설비·연결관 공사와 시험", "배수설비 시공자", "G2 연결공사", "sewerage", ["제27조"], ["배수설비 공사기록", "수밀·통수 시험결과"]),
      step("배수설비 준공검사·보완", "광주시·공공하수도관리청", "G3 준공검사", "sewerage", ["제27조"], ["배수설비 준공검사 결과"], { type: "gateway" }),
      step("증가 오수량·시설비 기준 원인자부담금 산정", "하수도 사용료·부담금 담당부서", "G4 부담금", "sewerage", ["제61조"], ["원인자부담금 산정서"]),
      step("원인자부담금 부과·납부·정산", "하수도 사용료·부담금 담당부서", "G4 부담금", "sewerage", ["제61조"], ["원인자부담금 부과서", "납부·정산 확인"]),
      step("공공하수도 사용개시·배출조건 인계", "광주시·공공하수도관리청", "G5 사용개시", "sewerage", ["제27조"], ["공공하수도 사용개시 확인", "배출조건 인계서"]),
    ],
    extras: [["P05", "P04", "loop", "준공 보완"]],
  },
  {
    priority: 552,
    slug: "air-region-total-emissions-permit",
    name: "대기관리권역 총량사업장 허가·할당·측정",
    oneLiner: "대기관리권역·총량관리사업장 적용판정부터 설치·변경허가, 배출허용총량 할당, 측정기기 설치, 배출량 관리·이행확인까지의 경로",
    type: "대기오염 총량허가·할당형",
    category: "기후·환경·에너지",
    whyFirst: "개별 대기배출시설 허가와 별개로 권역·규모 문턱을 넘는 사업장은 총량허가, 배출허용총량 할당과 연도별 이행관리가 필요하다.",
    sourceKeys: ["airRegion"],
    legalArticles: { airRegion: "제15조~제25조" },
    lanes: ["입주기업·사업자", "환경부", "광주시", "한국환경공단·측정기관"],
    stages: ["G0 적용판정", "G1 허가", "G2 총량할당", "G3 측정", "G4 운영", "G5 정산·조정"],
    nodes: [
      step("대기관리권역·업종·배출량별 적용판정", "입주기업·사업자", "G0 적용판정", "airRegion", ["제15조"], ["총량관리사업장 적용판정서"]),
      step("총량관리사업장 설치·변경허가 신청", "입주기업·사업자", "G1 허가", "airRegion", ["제15조"], ["총량관리사업장 설치·변경허가 신청서"]),
      step("방지시설·배출전망 검토와 허가", "광주시", "G1 허가", "airRegion", ["제15조"], ["총량관리사업장 허가서", "최적방지시설 조건"], { type: "gateway" }),
      step("연도별 배출허용총량 할당 신청·자료 제출", "입주기업·사업자", "G2 총량할당", "airRegion", ["제16조~제18조"], ["배출허용총량 할당 신청", "배출전망 자료"]),
      step("배출허용총량 할당·조정 통지", "환경부", "G2 총량할당", "airRegion", ["제16조~제18조"], ["연도별 배출허용총량 할당서", "조정통지"]),
      step("굴뚝자동측정기기 설치·정도검사", "한국환경공단·측정기관", "G3 측정", "airRegion", ["제17조"], ["측정기기 설치확인", "정도검사 결과"]),
      step("배출량 산정·제출과 총량관리대장 운영", "입주기업·사업자", "G4 운영", "airRegion", ["제17조"], ["월별 배출량 산정·제출서", "총량관리대장"]),
      step("할당량 준수확인·총량초과과징금 산정", "환경부", "G5 정산·조정", "airRegion", ["제22조"], ["총량 준수확인", "총량초과과징금 산정·부과서"]),
      step("할당량 이전·이월·외부감축량 조정", "환경부", "G5 정산·조정", "airRegion", ["제20조~제20조의3"], ["할당량 이전·이월 확인", "외부감축량 인정·조정결과"]),
    ],
    extras: [["P08", "P07", "loop", "배출량·할당량 보정"]],
  },
  {
    priority: 553,
    slug: "radiation-generator-use-permit",
    name: "방사선발생장치 사용허가·시설검사·정기검사",
    oneLiner: "방사선발생장치 종류·용량 판정부터 사용허가·신고, 시설기준 심사, 시설검사, 안전관리자 선임, 정기검사와 변경·폐기까지의 경로",
    type: "방사선발생장치 허가·검사형",
    category: "보건·안전·과학기술",
    whyFirst: "반도체 검사·분석 장비 중 방사선발생장치는 일반 공장·환경허가와 별도로 사용허가·시설검사·정기검사를 요구할 수 있다.",
    sourceKeys: ["nuclearSafety"],
    legalArticles: { nuclearSafety: "제53조·제54조·제56조·제59조" },
    lanes: ["입주기업·사용자", "원자력안전위원회", "한국원자력안전기술원", "방사선안전관리자"],
    stages: ["G0 장치판정", "G1 허가·신고", "G2 시설심사", "G3 설치검사", "G4 운영", "G5 변경·폐기"],
    nodes: [
      step("장치 종류·용량·용도별 허가·신고 경로 판정", "입주기업·사용자", "G0 장치판정", "nuclearSafety", ["제53조"], ["방사선발생장치 적용판정서"]),
      step("사용시설 설계·차폐·안전성 자료 작성", "입주기업·사용자", "G1 허가·신고", "nuclearSafety", ["제53조·제54조"], ["사용시설 설계도", "차폐·안전성 평가서"]),
      step("방사선발생장치 사용허가 신청 또는 신고", "입주기업·사용자", "G1 허가·신고", "nuclearSafety", ["제53조"], ["사용허가 신청서 또는 사용신고서"]),
      step("허가기준·시설기준 심사와 허가", "원자력안전위원회", "G2 시설심사", "nuclearSafety", ["제54조"], ["안전심사 결과", "사용허가증"], { type: "gateway" }),
      step("시설 설치·사용 전 시설검사", "한국원자력안전기술원", "G3 설치검사", "nuclearSafety", ["제56조"], ["시설검사 결과", "사용개시 가능 확인"]),
      step("방사선안전관리자 선임·운영기록 관리", "방사선안전관리자", "G4 운영", "nuclearSafety", ["제59조"], ["안전관리자 선임신고", "방사선작업·선량 기록"]),
      step("정기검사·시정조치 이행", "한국원자력안전기술원", "G4 운영", "nuclearSafety", ["제56조"], ["정기검사 결과", "시정조치 이행서"]),
      step("변경허가·사용폐지·장치처분 신고", "입주기업·사용자", "G5 변경·폐기", "nuclearSafety", ["제53조·제59조"], ["변경허가·신고 결과", "사용폐지·처분 신고"]),
    ],
    extras: [["P07", "P06", "loop", "검사 시정조치"]],
  },
  {
    priority: 554,
    slug: "development-charge-assessment",
    name: "개발부담금 산정·부과·납부",
    oneLiner: "개발사업 유형·면적·감면 적용판정부터 개발비용 자료관리, 종료시점지가 산정, 예정통지, 부과·납부와 심사청구까지의 경로",
    type: "개발이익 환수·부담금형",
    category: "재정·세무·납세자",
    whyFirst: "산단·종전부지 개발은 사업유형·면적·시행자에 따라 개발부담금이 발생할 수 있으며 준공 직전부터 비용자료와 부과일정을 관리해야 한다.",
    sourceKeys: ["developmentGains"],
    legalArticles: { developmentGains: "제5조, 제8조~제11조, 제14조~제16조" },
    lanes: ["사업시행자·납부의무자", "광주시·부과징수기관", "감정평가법인", "행정심판·법원"],
    stages: ["G0 적용판정", "G1 비용관리", "G2 종료지가", "G3 예정통지", "G4 부과·납부", "G5 불복"],
    nodes: [
      step("대상사업·면적·시행자·감면 적용판정", "광주시·부과징수기관", "G0 적용판정", "developmentGains", ["제5조"], ["개발부담금 적용판정서"]),
      step("개발사업 착수시점·종료시점 확정", "광주시·부과징수기관", "G0 적용판정", "developmentGains", ["제9조"], ["부과개시·종료시점 확인서"]),
      step("개발비용 증빙·토지비·부대비용 관리", "사업시행자·납부의무자", "G1 비용관리", "developmentGains", ["제11조"], ["개발비용 산출명세", "비용 증빙철"]),
      step("개발사업 완료신고·개발비용 명세 제출", "사업시행자·납부의무자", "G2 종료지가", "developmentGains", ["제9조·제11조"], ["사업완료 신고", "개발비용 명세서"]),
      step("종료시점지가·개발이익 산정", "감정평가법인", "G2 종료지가", "developmentGains", ["제8조~제10조"], ["종료시점지가 산정서", "개발이익 산정서"]),
      step("개발부담금 부과예정 통지·고지 전 심사", "광주시·부과징수기관", "G3 예정통지", "developmentGains", ["제14조"], ["개발부담금 부과예정 통지", "고지 전 심사결과"]),
      step("개발부담금 결정·부과", "광주시·부과징수기관", "G4 부과·납부", "developmentGains", ["제14조"], ["개발부담금 부과결정서", "납부고지서"], { type: "notice" }),
      step("납부·연기·분할납부·물납 처리", "사업시행자·납부의무자", "G4 부과·납부", "developmentGains", ["제15조·제16조"], ["납부확인", "연기·분할·물납 결정"]),
      step("심사청구·행정쟁송과 부과액 조정", "행정심판·법원", "G5 불복", "developmentGains", ["제14조~제16조"], ["불복결정", "부과액 조정결과"]),
    ],
    extras: [["P06", "P03", "loop", "개발비용 보완"]],
  },
  {
    priority: 555,
    slug: "industrial-complex-management-occupancy",
    name: "산업단지 관리기본계획·입주계약",
    oneLiner: "산업단지 관리기관·관리기본계획 수립·고시부터 입주자격 검토, 입주계약·변경, 공장등록과 계약 사후관리까지의 경로",
    type: "산업단지 관리·입주계약형",
    category: "인허가·규제·산업",
    whyFirst: "산업단지 개발·준공과 별개로 관리기본계획과 업종배치, 개별 기업의 입주계약이 실제 착공·공장등록의 직접 선행조건이 된다.",
    sourceKeys: ["industrialCluster"],
    legalArticles: { industrialCluster: "제15조·제16조·제33조·제38조·제42조" },
    lanes: ["산업단지 관리권자", "산업단지 관리기관", "입주희망기업", "공장등록 담당기관"],
    stages: ["G0 관리체계", "G1 기본계획", "G2 입주검토", "G3 입주계약", "G4 공장등록", "G5 사후관리"],
    nodes: [
      step("산업단지 관리권자·관리기관 확정", "산업단지 관리권자", "G0 관리체계", "industrialCluster", ["제33조"], ["산업단지 관리기관 지정·확인서"]),
      step("관리기본계획·업종배치·입주기준 작성", "산업단지 관리기관", "G1 기본계획", "industrialCluster", ["제33조"], ["산업단지 관리기본계획안", "업종배치계획"]),
      step("관리기본계획 승인·고시", "산업단지 관리권자", "G1 기본계획", "industrialCluster", ["제33조"], ["관리기본계획 승인서", "관리기본계획 고시"], { type: "notice" }),
      step("입주업종·부지·환경·용수·전력 적합성 검토", "산업단지 관리기관", "G2 입주검토", "industrialCluster", ["제38조"], ["입주자격·업종 적합성 검토서"]),
      step("산업단지 입주계약·변경계약 체결", "입주희망기업", "G3 입주계약", "industrialCluster", ["제38조"], ["산업단지 입주계약서", "변경계약서"]),
      step("입주계약 내용과 공장설립 승인·건축 인허가 연계", "산업단지 관리기관", "G3 입주계약", "industrialCluster", ["제38조"], ["입주계약·공장설립 연계표"]),
      step("공장완료 신고·공장등록 확인", "공장등록 담당기관", "G4 공장등록", "industrialCluster", ["제15조·제16조"], ["공장완료 신고", "공장등록 확인서"]),
      step("입주계약 이행점검·시정명령·계약해지 관리", "산업단지 관리기관", "G5 사후관리", "industrialCluster", ["제38조·제42조"], ["입주계약 이행점검 결과", "시정명령·계약해지 결정"]),
    ],
    extras: [["P04", "P02", "loop", "업종배치 조정"]],
  },
  {
    priority: 556,
    slug: "road-connection-permit",
    name: "도로 연결허가·설계·공사·사용",
    oneLiner: "산업단지·공장 출입구와 도로 종류 판정부터 연결허가 신청, 교통·안전·구조 검토, 허가, 연결공사와 준공·사용까지의 경로",
    type: "도로 연결허가·공사형",
    category: "국토·교통·주거",
    whyFirst: "도로점용허가와 별개로 간선도로에 출입구·교차로를 연결하려면 연결허가와 교통안전·구조 기준 검토가 필요하다.",
    sourceKeys: ["road"],
    legalArticles: { road: "제52조" },
    lanes: ["사업시행자·입주기업", "도로관리청", "교통·도로 전문기관", "도로공사 시공자"],
    stages: ["G0 적용판정", "G1 설계", "G2 허가신청", "G3 검토·허가", "G4 연결공사", "G5 준공·사용"],
    nodes: [
      step("도로종류·출입구·교차로별 연결허가 적용판정", "사업시행자·입주기업", "G0 적용판정", "road", ["제52조"], ["도로 연결허가 적용판정서"]),
      step("연결지점·가감속차로·배수·안전시설 기본설계", "교통·도로 전문기관", "G1 설계", "road", ["제52조"], ["도로 연결 기본설계도", "교통처리계획"]),
      step("도로 연결허가 신청·설계도서 제출", "사업시행자·입주기업", "G2 허가신청", "road", ["제52조"], ["도로 연결허가 신청서", "연결설계도서"]),
      step("교통영향·도로구조·안전·배수 검토", "도로관리청", "G3 검토·허가", "road", ["제52조"], ["도로 연결 기술검토서", "보완의견"], { type: "gateway" }),
      step("도로 연결허가·공사조건 통보", "도로관리청", "G3 검토·허가", "road", ["제52조"], ["도로 연결허가서", "공사·원상복구 조건"]),
      step("연결부·가감속차로·안전시설 공사", "도로공사 시공자", "G4 연결공사", "road", ["제52조"], ["도로 연결공사 기록", "품질시험 결과"]),
      step("도로관리청 준공확인·보완", "도로관리청", "G5 준공·사용", "road", ["제52조"], ["도로 연결공사 준공확인"], { type: "gateway" }),
      step("연결도로 사용개시·유지관리 인계", "사업시행자·입주기업", "G5 준공·사용", "road", ["제52조"], ["도로 연결 사용개시 확인", "유지관리 인계서"]),
    ],
    extras: [["P07", "P06", "loop", "준공 보완"]],
  },
];

function buildInstitution(spec) {
  const sources = spec.sourceKeys.map((key) => S[key]);
  const legalBasis = spec.sourceKeys.map((key) => ({ law: S[key].law, articles: spec.legalArticles[key], kind: S[key].kind }));
  const procedure = spec.nodes.map((node) => node.name);
  return {
    slug: spec.slug,
    name: spec.name,
    oneLiner: spec.oneLiner,
    type: spec.type,
    priority: spec.priority,
    category: spec.category,
    whyFirst: spec.whyFirst,
    asOfDate: AS_OF,
    status: "full",
    canvas: {
      purpose: spec.oneLiner,
      stakeholders: spec.lanes.join(", "),
      legalBasis,
      authorities: spec.lanes.map((name) => ({ name, role: spec.name + "의 해당 레인 업무와 산출물 작성·검토·결정을 담당" })),
      procedure,
      moneyFlow: "수수료·부담금·검사비·보상금은 적용 규모와 현행 하위법령·조례·고시에서 확정한다.",
      docsFlow: procedure.join(" → "),
      bottlenecks: ["시설규모·굴착깊이·사용물질·배출량 등 적용 문턱의 미확정", "관계기관 보완자료와 공사·가동 일정의 불일치", "허가조건·검사·사후관리 산출물 인계의 단절"],
      reformPoints: ["사업·시설 식별자로 신청·협의·검사·부과 산출물을 연결", "적용 문턱 판정근거와 보완요구를 공통 일정에서 추적", "허가조건을 공사·준공·가동·사후관리 확인사항으로 구조화"],
    },
    related: specs.filter((item) => item.slug !== spec.slug && item.category === spec.category).slice(0, 4).map((item) => item.name),
    fieldVerification: [
      spec.name + "의 최신 시행령·시행규칙·고시·조례와 제출서식",
      "사업규모·시설종류·지역별 적용 문턱과 면제·간소화 요건",
      "관계기관별 실제 처리기간·보완횟수·전산접수 경로",
      "허가·검사 이후 변경·이행점검·취소의 현장 운영기준",
    ],
    process: {
      institution_name: spec.name,
      law_name: sources.map((source) => source.law).join(" · "),
      lanes: spec.lanes,
      stages: spec.stages,
      nodes: spec.nodes.map(buildNode),
      edges: sequenceEdges(spec.nodes.length, spec.extras),
      warnings: [
        "법제처 국가법령정보의 2026-08-17 현재 법령 식별자와 핵심 조문을 대조했다.",
        "광주 반도체클러스터의 적용 여부는 시설규모·굴착깊이·사용물질·배출량·입지 및 하위법령 문턱에 따라 달라지므로 프로젝트 연결에서는 후보(TPL)와 확정 적용을 구분한다.",
      ],
    },
    verification: {
      status: "source-linked",
      verifiedAt: AS_OF,
      method: "법제처 국가법령정보의 현행 법령 검색·조문 조회 결과와 공식 법령 원문 연결",
      scope: "현행 법률의 식별자·공포일·시행일과 독립 법정 산출물을 만드는 핵심 조문 범위를 대조했다. 시행령·시행규칙·고시·조례·서식의 전수 검증은 현장확인 항목으로 분리했다.",
      notes: ["광주 반도체클러스터 행정절차 2차 감사에서 별도 신청·협의·허가·검사·부과 산출물을 가진 공백 12개를 추가했다."],
      sources,
      articleVerification: {
        checkedAt: AS_OF,
        method: "법제처 핵심조문 표본 대조; 전체 인용 자동검증은 미실행",
        citationEntries: 0,
        explicitCitationEntries: 0,
        articleReferences: 0,
        verifiedReferences: 0,
        missingReferences: 0,
        uncheckableReferences: 0,
      },
    },
  };
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  for (const spec of specs) {
    const outputPath = path.join(DATA_DIR, spec.slug + ".json");
    const existingIndex = manifest.findIndex((entry) => entry.slug === spec.slug);
    const priorityConflict = manifest.find((entry) => entry.priority === spec.priority && entry.slug !== spec.slug);
    if (priorityConflict) throw new Error("priority " + spec.priority + " already belongs to " + priorityConflict.slug);
    if (!OVERWRITE && (existingIndex >= 0 || fs.existsSync(outputPath))) {
      throw new Error(spec.slug + " already exists; rerun with --overwrite only when intentional");
    }
    fs.writeFileSync(outputPath, JSON.stringify(buildInstitution(spec), null, 2) + "\n");
    const entry = { priority: spec.priority, slug: spec.slug, name: spec.name, type: spec.type, category: spec.category };
    if (existingIndex >= 0) manifest[existingIndex] = entry;
    else manifest.push(entry);
  }
  manifest.sort((left, right) => left.priority - right.priority);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log("generated " + specs.length + " mega-project permit institutions; manifest=" + manifest.length);
  specs.forEach((spec) => console.log(spec.priority + "\t" + spec.slug + "\t" + spec.name + "\t" + spec.nodes.length + " nodes"));
}

main();
