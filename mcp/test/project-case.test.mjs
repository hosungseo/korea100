import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadOntologyCase, queryCase } from "../src/ontology-bridge.mjs";
import { checkCaseLinkageFor, checkProjectLinkage } from "../src/case-link.mjs";
import {
  allMilestoneStatuses,
  explainBlocked,
  institutionReadinessFor,
  isProjectCase,
  projectStatus,
  ProjectCaseError,
} from "../src/project-case.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));
const caseFile = "samples/gwangju-semiconductor-cluster.case.json";

async function projectCase() {
  return loadOntologyCase({ ontologyDir, caseFile });
}

test("3호는 프로젝트 케이스이고 오버레이와 어긋남 없이 맞물린다", async () => {
  const caseData = await projectCase();
  assert.equal(isProjectCase(caseData), true);

  const linkage = await checkCaseLinkageFor(caseData);
  assert.equal(linkage.case_kind, "project");
  assert.equal(linkage.status, "aligned");
  assert.equal(linkage.milestones.case_milestone_count, linkage.milestones.overlay_node_count);
  assert.deepEqual(linkage.milestones.unknown_milestone_ids, []);
  assert.deepEqual(linkage.milestones.label_mismatches, []);
  assert.equal(linkage.dependencies.case_requires_count, linkage.dependencies.overlay_requires_count);
  assert.deepEqual(linkage.dependencies.unknown_requires, []);
});

test("참조 제도 일부만 R2라 사업 전체의 다음 행동은 허용하지 않는다", async () => {
  const caseData = await projectCase();
  const linkage = await checkCaseLinkageFor(caseData);

  assert.equal(linkage.institutions.referenced_count, 108);
  assert.ok(linkage.institutions.r2_count > 0, "임계경로 제도가 R2로 올라와 있어야 한다");
  assert.ok(linkage.institutions.r2_count < linkage.institutions.referenced_count);
  // 사업은 가장 준비 안 된 제도만큼만 계산된다. 하나라도 미평가면 전체는 허용하지 않는다.
  assert.equal(linkage.next_action_allowed, false);
});

test("참조 제도가 전부 R2인 마일스톤만 다음 행동 계산 대상이 된다", async () => {
  const caseData = await projectCase();
  const rollup = projectStatus(caseData).readiness;

  // N03 지정 게이트와 N19·N20 전력계통 두 경로.
  assert.deepEqual(rollup.next_action_computable_milestones, ["N03", "N19", "N20"]);
  assert.equal(institutionReadinessFor(caseData, "N03").next_action_computable, true);

  // N02는 참조 제도 4개 중 3개가 R2다. 남은 하나가 예비타당성조사이고,
  // 그것이 R2에 못 가는 이유는 지자체 건의 노드가 법정 절차가 아니기 때문이다.
  const n02 = institutionReadinessFor(caseData, "N02");
  assert.equal(n02.next_action_computable, false);
  assert.deepEqual(n02.not_ready_slugs, ["preliminary-feasibility-study"]);
});

test("제도 준비도와 사업 파라미터는 별개 축이다", async () => {
  const caseData = await projectCase();
  const statuses = Object.fromEntries(
    allMilestoneStatuses(caseData).map((status) => [status.node_id, status]),
  );

  // 전력계통 두 경로는 참조 제도가 전부 R2라 '제도는 답할 준비가 됐다'.
  for (const nodeId of ["N19", "N20"]) {
    assert.equal(institutionReadinessFor(caseData, nodeId).next_action_computable, true);
    // 그런데 gridPath 파라미터가 미확정이라 어느 경로인지는 사업이 아직 안 정했다.
    assert.equal(statuses[nodeId].openness, "path_undetermined");
  }

  // 두 축이 같이 열린 것은 N03 하나뿐이다.
  assert.equal(statuses.N03.openness, "ready");
  assert.equal(institutionReadinessFor(caseData, "N03").next_action_computable, true);
});

