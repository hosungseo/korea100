import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadOntologyCase, queryCase } from "../src/ontology-bridge.mjs";
import { checkCaseLinkageFor, checkMilestoneLinkage, loadProjectForLinkage } from "../src/case-link.mjs";
import { pendingDecisions, allMilestoneStatuses } from "../src/project-case.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));
const load = (file) => loadOntologyCase({ ontologyDir, caseFile: `samples/${file}` });
const waterCase = () => load("water-road-supply-plan.case.json");
const projectCase = () => load("gwangju-semiconductor-cluster.case.json");

test("마일스톤 케이스는 제도 여섯과 한꺼번에 대조한다", async () => {
  const caseData = await waterCase();
  assert.equal(caseData.case_kind, "milestone");

  const linkage = await checkCaseLinkageFor(caseData);
  assert.equal(linkage.case_kind, "milestone");
  assert.equal(linkage.status, "aligned");
  assert.equal(linkage.milestone_node_id, "N23");
  assert.equal(linkage.institutions.case_count, 6);
  assert.equal(linkage.institutions.overlay_count, 6);
  assert.deepEqual(linkage.institutions.missing_from_case, []);
  assert.deepEqual(linkage.institutions.mapping_mismatches, []);
  assert.deepEqual(linkage.steps.unknown_step_ids, []);
});

test("확정 적용과 적용 후보를 갈라서 보고한다", async () => {
  const linkage = await checkCaseLinkageFor(await waterCase());

  assert.deepEqual(linkage.institutions.exact.sort(), [
    "industrial-water-intake-permit",
    "national-road-rail-soc",
  ]);
  assert.equal(linkage.institutions.candidate.length, 4);
  // 후보를 요건으로 보고하지 않는다는 사실이 응답에 남아야 한다.
  assert.ok(linkage.notes.some((note) => note.includes("확정 요건이 아닙니다")));
});

test("제도가 여럿이라 단계 ID에 제도 슬러그를 붙인다", async () => {
  const caseData = await waterCase();
  const steps = caseData.entities.filter((entity) => entity.id.startsWith("step:"));

  assert.equal(steps.length, 28);
  // 이름을 안 붙이면 P01이 여섯 번 충돌한다.
  const p01 = steps.filter((entity) => entity.attrs.process_id === "P01");
  assert.equal(p01.length, 6);
  assert.equal(new Set(p01.map((entity) => entity.id)).size, 6);
  for (const step of steps) {
    assert.match(step.id, /^step:[a-z0-9-]+:P\d+$/u);
    assert.ok(step.attrs.institution_slug);
  }
});

test("케이스가 오버레이에 없는 제도를 주장하면 어긋남으로 잡는다", async () => {
  const caseData = await waterCase();
  const project = await loadProjectForLinkage("gwangju-semiconductor-cluster");
  const institutions = new Map();

  const drifted = {
    ...caseData,
    entities: [
      ...caseData.entities,
      { id: "institution:nope-not-referenced", type: "Institution", label: "없는 제도", attrs: { slug: "nope-not-referenced", mapping_status: "exact", readiness_level: "R2" } },
    ],
  };
  const result = checkMilestoneLinkage(drifted, project, institutions);
  assert.equal(result.status, "drifted");
  assert.ok(result.institutions.unknown_in_case.includes("nope-not-referenced"));
});

test("적용 여부를 정하는 정보가 무엇인지 답한다", async () => {
  const caseData = await waterCase();
  const result = queryCase(caseData, "제도 여섯 중 어느 걸 밟아야 해?");

  assert.equal(result.packet.packet_id, "ap:decide-supply-routes");
  assert.equal(result.packet.actor, "role:gwangju");
  assert.equal(result.packet.execution_allowed, false);

  // 네 후보 제도는 각각 어떤 정보가 적용 여부를 정하는지 관계로 걸려 있다.
  const decides = caseData.relations.filter((relation) => (
    relation.type === "requires" && relation.from.startsWith("institution:")
  ));
  assert.equal(decides.length, 4);
});

test("조합이 미확정이어도 확정 트랙은 착수할 수 있다", async () => {
  const caseData = await waterCase();
  const result = queryCase(caseData, "용수·도로는 뭐부터 해야 해?");

  assert.equal(result.packet.packet_id, "ap:start-confirmed-tracks");
  assert.equal(result.state.case_state, "routes_undetermined");
  // 확정 트랙 단계는 ready, 후보 단계는 적용 여부 미정으로 갈라져 있다.
  const ready = caseData.states.filter((state) => state.state === "ready");
  const undetermined = caseData.states.filter((state) => state.state === "applicability_undetermined");
  assert.equal(ready.length, 13);
  assert.equal(undetermined.length, 15);
});

