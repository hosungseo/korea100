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
    officialUrl: "https://law.go.kr/법령/" + urlName,
  };
}

const S = {
  semiconductor: statute(
    "반도체산업 경쟁력 강화 및 지원에 관한 특별법",
    "015044",
    "286559",
    "2026-06-02",
    "2026-08-11",
    "반도체산업경쟁력강화및지원에관한특별법",
  ),
  defenseFacility: statute(
    "국방ㆍ군사시설 사업에 관한 법률",
    "000934",
    "269947",
    "2025-03-18",
    "2025-09-19",
    "국방군사시설사업에관한법률",
  ),
  militaryProtection: statute(
    "군사기지 및 군사시설 보호법",
    "010596",
    "258703",
    "2024-01-16",
    "2024-07-17",
    "군사기지및군사시설보호법",
  ),
  nationalProperty: statute(
    "국유재산법",
    "001598",
    "283349",
    "2026-02-19",
    "2026-02-19",
    "국유재산법",
  ),
  waterworks: statute(
    "수도법",
    "001818",
    "276757",
    "2025-10-01",
    "2025-10-01",
    "수도법",
  ),
  waterEnvironment: statute(
    "물환경보전법",
    "000166",
    "283441",
    "2026-02-19",
    "2026-02-19",
    "물환경보전법",
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
    action: raw.action ?? raw.name + "에 필요한 자료를 확인하고 법정 산출물을 다음 담당기관에 인계한다.",
    output_documents: raw.outputDocuments,
    confidence: raw.confidence ?? 0.9,
    legal_basis: raw.articles.map((article) => ({
      law: source.law,
      article,
      text: source.law + " " + article + "에 따른 절차와 산출물. 적용 범위와 세부 서식은 현행 하위 법령ㆍ고시를 함께 확인한다.",
    })),
  };
}

