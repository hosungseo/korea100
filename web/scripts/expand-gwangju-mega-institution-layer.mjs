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

const project = JSON.parse(fs.readFileSync(PROJECT_PATH, "utf8"));
if (project.nodes?.length !== 49) {
  throw new Error("expected the audited 49-milestone project before expanding institution mappings");
}

const range = (start, end) =>
  Array.from({ length: end - start + 1 }, (_, index) => "P" + String(start + index).padStart(2, "0"));

const candidate = (institution, nodeIds) => ({
  institution,
  ...(nodeIds ? { nodeIds } : {}),
  mappingStatus: "candidate",
});

const exact = (institution, nodeIds) => ({ institution, nodeIds });

const newSources = [
  {
    id: "SRC_DEFENSE_FACILITY_ACT",
    type: "statute",
    title: "국방·군사시설 사업에 관한 법률",
    publishedOn: "2025-03-18",
    effectiveOn: "2025-09-19",
    url: "https://law.go.kr/법령/국방군사시설사업에관한법률",
  },
  {
    id: "SRC_MILITARY_PROTECTION_ACT",
    type: "statute",
    title: "군사기지 및 군사시설 보호법",
    publishedOn: "2024-01-16",
    effectiveOn: "2024-07-17",
    url: "https://law.go.kr/법령/군사기지및군사시설보호법",
  },
  {
    id: "SRC_NATIONAL_PROPERTY_ACT",
    type: "statute",
    title: "국유재산법",
    publishedOn: "2026-02-19",
    effectiveOn: "2026-02-19",
    url: "https://law.go.kr/법령/국유재산법",
  },
  {
    id: "SRC_WATERWORKS_ACT",
    type: "statute",
    title: "수도법",
    publishedOn: "2025-10-01",
    effectiveOn: "2025-10-01",
    url: "https://law.go.kr/법령/수도법",
  },
  {
    id: "SRC_WATER_ENV_ACT",
    type: "statute",
    title: "물환경보전법",
    publishedOn: "2026-02-19",
    effectiveOn: "2026-02-19",
    url: "https://law.go.kr/법령/물환경보전법",
  },
  {
    id: "SRC_NATIONAL_FINANCE_ACT",
    type: "statute",
    title: "국가재정법",
    publishedOn: "2026-06-02",
    effectiveOn: "2026-06-02",
    url: "https://law.go.kr/법령/국가재정법",
  },
  {
    id: "SRC_LOCAL_FINANCE_ACT",
    type: "statute",
    title: "지방재정법",
    publishedOn: "2026-02-05",
    effectiveOn: "2026-07-01",
    url: "https://law.go.kr/법령/지방재정법",
  },
  {
    id: "SRC_URBAN_PLAN_ACT",
    type: "statute",
    title: "국토의 계획 및 이용에 관한 법률",
    publishedOn: "2026-03-05",
    effectiveOn: "2026-07-01",
    url: "https://law.go.kr/법령/국토의계획및이용에관한법률",
  },
  {
    id: "SRC_FARMLAND_ACT",
    type: "statute",
    title: "농지법",
    publishedOn: "2026-06-16",
    effectiveOn: "2026-06-16",
    url: "https://law.go.kr/법령/농지법",
  },
  {
    id: "SRC_FOREST_ACT",
    type: "statute",
    title: "산지관리법",
    publishedOn: "2026-02-27",
    effectiveOn: "2026-05-28",
    url: "https://law.go.kr/법령/산지관리법",
  },
  {
    id: "SRC_PUBLIC_WATERS_ACT",
    type: "statute",
    title: "공유수면 관리 및 매립에 관한 법률",
    publishedOn: "2024-02-06",
    effectiveOn: "2025-08-07",
    url: "https://law.go.kr/법령/공유수면관리및매립에관한법률",
  },
  {
    id: "SRC_AIR_ACT",
    type: "statute",
    title: "대기환경보전법",
    publishedOn: "2026-07-07",
    effectiveOn: "2026-07-07",
    url: "https://law.go.kr/법령/대기환경보전법",
  },
  {
    id: "SRC_WASTE_ACT",
    type: "statute",
    title: "폐기물관리법",
    publishedOn: "2025-10-01",
    effectiveOn: "2026-03-26",
    url: "https://law.go.kr/법령/폐기물관리법",
  },
  {
    id: "SRC_NOISE_ACT",
    type: "statute",
    title: "소음·진동관리법",
    publishedOn: "2025-10-01",
    effectiveOn: "2025-10-01",
    url: "https://law.go.kr/법령/소음진동관리법",
  },
  {
    id: "SRC_EMISSIONS_TRADING_ACT",
    type: "statute",
    title: "온실가스 배출권의 할당 및 거래에 관한 법률",
    publishedOn: "2025-10-28",
    effectiveOn: "2026-04-29",
    url: "https://law.go.kr/법령/온실가스배출권의할당및거래에관한법률",
  },
];

