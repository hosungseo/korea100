#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_PATH = path.join(path.dirname(SCRIPT_DIR), "data", "mega-projects", "projects", "gwangju-semiconductor-cluster.json");
const project = JSON.parse(fs.readFileSync(PROJECT_PATH, "utf8"));

const sources = [
  { id: "SRC_MILITARY_NOISE_ACT", type: "statute", title: "군용비행장ㆍ군사격장 소음 방지 및 피해 보상에 관한 법률", publishedOn: "2025-10-01", effectiveOn: "2025-10-01", url: "https://law.go.kr/법령/군용비행장군사격장소음방지및피해보상에관한법률" },
  { id: "SRC_UNDERGROUND_SAFETY_ACT", type: "statute", title: "지하안전관리에 관한 특별법", publishedOn: "2025-05-27", effectiveOn: "2025-05-27", url: "https://law.go.kr/법령/지하안전관리에관한특별법" },
  { id: "SRC_CONSTRUCTION_TECH_ACT", type: "statute", title: "건설기술 진흥법", publishedOn: "2025-10-01", effectiveOn: "2025-10-01", url: "https://law.go.kr/법령/건설기술진흥법" },
  { id: "SRC_CHEMICAL_REGISTRATION_ACT", type: "statute", title: "화학물질의 등록 및 평가 등에 관한 법률", publishedOn: "2025-11-11", effectiveOn: "2026-05-12", url: "https://law.go.kr/법령/화학물질의등록및평가등에관한법률" },
  { id: "SRC_GROUNDWATER_ACT", type: "statute", title: "지하수법", publishedOn: "2025-10-01", effectiveOn: "2025-10-01", url: "https://law.go.kr/법령/지하수법" },
  { id: "SRC_SEWERAGE_ACT", type: "statute", title: "하수도법", publishedOn: "2025-10-01", effectiveOn: "2025-10-01", url: "https://law.go.kr/법령/하수도법" },
  { id: "SRC_AIR_REGION_ACT", type: "statute", title: "대기관리권역의 대기환경개선에 관한 특별법", publishedOn: "2025-10-01", effectiveOn: "2025-10-01", url: "https://law.go.kr/법령/대기관리권역의대기환경개선에관한특별법" },
  { id: "SRC_NUCLEAR_SAFETY_ACT", type: "statute", title: "원자력안전법", publishedOn: "2026-05-19", effectiveOn: "2026-05-19", url: "https://law.go.kr/법령/원자력안전법" },
  { id: "SRC_DEVELOPMENT_GAINS_ACT", type: "statute", title: "개발이익 환수에 관한 법률", publishedOn: "2026-06-02", effectiveOn: "2026-06-02", url: "https://law.go.kr/법령/개발이익환수에관한법률" },
  { id: "SRC_ROAD_ACT", type: "statute", title: "도로법", publishedOn: "2025-12-02", effectiveOn: "2026-06-03", url: "https://law.go.kr/법령/도로법" },
];

for (const source of sources) {
  if (!project.sources.some((item) => item.id === source.id)) project.sources.push(source);
}

const industrialClusterSource = project.sources.find((item) => item.id === "SRC_FACTORY_ACT");
if (industrialClusterSource) {
  industrialClusterSource.publishedOn = "2026-06-02";
  industrialClusterSource.effectiveOn = "2026-06-02";
}

