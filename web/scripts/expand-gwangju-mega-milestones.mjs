#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const PROJECT_PATH = path.join(
  WEB_DIR,
  "data",
  "mega-projects",
  "projects",
  "gwangju-semiconductor-cluster.json",
);
const ARTIFACT_PATH = path.join(WEB_DIR, "data", "mega-projects", "artifacts.json");

const project = JSON.parse(fs.readFileSync(PROJECT_PATH, "utf8"));
const registry = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));

if (project.nodes.length !== 30) {
  throw new Error(`expected the 30-milestone baseline, found ${project.nodes.length}`);
}

const source = (id, type, title, url, dates = {}) => ({ id, type, title, ...dates, url });
const dep = (artifact, basis, options = {}) => ({
  artifact,
  relation: options.relation ?? "finish_to_start",
  strength: options.strength ?? "hard",
  kind: options.kind ?? "legal",
  basis,
  ...(options.note ? { note: options.note } : {}),
  ...(options.whenRule ? { whenRule: options.whenRule } : {}),
});
const ref = (institution, nodeIds) => ({ institution, ...(nodeIds ? { nodeIds } : {}) });

const newSources = [
  source(
    "SRC_AIRPORT_RELOCATION_STATUS",
    "official-status",
    "광주 군공항 이전사업 추진현황",
    "https://www.gwangju.go.kr/airforce/contentsView.do?pageId=airforce3",
    { publishedOn: "2026-04-02" },
  ),
  source(
    "SRC_MILITARY_AIRPORT_ACT",
    "statute",
    "군 공항 이전 및 지원에 관한 특별법",
    "https://www.law.go.kr/법령/군공항이전및지원에관한특별법",
    { effectiveOn: "2026-01-02" },
  ),
  source(
    "SRC_DISASTER_IMPACT_ACT",
    "statute",
    "자연재해대책법",
    "https://www.law.go.kr/법령/자연재해대책법",
    { effectiveOn: "2026-01-02" },
  ),
  source(
    "SRC_TRAFFIC_IMPACT_ACT",
    "statute",
    "도시교통정비 촉진법",
    "https://www.law.go.kr/법령/도시교통정비촉진법",
    { effectiveOn: "2026-07-01" },
  ),
  source(
    "SRC_ENERGY_USE_ACT",
    "statute",
    "에너지이용 합리화법",
    "https://www.law.go.kr/법령/에너지이용합리화법",
    { effectiveOn: "2026-05-28" },
  ),
  source(
    "SRC_SOIL_ACT",
    "statute",
    "토양환경보전법",
    "https://www.law.go.kr/법령/토양환경보전법",
  ),
  source(
    "SRC_ELECTRICAL_SAFETY_ACT",
    "statute",
    "전기안전관리법",
    "https://www.law.go.kr/법령/전기안전관리법",
  ),
  source(
    "SRC_INTEGRATED_ENV_ACT",
    "statute",
    "환경오염시설의 통합관리에 관한 법률",
    "https://www.law.go.kr/법령/환경오염시설의통합관리에관한법률",
  ),
  source(
    "SRC_CHEMICAL_ACT",
    "statute",
    "화학물질관리법",
    "https://www.law.go.kr/법령/화학물질관리법",
  ),
  source(
    "SRC_OSH_ACT",
    "statute",
    "산업안전보건법",
    "https://www.law.go.kr/법령/산업안전보건법",
    { effectiveOn: "2026-08-01" },
  ),
  source(
    "SRC_DANGEROUS_MATERIALS_ACT",
    "statute",
    "위험물안전관리법",
    "https://www.law.go.kr/법령/위험물안전관리법",
    { effectiveOn: "2025-08-07" },
  ),
  source(
    "SRC_HIGH_PRESSURE_GAS_ACT",
    "statute",
    "고압가스 안전관리법",
    "https://www.law.go.kr/법령/고압가스안전관리법",
    { effectiveOn: "2026-03-10" },
  ),
  source(
    "SRC_FIRE_CONSTRUCTION_ACT",
    "statute",
    "소방시설공사업법",
    "https://www.law.go.kr/법령/소방시설공사업법",
    { effectiveOn: "2025-01-31" },
  ),
];

project.sources.push(...newSources);
project.parameters.hazardousFacilityPermitsRequired = {
  value: null,
  status: "unknown",
  reason: "팹별 위험물 지정수량·고압가스 종류와 저장·처리능력, 시설배치가 공개되지 않아 허가·검사 적용범위를 확정할 수 없음",
};
project.rules.push({
  id: "RULE_HAZARDOUS_FACILITY_PATH",
  type: "boolean",
  parameter: "hazardousFacilityPermitsRequired",
  default: null,
  description: "위험물 제조소등 또는 고압가스 제조·저장·특정사용시설 법정 문턱을 넘으면 설치허가·중간검사·완공검사 경로를 활성화한다.",
});

const disasterActor = {
  id: "disaster-safety",
  code: "A10",
  label: "행안부·재해안전기관",
  shortLabel: "재해안전",
  mandate: "재해영향 협의·방재 이행",
};
const heritageIndex = project.actors.findIndex((actor) => actor.id === "heritage-protection");
project.actors.splice(heritageIndex, 0, disasterActor);