test("케이스에 박아 둔 준비도가 제도 파일과 갈라지면 어긋남으로 잡는다", async () => {
  const caseData = await projectCase();
  const project = JSON.parse(JSON.stringify({
    name: caseData.project_name,
    nodes: (caseData.entities ?? [])
      .filter((entity) => entity.id.startsWith("milestone:"))
      .map((entity) => ({ id: entity.attrs.node_id, name: entity.label, requires: [] })),
  }));
  // 오버레이 requires를 비웠으므로 케이스가 주장하는 의존이 전부 미확인이 된다.
  const linkage = checkProjectLinkage(caseData, project, new Map([["land-compensation", "R2"]]));

  assert.equal(linkage.status, "drifted");
  assert.ok(linkage.dependencies.unknown_requires.length > 0);
  assert.equal(linkage.institutions.stale_readiness.length, 1);
  assert.equal(linkage.institutions.stale_readiness[0].slug, "land-compensation");
  assert.equal(linkage.next_action_allowed, false);
});

test("아티팩트 의존으로 착수 가능·차단을 가른다", async () => {
  const caseData = await projectCase();
  const status = projectStatus(caseData);

  assert.equal(status.counts.done + status.counts.in_progress + status.counts.ready
    + status.counts.blocked + status.counts.path_undetermined, 54);
  assert.deepEqual(status.done, ["N01", "N04"]);
  assert.deepEqual(status.in_progress.map((item) => item.node_id), ["N02"]);
  assert.ok(status.ready.some((item) => item.node_id === "N03"), "N01 완료로 열린 마일스톤이 있어야 한다");
  assert.equal(status.execution_allowed, false);
});

test("조건부 마일스톤은 파라미터가 미확정이면 개폐를 판정하지 않는다", async () => {
  const caseData = await projectCase();
  const status = projectStatus(caseData);
  const undetermined = status.path_undetermined.map((item) => item.node_id).sort();

  assert.deepEqual(undetermined, ["N13", "N16", "N19", "N20", "N46"]);
});

test("오버레이 상태와 활성화 판정이 어긋나면 드러낸다", async () => {
  const caseData = await projectCase();
  const conflicts = allMilestoneStatuses(caseData).filter((status) => status.overlay_status_conflict);

  // N46은 오버레이에 planned로 적혀 있지만 위험물 파라미터가 미확정이다.
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].node_id, "N46");
  assert.match(conflicts[0].overlay_status_conflict, /hazardousFacilityPermitsRequired/u);
});

test("막힌 마일스톤의 원인을 상류로 거슬러 준다", async () => {
  const caseData = await projectCase();
  const explained = explainBlocked(caseData, "N49");

  assert.equal(explained.milestone.openness, "blocked");
  assert.ok(explained.blocked_by.length >= 3);
  assert.ok(explained.blocked_by.every((blocker) => blocker.strength === "hard"));
  assert.ok(explained.upstream_chain.some((entry) => entry.depth >= 2), "2단계 이상 거슬러야 한다");
  assert.equal(explained.institution_readiness.next_action_computable, false);
  assert.equal(explained.execution_allowed, false);
});

test("제도 케이스에 프로젝트 계산을 걸면 거부한다", async () => {
  const institutionCase = await loadOntologyCase({ ontologyDir });
  assert.throws(() => projectStatus(institutionCase), ProjectCaseError);
});

test("프로젝트 케이스도 같은 패킷 계약을 통과하고 준비도 경고를 싣는다", async () => {
  const caseData = await projectCase();
  const result = queryCase(caseData, "지금 반도체 클러스터에서 뭐부터 할 수 있어?");

  assert.equal(result.mode, "case_action_packet");
  assert.equal(result.packet.packet_id, "ap:pmo-open-front");
  assert.equal(result.packet.execution_allowed, false);
  assert.equal(result.packet.ontology_packet.auto_execute, false);
  assert.ok(result.packet.risks.some((risk) => risk.includes("미평가")));
});

test("전력 경로 질의는 배타 분기 패킷으로 간다", async () => {
  const caseData = await projectCase();
  const result = queryCase(caseData, "전력 쪽은 어떻게 돼 있어?");

  assert.equal(result.packet.packet_id, "ap:grid-path-decision");
  // 전력계통 경로는 참조 제도가 전부 R2로 올라와 제도 쪽 병목은 풀렸다.
  // 남은 것은 gridPath 파라미터를 사업이 정하는 일이다.
  const readiness = institutionReadinessFor(caseData, "N20");
  assert.ok(readiness.referenced.length > 0);
  assert.equal(readiness.next_action_computable, true);
  assert.deepEqual(readiness.not_ready_slugs, []);
});
