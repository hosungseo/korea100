// 케이스 상태 갱신 경로 — PRD M1.
//
// 지금까지 케이스 상태는 스냅샷이었다. 사건이 진행돼도 갱신할 방법이 없어
// 저작 시점에 박제됐다. 이 모듈이 "무엇으로 바뀔 수 있는가"를 판정한다.
//
// 판정과 적용을 갈라 둔다. MCP는 판정만 부르고(읽기 전용), 파일에 쓰는 것은
// ontology/scripts/advance-case-state.mjs 뿐이다. applyTransition은 새 객체를
// 돌려줄 뿐 디스크를 건드리지 않는다 — 읽기 전용 보장이 관례가 아니라 구조다.

export class TransitionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "TransitionError";
    this.code = code;
    this.details = details;
  }
}

// 단계 상태 어휘. 케이스 9건에서 실제로 쓰인 8종에 종단값 not_applicable을 더했다.
// 적용 여부 미정(applicability_undetermined)이 "적용 안 함"으로 닫힐 자리가 없으면
// 그 분기는 영원히 열린 채로 남는다.
export const STEP_STATES = Object.freeze({
  pending: "선행 단계가 남아 아직 차례가 아님",
  ready: "선행이 끝나 착수할 수 있음",
  available: "ready의 기존 표기(별칭) — 새로 쓰지 않는다",
  in_progress: "착수해 진행 중",
  done: "완료",
  blocked: "외부 사유로 막힘",
  applicability_undetermined: "이 사건에 적용되는지 아직 정해지지 않음",
  not_applicable: "이 사건에는 적용되지 않는 것으로 확정",
  not_a_statutory_step: "법정 절차가 아님 — 관행·건의 등(종단)",
});

// ready와 available은 같은 뜻이다. 데이터에 남은 표기를 고쳐 쓰지 않고 여기서 흡수한다.
const READY_ALIASES = new Set(["ready", "available"]);
const normalizeReady = (state) => (READY_ALIASES.has(state) ? "ready" : state);

// 단계 전이표. "무엇이 무엇으로" 만 말하고, "지금 그래도 되는가"는 그래프가 따로 본다.
export const STEP_TRANSITIONS = Object.freeze({
  pending: ["ready", "applicability_undetermined", "not_a_statutory_step", "blocked"],
  ready: ["in_progress", "done", "blocked"],
  in_progress: ["done", "blocked"],
  blocked: ["ready", "in_progress"],
  applicability_undetermined: ["ready", "not_applicable"],
  done: ["in_progress"], // 루프 관계가 있을 때만 — 아래 그래프 판정이 다시 막는다
  not_applicable: [],
  not_a_statutory_step: [],
});

// 마일스톤 상태 어휘·전이. 사업 층은 오버레이가 정본이라 케이스에서 손으로
// 옮기는 값이 아니다. 그래도 path_undetermined가 풀리는 자리는 열어 둔다.
export const MILESTONE_TRANSITIONS = Object.freeze({
  pending: ["in_progress", "done", "path_undetermined"],
  path_undetermined: ["pending", "in_progress"],
  in_progress: ["done", "pending"],
  done: [],
});

// 앞으로 나아가는 전이. 이쪽은 근거 없이 통과시키지 않는다.
const ADVANCING = new Set(["ready", "in_progress", "done"]);

// 케이스에 이미 쓰인 근거 종류. none은 "근거 없음"의 정직한 표기라 남기되,
// 전진 전이에는 쓸 수 없다.
export const EVIDENCE_KINDS = Object.freeze([
  "official_plan",
  "user_asserted",
  "statutory_deadline",
  "proxy",
  "none",
]);

const isStepId = (id) => String(id).startsWith("step:");
const isMilestoneId = (id) => String(id).startsWith("milestone:");

