import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadOntologyCase, queryCase } from "../src/ontology-bridge.mjs";
import { checkCaseLinkageFor, checkProjectContext, loadProjectForLinkage } from "../src/case-link.mjs";
import { allMilestoneStatuses, institutionReadinessFor } from "../src/project-case.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));
const caseFile = "samples/semiconductor-cluster-designation.case.json";

async function designationCase() {
  return loadOntologyCase({ ontologyDir, caseFile });
}

async function projectCase() {
  return loadOntologyCase({ ontologyDir, caseFile: "samples/gwangju-semiconductor-cluster.case.json" });
}

test("4호는 지정 제도와 1:1이고 R2라 다음 행동 계산이 허용된다", async () => {
  const caseData = await designationCase();
  const linkage = await checkCaseLinkageFor(caseData);

  assert.equal(linkage.institution_slug, "semiconductor-cluster-designation-coordination");
  assert.equal(linkage.status, "aligned");
  assert.equal(linkage.readiness.level, "R2");
  assert.equal(linkage.next_action_allowed, true);
  assert.deepEqual(linkage.steps.unknown_step_ids, []);
  assert.deepEqual(linkage.steps.label_mismatches, []);
  assert.deepEqual(linkage.sequence.unknown_edges, []);
});

test("제도 케이스가 채운다고 주장한 마일스톤을 오버레이와 대조한다", async () => {
  const caseData = await designationCase();
  const linkage = await checkCaseLinkageFor(caseData);

  assert.equal(linkage.project_context.status, "aligned");
  assert.equal(linkage.project_context.claimed.milestone_node_id, "N03");
  assert.equal(linkage.project_context.milestone_name, "반도체클러스터 지정 신청·심의·지정");
  // 주장의 핵심: 그 마일스톤이 실제로 이 제도를 끌어 쓰고 있는가.
  assert.ok(
    linkage.project_context.referenced_institutions.includes("semiconductor-cluster-designation-coordination"),
  );
});

test("마일스톤이 그 제도를 참조하지 않으면 어긋남으로 잡는다", async () => {
  const caseData = await designationCase();
  const project = await loadProjectForLinkage("gwangju-semiconductor-cluster");

  // N23은 용수·도로 마일스톤이라 지정 제도를 참조하지 않는다.
  const wrong = { ...caseData, project_context: { ...caseData.project_context, milestone_node_id: "N23" } };
  const result = checkProjectContext(wrong, project);
  assert.equal(result.status, "drifted");
  assert.ok(result.notes.some((note) => note.includes("참조하지 않습니다")));

  // 오버레이에 없는 마일스톤을 주장해도 잡는다.
  const missing = { ...caseData, project_context: { ...caseData.project_context, milestone_node_id: "N99" } };
  assert.equal(checkProjectContext(missing, project).status, "milestone_not_found");
});

test("마일스톤 이름이 갈라지면 어긋남으로 잡는다", async () => {
  const caseData = await designationCase();
  const project = await loadProjectForLinkage("gwangju-semiconductor-cluster");
  const renamed = {
    ...caseData,
    project_context: { ...caseData.project_context, milestone_label: "이름이 바뀐 마일스톤" },
  };

  const result = checkProjectContext(renamed, project);
  assert.equal(result.status, "drifted");
  assert.ok(result.notes.some((note) => note.includes("이름이 갈라졌습니다")));
});

test("신청 주체와 승인 주체에 서로 다른 패킷을 준다", async () => {
  const caseData = await designationCase();

  const applicant = queryCase(caseData, "반도체클러스터 지정 신청하려면 뭐부터 해야 해?");
  assert.equal(applicant.packet.packet_id, "ap:prepare-designation-application");
  assert.equal(applicant.packet.actor, "role:gwangju");

  const ministry = queryCase(caseData, "지정 신청이 들어오면 뭘 검토하지?");
  assert.equal(ministry.packet.packet_id, "ap:ministry-designation-review");
  assert.equal(ministry.packet.actor, "role:motie");

  for (const result of [applicant, ministry]) {
    assert.equal(result.packet.execution_allowed, false);
    assert.equal(result.packet.ontology_packet.auto_execute, false);
  }
});

test("사업 층과 제도 층이 같은 매듭을 가리킨다", async () => {
  const project = await projectCase();
  const designation = await designationCase();

  // 사업 층: N03은 선행 아티팩트가 풀려 착수 가능하다.
  const milestone = allMilestoneStatuses(project).find((status) => status.node_id === "N03");
  assert.equal(milestone.openness, "ready");
  assert.equal(institutionReadinessFor(project, "N03").next_action_computable, true);

  // 제도 층: 그런데 안으로 들어가면 P01에서 사업구역 경계가 막고 있다.
  const state = designation.states.find((item) => item.entity_id === "item:project-boundary");
  assert.equal(state.state, "undetermined");
  const packet = queryCase(designation, "반도체클러스터 지정 신청하려면 뭐부터 해야 해?");
  assert.ok(packet.packet.checklist[0].instruction.includes("사업구역 경계"));

  // 3호가 짚은 미확정 파라미터 넷도 같은 경계 확정을 선행 조건으로 삼는다.
  const paths = queryCase(project, "아직 못 정한 갈림길이 뭐야?");
  assert.equal(paths.packet.packet_id, "ap:resolve-undetermined-paths");
  assert.ok(paths.packet.checklist[0].instruction.includes("사업구역 경계"));
});
