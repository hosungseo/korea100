#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const PROJECT_PATH = path.join(WEB_DIR, "data", "mega-projects", "projects", "gwangju-semiconductor-cluster.json");
const INSTITUTIONS_DIR = path.join(WEB_DIR, "data", "institutions");
const project = JSON.parse(fs.readFileSync(PROJECT_PATH, "utf8"));

const sources = [
  { id: "SRC_BUILDING_MANAGEMENT_ACT", type: "statute", title: "건축물관리법", publishedOn: "2024-12-03", effectiveOn: "2025-06-04", url: "https://law.go.kr/법령/건축물관리법" },
  { id: "SRC_ASBESTOS_SAFETY_ACT", type: "statute", title: "석면안전관리법", publishedOn: "2025-10-01", effectiveOn: "2025-10-01", url: "https://law.go.kr/법령/석면안전관리법" },
  { id: "SRC_CONSTRUCTION_WASTE_ACT", type: "statute", title: "건설폐기물의 재활용촉진에 관한 법률", publishedOn: "2025-10-01", effectiveOn: "2025-10-01", url: "https://law.go.kr/법령/건설폐기물의재활용촉진에관한법률" },
  { id: "SRC_WATER_REUSE_ACT", type: "statute", title: "물의 재이용 촉진 및 지원에 관한 법률", publishedOn: "2026-06-09", effectiveOn: "2026-06-09", url: "https://law.go.kr/법령/물의재이용촉진및지원에관한법률" },
  { id: "SRC_NATURE_CONSERVATION_ACT", type: "statute", title: "자연환경보전법", publishedOn: "2026-03-05", effectiveOn: "2026-07-01", url: "https://law.go.kr/법령/자연환경보전법" },
  { id: "SRC_METRO_TRANSPORT_ACT", type: "statute", title: "대도시권 광역교통 관리에 관한 특별법", publishedOn: "2025-12-02", effectiveOn: "2026-06-03", url: "https://law.go.kr/법령/대도시권광역교통관리에관한특별법" },
  { id: "SRC_LANDSCAPE_ACT", type: "statute", title: "경관법", publishedOn: "2025-10-01", effectiveOn: "2025-10-01", url: "https://law.go.kr/법령/경관법" },
  { id: "SRC_MECHANICAL_ACT", type: "statute", title: "기계설비법", publishedOn: "2020-06-09", effectiveOn: "2020-06-09", url: "https://law.go.kr/법령/기계설비법" },
  { id: "SRC_ICT_CONSTRUCTION_ACT", type: "statute", title: "정보통신공사업법", publishedOn: "2025-01-31", effectiveOn: "2026-02-01", url: "https://law.go.kr/법령/정보통신공사업법" },
  { id: "SRC_ELEVATOR_ACT", type: "statute", title: "승강기 안전관리법", publishedOn: "2024-01-30", effectiveOn: "2025-01-31", url: "https://law.go.kr/법령/승강기안전관리법" },
  { id: "SRC_ENV_LIABILITY_ACT", type: "statute", title: "환경오염피해 배상책임 및 구제에 관한 법률", publishedOn: "2025-11-11", effectiveOn: "2026-05-12", url: "https://law.go.kr/법령/환경오염피해배상책임및구제에관한법률" },
  { id: "SRC_ODOR_ACT", type: "statute", title: "악취방지법", publishedOn: "2025-10-01", effectiveOn: "2025-10-01", url: "https://law.go.kr/법령/악취방지법" },
  { id: "SRC_SPATIAL_INFORMATION_ACT", type: "statute", title: "공간정보의 구축 및 관리 등에 관한 법률", publishedOn: "2026-03-05", effectiveOn: "2026-07-01", url: "https://law.go.kr/법령/공간정보의구축및관리등에관한법률" },
  { id: "SRC_SERIOUS_ACCIDENTS_ACT", type: "statute", title: "중대재해 처벌 등에 관한 법률", publishedOn: "2021-01-26", effectiveOn: "2022-01-27", url: "https://law.go.kr/법령/중대재해처벌등에관한법률" },
  { id: "SRC_INDUSTRIAL_TECH_PROTECTION_ACT", type: "statute", title: "산업기술의 유출방지 및 보호에 관한 법률", publishedOn: "2025-12-02", effectiveOn: "2026-06-03", url: "https://law.go.kr/법령/산업기술의유출방지및보호에관한법률" },
  { id: "SRC_FOREIGN_INVESTMENT_ACT", type: "statute", title: "외국인투자 촉진법", publishedOn: "2025-10-01", effectiveOn: "2026-01-02", url: "https://law.go.kr/법령/외국인투자촉진법" },
  { id: "SRC_FOREIGN_TRADE_ACT", type: "statute", title: "대외무역법", publishedOn: "2025-10-01", effectiveOn: "2026-01-02", url: "https://law.go.kr/법령/대외무역법" },
  { id: "SRC_INFO_INFRA_ACT", type: "statute", title: "정보통신기반 보호법", publishedOn: "2024-01-23", effectiveOn: "2025-01-24", url: "https://law.go.kr/법령/정보통신기반보호법" },
  { id: "SRC_RESEARCH_SAFETY_ACT", type: "statute", title: "연구실 안전환경 조성에 관한 법률", publishedOn: "2026-02-19", effectiveOn: "2026-05-20", url: "https://law.go.kr/법령/연구실안전환경조성에관한법률" },
];