/** 이 엔티티에 적용할 전이표. 단계·마일스톤 밖은 어휘를 닫지 않는다. */
export function tableFor(entityId) {
  if (isStepId(entityId)) return { table: STEP_TRANSITIONS, kind: "step", closed: true };
  if (isMilestoneId(entityId)) return { table: MILESTONE_TRANSITIONS, kind: "milestone", closed: true };
  // case:·doc:·item: 은 사건 서사라 케이스마다 어휘가 다르다. 닫힌 척하지 않는다.
  return { table: null, kind: entityId.split(":")[0] || "unknown", closed: false };
}

/** 현재 상태 항목. 없으면 null — 단계는 아래에서 pending으로 읽는다. */
export function currentStateEntry(caseData, entityId) {
  return (caseData.states ?? []).find((state) => state.entity_id === entityId) ?? null;
}

function currentStateValue(caseData, entityId) {
  const entry = currentStateEntry(caseData, entityId);
  if (entry) return normalizeReady(entry.state);
  // 상태가 안 적힌 단계는 아직 차례가 아닌 것으로 읽는다(파생 직후의 기본값).
  return isStepId(entityId) ? "pending" : null;
}

/** sequence 관계로 이 단계에 들어오는 선행 단계들. */
export function predecessors(caseData, entityId) {
  return (caseData.relations ?? [])
    .filter((relation) => relation.type === "sequence" && relation.to === entityId)
    .map((relation) => relation.from);
}

/** loop 관계로 이 단계에 되돌아오는 연결이 있는가 — 재개를 허용할 근거. */
export function hasLoopBack(caseData, entityId) {
  return (caseData.relations ?? []).some(
    (relation) => relation.type === "loop" && relation.to === entityId,
  );
}

// 선행이 끝났다고 볼 수 있는 상태들. 적용 안 함·법정 절차 아님도 길을 막지 않는다.
const SATISFIED = new Set(["done", "not_applicable", "not_a_statutory_step"]);

/** 그래프가 이 전이를 지금 허용하는가. 전이표와 별개의 두 번째 관문이다. */
function graphBlockers(caseData, entityId, from, to) {
  const blockers = [];
  if (to === "ready" && from === "pending") {
    for (const pred of predecessors(caseData, entityId)) {
      const state = currentStateValue(caseData, pred);
      if (!SATISFIED.has(state)) {
        blockers.push({
          code: "predecessor_not_satisfied",
          entity_id: pred,
          state,
          message: `선행 단계 ${pred}가 ${state ?? "상태 미기재"}입니다.`,
        });
      }
    }
  }
  if (from === "done" && to === "in_progress" && !hasLoopBack(caseData, entityId)) {
    blockers.push({
      code: "no_loop_relation",
      entity_id: entityId,
      message: "완료된 단계를 되돌리려면 이 단계로 돌아오는 loop 관계가 있어야 합니다.",
    });
  }
  return blockers;
}

/** 이 엔티티가 지금 갈 수 있는 곳. 막힌 곳도 사유와 함께 돌려준다. */
export function legalTransitions(caseData, entityId) {
  const { table, kind, closed } = tableFor(entityId);
  const from = currentStateValue(caseData, entityId);
  const entry = currentStateEntry(caseData, entityId);

  if (!closed) {
    return {
      entity_id: entityId,
      entity_kind: kind,
      from,
      closed_vocabulary: false,
      // 사건 서사 상태는 케이스마다 어휘가 다르다. 목록을 지어내지 않는다.
      transitions: [],
      note: "이 엔티티는 닫힌 상태 어휘가 없습니다. 전이 대상은 저작자가 정하고, 근거만 검사합니다.",
      state_recorded: Boolean(entry),
    };
  }

  const targets = table[from] ?? [];
  return {
    entity_id: entityId,
    entity_kind: kind,
    from,
    closed_vocabulary: true,
    state_recorded: Boolean(entry),
    transitions: targets.map((to) => {
      const blockers = graphBlockers(caseData, entityId, from, to);
      return {
        to,
        meaning: kind === "step" ? STEP_STATES[to] ?? null : null,
        allowed: blockers.length === 0,
        blockers,
        evidence_required: ADVANCING.has(to),
      };
    }),
    terminal: targets.length === 0,
  };
}