const artifactAdditions = [
  ["military_airport.preliminary_candidate_selected", "예비이전후보지 선정", "designation", "국방부가 관계기관 협의를 거쳐 군 공항 예비이전후보지를 선정·공표한 상태"],
  ["military_airport.selection_support_plan_published", "이전부지 선정·지원계획 공고", "plan", "이전후보지, 종전부지 활용과 이전주변지역 지원계획이 위원회 심의를 거쳐 공고된 상태"],
  ["military_airport.final_site_selected", "최종 군공항 이전부지 선정", "designation", "주민투표와 지방자치단체 유치신청을 거쳐 최종 이전부지가 선정된 상태"],
  ["former_site.development_plan_published", "종전부지 개발계획 고시", "plan", "개발사업시행자가 수립한 종전부지 개발계획이 지방자치단체 고시·열람된 상태"],
  ["former_site.implementation_plan_published", "종전부지 실시계획 고시·의제", "permit", "설계·재원·환경·교통 결과와 의제자료를 포함한 실시계획이 고시된 상태"],
  ["industrial_complex.plan_application_submitted", "산업단지계획 승인신청", "plan", "평가·교통·재해·에너지 첨부자료를 갖춘 산업단지계획 승인신청이 접수된 상태"],
  ["industrial_complex.integrated_review_completed", "산단 통합조정·기술검토·심의 완료", "permit", "동시협의와 이견조정, 기술검토, 산업단지계획심의위원회 심의가 완료된 상태"],
  ["disaster.consultation_completed", "재해영향평가 협의·반영 완료", "environment", "재해영향평가등 협의결과가 사업계획에 반영되고 착수 전 협의완료가 확인된 상태"],
  ["traffic.assessment_reflected", "교통영향평가 개선사항 반영", "plan", "교통영향평가 심의에서 확정된 개선필요사항이 승인계획과 실시설계에 반영된 상태"],
  ["energy.use_plan_consulted", "에너지사용계획 협의 완료", "plan", "에너지 수요·공급·효율화 계획에 대한 관계기관 협의의견이 사업계획에 반영된 상태"],
  ["site.soil_path_cleared", "토양오염 조사·정화경로 해소", "land", "토양오염 조사 결과에 따라 무오염 확인 또는 정화·검증이 완료된 상태"],
  ["site.national_property_transfer_completed", "국유재산·종전부지 권리이전 완료", "land", "기부 대 양여와 행정재산 용도폐지·인계 등 종전부지 권리이전이 완료된 상태"],
  ["power.supply_contract_work_plan_approved", "전력 공급계약·자가용설비 공사계획 승인", "infrastructure", "계통이용·공급계약과 수전·자가용전기설비 공사계획 인가·신고가 완료된 상태"],
  ["power.preuse_inspection_energized", "전기 사용전검사·가압 완료", "infrastructure", "수전·자가용전기설비 사용전검사와 계통 병입·가압이 완료된 상태"],
  ["facility.integrated_safety_environment_cleared", "통합환경·화학·공정안전 사전심사 완료", "permit", "통합환경허가, 화학사고예방관리계획과 유해위험·공정안전 사전심사 적용경로가 해소된 상태"],
  ["facility.hazardous_gas_permits_cleared", "위험물·고압가스 허가·완공검사 완료", "permit", "위험물·고압가스 시설의 설치·변경허가와 중간·완공검사, 사용신고가 완료된 상태"],
  ["factory.registration_completed", "공장완료신고·등록 완료", "permit", "공장설립 승인사항에 따른 공사완료 신고와 현장확인을 거쳐 공장등록이 완료된 상태"],
  ["building.use_fire_completion_approved", "건축 사용승인·소방 완공검사 완료", "permit", "건축물 사용승인과 소방시설 감리결과·완공검사가 완료된 상태"],
  ["facility.commissioning_completed", "시험가동·성능검증 완료", "operation", "전력·용수·안전·환경 조건을 충족한 상태에서 시험가동과 성능·안전 검증이 완료된 상태"],
].map(([id, label, category, definition]) => ({ id, label, category, definition }));

registry.artifacts.push(...artifactAdditions);

const nodeById = new Map(project.nodes.map((node) => [node.id, node]));
const patchNode = (id, values) => Object.assign(nodeById.get(id), values);

