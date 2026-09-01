import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadOntologyCase } from "../src/ontology-bridge.mjs";
import {
  applyTransition,
  legalTransitions,
  movableEntities,
  TransitionError,
  validateTransition,
} from "../src/case-transitions.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));
const load = (file) => loadOntologyCase({ ontologyDir, caseFile: `samples/${file}` });
const disclosure = () => load("information-disclosure.case.json");
const project = () => load("gwangju-semiconductor-cluster.case.json");

const evidence = { kind: "user_asserted", note: "접수증 확인" };

test("전이표에 없는 이동은 거부한다", async () => {
  const caseData = await disclosure();
  const verdict = validateTransition(caseData, { entity_id: "step:P12", to: "done", evidence });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.from, "pending");
  const codes = verdict.reasons.map((reason) => reason.code);
  assert.ok(codes.includes("transition_not_in_table"));
  // 왜 안 되는지만 말하고 대안을 지어내지 않는다 — 갈 수 있는 곳은 표에서 그대로 온다.
  const reason = verdict.reasons.find((item) => item.code === "transition_not_in_table");
  assert.deepEqual(reason.allowed_from_here, ["ready", "applicability_undetermined", "not_a_statutory_step", "blocked"]);
});

test("선행이 안 끝났으면 착수 가능으로 못 바꾼다", async () => {
  const caseData = await disclosure();
  const verdict = validateTransition(caseData, { entity_id: "step:P12", to: "ready", evidence });

  assert.equal(verdict.ok, false);
  const blocker = verdict.reasons.find((reason) => reason.code === "predecessor_not_satisfied");
  assert.ok(blocker, "선행 미충족이 사유로 나와야 한다");
  assert.equal(blocker.entity_id, "step:P11");
  assert.equal(blocker.state, "ready");
});

test("앞으로 나아가는 전이는 근거 없이 통과시키지 않는다", async () => {
  const caseData = await disclosure();

  const noEvidence = validateTransition(caseData, {
    entity_id: "step:P10",
    to: "done",
    evidence: { kind: "none", note: "" },
  });
  assert.equal(noEvidence.ok, false);
  const codes = noEvidence.reasons.map((reason) => reason.code);
  assert.ok(codes.includes("evidence_none_on_advance"));
  assert.ok(codes.includes("evidence_note_missing"));

  // 뒤로 가거나 멈추는 전이는 kind=none 을 허용한다. 법의 침묵과 같은 취급이다.
  const blocked = validateTransition(caseData, {
    entity_id: "step:P10",
    to: "blocked",
    evidence: { kind: "none", note: "상대 기관 회신 대기" },
  });
  assert.equal(blocked.ok, true);
});

test("완료를 되돌리려면 루프 관계가 있어야 한다", async () => {
  const caseData = await disclosure();
  const done = caseData.states.find((state) => state.entity_id.startsWith("step:") && state.state === "done");
  const verdict = validateTransition(caseData, { entity_id: done.entity_id, to: "in_progress", evidence });

  if (verdict.ok) {
    // 루프가 실제로 있는 단계라면 그 근거가 관계로 존재해야 한다.
    assert.ok(caseData.relations.some((relation) => relation.type === "loop" && relation.to === done.entity_id));
  } else {
    assert.ok(verdict.reasons.some((reason) => reason.code === "no_loop_relation"));
  }
});

test("적용은 원본을 건드리지 않고 이력을 남긴다", async () => {
  const caseData = await disclosure();
  const before = JSON.parse(JSON.stringify(caseData));

  const next = applyTransition(caseData, {
    entity_id: "step:P10",
    to: "in_progress",
    evidence: { kind: "user_asserted", note: "이의신청서 작성 착수" },
    at: "2026-09-03",
    actor: "민원인",
  });

  // 원본 불변 — MCP가 이 함수를 불러도 케이스가 오염되지 않아야 한다.
  assert.deepEqual(caseData, before);

  const state = next.states.find((item) => item.entity_id === "step:P10");
  assert.equal(state.state, "in_progress");
  assert.equal(state.as_of, "2026-09-03");
  assert.equal(state.evidence.recorded_at, "2026-09-03");

  assert.equal(next.state_log.length, 1);
  const entry = next.state_log[0];
  assert.deepEqual(
    { seq: entry.seq, entity_id: entry.entity_id, from: entry.from, to: entry.to, actor: entry.actor },
    { seq: 1, entity_id: "step:P10", from: "ready", to: "in_progress", actor: "민원인" },
  );
  assert.equal(next.as_of, "2026-09-03");
});

test("검사에 걸린 전이를 적용하면 조용히 통과하지 않고 던진다", async () => {
  const caseData = await disclosure();
  assert.throws(
    () => applyTransition(caseData, { entity_id: "step:P12", to: "done", evidence }),
    (error) => error instanceof TransitionError && error.code === "transition_rejected",
  );
});

test("케이스에 없는 엔티티는 상태를 만들어 주지 않는다", async () => {
  const caseData = await disclosure();
  const verdict = validateTransition(caseData, { entity_id: "step:P99", to: "ready", evidence });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasons[0].code, "entity_unknown");
});

test("사건 서사 상태는 어휘를 닫은 척하지 않는다", async () => {
  const caseData = await disclosure();
  const options = legalTransitions(caseData, "case:IDC-2026-0901-001");

  assert.equal(options.closed_vocabulary, false);
  assert.deepEqual(options.transitions, []);
  assert.equal(options.from, "decision_notified_partial");
  // 어휘는 안 닫아도 근거는 받는다.
  const verdict = validateTransition(caseData, {
    entity_id: "case:IDC-2026-0901-001",
    to: "appeal_filed",
    evidence: { kind: "none", note: "" },
  });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.some((reason) => reason.code === "evidence_note_missing"));
});

test("움직일 수 있는 것만 모아 준다", async () => {
  const caseData = await disclosure();
  const movable = movableEntities(caseData);

  assert.ok(movable.length > 0);
  // 전부 단계·마일스톤이어야 한다. 서사 상태는 후보로 내밀지 않는다.
  for (const item of movable) {
    assert.match(item.entity_id, /^(step|milestone):/u);
    assert.ok(item.can_become.length > 0);
  }
  const p10 = movable.find((item) => item.entity_id === "step:P10");
  assert.deepEqual(p10.can_become, ["in_progress", "done", "blocked"]);
});

test("마일스톤은 사업 어휘로 판정한다", async () => {
  const caseData = await project();
  const options = legalTransitions(caseData, "milestone:N23");

  assert.equal(options.entity_kind, "milestone");
  assert.equal(options.closed_vocabulary, true);
  const targets = options.transitions.map((transition) => transition.to);
  assert.ok(targets.includes("in_progress"));
  // 단계 어휘가 새어 들어오면 안 된다.
  assert.ok(!targets.includes("applicability_undetermined"));
});