// 전자결재 이벤트가 어느 전이를 뜻하는가. resolve_work_event는 (제도, 단계)까지만
// 풀고 거기서 끊겼다 — "그래서 케이스 장부에 무엇을 적나"가 사람 머릿속에만 있었다.
//
// 이 표는 단정하지 않는다. 반려·보완처럼 그래프를 봐야 뜻이 갈리는 이벤트는
// 후보를 여럿 내고 왜 그런지를 붙인다. 하나로 좁히는 것은 사람 몫이다.
const EVENT_INTENT = Object.freeze({
  "approval.completed": {
    label: "결재 완료",
    targets: ["done"],
    why: "결재가 끝났으므로 그 단계는 완료로 읽는다.",
    cascade: true,
  },
  "document.received": {
    label: "문서 접수",
    // 도달했다는 사실이 착수를 뜻하는지 진행을 뜻하는지는 이벤트만으로 못 가른다.
    targets: ["ready", "in_progress"],
    why: "문서가 도달했다. 착수 가능해진 것인지 이미 진행 중인지는 이벤트만으로 갈리지 않는다.",
    cascade: false,
  },
  "approval.rejected": {
    label: "반려",
    targets: ["blocked", "in_progress"],
    why: "반려는 되돌아갈 자리가 있으면 재개이고, 없으면 막힘이다. 그래프가 가른다.",
    cascade: false,
    prefer_loop: true,
  },
  "supplement.requested": {
    label: "보완 요구",
    targets: ["in_progress", "blocked"],
    why: "보완 요구는 그 단계를 다시 손보라는 뜻이거나, 상대 회신을 기다리는 멈춤이다.",
    cascade: false,
    prefer_loop: true,
  },
  "manual.confirmed": {
    label: "사람이 직접 확인",
    targets: null, // 전이표가 허용하는 전부
    why: "사람이 확인한 사실이라 이벤트가 방향을 정하지 않는다. 전이표가 허용하는 것을 모두 보인다.",
    cascade: false,
  },
});

export const WORK_EVENT_TYPES = Object.freeze(Object.keys(EVENT_INTENT));

/** X가 done이 되면 그 다음으로 열리는 단계들. 가정 위의 계산이라 제안일 뿐이다. */
function cascadeAfterDone(caseData, entityId) {
  const asIf = {
    ...caseData,
    states: [
      ...(caseData.states ?? []).filter((state) => state.entity_id !== entityId),
      { id: "__asif", entity_id: entityId, state: "done", as_of: caseData.as_of, evidence: { kind: "proxy", note: "가정" } },
    ],
  };
  const opened = [];
  for (const relation of caseData.relations ?? []) {
    if (relation.type !== "sequence" || relation.from !== entityId) continue;
    const target = relation.to;
    if (currentStateValue(caseData, target) !== "pending") continue;
    const blockers = graphBlockers(asIf, target, "pending", "ready");
    if (blockers.length === 0) opened.push({ entity_id: target, to: "ready" });
  }
  return opened;
}

/**
 * 이벤트 하나를 전이 후보로 옮긴다. 적용하지 않고 제안만 한다.
 * 이벤트가 무엇을 뜻하는지 확실하지 않으면 좁히지 않고 후보를 그대로 둔다.
 */