patchNode("N02", {
  templateRefs: [ref("one-stop-permit-consultation")],
});
patchNode("N04", {
  name: "군공항 이전건의·예비이전후보지 선정",
  authority: "광주시·국방부·관계기관",
  actorRoles: {
    lead: ["국방부"],
    consult: ["광주시", "전남도", "무안군", "관계기관"],
    decision: ["국방부"],
  },
  status: "completed",
  confidence: "official",
  requires: [],
  produces: ["military_airport.preliminary_candidate_selected"],
  templateRefs: [ref("military-airport-relocation-site-selection", ["P01", "P02", "P03"])],
  evidence: ["SRC_MILITARY_AIRPORT_ACT", "SRC_AIRPORT_RELOCATION_STATUS"],
  actual: { completedOn: "2026-04-02" },
  note: "광주시 공식 추진현황은 2026년 4월 2일 전남 무안군 망운면을 예비이전후보지로 선정한 것으로 공개한다. 이는 최종 이전부지 선정과 대체공항 건설 완료가 아니다.",
});
patchNode("N05", {
  requires: [dep("military_airport.relocation_execution_plan_confirmed", ["SRC_MILITARY_AIRPORT_ACT", "SRC_AIRPORT_RELOCATION_ACT"])],
  templateRefs: [ref("military-airport-relocation-site-selection", ["P12"])],
  evidence: ["SRC_MILITARY_AIRPORT_ACT", "SRC_AIRPORT_RELOCATION_ACT"],
});
patchNode("N06", {
  name: "산업단지 투자의향·지정요청·입지조사",
  templateRefs: [
    ref("industrial-complex-development", ["P01", "P02"]),
    ref("industrial-complex-fast-track-plan-approval", ["P01"]),
  ],
});
patchNode("N07", {
  templateRefs: [
    ref("industrial-complex-development", ["P05"]),
    ref("industrial-complex-fast-track-plan-approval", ["P02"]),
  ],
});
patchNode("N08", {
  name: "산업단지계획 공고·공람·주민·전문가 의견청취",
  requires: [dep("industrial_complex.plan_application_submitted", ["SRC_INDUSTRIAL_FASTTRACK_ACT"])],
  templateRefs: [
    ref("industrial-complex-development", ["P19"]),
    ref("industrial-complex-fast-track-plan-approval", ["P04"]),
  ],
});
patchNode("N09", {
  requires: [
    dep("industrial_complex.plan_application_submitted", ["SRC_INDUSTRIAL_FASTTRACK_ACT", "SRC_EIA_ACT"]),
    dep("participation.industrial_complex_opinion_completed", ["SRC_EIA_ACT"], { relation: "finish_to_finish", strength: "soft", kind: "protection" }),
  ],
});
patchNode("N10", {
  name: "산업단지계획 승인·지정 고시",
  requires: [dep("industrial_complex.integrated_review_completed", ["SRC_INDUSTRIAL_FASTTRACK_ACT"])],
  templateRefs: [
    ref("industrial-complex-development", ["P03", "P04"]),
    ref("industrial-complex-fast-track-plan-approval", ["P11", "P12"]),
  ],
  evidence: ["SRC_INDUSTRIAL_SITING_ACT", "SRC_INDUSTRIAL_FASTTRACK_ACT"],
});
patchNode("N11", {
  requires: [dep("industrial_complex.plan_application_submitted", ["SRC_INDUSTRIAL_FASTTRACK_ACT", "SRC_EIA_ACT"])],
});
patchNode("N13", {
  requires: [dep("industrial_complex.plan_application_submitted", ["SRC_INDUSTRIAL_FASTTRACK_ACT", "SRC_HERITAGE_DIAGNOSIS_ACT"])],
});
patchNode("N14", {
  name: "의제 인허가 실체요건·평가·협의자료 취합",
  requires: [
    dep("industrial_complex.plan_application_submitted", ["SRC_INDUSTRIAL_FASTTRACK_ACT"]),
    dep("environment.consultation_completed", ["SRC_EIA_ACT"]),
    dep("disaster.consultation_completed", ["SRC_DISASTER_IMPACT_ACT"]),
    dep("traffic.assessment_reflected", ["SRC_TRAFFIC_IMPACT_ACT"]),
    dep("energy.use_plan_consulted", ["SRC_ENERGY_USE_ACT"]),
    dep("heritage.impact_diagnosis_cleared", ["SRC_HERITAGE_DIAGNOSIS_ACT"], {
      kind: "protection",
      whenRule: { rule: "RULE_HERITAGE_PATH", equals: true },
    }),
  ],
  templateRefs: [ref("development-permit"), ref("one-stop-permit-consultation"), ref("industrial-complex-development")],
  evidence: ["SRC_INDUSTRIAL_FASTTRACK_ACT", "SRC_AIRPORT_RELOCATION_ACT", "SRC_EIA_ACT", "SRC_DISASTER_IMPACT_ACT", "SRC_TRAFFIC_IMPACT_ACT", "SRC_ENERGY_USE_ACT"],
});
patchNode("N15", {
  name: "산단 실시계획·의제 인허가 승인조건 확정",
  requires: [
    dep("cross_permits.requirements_compiled", ["SRC_INDUSTRIAL_FASTTRACK_ACT"]),
    dep("industrial_complex.integrated_review_completed", ["SRC_INDUSTRIAL_FASTTRACK_ACT"]),
    dep("industrial_complex.designated", ["SRC_INDUSTRIAL_FASTTRACK_ACT"], { relation: "finish_to_finish" }),
  ],
  templateRefs: [ref("industrial-complex-development", ["P10"]), ref("one-stop-permit-consultation", ["P05", "P06", "P08"])],
  evidence: ["SRC_INDUSTRIAL_SITING_ACT", "SRC_INDUSTRIAL_FASTTRACK_ACT"],
  note: "산단계획 승인·지정과 실시계획·인허가 의제는 법적으로 같은 승인고시에 결합될 수 있다. 화면에서는 승인결정과 개별 의제조건 인계를 병렬 완료 항목으로 분리한다.",
});
patchNode("N17", {
  name: "종전부지·편입토지 법적 사용권·권리이전 확보",
  requires: [
    dep("site.national_property_transfer_completed", ["SRC_AIRPORT_RELOCATION_ACT", "SRC_MILITARY_AIRPORT_ACT"]),
    dep("site.soil_path_cleared", ["SRC_SOIL_ACT"], { kind: "protection" }),
    dep("land.compensation_completed", ["SRC_LAND_COMPENSATION_ACT"], {
      whenRule: { rule: "RULE_PRIVATE_LAND_COMPENSATION", equals: true },
    }),
  ],
  templateRefs: [ref("public-property-use-permission"), ref("local-property-management")],
  evidence: ["SRC_AIRPORT_RELOCATION_ACT", "SRC_MILITARY_AIRPORT_ACT", "SRC_LAND_COMPENSATION_ACT", "SRC_SOIL_ACT"],
});
patchNode("N22", {
  name: "송변전망 공사·계통접속 완료",
  requires: [
    dep("power.transmission_plan_approved", ["SRC_ELECTRICITY_ACT", "SRC_NATIONAL_GRID_ACT"], { kind: "technical" }),
    dep("power.supply_contract_work_plan_approved", ["SRC_ELECTRICITY_ACT", "SRC_ELECTRICAL_SAFETY_ACT"], { kind: "technical" }),
    dep("industrial_complex.implementation_plan_approved", ["SRC_INDUSTRIAL_SITING_ACT"], { kind: "legal" }),
  ],
  templateRefs: [ref("power-generation-grid-connection", ["P11", "P12", "P13", "P14"])],
});
patchNode("N27", {
  templateRefs: [
    ref("building-permit-use-approval"),
    ref("fire-facility-construction-completion-inspection", ["P01", "P02", "P03", "P04", "P05"]),
  ],
  evidence: ["SRC_BUILDING_ACT", "SRC_FIRE_CONSTRUCTION_ACT"],
});
patchNode("N28", {
  requires: [
    dep("site.legal_control_secured", ["SRC_AIRPORT_RELOCATION_ACT", "SRC_LAND_COMPENSATION_ACT"]),
    dep("construction.permits_cleared", ["SRC_BUILDING_ACT", "SRC_FIRE_CONSTRUCTION_ACT"]),
    dep("environment.consultation_completed", ["SRC_EIA_ACT"], { kind: "protection" }),
    dep("facility.integrated_safety_environment_cleared", ["SRC_INTEGRATED_ENV_ACT", "SRC_CHEMICAL_ACT", "SRC_OSH_ACT"], { relation: "finish_to_finish", kind: "protection" }),
  ],
});
patchNode("N29", {
  name: "환경·안전·사용·공장등록 운영허가 통합확인",
  requires: [
    dep("facility.integrated_safety_environment_cleared", ["SRC_INTEGRATED_ENV_ACT", "SRC_CHEMICAL_ACT", "SRC_OSH_ACT"], { kind: "protection" }),
    dep("facility.hazardous_gas_permits_cleared", ["SRC_DANGEROUS_MATERIALS_ACT", "SRC_HIGH_PRESSURE_GAS_ACT"], {
      kind: "protection",
      whenRule: { rule: "RULE_HAZARDOUS_FACILITY_PATH", equals: true },
    }),
    dep("factory.registration_completed", ["SRC_FACTORY_ACT"]),
    dep("building.use_fire_completion_approved", ["SRC_BUILDING_ACT", "SRC_FIRE_CONSTRUCTION_ACT"], { kind: "protection" }),
  ],
  templateRefs: [
    ref("integrated-environment-permit", ["P17"]),
    ref("factory-establishment-approval-management", ["P09", "P11"]),
    ref("building-permit-use-approval", ["P09", "P11"]),
  ],
  evidence: ["SRC_INTEGRATED_ENV_ACT", "SRC_CHEMICAL_ACT", "SRC_OSH_ACT", "SRC_FACTORY_ACT", "SRC_BUILDING_ACT", "SRC_FIRE_CONSTRUCTION_ACT"],
});
patchNode("N30", {
  name: "상업생산 개시",
  requires: [dep("facility.commissioning_completed", ["SRC_FACTORY_ACT", "SRC_ELECTRICAL_SAFETY_ACT"], { kind: "technical" })],
  note: "법정 가동 전 검사·등록을 마친 뒤 사업자가 품질·수율·고객승인 조건을 충족해 상업생산을 시작하는 프로젝트 내부 의사결정 단계",
});

