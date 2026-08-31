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

test("참조 제도 108개가 모두 미평가라 다음 행동을 계산하지 않는다", async () => {
  const caseData = await projectCase();
  const linkage = await checkCaseLinkageFor(caseData);

  assert.equal(linkage.institutions.referenced_count, 108);
  assert.equal(linkage.institutions.r2_count, 0);
  assert.equal(linkage.next_action_allowed, false);
  assert.ok(linkage.notes.some((note) => note.includes("R2가 없습니다")));

  const rollup = projectStatus(caseData).readiness;
  assert.deepEqual(rollup.next_action_computable_milestones, []);
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
  const readiness = institutionReadinessFor(caseData, "N20");
  assert.ok(readiness.referenced.length > 0);
  assert.equal(readiness.next_action_computable, false);
});