for (const source of sources) {
  if (!project.sources.some((item) => item.id === source.id)) project.sources.push(source);
}

const occupationalSafetySource = project.sources.find((item) => item.id === "SRC_OSH_ACT");
if (occupationalSafetySource) {
  occupationalSafetySource.publishedOn = "2026-07-07";
  occupationalSafetySource.effectiveOn = "2026-07-07";
  occupationalSafetySource.url = "https://law.go.kr/법령/산업안전보건법";
}

function ids(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => "P" + String(from + index).padStart(2, "0"));
}

function allIds(slug) {
  const institutionPath = path.join(INSTITUTIONS_DIR, slug + ".json");
  const institution = JSON.parse(fs.readFileSync(institutionPath, "utf8"));
  return institution.process.nodes.map((item) => item.id);
}

function node(nodeId) {
  const target = project.nodes.find((item) => item.id === nodeId);
  if (!target) throw new Error("missing milestone " + nodeId);
  target.templateRefs ??= [];
  target.evidence ??= [];
  return target;
}

function addRef(nodeId, institution, nodeIds, evidence, mappingStatus = "candidate") {
  const target = node(nodeId);
  if (target.templateRefs.some((item) => item.institution === institution)) {
    throw new Error(nodeId + " already references " + institution);
  }
  const ref = { institution, nodeIds };
  if (mappingStatus) ref.mappingStatus = mappingStatus;
  target.templateRefs.push(ref);
  for (const sourceId of evidence) {
    if (!target.evidence.includes(sourceId)) target.evidence.push(sourceId);
  }
}

function appendNote(nodeId, note) {
  const target = node(nodeId);
  target.note = target.note ? target.note + " · " + note : note;
}

// Former-airport demolition and hazardous-material removal.
addRef("N35", "building-demolition-permit-supervision", ids(1, 4), ["SRC_BUILDING_MANAGEMENT_ACT"]);
addRef("N41", "building-demolition-permit-supervision", ids(5, 8), ["SRC_BUILDING_MANAGEMENT_ACT"]);
addRef("N41", "asbestos-survey-removal-supervision", ids(1, 8), ["SRC_OSH_ACT", "SRC_ASBESTOS_SAFETY_ACT"]);
node("N41").name = "종전 군공항 건축물·석면 해체·토양오염 조사·정화·검증";
appendNote("N41", "건축물별 구조·높이와 석면조사 결과가 미확정이므로 해체허가·감리와 석면 제거 경로는 후보로 표시");

