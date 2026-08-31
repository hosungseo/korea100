/**
 * Ontology bridge for Korea100 MCP.
 * Read-only. No secrets. No auto-execution.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { certifyPacketEnvelope } from "./packet-contract.mjs";
import { checkCaseLinkageFor } from "./case-link.mjs";

export const DEFAULT_ONTOLOGY_DIR = fileURLToPath(new URL("../../ontology/", import.meta.url));
export const DEFAULT_CASE_FILE = "samples/information-disclosure.case.json";

export class OntologyBridgeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "OntologyBridgeError";
    this.code = code;
    this.details = details;
  }
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, compact(item)]),
  );
}

export async function loadOntologyCase({
  ontologyDir = DEFAULT_ONTOLOGY_DIR,
  caseFile = DEFAULT_CASE_FILE,
  caseId = null,
} = {}) {
  const filePath = path.join(ontologyDir, caseFile);
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new OntologyBridgeError("case_file_not_found", "온톨로지 케이스 파일을 찾지 못했습니다.", {
      filePath,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const data = JSON.parse(raw);
  if (caseId && data.case_id !== caseId && !String(data.case_id).endsWith(caseId)) {
    throw new OntologyBridgeError("case_id_mismatch", "요청한 case_id와 파일이 일치하지 않습니다.", {
      requested: caseId,
      found: data.case_id,
    });
  }
  return data;
}

export function getCaseState(caseData) {
  const states = caseData.states ?? [];
  const caseEntity = states.find((s) => s.entity_id.startsWith("case:"));
  const openSteps = states
    .filter((s) => s.entity_id.startsWith("step:") && ["ready", "available", "open", "in_progress"].includes(s.state))
    .map((s) => ({ entity_id: s.entity_id, state: s.state }));
  const doneSteps = states
    .filter((s) => s.entity_id.startsWith("step:") && s.state === "done")
    .map((s) => s.entity_id);
  return {
    case_id: caseData.case_id,
    institution_slug: caseData.institution_slug,
    as_of: caseData.as_of,
    case_state: caseEntity?.state ?? null,
    case_state_evidence: caseEntity?.evidence ?? null,
    done_steps: doneSteps,
    open_steps: openSteps,
    states,
  };
}

export function listActionPackets(caseData) {
  return (caseData.action_packets ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    for_query: p.for_query,
    actor: p.actor,
  }));
}

function matchQuery(caseData, query) {
  const q = String(query ?? "").trim();
  if (!q) return caseData.demo_queries?.[0] ?? null;
  const demos = caseData.demo_queries ?? [];
  for (const d of demos) {
    if (!d?.q) continue;
    if (q.includes(d.q) || d.q.includes(q)) return d;
  }
  if (/부분공개|비공개|보완|이의|통지|뭐 하면/.test(q)) {
    return demos.find((d) => /부분공개|뭐 하면/.test(d.q ?? "")) ?? demos[0] ?? null;
  }
  if (/어디|단계|상태|지금/.test(q)) {
    return demos.find((d) => /단계|어디/.test(d.q ?? "")) ?? null;
  }
  return demos[0] ?? null;
}

export function getActionPacket(caseData, packetId) {
  const packet = (caseData.action_packets ?? []).find((p) => p.id === packetId);
  if (!packet) {
    throw new OntologyBridgeError("packet_not_found", "ActionPacket을 찾지 못했습니다.", {
      packetId,
      available: (caseData.action_packets ?? []).map((p) => p.id),
    });
  }
  if (packet.auto_execute !== false) {
    throw new OntologyBridgeError("unsafe_packet", "auto_execute는 false여야 합니다.", { packetId });
  }
  return packet;
}

/** Ontology ActionPacket → MCP-like create_action_packet envelope */
export function ontologyPacketToMcpEnvelope(caseData, packet, { query = null } = {}) {
  const state = getCaseState(caseData);
  const checklist = (packet.checklist ?? []).map((instruction, index) => ({
    id: `ontology-check-${index + 1}`,
    required: true,
    instruction,
    evidence: packet.evidence_needed ?? [],
  }));
  checklist.push({
    id: "final-human-confirmation",
    required: true,
    instruction: packet.human_signoff || "권한 있는 사람이 최종 확인한 뒤에만 진행한다.",
    evidence: [],
  });

  return compact({
    packet_id: packet.id,
    status: "ready-for-human-review",
    generated_at: new Date().toISOString(),
    execution_allowed: false,
    auto_execute: false,
    human_confirmation_required: true,
    ontology: {
      version: caseData.ontology_version,
      case_id: caseData.case_id,
      mode: "case",
      query,
      rules_referenced: (packet.based_on ?? []).filter((id) => String(id).startsWith("rule:")),
      based_on: packet.based_on ?? [],
    },
    procedure: {
      slug: caseData.institution_slug,
      name: caseData.institution_name,
    },
    case_state: state.case_state,
    open_steps: state.open_steps,
    actor: packet.actor,
    title: packet.title,
    why: packet.why,
    checklist,
    evidence_needed: packet.evidence_needed ?? [],
    system_touchpoints: packet.system_touchpoints ?? [],
    human_signoff: packet.human_signoff,
    risks: packet.risks ?? [],
    safety: {
      read_only: true,
      execution_allowed: false,
      note: "온톨로지 액션패킷은 제안만 한다. 결재·접수·발송 권한 없음.",
    },
  });
}

export function queryCase(caseData, query) {
  const matched = matchQuery(caseData, query);
  const state = getCaseState(caseData);

  if (matched?.resolve && !matched.resolve.action_packet && (matched.resolve.done || matched.resolve.ready)) {
    return {
      mode: "case_state",
      query,
      matched_demo: matched?.q ?? null,
      state,
      resolve: matched.resolve,
      execution_allowed: false,
    };
  }

  const packetId = matched?.resolve?.action_packet ?? caseData.action_packets?.[0]?.id;
  if (!packetId) {
    throw new OntologyBridgeError("no_packet", "이 케이스에 ActionPacket이 없습니다.", {
      case_id: caseData.case_id,
    });
  }
  const packet = getActionPacket(caseData, packetId);
  const envelope = ontologyPacketToMcpEnvelope(caseData, packet, { query });
  // R2 경로와 같은 계약을 통과해야 한다.
  envelope.ontology_packet = certifyPacketEnvelope(envelope);
  return {
    mode: "case_action_packet",
    query,
    matched_demo: matched?.q ?? null,
    state,
    rules_fired: matched?.resolve?.rules_fired ?? envelope.ontology.rules_referenced,
    packet: envelope,
    execution_allowed: false,
  };
}

export async function queryOntologyCase(query, options = {}) {
  const caseData = await loadOntologyCase(options);
  const result = queryCase(caseData, query);
  const linkage = await checkCaseLinkageFor(caseData);
  if (result.packet && (linkage.status !== "aligned" || !linkage.next_action_allowed)) {
    result.packet.risks = [...(result.packet.risks ?? []), ...linkage.notes];
  }
  return { ...result, linkage };
}
