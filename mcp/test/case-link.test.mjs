import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadOntologyCase } from "../src/ontology-bridge.mjs";
import {
  checkCaseLinkage,
  checkCaseLinkageFor,
  loadInstitutionForLinkage,
} from "../src/case-link.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));

async function sampleCase() {
  return loadOntologyCase({ ontologyDir });
}

test("샘플 케이스는 정보공개 제도 업무구조도와 정확히 대응한다", async () => {
  const caseData = await sampleCase();
  const linkage = await checkCaseLinkageFor(caseData);

  assert.equal(linkage.institution_found, true);
  assert.equal(linkage.institution_slug, "information-disclosure");
  assert.equal(linkage.status, "aligned");
  assert.deepEqual(linkage.steps.unknown_step_ids, []);
  assert.deepEqual(linkage.steps.label_mismatches, []);
  assert.deepEqual(linkage.sequence.unknown_edges, []);
  assert.equal(linkage.steps.case_step_count, linkage.steps.institution_node_count);
  assert.equal(linkage.sequence.case_relation_count, linkage.sequence.institution_edge_count);
});

test("정보공개는 R2 승격 후 다음 행동 계산이 허용된다", async () => {
  const caseData = await sampleCase();
  const linkage = await checkCaseLinkageFor(caseData);

  assert.equal(linkage.readiness.level, "R2");
  assert.equal(linkage.readiness.mode, "next-action");
  assert.equal(linkage.next_action_allowed, true);
  assert.deepEqual(linkage.readiness.blockers, [], "차단 사유가 남아 있으면 R2가 아니다");
  assert.equal(linkage.readiness.last_live_check.status, "passed");
  assert.equal(linkage.readiness.last_live_check.verified_references, 36);
});

test("준비도가 R2 미만이면 다음 행동 계산을 막는다", async () => {
  const caseData = await sampleCase();
  const institution = await loadInstitutionForLinkage("information-disclosure");
  const downgraded = {
    ...institution,
    process: {
      ...institution.process,
      agent_readiness: {
        ...institution.process.agent_readiness,
        level: "R1",
        mode: "reference-only",
        blockers: ["전이 조건·인계 수동 대조 미완료"],
      },
    },
  };

  const linkage = checkCaseLinkage(caseData, downgraded);
  assert.equal(linkage.status, "aligned", "대조 자체는 여전히 맞는다");
  assert.equal(linkage.next_action_allowed, false, "등급이 모자라면 아무리 맞아도 막는다");
  assert.ok(linkage.notes.some((note) => note.includes("R1")));
});

test("케이스가 없는 단계를 가리키면 어긋남으로 잡는다", async () => {
  const caseData = await sampleCase();
  const institution = await loadInstitutionForLinkage("information-disclosure");
  const drifted = {
    ...caseData,
    entities: [...caseData.entities, { id: "step:P99", type: "Step", label: "없는 단계" }],
  };

  const linkage = checkCaseLinkage(drifted, institution);
  assert.equal(linkage.status, "drifted");
  assert.deepEqual(linkage.steps.unknown_step_ids, ["P99"]);
  assert.equal(linkage.next_action_allowed, false);
});

test("단계 이름이 갈라지면 어긋남으로 잡는다", async () => {
  const caseData = await sampleCase();
  const institution = await loadInstitutionForLinkage("information-disclosure");
  const drifted = {
    ...caseData,
    entities: caseData.entities.map((entity) => (
      entity.id === "step:P10" ? { ...entity, label: "이름이 바뀐 단계" } : entity
    )),
  };

  const linkage = checkCaseLinkage(drifted, institution);
  assert.equal(linkage.status, "drifted");
  assert.equal(linkage.steps.label_mismatches.length, 1);
  assert.equal(linkage.steps.label_mismatches[0].step_id, "P10");
});

test("제도에 없는 연결선을 케이스가 주장하면 어긋남으로 잡는다", async () => {
  const caseData = await sampleCase();
  const institution = await loadInstitutionForLinkage("information-disclosure");
  const drifted = {
    ...caseData,
    relations: [
      ...caseData.relations,
      { id: "r:fake", type: "sequence", from: "step:P01", to: "step:P16" },
    ],
  };

  const linkage = checkCaseLinkage(drifted, institution);
  assert.equal(linkage.status, "drifted");
  assert.equal(linkage.sequence.unknown_edges.length, 1);
  assert.equal(linkage.sequence.unknown_edges[0].relation_id, "r:fake");
});

test("제도 파일을 찾지 못하면 단정하지 않고 멈춘다", async () => {
  const linkage = checkCaseLinkage({ institution_slug: "nope-not-here" }, null);
  assert.equal(linkage.institution_found, false);
  assert.equal(linkage.status, "institution_not_found");
  assert.equal(linkage.next_action_allowed, false);
  assert.equal(await loadInstitutionForLinkage("../../../etc/passwd"), null);
});
