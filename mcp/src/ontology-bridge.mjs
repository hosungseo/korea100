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

// 제도 케이스는 step:, 프로젝트 케이스는 milestone: 을 쓴다. 둘 다 "단계"다.
const STEP_PREFIXES = ["step:", "milestone:"];
const isStepEntity = (entityId) => STEP_PREFIXES.some((prefix) => String(entityId).startsWith(prefix));

export function getCaseState(caseData) {
  const states = caseData.states ?? [];
  const caseEntity = states.find((s) => s.entity_id.startsWith("case:"));
  const openSteps = states
    .filter((s) => isStepEntity(s.entity_id) && ["ready", "available", "open", "in_progress"].includes(s.state))
    .map((s) => ({ entity_id: s.entity_id, state: s.state }));
  const doneSteps = states
    .filter((s) => isStepEntity(s.entity_id) && s.state === "done")
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

/** 질의 유사도용 문자 바이그램. 한국어 조사 변형을 어느 정도 흡수한다. */
function bigrams(text) {
  const normalized = String(text ?? "").replace(/\s+/gu, "");
  const grams = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    grams.add(normalized.slice(index, index + 2));
  }
  return grams;
}

function similarity(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

const STAGE_QUESTION = /어디|단계|상태|지금|진행/u;
const MIN_SIMILARITY = 0.3;

/**
 * 케이스가 선언한 demo_queries 중 가장 가까운 것을 고른다.
 * 제도별 어휘를 코드에 박지 않는다 — 케이스가 늘 때마다 이 함수를 고치게 되기 때문이다.
 * 확신이 없으면 고르지 않는다. 엉뚱한 패킷을 주는 것이 아무것도 안 주는 것보다 나쁘다.
 */
export function matchQuery(caseData, query) {
  const q = String(query ?? "").trim();
  const demos = (caseData.demo_queries ?? []).filter((demo) => demo?.q);
  if (demos.length === 0) return null;
  if (!q) return { demo: demos[0], reason: "default" };

  for (const demo of demos) {
    if (q.includes(demo.q) || demo.q.includes(q)) return { demo, reason: "exact" };
  }

  const scored = demos
    .map((demo) => ({ demo, score: similarity(q, demo.q) }))
    .sort((a, b) => b.score - a.score);
  if (scored[0].score >= MIN_SIMILARITY) {
    return { demo: scored[0].demo, reason: "similar", score: scored[0].score };
  }

  // 단계·상태를 묻는 질문은 상태 응답을 가진 데모로 보낸다.
  if (STAGE_QUESTION.test(q)) {
    const stageDemo = demos.find((demo) => demo.resolve?.done || demo.resolve?.ready);
    if (stageDemo) return { demo: stageDemo, reason: "stage-question" };
  }
  return null;
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
  const match = matchQuery(caseData, query);
  const state = getCaseState(caseData);

  if (!match) {
    // 어느 상황을 묻는지 확신할 수 없으면 패킷을 만들지 않고 되묻는다.
    return {
      mode: "case_needs_disambiguation",
      query,
      matched_demo: null,
      state,
      candidates: (caseData.demo_queries ?? []).map((demo) => ({
        q: demo.q,
        action_packet: demo.resolve?.action_packet ?? null,
      })),
      note: "이 케이스가 답할 수 있는 상황과 질문이 충분히 가깝지 않습니다. 후보 중 하나를 골라 다시 물어보세요.",
      execution_allowed: false,
    };
  }

  const matched = match.demo;

  if (matched?.resolve && !matched.resolve.action_packet && (matched.resolve.done || matched.resolve.ready)) {
    return {
      mode: "case_state",
      query,
      matched_demo: matched?.q ?? null,
      match_reason: match.reason,
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
    match_reason: match.reason,
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