export function proposeTransitionsForEvent(caseData, { event_type: eventType, entity_id: entityId }) {
  const intent = EVENT_INTENT[eventType];
  if (!intent) {
    return {
      status: "unknown_event_type",
      event_type: eventType ?? null,
      known_event_types: WORK_EVENT_TYPES,
      proposals: [],
    };
  }

  const options = legalTransitions(caseData, entityId);
  if (!options.closed_vocabulary) {
    return {
      status: "open_vocabulary",
      event_type: eventType,
      entity_id: entityId,
      from: options.from,
      note: `${entityId}는 닫힌 상태 어휘가 없어 이벤트로 전이를 좁힐 수 없습니다. 저작자가 직접 정합니다.`,
      proposals: [],
    };
  }

  const allowedNow = new Map(options.transitions.map((transition) => [transition.to, transition]));
  const wanted = intent.targets ?? [...allowedNow.keys()];
  const hasLoop = hasLoopBack(caseData, entityId);

  const proposals = wanted
    .filter((to) => allowedNow.has(to))
    .map((to) => {
      const transition = allowedNow.get(to);
      // 반려·보완은 되돌아갈 자리가 있느냐가 뜻을 가른다. 후보마다 그 사실이
      // 자기에게 유리한지 불리한지를 적는다 — 같은 문장을 양쪽에 붙이면 못 고른다.
      let loopNote = null;
      if (intent.prefer_loop) {
        if (to === "in_progress") {
          loopNote = hasLoop
            ? "이 단계로 돌아오는 loop 관계가 있어 재개로 읽을 근거가 있습니다."
            : "돌아오는 loop 관계가 없습니다. 재개로 적으려면 그 근거를 사람이 대야 합니다.";
        } else if (to === "blocked") {
          loopNote = hasLoop
            ? "돌아오는 loop 관계가 있으므로 재개가 아니라 막힘이라면 그 사유를 적으세요."
            : "돌아오는 loop 관계가 없어 막힘으로 읽는 편이 그래프와 맞습니다.";
        }
      }
      return {
        to,
        meaning: STEP_STATES[to] ?? null,
        allowed: transition.allowed,
        blockers: transition.blockers,
        evidence_required: transition.evidence_required,
        ...(loopNote ? { loop_note: loopNote } : {}),
      };
    });

  return {
    status: proposals.length === 0 ? "no_legal_transition" : (proposals.length === 1 ? "single_candidate" : "needs_human_choice"),
    event_type: eventType,
    event_label: intent.label,
    entity_id: entityId,
    from: options.from,
    why: intent.why,
    proposals,
    // 결재 완료는 그 다음 문을 여는데, 그것도 제안이다. 자동으로 적지 않는다.
    would_open: intent.cascade && proposals.some((p) => p.to === "done" && p.allowed)
      ? cascadeAfterDone(caseData, entityId)
      : [],
    execution_allowed: false,
    human_confirmation_required: true,
    apply_with: "ontology/scripts/advance-case-state.mjs",
  };
}