function sequenceEdges(nodeCount, extras = []) {
  const edges = [];
  for (let index = 1; index < nodeCount; index += 1) {
    edges.push({
      id: "E" + pad(index),
      source: "P" + pad(index),
      target: "P" + pad(index + 1),
      type: "sequence",
      label: null,
    });
  }
  extras.forEach(([source, target, type, label], index) => {
    edges.push({
      id: (type === "loop" ? "L" : "M") + pad(index + 1),
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
    priority: 538,
    slug: "semiconductor-cluster-designation-coordination",
    name: "반도체클러스터 조성계획 승인·지정·조정",
    oneLiner: "지방자치단체·사업자의 조성계획 제출부터 관계기관 협의, 특별위원회 심의, 조성계획 승인과 클러스터·사업시행자 지정·고시까지의 경로",
    type: "클러스터 계획승인·지정형",
    category: "인허가·규제·산업",
    whyFirst: "반도체클러스터는 일반 산업단지와 별도로 특별법상 조성계획 승인과 지정 산출물을 가지므로 정책 입지결정 이후 첫 법정 게이트가 된다.",
    sourceKeys: ["semiconductor"],
    legalArticles: { semiconductor: "제11조~제13조, 제26조~제28조" },
    lanes: ["광주시·사업시행자", "산업통상부", "관계 중앙행정기관", "반도체산업경쟁력강화특별위원회"],
    stages: ["G0 계획작성", "G1 제출", "G2 협의", "G3 심의", "G4 승인·지정", "G5 고시·변경"],
    nodes: [
      step("반도체클러스터 조성계획안 작성", "광주시·사업시행자", "G0 계획작성", "semiconductor", ["제11조"], ["반도체클러스터 조성계획안"]),
      step("조성계획 승인·클러스터 지정 신청", "광주시·사업시행자", "G1 제출", "semiconductor", ["제11조"], ["조성계획 승인·지정 신청서"]),
      step("조성계획 요건·사업시행자 적격성 검토", "산업통상부", "G1 제출", "semiconductor", ["제11조"], ["요건검토서", "사업시행자 적격성 검토서"]),
      step("관계 중앙행정기관·지방자치단체 협의", "관계 중앙행정기관", "G2 협의", "semiconductor", ["제11조"], ["관계기관 협의의견"], { type: "gateway" }),
      step("반도체산업경쟁력강화특별위원회 심의", "반도체산업경쟁력강화특별위원회", "G3 심의", "semiconductor", ["제11조"], ["특별위원회 심의결과"], { type: "gateway" }),
      step("조성계획 승인·클러스터 및 사업시행자 지정", "산업통상부", "G4 승인·지정", "semiconductor", ["제11조"], ["조성계획 승인서", "클러스터·사업시행자 지정서"], { type: "notice" }),
      step("승인·지정 내용 고시와 관계기관 통보", "산업통상부", "G4 승인·지정", "semiconductor", ["제11조"], ["클러스터 지정고시", "관계기관 통보서"], { type: "notice" }),
      step("조성계획 변경·지정해제 및 후속 육성정책 연계", "산업통상부", "G5 고시·변경", "semiconductor", ["제12조·제13조"], ["변경승인·지정해제 결정", "클러스터 육성정책 연계표"]),
    ],
    extras: [["P05", "P03", "loop", "심의 보완"]],
  },
  {
    priority: 539,
    slug: "semiconductor-infrastructure-support-fast-track",
    name: "반도체 산업기반시설 지원·예타·인허가 신속처리",
    oneLiner: "클러스터 전력·용수·도로 등 산업기반시설 수요 확정부터 비용지원, 공공기관 협약, 예비타당성조사 특례, 인허가 의제·신속처리까지의 특별법 경로",
    type: "기반시설 지원·신속처리형",
    category: "인허가·규제·산업",
    whyFirst: "전력·용수·도로를 개별 허가만으로 관리하면 재원과 일정의 병목이 보이지 않으므로 특별법상 비용지원·예타·신속처리 산출물을 하나의 제도로 연결해야 한다.",
    sourceKeys: ["semiconductor"],
    legalArticles: { semiconductor: "제14조·제18조, 제23조~제28조" },
    lanes: ["사업시행자·입주기업", "산업통상부", "기반시설 공공기관", "기획재정부·관계기관"],
    stages: ["G0 수요확정", "G1 지원신청", "G2 비용·협약", "G3 예타특례", "G4 인허가 패키지", "G5 신속처리"],
    nodes: [
      step("전력·용수·도로·폐수 산업기반시설 수요 확정", "사업시행자·입주기업", "G0 수요확정", "semiconductor", ["제14조·제18조"], ["산업기반시설 수요서", "단계별 공급계획"]),
      step("산업기반시설 지원계획·비용지원 신청", "사업시행자·입주기업", "G1 지원신청", "semiconductor", ["제14조·제18조"], ["기반시설 지원신청서", "비용분담안"]),
      step("지원 필요성·공급능력·사업비 검토", "산업통상부", "G1 지원신청", "semiconductor", ["제14조·제18조"], ["지원 타당성 검토서"]),
      step("관계기관·공공기관 공급방안 조정", "산업통상부", "G2 비용·협약", "semiconductor", ["제14조·제18조"], ["기관별 공급·재원 조정결과"], { type: "gateway" }),
      step("기반시설 비용지원·분담 결정", "산업통상부", "G2 비용·협약", "semiconductor", ["제14조·제18조"], ["비용지원·분담 결정서"]),
      step("기반시설 공공기관 실시협약 체결", "기반시설 공공기관", "G2 비용·협약", "semiconductor", ["제18조"], ["기반시설 실시협약", "공급 일정표"]),
      step("국가·공공기관 예비타당성조사 적용경로 판정", "기획재정부·관계기관", "G3 예타특례", "semiconductor", ["제24조·제25조"], ["예비타당성조사 적용경로 판정서"]),
      step("예비타당성조사 면제·기간단축 심의", "기획재정부·관계기관", "G3 예타특례", "semiconductor", ["제24조·제25조"], ["예타 면제·단축 심의결과"], { type: "gateway" }),
      step("인허가 의제목록·실체요건 패키지 확정", "산업통상부", "G4 인허가 패키지", "semiconductor", ["제26조"], ["인허가 의제목록", "실체요건 충족표"]),
      step("인허가 신속처리 요청·처리계획·결과 통보", "산업통상부", "G5 신속처리", "semiconductor", ["제27조·제28조"], ["신속처리 요청서", "기관별 처리계획", "처리결과 통보서"], { type: "notice" }),
    ],
    extras: [["P08", "P07", "loop", "특례요건 보완"], ["P09", "P10", "message", "의제자료 인계"]],
  },
  {
    priority: 540,
    slug: "defense-facility-project-plan-completion",
    name: "국방·군사시설 사업계획·실시계획·준공",
    oneLiner: "국방·군사시설 사업시행자 지정과 사업계획 승인, 실시계획 승인·인허가 의제, 공사와 준공검사까지의 대체 군공항 건설 경로",
    type: "국방시설 계획승인·준공형",
    category: "국방·보훈·병무",
    whyFirst: "대체 군공항 건설은 부지 선정 이후에도 사업계획과 실시계획, 의제협의, 준공검사라는 독립 산출물이 필요하므로 단일 건설 노드로 묶으면 병목을 찾을 수 없다.",
    sourceKeys: ["defenseFacility"],
    legalArticles: { defenseFacility: "제3조~제9조, 제12조, 제14조" },
    lanes: ["국방부", "국방시설 사업시행자", "관계 행정기관", "관할 지방자치단체"],
    stages: ["G0 시행자", "G1 사업계획", "G2 실시계획", "G3 의제협의", "G4 공사", "G5 준공"],
    nodes: [
      step("국방·군사시설 사업시행자 지정", "국방부", "G0 시행자", "defenseFacility", ["제3조"], ["사업시행자 지정서"]),
      step("국방·군사시설 사업계획 작성", "국방시설 사업시행자", "G1 사업계획", "defenseFacility", ["제4조"], ["국방·군사시설 사업계획안"]),
      step("사업계획 승인·고시", "국방부", "G1 사업계획", "defenseFacility", ["제4조"], ["사업계획 승인서", "사업계획 고시"], { type: "notice" }),
      step("토지·물건 조사와 취득·사용계획 확정", "국방시설 사업시행자", "G2 실시계획", "defenseFacility", ["제5조"], ["토지·물건조서", "취득·사용계획"]),
      step("실시계획·설계도서·공정계획 작성", "국방시설 사업시행자", "G2 실시계획", "defenseFacility", ["제6조"], ["국방·군사시설 실시계획안", "설계도서"]),
      step("관계기관 인허가 실체요건 협의", "관계 행정기관", "G3 의제협의", "defenseFacility", ["제7조·제14조"], ["관계기관 협의의견", "도시관리계획 협의결과"], { type: "gateway" }),
      step("실시계획 승인·인허가 의제·고시", "국방부", "G3 의제협의", "defenseFacility", ["제6조·제7조"], ["실시계획 승인서", "인허가 의제목록", "실시계획 고시"], { type: "notice" }),
      step("대체 군공항 시설공사·공정 확인", "국방시설 사업시행자", "G4 공사", "defenseFacility", ["제8조"], ["공사기록", "공정·품질 확인서"]),
      step("준공검사·기능이전 가능 확인", "국방부", "G5 준공", "defenseFacility", ["제9조"], ["준공검사 확인서", "기능이전 가능 확인서"], { type: "gateway" }),
    ],
    extras: [["P06", "P05", "loop", "협의조건 보완"], ["P09", "P08", "loop", "준공 보완"]],
  },
  {
    priority: 541,
    slug: "military-facility-protection-zone-release",
    name: "군사시설 보호구역 변경·해제·고시",
    oneLiner: "종전부지 개발을 위한 군사시설 보호구역 현황조사, 관할부대 협의, 보호구역심의위원회 심의, 변경·해제 결정과 고시·지형도면 반영 경로",
    type: "군사보호구역 변경·해제형",
    category: "국방·보훈·병무",
    whyFirst: "군공항 기능이 이전되더라도 보호구역 변경·해제와 고시가 자동으로 끝나는 것은 아니므로 개발행위 가능성을 좌우하는 별도 법정 게이트로 관리해야 한다.",
    sourceKeys: ["militaryProtection"],
    legalArticles: { militaryProtection: "제4조·제8조·제9조·제13조·제15조" },
    lanes: ["광주시·사업시행자", "관할부대", "국방부", "군사기지·군사시설 보호구역심의위원회"],
    stages: ["G0 현황확인", "G1 해제검토", "G2 군협의", "G3 심의", "G4 결정·고시", "G5 인허가연계"],
    nodes: [
      step("보호구역·비행안전구역·제한행위 현황조사", "광주시·사업시행자", "G0 현황확인", "militaryProtection", ["제4조·제9조"], ["군사시설 보호구역 현황도", "제한행위 목록"]),
      step("기능이전 단계별 보호구역 변경·해제안 작성", "광주시·사업시행자", "G1 해제검토", "militaryProtection", ["제4조"], ["보호구역 변경·해제안"]),
      step("관할부대 작전성·안전성 검토 및 협의", "관할부대", "G2 군협의", "militaryProtection", ["제13조"], ["관할부대 협의의견", "작전성·안전성 검토서"], { type: "gateway" }),
      step("보호구역심의위원회 심의", "군사기지·군사시설 보호구역심의위원회", "G3 심의", "militaryProtection", ["제15조"], ["보호구역심의위원회 심의결과"], { type: "gateway" }),
      step("보호구역 변경·해제 결정", "국방부", "G4 결정·고시", "militaryProtection", ["제4조"], ["보호구역 변경·해제 결정서"]),
      step("변경·해제 고시·표지·지형도면 정비", "국방부", "G4 결정·고시", "militaryProtection", ["제8조"], ["보호구역 변경·해제 고시", "지형도면·표지 정비결과"], { type: "notice" }),
      step("개발행위·건축 등 행정처분 협의조건 인계", "광주시·사업시행자", "G5 인허가연계", "militaryProtection", ["제13조"], ["행정처분 협의조건 인계표"]),
    ],
    extras: [["P04", "P02", "loop", "심의 보완"]],
  },
  {
    priority: 542,
    slug: "national-property-disuse-contribution-concession",
    name: "국유재산 용도폐지·기부 대 양여·권리이전",
    oneLiner: "종전 군공항 국유재산의 재산목록·용도폐지부터 대체시설 기부재산 검수·가액평가, 양여대상 확정, 계약과 등기·권리이전까지의 경로",
    type: "국유재산 용도폐지·교환형",
    category: "재정·세무·납세자",
    whyFirst: "기부 대 양여는 재원계획만이 아니라 대체시설과 종전재산의 가액·권리·시점을 맞추는 독립 재산처분 절차이며 종전부지 개발착수의 법적 선행조건이다.",
    sourceKeys: ["nationalProperty", "defenseFacility"],
    legalArticles: { nationalProperty: "제22조, 제30조·제31조, 제40조·제41조, 제49조, 제55조", defenseFacility: "제12조" },
    lanes: ["국방부·중앙관서", "사업시행자", "기획재정부·총괄청", "등기·재산관리기관"],
    stages: ["G0 재산확정", "G1 용도폐지", "G2 기부검수", "G3 가액평가", "G4 양여결정", "G5 권리이전"],
    nodes: [
      step("종전·대체시설 국유재산 목록과 권리관계 확정", "국방부·중앙관서", "G0 재산확정", "nationalProperty", ["제22조·제40조"], ["국유재산 목록", "권리관계 조사서"]),
      step("행정재산 용도폐지 요청·필요성 검토", "국방부·중앙관서", "G1 용도폐지", "nationalProperty", ["제22조·제40조"], ["용도폐지 요청서", "필요성 검토서"]),
      step("용도폐지 결정·일반재산 전환", "국방부·중앙관서", "G1 용도폐지", "nationalProperty", ["제40조·제41조"], ["용도폐지 결정서", "일반재산 전환대장"], { type: "gateway" }),
      step("대체 국방시설 준공·기부재산 검수", "국방부·중앙관서", "G2 기부검수", "defenseFacility", ["제12조"], ["기부재산 검수서", "기부채납 확인서"]),
      step("기부재산·양여재산 가액평가와 차액조정", "기획재정부·총괄청", "G3 가액평가", "nationalProperty", ["제41조·제55조"], ["재산 가액평가서", "차액조정안"]),
      step("양여 대상·범위·조건 심사", "기획재정부·총괄청", "G4 양여결정", "nationalProperty", ["제55조"], ["양여 심사서", "양여조건안"], { type: "gateway" }),
      step("기부 대 양여 계약·처분 결정", "국방부·중앙관서", "G4 양여결정", "defenseFacility", ["제12조"], ["기부 대 양여 계약서", "국유재산 처분결정서"], { type: "notice" }),
      step("소유권 이전등기·재산대장 정리·종전부지 인계", "등기·재산관리기관", "G5 권리이전", "nationalProperty", ["제41조·제55조"], ["소유권 이전등기", "재산대장 정리결과", "종전부지 인계서"]),
    ],
    extras: [["P06", "P05", "loop", "가액·조건 재조정"]],
  },
  {
    priority: 543,
    slug: "industrial-waterworks-business-authorization",
    name: "공업용수도 사업인가·실시계획·준공",
    oneLiner: "반도체클러스터 공업용수 수요와 국가·지방·사업자 공급경로 확정부터 공업용수도 사업인가, 관계기관 협의·인허가 의제, 관로공사·준공과 공급개시까지의 경로",
    type: "공업용수도 사업인가·공급형",
    category: "기후·환경·에너지",
    whyFirst: "취수허가만으로는 정수·송수·관로와 공급주체의 사업인가가 설명되지 않으므로 대규모 반도체용수 공급망을 별도 제도로 분해해야 한다.",
    sourceKeys: ["waterworks"],
    legalArticles: { waterworks: "제48조·제49조·제49조의2·제50조" },
    lanes: ["광주시·사업시행자", "환경부·수도사업 인가권자", "수자원공사·수도사업자", "관계 행정기관"],
    stages: ["G0 수요·경로", "G1 사업계획", "G2 인가신청", "G3 협의·의제", "G4 공사", "G5 준공·공급"],
    nodes: [
      step("단계별 공업용수 수요·수질·공급신뢰도 확정", "광주시·사업시행자", "G0 수요·경로", "waterworks", ["제48조·제49조"], ["공업용수 수요·수질 요구서"]),
      step("국가·지방·일반수도 공급경로와 사업주체 결정", "환경부·수도사업 인가권자", "G0 수요·경로", "waterworks", ["제48조·제49조"], ["공업용수 공급경로 결정서", "사업주체 확인서"]),
      step("공업용수도 사업계획·재원·관로계획 작성", "수자원공사·수도사업자", "G1 사업계획", "waterworks", ["제49조"], ["공업용수도 사업계획", "재원·관로계획"]),
      step("공업용수도 사업인가 신청", "수자원공사·수도사업자", "G2 인가신청", "waterworks", ["제49조"], ["공업용수도 사업인가 신청서"]),
      step("관계기관 협의·취수원·수질·시설기준 검토", "관계 행정기관", "G3 협의·의제", "waterworks", ["제49조·제50조"], ["관계기관 협의의견", "시설기준 검토서"], { type: "gateway" }),
      step("공업용수도 사업인가·고시", "환경부·수도사업 인가권자", "G3 협의·의제", "waterworks", ["제49조"], ["공업용수도 사업인가서", "사업인가 고시"], { type: "notice" }),
      step("도로·하천 등 인허가 의제·점용조건 확정", "관계 행정기관", "G3 협의·의제", "waterworks", ["제50조"], ["인허가 의제목록", "점용·공사 조건서"]),
      step("취수·정수·송수·배수시설과 관로 공사", "수자원공사·수도사업자", "G4 공사", "waterworks", ["제48조·제49조"], ["공업용수도 공사기록", "시험성적서"]),
      step("준공확인·공급협약·통수 및 공급개시", "수자원공사·수도사업자", "G5 준공·공급", "waterworks", ["제49조·제49조의2"], ["준공확인서", "용수공급협약", "통수·공급개시 확인서"], { type: "gateway" }),
    ],
    extras: [["P05", "P03", "loop", "시설·수질 보완"], ["P09", "P01", "message", "실공급량 피드백"]],
  },
  {
    priority: 544,
    slug: "public-wastewater-treatment-facility-plan",
    name: "공공폐수처리시설 기본계획·설계·준공·운영",
    oneLiner: "산업단지 폐수발생량·수질 예측부터 공공폐수처리시설 기본계획 승인·고시, 비용부담계획·기본설계 검토, 건설·준공·운영과 기술진단까지의 경로",
    type: "공공폐수처리시설 계획·운영형",
    category: "기후·환경·에너지",
    whyFirst: "대규모 반도체 팹의 폐수는 개별 배출허가만으로 해결되지 않으며 공공처리시설의 용량·공법·비용부담·방류영향이 입주와 가동일정을 좌우한다.",
    sourceKeys: ["waterEnvironment"],
    legalArticles: { waterEnvironment: "제48조~제51조" },
    lanes: ["광주시·산단 지정권자", "환경부", "공공폐수처리시설 시행자", "입주기업·원인자"],
    stages: ["G0 부하예측", "G1 기본계획", "G2 승인·고시", "G3 설계·비용", "G4 건설·준공", "G5 운영·진단"],
    nodes: [
      step("폐수발생량·수질·처리구역·방류수역 영향 예측", "광주시·산단 지정권자", "G0 부하예측", "waterEnvironment", ["제48조·제49조"], ["폐수 부하예측서", "처리구역·방류영향 검토서"]),
      step("공공폐수처리시설 기본계획 작성", "광주시·산단 지정권자", "G1 기본계획", "waterEnvironment", ["제49조"], ["공공폐수처리시설 기본계획안"]),
      step("기본계획 승인 협의·환경부 승인", "환경부", "G2 승인·고시", "waterEnvironment", ["제49조"], ["기본계획 승인서", "협의조건"], { type: "gateway" }),
      step("기본계획 고시·처리구역·시행자 확정", "광주시·산단 지정권자", "G2 승인·고시", "waterEnvironment", ["제48조·제49조"], ["기본계획 고시", "처리구역·시행자 확정서"], { type: "notice" }),
      step("설치·운영 비용부담계획 작성·승인", "광주시·산단 지정권자", "G3 설계·비용", "waterEnvironment", ["제48조의2·제49조의2"], ["비용부담계획", "원인자별 부담안"]),
      step("기본·실시설계와 처리공법·용량 기술검토", "공공폐수처리시설 시행자", "G3 설계·비용", "waterEnvironment", ["제49조"], ["기본·실시설계도서", "처리공법·용량 기술검토서"]),
      step("토지·배수설비·관로 인허가 의제·협의", "공공폐수처리시설 시행자", "G3 설계·비용", "waterEnvironment", ["제48조·제51조"], ["토지·관로 협의결과", "배수설비 설치계획"]),
      step("처리시설·차집관로 건설과 시운전", "공공폐수처리시설 시행자", "G4 건설·준공", "waterEnvironment", ["제48조·제49조"], ["건설공사 기록", "처리시설 시운전 결과"]),
      step("준공확인·운영개시·입주기업 연결", "공공폐수처리시설 시행자", "G4 건설·준공", "waterEnvironment", ["제48조·제50조·제51조"], ["준공확인서", "운영개시 확인", "입주기업 배수설비 연결확인"], { type: "gateway" }),
      step("운영기준 준수·기술진단·성능개선", "환경부", "G5 운영·진단", "waterEnvironment", ["제50조"], ["운영기록", "기술진단 결과", "성능개선계획"]),
    ],
    extras: [["P06", "P02", "loop", "설계·용량 보완"]],
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
      authorities: spec.lanes.map((name) => ({ name, role: spec.name + "의 해당 레인 업무와 산출물 작성·검토·결정을 담당" })),
      procedure,
      moneyFlow: "사업비·지원비·분담금·재산가액은 해당 계획과 개별 하위 법령·고시·협약에서 확정한다.",
      docsFlow: procedure.join(" → "),
      bottlenecks: ["사업구역·시설규모·사업주체의 미확정", "관계기관 협의자료와 기반시설 일정의 불일치", "승인조건·재원·공사·운영 인계의 단절"],
      reformPoints: ["사업·시설 식별자로 신청·협의·심의·고시 산출물을 연결", "관계기관 보완요구와 법정기한을 공통 일정에서 추적", "계획승인 조건을 공사·준공·운영 확인사항으로 구조화"],
    },
    related: specs.filter((item) => item.slug !== spec.slug).slice(0, 4).map((item) => item.name),
    fieldVerification: [
      spec.name + "의 최신 시행령·시행규칙·고시와 제출서식",
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
        "프로젝트별 적용 여부와 세부 제출물은 사업주체·시설규모·공급방식·입지 및 시행령 문턱에 따라 달라지므로 실제 신청 전에 다시 판정해야 한다.",
      ],
    },
    verification: {
      status: "source-linked",
      verifiedAt: AS_OF,
      method: "법제처 국가법령정보 Open API의 현행 법령 검색·조문 조회 결과와 공식 법령 원문 연결",
      scope: "현행 법률의 식별자·공포일·시행일과 프로젝트 마일스톤을 구성하는 핵심 조문 범위를 대조했다. 시행령·시행규칙·고시·서식의 전수 조문 검증은 현장확인 항목으로 분리했다.",
      notes: ["이번 추가분은 광주 반도체클러스터 행정절차 감사에서 독립 산출물로 확인된 7개 제도다."],
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
  console.log("generated " + specs.length + " mega-project infrastructure institutions; manifest=" + manifest.length);
  specs.forEach((spec) => console.log(spec.priority + "\t" + spec.slug + "\t" + spec.name));
}

main();