for (const source of newSources) {
  const index = project.sources.findIndex((item) => item.id === source.id);
  if (index >= 0) project.sources[index] = source;
  else project.sources.push(source);
}

const nodeById = new Map(project.nodes.map((node) => [node.id, node]));

function updateNode(id, { name, refs = [], evidence = [], note }) {
  const node = nodeById.get(id);
  if (!node) throw new Error("missing project node " + id);
  if (name) node.name = name;
  node.templateRefs ??= [];
  for (const ref of refs) {
    const index = node.templateRefs.findIndex((item) => item.institution === ref.institution);
    if (index >= 0) node.templateRefs[index] = ref;
    else node.templateRefs.push(ref);
  }
  node.evidence = Array.from(new Set([...(node.evidence ?? []), ...evidence]));
  if (note && !String(node.note ?? "").includes(note)) {
    node.note = node.note ? node.note + " · " + note : note;
  }
}

updateNode("N02", {
  name: "통합 추진체계·재정심사·예타·마스터 일정 수립",
  refs: [
    candidate("preliminary-feasibility-study", ["P16", ...range(1, 14)]),
    candidate("pfs-exemption-fast-track", range(1, 11)),
    candidate("local-finance-investment-review-feasibility", range(1, 13)),
  ],
  evidence: ["SRC_NATIONAL_FINANCE_ACT", "SRC_LOCAL_FINANCE_ACT", "SRC_SEMICON_ACT"],
  note: "국가·지방·공공기관별 재원주체와 총사업비가 미확정이므로 예타·면제·지방재정투자심사는 후보 경로로 표시",
});

updateNode("N03", {
  refs: [exact("semiconductor-cluster-designation-coordination", range(1, 7))],
  evidence: ["SRC_SEMICON_ACT"],
  note: "반도체특별법 제11조 조성계획 승인과 클러스터·사업시행자 지정 산출물을 상세 연결",
});

updateNode("N05", {
  name: "대체 군공항 사업계획·실시계획·건설·준공·기능이전",
  refs: [exact("defense-facility-project-plan-completion", range(1, 9))],
  evidence: ["SRC_DEFENSE_FACILITY_ACT"],
  note: "군공항이전특별법의 이전사업과 국방·군사시설법의 사업계획·실시계획·준공 경로를 함께 관리",
});

updateNode("N14", {
  name: "의제 인허가 실체요건·농지·산지·공유수면 자료 취합",
  refs: [
    candidate("farmland-use-permission-conversion", range(1, 8)),
    candidate("forestland-conversion", range(1, 10)),
    candidate("public-waters-occupation", range(1, 10)),
  ],
  evidence: ["SRC_FARMLAND_ACT", "SRC_FOREST_ACT", "SRC_PUBLIC_WATERS_ACT"],
  note: "공식 사업구역 경계가 없어 농지·산지·공유수면 편입 여부는 후보 절차로 표시",
});

updateNode("N17", {
  name: "보호구역 해제·종전부지 및 편입토지 사용권 확보",
  refs: [candidate("military-facility-protection-zone-release", range(1, 7))],
  evidence: ["SRC_MILITARY_PROTECTION_ACT"],
  note: "군공항 기능이전 시점과 보호구역 변경·해제 범위가 미확정이므로 후보 절차로 표시",
});

updateNode("N20", {
  name: "계통영향평가 면제·예타특례·반도체 신속처리",
  refs: [
    exact("semiconductor-infrastructure-support-fast-track", range(7, 10)),
    candidate("pfs-exemption-fast-track", ["P09", "P10", "P11"]),
  ],
  evidence: ["SRC_SEMICON_ACT", "SRC_NATIONAL_FINANCE_ACT"],
  note: "반도체특별법상 예타·인허가 특례와 일반 신속처리 템플릿을 구분해 표시",
});

updateNode("N21", {
  name: "송전선로·변전소 사업계획·실시계획 승인",
  refs: [candidate("power-transmission-permit", range(1, 16))],
  evidence: ["SRC_NATIONAL_GRID_ACT", "SRC_ELECTRICITY_ACT"],
  note: "전원개발촉진법상 실시계획 경로 적용 여부는 최종 송변전 사업구조 확인 전까지 후보로 표시",
});

updateNode("N22", {
  refs: [candidate("power-transmission-permit", range(17, 22))],
  evidence: ["SRC_NATIONAL_GRID_ACT", "SRC_ELECTRICITY_ACT"],
  note: "토지사용·손실보상·사용전검사·가압 경로를 송변전 사업 후보절차로 연결",
});

updateNode("N23", {
  name: "공업용수·공공폐수·접근도로 수요·공급계획 확정",
  refs: [
    candidate("semiconductor-infrastructure-support-fast-track", range(1, 6)),
    candidate("industrial-waterworks-business-authorization", range(1, 3)),
    candidate("public-wastewater-treatment-facility-plan", range(1, 4)),
  ],
  evidence: ["SRC_SEMICON_ACT", "SRC_WATERWORKS_ACT", "SRC_WATER_ENV_ACT"],
  note: "용수 공급주체·처리구역·폐수처리 방식이 미확정이므로 기반시설별 후보 절차로 표시",
});