function ids(from, to) {
  return Array.from({ length: to - from + 1 }, (_, index) => "P" + String(from + index).padStart(2, "0"));
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

addRef("N31", "military-airfield-noise-measures-compensation", ids(1, 5), ["SRC_MILITARY_NOISE_ACT"]);
addRef("N32", "military-airfield-noise-measures-compensation", ids(6, 8), ["SRC_MILITARY_NOISE_ACT"]);
appendNote("N31", "대체 군공항의 소음영향도·대책지역·기본계획은 입지와 운항계획 확정 후 별도 적용판정");

addRef("N27", "underground-safety-impact-assessment", ids(1, 5), ["SRC_UNDERGROUND_SAFETY_ACT"]);
addRef("N28", "underground-safety-impact-assessment", ids(6, 9), ["SRC_UNDERGROUND_SAFETY_ACT"]);
addRef("N27", "construction-safety-quality-management-plan", ids(1, 5), ["SRC_CONSTRUCTION_TECH_ACT"]);
addRef("N28", "construction-safety-quality-management-plan", ids(6, 9), ["SRC_CONSTRUCTION_TECH_ACT"]);
appendNote("N27", "굴착깊이·공사규모·구조형식 문턱을 확인해 지하안전평가와 안전·품질관리계획을 착공 전 확정");

addRef("N45", "business-waste-generator-management", ids(1, 4), ["SRC_WASTE_ACT"]);
addRef("N29", "business-waste-generator-management", ids(5, 8), ["SRC_WASTE_ACT"]);
addRef("N45", "chemical-registration-hazard-risk-assessment", ids(1, 6), ["SRC_CHEMICAL_REGISTRATION_ACT"]);
addRef("N29", "chemical-registration-hazard-risk-assessment", ids(7, 9), ["SRC_CHEMICAL_REGISTRATION_ACT"]);
addRef("N45", "air-region-total-emissions-permit", ids(1, 5), ["SRC_AIR_REGION_ACT"]);
addRef("N29", "air-region-total-emissions-permit", ids(6, 9), ["SRC_AIR_REGION_ACT"]);
addRef("N45", "radiation-generator-use-permit", ids(1, 4), ["SRC_NUCLEAR_SAFETY_ACT"]);
addRef("N46", "radiation-generator-use-permit", ids(5, 7), ["SRC_NUCLEAR_SAFETY_ACT"]);
addRef("N29", "radiation-generator-use-permit", ["P08"], ["SRC_NUCLEAR_SAFETY_ACT"]);
node("N45").name = "통합환경·총량·폐기물·화학등록·방사선·공정안전 사전심사";
node("N29").name = "환경·총량·폐기물·화학·방사선·사용승인·공장등록 운영확인";
appendNote("N45", "배출량·제조수입량·장치종류·물질·공정 문턱이 미확정인 신규 제도는 후보 경로로 병렬 표시");

addRef("N23", "groundwater-development-use-permit", ids(1, 2), ["SRC_GROUNDWATER_ACT"]);
addRef("N24", "groundwater-development-use-permit", ids(3, 4), ["SRC_GROUNDWATER_ACT"]);
addRef("N25", "groundwater-development-use-permit", ids(5, 8), ["SRC_GROUNDWATER_ACT"]);
addRef("N24", "sewer-connection-originator-charge", ["P01", "P02", "P03", "P06", "P07"], ["SRC_SEWERAGE_ACT"]);
addRef("N25", "sewer-connection-originator-charge", ["P04", "P05", "P08"], ["SRC_SEWERAGE_ACT"]);
addRef("N24", "road-connection-permit", ids(1, 5), ["SRC_ROAD_ACT"]);
addRef("N25", "road-connection-permit", ids(6, 8), ["SRC_ROAD_ACT"]);
node("N24").name = "용수·지하수·폐수·하수도·접근도로 승인·비용분담";
node("N25").name = "용수·폐수·하수도·연결도로 공사·준공·공급개시";
appendNote("N24", "지하수 취수, 배수설비 연결·원인자부담금, 도로 연결허가는 확정 설계와 시설용량에 따라 적용판정");

addRef("N15", "development-charge-assessment", ids(1, 3), ["SRC_DEVELOPMENT_GAINS_ACT"]);
addRef("N35", "development-charge-assessment", ids(1, 3), ["SRC_DEVELOPMENT_GAINS_ACT"]);
addRef("N28", "development-charge-assessment", ids(4, 9), ["SRC_DEVELOPMENT_GAINS_ACT"]);
appendNote("N15", "산단 개발부담금 대상·면제·감면 여부와 착수시점·개발비용 증빙을 선제 관리");
appendNote("N35", "종전부지 개발부담금은 별도 사업유형·면적·시행자 기준으로 재판정");

addRef("N26", "industrial-complex-management-occupancy", ids(1, 6), ["SRC_FACTORY_ACT"], null);
addRef("N47", "industrial-complex-management-occupancy", ids(7, 8), ["SRC_FACTORY_ACT"], null);
node("N26").name = "산단 관리기본계획·입주계약·공장설립 승인";

project.asOfDate = "2026-08-17";
project.summary = "정책상 입지 결정 이후 군공항 이전·종전부지 개발, 반도체클러스터 지정, 재정·예타, 산단 통합심의, 토지·환경·안전, 전력·용수·폐수·하수도·도로, 건축·공장·가동까지 49개 중간 마일스톤 아래 66개 법정 제도와 하위절차를 연결한 프로젝트 오버레이";

fs.writeFileSync(PROJECT_PATH, JSON.stringify(project, null, 2) + "\n");

const refs = project.nodes.flatMap((item) => item.templateRefs ?? []);
const unique = new Set(refs.map((item) => item.institution));
const mappedNodes = refs.reduce((total, ref) => total + (ref.nodeIds?.length ?? 0), 0);
console.log(JSON.stringify({ milestones: project.nodes.length, sources: project.sources.length, templateRefs: refs.length, uniqueInstitutions: unique.size, mappedSubprocessNodes: mappedNodes }, null, 2));
