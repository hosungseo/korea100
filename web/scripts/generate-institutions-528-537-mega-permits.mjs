#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const MANIFEST_PATH = path.join(REPO_DIR, "docs", "institutions-100-manifest.json");
const AS_OF = "2026-08-16";
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
    officialUrl: `https://law.go.kr/법령/${urlName}`,
  };
}

const S = {
  gwangjuAirport: statute(
    "광주 군 공항 이전 및 종전부지 개발 등에 관한 특별법",
    "014429",
    "284123",
    "2026-03-05",
    "2026-07-01",
    "광주군공항이전및종전부지개발등에관한특별법",
  ),
  militaryAirport: statute(
    "군 공항 이전 및 지원에 관한 특별법",
    "011825",
    "276297",
    "2025-10-01",
    "2026-01-02",
    "군공항이전및지원에관한특별법",
  ),
  industrialFastTrack: statute(
    "산업단지 인ㆍ허가 절차 간소화를 위한 특례법",
    "010759",
    "276999",
    "2025-10-01",
    "2025-10-01",
    "산업단지인ㆍ허가절차간소화를위한특례법",
  ),
  disasterImpact: statute(
    "자연재해대책법",
    "000959",
    "276321",
    "2025-10-01",
    "2026-01-02",
    "자연재해대책법",
  ),
  trafficImpact: statute(
    "도시교통정비 촉진법",
    "001754",
    "284063",
    "2026-03-05",
    "2026-07-01",
    "도시교통정비촉진법",
  ),
  energyUse: statute(
    "에너지이용 합리화법",
    "001867",
    "276559",
    "2025-10-01",
    "2026-05-28",
    "에너지이용합리화법",
  ),
  occupationalSafety: statute(
    "산업안전보건법",
    "001766",
    "283449",
    "2026-02-19",
    "2026-08-01",
    "산업안전보건법",
  ),
  dangerousMaterials: statute(
    "위험물안전관리법",
    "009502",
    "259933",
    "2024-02-06",
    "2025-08-07",
    "위험물안전관리법",
  ),
  highPressureGas: statute(
    "고압가스 안전관리법",
    "001850",
    "283919",
    "2026-03-10",
    "2026-03-10",
    "고압가스안전관리법",
  ),
  fireConstruction: statute(
    "소방시설공사업법",
    "009500",
    "259473",
    "2024-01-30",
    "2025-01-31",
    "소방시설공사업법",
  ),
};