updateNode("N24", {
  name: "용수·폐수 비용분담·사업인가·관로 및 접근도로 승인",
  refs: [
    candidate("industrial-waterworks-business-authorization", range(4, 7)),
    candidate("public-wastewater-treatment-facility-plan", range(5, 7)),
  ],
  evidence: ["SRC_WATERWORKS_ACT", "SRC_WATER_ENV_ACT"],
  note: "공업용수도 사업인가와 공공폐수처리시설 비용부담·설계 경로를 후보로 연결",
});

updateNode("N25", {
  name: "용수·폐수 관로·처리시설·접근도로 공사·준공",
  refs: [
    candidate("industrial-waterworks-business-authorization", range(8, 9)),
    candidate("public-wastewater-treatment-facility-plan", range(8, 10)),
  ],
  evidence: ["SRC_WATERWORKS_ACT", "SRC_WATER_ENV_ACT"],
  note: "통수·폐수처리시설 운영개시가 팹 시운전의 선행조건이 되도록 연결",
});

updateNode("N34", {
  name: "종전부지 개발사업시행자·개발계획·도시계획 입안",
  refs: [candidate("urban-management-plan-determination", range(1, 3))],
  evidence: ["SRC_URBAN_PLAN_ACT"],
  note: "종전부지 개발계획과 별도 도시관리계획 입안 필요 여부는 확정 토지이용계획에서 판정",
});

updateNode("N35", {
  name: "종전부지 실시계획·도시계획 결정·인허가 의제",
  refs: [candidate("urban-management-plan-determination", range(4, 8))],
  evidence: ["SRC_URBAN_PLAN_ACT"],
  note: "도시관리계획 검토·심의·결정고시 경로를 후보로 연결",
});

updateNode("N42", {
  refs: [exact("national-property-disuse-contribution-concession", range(1, 8))],
  evidence: ["SRC_NATIONAL_PROPERTY_ACT", "SRC_DEFENSE_FACILITY_ACT"],
  note: "행정재산 용도폐지부터 기부재산 검수·가액평가·양여계약·소유권 이전까지 상세 연결",
});

updateNode("N45", {
  name: "통합환경·대기·수질·폐기물·화학·소음·공정안전 사전심사",
  refs: [
    candidate("air-emission-facility-permit", range(1, 8)),
    candidate("water-pollution-discharge-permit", range(1, 8)),
    candidate("waste-disposal-business-permit", range(1, 8)),
    candidate("chemical-safety-permit", range(1, 10)),
    candidate("noise-vibration-permit", range(1, 7)),
  ],
  evidence: ["SRC_AIR_ACT", "SRC_WATER_ENV_ACT", "SRC_WASTE_ACT", "SRC_CHEMICAL_ACT", "SRC_NOISE_ACT"],
  note: "통합환경허가 포함 여부와 배출·폐기물·화학물질·소음 시설별 법정 문턱이 미확정이므로 개별 허가를 후보 경로로 병렬 표시",
});

updateNode("N29", {
  name: "환경매체·화학·소음·배출권·사용승인·공장등록 운영확인",
  refs: [
    candidate("integrated-environmental-permit-change", range(9, 12)),
    candidate("air-emission-facility-permit", range(9, 12)),
    candidate("water-pollution-discharge-permit", range(9, 12)),
    candidate("waste-disposal-business-permit", range(9, 12)),
    candidate("chemical-safety-permit", range(8, 17)),
    candidate("noise-vibration-permit", range(8, 17)),
    candidate("emissions-trading", range(3, 21)),
  ],
  evidence: ["SRC_INTEGRATED_ENV_ACT", "SRC_AIR_ACT", "SRC_WATER_ENV_ACT", "SRC_WASTE_ACT", "SRC_CHEMICAL_ACT", "SRC_NOISE_ACT", "SRC_EMISSIONS_TRADING_ACT"],
  note: "가동 후 자가측정·변경허가·정기검사·배출권 의무는 생산능력·배출량·물질취급량 확정 전까지 후보 경로로 표시",
});

project.summary = "정책상 입지 결정 이후 군공항 이전·종전부지 개발, 반도체클러스터 지정, 재정·예타, 산단 통합심의, 토지·환경·안전, 전력·용수·폐수·도로, 건축·공장·가동까지 49개 중간 마일스톤 아래 법정 제도와 하위절차를 연결한 프로젝트 오버레이";

fs.writeFileSync(PROJECT_PATH, JSON.stringify(project, null, 2) + "\n");
console.log("expanded institution mappings for " + project.id + "; nodes=" + project.nodes.length + "; sources=" + project.sources.length);