function newNode({
  id,
  name,
  stage,
  authority,
  leadActor,
  lead,
  consult = [],
  decision,
  classification,
  status = "planned",
  confidence = "statutory",
  activation = { mode: "always" },
  requires,
  produces,
  templateRefs,
  evidence,
  note,
}) {
  return {
    id,
    name,
    stage,
    authority,
    leadActor,
    actorRoles: { lead, consult, decision },
    classification,
    status,
    confidence,
    activation,
    requires,
    produces,
    ...(templateRefs ? { templateRefs } : {}),
    evidence,
    ...(note ? { note } : {}),
  };
}

const newNodes = [
  newNode({
    id: "N31", name: "이전후보지·종전부지·지원계획 심의·공고", stage: "G1",
    authority: "국방부·군공항이전부지선정위원회·군공항이전사업지원위원회", leadActor: "defense-airport",
    lead: ["국방부"], consult: ["광주시", "전남도", "무안군"], decision: ["이전부지선정위원회", "이전사업지원위원회"],
    classification: "legal_gate",
    requires: [dep("military_airport.preliminary_candidate_selected", ["SRC_MILITARY_AIRPORT_ACT"]), dep("project.integrated_delivery_ready", ["SRC_3MEGA_POLICY"], { relation: "start_to_start", strength: "soft", kind: "policy" })],
    produces: ["military_airport.selection_support_plan_published"],
    templateRefs: [ref("military-airport-relocation-site-selection", ["P04", "P05", "P10"])],
    evidence: ["SRC_MILITARY_AIRPORT_ACT", "SRC_AIRPORT_RELOCATION_STATUS"],
  }),
  newNode({
    id: "N32", name: "주민투표·유치신청·최종 군공항 이전부지 선정", stage: "G1",
    authority: "이전지역 주민·지방자치단체·국방부·이전부지선정위원회", leadActor: "defense-airport",
    lead: ["국방부"], consult: ["이전지역 주민", "이전지역 지방자치단체"], decision: ["이전부지선정위원회"],
    classification: "protection_gate",
    requires: [dep("military_airport.selection_support_plan_published", ["SRC_MILITARY_AIRPORT_ACT"], { kind: "protection" })],
    produces: ["military_airport.final_site_selected"],
    templateRefs: [ref("military-airport-relocation-site-selection", ["P06", "P07", "P08"])],
    evidence: ["SRC_MILITARY_AIRPORT_ACT"],
  }),
  newNode({
    id: "N33", name: "사업시행자·기부 대 양여·재원·지원사업 확정", stage: "G1",
    authority: "광주시·국방부·사업시행자·지원위원회", leadActor: "defense-airport",
    lead: ["광주시", "사업시행자"], consult: ["국방부", "이전지역 지방자치단체"], decision: ["국방부", "이전사업지원위원회"],
    classification: "legal_gate",
    requires: [dep("military_airport.final_site_selected", ["SRC_MILITARY_AIRPORT_ACT"]), dep("project.integrated_delivery_ready", ["SRC_3MEGA_POLICY"], { relation: "start_to_start", strength: "soft", kind: "policy" })],
    produces: ["military_airport.relocation_execution_plan_confirmed"],
    templateRefs: [ref("military-airport-relocation-site-selection", ["P09", "P10", "P11"])],
    evidence: ["SRC_MILITARY_AIRPORT_ACT", "SRC_AIRPORT_RELOCATION_ACT"],
  }),
  newNode({
    id: "N34", name: "종전부지 개발사업시행자·개발계획 수립·고시", stage: "G1",
    authority: "개발사업시행자·광주시", leadActor: "gwangju-designation",
    lead: ["광주시", "개발사업시행자"], consult: ["국방부", "관계기관"], decision: ["광주시"],
    classification: "plan",
    requires: [dep("project.site_policy_selected", ["SRC_SITE_DECISION"], { kind: "policy" }), dep("military_airport.relocation_execution_plan_confirmed", ["SRC_AIRPORT_RELOCATION_ACT"], { relation: "start_to_start", strength: "hard", kind: "financial", note: "시행자·재원·사용가능 시점을 계획에 반영" })],
    produces: ["former_site.development_plan_published"],
    templateRefs: [ref("former-airport-site-development-plan", ["P01", "P02", "P03", "P04"])],
    evidence: ["SRC_AIRPORT_RELOCATION_ACT"],
  }),
  newNode({
    id: "N35", name: "종전부지 실시계획 수립·고시·인허가 의제", stage: "G3",
    authority: "개발사업시행자·광주시·관계 행정기관", leadActor: "developer-enterprise",
    lead: ["개발사업시행자"], consult: ["광주시", "관계 행정기관"], decision: ["광주시"],
    classification: "legal_gate",
    requires: [dep("former_site.development_plan_published", ["SRC_AIRPORT_RELOCATION_ACT"]), dep("cross_permits.requirements_compiled", ["SRC_AIRPORT_RELOCATION_ACT"]), dep("environment.consultation_completed", ["SRC_AIRPORT_RELOCATION_ACT", "SRC_EIA_ACT"], { kind: "protection" }), dep("traffic.assessment_reflected", ["SRC_AIRPORT_RELOCATION_ACT", "SRC_TRAFFIC_IMPACT_ACT"])],
    produces: ["former_site.implementation_plan_published"],
    templateRefs: [ref("former-airport-site-development-plan", ["P05", "P06", "P07", "P08", "P09", "P10"])],
    evidence: ["SRC_AIRPORT_RELOCATION_ACT", "SRC_EIA_ACT", "SRC_TRAFFIC_IMPACT_ACT"],
  }),
  newNode({
    id: "N36", name: "산업단지계획 승인신청·평가 첨부자료 접수", stage: "G2",
    authority: "사업시행자·산업단지 지정권자", leadActor: "developer-enterprise",
    lead: ["사업시행자"], consult: ["광주시", "산업단지 지정권자"], decision: ["산업단지 지정권자"],
    classification: "legal_gate",
    requires: [dep("industrial_complex.development_plan_draft", ["SRC_INDUSTRIAL_FASTTRACK_ACT"])],
    produces: ["industrial_complex.plan_application_submitted"],
    templateRefs: [ref("industrial-complex-fast-track-plan-approval", ["P03"])],
    evidence: ["SRC_INDUSTRIAL_FASTTRACK_ACT"],
  }),
  newNode({
    id: "N37", name: "동시협의·통합조정·기술검토·산단계획 통합심의", stage: "G2",
    authority: "산업단지 지정권자·관계 행정기관·산업단지계획심의위원회", leadActor: "gwangju-designation",
    lead: ["산업단지 지정권자"], consult: ["관계 행정기관", "국무조정실"], decision: ["산업단지계획심의위원회"],
    classification: "legal_gate",
    requires: [dep("participation.industrial_complex_opinion_completed", ["SRC_INDUSTRIAL_FASTTRACK_ACT"], { kind: "protection" }), dep("cross_permits.requirements_compiled", ["SRC_INDUSTRIAL_FASTTRACK_ACT"]), dep("environment.strategic_consultation_completed", ["SRC_INDUSTRIAL_FASTTRACK_ACT", "SRC_EIA_ACT"], { kind: "protection" })],
    produces: ["industrial_complex.integrated_review_completed"],
    templateRefs: [ref("industrial-complex-fast-track-plan-approval", ["P05", "P06", "P07", "P08", "P09", "P10"])],
    evidence: ["SRC_INDUSTRIAL_FASTTRACK_ACT", "SRC_EIA_ACT"],
  }),
  newNode({
    id: "N38", name: "재해영향평가등 협의·계획반영", stage: "G2",
    authority: "광주시·행정안전부·재해영향평가심의위원회", leadActor: "disaster-safety",
    lead: ["광주시", "사업시행자"], consult: ["행정안전부", "전문검토기관"], decision: ["행정안전부", "승인기관"],
    classification: "protection_gate",
    requires: [dep("industrial_complex.plan_application_submitted", ["SRC_DISASTER_IMPACT_ACT", "SRC_INDUSTRIAL_FASTTRACK_ACT"], { kind: "protection" })],
    produces: ["disaster.consultation_completed"],
    templateRefs: [ref("disaster-impact-assessment-consultation", ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08"])],
    evidence: ["SRC_DISASTER_IMPACT_ACT", "SRC_INDUSTRIAL_FASTTRACK_ACT"],
  }),
  newNode({
    id: "N39", name: "교통영향평가 심의·개선필요사항 반영", stage: "G3",
    authority: "사업시행자·광주시·교통영향평가심의위원회", leadActor: "infrastructure-operators",
    lead: ["사업시행자", "광주시"], consult: ["도로·교통 관계기관"], decision: ["교통영향평가심의위원회", "승인기관"],
    classification: "protection_gate",
    requires: [dep("industrial_complex.plan_application_submitted", ["SRC_TRAFFIC_IMPACT_ACT", "SRC_INDUSTRIAL_FASTTRACK_ACT"], { kind: "protection" })],
    produces: ["traffic.assessment_reflected"],
    templateRefs: [ref("traffic-impact-assessment-review", ["P01", "P02", "P03", "P04", "P05", "P06", "P07"])],
    evidence: ["SRC_TRAFFIC_IMPACT_ACT", "SRC_AIRPORT_RELOCATION_ACT"],
  }),
  newNode({
    id: "N40", name: "에너지사용계획 협의·설계 반영", stage: "G3",
    authority: "사업시행자·산업통상부·에너지전문기관", leadActor: "climate-environment-energy",
    lead: ["사업시행자"], consult: ["산업통상부", "에너지전문기관"], decision: ["산업통상부"],
    classification: "technical_gate",
    requires: [dep("industrial_complex.plan_application_submitted", ["SRC_ENERGY_USE_ACT", "SRC_INDUSTRIAL_FASTTRACK_ACT"], { kind: "technical" })],
    produces: ["energy.use_plan_consulted"],
    templateRefs: [ref("energy-use-plan-consultation", ["P01", "P02", "P03", "P04", "P05", "P06", "P07"])],
    evidence: ["SRC_ENERGY_USE_ACT", "SRC_AIRPORT_RELOCATION_ACT"],
  }),
  newNode({
    id: "N41", name: "종전 군공항 토양오염 조사·정화·검증", stage: "G4",
    authority: "광주시·환경부·토양관련전문기관·정화책임자", leadActor: "climate-environment-energy",
    lead: ["광주시", "정화책임자"], consult: ["환경부", "토양관련전문기관"], decision: ["관할 행정기관"],
    classification: "protection_gate",
    requires: [dep("project.site_policy_selected", ["SRC_SITE_DECISION"], { kind: "policy" }), dep("former_site.development_plan_published", ["SRC_SOIL_ACT"], { relation: "start_to_start", strength: "soft", kind: "protection" })],
    produces: ["site.soil_path_cleared"],
    templateRefs: [ref("soil-contamination-investigation-remediation", ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12"])],
    evidence: ["SRC_SOIL_ACT", "SRC_SITE_DECISION"],
    note: "군공항 이력상 토양오염 여부를 확인할 필요가 있으나 공개자료로 오염을 단정하지 않는다. 조사 결과 무오염이면 정화 단계는 비적용으로 종결한다.",
  }),
  newNode({
    id: "N42", name: "국유재산 용도폐지·기부 대 양여·종전부지 권리이전", stage: "G4",
    authority: "국방부·광주시·사업시행자·국유재산 관리기관", leadActor: "defense-airport",
    lead: ["국방부", "광주시"], consult: ["사업시행자", "국유재산 관리기관"], decision: ["국방부", "국유재산 관리기관"],
    classification: "legal_gate",
    requires: [dep("site.former_airport_handed_over", ["SRC_MILITARY_AIRPORT_ACT", "SRC_AIRPORT_RELOCATION_ACT"]), dep("former_site.implementation_plan_published", ["SRC_AIRPORT_RELOCATION_ACT"])],
    produces: ["site.national_property_transfer_completed"],
    templateRefs: [ref("public-property-use-permission"), ref("local-property-management")],
    evidence: ["SRC_MILITARY_AIRPORT_ACT", "SRC_AIRPORT_RELOCATION_ACT"],
  }),
  newNode({
    id: "N43", name: "전력 공급·이용계약·자가용설비 공사계획 승인", stage: "G5",
    authority: "한전·사업시행자·전기안전기관", leadActor: "infrastructure-operators",
    lead: ["한전", "사업시행자"], consult: ["전기안전기관", "산업통상부"], decision: ["한전", "전기안전기관"],
    classification: "technical_gate",
    requires: [dep("power.grid_clearance_obtained", ["SRC_ELECTRICITY_ACT", "SRC_DISTRIBUTED_ENERGY_ACT"], { kind: "technical" }), dep("industrial_complex.implementation_plan_approved", ["SRC_INDUSTRIAL_SITING_ACT"], { kind: "legal" })],
    produces: ["power.supply_contract_work_plan_approved"],
    templateRefs: [ref("power-generation-grid-connection", ["P12", "P13", "P15"]), ref("self-use-electrical-equipment", ["P01", "P02", "P03", "P04", "P05", "P06"])],
    evidence: ["SRC_ELECTRICITY_ACT", "SRC_ELECTRICAL_SAFETY_ACT"],
  }),
  newNode({
    id: "N44", name: "전기 사용전검사·계통 병입·가압", stage: "G5",
    authority: "전기안전기관·한전·사업시행자", leadActor: "infrastructure-operators",
    lead: ["사업시행자", "한전"], consult: ["전기안전기관"], decision: ["전기안전기관", "한전"],
    classification: "technical_gate",
    requires: [dep("power.connection_ready", ["SRC_ELECTRICITY_ACT"], { kind: "technical" }), dep("facility.construction_completed", ["SRC_ELECTRICAL_SAFETY_ACT"], { kind: "technical" })],
    produces: ["power.preuse_inspection_energized"],
    templateRefs: [ref("self-use-electrical-equipment", ["P07", "P08", "P09", "P10"]), ref("power-generation-grid-connection", ["P16"])],
    evidence: ["SRC_ELECTRICAL_SAFETY_ACT", "SRC_ELECTRICITY_ACT"],
  }),
  newNode({
    id: "N45", name: "통합환경·화학사고·유해위험·공정안전 사전심사", stage: "G7",
    authority: "환경부·고용노동부·산업안전보건공단·사업자", leadActor: "local-permit-operations",
    lead: ["사업자"], consult: ["환경부", "고용노동부", "산업안전보건공단"], decision: ["환경부", "고용노동부"],
    classification: "protection_gate",
    requires: [dep("factory.occupancy_and_establishment_approved", ["SRC_FACTORY_ACT"]), dep("industrial_complex.implementation_plan_approved", ["SRC_INDUSTRIAL_FASTTRACK_ACT"])],
    produces: ["facility.integrated_safety_environment_cleared"],
    templateRefs: [ref("integrated-environment-permit"), ref("chemical-accident-prevention-plan"), ref("process-safety-report-review", ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08"])],
    evidence: ["SRC_INTEGRATED_ENV_ACT", "SRC_CHEMICAL_ACT", "SRC_OSH_ACT", "SRC_ADVANCED_STRATEGIC_ACT"],
    note: "각 제도의 규모·물질·공정 문턱을 먼저 판정하고, 비대상은 판정기록으로 해소한다. 대상 제도는 허가·심사결과를 시험가동 전까지 완료한다.",
  }),
  newNode({
    id: "N46", name: "위험물·고압가스 설치허가·중간·완공검사", stage: "G7",
    authority: "소방본부·지방자치단체·가스안전공사·사업자", leadActor: "local-permit-operations",
    lead: ["사업자"], consult: ["소방본부", "가스안전공사"], decision: ["소방본부", "지방자치단체"],
    classification: "protection_gate",
    activation: { mode: "rule", rule: "RULE_HAZARDOUS_FACILITY_PATH", equals: true },
    requires: [dep("factory.occupancy_and_establishment_approved", ["SRC_DANGEROUS_MATERIALS_ACT", "SRC_HIGH_PRESSURE_GAS_ACT"]), dep("facility.construction_completed", ["SRC_DANGEROUS_MATERIALS_ACT", "SRC_HIGH_PRESSURE_GAS_ACT"], { relation: "finish_to_finish", kind: "protection" })],
    produces: ["facility.hazardous_gas_permits_cleared"],
    templateRefs: [ref("dangerous-material-facility-permit-inspection"), ref("high-pressure-gas-facility-permit-inspection")],
    evidence: ["SRC_DANGEROUS_MATERIALS_ACT", "SRC_HIGH_PRESSURE_GAS_ACT"],
  }),
  newNode({
    id: "N47", name: "공장설립 완료신고·현장확인·공장등록", stage: "G7",
    authority: "입주기업·산업단지 관리기관·광주시", leadActor: "local-permit-operations",
    lead: ["입주기업"], consult: ["산업단지 관리기관", "광주시"], decision: ["공장등록 관할기관"],
    classification: "legal_gate",
    requires: [dep("facility.construction_completed", ["SRC_FACTORY_ACT"]), dep("factory.occupancy_and_establishment_approved", ["SRC_FACTORY_ACT"])],
    produces: ["factory.registration_completed"],
    templateRefs: [ref("factory-establishment-approval-management", ["P09", "P10", "P11"])],
    evidence: ["SRC_FACTORY_ACT"],
  }),
  newNode({
    id: "N48", name: "건축물 사용승인·소방시설 완공검사", stage: "G7",
    authority: "광주시·소방본부·건축주·감리자", leadActor: "local-permit-operations",
    lead: ["건축주", "감리자"], consult: ["광주시", "소방본부"], decision: ["건축허가권자", "소방본부"],
    classification: "protection_gate",
    requires: [dep("facility.construction_completed", ["SRC_BUILDING_ACT", "SRC_FIRE_CONSTRUCTION_ACT"]), dep("construction.permits_cleared", ["SRC_BUILDING_ACT", "SRC_FIRE_CONSTRUCTION_ACT"])],
    produces: ["building.use_fire_completion_approved"],
    templateRefs: [ref("building-permit-use-approval", ["P09", "P11"]), ref("fire-facility-construction-completion-inspection", ["P06", "P07", "P08", "P09"])],
    evidence: ["SRC_BUILDING_ACT", "SRC_FIRE_CONSTRUCTION_ACT"],
  }),
  newNode({
    id: "N49", name: "시험가동·설비성능·안전·수율 검증", stage: "G7",
    authority: "입주기업·장비사·한전·용수기관·안전기관", leadActor: "developer-enterprise",
    lead: ["입주기업"], consult: ["장비사", "한전", "용수기관", "안전기관"], decision: ["입주기업"],
    classification: "operation",
    confidence: "modeled",
    requires: [dep("facility.operation_approvals_cleared", ["SRC_FACTORY_ACT", "SRC_INTEGRATED_ENV_ACT"], { kind: "legal" }), dep("power.preuse_inspection_energized", ["SRC_ELECTRICAL_SAFETY_ACT"], { kind: "technical" }), dep("water_road.infrastructure_ready", ["SRC_WATER_ACTS"], { kind: "technical" })],
    produces: ["facility.commissioning_completed"],
    templateRefs: [ref("self-use-electrical-equipment", ["P10", "P11", "P13"]), ref("factory-establishment-approval-management", ["P09", "P11"])],
    evidence: ["SRC_ELECTRICAL_SAFETY_ACT", "SRC_FACTORY_ACT", "SRC_WATER_ACTS"],
    note: "시험가동 자체의 상세 품질·수율·고객승인 순서는 입주기업별 비공개 운영계획에 따라 달라 프로젝트 모델로 표시한다.",
  }),
];

project.nodes.push(...newNodes);
const orderedIds = [
  "N01", "N02", "N03",
  "N04", "N31", "N32", "N33", "N34", "N05",
  "N06", "N07", "N36", "N08", "N09", "N38", "N37", "N10",
  "N11", "N12", "N13", "N39", "N40", "N14", "N15", "N35",
  "N41", "N16", "N42", "N17",
  "N18", "N19", "N20", "N21", "N43", "N22", "N44",
  "N23", "N24", "N25",
  "N26", "N27", "N45", "N28", "N46", "N47", "N48", "N29", "N49", "N30",
];
const allNodes = new Map(project.nodes.map((node) => [node.id, node]));
project.nodes = orderedIds.map((id) => allNodes.get(id));
project.summary = "정책상 입지 결정 이후 군공항 이전부지 선정·종전부지 개발, 산단 통합심의, 환경·재해·교통·에너지, 토지·전력·용수, 건축·공장·안전검사와 가동까지 49개 중간 마일스톤을 공식 산출물로 연결한 프로젝트 오버레이";

fs.writeFileSync(PROJECT_PATH, `${JSON.stringify(project, null, 2)}\n`);
fs.writeFileSync(ARTIFACT_PATH, `${JSON.stringify(registry, null, 2)}\n`);

console.log(`expanded ${project.id}: ${project.nodes.length} milestones, ${project.actors.length} actors, ${project.sources.length} sources, ${project.rules.length} rules`);
console.log(`artifact registry: ${registry.artifacts.length}`);