test("사업이 정해야 할 갈림길을 모아 준다", async () => {
  const decisions = pendingDecisions(await projectCase());

  assert.equal(decisions.execution_allowed, false);
  const names = decisions.undetermined_parameters.map((entry) => entry.parameter).sort();
  assert.deepEqual(names, [
    "dischargeMethod",
    "gridPath",
    "groundwaterUse",
    "hazardousFacilityPermitsRequired",
    "heritageImpactDiagnosisRequired",
    "powerDemandMw",
    "privateLandCompensationRequired",
    "waterSupplyEntity",
  ]);

  // gridPath만 값이 둘인 배타 분기다.
  assert.equal(decisions.exclusive_branches.length, 1);
  const grid = decisions.exclusive_branches[0];
  assert.equal(grid.parameter, "gridPath");
  assert.deepEqual(grid.options.map((option) => option.value).sort(), ["exempt-or-expedited", "formal-assessment"]);
});

test("용수 경로도 파라미터로 선언돼 사업 층에서 미확정으로 보인다", async () => {
  const project = await projectCase();
  const water = await waterCase();

  // N23의 개폐 판정은 그대로다. 조건부 마일스톤이 아니라 무조건 일어나는 자리라
  // 파라미터를 선언했다고 ready가 흔들리면 오히려 틀린 것이다.
  const status = allMilestoneStatuses(project).find((item) => item.node_id === "N23");
  assert.equal(status.openness, "ready");

  // 달라진 것: 오버레이 note에 산문으로만 있던 미확정 셋이 이제 기계에 잡힌다.
  const decisions = pendingDecisions(project);
  const water3 = decisions.undetermined_parameters.filter(
    (entry) => /water|discharge|groundwater/iu.test(entry.parameter),
  );
  assert.equal(water3.length, 3);
  for (const entry of water3) {
    // 관문을 여닫지는 않는다 — gridPath와 모양이 다르다는 사실이 데이터에 남아야 한다.
    assert.deepEqual(entry.gates, []);
    assert.deepEqual(entry.affects, { milestone: "N23", scope: "institution_applicability" });
    assert.ok(entry.reason, "왜 미확정인지가 있어야 한다");
  }

  // 배타 분기는 여전히 gridPath 하나뿐이다. 용수 셋이 분기로 새어 들어가면 안 된다.
  assert.equal(decisions.exclusive_branches.length, 1);

  // 케이스 층이 비대칭 해소를 기록으로 남겼다.
  const rule = water.rules.find((item) => item.id === "rule:water-route-is-not-parameterised");
  assert.ok(rule);
  assert.deepEqual(rule.output.adopted_parameters, ["waterSupplyEntity", "dischargeMethod", "groundwaterUse"]);
  assert.equal(rule.output.resolved_on, "2026-09-01");
});

// 미확정이라고 다 결정거리가 아니다. 북극항로·대구경북의 파라미터 넷은 의존
// 그래프가 이미 hard로 표현하고 있던 것을 규칙으로 한 번 더 적어 둔 것이었다.
// 활성화 규칙으로 관문에 붙였다면 blocked와 path_undetermined가 이중계상됐다.
test("그래프가 이미 말하는 미확정은 결정으로 세지 않는다", async () => {
  const load = async (id) => (await import("../src/ontology-bridge.mjs"))
    .loadOntologyCase({ ontologyDir: fileURLToPath(new URL("../../ontology/", import.meta.url)), caseFile: `samples/${id}.case.json` });

  const arctic = pendingDecisions(await load("arctic-route"));
  assert.equal(arctic.decision_count, 0, "북극항로가 지금 골라야 할 것은 없다");
  assert.equal(arctic.graph_redundant_parameters.length, 2);
  for (const entry of arctic.graph_redundant_parameters) {
    assert.equal(entry.classification, "graph_redundant");
    // 어느 관문이 끝나면 풀리는지를 말해 줘야 "그럼 뭘 보라는 거냐"에 답이 된다.
    assert.ok(entry.equivalent_to.produced_by, "생산 관문이 있어야 한다");
    assert.ok(entry.equivalent_to.artifact);
  }

  const daegu = pendingDecisions(await load("daegu-gyeongbuk-airport"));
  assert.equal(daegu.decision_count, 0);
  assert.deepEqual(
    daegu.graph_redundant_parameters.map((entry) => entry.equivalent_to.produced_by).sort(),
    ["N06", "N15"],
  );
});

test("성격이 다른 미확정을 섞지 않는다", async () => {
  const decisions = pendingDecisions(await projectCase());
  const byKind = decisions.undetermined_parameters.reduce(
    (acc, entry) => ({ ...acc, [entry.classification]: (acc[entry.classification] ?? 0) + 1 }), {},
  );

  // 광주: 관문 4(gridPath 등) · 안쪽 3(용수) · 값 미상 1(powerDemandMw).
  assert.deepEqual(byKind, { gate: 4, inside_gate: 3, information_gap: 1 });
  assert.equal(decisions.decision_count, 8);
  assert.equal(decisions.graph_redundant_parameters.length, 0);

  // powerDemandMw는 규칙도 아티팩트도 없는 순수 정보 공백이다. 배선 과제가 아니다.
  const gap = decisions.undetermined_parameters.find((e) => e.classification === "information_gap");
  assert.equal(gap.parameter, "powerDemandMw");
  assert.equal(gap.equivalent_to, null);
});