function step(name, lane, stage, sourceKey, articles, outputDocuments, extra = {}) {
  return { name, lane, stage, sourceKey, articles, outputDocuments, ...extra };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function buildNode(raw, index) {
  const source = S[raw.sourceKey];
  const legalBasis = raw.articles.map((article) => ({
    law: source.law,
    article,
    text: `${source.law} ${article}에 따른 절차와 산출물. 적용 범위와 세부 서식은 현행 하위 법령ㆍ고시를 함께 확인한다.`,
  }));
  const status = index < 2 ? "done" : index === 2 ? "current" : "waiting";
  return {
    id: `P${pad(index + 1)}`,
    name: raw.name,
    lane: raw.lane,
    stage: raw.stage,
    type: raw.type ?? "task",
    status,
    progress: status === "done" ? 100 : status === "current" ? 40 : 0,
    actor: raw.actor ?? raw.lane,
    action: raw.action ?? `${raw.name}에 필요한 자료를 확인하고 법정 산출물을 다음 담당기관에 인계한다.`,
    output_documents: raw.outputDocuments,
    confidence: 0.9,
    legal_basis: legalBasis,
  };
}

function sequenceEdges(nodeCount, extras = []) {
  const edges = [];
  for (let index = 1; index < nodeCount; index += 1) {
    edges.push({
      id: `E${pad(index)}`,
      source: `P${pad(index)}`,
      target: `P${pad(index + 1)}`,
      type: "sequence",
      label: null,
    });
  }
  extras.forEach(([source, target, type, label], index) => {
    edges.push({
      id: `${type === "loop" ? "L" : "M"}${pad(index + 1)}`,
      source,
      target,
      type,
      label,
    });
  });
  return edges;
}

const specs = [
  {
    priority: 528,
    slug: "military-airport-relocation-site-selection",
    name: "군 공항 이전부지 선정·지원계획·사업이행",
    oneLiner: "이전건의와 예비이전후보지 선정부터 주민투표·유치신청·최종 이전부지 선정, 기부 대 양여와 지원사업 승인까지의 군 공항 이전 경로",
    type: "이전부지 선정·지원사업형",
    category: "국방·보훈·병무",
    whyFirst: "예비후보지, 선정계획, 주민투표, 최종부지, 기부 대 양여와 지원사업은 서로 다른 법정 산출물이며 종전부지 개발의 선행조건을 이룬다.",
    sourceKeys: ["militaryAirport", "gwangjuAirport"],
    legalArticles: {
      militaryAirport: "제4조~제9조, 제11조, 제13조~제15조, 제23조~제24조",
      gwangjuAirport: "제6조~제8조",
    },
    lanes: ["종전부지 지방자치단체", "국방부", "선정·지원위원회", "이전지역 주민·지방자치단체", "사업시행자"],
    stages: ["G0 이전건의", "G1 후보지", "G2 계획공고", "G3 주민결정", "G4 사업·재원", "G5 건설·인계"],
    nodes: [
      step("군 공항 이전건의서 제출", "종전부지 지방자치단체", "G0 이전건의", "militaryAirport", ["제4조"], ["군 공항 이전건의서"]),
      step("예비이전후보지 관계기관 협의", "국방부", "G1 후보지", "militaryAirport", ["제4조"], ["관계기관 협의결과"]),
      step("예비이전후보지 선정·공표", "국방부", "G1 후보지", "militaryAirport", ["제4조"], ["예비이전후보지 선정결과"], { type: "notice" }),
      step("이전후보지·종전부지 활용·지원계획 작성", "국방부", "G2 계획공고", "militaryAirport", ["제6조·제7조·제11조"], ["이전부지 선정계획", "종전부지 활용계획", "이전주변지역 지원계획"]),
      step("선정·지원위원회 심의 및 계획 공고", "선정·지원위원회", "G2 계획공고", "militaryAirport", ["제6조·제7조·제11조"], ["위원회 심의결과", "선정·지원계획 공고"], { type: "gateway" }),
      step("주민투표 실시", "이전지역 주민·지방자치단체", "G3 주민결정", "militaryAirport", ["제8조"], ["주민투표 결과"]),
      step("유치신청 제출", "이전지역 주민·지방자치단체", "G3 주민결정", "militaryAirport", ["제8조"], ["군 공항 유치신청서"]),
      step("최종 이전부지 선정", "선정·지원위원회", "G3 주민결정", "militaryAirport", ["제8조"], ["최종 이전부지 선정결정"], { type: "notice" }),
      step("사업시행자·기부 대 양여·재원계획 확정", "사업시행자", "G4 사업·재원", "militaryAirport", ["제9조"], ["사업시행·재원계획", "기부 대 양여 협약"], { type: "gateway" }),
      step("이전주변지역 지원계획 공청회·확정", "선정·지원위원회", "G4 사업·재원", "militaryAirport", ["제11조"], ["공청회 결과", "확정 지원계획"]),
      step("지원사업 승인·인허가 의제", "국방부", "G4 사업·재원", "militaryAirport", ["제13조·제14조"], ["지원사업 승인서", "인허가 의제 목록"]),
      step("대체공항 건설·기능이전·종전부지 인계", "사업시행자", "G5 건설·인계", "gwangjuAirport", ["제6조·제7조"], ["대체공항 준공확인", "기능이전 확인", "종전부지 인계서"]),
    ],
    extras: [["P05", "P04", "loop", "계획 보완"], ["P11", "P12", "message", "승인조건 인계"]],
  },
  {
    priority: 529,
    slug: "former-airport-site-development-plan",
    name: "광주 군공항 종전부지 개발계획·실시계획",
    oneLiner: "종전부지 개발사업시행자 지정과 개발계획 수립·고시, 설계·재원·평가를 반영한 실시계획 수립·고시 및 인허가 의제 관리 경로",
    type: "종전부지 개발계획·의제형",
    category: "국토·교통·주택",
    whyFirst: "광주 군공항 특별법은 개발계획과 실시계획을 각각 독립 산출물로 두며 실시계획 고시 때 32개 분야 인허가 의제가 발생한다.",
    sourceKeys: ["gwangjuAirport"],
    legalArticles: { gwangjuAirport: "제8조~제11조" },
    lanes: ["개발사업시행자", "종전부지 지방자치단체", "관계 행정기관"],
    stages: ["G0 시행자", "G1 개발계획", "G2 공고·열람", "G3 실시계획", "G4 평가·협의", "G5 고시·의제"],
    nodes: [
      step("개발사업시행자 지정·역할 확정", "종전부지 지방자치단체", "G0 시행자", "gwangjuAirport", ["제8조"], ["개발사업시행자 지정·확인"]),
      step("종전부지 개발계획 작성", "개발사업시행자", "G1 개발계획", "gwangjuAirport", ["제9조"], ["종전부지 개발계획안"]),
      step("종전부지 지방자치단체 사전협의·제출", "개발사업시행자", "G1 개발계획", "gwangjuAirport", ["제9조제1항"], ["사전협의 결과", "개발계획 제출서"]),
      step("개발계획 고시·일반 열람", "종전부지 지방자치단체", "G2 공고·열람", "gwangjuAirport", ["제9조제2항"], ["개발계획 고시", "열람 기록"], { type: "notice" }),
      step("설계도서·재원조달 포함 실시계획 작성", "개발사업시행자", "G3 실시계획", "gwangjuAirport", ["제10조제1항·제2항"], ["종전부지 개발사업 실시계획안"]),
      step("교통 개선사항·환경영향평가 결과 반영", "개발사업시행자", "G4 평가·협의", "gwangjuAirport", ["제10조제3항"], ["교통·환경 반영표"]),
      step("32개 분야 인허가 의제자료 취합", "개발사업시행자", "G4 평가·협의", "gwangjuAirport", ["제11조"], ["인허가 의제 협의자료", "법정요건 충족표"]),
      step("관계 행정기관 실체요건 협의", "관계 행정기관", "G4 평가·협의", "gwangjuAirport", ["제11조제2항"], ["관계기관 협의의견"], { type: "gateway" }),
      step("실시계획 고시·일반 열람", "종전부지 지방자치단체", "G5 고시·의제", "gwangjuAirport", ["제10조제4항"], ["실시계획 고시", "열람 기록"], { type: "notice" }),
      step("인허가 의제 결과·조건 사후관리", "관계 행정기관", "G5 고시·의제", "gwangjuAirport", ["제11조"], ["의제 인허가 목록", "조건·사후관리 기록"]),
    ],
    extras: [["P08", "P07", "loop", "요건 보완"], ["P09", "P10", "message", "고시·의제 결과"]],
  },
  {
    priority: 530,
    slug: "industrial-complex-fast-track-plan-approval",
    name: "산업단지계획 신속승인·통합조정",
    oneLiner: "투자의향 제출과 산업단지계획 승인신청부터 주민의견, 동시협의, 통합조정·기술검토·심의위원회 및 승인고시까지의 산단 신속승인 경로",
    type: "산단 통합심의·신속승인형",
    category: "국토·교통·주택",
    whyFirst: "산단 인허가 간소화법은 동시협의, 통합조정회의, 기술검토와 산단계획심의위원회를 독립 통제점으로 두고 6개월 승인 목표를 규정한다.",
    sourceKeys: ["industrialFastTrack"],
    legalArticles: { industrialFastTrack: "제7조~제16조, 제23조" },
    lanes: ["민간기업·개발사업자", "산업단지 지정권자", "관계 행정기관", "산업단지계획심의위원회"],
    stages: ["G0 투자의향", "G1 계획·신청", "G2 공람·협의", "G3 조정·검토", "G4 심의", "G5 승인·고시"],
    nodes: [
      step("산업단지 투자의향서 제출", "민간기업·개발사업자", "G0 투자의향", "industrialFastTrack", ["제7조"], ["투자의향서"]),
      step("산업단지계획·평가 첨부자료 작성", "민간기업·개발사업자", "G1 계획·신청", "industrialFastTrack", ["제8조"], ["산업단지계획안", "환경·교통·재해·에너지 첨부자료"]),
      step("산업단지계획 승인 신청", "민간기업·개발사업자", "G1 계획·신청", "industrialFastTrack", ["제8조"], ["산업단지계획 승인신청서"]),
      step("주민·관계전문가 공고·공람·의견청취", "산업단지 지정권자", "G2 공람·협의", "industrialFastTrack", ["제9조"], ["공고·공람 기록", "주민·전문가 의견서"]),
      step("관계 행정기관 동시협의", "관계 행정기관", "G2 공람·협의", "industrialFastTrack", ["제10조"], ["관계기관 협의의견"], { type: "gateway" }),
      step("1회 보완요구·보완자료 제출", "민간기업·개발사업자", "G2 공람·협의", "industrialFastTrack", ["제10조"], ["보완요구서", "보완자료"]),
      step("통합조정회의 개최", "산업단지 지정권자", "G3 조정·검토", "industrialFastTrack", ["제11조"], ["통합조정회의 결과"]),
      step("국무조정실·중앙 차원 이견조정", "관계 행정기관", "G3 조정·검토", "industrialFastTrack", ["제12조"], ["중앙 조정결과"]),
      step("분야별 기술검토서 작성", "관계 행정기관", "G3 조정·검토", "industrialFastTrack", ["제13조"], ["분야별 기술검토서"]),
      step("산업단지계획심의위원회 통합심의", "산업단지계획심의위원회", "G4 심의", "industrialFastTrack", ["제14조"], ["산업단지계획 통합심의 결과"], { type: "gateway" }),
      step("산업단지계획 승인·고시", "산업단지 지정권자", "G5 승인·고시", "industrialFastTrack", ["제15조"], ["산업단지계획 승인서", "승인고시"], { type: "notice" }),
      step("6개월 처리기한·평가협의 일정 관리", "산업단지 지정권자", "G5 승인·고시", "industrialFastTrack", ["제16조·제23조"], ["법정 일정관리표", "평가협의 이력"]),
    ],
    extras: [["P06", "P05", "loop", "보완 후 재검토"], ["P09", "P10", "message", "기술검토 인계"]],
  },
  {
    priority: 531,
    slug: "disaster-impact-assessment-consultation",
    name: "재해영향평가등 협의·이행관리",
    oneLiner: "개발계획의 재해영향평가 대상 판정부터 협의서 작성·전문검토·협의결과 반영과 공사 중 이행관리까지의 재해예방 경로",
    type: "재해영향 협의·이행형",
    category: "재난·안전·소방",
    whyFirst: "산업단지 계획·개발 허가 전 재해영향평가 협의가 선행되어야 하며 협의결과 반영과 이행관리까지 독립된 법정 게이트다.",
    sourceKeys: ["disasterImpact"],
    legalArticles: { disasterImpact: "제4조~제7조" },
    lanes: ["사업시행자·계획수립기관", "승인기관", "행정안전부·전문검토기관"],
    stages: ["G0 대상판정", "G1 평가서", "G2 협의요청", "G3 전문검토", "G4 결과반영", "G5 이행관리"],
    nodes: [
      step("재해영향평가등 대상·유형 판정", "승인기관", "G0 대상판정", "disasterImpact", ["제4조·제5조"], ["대상·유형 판정표"]),
      step("재해위험·저감대책 조사", "사업시행자·계획수립기관", "G1 평가서", "disasterImpact", ["제4조"], ["재해위험 조사자료", "저감대책"]),
      step("재해영향평가등 협의서 제출", "승인기관", "G2 협의요청", "disasterImpact", ["제4조"], ["재해영향평가등 협의요청서"]),
      step("전문기관 사전검토", "행정안전부·전문검토기관", "G3 전문검토", "disasterImpact", ["제4조"], ["전문검토 의견"]),
      step("재해영향평가심의위원회 심의", "행정안전부·전문검토기관", "G3 전문검토", "disasterImpact", ["제4조"], ["위원회 심의결과"], { type: "gateway" }),
      step("보완·재협의", "사업시행자·계획수립기관", "G3 전문검토", "disasterImpact", ["제4조"], ["보완서", "재협의 기록"]),
      step("협의결과 통보·계획 반영", "승인기관", "G4 결과반영", "disasterImpact", ["제6조"], ["협의결과 통보", "계획 반영확인서"], { type: "notice" }),
      step("사업착수 전 협의완료 확인", "승인기관", "G4 결과반영", "disasterImpact", ["제7조"], ["착수 전 협의완료 확인"]),
      step("이행관리책임자 지정·공사 중 점검", "사업시행자·계획수립기관", "G5 이행관리", "disasterImpact", ["제6조"], ["이행관리대장", "점검·조치 기록"]),
    ],
    extras: [["P06", "P04", "loop", "보완 재검토"]],
  },
  {
    priority: 532,
    slug: "traffic-impact-assessment-review",
    name: "교통영향평가 검토·개선사항 이행",
    oneLiner: "산업단지·대규모 개발의 교통영향평가서 작성·검토·심의, 개선필요사항 확정과 승인계획 반영·이행점검 경로",
    type: "교통영향 심의·이행형",
    category: "국토·교통·주택",
    whyFirst: "교통영향평가 개선필요사항은 종전부지 실시계획에 반영되어야 하고 승인 전 확정되는 독립 산출물이다.",
    sourceKeys: ["trafficImpact"],
    legalArticles: { trafficImpact: "제15조~제17조, 제20조, 제22조~제24조" },
    lanes: ["사업시행자", "승인기관", "교통영향평가심의위원회"],
    stages: ["G0 대상판정", "G1 평가서", "G2 제출·검토", "G3 심의", "G4 반영", "G5 이행점검"],
    nodes: [
      step("교통영향평가 대상 판정", "승인기관", "G0 대상판정", "trafficImpact", ["제15조"], ["교통영향평가 대상 판정표"]),
      step("교통영향평가서·개선대책 작성", "사업시행자", "G1 평가서", "trafficImpact", ["제16조"], ["교통영향평가서", "교통개선대책"]),
      step("평가서 제출·요건검토", "승인기관", "G2 제출·검토", "trafficImpact", ["제16조"], ["평가서 접수·요건검토 결과"]),
      step("전문검토·관계기관 의견수렴", "승인기관", "G2 제출·검토", "trafficImpact", ["제16조"], ["전문검토서", "관계기관 의견"]),
      step("교통영향평가심의위원회 심의", "교통영향평가심의위원회", "G3 심의", "trafficImpact", ["제17조"], ["심의결과"], { type: "gateway" }),
      step("개선필요사항등 확정·통보", "승인기관", "G3 심의", "trafficImpact", ["제16조"], ["개선필요사항 통보서"], { type: "notice" }),
      step("승인계획·실시설계 반영", "사업시행자", "G4 반영", "trafficImpact", ["제20조"], ["교통개선사항 반영표"]),
      step("개선대책 이행·점검·시정", "승인기관", "G5 이행점검", "trafficImpact", ["제22조~제24조"], ["이행점검 결과", "시정·공사중지 조치"]),
    ],
    extras: [["P05", "P02", "loop", "평가서 보완"]],
  },
  {
    priority: 533,
    slug: "energy-use-plan-consultation",
    name: "에너지사용계획 협의·사후관리",
    oneLiner: "대규모 에너지사용 사업의 대상 판정, 수요·절감·공급계획 작성, 관계기관 협의와 계획 반영·이행점검 경로",
    type: "에너지계획 협의·이행형",
    category: "기후·환경·에너지",
    whyFirst: "종전부지 실시계획 의제항목이자 대규모 산업시설의 에너지 수요·효율·공급계획을 확정하는 독립 협의다.",
    sourceKeys: ["energyUse"],
    legalArticles: { energyUse: "제10조~제12조, 제31조" },
    lanes: ["사업주관자·사업시행자", "산업통상부", "에너지전문기관"],
    stages: ["G0 대상판정", "G1 수요계획", "G2 협의요청", "G3 검토", "G4 결과반영", "G5 이행관리"],
    nodes: [
      step("에너지사용계획 협의대상 판정", "산업통상부", "G0 대상판정", "energyUse", ["제10조"], ["협의대상 판정표"]),
      step("에너지 수요·공급·효율화 계획 작성", "사업주관자·사업시행자", "G1 수요계획", "energyUse", ["제10조"], ["에너지사용계획서"]),
      step("에너지사용계획 협의 요청", "사업주관자·사업시행자", "G2 협의요청", "energyUse", ["제10조"], ["에너지사용계획 협의요청서"]),
      step("에너지전문기관 기술검토", "에너지전문기관", "G3 검토", "energyUse", ["제11조"], ["기술검토 의견"]),
      step("협의의견·보완사항 통보", "산업통상부", "G3 검토", "energyUse", ["제11조"], ["에너지사용계획 협의의견"], { type: "notice" }),
      step("사업계획·설계에 협의결과 반영", "사업주관자·사업시행자", "G4 결과반영", "energyUse", ["제12조"], ["협의결과 반영표"]),
      step("계획 이행실적 제출·사후관리", "산업통상부", "G5 이행관리", "energyUse", ["제12조"], ["이행실적 보고", "사후관리 기록"]),
      step("에너지다소비사업자 신고·에너지관리", "사업주관자·사업시행자", "G5 이행관리", "energyUse", ["제31조"], ["에너지사용량 신고", "에너지관리 기록"]),
    ],
    extras: [["P05", "P02", "loop", "계획 보완"]],
  },
  {
    priority: 534,
    slug: "process-safety-report-review",
    name: "유해·위험방지계획서·공정안전보고서 심사",
    oneLiner: "반도체 생산시설의 유해위험 대상 판정, 공사 전 유해위험방지계획과 공정안전보고서 작성·심사·보완 및 이행확인 경로",
    type: "산업안전 사전심사·이행형",
    category: "고용·노동·산업안전",
    whyFirst: "공사 전 유해위험방지계획과 가동 전 공정안전보고서는 건축·환경허가와 별개로 관리되는 안전 산출물이다.",
    sourceKeys: ["occupationalSafety"],
    legalArticles: { occupationalSafety: "제42조~제46조" },
    lanes: ["사업주·설계자", "고용노동부·산업안전보건공단", "현장 안전조직"],
    stages: ["G0 대상판정", "G1 공사안전", "G2 심사", "G3 공정안전", "G4 이행확인", "G5 변경관리"],
    nodes: [
      step("유해위험방지·공정안전 대상 판정", "고용노동부·산업안전보건공단", "G0 대상판정", "occupationalSafety", ["제42조·제44조"], ["유해위험·공정안전 대상 판정표"]),
      step("유해·위험방지계획서 작성", "사업주·설계자", "G1 공사안전", "occupationalSafety", ["제42조"], ["유해·위험방지계획서"]),
      step("공사 전 계획서 제출·심사", "고용노동부·산업안전보건공단", "G2 심사", "occupationalSafety", ["제42조·제43조"], ["유해·위험방지계획 심사결과"], { type: "gateway" }),
      step("심사의견 보완·설계 반영", "사업주·설계자", "G2 심사", "occupationalSafety", ["제43조"], ["보완계획서", "설계 반영표"]),
      step("공정안전보고서 작성·제출", "사업주·설계자", "G3 공정안전", "occupationalSafety", ["제44조"], ["공정안전보고서"]),
      step("공정안전보고서 심사·확인", "고용노동부·산업안전보건공단", "G3 공정안전", "occupationalSafety", ["제45조"], ["공정안전보고서 심사결과"], { type: "gateway" }),
      step("공정안전관리체계 구축·교육", "현장 안전조직", "G4 이행확인", "occupationalSafety", ["제46조"], ["공정안전 이행계획", "교육·훈련 기록"]),
      step("현장 이행상태 확인·개선", "고용노동부·산업안전보건공단", "G4 이행확인", "occupationalSafety", ["제46조"], ["이행상태 확인결과", "개선조치"]),
      step("공정·설비 변경 시 재검토", "사업주·설계자", "G5 변경관리", "occupationalSafety", ["제44조~제46조"], ["변경관리 기록", "재심사 자료"]),
    ],
    extras: [["P03", "P02", "loop", "공사안전계획 보완"], ["P06", "P05", "loop", "공정안전보고서 보완"]],
  },
  {
    priority: 535,
    slug: "dangerous-material-facility-permit-inspection",
    name: "위험물 제조소등 설치허가·완공검사",
    oneLiner: "위험물 품명·수량 판정, 제조소등 설치·변경허가와 탱크안전성능검사, 완공검사·안전관리자·예방규정 및 정기점검 경로",
    type: "위험물 설치허가·검사형",
    category: "재난·안전·소방",
    whyFirst: "반도체 팹의 위험물 저장·취급시설은 건축·소방동의와 별도로 설치허가와 완공검사 후 사용해야 한다.",
    sourceKeys: ["dangerousMaterials"],
    legalArticles: { dangerousMaterials: "제6조, 제8조~제9조, 제14조~제18조" },
    lanes: ["설치자·사업자", "소방본부·소방서", "위험물 안전관리조직"],
    stages: ["G0 대상판정", "G1 설치허가", "G2 성능검사", "G3 공사·완공", "G4 사용준비", "G5 운영점검"],
    nodes: [
      step("위험물 품명·지정수량·시설유형 판정", "소방본부·소방서", "G0 대상판정", "dangerousMaterials", ["제6조"], ["위험물 시설 적용성 판정표"]),
      step("제조소등 설치·변경허가 신청", "설치자·사업자", "G1 설치허가", "dangerousMaterials", ["제6조"], ["설치·변경허가 신청서", "시설설계도서"]),
      step("설치·변경허가 및 조건 통지", "소방본부·소방서", "G1 설치허가", "dangerousMaterials", ["제6조"], ["제조소등 설치·변경허가서"], { type: "notice" }),
      step("탱크안전성능검사", "소방본부·소방서", "G2 성능검사", "dangerousMaterials", ["제8조"], ["탱크안전성능검사 결과"]),
      step("시설공사·기술기준 이행", "설치자·사업자", "G3 공사·완공", "dangerousMaterials", ["제14조"], ["시설공사·기술기준 이행기록"]),
      step("완공검사·사용가능 확인", "소방본부·소방서", "G3 공사·완공", "dangerousMaterials", ["제9조"], ["완공검사필증"], { type: "gateway" }),
      step("위험물안전관리자 선임", "위험물 안전관리조직", "G4 사용준비", "dangerousMaterials", ["제15조"], ["위험물안전관리자 선임신고"]),
      step("예방규정 작성·제출", "위험물 안전관리조직", "G4 사용준비", "dangerousMaterials", ["제17조"], ["위험물 예방규정"]),
      step("정기점검·검사·유지관리", "위험물 안전관리조직", "G5 운영점검", "dangerousMaterials", ["제14조·제18조"], ["정기점검 기록", "검사결과"]),
    ],
    extras: [["P06", "P05", "loop", "완공검사 보완"]],
  },
  {
    priority: 536,
    slug: "high-pressure-gas-facility-permit-inspection",
    name: "고압가스 제조·저장허가·완성검사",
    oneLiner: "고압가스 제조·저장·사용 대상 판정부터 허가, 안전관리규정, 중간·완성검사, 안전관리자와 특정고압가스 사용신고·정기검사 경로",
    type: "고압가스 허가·검사형",
    category: "인허가·규제·산업",
    whyFirst: "반도체 공정가스 설비는 위험물과 다른 허가·검사 체계를 가지며 완성검사 전 사용할 수 없는 독립 가동 게이트다.",
    sourceKeys: ["highPressureGas"],
    legalArticles: { highPressureGas: "제4조, 제7조, 제11조, 제13조, 제15조~제16조, 제20조" },
    lanes: ["고압가스 사업자·사용자", "산업통상자원부·지방자치단체", "가스안전공사·안전관리조직"],
    stages: ["G0 대상판정", "G1 허가", "G2 안전관리", "G3 공사검사", "G4 사용신고", "G5 운영점검"],
    nodes: [
      step("제조·저장·특정고압가스 사용 대상 판정", "산업통상자원부·지방자치단체", "G0 대상판정", "highPressureGas", ["제4조·제20조"], ["고압가스 적용성 판정표"]),
      step("제조·저장 허가 신청", "고압가스 사업자·사용자", "G1 허가", "highPressureGas", ["제4조"], ["고압가스 제조·저장 허가신청서", "시설계획"]),
      step("제조·저장 허가·조건 확정", "산업통상자원부·지방자치단체", "G1 허가", "highPressureGas", ["제4조"], ["고압가스 제조·저장 허가서"], { type: "notice" }),
      step("안전관리규정 작성·제출", "고압가스 사업자·사용자", "G2 안전관리", "highPressureGas", ["제11조"], ["안전관리규정"]),
      step("시설공사·중간검사", "가스안전공사·안전관리조직", "G3 공사검사", "highPressureGas", ["제13조·제16조"], ["중간검사 결과", "시설공사 기록"]),
      step("완성검사·사용가능 확인", "가스안전공사·안전관리조직", "G3 공사검사", "highPressureGas", ["제16조"], ["고압가스 시설 완성검사증명서"], { type: "gateway" }),
      step("안전관리자 선임", "고압가스 사업자·사용자", "G4 사용신고", "highPressureGas", ["제15조"], ["고압가스 안전관리자 선임신고"]),
      step("특정고압가스 사용신고·완성검사", "산업통상자원부·지방자치단체", "G4 사용신고", "highPressureGas", ["제20조"], ["특정고압가스 사용신고", "사용시설 완성검사 결과"]),
      step("정기검사·안전관리규정 이행", "가스안전공사·안전관리조직", "G5 운영점검", "highPressureGas", ["제11조·제20조"], ["정기검사 결과", "안전관리 이행기록"]),
    ],
    extras: [["P06", "P05", "loop", "검사 보완"]],
  },
  {
    priority: 537,
    slug: "fire-facility-construction-completion-inspection",
    name: "소방시설공사 착공신고·완공검사",
    oneLiner: "소방시설 설계와 공사업자·감리자 지정, 착공신고, 시공·감리, 감리결과 통보와 완공검사·하자보수까지의 시설 가동 전 확인 경로",
    type: "소방시설 착공신고·완공검사형",
    category: "재난·안전·소방",
    whyFirst: "일반 화재신고·출동 절차와 달리 대형 공장의 소방시설은 착공신고와 공사감리, 완공검사를 거쳐야 하므로 건축 사용승인과 연결되는 별도 법정 게이트다.",
    sourceKeys: ["fireConstruction"],
    legalArticles: { fireConstruction: "제11조~제20조" },
    lanes: ["건축주·관계인", "소방시설 설계·공사업자", "공사감리자", "소방본부·소방서"],
    stages: ["G0 설계", "G1 착공신고", "G2 시공·감리", "G3 결과통보", "G4 완공검사", "G5 하자관리"],
    nodes: [
      step("소방시설 설계·기술기준 반영", "소방시설 설계·공사업자", "G0 설계", "fireConstruction", ["제11조"], ["소방시설 설계도서"]),
      step("소방시설공사업자·감리자 선정", "건축주·관계인", "G0 설계", "fireConstruction", ["제17조·제21조"], ["공사도급계약", "공사감리자 지정서"]),
      step("소방시설공사 착공신고", "소방본부·소방서", "G1 착공신고", "fireConstruction", ["제13조"], ["소방시설공사 착공신고 수리"]),
      step("소방시설 시공·기술기준 준수", "소방시설 설계·공사업자", "G2 시공·감리", "fireConstruction", ["제12조"], ["소방시설 시공기록"]),
      step("공사감리·위반사항 조치", "공사감리자", "G2 시공·감리", "fireConstruction", ["제16조~제19조"], ["공사감리 기록", "위반사항 조치결과"]),
      step("공사감리 결과 통보", "공사감리자", "G3 결과통보", "fireConstruction", ["제20조"], ["소방시설공사 감리결과보고서"]),
      step("소방시설 완공검사 신청", "건축주·관계인", "G4 완공검사", "fireConstruction", ["제14조"], ["소방시설 완공검사 신청서"]),
      step("현장 완공검사·적합 판정", "소방본부·소방서", "G4 완공검사", "fireConstruction", ["제14조"], ["소방시설 완공검사증명서"], { type: "gateway" }),
      step("하자보수·유지관리 인계", "소방시설 설계·공사업자", "G5 하자관리", "fireConstruction", ["제15조"], ["하자보수 이행기록", "유지관리 인계서"]),
    ],
    extras: [["P08", "P04", "loop", "부적합 보완공사"]],
  },
];

function buildInstitution(spec) {
  const sources = spec.sourceKeys.map((key) => S[key]);
  const legalBasis = spec.sourceKeys.map((key) => ({
    law: S[key].law,
    articles: spec.legalArticles[key],
    kind: S[key].kind,
  }));
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
      authorities: spec.lanes.map((name) => ({ name, role: `${spec.name}의 해당 레인 업무와 산출물 작성·검토·결정을 담당` })),
      procedure,
      moneyFlow: "수수료·사업비·보상·재원조달은 해당 계획과 개별 하위 법령·고시·협약에서 확정한다.",
      docsFlow: procedure.join(" → "),
      bottlenecks: ["대상·규모·시설경계의 미확정", "관계기관 협의자료와 평가자료의 불일치", "보완 요구와 후속 승인 일정의 단절"],
      reformPoints: ["사업·시설 식별자로 신청·협의·심의·고시 산출물을 연결", "관계기관 보완요구와 법정기한을 공통 일정에서 추적", "승인조건과 공사·가동 전 확인사항을 구조화"],
    },
    related: specs.filter((item) => item.slug !== spec.slug).slice(0, 4).map((item) => item.name),
    fieldVerification: [
      `${spec.name}의 최신 시행령·시행규칙·고시와 제출서식`,
      "사업규모·시설종류별 적용 문턱과 면제·간소화 요건",
      "관계기관별 실제 처리기간·보완횟수·전산접수 경로",
      "승인·검사 이후 변경·이행점검·취소의 현장 운영기준",
    ],
    process: {
      institution_name: spec.name,
      law_name: sources.map((source) => source.law).join(" · "),
      lanes: spec.lanes,
      stages: spec.stages,
      nodes: spec.nodes.map(buildNode),
      edges: sequenceEdges(spec.nodes.length, spec.extras),
      warnings: [
        "법제처 국가법령정보 API로 2026-08-16 현재 법령 식별자와 핵심 조문을 대조했다.",
        "프로젝트·시설별 적용 여부와 세부 제출물은 규모·용량·물질·입지 및 시행령 문턱에 따라 달라지므로 실제 신청 전에 다시 판정해야 한다.",
      ],
    },
    verification: {
      status: "source-linked",
      verifiedAt: AS_OF,
      method: "법제처 국가법령정보 Open API의 현행 법령 검색·조문 조회 결과와 공식 법령 원문 연결",
      scope: "현행 법률의 식별자·공포일·시행일과 프로젝트 마일스톤을 구성하는 핵심 조문 범위를 대조했다. 시행령·시행규칙·고시·서식의 전수 조문 검증은 현장확인 항목으로 분리했다.",
      notes: ["이번 추가분은 광주 반도체클러스터 행정절차 감사에서 독립 산출물로 확인된 9개 제도다."],
      sources,
      articleVerification: {
        checkedAt: AS_OF,
        method: "법제처 API 핵심조문 표본 대조; 전체 인용 자동검증은 미실행",
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
    const outputPath = path.join(DATA_DIR, `${spec.slug}.json`);
    const existingIndex = manifest.findIndex((entry) => entry.slug === spec.slug);
    const priorityConflict = manifest.find((entry) => entry.priority === spec.priority && entry.slug !== spec.slug);
    if (priorityConflict) throw new Error(`priority ${spec.priority} already belongs to ${priorityConflict.slug}`);
    if (!OVERWRITE && (existingIndex >= 0 || fs.existsSync(outputPath))) {
      throw new Error(`${spec.slug} already exists; rerun with --overwrite only when intentional`);
    }
    fs.writeFileSync(outputPath, `${JSON.stringify(buildInstitution(spec), null, 2)}\n`);
    const entry = { priority: spec.priority, slug: spec.slug, name: spec.name, type: spec.type, category: spec.category };
    if (existingIndex >= 0) manifest[existingIndex] = entry;
    else manifest.push(entry);
  }
  manifest.sort((left, right) => left.priority - right.priority);
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`generated ${specs.length} mega-project permit institutions; manifest=${manifest.length}`);
  specs.forEach((spec) => console.log(`${spec.priority}\t${spec.slug}\t${spec.name}`));
}

main();
