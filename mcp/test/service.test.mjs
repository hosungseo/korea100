import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_READY_SLUGS, loadAgentReadyInstitutions } from "../src/catalog.mjs";
import { AdministrativeProcedureService, ProcedureQueryError } from "../src/service.mjs";

const institutions = await loadAgentReadyInstitutions();

// 시각 기준을 데이터의 마지막 법령 대조일에 건다. 날짜를 상수로 박으면
// 대조를 다시 돌릴 때마다 신선도 테스트가 썩는다.
function checkDate(slug, offsetDays = 0) {
  const institution = institutions.find((item) => item.slug === slug);
  const date = new Date(`${institution.process.agent_readiness.last_live_check.checked_at}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

const FIXED_NOW = checkDate("national-rd-fund-use-settlement");
const STALE_NOW = checkDate("national-rd-fund-use-settlement", 31);
const service = new AdministrativeProcedureService(institutions, {
  now: () => new Date(FIXED_NOW),
});

test("R2 검증을 통과한 대표 제도 12개만 로드한다", () => {
  assert.equal(institutions.length, 12);
  assert.deepEqual(institutions.map((institution) => institution.slug), AGENT_READY_SLUGS);
  assert.ok(institutions.every((institution) => institution.process.agent_readiness.level === "R2"));
});

test("제도명과 행위자로 MCP 공개 대상을 검색한다", () => {
  const fineResults = service.searchProcedures({ query: "과태료" });
  assert.equal(fineResults.match_count, 2);
  assert.ok(fineResults.procedures.every((procedure) => procedure.name.includes("과태료")));

  const settlementResults = service.searchProcedures({ actor: "정산담당" });
  assert.equal(settlementResults.match_count, 1);
  assert.equal(settlementResults.procedures[0].slug, "national-rd-fund-use-settlement");
});

test("현재 단계의 문서·기한·법제처 공식 원문 링크를 반환한다", () => {
  const result = service.getStepRequirements("administrative-fine-pre-notice-opinion", "P03");
  assert.equal(result.step.name, "사전통지 작성·발송");
  assert.equal(result.step.deadline_rule.type, "statutory");
  assert.deepEqual(result.step.completion_evidence, ["사전통지서"]);
  assert.equal(result.step.legal_bases[0].article, "제16조");
  assert.match(result.step.legal_bases[0].official_url, /^https:\/\/law\.go\.kr\//);
  assert.equal(result.step.human_confirmation_required, true);
  assert.equal(result.procedure.verification.legal_check.freshness.status, "current");
});

test("조건이 확인되지 않은 복수 분기에서는 경로를 선택하지 않는다", () => {
  const result = service.getNextActions("administrative-fine-pre-notice-opinion", "P07");
  assert.equal(result.selection.status, "decision-required");
  assert.equal(result.selection.decision_required, true);
  assert.equal(result.selected_actions.length, 0);
  assert.equal(result.available_actions.length, 2);
});

test("담당자가 확인한 정확한 조건으로만 다음 행동을 선택한다", () => {
  const result = service.getNextActions(
    "administrative-fine-pre-notice-opinion",
    "제출 의견의 상당한 이유 판단",
    { condition: "상당한 이유 있음" },
  );
  assert.equal(result.selection.status, "condition-matched");
  assert.equal(result.selection.decision_required, false);
  assert.equal(result.selected_actions[0].next_step.id, "P08");
  assert.equal(result.selected_actions[0].transition.human_confirmation_required, true);
});

test("두 분기에 걸치는 모호한 조건은 담당자 판단으로 되돌린다", () => {
  const result = service.getNextActions(
    "administrative-fine-pre-notice-opinion",
    "P07",
    { condition: "상당한 이유" },
  );
  assert.equal(result.selection.status, "condition-ambiguous");
  assert.equal(result.selection.decision_required, true);
  assert.equal(result.selected_actions.length, 0);
});

test("연구비 사전승인 분기의 인계 주체와 문서를 반환한다", () => {
  const result = service.getNextActions(
    "national-rd-fund-use-settlement",
    "P05",
    { condition: "승인 필요" },
  );
  const action = result.selected_actions[0];
  assert.equal(action.next_step.id, "P06");
  assert.equal(action.transition.handoff.to_actor, "중앙행정기관·전문기관");
  assert.deepEqual(action.transition.handoff.documents, ["사전승인 대상 검토표"]);
});

test("종료 단계에서는 후속 행동을 만들지 않는다", () => {
  const map = service.getProcedureMap("administrative-fine-objection-court");
  const terminalStep = map.terminal_step_ids[0];
  const result = service.getNextActions("administrative-fine-objection-court", terminalStep);
  assert.equal(result.terminal, true);
  assert.deepEqual(result.available_actions, []);
});

test("법령 대조 유효기간이 지나면 단일·일치 분기도 선택하지 않는다", () => {
  const staleService = new AdministrativeProcedureService(institutions, {
    now: () => new Date(STALE_NOW),
    maxLegalCheckAgeDays: 30,
  });
  const result = staleService.getNextActions(
    "national-rd-fund-use-settlement",
    "P05",
    { condition: "승인 필요" },
  );

  assert.equal(result.procedure.verification.legal_check.freshness.status, "stale");
  assert.equal(result.selection.status, "verification-required");
  assert.equal(result.selection.decision_required, true);
  assert.deepEqual(result.selected_actions, []);
  assert.equal(result.available_actions.length, 2);
});

test("정확한 제도·단계 메타데이터만 전자결재 이벤트로 자동 매핑한다", () => {
  const result = service.resolveWorkEvent({
    metadata_only: true,
    source_system: "onnara",
    event_type: "approval.completed",
    procedure_hint: "national-rd-fund-use-settlement",
    step_hint: "P05",
    condition: "승인 필요",
  });

  assert.equal(result.resolution.status, "resolved");
  assert.equal(result.resolution.procedure_slug, "national-rd-fund-use-settlement");
  assert.equal(result.resolution.step_id, "P05");
  assert.match(result.event.event_fingerprint, /^event_[a-f0-9]{20}$/);
  assert.equal(result.event.persisted, false);
  assert.equal(result.next_actions.selected_actions[0].next_step.id, "P06");
});

test("여러 절차에 걸치는 이벤트 힌트는 후보만 반환한다", () => {
  const result = service.resolveWorkEvent({
    metadata_only: true,
    source_system: "onnara",
    event_type: "document.received",
    procedure_hint: "과태료",
    step_hint: "P03",
  });

  assert.equal(result.resolution.status, "needs-mapping");
  assert.equal(result.resolution.mapping_required, true);
  assert.equal(result.next_actions, null);
  assert.ok(result.candidates.length >= 2);
});

test("비식별 메타데이터 확인이 없으면 이벤트 처리를 거부한다", () => {
  assert.throws(
    () => service.resolveWorkEvent({
      metadata_only: false,
      event_type: "approval.completed",
      procedure_hint: "national-rd-fund-use-settlement",
      step_hint: "P05",
    }),
    (error) => error instanceof ProcedureQueryError && error.code === "metadata_only_assertion_required",
  );
});

test("주민등록번호·전화번호·이메일로 보이는 이벤트 값은 거부한다", () => {
  const sensitiveValues = [
    "900101-1234567",
    "010-1234-5678",
    "person@example.com",
  ];

  for (const documentTitle of sensitiveValues) {
    assert.throws(
      () => service.resolveWorkEvent({
        metadata_only: true,
        event_type: "document.received",
        procedure_hint: "national-rd-fund-use-settlement",
        document_title: documentTitle,
      }),
      (error) => error instanceof ProcedureQueryError && error.code === "sensitive_metadata_rejected",
    );
  }

  assert.throws(
    () => service.resolveWorkEvent({
      metadata_only: true,
      source_system: "person@example.com",
      event_type: "document.received",
      procedure_hint: "national-rd-fund-use-settlement",
    }),
    (error) => error instanceof ProcedureQueryError && error.code === "sensitive_metadata_rejected",
  );
});

test("선택된 경로를 실행권한 없는 사람 검토용 패킷으로 구성한다", () => {
  const args = [
    "national-rd-fund-use-settlement",
    "P05",
    { condition: "승인 필요", eventFingerprint: "event_0123456789abcdef0123" },
  ];
  const result = service.createActionPacket(...args);
  const repeated = service.createActionPacket(...args);

  assert.equal(result.status, "ready-for-human-review");
  assert.equal(result.execution_allowed, false);
  assert.equal(result.human_confirmation_required, true);
  assert.equal(result.packet_id, repeated.packet_id);
  assert.equal(result.handoff_packages[0].next_step.id, "P06");
  assert.equal(result.handoff_packages[0].to_actor, "중앙행정기관·전문기관");
  assert.deepEqual(result.handoff_packages[0].documents, ["사전승인 대상 검토표"]);
  assert.ok(result.official_sources.length > 0);
  assert.ok(result.official_sources.every((source) => source.official_url?.startsWith("https://law.go.kr/")));
  assert.equal(result.audit.event_fingerprint, "event_0123456789abcdef0123");
});

test("미확정 분기와 만료된 법령 대조는 실행 패킷을 차단한다", () => {
  const undecided = service.createActionPacket(
    "national-rd-fund-use-settlement",
    "P05",
  );
  assert.equal(undecided.status, "blocked-decision-required");
  assert.equal(undecided.handoff_packages.length, 0);
  assert.equal(undecided.blocking_questions.length, 1);
  assert.ok(undecided.official_sources.length > 0);

  const staleService = new AdministrativeProcedureService(institutions, {
    now: () => new Date(STALE_NOW),
  });
  const stale = staleService.createActionPacket(
    "national-rd-fund-use-settlement",
    "P05",
    { condition: "승인 필요" },
  );
  assert.equal(stale.status, "blocked-verification-required");
  assert.equal(stale.handoff_packages.length, 0);
  assert.equal(stale.audit.legal_check_freshness.status, "stale");
  assert.ok(stale.official_sources.length > 0);
});

test("검증되지 않은 이벤트 식별자는 실행 패킷에 연결하지 않는다", () => {
  assert.throws(
    () => service.createActionPacket(
      "national-rd-fund-use-settlement",
      "P05",
      { condition: "승인 필요", eventFingerprint: "onnara-document-123" },
    ),
    (error) => error instanceof ProcedureQueryError && error.code === "invalid_event_fingerprint",
  );
});

test("MCP 공개 대상이 아닌 slug는 명시적인 오류를 반환한다", () => {
  assert.throws(
    () => service.getProcedureMap("workplace-harassment-response"),
    (error) => error instanceof ProcedureQueryError && error.code === "procedure_not_found",
  );
});

// ── 참고용 노드 격리 ──────────────────────────────────────────────
// R2가 참고용 노드를 허용하는 대신 이 거부들이 성립해야 한다.
// 거부가 없으면 등급 완화가 그대로 안전성 약화가 된다.

const pfs = institutions.find((item) => item.slug === "preliminary-feasibility-study");

test("참고용으로 격리된 단계에서는 다음 행동을 계산하지 않는다", () => {
  assert.deepEqual(pfs.process.agent_readiness.reference_only_node_ids, ["P16"]);

  const result = service.getNextActions("preliminary-feasibility-study", "P16");
  assert.equal(result.selection.status, "reference-only-step");
  assert.deepEqual(result.selected_actions, []);
  assert.equal(result.selection.decision_required, true);
  assert.equal(result.reference_only.current_step, true);
  assert.ok(result.reference_only.current_step_reasons.length > 0);
});

test("격리된 단계의 실행 패킷은 인계 없이 차단된다", () => {
  const packet = service.createActionPacket("preliminary-feasibility-study", "P16");
  assert.equal(packet.status, "blocked-reference-only");
  assert.deepEqual(packet.handoff_packages, []);
  assert.equal(packet.execution_allowed, false);
  assert.ok(packet.blocking_questions.some((question) => question.includes("격리")));
});

test("격리되지 않은 단계는 평소대로 계산한다", () => {
  const result = service.getNextActions("preliminary-feasibility-study", "P07");
  assert.equal(result.selection.status, "single-path");
  assert.equal(result.selected_actions[0].next_step.id, "P08");
  assert.equal(result.reference_only.current_step, false);
});

test("격리된 단계로 가는 전이는 후보에서 빼고 사유를 남긴다", () => {
  // 예타에는 격리 노드로 들어가는 엣지가 없어 합성 제도로 확인한다.
  const synthetic = JSON.parse(JSON.stringify(pfs));
  synthetic.slug = "synthetic-reference-only";
  // P02는 P01의 유일한 후속 단계다. 그것을 격리하면 P01에서 고를 것이 없어야 한다.
  synthetic.process.agent_readiness.reference_only_node_ids = ["P02"];
  synthetic.process.agent_readiness.reference_only_reasons = { P02: ["합성 사유"] };

  const scoped = new AdministrativeProcedureService([synthetic], { now: () => new Date(FIXED_NOW) });
  const result = scoped.getNextActions("synthetic-reference-only", "P01");

  assert.deepEqual(result.selected_actions, []);
  assert.equal(result.reference_only.excluded_actions.length, 1);
  assert.equal(result.reference_only.excluded_actions[0].next_step_id, "P02");
  assert.deepEqual(result.reference_only.excluded_actions[0].reasons, ["합성 사유"]);

  const packet = scoped.createActionPacket("synthetic-reference-only", "P01");
  assert.ok(packet.blocking_questions.some((question) => question.includes("P02")));
});
