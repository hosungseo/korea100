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
  buildingManagement: statute("건축물관리법", "013478", "266691", "2024-12-03", "2025-06-04", "건축물관리법"),
  occupationalSafety: statute("산업안전보건법", "001766", "287805", "2026-07-07", "2026-07-07", "산업안전보건법"),
  asbestosSafety: statute("석면안전관리법", "011384", "276749", "2025-10-01", "2025-10-01", "석면안전관리법"),
  constructionWaste: statute("건설폐기물의 재활용촉진에 관한 법률", "009592", "276695", "2025-10-01", "2025-10-01", "건설폐기물의재활용촉진에관한법률"),
  air: statute("대기환경보전법", "001773", "287811", "2026-07-07", "2026-07-07", "대기환경보전법"),
  noise: statute("소음ㆍ진동관리법", "000167", "276753", "2025-10-01", "2025-10-01", "소음진동관리법"),
  waterEnvironment: statute("물환경보전법", "000166", "283441", "2026-02-19", "2026-02-19", "물환경보전법"),
  waterReuse: statute("물의 재이용 촉진 및 지원에 관한 법률", "011209", "286775", "2026-06-09", "2026-06-09", "물의재이용촉진및지원에관한법률"),
  natureConservation: statute("자연환경보전법", "000169", "284091", "2026-03-05", "2026-07-01", "자연환경보전법"),
  metroTransport: statute("대도시권 광역교통 관리에 관한 특별법", "000106", "280117", "2025-12-02", "2026-06-03", "대도시권광역교통관리에관한특별법"),
  landscape: statute("경관법", "010447", "276931", "2025-10-01", "2025-10-01", "경관법"),
  mechanical: statute("기계설비법", "013114", "219239", "2020-06-09", "2020-06-09", "기계설비법"),
  ictConstruction: statute("정보통신공사업법", "001445", "268833", "2025-01-31", "2026-02-01", "정보통신공사업법"),
  elevator: statute("승강기 안전관리법", "001458", "259475", "2024-01-30", "2025-01-31", "승강기안전관리법"),
  energy: statute("에너지이용 합리화법", "001867", "276559", "2025-10-01", "2026-05-28", "에너지이용합리화법"),
  environmentalLiability: statute("환경오염피해 배상책임 및 구제에 관한 법률", "012198", "279801", "2025-11-11", "2026-05-12", "환경오염피해배상책임및구제에관한법률"),
  odor: statute("악취방지법", "009680", "276767", "2025-10-01", "2025-10-01", "악취방지법"),
  spatialInformation: statute("공간정보의 구축 및 관리 등에 관한 법률", "011023", "284007", "2026-03-05", "2026-07-01", "공간정보의구축및관리등에관한법률"),
  waterSupply: statute("수도법", "001818", "276757", "2025-10-01", "2025-10-01", "수도법"),
};