/** 케이스 전체에서 지금 움직일 수 있는 것들. 사람이 뭘 갱신할지 고를 때 쓴다. */
export function movableEntities(caseData) {
  const ids = new Set([
    ...(caseData.states ?? []).map((state) => state.entity_id),
    ...(caseData.entities ?? []).filter((entity) => isStepId(entity.id) || isMilestoneId(entity.id)).map((e) => e.id),
  ]);
  const out = [];
  for (const id of ids) {
    const result = legalTransitions(caseData, id);
    if (!result.closed_vocabulary) continue;
    const open = result.transitions.filter((transition) => transition.allowed);
    if (open.length) out.push({ entity_id: id, from: result.from, can_become: open.map((t) => t.to) });
  }
  return out.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

function validateEvidence(evidence, to) {
  const reasons = [];
  if (!evidence || typeof evidence !== "object") {
    reasons.push({ code: "evidence_missing", message: "근거(evidence)가 없습니다." });
    return reasons;
  }
  if (!EVIDENCE_KINDS.includes(evidence.kind)) {
    reasons.push({
      code: "evidence_kind_unknown",
      message: `근거 종류가 ${EVIDENCE_KINDS.join("·")} 중 하나여야 합니다.`,
      got: evidence.kind ?? null,
    });
  }
  if (ADVANCING.has(to) && evidence.kind === "none") {
    reasons.push({
      code: "evidence_none_on_advance",
      message: "앞으로 나아가는 전이는 근거 없이 기록할 수 없습니다.",
    });
  }
  if (!String(evidence.note ?? "").trim()) {
    reasons.push({ code: "evidence_note_missing", message: "무엇을 보고 그렇게 판단했는지 note에 적어야 합니다." });
  }
  return reasons;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * 전이 하나를 검사한다. 통과 여부와 사유를 함께 돌려주고 예외는 던지지 않는다 —
 * MCP가 "왜 안 되는지"를 사람에게 보여줘야 하기 때문이다.
 */
export function validateTransition(caseData, input) {
  const { entity_id: entityId, to, evidence, at } = input ?? {};
  const reasons = [];

  if (!entityId) reasons.push({ code: "entity_id_missing", message: "entity_id가 필요합니다." });
  if (!to) reasons.push({ code: "target_missing", message: "바꿀 상태(to)가 필요합니다." });
  if (at !== undefined && !ISO_DATE.test(String(at))) {
    reasons.push({ code: "at_malformed", message: "at은 YYYY-MM-DD 형식이어야 합니다." });
  }
  if (reasons.length) return { ok: false, reasons };

  const known = (caseData.entities ?? []).some((entity) => entity.id === entityId)
    || (caseData.states ?? []).some((state) => state.entity_id === entityId);
  if (!known) {
    return {
      ok: false,
      reasons: [{ code: "entity_unknown", message: `케이스에 ${entityId}가 없습니다.`, entity_id: entityId }],
    };
  }

  const { table, closed } = tableFor(entityId);
  const from = currentStateValue(caseData, entityId);

  if (closed) {
    const targets = table[from] ?? [];
    if (!targets.includes(to)) {
      reasons.push({
        code: "transition_not_in_table",
        message: `${from ?? "상태 미기재"} → ${to}는 전이표에 없습니다.`,
        allowed_from_here: targets,
      });
    } else {
      reasons.push(...graphBlockers(caseData, entityId, from, to));
    }
  } else if (to === from) {
    reasons.push({ code: "no_change", message: "현재 상태와 같습니다." });
  }

  reasons.push(...validateEvidence(evidence, to));
  return { ok: reasons.length === 0, reasons, from, to, entity_id: entityId, closed_vocabulary: closed };
}

function stateEntryId(caseData, entityId) {
  const base = `S-${entityId.replace(/^[a-z]+:/u, "").replace(/[^A-Za-z0-9]+/gu, "-")}`;
  const taken = new Set((caseData.states ?? []).map((state) => state.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * 전이를 적용한 새 케이스를 돌려준다. 원본을 바꾸지 않고 디스크도 건드리지 않는다.
 * 검사에 걸리면 던진다 — 조용히 통과시키면 장부가 거짓말을 하게 된다.
 */
export function applyTransition(caseData, input) {
  const verdict = validateTransition(caseData, input);
  if (!verdict.ok) {
    throw new TransitionError("transition_rejected", "전이가 검사를 통과하지 못했습니다.", {
      entity_id: input?.entity_id ?? null,
      to: input?.to ?? null,
      reasons: verdict.reasons,
    });
  }

  const { entity_id: entityId, to, evidence, at, actor = null } = input;
  const stamp = at ?? caseData.as_of;
  const existing = currentStateEntry(caseData, entityId);
  const nextEvidence = { ...evidence, recorded_at: stamp };

  const states = existing
    ? (caseData.states ?? []).map((state) => (
        state.entity_id === entityId ? { ...state, state: to, as_of: stamp, evidence: nextEvidence } : state
      ))
    : [...(caseData.states ?? []), {
        id: stateEntryId(caseData, entityId),
        entity_id: entityId,
        state: to,
        as_of: stamp,
        evidence: nextEvidence,
      }];

  // 장부는 덮어쓰기만 하면 과거를 잃는다. 무엇이 언제 왜 바뀌었는지 남긴다.
  const log = [...(caseData.state_log ?? []), {
    seq: (caseData.state_log?.length ?? 0) + 1,
    at: stamp,
    entity_id: entityId,
    from: verdict.from,
    to,
    actor,
    evidence: nextEvidence,
  }];

  return {
    ...caseData,
    as_of: stamp > (caseData.as_of ?? "") ? stamp : caseData.as_of,
    states,
    state_log: log,
  };
}