// Construction-phase environmental and waste controls.
addRef("N27", "construction-waste-discharge-treatment-plan", ids(1, 4), ["SRC_CONSTRUCTION_WASTE_ACT"], null);
addRef("N28", "construction-waste-discharge-treatment-plan", ids(5, 8), ["SRC_CONSTRUCTION_WASTE_ACT"], null);
addRef("N27", "fugitive-dust-specific-construction-report", ids(1, 5), ["SRC_AIR_ACT", "SRC_NOISE_ACT"], null);
addRef("N28", "fugitive-dust-specific-construction-report", ids(6, 8), ["SRC_AIR_ACT", "SRC_NOISE_ACT"], null);
addRef("N15", "nonpoint-pollution-source-installation-management", ids(1, 4), ["SRC_WATER_ENV_ACT"], null);
addRef("N28", "nonpoint-pollution-source-installation-management", ids(5, 7), ["SRC_WATER_ENV_ACT"], null);
addRef("N29", "nonpoint-pollution-source-installation-management", ["P08"], ["SRC_WATER_ENV_ACT"], null);
node("N27").name = "건축허가·공사환경·설비설계 사전확인·착공신고";
node("N28").name = "부지조성·팹·부대시설 건설·공정환경 관리";
appendNote("N27", "건설폐기물 처리계획과 비산먼지·특정공사 신고를 착공 전 설계·공정계획에 연결");

// Site-development charges, transport, landscape, and cadastral completion.
addRef("N15", "ecosystem-conservation-charge-assessment", ids(1, 5), ["SRC_NATURE_CONSERVATION_ACT"]);
addRef("N35", "ecosystem-conservation-charge-assessment", ids(1, 5), ["SRC_NATURE_CONSERVATION_ACT"]);
addRef("N28", "ecosystem-conservation-charge-assessment", ids(6, 8), ["SRC_NATURE_CONSERVATION_ACT"]);
addRef("N39", "metropolitan-transport-improvement-measures", ids(1, 8), ["SRC_METRO_TRANSPORT_ACT"]);
addRef("N37", "development-building-landscape-review", ids(1, 6), ["SRC_LANDSCAPE_ACT"]);
addRef("N27", "development-building-landscape-review", ids(7, 8), ["SRC_LANDSCAPE_ACT"]);
addRef("N28", "land-development-cadastral-confirmation", ids(1, 5), ["SRC_SPATIAL_INFORMATION_ACT"], null);
addRef("N47", "land-development-cadastral-confirmation", ids(6, 8), ["SRC_SPATIAL_INFORMATION_ACT"], null);
node("N39").name = "교통영향평가·광역교통개선대책 심의·반영";
node("N47").name = "공장설립 완료신고·지적확정·현장확인·공장등록";
appendNote("N15", "생태계 훼손면적·지역계수와 광주 조례상 경관심의 문턱은 확정 설계에서 재판정");

// Utility reuse and dedicated water-supply paths.
addRef("N24", "water-reuse-facility-installation-operation", ids(1, 4), ["SRC_WATER_REUSE_ACT"]);
addRef("N25", "water-reuse-facility-installation-operation", ids(5, 8), ["SRC_WATER_REUSE_ACT"]);
addRef("N24", "dedicated-industrial-waterworks-authorization", ids(1, 4), ["SRC_WATERWORKS_ACT"]);
addRef("N25", "dedicated-industrial-waterworks-authorization", ids(5, 8), ["SRC_WATERWORKS_ACT"]);
node("N24").name = "용수·재이용·전용수도·폐수·하수도·접근도로 승인·비용분담";
node("N25").name = "용수·재이용·전용수도·폐수·하수도·연결도로 공사·준공·공급개시";
appendNote("N24", "재이용시설과 전용수도는 공급방식·시설용량·소유운영 구조가 확정된 뒤 적용 여부를 판정");

// Building systems and pre-operation inspections.
addRef("N27", "mechanical-equipment-precheck-use-inspection", ids(1, 4), ["SRC_MECHANICAL_ACT"], null);
addRef("N48", "mechanical-equipment-precheck-use-inspection", ids(5, 6), ["SRC_MECHANICAL_ACT"], null);
addRef("N49", "mechanical-equipment-precheck-use-inspection", ids(7, 8), ["SRC_MECHANICAL_ACT"], null);
addRef("N27", "ict-construction-design-precheck-use-inspection", ids(1, 4), ["SRC_ICT_CONSTRUCTION_ACT"], null);
addRef("N48", "ict-construction-design-precheck-use-inspection", ids(5, 7), ["SRC_ICT_CONSTRUCTION_ACT"], null);
addRef("N49", "ict-construction-design-precheck-use-inspection", ["P08"], ["SRC_ICT_CONSTRUCTION_ACT"], null);
addRef("N28", "elevator-installation-safety-inspection", ids(1, 4), ["SRC_ELEVATOR_ACT"]);
addRef("N48", "elevator-installation-safety-inspection", ["P05"], ["SRC_ELEVATOR_ACT"]);
addRef("N29", "elevator-installation-safety-inspection", ids(6, 8), ["SRC_ELEVATOR_ACT"]);
addRef("N45", "heat-use-equipment-installation-inspection", ids(1, 4), ["SRC_ENERGY_USE_ACT"]);
addRef("N49", "heat-use-equipment-installation-inspection", ids(5, 6), ["SRC_ENERGY_USE_ACT"]);
addRef("N29", "heat-use-equipment-installation-inspection", ids(7, 8), ["SRC_ENERGY_USE_ACT"]);
node("N48").name = "건축물 사용승인·소방·기계·정보통신·승강기 검사";
node("N49").name = "시험가동·설비성능·기계·통신·열사용기기 안전·수율 검증";
appendNote("N48", "승강기와 검사대상 열사용기기는 실제 설치 목록·용량이 확정될 때 후보 경로를 확정");

