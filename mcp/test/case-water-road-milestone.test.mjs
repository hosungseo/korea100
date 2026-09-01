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
    "gridPath",
    "hazardousFacilityPermitsRequired",
    "heritageImpactDiagnosisRequired",
    "powerDemandMw",
    "privateLandCompensationRequired",
  ]);

  // gridPath만 값이 둘인 배타 분기다.
  assert.equal(decisions.exclusive_branches.length, 1);
  const grid = decisions.exclusive_branches[0];
  assert.equal(grid.parameter, "gridPath");
  assert.deepEqual(grid.options.map((option) => option.value).sort(), ["exempt-or-expedited", "formal-assessment"]);
});

test("용수 경로는 파라미터가 아니라서 사업 층에서 미확정으로 안 보인다", async () => {
  const project = await projectCase();
  const water = await waterCase();

  // 사업 층: N23은 착수 가능으로 보인다.
  const status = allMilestoneStatuses(project).find((item) => item.node_id === "N23");
  assert.equal(status.openness, "ready");

  // 그런데 미확정 파라미터 목록에 용수 관련 항목이 없다.
  const decisions = pendingDecisions(project);
  const names = decisions.undetermined_parameters.map((entry) => entry.parameter);
  assert.ok(!names.some((name) => /water|discharge|groundwater/iu.test(name)));

  // 케이스 층이 그 비대칭을 규칙으로 남겼다.
  const rule = water.rules.find((item) => item.id === "rule:water-route-is-not-parameterised");
  assert.ok(rule);
  assert.deepEqual(rule.output.suggested_parameters, ["waterSupplyEntity", "dischargeMethod", "groundwaterUse"]);
});
