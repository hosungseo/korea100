import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadOntologyCase, queryCase, matchQuery } from "../src/ontology-bridge.mjs";
import { checkCaseLinkageFor } from "../src/case-link.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));
const caseFile = "samples/administrative-fine-pre-notice.case.json";

async function fineCase() {
  return loadOntologyCase({ ontologyDir, caseFile });
}

test("2호 케이스는 R2 제도와 어긋남 없이 맞물린다", async () => {
  const caseData = await fineCase();
  const linkage = await checkCaseLinkageFor(caseData);

  assert.equal(linkage.institution_slug, "administrative-fine-pre-notice-opinion");
  assert.equal(linkage.status, "aligned");
  assert.equal(linkage.readiness.level, "R2");
  assert.equal(linkage.next_action_allowed, true, "R2 + aligned면 다음 행동 계산이 허용된다");
  assert.deepEqual(linkage.steps.unknown_step_ids, []);
  assert.deepEqual(linkage.sequence.unknown_edges, []);
});

test("당사자 질의는 당사자 패킷을, 행정청 질의는 행정청 패킷을 돌려준다", async () => {
  const caseData = await fineCase();

  const party = queryCase(caseData, "과태료 사전통지 받았는데 뭐 해야 해?");
  assert.equal(party.mode, "case_action_packet");
  assert.equal(party.packet.packet_id, "ap:party-after-pre-notice");
  assert.equal(party.packet.actor, "role:party");

  const agency = queryCase(caseData, "의견서 들어왔는데 다음에 뭐 하지?");
  assert.equal(agency.packet.packet_id, "ap:agency-after-opinion");
  assert.equal(agency.packet.actor, "role:levying-agency");
});

test("R2 케이스 패킷에는 준비도 미달 경고가 붙지 않는다", async () => {
  const caseData = await fineCase();
  const result = queryCase(caseData, "과태료 사전통지 받았는데 뭐 해야 해?");

  assert.ok(result.packet.risks.length > 0, "사안 고유 위험은 남아 있어야 한다");
  assert.ok(
    !result.packet.risks.some((risk) => risk.includes("reference-only")),
    "R2 제도라면 준비도 경고가 없어야 한다",
  );
});

test("현재 상태는 의견 제출 기한이 열린 시점이다", async () => {
  const caseData = await fineCase();
  const result = queryCase(caseData, "지금 이 건 어디 단계야?");

  assert.equal(result.mode, "case_state");
  assert.equal(result.state.case_state, "pre_notice_received_opinion_open");
  assert.deepEqual(result.state.done_steps, ["step:P01", "step:P02", "step:P03", "step:P04"]);
  assert.ok(result.state.open_steps.some((step) => step.entity_id === "step:P05"));
});

test("두 케이스 모두 같은 패킷 계약을 통과한다", async () => {
  const fine = queryCase(await fineCase(), "과태료 사전통지 받았는데 뭐 해야 해?");
  const disclosure = queryCase(
    await loadOntologyCase({ ontologyDir }),
    "부분공개 통지 왔는데 뭐 하면 됨?",
  );

  for (const result of [fine, disclosure]) {
    assert.equal(result.packet.execution_allowed, false);
    assert.equal(result.packet.ontology_packet.auto_execute, false);
  }
  assert.deepEqual(
    Object.keys(fine.packet.ontology_packet).sort(),
    Object.keys(disclosure.packet.ontology_packet).sort(),
  );
});

test("가까운 데모가 없으면 패킷을 만들지 않고 되묻는다", async () => {
  const caseData = await fineCase();
  const result = queryCase(caseData, "당사자 의견 제출됐는데 행정청은 뭘 하나");

  assert.equal(result.mode, "case_needs_disambiguation");
  assert.equal(result.packet, undefined);
  assert.equal(result.execution_allowed, false);
  assert.equal(result.candidates.length, caseData.demo_queries.length);
});

test("질의 매칭은 제도별 어휘를 코드에 두지 않는다", async () => {
  const caseData = await fineCase();

  assert.equal(matchQuery(caseData, "의견서 접수했는데 다음 절차가 뭐야").reason, "similar");
  assert.equal(matchQuery(caseData, "이 건 진행 상황 알려줘").reason, "stage-question");
  assert.equal(matchQuery(caseData, "점심 뭐 먹지"), null);
});