// Facility-operation environmental liabilities.
addRef("N45", "environmental-liability-insurance-coverage", ids(1, 5), ["SRC_ENV_LIABILITY_ACT"]);
addRef("N29", "environmental-liability-insurance-coverage", ids(6, 8), ["SRC_ENV_LIABILITY_ACT"]);
addRef("N45", "odor-emission-facility-report-management", ids(1, 5), ["SRC_ODOR_ACT"]);
addRef("N29", "odor-emission-facility-report-management", ids(6, 8), ["SRC_ODOR_ACT"]);
node("N45").name = "통합환경·총량·폐기물·화학·보험·악취·방사선·공정안전 사전심사";
node("N29").name = "환경·총량·폐기물·화학·보험·악취·설비·사용승인·공장등록 운영확인";
appendNote("N45", "환경책임보험과 악취배출시설 신고는 시설종류·지역지정·허가대상 여부가 확정될 때 적용판정");

// Existing catalog templates that were not yet connected to the operation milestone.
const operationCandidates = [
  ["occupational-safety-risk-assessment", "SRC_OSH_ACT"],
  ["serious-accidents", "SRC_SERIOUS_ACCIDENTS_ACT"],
  ["national-core-technology-export-acquisition-review", "SRC_INDUSTRIAL_TECH_PROTECTION_ACT"],
  ["foreign-investment-report", "SRC_FOREIGN_INVESTMENT_ACT"],
  ["foreign-investment-national-security-review", "SRC_FOREIGN_INVESTMENT_ACT"],
  ["export-control-strategic-goods-permit", "SRC_FOREIGN_TRADE_ACT"],
  ["critical-information-infrastructure-protection", "SRC_INFO_INFRA_ACT"],
  ["research-lab-safety-inspection-accident", "SRC_RESEARCH_SAFETY_ACT"],
];
for (const [institution, sourceId] of operationCandidates) {
  addRef("N30", institution, allIds(institution), [sourceId]);
}
node("N30").name = "상업생산 개시·산업안전·핵심기술·투자·수출·보안 운영";
appendNote("N30", "외국인투자·국가핵심기술·전략물자·주요정보통신기반시설 경로는 투자자·기술지정·수출품목·시설지정 사실이 확인될 때 확정");

project.asOfDate = "2026-08-17";
const refs = project.nodes.flatMap((item) => item.templateRefs ?? []);
const unique = new Set(refs.map((item) => item.institution));
const mappedNodes = refs.reduce((total, ref) => total + (ref.nodeIds?.length ?? 0), 0);
project.summary = "정책상 입지 결정 이후 군공항 이전·종전부지 개발, 반도체클러스터 지정, 재정·예타, 산단 통합심의, 토지·환경·안전, 전력·용수·폐수·하수도·도로, 건축·설비·공장·가동까지 49개 중간 마일스톤 아래 " + unique.size + "개 법정 제도와 하위절차를 연결한 프로젝트 오버레이";

fs.writeFileSync(PROJECT_PATH, JSON.stringify(project, null, 2) + "\n");

console.log(JSON.stringify({
  milestones: project.nodes.length,
  sources: project.sources.length,
  templateRefs: refs.length,
  uniqueInstitutions: unique.size,
  mappedSubprocessNodes: mappedNodes,
}, null, 2));
