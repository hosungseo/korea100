import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadOntologyCase, queryCase } from "../src/ontology-bridge.mjs";
import { checkCaseLinkageFor } from "../src/case-link.mjs";
import { allMilestoneStatuses, institutionReadinessFor } from "../src/project-case.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));
const samplesDir = path.join(ontologyDir, "samples");

const load = (file) => loadOntologyCase({ ontologyDir, caseFile: `samples/${file}` });
const projectCase = () => load("gwangju-semiconductor-cluster.case.json");

test("프로젝트를 가리키는 제도 케이스는 모두 오버레이와 맞물린다", async () => {
  const files = (await readdir(samplesDir)).filter((file) => file.endsWith(".case.json"));
  const linked = [];

  for (const file of files) {
    const caseData = JSON.parse(await readFile(path.join(samplesDir, file), "utf8"));
    if (!caseData.project_context) continue;
    const linkage = await checkCaseLinkageFor(caseData);
    linked.push({ file, caseId: caseData.case_id, linkage });
  }

  assert.ok(linked.length >= 4, "마일스톤을 채우는 제도 케이스가 넷 이상이어야 한다");
  for (const entry of linked) {
    assert.equal(entry.linkage.project_context.status, "aligned", `${entry.caseId} 프로젝트 연결`);
    assert.equal(entry.linkage.status, "aligned", `${entry.caseId} 제도 대조`);
    assert.equal(entry.linkage.next_action_allowed, true, `${entry.caseId} 다음 행동`);
  }
});

test("한 마일스톤에 제도 케이스가 둘 붙을 수 있다", async () => {
  const designation = await load("semiconductor-cluster-designation.case.json");
  const specialized = await load("national-strategic-industry-complex.case.json");

  // 둘 다 N03을 채운다고 주장하고, 둘 다 맞다.
  assert.equal(designation.project_context.milestone_node_id, "N03");
  assert.equal(specialized.project_context.milestone_node_id, "N03");
  for (const caseData of [designation, specialized]) {
    assert.equal((await checkCaseLinkageFor(caseData)).project_context.status, "aligned");
  }

  // 배타 관계가 아니라는 것이 그 근거다.
  const rule = specialized.rules.find((item) => item.id === "rule:parallel-to-semiconductor-cluster");
  assert.ok(rule, "중복 지정 규칙이 있어야 한다");
  assert.equal(rule.output.sibling_case, designation.case_id);

  // N03이 실제로 두 제도를 모두 참조한다.
  const project = await projectCase();
  const referenced = institutionReadinessFor(project, "N03").referenced.map((item) => item.slug);
  assert.ok(referenced.includes(designation.institution_slug));
  assert.ok(referenced.includes(specialized.institution_slug));
});

test("신속처리 케이스의 선행 조건이 사업 층의 아티팩트 의존과 같다", async () => {
  const project = await projectCase();
  const fasttrack = await load("semiconductor-infrastructure-fasttrack.case.json");

  // 사업 층: N20은 반도체클러스터 지정 아티팩트를 요구한다.
  const requires = (project.relations ?? [])
    .filter((relation) => relation.type === "requires" && relation.from === "milestone:N20")
    .map((relation) => relation.to);
  assert.ok(requires.includes("artifact:semiconductor.cluster_designated"));

  // 제도 층: 법 제27조제1항이 사업시행자 지위를 전제한다는 같은 조건.
  const rule = fasttrack.rules.find((item) => item.id === "rule:fasttrack-requires-cluster-designation");
  assert.ok(rule);
  assert.equal(rule.statute_ref[0].article, "제27조제1항");
  const state = fasttrack.states.find((item) => item.entity_id === "item:cluster-designation");
  assert.equal(state.state, "not_yet");
});

test("격리된 단계는 케이스에서도 절차 상태를 주장하지 않는다", async () => {
  const pfs = await load("preliminary-feasibility-study.case.json");
  const linkage = await checkCaseLinkageFor(pfs);

  // 제도 쪽에서 P16은 참고용으로 격리돼 있다.
  const institution = JSON.parse(
    await readFile(new URL("../../web/data/institutions/preliminary-feasibility-study.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(institution.process.agent_readiness.reference_only_node_ids, ["P16"]);
  assert.equal(linkage.readiness.level, "R2");

  // 케이스도 P16에 진행 상태를 붙이지 않는다.
  const state = pfs.states.find((item) => item.entity_id === "step:P16");
  assert.equal(state.state, "not_a_statutory_step");
  assert.equal(state.evidence.kind, "none");

  // 구조 층 파생에서도 미검증으로 내려온다.
  const entity = pfs.entities.find((item) => item.id === "step:P16");
  assert.equal(entity.status, "unverified");
});

test("진행 중인 마일스톤 안쪽에서 무엇이 막고 있는지 답한다", async () => {
  const project = await projectCase();
  const pfs = await load("preliminary-feasibility-study.case.json");

  // 사업 층: N02가 유일하게 진행 중이다.
  const milestone = allMilestoneStatuses(project).find((status) => status.node_id === "N02");
  assert.equal(milestone.openness, "in_progress");

  // 제도 층: 총사업비가 확정되지 않아 대상 여부조차 판정할 수 없다.
  const packet = queryCase(pfs, "예타 대상인지 어떻게 확인해?");
  assert.equal(packet.packet.packet_id, "ap:determine-pfs-applicability");
  assert.ok(packet.packet.checklist[0].instruction.includes("총사업비"));
  const rule = pfs.rules.find((item) => item.id === "rule:pfs-threshold");
  assert.equal(rule.statute_ref[0].article, "제38조제1항");
});

test("여섯 케이스 모두 같은 ActionPacket 계약을 통과한다", async () => {
  const files = (await readdir(samplesDir)).filter((file) => file.endsWith(".case.json"));
  let checked = 0;

  for (const file of files) {
    const caseData = await load(file);
    for (const demo of caseData.demo_queries ?? []) {
      const result = queryCase(caseData, demo.q);
      if (!result.packet) continue;
      assert.equal(result.packet.execution_allowed, false, `${caseData.case_id} ${demo.q}`);
      assert.equal(result.packet.ontology_packet.auto_execute, false);
      assert.ok(result.packet.ontology_packet.checklist.length > 0);
      checked += 1;
    }
  }
  assert.ok(checked >= 10, `패킷 질의를 충분히 검사해야 한다 (검사 ${checked}건)`);
});