function step(name, lane, stage, sourceKey, articles, outputDocuments, type = "task") {
  return { name, lane, stage, sourceKey, articles: Array.isArray(articles) ? articles : [articles], outputDocuments, type };
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
    type: raw.type,
    status,
    progress: status === "done" ? 100 : status === "current" ? 40 : 0,
    actor: raw.lane,
    action: raw.name + "에 필요한 적용요건과 자료를 확인하고 법정 산출물을 다음 담당기관에 인계한다.",
    output_documents: raw.outputDocuments,
    confidence: 0.9,
    legal_basis: raw.articles.map((article) => ({
      law: source.law,
      article,
      text: source.law + " " + article + "에 따른 절차와 산출물. 세부 문턱ㆍ서식ㆍ기한은 현행 하위법령ㆍ조례ㆍ고시를 함께 확인한다.",
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
    priority: 557,
    slug: "building-demolition-permit-supervision",
    name: "건축물 해체허가·착공·감리·완료신고",
    oneLiner: "기존 건축물의 해체허가·신고 경로 판정부터 해체계획서 검토, 허가, 착공신고, 감리·현장점검과 완료신고까지의 경로",
    type: "건축물 해체허가·감리형",
    category: "국토·교통·주거",
    whyFirst: "군공항 종전부지의 격납고·청사·지원시설 철거는 산단 실시계획이나 토양정화와 별개로 해체허가·감리·완료신고를 통과해야 한다.",
    sourceKeys: ["buildingManagement"],
    legalArticles: { buildingManagement: "제30조~제33조" },
    lanes: ["건축물 관리자·사업시행자", "해체계획 작성·검토자", "광주시·허가권자", "해체공사감리자"],
    stages: ["G0 적용판정", "G1 계획작성", "G2 허가·신고", "G3 착공", "G4 해체·감리", "G5 완료"],
    nodes: [
      step("건축물 규모·높이·주변여건별 해체 허가·신고 경로 판정", "광주시·허가권자", "G0 적용판정", "buildingManagement", "제30조", ["해체 허가·신고 적용판정서"]),
      step("구조·공법·안전조치·폐기물 반영 해체계획서 작성", "해체계획 작성·검토자", "G1 계획작성", "buildingManagement", "제30조", ["건축물 해체계획서", "구조안전 검토서"]),
      step("전문가 해체계획서 검토·서명", "해체계획 작성·검토자", "G1 계획작성", "buildingManagement", "제30조", ["해체계획 검토확인서"]),
      step("해체허가 신청 또는 해체신고·보완·수리", "광주시·허가권자", "G2 허가·신고", "buildingManagement", "제30조", ["해체허가서 또는 신고수리", "허가조건"], "gateway"),
      step("해체공사 착공신고·감리자 지정", "건축물 관리자·사업시행자", "G3 착공", "buildingManagement", ["제30조의2", "제31조"], ["해체공사 착공신고서", "해체공사감리자 지정서"]),
      step("해체공사 감리·현장점검·작업중지 조치", "해체공사감리자", "G4 해체·감리", "buildingManagement", ["제31조", "제32조"], ["해체감리일지", "현장점검·조치결과"]),
      step("해체공사 완료검사·감리완료보고", "해체공사감리자", "G5 완료", "buildingManagement", "제33조", ["해체감리 완료보고서", "해체공사 완료확인"]),
      step("해체공사 완료신고·건축물대장 말소 연계", "광주시·허가권자", "G5 완료", "buildingManagement", "제33조", ["해체공사 완료신고 수리", "건축물대장 정리확인"]),
    ],
    extras: [["P04", "P02", "loop", "해체계획 보완"], ["P06", "P05", "loop", "현장 안전조치"]],
  },
  {
    priority: 558,
    slug: "asbestos-survey-removal-supervision",
    name: "석면조사·해체제거 신고·감리·농도관리",
    oneLiner: "해체 전 기관석면조사부터 석면해체·제거업자 선정, 작업신고, 감리자 지정, 작업 공개·주변농도 측정과 완료확인까지의 경로",
    type: "석면조사·제거 안전관리형",
    category: "보건·안전·과학기술",
    whyFirst: "종전 군공항의 노후 건축물에 석면이 있으면 일반 해체허가와 별도로 조사·작업신고·감리·배출허용기준 관리가 필요하다.",
    sourceKeys: ["occupationalSafety", "asbestosSafety"],
    legalArticles: { occupationalSafety: "제119조·제122조", asbestosSafety: "제27조~제31조" },
    lanes: ["건축물 소유주·발주자", "석면조사기관", "석면해체·제거업자", "고용노동부·광주시·감리인"],
    stages: ["G0 조사판정", "G1 기관조사", "G2 제거계획", "G3 신고·공개", "G4 작업·감리", "G5 완료"],
    nodes: [
      step("건축물 연면적·용도·자재별 기관석면조사 대상 판정", "건축물 소유주·발주자", "G0 조사판정", "occupationalSafety", "제119조", ["기관석면조사 적용판정서"]),
      step("기관석면조사·시료분석·석면지도 작성", "석면조사기관", "G1 기관조사", "occupationalSafety", "제119조", ["기관석면조사 결과서", "석면지도"]),
      step("등록 석면해체·제거업자 선정과 제거계획 작성", "건축물 소유주·발주자", "G2 제거계획", "occupationalSafety", "제122조", ["석면해체·제거 계약서", "작업계획서"]),
      step("석면해체·제거작업 신고·작업 사실 공개", "고용노동부·광주시·감리인", "G3 신고·공개", "occupationalSafety", ["제122조"], ["석면해체·제거작업 신고서", "작업 공개자료"]),
      step("석면해체작업감리인 지정·감리계획 수립", "고용노동부·광주시·감리인", "G3 신고·공개", "asbestosSafety", "제30조", ["감리인 지정신고", "석면해체 감리계획"]),
      step("비산방지·격리·음압 유지와 제거작업 감리", "석면해체·제거업자", "G4 작업·감리", "asbestosSafety", ["제28조", "제30조"], ["작업감리일지", "비산방지 조치기록"]),
      step("사업장 주변 석면농도 측정·기준초과 조치", "고용노동부·광주시·감리인", "G4 작업·감리", "asbestosSafety", ["제28조", "제29조"], ["주변 석면농도 측정결과", "작업중지·개선조치서"]),
      step("제거완료 확인·폐석면 인계·감리완료보고", "건축물 소유주·발주자", "G5 완료", "asbestosSafety", ["제30조", "제31조"], ["석면제거 완료확인", "폐석면 인계서", "감리완료보고서"]),
    ],
    extras: [["P07", "P06", "loop", "농도초과 재조치"]],
  },
  {
    priority: 559,
    slug: "construction-waste-discharge-treatment-plan",
    name: "건설폐기물 처리계획 신고·인계·재활용",
    oneLiner: "해체·토공·건축공사의 건설폐기물 발생량 조사부터 처리계획 신고, 위탁계약, 전자 인계·인수, 순환골재 사용과 실적확인까지의 경로",
    type: "건설폐기물 배출·재활용형",
    category: "기후·환경·에너지",
    whyFirst: "대규모 철거·부지조성·팹 공사는 일반 사업장폐기물 관리와 별도로 착공일까지 건설폐기물 처리계획을 신고해야 한다.",
    sourceKeys: ["constructionWaste"],
    legalArticles: { constructionWaste: "제17조·제18조·제38조" },
    lanes: ["발주자·배출자", "광주시·관할 구청", "수집운반·중간처리업자", "한국환경공단·올바로시스템"],
    stages: ["G0 발생량조사", "G1 처리계획", "G2 신고", "G3 계약", "G4 인계·처리", "G5 재활용·보고"],
    nodes: [
      step("공종별 건설폐기물 종류·예상발생량 조사", "발주자·배출자", "G0 발생량조사", "constructionWaste", "제17조", ["건설폐기물 발생량 산정서"]),
      step("분리배출·보관·운반·처리·현장재활용 계획 작성", "발주자·배출자", "G1 처리계획", "constructionWaste", "제17조", ["건설폐기물 처리계획서"]),
      step("착공 전 처리계획 신고·변경신고·증명서 발급", "광주시·관할 구청", "G2 신고", "constructionWaste", "제17조", ["처리계획 신고증명서", "변경신고 확인"]),
      step("허가업체 적격성 확인·수집운반·처리 위수탁계약", "발주자·배출자", "G3 계약", "constructionWaste", ["제17조", "제18조"], ["업체 적격성 확인서", "건설폐기물 위수탁계약서"]),
      step("건설폐기물 분리보관·계량·배출", "발주자·배출자", "G4 인계·처리", "constructionWaste", "제17조", ["분리보관대장", "배출량 계량기록"]),
      step("전자 인계·인수와 운반·중간처리 완료", "한국환경공단·올바로시스템", "G4 인계·처리", "constructionWaste", "제18조", ["전자 인계·인수서", "처리완료 확인"]),
      step("순환골재·재활용제품 의무사용 판정·실행", "발주자·배출자", "G5 재활용·보고", "constructionWaste", "제38조", ["순환골재 사용계획", "사용실적 증빙"]),
      step("처리·재활용 실적보고와 준공자료 인계", "광주시·관할 구청", "G5 재활용·보고", "constructionWaste", ["제17조", "제38조"], ["건설폐기물 처리실적보고", "준공 인계자료"]),
    ],
    extras: [["P06", "P04", "loop", "부적정 처리 재위탁"]],
  },
  {
    priority: 560,
    slug: "fugitive-dust-specific-construction-report",
    name: "비산먼지 발생사업·특정공사 사전신고",
    oneLiner: "토공·해체·건축공사의 비산먼지와 생활소음·진동 적용판정부터 사전신고, 억제·저감계획, 방지시설 설치, 측정·개선까지의 경로",
    type: "공사환경 사전신고·저감형",
    category: "기후·환경·에너지",
    whyFirst: "부지조성과 대형 팹 공사는 대기·소음 배출시설 허가와 별도로 비산먼지 발생사업 신고와 특정공사 사전신고가 발생한다.",
    sourceKeys: ["air", "noise"],
    legalArticles: { air: "제43조", noise: "제22조" },
    lanes: ["사업시행자·시공자", "광주시·관할 구청", "환경관리자", "측정대행기관·주민소통창구"],
    stages: ["G0 적용판정", "G1 저감계획", "G2 사전신고", "G3 조건확정", "G4 공사·측정", "G5 변경·종료"],
    nodes: [
      step("공사면적·장비·기간별 비산먼지·특정공사 대상 판정", "광주시·관할 구청", "G0 적용판정", "air", "제43조", ["비산먼지·특정공사 적용판정서"]),
      step("살수·세륜·덮개·방음방진 등 억제·저감계획 작성", "환경관리자", "G1 저감계획", "air", ["제43조"], ["비산먼지 억제계획", "소음·진동 저감계획"]),
      step("비산먼지 발생사업 신고·변경신고", "사업시행자·시공자", "G2 사전신고", "air", "제43조", ["비산먼지 발생사업 신고서", "신고증명서"]),
      step("특정공사 사전신고·변경신고", "사업시행자·시공자", "G2 사전신고", "noise", "제22조", ["특정공사 사전신고서", "신고수리 결과"]),
      step("신고조건·작업시간·방지시설 보완 확정", "광주시·관할 구청", "G3 조건확정", "noise", ["제22조"], ["공사환경 신고조건", "보완이행 확인"]),
      step("세륜·살수·방진막·방음시설 설치·운영", "사업시행자·시공자", "G4 공사·측정", "air", "제43조", ["방지시설 설치기록", "일일 운영점검표"]),
      step("비산먼지·소음·진동 측정과 민원·개선조치", "측정대행기관·주민소통창구", "G4 공사·측정", "air", ["제43조"], ["환경측정 결과", "민원·개선조치대장"]),
      step("공법·기간 변경신고와 공사종료 확인", "광주시·관할 구청", "G5 변경·종료", "noise", "제22조", ["변경신고 수리", "공사종료 확인"]),
    ],
    extras: [["P07", "P06", "loop", "기준초과 개선"]],
  },
  {
    priority: 561,
    slug: "nonpoint-pollution-source-installation-management",
    name: "비점오염원 설치신고·저감시설 이행관리",
    oneLiner: "산업단지·대규모 개발사업의 비점오염원 적용판정부터 저감계획, 설치신고, 시설 설치·유지관리, 성능점검과 변경신고까지의 경로",
    type: "비점오염원 신고·저감형",
    category: "기후·환경·에너지",
    whyFirst: "산업단지 조성은 환경영향평가와 수질배출시설 허가와 별도로 승인 후 기한 내 비점오염원 설치신고와 저감시설 이행관리가 필요하다.",
    sourceKeys: ["waterEnvironment"],
    legalArticles: { waterEnvironment: "제53조" },
    lanes: ["사업시행자", "영산강유역환경청", "비점오염 저감시설 설계·시공자", "유지관리·점검기관"],
    stages: ["G0 적용판정", "G1 저감계획", "G2 설치신고", "G3 시설설치", "G4 유지관리", "G5 변경·점검"],
    nodes: [
      step("사업유형·면적·환경영향평가 여부별 비점오염원 대상 판정", "영산강유역환경청", "G0 적용판정", "waterEnvironment", "제53조", ["비점오염원 설치신고 적용판정서"]),
      step("강우유출·오염부하 산정과 비점오염 저감계획 작성", "사업시행자", "G1 저감계획", "waterEnvironment", "제53조", ["강우유출·오염부하 산정서", "비점오염 저감계획"]),
      step("승인 후 법정기한 내 비점오염원 설치신고", "사업시행자", "G2 설치신고", "waterEnvironment", "제53조", ["비점오염원 설치신고서"]),
      step("신고 검토·보완·신고증명서 발급", "영산강유역환경청", "G2 설치신고", "waterEnvironment", "제53조", ["보완요구서", "비점오염원 설치신고증명서"], "gateway"),
      step("침투·저류·여과 등 저감시설 설계·설치", "비점오염 저감시설 설계·시공자", "G3 시설설치", "waterEnvironment", "제53조", ["저감시설 실시설계", "설치완료 기록"]),
      step("저감시설 유지관리계획·점검대장 운영", "유지관리·점검기관", "G4 유지관리", "waterEnvironment", "제53조", ["유지관리계획", "시설 점검대장"]),
      step("방류수·저감효율 모니터링과 개선명령 이행", "영산강유역환경청", "G5 변경·점검", "waterEnvironment", "제53조", ["저감효율 측정결과", "개선명령 이행서"]),
      step("사업·시설 변경신고와 폐쇄·인계", "사업시행자", "G5 변경·점검", "waterEnvironment", "제53조", ["비점오염원 변경신고", "시설 인계서"]),
    ],
    extras: [["P07", "P05", "loop", "저감성능 개선"]],
  },
  {
    priority: 562,
    slug: "water-reuse-facility-installation-operation",
    name: "빗물이용·중수도·처리수 재이용시설 신고",
    oneLiner: "산단·건축물의 물 재이용 의무 판정부터 빗물이용시설·중수도 계획, 설치신고, 시설 설치·확인, 수질·사용량 운영관리까지의 경로",
    type: "물 재이용시설 설치·운영형",
    category: "기후·환경·에너지",
    whyFirst: "산업단지 개발사업과 대규모 시설은 공업용수 공급·하수도 연결과 별도로 중수도 설치신고와 물 재이용시설 운영 산출물을 요구할 수 있다.",
    sourceKeys: ["waterReuse"],
    legalArticles: { waterReuse: "제8조~제10조" },
    lanes: ["사업시행자·건축주", "광주시·관할 구청", "물 재이용시설 설계·시공자", "수질검사·운영기관"],
    stages: ["G0 의무판정", "G1 기본계획", "G2 설치신고", "G3 설치", "G4 확인·가동", "G5 운영관리"],
    nodes: [
      step("개발사업·건축물 규모별 빗물이용·중수도 의무 판정", "광주시·관할 구청", "G0 의무판정", "waterReuse", ["제8조", "제9조"], ["물 재이용시설 적용판정서"]),
      step("용수수지·재이용량·처리공정·관망 기본계획 작성", "사업시행자·건축주", "G1 기본계획", "waterReuse", ["제8조", "제9조"], ["용수수지 분석서", "물 재이용시설 기본계획"]),
      step("건축·실시계획 승인 전 설치·변경신고", "사업시행자·건축주", "G2 설치신고", "waterReuse", ["제8조", "제9조"], ["빗물이용시설·중수도 설치신고서"]),
      step("신고 검토·수리와 설치조건 통보", "광주시·관할 구청", "G2 설치신고", "waterReuse", ["제8조", "제9조"], ["설치신고 수리", "물 재이용시설 설치조건"], "gateway"),
      step("처리시설·저류조·이중관망 설치·시운전", "물 재이용시설 설계·시공자", "G3 설치", "waterReuse", ["제8조", "제9조"], ["시설 설치기록", "시운전 결과"]),
      step("설치완료 확인·가동개시·안전표지 확인", "광주시·관할 구청", "G4 확인·가동", "waterReuse", ["제8조", "제9조"], ["설치확인서", "가동개시 확인"]),
      step("재이용수 수질검사·사용량 계측·운영대장 관리", "수질검사·운영기관", "G5 운영관리", "waterReuse", "제10조", ["재이용수 수질검사 성적서", "사용량·운영대장"]),
      step("시설 변경·휴지·폐쇄 신고와 관망 안전조치", "사업시행자·건축주", "G5 운영관리", "waterReuse", ["제8조~제10조"], ["변경·폐쇄 신고", "관망 안전조치 확인"]),
    ],
    extras: [["P07", "P05", "loop", "수질기준 보완"]],
  },
  {
    priority: 563,
    slug: "ecosystem-conservation-charge-assessment",
    name: "생태계보전부담금 산정·부과·납부·반환",
    oneLiner: "개발사업의 자연환경 훼손면적 산정부터 인허가 통보, 생태계보전부담금 산정·부과·납부, 이의와 자연환경보전사업 반환까지의 경로",
    type: "생태계 훼손 부담금형",
    category: "기후·환경·에너지",
    whyFirst: "산단·종전부지 개발은 환경영향평가 협의와 별도로 훼손면적·지역계수에 따른 생태계보전부담금 부과·납부가 발생할 수 있다.",
    sourceKeys: ["natureConservation"],
    legalArticles: { natureConservation: "제46조~제50조" },
    lanes: ["사업시행자·납부의무자", "사업 인허가기관", "기후에너지환경부·광주시", "자연환경보전사업 대행자"],
    stages: ["G0 대상판정", "G1 훼손량산정", "G2 인허가통보", "G3 부과", "G4 납부·이의", "G5 반환"],
    nodes: [
      step("사업유형·환경영향평가·훼손면적별 부과대상 판정", "기후에너지환경부·광주시", "G0 대상판정", "natureConservation", "제46조", ["생태계보전부담금 적용판정서"]),
      step("토지피복·생태자연도·용도지역별 훼손면적 산정", "사업시행자·납부의무자", "G1 훼손량산정", "natureConservation", "제46조", ["생태계 훼손면적 산정도", "부과기초자료"]),
      step("개발사업 인허가 내용·사업자·면적 통보", "사업 인허가기관", "G2 인허가통보", "natureConservation", "제47조", ["개발사업 인허가 통보서"]),
      step("단위면적금액·지역계수 적용 부담금 산정", "기후에너지환경부·광주시", "G3 부과", "natureConservation", "제46조", ["생태계보전부담금 산정서"]),
      step("부담금 부과·분할납부 결정", "기후에너지환경부·광주시", "G3 부과", "natureConservation", ["제46조", "제48조"], ["부과통지서", "분할납부 결정"], "notice"),
      step("부담금 납부·정산·이의신청", "사업시행자·납부의무자", "G4 납부·이의", "natureConservation", ["제48조", "제49조"], ["납부확인", "이의신청 결정"]),
      step("자연환경보전사업 계획 승인·시행", "자연환경보전사업 대행자", "G5 반환", "natureConservation", "제50조", ["자연환경보전사업 승인서", "사업완료 보고"]),
      step("생태계보전부담금 반환 신청·결정", "기후에너지환경부·광주시", "G5 반환", "natureConservation", "제50조", ["부담금 반환신청서", "반환결정 통지"]),
    ],
    extras: [["P04", "P02", "loop", "훼손면적 재산정"]],
  },
  {
    priority: 564,
    slug: "metropolitan-transport-improvement-measures",
    name: "대규모 개발사업 광역교통개선대책",
    oneLiner: "대도시권·대규모 개발사업 적용판정부터 광역교통 수요예측, 개선대책 수립, 관계기관 협의·심의·확정, 재원분담과 이행점검까지의 경로",
    type: "광역교통 개선대책 협의형",
    category: "국토·교통·주거",
    whyFirst: "광주 대도시권의 대규모 산업단지는 개별 교통영향평가와 별도로 권역 간 간선교통·재원분담을 다루는 광역교통개선대책 대상이 될 수 있다.",
    sourceKeys: ["metroTransport"],
    legalArticles: { metroTransport: "제7조의2" },
    lanes: ["광주시·사업시행자", "국토교통부", "관계 지방자치단체·교통기관", "대도시권광역교통위원회"],
    stages: ["G0 대상판정", "G1 수요예측", "G2 대책수립", "G3 협의·심의", "G4 확정·재원", "G5 이행점검"],
    nodes: [
      step("대도시권 범위·사업유형·면적별 수립대상 판정", "국토교통부", "G0 대상판정", "metroTransport", "제7조의2", ["광역교통개선대책 적용판정서"]),
      step("광역 통행수요·간선망·대중교통 수용능력 분석", "광주시·사업시행자", "G1 수요예측", "metroTransport", "제7조의2", ["광역교통 수요예측서", "교통망 용량분석"]),
      step("도로·철도·환승·대중교통 개선대책과 단계별 사업 작성", "광주시·사업시행자", "G2 대책수립", "metroTransport", "제7조의2", ["광역교통개선대책안"]),
      step("관계 지자체·도로·철도·교통기관 협의", "관계 지방자치단체·교통기관", "G3 협의·심의", "metroTransport", "제7조의2", ["관계기관 협의의견", "조정안"]),
      step("대도시권광역교통위원회 심의·조정", "대도시권광역교통위원회", "G3 협의·심의", "metroTransport", "제7조의2", ["위원회 심의결과", "조정결과"], "gateway"),
      step("광역교통개선대책 확정·사업승인 조건 반영", "국토교통부", "G4 확정·재원", "metroTransport", "제7조의2", ["광역교통개선대책 확정통보", "사업승인 반영표"]),
      step("시설별 시행주체·재원분담·연차계획 확정", "광주시·사업시행자", "G4 확정·재원", "metroTransport", "제7조의2", ["재원분담 협약", "연차별 투자계획"]),
      step("개선대책 이행상황 점검·변경·시정", "국토교통부", "G5 이행점검", "metroTransport", "제7조의2", ["이행점검 결과", "변경·시정조치서"]),
    ],
    extras: [["P05", "P03", "loop", "관계기관 재조정"]],
  },
  {
    priority: 565,
    slug: "development-building-landscape-review",
    name: "개발사업·건축물 경관심의·협의",
    oneLiner: "산업단지·사회기반시설·대형건축물의 경관심의 대상 판정부터 경관계획·시뮬레이션 작성, 위원회 심의, 조건반영과 변경 재심의까지의 경로",
    type: "개발·건축 경관심의형",
    category: "국토·교통·주거",
    whyFirst: "종전부지 산업단지와 대형 팹·기반시설은 사업유형·입지·광주 조례 기준에 따라 계획승인·건축허가 전 별도 경관심의를 요구할 수 있다.",
    sourceKeys: ["landscape"],
    legalArticles: { landscape: "제26조~제28조" },
    lanes: ["사업시행자·건축주", "광주시 경관부서", "경관·건축 설계자", "광주시 경관위원회"],
    stages: ["G0 대상판정", "G1 사전협의", "G2 자료작성", "G3 심의", "G4 조건반영", "G5 변경·이행"],
    nodes: [
      step("개발사업·SOC·건축물별 법령·조례 심의대상 판정", "광주시 경관부서", "G0 대상판정", "landscape", ["제26조~제28조"], ["경관심의 적용판정서"]),
      step("경관목표·스카이라인·조망·가로·녹지 사전협의", "광주시 경관부서", "G1 사전협의", "landscape", ["제26조", "제27조"], ["경관 사전협의서"]),
      step("경관계획·배치도·조감도·시뮬레이션 작성", "경관·건축 설계자", "G2 자료작성", "landscape", ["제27조", "제28조"], ["경관계획서", "경관 시뮬레이션"]),
      step("개발사업 또는 건축물 경관심의 신청", "사업시행자·건축주", "G3 심의", "landscape", ["제27조", "제28조"], ["경관심의 신청서", "심의도서"]),
      step("경관위원회 심의·조건부 의결·재심의", "광주시 경관위원회", "G3 심의", "landscape", ["제27조", "제28조"], ["경관위원회 심의결과", "조건부 의결사항"], "gateway"),
      step("산단계획·실시설계·건축허가 도서에 조건 반영", "사업시행자·건축주", "G4 조건반영", "landscape", ["제26조~제28조"], ["경관심의 조건 반영표"]),
      step("중대한 계획·외관 변경 시 변경협의·재심의", "광주시 경관부서", "G5 변경·이행", "landscape", ["제27조", "제28조"], ["변경협의 결과", "재심의 의결서"]),
      step("준공 전 경관조건 이행확인·기록 인계", "광주시 경관부서", "G5 변경·이행", "landscape", ["제26조~제28조"], ["경관조건 이행확인서", "준공 경관기록"]),
    ],
    extras: [["P05", "P03", "loop", "경관계획 보완"]],
  },
  {
    priority: 566,
    slug: "mechanical-equipment-precheck-use-inspection",
    name: "기계설비 착공 전 확인·사용 전 검사",
    oneLiner: "대상 건축물·시설의 기계설비 적용판정부터 설계도서 착공 전 확인, 공사·감리, 사용 전 검사·보완과 유지관리자 인계까지의 경로",
    type: "기계설비 설계확인·검사형",
    category: "국토·교통·주거",
    whyFirst: "대형 반도체 팹의 공조·냉난방·급배수 기계설비는 건축허가·사용승인과 연계되지만 별도 확인신청서와 사용 전 검사확인증을 만든다.",
    sourceKeys: ["mechanical"],
    legalArticles: { mechanical: "제14조·제15조·제17조" },
    lanes: ["발주자·건축주", "기계설비 설계자·시공자", "광주시·관할 구청", "기계설비 감리·유지관리자"],
    stages: ["G0 대상판정", "G1 설계", "G2 착공전확인", "G3 시공·감리", "G4 사용전검사", "G5 운영인계"],
    nodes: [
      step("건축물 용도·연면적·시설별 확인·검사 대상 판정", "광주시·관할 구청", "G0 대상판정", "mechanical", "제15조", ["기계설비 확인·검사 적용판정서"]),
      step("기계설비 기술기준 반영 설계도서 작성", "기계설비 설계자·시공자", "G1 설계", "mechanical", "제14조", ["기계설비 설계도서", "기술기준 적합성표"]),
      step("착공 전 설계도 확인 신청·보완·결과 통보", "광주시·관할 구청", "G2 착공전확인", "mechanical", "제15조", ["착공 전 확인신청서", "확인결과 통보서"]),
      step("확인 설계에 따른 공사·감리·변경관리", "기계설비 감리·유지관리자", "G3 시공·감리", "mechanical", ["제14조", "제15조"], ["기계설비 감리기록", "설계변경 확인서"]),
      step("공사완료·성능시험·사용 전 검사 신청", "발주자·건축주", "G4 사용전검사", "mechanical", "제15조", ["성능시험 성적서", "기계설비 사용 전 검사신청서"]),
      step("현장검사·보완·사용 전 검사 확인증 발급", "광주시·관할 구청", "G4 사용전검사", "mechanical", "제15조", ["검사결과", "기계설비 사용 전 검사 확인증"], "gateway"),
      step("유지관리기준·성능점검계획·도서 인계", "기계설비 감리·유지관리자", "G5 운영인계", "mechanical", "제17조", ["기계설비 유지관리계획", "준공도서 인계서"]),
      step("유지관리자 선임·정기 성능점검 체계 가동", "발주자·건축주", "G5 운영인계", "mechanical", "제17조", ["기계설비유지관리자 선임신고", "성능점검대장"]),
    ],
    extras: [["P06", "P04", "loop", "검사 보완"]],
  },
  {
    priority: 567,
    slug: "ict-construction-design-precheck-use-inspection",
    name: "정보통신공사 설계도 확인·사용전검사",
    oneLiner: "건축물 정보통신공사의 대상 판정부터 설계·감리, 착공 전 설계도 확인, 시공·시험, 사용전검사와 검사필증 발급까지의 경로",
    type: "정보통신공사 설계확인·검사형",
    category: "데이터·디지털·공공서비스",
    whyFirst: "팹의 구내통신·방송·네트워크·배관설비는 건축 사용승인과 연계되지만 별도 착공 전 확인결과 통보서와 사용전검사필증을 요구한다.",
    sourceKeys: ["ictConstruction"],
    legalArticles: { ictConstruction: "제6조·제8조·제36조" },
    lanes: ["발주자·건축주", "정보통신 설계자·감리원", "정보통신공사업자", "광주시·관할 구청"],
    stages: ["G0 대상판정", "G1 설계·감리", "G2 착공전확인", "G3 시공·시험", "G4 사용전검사", "G5 준공인계"],
    nodes: [
      step("공사종류·건축물 규모별 설계확인·검사 대상 판정", "광주시·관할 구청", "G0 대상판정", "ictConstruction", "제36조", ["정보통신공사 확인·검사 적용판정서"]),
      step("기술기준 반영 설계·감리 대상과 감리원 배치 확정", "정보통신 설계자·감리원", "G1 설계·감리", "ictConstruction", ["제6조", "제8조"], ["정보통신공사 설계도서", "감리원 배치계획"]),
      step("착공 전 설계도 확인 신청·결과 통보", "광주시·관할 구청", "G2 착공전확인", "ictConstruction", "제36조", ["착공 전 설계도 확인신청서", "확인결과 통보서"]),
      step("등록 공사업자 시공·감리·설계변경 관리", "정보통신공사업자", "G3 시공·시험", "ictConstruction", ["제8조", "제36조"], ["시공·감리일지", "설계변경 기록"]),
      step("구내통신·방송·접지·배관 성능시험", "정보통신 설계자·감리원", "G3 시공·시험", "ictConstruction", "제36조", ["정보통신설비 시험성적서"]),
      step("사용전검사 신청·현장검사·보완", "광주시·관할 구청", "G4 사용전검사", "ictConstruction", "제36조", ["사용전검사 신청서", "현장검사 결과"]),
      step("정보통신공사 사용전검사필증 발급", "광주시·관할 구청", "G4 사용전검사", "ictConstruction", "제36조", ["정보통신공사 사용전검사필증"], "gateway"),
      step("준공도면·시험기록·유지관리 자료 인계", "발주자·건축주", "G5 준공인계", "ictConstruction", "제36조", ["정보통신 준공도면", "유지관리 자료 인계서"]),
    ],
    extras: [["P07", "P04", "loop", "부적합 재시공"]],
  },
  {
    priority: 568,
    slug: "elevator-installation-safety-inspection",
    name: "승강기 설치신고·설치검사·안전관리",
    oneLiner: "승강기 설계·설치부터 설치신고, 설치검사·합격, 안전관리자 선임, 자체점검과 정기·수시검사까지의 경로",
    type: "승강기 설치·안전검사형",
    category: "보건·안전·과학기술",
    whyFirst: "대형 팹·업무시설의 승강기는 건축 사용승인과 연계되지만 설치신고·설치검사 합격과 운영단계 안전관리 기록을 별도로 만든다.",
    sourceKeys: ["elevator"],
    legalArticles: { elevator: "제27조~제32조" },
    lanes: ["건축주·관리주체", "승강기 제조·설치공사업자", "한국승강기안전공단·검사기관", "승강기 안전관리자"],
    stages: ["G0 설계판정", "G1 설치", "G2 신고·검사", "G3 합격·인계", "G4 안전관리", "G5 정기검사"],
    nodes: [
      step("승강기 종류·용도·대수별 안전기준·검사 경로 판정", "승강기 제조·설치공사업자", "G0 설계판정", "elevator", "제28조", ["승강기 설치·검사 적용판정서"]),
      step("안전인증 모델 선정·승강로·기계실 인터페이스 설계", "승강기 제조·설치공사업자", "G1 설치", "elevator", "제28조", ["승강기 설치설계도", "안전기준 적합성표"]),
      step("승강기 설치공사·자체 시험", "승강기 제조·설치공사업자", "G1 설치", "elevator", "제27조", ["설치공사 기록", "자체 시험성적서"]),
      step("설치완료 신고·설치검사 신청", "승강기 제조·설치공사업자", "G2 신고·검사", "elevator", ["제27조", "제28조"], ["승강기 설치신고", "설치검사 신청서"]),
      step("설치검사·보완·합격증명 발급", "한국승강기안전공단·검사기관", "G3 합격·인계", "elevator", "제28조", ["설치검사 결과", "설치검사 합격증명"], "gateway"),
      step("관리주체 확정·안전관리자 선임·통보", "건축주·관리주체", "G4 안전관리", "elevator", "제29조", ["승강기 안전관리자 선임통보", "관리교육 이수확인"]),
      step("월별 자체점검·결함보수·정보망 입력", "승강기 안전관리자", "G4 안전관리", "elevator", "제31조", ["승강기 자체점검 기록", "보수·운행중지 기록"]),
      step("정기·수시·정밀안전검사와 시정조치", "한국승강기안전공단·검사기관", "G5 정기검사", "elevator", "제32조", ["승강기 안전검사 결과", "시정조치 이행서"]),
    ],
    extras: [["P08", "P07", "loop", "검사 시정조치"]],
  },
  {
    priority: 569,
    slug: "heat-use-equipment-installation-inspection",
    name: "검사대상 열사용기기 설치·계속사용검사",
    oneLiner: "보일러·압력용기 등 검사대상기기 판정부터 제조·수입검사 확인, 설치·개조검사, 검사증 발급, 관리자 선임과 계속사용검사까지의 경로",
    type: "열사용기기 설치·정기검사형",
    category: "기후·환경·에너지",
    whyFirst: "반도체 팹의 보일러·압력용기·열사용설비는 일반 기계설비 사용전검사와 별도로 검사대상기기 설치검사와 계속사용검사가 필요할 수 있다.",
    sourceKeys: ["energy"],
    legalArticles: { energy: "제39조·제39조의2·제40조" },
    lanes: ["검사대상기기 설치자", "제조·수입업자", "한국에너지공단·검사기관", "검사대상기기관리자"],
    stages: ["G0 대상판정", "G1 제조검사", "G2 설치·신청", "G3 설치검사", "G4 관리자선임", "G5 계속사용"],
    nodes: [
      step("기기종류·용량·압력별 검사대상기기 판정", "한국에너지공단·검사기관", "G0 대상판정", "energy", "제39조", ["검사대상기기 적용판정서"]),
      step("국내 제조·수입기기 제조검사·검사증 확인", "제조·수입업자", "G1 제조검사", "energy", ["제39조", "제39조의2"], ["제조·수입검사증", "기기 제작도서"]),
      step("설치·개조·설치장소 변경 설계와 공사", "검사대상기기 설치자", "G2 설치·신청", "energy", "제39조", ["검사대상기기 설치도면", "설치·개조 기록"]),
      step("설치·개조·재사용검사 신청", "검사대상기기 설치자", "G2 설치·신청", "energy", "제39조", ["검사대상기기 설치검사 신청서"]),
      step("구조·안전·운전성능 검사·보완", "한국에너지공단·검사기관", "G3 설치검사", "energy", "제39조", ["설치검사 결과", "보완조치서"]),
      step("검사합격증 발급·사용개시", "한국에너지공단·검사기관", "G3 설치검사", "energy", "제39조", ["검사대상기기 검사증", "사용개시 확인"], "gateway"),
      step("검사대상기기관리자 선임·신고", "검사대상기기관리자", "G4 관리자선임", "energy", "제40조", ["검사대상기기관리자 선임신고"]),
      step("계속사용검사·운전성능검사·유효기간 관리", "한국에너지공단·검사기관", "G5 계속사용", "energy", "제39조", ["계속사용검사 결과", "검사 유효기간 관리대장"]),
    ],
    extras: [["P08", "P05", "loop", "계속사용검사 보완"]],
  },
  {
    priority: 570,
    slug: "environmental-liability-insurance-coverage",
    name: "환경책임보험 가입·인허가 연계확인",
    oneLiner: "특정대기·수질유해물질·지정폐기물 등 의무가입 대상 판정부터 위험정보 작성, 보험계약, 가입증명 제출, 인허가 확인과 갱신·사고처리까지의 경로",
    type: "환경책임보험 의무가입형",
    category: "기후·환경·에너지",
    whyFirst: "특정 유해물질 배출시설 등을 운영하는 팹은 환경허가와 별도로 환경책임보험에 가입하고 인허가기관에 가입증명서를 제출해야 한다.",
    sourceKeys: ["environmentalLiability"],
    legalArticles: { environmentalLiability: "제17조~제20조" },
    lanes: ["입주기업·시설사업자", "환경책임보험사업단·보험자", "환경 인허가기관", "기후에너지환경부·운영기관"],
    stages: ["G0 대상판정", "G1 위험정보", "G2 계약", "G3 인허가확인", "G4 갱신관리", "G5 사고·보상"],
    nodes: [
      step("시설·유해물질·폐기물·위험도별 의무가입 대상 판정", "환경 인허가기관", "G0 대상판정", "environmentalLiability", "제17조", ["환경책임보험 적용판정서"]),
      step("시설종류·규모·오염물질·인허가 위험정보 작성", "입주기업·시설사업자", "G1 위험정보", "environmentalLiability", "제17조", ["환경위험 정보서", "보험가입 기초자료"]),
      step("보장금액·범위·자기부담금 산정과 가입신청", "입주기업·시설사업자", "G2 계약", "environmentalLiability", ["제17조", "제18조"], ["환경책임보험 가입신청서", "보험료 산정서"]),
      step("환경책임보험 계약체결·가입증명서 발급", "환경책임보험사업단·보험자", "G2 계약", "environmentalLiability", "제18조", ["환경책임보험 계약서", "가입증명서"], "gateway"),
      step("환경 인허가기관 가입 여부 확인·증명서 제출", "환경 인허가기관", "G3 인허가확인", "environmentalLiability", "제19조", ["보험가입 확인결과", "인허가 연계확인"]),
      step("시설·물질·배출량 변경 시 보험조건 조정", "입주기업·시설사업자", "G4 갱신관리", "environmentalLiability", ["제17조", "제19조"], ["보험조건 변경신청", "변경계약"]),
      step("계약 갱신·해지 통보·무보험 공백 점검", "기후에너지환경부·운영기관", "G4 갱신관리", "environmentalLiability", "제19조", ["보험 갱신확인", "가입상태 점검결과"]),
      step("환경오염사고 통지·손해사정·보험금 지급", "환경책임보험사업단·보험자", "G5 사고·보상", "environmentalLiability", "제20조", ["환경사고 통지서", "손해사정 결과", "보험금 지급결정"]),
    ],
    extras: [["P07", "P03", "loop", "보험조건 재산정"]],
  },
  {
    priority: 571,
    slug: "odor-emission-facility-report-management",
    name: "악취배출시설 신고·방지계획·개선명령",
    oneLiner: "악취관리지역·신고대상시설 적용판정부터 배출시설 신고, 악취방지계획, 시설 설치·가동, 측정·기준준수와 개선명령 이행까지의 경로",
    type: "악취배출시설 신고·관리형",
    category: "기후·환경·에너지",
    whyFirst: "약품·폐수·폐기물 처리공정이 악취관리지역 또는 신고대상시설에 해당하면 일반 대기허가와 별도로 악취배출시설 신고와 방지계획이 필요하다.",
    sourceKeys: ["odor"],
    legalArticles: { odor: "제8조·제8조의2·제10조" },
    lanes: ["입주기업·시설운영자", "광주시·관할 구청", "악취방지시설 설계·시공자", "측정대행기관"],
    stages: ["G0 대상판정", "G1 방지계획", "G2 설치신고", "G3 시설설치", "G4 측정·운영", "G5 개선·변경"],
    nodes: [
      step("악취관리지역·지정고시·시설종류별 신고대상 판정", "광주시·관할 구청", "G0 대상판정", "odor", ["제8조", "제8조의2"], ["악취배출시설 신고 적용판정서"]),
      step("악취물질·농도·발생량 예측과 방지계획 작성", "입주기업·시설운영자", "G1 방지계획", "odor", ["제8조", "제8조의2"], ["악취발생 예측서", "악취방지계획서"]),
      step("악취배출시설 설치·운영 신고·변경신고", "입주기업·시설운영자", "G2 설치신고", "odor", ["제8조", "제8조의2"], ["악취배출시설 설치·운영 신고서"]),
      step("신고 검토·수리와 방지조치 조건 통보", "광주시·관할 구청", "G2 설치신고", "odor", ["제8조", "제8조의2"], ["신고 수리결과", "악취방지 조치조건"], "gateway"),
      step("포집·세정·흡착 등 악취방지시설 설치·가동", "악취방지시설 설계·시공자", "G3 시설설치", "odor", "제8조", ["악취방지시설 설치기록", "시운전 결과"]),
      step("복합·지정악취 측정·운영기록·민원관리", "측정대행기관", "G4 측정·운영", "odor", ["제8조", "제10조"], ["악취 측정성적서", "운영·민원관리대장"]),
      step("배출허용기준 초과 개선명령·조치확인", "광주시·관할 구청", "G5 개선·변경", "odor", "제10조", ["악취 개선명령", "개선조치 확인서"]),
      step("원료·공정·방지시설 변경신고와 폐쇄관리", "입주기업·시설운영자", "G5 개선·변경", "odor", ["제8조", "제8조의2"], ["악취배출시설 변경신고", "폐쇄신고"]),
    ],
    extras: [["P07", "P05", "loop", "악취방지 재설계"]],
  },
  {
    priority: 572,
    slug: "land-development-cadastral-confirmation",
    name: "토지개발사업 착수·완료신고·지적확정측량",
    oneLiner: "산업단지 개발사업의 착수신고부터 지적확정측량 계획, 경계·면적 성과검사, 완료신고, 토지이동 신청과 지적공부·등기 정리까지의 경로",
    type: "토지개발 지적확정·등록형",
    category: "국토·교통·주거",
    whyFirst: "산단 조성공사가 끝나도 지적확정측량과 토지이동·지적공부 정리가 완료되지 않으면 필지별 권리이전·입주·담보 설정이 지연될 수 있다.",
    sourceKeys: ["spatialInformation"],
    legalArticles: { spatialInformation: "제86조" },
    lanes: ["산업단지 사업시행자", "지적측량수행자", "광주시·지적소관청", "등기관서·토지소유자"],
    stages: ["G0 사업신고", "G1 측량계획", "G2 지적확정", "G3 성과검사", "G4 완료·이동", "G5 공부·등기"],
    nodes: [
      step("산업단지개발사업 착수·변경 사실 지적소관청 신고", "산업단지 사업시행자", "G0 사업신고", "spatialInformation", "제86조", ["토지개발사업 착수·변경 신고서"]),
      step("사업경계·필지계획·기준점·측량일정 확정", "지적측량수행자", "G1 측량계획", "spatialInformation", "제86조", ["지적확정측량 수행계획", "예정지적도"]),
      step("준공경계·필지·지목·면적 지적확정측량", "지적측량수행자", "G2 지적확정", "spatialInformation", "제86조", ["지적확정측량 성과도", "필지별 면적조서"]),
      step("측량성과 검사·경계·면적 오류 보완", "광주시·지적소관청", "G3 성과검사", "spatialInformation", "제86조", ["지적측량성과 검사결과", "보완성과도"], "gateway"),
      step("토지개발사업 완료 사실 신고", "산업단지 사업시행자", "G4 완료·이동", "spatialInformation", "제86조", ["토지개발사업 완료신고서"]),
      step("분할·합병·지목변경 등 토지이동 신청", "산업단지 사업시행자", "G4 완료·이동", "spatialInformation", "제86조", ["토지이동 신청서", "토지이동 정리내역"]),
      step("지적공부 정리·새 지번·면적 확정", "광주시·지적소관청", "G5 공부·등기", "spatialInformation", "제86조", ["지적공부 정리결과", "신규 지번부여 조서"]),
      step("등기촉탁·권리이전·입주필지 인계", "등기관서·토지소유자", "G5 공부·등기", "spatialInformation", "제86조", ["등기촉탁서", "권리이전 결과", "입주필지 인계서"]),
    ],
    extras: [["P04", "P03", "loop", "측량성과 보완"]],
  },
  {
    priority: 573,
    slug: "dedicated-industrial-waterworks-authorization",
    name: "전용상수도·전용공업용수도 설치인가",
    oneLiner: "공공용수 외 자체 취수·정수·공업용수 시설의 전용수도 적용판정부터 설치인가, 시설공사·검사, 수질·관리자 운영과 변경·폐지까지의 경로",
    type: "전용수도 설치인가·운영형",
    category: "기후·환경·에너지",
    whyFirst: "공업용수도 공급만으로 수요를 충족하지 못해 자체 전용상수도·전용공업용수도를 두는 경우 별도 설치인가와 수질·운영관리가 필요하다.",
    sourceKeys: ["waterSupply"],
    legalArticles: { waterSupply: "제52조~제54조·제61조" },
    lanes: ["입주기업·전용수도 설치자", "광주시·인가권자", "수도시설 설계·시공자", "수질검사기관·수도시설관리자"],
    stages: ["G0 경로판정", "G1 기본설계", "G2 설치인가", "G3 시설공사", "G4 검사·급수", "G5 운영·변경"],
    nodes: [
      step("급수대상·취수원·처리용량별 전용수도 적용판정", "광주시·인가권자", "G0 경로판정", "waterSupply", ["제52조", "제54조"], ["전용수도 설치인가 적용판정서"]),
      step("취수·정수·배수시설 기본설계와 수질확보계획", "수도시설 설계·시공자", "G1 기본설계", "waterSupply", ["제52조", "제54조"], ["전용수도 기본설계", "수질확보계획"]),
      step("전용상수도·전용공업용수도 설치인가 신청", "입주기업·전용수도 설치자", "G2 설치인가", "waterSupply", ["제52조", "제54조"], ["전용수도 설치인가 신청서"]),
      step("수원·시설·관리기준 심사와 설치인가", "광주시·인가권자", "G2 설치인가", "waterSupply", ["제52조", "제54조"], ["전용수도 설치인가서", "인가조건"], "gateway"),
      step("취수·정수·배수시설 공사와 공정검사", "수도시설 설계·시공자", "G3 시설공사", "waterSupply", ["제52조", "제54조"], ["시설공사 기록", "공정검사 결과"]),
      step("시설완료 확인·수질검사·급수개시", "수질검사기관·수도시설관리자", "G4 검사·급수", "waterSupply", ["제53조", "제54조"], ["준공·시설확인", "수질검사 성적서", "급수개시 확인"]),
      step("수도시설관리자·위생조치·정기 수질관리", "수질검사기관·수도시설관리자", "G5 운영·변경", "waterSupply", ["제53조", "제54조"], ["수도시설 운영대장", "정기 수질검사 결과"]),
      step("중요사항 변경인가·휴지·폐지 신고", "입주기업·전용수도 설치자", "G5 운영·변경", "waterSupply", ["제52조", "제54조"], ["변경인가·신고 결과", "휴지·폐지 신고"]),
    ],
    extras: [["P06", "P05", "loop", "수질·시설 보완"]],
  },
];

function buildInstitution(spec) {
  const sources = spec.sourceKeys.map((key) => S[key]);
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
      legalBasis: spec.sourceKeys.map((key) => ({ law: S[key].law, articles: spec.legalArticles[key], kind: S[key].kind })),
      authorities: spec.lanes.map((name) => ({ name, role: spec.name + "의 해당 레인 업무와 산출물 작성·검토·결정을 담당" })),
      procedure,
      moneyFlow: "수수료·검사비·부담금·보험료는 적용 규모와 현행 하위법령·조례·고시에서 확정한다.",
      docsFlow: procedure.join(" → "),
      bottlenecks: [
        "사업면적·시설규모·공법·용량·배출특성 등 적용 문턱의 미확정",
        "관계기관 보완자료와 설계·착공·준공·가동 일정의 불일치",
        "신고·심의·검사·부과 조건이 후속 공정과 운영조직에 인계되지 않는 단절",
      ],
      reformPoints: [
        "사업·시설·건축물 식별자로 신고·심의·검사·부과 산출물을 연결",
        "적용 문턱 판정근거와 보완요구를 통합 마스터 일정에서 추적",
        "조건부 의결·검사조건을 설계변경·준공·가동 점검사항으로 구조화",
      ],
    },
    related: specs.filter((item) => item.slug !== spec.slug && item.category === spec.category).slice(0, 4).map((item) => item.name),
    fieldVerification: [
      spec.name + "의 최신 시행령·시행규칙·광주광역시 조례·고시·제출서식",
      "사업면적·건축물·시설종류·용량·지역지정별 적용 문턱과 의제·면제 요건",
      "관계기관별 실제 접수시점·처리기간·보완횟수·전산접수 경로",
      "신고·심의·검사 이후 변경·이행점검·갱신·폐지의 현장 운영기준",
    ],
    process: {
      institution_name: spec.name,
      law_name: sources.map((source) => source.law).join(" · "),
      lanes: spec.lanes,
      stages: spec.stages,
      nodes: spec.nodes.map(buildNode),
      edges: sequenceEdges(spec.nodes.length, spec.extras),
      warnings: [
        "법제처 국가법령정보의 2026-08-17 현재 법령 식별자·공포일·시행일과 핵심 조문을 대조했다.",
        "광주 반도체클러스터 적용 여부는 확정 사업구역·시설규모·공법·배출특성·지역지정과 현행 하위법령·조례 문턱에 따라 달라지므로 프로젝트 연결에서는 후보(TPL)와 확정 적용을 구분한다.",
      ],
    },
    verification: {
      status: "source-linked",
      verifiedAt: AS_OF,
      method: "법제처 국가법령정보의 현행 법령 검색·조문 조회 결과와 공식 법령 원문 연결",
      scope: "현행 법률의 식별자·공포일·시행일과 독립 신고·심의·검사·부과·완료확인 산출물을 만드는 핵심 조문을 대조했다. 하위법령·광주광역시 조례·고시·서식의 전수 검증은 현장확인 항목으로 분리했다.",
      notes: ["광주 반도체클러스터 행정절차 3차 전수감사에서 기존 556개 카탈로그 및 66개 프로젝트 연결과 중복되지 않는 공백 17개를 추가했다."],
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
  console.log("generated " + specs.length + " audited mega-project gap institutions; manifest=" + manifest.length);
  specs.forEach((spec) => console.log(spec.priority + "\t" + spec.slug + "\t" + spec.name + "\t" + spec.nodes.length + " nodes"));
}

main();
