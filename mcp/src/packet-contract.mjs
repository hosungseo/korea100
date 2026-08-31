/**
 * Shared ActionPacket contract for Korea100 MCP.
 *
 * MCP-MAPPING.md의 약속("패킷은 ontology ActionPacket 계약을 만족해야 한다")을
 * 문서가 아니라 코드로 강제한다. R2 경로(create_action_packet)와
 * 온톨로지 경로(query_case)는 서로 다른 봉투를 만들지만,
 * 정규화하면 같은 ActionPacket 계약을 통과해야 한다.
 *
 * 계약 위반은 조용히 넘기지 않고 던진다. 자동 집행 금지가 이 계약의 핵심이다.
 */

export const PACKET_CONTRACT_VERSION = "ontology-actionpacket-v0";

const REQUIRED_FIELDS = Object.freeze(["id", "title", "actor", "why", "checklist", "human_signoff"]);

export class PacketContractError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PacketContractError";
    this.code = "packet_contract_violation";
    this.details = details;
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function unique(values) {
  return [...new Set(values.filter(nonEmptyString))];
}

/** ontology ActionPacket 계약 검증. 위반이면 던진다. */
export function assertOntologyPacket(packet, context = {}) {
  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = packet?.[field];
    if (field === "checklist") return !Array.isArray(value) || value.length === 0;
    return !nonEmptyString(value);
  });
  if (missing.length > 0) {
    throw new PacketContractError("ActionPacket 필수 항목이 비었습니다.", { ...context, missing });
  }
  if (packet.checklist.some((item) => !nonEmptyString(item))) {
    throw new PacketContractError("checklist 항목은 비어 있지 않은 문자열이어야 합니다.", context);
  }
  if (packet.auto_execute !== false) {
    throw new PacketContractError("auto_execute는 false여야 합니다.", {
      ...context,
      auto_execute: packet.auto_execute,
    });
  }
  return packet;
}

/**
 * MCP 봉투(R2 create_action_packet 또는 온톨로지 query_case 결과)를
 * ontology ActionPacket 모양으로 정규화한다.
 */
export function toOntologyPacket(envelope) {
  if (!envelope || typeof envelope !== "object") {
    throw new PacketContractError("패킷 봉투가 객체가 아닙니다.", { received: typeof envelope });
  }
  if (envelope.execution_allowed !== false) {
    throw new PacketContractError("execution_allowed는 false여야 합니다.", {
      packet_id: envelope.packet_id,
      execution_allowed: envelope.execution_allowed,
    });
  }
  if (envelope.human_confirmation_required !== true) {
    throw new PacketContractError("human_confirmation_required는 true여야 합니다.", {
      packet_id: envelope.packet_id,
    });
  }

  const checklistItems = Array.isArray(envelope.checklist) ? envelope.checklist : [];
  const checklist = unique(
    checklistItems.map((item) => (typeof item === "string" ? item : item?.instruction)),
  );
  const evidenceNeeded = unique(
    checklistItems.flatMap((item) => (Array.isArray(item?.evidence) ? item.evidence : [])),
  );
  const signoffItem = checklistItems.find((item) => item?.id === "final-human-confirmation");
  const humanSignoff = envelope.human_signoff
    ?? signoffItem?.instruction
    ?? "권한 있는 담당자가 최종 확인한 뒤에만 진행한다.";

  const stepId = envelope.current_step?.id ?? null;
  const basedOn = unique([
    ...(Array.isArray(envelope.ontology?.based_on) ? envelope.ontology.based_on : []),
    envelope.procedure?.slug ? `institution:${envelope.procedure.slug}` : null,
    stepId ? `step:${stepId}` : null,
    ...(Array.isArray(envelope.official_sources)
      ? envelope.official_sources.map((source) => `statute:${source.law} ${source.article}`)
      : []),
  ]);

  const actor = envelope.actor
    ?? envelope.handoff_packages?.[0]?.from_actor
    ?? envelope.current_step?.actor
    ?? "담당 부서";
  const title = envelope.title
    ?? (envelope.procedure?.name && stepId
      ? `${envelope.procedure.name} ${stepId} 이후 담당자 확인 패킷`
      : null)
    ?? `패킷 ${envelope.packet_id ?? "unknown"}`;
  const why = envelope.why
    ?? envelope.selection?.reason
    ?? (envelope.status ? `상태: ${envelope.status}` : null)
    ?? "다음 행동을 사람이 확인하도록 정리했다.";

  const risks = unique([
    ...(Array.isArray(envelope.risks) ? envelope.risks : []),
    ...(Array.isArray(envelope.blocking_questions) ? envelope.blocking_questions : []),
  ]);

  return {
    contract: PACKET_CONTRACT_VERSION,
    id: envelope.packet_id,
    title,
    actor,
    why,
    based_on: basedOn,
    checklist,
    evidence_needed: unique([...(envelope.evidence_needed ?? []), ...evidenceNeeded]),
    system_touchpoints: unique(envelope.system_touchpoints ?? []),
    human_signoff: humanSignoff,
    auto_execute: false,
    risks,
    source_path: envelope.ontology?.mode === "case" ? "ontology-case" : "r2-procedure",
  };
}

/** 봉투를 정규화하고 계약까지 검증한다. */
export function certifyPacketEnvelope(envelope) {
  const packet = toOntologyPacket(envelope);
  return assertOntologyPacket(packet, { packet_id: envelope.packet_id });
}
