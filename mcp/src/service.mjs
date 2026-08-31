import { createHash } from "node:crypto";

const PUBLIC_SITE_BASE_URL = "https://hosungseo.github.io/korea100/model";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_LEGAL_CHECK_AGE_DAYS = 30;
const WORK_EVENT_TYPES = new Set([
  "approval.completed",
  "approval.rejected",
  "supplement.requested",
  "document.received",
  "manual.confirmed",
]);
const SENSITIVE_METADATA_PATTERNS = [
  /\b\d{6}-?[1-4]\d{6}\b/u,
  /\b01[016789][-. ]?\d{3,4}[-. ]?\d{4}\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /\b\d{13,}\b/u,
];

export class ProcedureQueryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProcedureQueryError";
    this.code = code;
    this.details = details;
  }
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
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

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function dateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function parseCheckedDate(value) {
  if (typeof value !== "string") return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sourceId(source) {
  if (source?.sourceType === "admin-rule") return source.adminRuleId ?? source.adminRuleSerial ?? null;
  if (source?.sourceType === "treaty") return source.treatyId ?? source.treatyNumber ?? null;
  return source?.lawId ?? source?.mst ?? null;
}

function sourceForLaw(institution, lawName) {
  const law = normalize(lawName);
  return (institution.verification?.sources ?? []).find((source) =>
    [source.law, source.officialName].some((candidate) => normalize(candidate) === law),
  );
}

function legalReferences(institution, node) {
  return (node.legal_basis ?? []).map((basis) => {
    const source = sourceForLaw(institution, basis.law);
    return compact({
      law: basis.law,
      article: basis.article,
      description: basis.text,
      source_type: source?.sourceType ?? null,
      source_id: sourceId(source),
      official_name: source?.officialName ?? source?.law ?? basis.law,
      official_url: source?.officialUrl ?? null,
    });
  });
}

function legalCheckFreshness(institution, policy) {
  const check = institution.process.agent_readiness.last_live_check;
  const checkedAt = parseCheckedDate(check.checked_at);
  if (!checkedAt) {
    return {
      status: "unknown",
      age_days: null,
      max_age_days: policy.maxLegalCheckAgeDays,
      expires_on: null,
    };
  }

  const now = policy.now();
  const ageDays = Math.max(0, Math.floor((now.getTime() - checkedAt.getTime()) / DAY_MS));
  const expiresOn = addDays(checkedAt, policy.maxLegalCheckAgeDays);
  return {
    status: ageDays <= policy.maxLegalCheckAgeDays ? "current" : "stale",
    age_days: ageDays,
    max_age_days: policy.maxLegalCheckAgeDays,
    expires_on: dateOnly(expiresOn),
  };
}

function verificationSummary(institution, policy) {
  const readiness = institution.process.agent_readiness;
  const check = readiness.last_live_check;
  return {
    readiness_level: readiness.level,
    mode: readiness.mode,
    assessed_at: readiness.assessed_at,
    legal_check: {
      method: check.method,
      status: check.status,
      checked_at: check.checked_at,
      verified_references: check.verified_references,
      article_references: check.article_references,
      citation_fingerprint: check.citation_fingerprint,
      freshness: legalCheckFreshness(institution, policy),
    },
  };
}

function safetyBoundary() {
  return {
    read_only: true,
    decision_support_only: true,
    human_confirmation_required: true,
    automatic_submission_or_approval: false,
    notice: "다음 행동 후보를 구조화한 참고 정보입니다. 실제 결재·접수·발송 전 담당자가 사건 사실과 최신 원문을 확인해야 합니다.",
  };
}

function procedureEnvelope(institution, policy) {
  return {
    slug: institution.slug,
    name: institution.name,
    type: institution.type,
    one_liner: institution.oneLiner,
    data_as_of: institution.asOfDate,
    page_url: `${PUBLIC_SITE_BASE_URL}/${institution.slug}/`,
    verification: verificationSummary(institution, policy),
    safety: safetyBoundary(),
  };
}

function stepSummary(node, outgoingCount = 0) {
  return {
    id: node.id,
    name: node.name,
    actor: node.actor,
    lane: node.lane,
    stage: node.stage,
    type: node.type,
    action: node.action ?? null,
    obligation: node.agent.obligation,
    automation_level: node.agent.automation_level,
    required_inputs: node.agent.resolved_input_documents,
    completion_evidence: node.agent.completion_evidence,
    deadline_rule: node.agent.deadline_rule,
    outgoing_transition_count: outgoingCount,
  };
}

function searchableText(institution) {
  const nodes = institution.process.nodes;
  const sources = institution.verification?.sources ?? [];
  return normalize([
    institution.slug,
    institution.name,
    institution.oneLiner,
    institution.type,
    ...(institution.process.lanes ?? []),
    ...nodes.flatMap((node) => [
      node.id,
      node.name,
      node.actor,
      node.action,
      ...(node.input_documents ?? []),
      ...(node.output_documents ?? []),
      ...(node.legal_basis ?? []).flatMap((basis) => [basis.law, basis.article]),
    ]),
    ...sources.flatMap((source) => [source.law, source.officialName]),
  ].join(" "));
}

function searchScore(institution, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 1;
  const terms = normalizedQuery.split(" ").filter(Boolean);
  const haystack = searchableText(institution);
  if (!terms.every((term) => haystack.includes(term))) return 0;

  const name = normalize(institution.name);
  const slug = normalize(institution.slug);
  if (normalizedQuery === name || normalizedQuery === slug) return 100;
  if (name.includes(normalizedQuery)) return 60;
  if (normalize(institution.oneLiner).includes(normalizedQuery)) return 40;
  if (institution.process.nodes.some((node) => normalize(node.name).includes(normalizedQuery))) return 30;
  return 10;
}

function conditionMatchScore(edge, target, condition) {
  const query = normalize(condition);
  if (!query) return 0;
  const candidates = [edge.label, edge.agent_transition?.condition, target?.name]
    .map(normalize)
    .filter(Boolean);
  if (candidates.some((candidate) => candidate === query)) return 100;
  if (candidates.some((candidate) => candidate.includes(query) || query.includes(candidate))) return 50;
  return 0;
}

function assertSafeWorkEvent(event) {
  if (event.metadata_only !== true) {
    throw new ProcedureQueryError(
      "metadata_only_assertion_required",
      "전자결재 이벤트는 문서 본문이나 첨부가 아닌 비식별 메타데이터만 허용합니다.",
    );
  }
  if (!WORK_EVENT_TYPES.has(event.event_type)) {
    throw new ProcedureQueryError("unsupported_event_type", "지원하지 않는 전자결재 이벤트 유형입니다.", {
      event_type: event.event_type,
      allowed_event_types: [...WORK_EVENT_TYPES],
    });
  }
  if (![event.procedure_hint, event.step_hint, event.document_title].some((value) => normalize(value))) {
    throw new ProcedureQueryError(
      "event_context_required",
      "procedure_hint, step_hint, document_title 중 하나 이상이 필요합니다.",
    );
  }

  for (const [field, value] of Object.entries({
    source_system: event.source_system,
    procedure_hint: event.procedure_hint,
    step_hint: event.step_hint,
    document_title: event.document_title,
    actor: event.actor,
    condition: event.condition,
  })) {
    if (typeof value !== "string") continue;
    if (SENSITIVE_METADATA_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new ProcedureQueryError(
        "sensitive_metadata_rejected",
        "개인정보로 보이는 값이 있어 이벤트 처리를 중단했습니다.",
        { field },
      );
    }
  }
}

function eventCandidateScore(institution, node, event) {
  let score = 0;
  const reasons = [];
  let exactProcedure = false;
  let exactStep = false;
  let exactDocument = false;

  const procedureHint = normalize(event.procedure_hint);
  if (procedureHint) {
    const procedureKeys = [normalize(institution.slug), normalize(institution.name)];
    if (procedureKeys.includes(procedureHint)) {
      score += 60;
      exactProcedure = true;
      reasons.push("제도 식별자 정확히 일치");
    } else if (procedureKeys.some((value) => value.includes(procedureHint) || procedureHint.includes(value))) {
      score += 30;
      reasons.push("제도 식별자 부분 일치");
    }
  }

  const stepHint = normalize(event.step_hint);
  if (stepHint) {
    const stepKeys = [normalize(node.id), normalize(node.name)];
    if (stepKeys.includes(stepHint)) {
      score += 60;
      exactStep = true;
      reasons.push("단계 식별자 정확히 일치");
    } else if (stepKeys.some((value) => value.includes(stepHint) || stepHint.includes(value))) {
      score += 30;
      reasons.push("단계 식별자 부분 일치");
    }
  }

  const documentTitle = normalize(event.document_title);
  if (documentTitle) {
    const documentKeys = unique([
      node.name,
      ...(node.input_documents ?? []),
      ...(node.output_documents ?? []),
    ]).map(normalize);
    if (documentKeys.includes(documentTitle)) {
      score += 45;
      exactDocument = true;
      reasons.push("문서 제목 정확히 일치");
    } else if (documentKeys.some((value) => value.includes(documentTitle) || documentTitle.includes(value))) {
      score += 20;
      reasons.push("문서 제목 부분 일치");
    }
  }

  const actor = normalize(event.actor);
  const nodeActor = normalize(node.actor);
  if (actor && actor === nodeActor) {
    score += 15;
    reasons.push("행위자 정확히 일치");
  } else if (actor && (nodeActor.includes(actor) || actor.includes(nodeActor))) {
    score += 8;
    reasons.push("행위자 부분 일치");
  }

  const eventKeywords = {
    "approval.completed": /(결재|승인|결정|확정)/u,
    "approval.rejected": /(반려|불승인|기각|보완)/u,
    "supplement.requested": /(보완|재검토|소명)/u,
    "document.received": /(수령|접수|제출)/u,
    "manual.confirmed": /./u,
  };
  if (eventKeywords[event.event_type].test(node.name)) {
    score += event.event_type === "manual.confirmed" ? 1 : 5;
    reasons.push("이벤트 유형과 단계 의미 일치");
  }

  const condition = normalize(event.condition);
  if (condition) {
    const conditionMatches = institution.process.edges
      .filter((edge) => edge.source === node.id)
      .some((edge) => conditionMatchScore(edge, institution.process.nodes.find((item) => item.id === edge.target), condition) > 0);
    if (conditionMatches) {
      score += 10;
      reasons.push("후속 분기 조건 일치");
    }
  }

  return {
    score,
    reasons,
    exact_mapping: exactProcedure && (exactStep || exactDocument),
  };
}

export class AdministrativeProcedureService {
  constructor(institutions, {
    now = () => new Date(),
    maxLegalCheckAgeDays = DEFAULT_MAX_LEGAL_CHECK_AGE_DAYS,
  } = {}) {
    if (typeof now !== "function") throw new TypeError("now는 Date를 반환하는 함수여야 합니다.");
    if (!Number.isInteger(maxLegalCheckAgeDays) || maxLegalCheckAgeDays < 0) {
      throw new TypeError("maxLegalCheckAgeDays는 0 이상의 정수여야 합니다.");
    }
    this.institutions = [...institutions];
    this.bySlug = new Map(this.institutions.map((institution) => [institution.slug, institution]));
    this.policy = { now, maxLegalCheckAgeDays };
  }

  getStatus() {
    const generatedAt = this.policy.now();
    return {
      service: "korea100-administrative-procedure",
      generated_at: generatedAt.toISOString(),
      transport_policy: "read-only",
      procedure_count: this.institutions.length,
      legal_check_policy: {
        max_age_days: this.policy.maxLegalCheckAgeDays,
        stale_response_behavior: "다음 행동 자동 선택 중단, 후보와 공식 원문만 반환",
      },
      procedures: this.institutions.map((institution) => ({
        slug: institution.slug,
        name: institution.name,
        readiness_level: institution.process.agent_readiness.level,
        legal_check: verificationSummary(institution, this.policy).legal_check,
      })),
      safety: safetyBoundary(),
    };
  }

  listProcedureResources() {
    return this.institutions.map((institution) => ({
      uri: `korea100://procedures/${institution.slug}`,
      name: institution.name,
      description: institution.oneLiner,
      mimeType: "application/json",
    }));
  }

  searchProcedures({ query = "", actor = "", limit = 10 } = {}) {
    const actorQuery = normalize(actor);
    const matches = this.institutions
      .map((institution) => ({ institution, score: searchScore(institution, query) }))
      .filter(({ institution, score }) => {
        if (score === 0) return false;
        if (!actorQuery) return true;
        return institution.process.nodes.some((node) => normalize(node.actor).includes(actorQuery));
      })
      .sort((a, b) => b.score - a.score || a.institution.priority - b.institution.priority)
      .slice(0, limit)
      .map(({ institution }) => {
        const incomingTargets = new Set(institution.process.edges.map((edge) => edge.target));
        const queryText = normalize(query);
        return {
          ...procedureEnvelope(institution, this.policy),
          actors: unique(institution.process.nodes.map((node) => node.actor)),
          laws: unique((institution.verification?.sources ?? []).map((source) => source.officialName ?? source.law)),
          node_count: institution.process.nodes.length,
          transition_count: institution.process.edges.length,
          entry_steps: institution.process.nodes
            .filter((node) => !incomingTargets.has(node.id))
            .map((node) => ({ id: node.id, name: node.name, actor: node.actor })),
          matched_steps: queryText
            ? institution.process.nodes
              .filter((node) => normalize(`${node.name} ${node.action ?? ""}`).includes(queryText))
              .slice(0, 5)
              .map((node) => ({ id: node.id, name: node.name, actor: node.actor }))
            : [],
        };
      });

    return {
      query: query || null,
      actor: actor || null,
      available_count: this.institutions.length,
      match_count: matches.length,
      procedures: matches,
    };
  }

  getProcedureMap(slug) {
    const institution = this.#getInstitution(slug);
    const incomingTargets = new Set(institution.process.edges.map((edge) => edge.target));
    const outgoingSources = new Set(institution.process.edges.map((edge) => edge.source));
    const outgoingCounts = new Map();
    for (const edge of institution.process.edges) {
      outgoingCounts.set(edge.source, (outgoingCounts.get(edge.source) ?? 0) + 1);
    }

    return {
      procedure: procedureEnvelope(institution, this.policy),
      lanes: institution.process.lanes,
      stages: institution.process.stages,
      entry_step_ids: institution.process.nodes.filter((node) => !incomingTargets.has(node.id)).map((node) => node.id),
      terminal_step_ids: institution.process.nodes.filter((node) => !outgoingSources.has(node.id)).map((node) => node.id),
      steps: institution.process.nodes.map((node) => stepSummary(node, outgoingCounts.get(node.id) ?? 0)),
      transitions: institution.process.edges.map((edge) => ({
        id: edge.id,
        from_step_id: edge.source,
        to_step_id: edge.target,
        type: edge.type,
        condition: edge.agent_transition.condition,
        transition_type: edge.agent_transition.transition_type,
        handoff: edge.agent_transition.handoff,
        human_confirmation_required: true,
      })),
    };
  }

  getStepRequirements(slug, stepSelector) {
    const institution = this.#getInstitution(slug);
    const node = this.#resolveStep(institution, stepSelector);
    const incoming = institution.process.edges.filter((edge) => edge.target === node.id);
    const outgoing = institution.process.edges.filter((edge) => edge.source === node.id);
    const nodesById = new Map(institution.process.nodes.map((item) => [item.id, item]));

    return {
      procedure: procedureEnvelope(institution, this.policy),
      step: {
        ...stepSummary(node, outgoing.length),
        trigger_event: node.agent.trigger_event,
        trigger_condition: node.agent.trigger_condition,
        completion_condition: node.agent.completion_condition,
        basis_status: node.agent.basis_status,
        human_confirmation_required: true,
        legal_bases: legalReferences(institution, node),
      },
      incoming_handoffs: incoming.map((edge) => ({
        transition_id: edge.id,
        from_step: {
          id: edge.source,
          name: nodesById.get(edge.source)?.name ?? edge.source,
          actor: nodesById.get(edge.source)?.actor ?? edge.agent_transition.handoff.from_actor,
        },
        condition: edge.agent_transition.condition,
        documents: edge.agent_transition.handoff.documents,
      })),
      outgoing_options: outgoing.map((edge) => ({
        transition_id: edge.id,
        to_step: {
          id: edge.target,
          name: nodesById.get(edge.target)?.name ?? edge.target,
          actor: nodesById.get(edge.target)?.actor ?? edge.agent_transition.handoff.to_actor,
        },
        condition: edge.agent_transition.condition,
        transition_type: edge.agent_transition.transition_type,
        documents: edge.agent_transition.handoff.documents,
      })),
    };
  }

  getNextActions(slug, currentStepSelector, { condition = "" } = {}) {
    const institution = this.#getInstitution(slug);
    const current = this.#resolveStep(institution, currentStepSelector);
    const outgoing = institution.process.edges.filter((edge) => edge.source === current.id);
    const nodesById = new Map(institution.process.nodes.map((node) => [node.id, node]));
    const procedure = procedureEnvelope(institution, this.policy);
    const generatedAt = this.policy.now();
    const decisionId = `decision_${sha256({
      slug: institution.slug,
      current_step: current.id,
      condition: normalize(condition),
      citation_fingerprint: procedure.verification.legal_check.citation_fingerprint,
    }).slice(0, 20)}`;

    if (outgoing.length === 0) {
      return {
        procedure,
        current_step: stepSummary(current, 0),
        current_step_completion: {
          completion_condition: current.agent.completion_condition,
          completion_evidence: current.agent.completion_evidence,
        },
        terminal: true,
        selection: {
          status: "terminal",
          requested_condition: condition || null,
          decision_required: false,
          matched_transition_id: null,
        },
        decision_trace: {
          decision_id: decisionId,
          generated_at: generatedAt.toISOString(),
          source_fingerprint: procedure.verification.legal_check.citation_fingerprint,
        },
        selected_actions: [],
        available_actions: [],
      };
    }

    const ranked = condition
      ? outgoing
        .map((edge) => ({ edge, score: conditionMatchScore(edge, nodesById.get(edge.target), condition) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
      : [];
    const bestScore = ranked[0]?.score ?? 0;
    const bestMatches = ranked.filter((item) => item.score === bestScore);

    let status;
    let selectedEdges = [];
    if (condition && bestMatches.length === 1) {
      status = "condition-matched";
      selectedEdges = [bestMatches[0].edge];
    } else if (condition && bestMatches.length === 0) {
      status = "condition-not-matched";
    } else if (condition && bestMatches.length > 1) {
      status = "condition-ambiguous";
    } else if (outgoing.length === 1) {
      status = "single-path";
      selectedEdges = outgoing;
    } else {
      status = "decision-required";
    }

    if (procedure.verification.legal_check.freshness.status !== "current") {
      status = "verification-required";
      selectedEdges = [];
    }

    // 참고용 노드는 근거가 약해 격리된 단계다. 그 단계에서 출발하거나
    // 그 단계로 들어가는 다음 행동은 계산하지 않는다. R2 등급이 참고용 노드를
    // 허용하는 대신 이 거부가 성립해야 한다.
    const referenceOnly = new Set(institution.process.agent_readiness?.reference_only_node_ids ?? []);
    const referenceOnlyReasons = institution.process.agent_readiness?.reference_only_reasons ?? {};
    if (referenceOnly.has(current.id)) {
      status = "reference-only-step";
      selectedEdges = [];
    }
    const referenceOnlyActions = outgoing
      .filter((edge) => referenceOnly.has(edge.target))
      .map((edge) => ({
        transition_id: edge.id,
        next_step_id: edge.target,
        next_step_name: nodesById.get(edge.target)?.name ?? null,
        reasons: referenceOnlyReasons[edge.target] ?? [],
      }));
    if (referenceOnlyActions.length > 0) {
      selectedEdges = selectedEdges.filter((edge) => !referenceOnly.has(edge.target));
    }

    const formatAction = (edge) => {
      const target = nodesById.get(edge.target);
      return {
        transition: {
          id: edge.id,
          type: edge.type,
          condition: edge.agent_transition.condition,
          transition_type: edge.agent_transition.transition_type,
          handoff: edge.agent_transition.handoff,
          human_confirmation_required: true,
        },
        next_step: {
          ...stepSummary(target, institution.process.edges.filter((item) => item.source === target.id).length),
          trigger_condition: target.agent.trigger_condition,
          completion_condition: target.agent.completion_condition,
          legal_bases: legalReferences(institution, target),
          human_confirmation_required: true,
        },
      };
    };

    return {
      procedure,
      current_step: stepSummary(current, outgoing.length),
      current_step_completion: {
        completion_condition: current.agent.completion_condition,
        completion_evidence: current.agent.completion_evidence,
      },
      terminal: false,
      selection: {
        status,
        requested_condition: condition || null,
        decision_required: selectedEdges.length === 0,
        matched_transition_id: selectedEdges[0]?.id ?? null,
        guidance: status === "verification-required"
          ? "법제처 원문 대조 유효기간이 지나 다음 행동 선택을 중단했습니다. 원문을 다시 대조한 뒤 사용하세요."
          : status === "reference-only-step"
            ? "이 단계는 근거가 확인되지 않아 참고용으로 격리된 단계입니다. 다음 행동을 계산하지 않습니다."
            : selectedEdges.length === 0
              ? "분기 조건을 담당자가 확인한 뒤 조건 문구를 다시 지정해야 합니다. 임의로 경로를 선택하지 마세요."
              : "선택된 경로도 실제 결재·접수·발송 전에 담당자 확인이 필요합니다.",
      },
      reference_only: {
        current_step: referenceOnly.has(current.id),
        current_step_reasons: referenceOnlyReasons[current.id] ?? [],
        excluded_actions: referenceOnlyActions,
      },
      decision_trace: {
        decision_id: decisionId,
        generated_at: generatedAt.toISOString(),
        source_fingerprint: procedure.verification.legal_check.citation_fingerprint,
      },
      selected_actions: selectedEdges.map(formatAction),
      available_actions: outgoing.map(formatAction),
    };
  }

  resolveWorkEvent(event) {
    const normalizedEvent = {
      metadata_only: event.metadata_only,
      source_system: event.source_system?.trim() || "unspecified",
      event_type: event.event_type,
      procedure_hint: event.procedure_hint?.trim() || "",
      step_hint: event.step_hint?.trim() || "",
      document_title: event.document_title?.trim() || "",
      actor: event.actor?.trim() || "",
      condition: event.condition?.trim() || "",
    };
    assertSafeWorkEvent(normalizedEvent);

    const eventFingerprint = `event_${sha256({
      source_system: normalize(normalizedEvent.source_system),
      event_type: normalizedEvent.event_type,
      procedure_hint: normalize(normalizedEvent.procedure_hint),
      step_hint: normalize(normalizedEvent.step_hint),
      document_title: normalize(normalizedEvent.document_title),
      actor: normalize(normalizedEvent.actor),
      condition: normalize(normalizedEvent.condition),
    }).slice(0, 20)}`;

    const ranked = this.institutions
      .flatMap((institution) => institution.process.nodes.map((node) => {
        const scored = eventCandidateScore(institution, node, normalizedEvent);
        return { institution, node, ...scored };
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.institution.priority - b.institution.priority)
      .slice(0, 5);
    const topScore = ranked[0]?.score ?? 0;
    const topMatches = ranked.filter((candidate) => candidate.score === topScore);
    const resolved = topMatches.length === 1 && topMatches[0].exact_mapping ? topMatches[0] : null;

    const candidates = ranked.map((candidate) => ({
      procedure: {
        slug: candidate.institution.slug,
        name: candidate.institution.name,
      },
      step: {
        id: candidate.node.id,
        name: candidate.node.name,
        actor: candidate.node.actor,
        stage: candidate.node.stage,
      },
      score: candidate.score,
      confidence: Number(Math.min(1, candidate.score / 120).toFixed(2)),
      exact_mapping: candidate.exact_mapping,
      reasons: candidate.reasons,
    }));

    return {
      event: {
        source_system: normalizedEvent.source_system,
        event_type: normalizedEvent.event_type,
        metadata_only: true,
        event_fingerprint: eventFingerprint,
        persisted: false,
      },
      resolution: resolved
        ? {
          status: "resolved",
          mapping_required: false,
          procedure_slug: resolved.institution.slug,
          step_id: resolved.node.id,
          confidence: Number(Math.min(1, resolved.score / 120).toFixed(2)),
          suggested_mapping_key: `${normalize(normalizedEvent.source_system)}:${normalizedEvent.event_type}:${resolved.institution.slug}:${resolved.node.id}`,
        }
        : {
          status: "needs-mapping",
          mapping_required: true,
          procedure_slug: null,
          step_id: null,
          confidence: candidates[0]?.confidence ?? 0,
          guidance: "제도와 단계를 정확히 지정하거나 기관별 이벤트 매핑표에서 확인해야 합니다. 후보만으로 다음 행동을 실행하지 마세요.",
        },
      candidates,
      next_actions: resolved
        ? this.getNextActions(resolved.institution.slug, resolved.node.id, {
          condition: normalizedEvent.condition,
        })
        : null,
      safety: safetyBoundary(),
    };
  }

  createActionPacket(slug, currentStepSelector, { condition = "", eventFingerprint = null } = {}) {
    const normalizedEventFingerprint = typeof eventFingerprint === "string"
      ? eventFingerprint.trim() || null
      : eventFingerprint;
    if (normalizedEventFingerprint !== null && !/^event_[a-f0-9]{20}$/u.test(normalizedEventFingerprint)) {
      throw new ProcedureQueryError(
        "invalid_event_fingerprint",
        "event_fingerprint는 resolve_work_event가 반환한 비식별 지문이어야 합니다.",
      );
    }

    const next = this.getNextActions(slug, currentStepSelector, { condition });
    const currentRequirements = this.getStepRequirements(slug, currentStepSelector);
    const freshness = next.procedure.verification.legal_check.freshness;
    let status;
    if (next.terminal) status = "terminal";
    else if (next.selection.status === "verification-required") status = "blocked-verification-required";
    else if (next.selection.status === "reference-only-step") status = "blocked-reference-only";
    else if (next.selection.decision_required) status = "blocked-decision-required";
    else status = "ready-for-human-review";

    const blockingQuestions = [];
    if (status === "blocked-verification-required") {
      blockingQuestions.push("법제처 현행 원문을 다시 대조해 R2 신선도를 갱신했는가?");
    }
    if (status === "blocked-reference-only") {
      blockingQuestions.push(
        `이 단계는 참고용으로 격리되어 있다(${(next.reference_only?.current_step_reasons ?? []).join(", ") || "사유 미기재"}). `
        + "근거를 확인해 격리를 풀기 전에는 다음 행동을 계산하지 않는다.",
      );
    }
    for (const excluded of next.reference_only?.excluded_actions ?? []) {
      blockingQuestions.push(
        `${excluded.next_step_id} ${excluded.next_step_name}은 참고용으로 격리되어 후보에서 제외했다`
        + `(${excluded.reasons.join(", ") || "사유 미기재"}).`,
      );
    }
    if (status === "blocked-decision-required") {
      blockingQuestions.push(
        `다음 분기 중 어느 조건이 실제 사건에 해당하는가: ${next.available_actions
          .map((action) => action.transition.condition)
          .join(" / ")}`,
      );
    }

    const handoffPackages = next.selected_actions.map((action) => ({
      transition_id: action.transition.id,
      condition: action.transition.condition,
      from_actor: action.transition.handoff.from_actor,
      to_actor: action.transition.handoff.to_actor,
      documents: action.transition.handoff.documents,
      next_step: {
        id: action.next_step.id,
        name: action.next_step.name,
        action: action.next_step.action,
        deadline_rule: action.next_step.deadline_rule,
        completion_condition: action.next_step.completion_condition,
      },
    }));
    const sourceActions = next.selected_actions.length > 0
      ? next.selected_actions
      : next.available_actions;
    const officialSources = unique([
      ...currentRequirements.step.legal_bases.map((basis) => JSON.stringify({
        law: basis.law,
        article: basis.article,
        official_url: basis.official_url,
      })),
      ...sourceActions.flatMap((action) =>
        action.next_step.legal_bases.map((basis) => JSON.stringify({
          law: basis.law,
          article: basis.article,
          official_url: basis.official_url,
        })),
      ),
    ]).map((item) => JSON.parse(item));

    const checklist = [
      {
        id: "confirm-current-completion",
        required: true,
        instruction: next.current_step_completion.completion_condition,
        evidence: next.current_step_completion.completion_evidence,
      },
      ...handoffPackages.map((handoff) => ({
        id: `prepare-handoff-${handoff.transition_id}`,
        required: true,
        instruction: `${handoff.to_actor}에게 인계할 문서를 확인한다.`,
        evidence: handoff.documents,
      })),
      {
        id: "confirm-official-sources",
        required: true,
        instruction: "중요한 판단 전 법제처 공식 원문과 적용 사실을 담당자가 확인한다.",
        evidence: officialSources.map((source) => `${source.law} ${source.article}`),
      },
      {
        id: "final-human-confirmation",
        required: true,
        instruction: "실제 결재·접수·발송 전 권한 있는 담당자가 최종 확인한다.",
        evidence: [],
      },
    ];

    const packetId = `packet_${sha256({
      decision_id: next.decision_trace.decision_id,
      event_fingerprint: normalizedEventFingerprint,
      status,
      legal_check_freshness: freshness.status,
      selected_transition_ids: next.selected_actions.map((action) => action.transition.id),
    }).slice(0, 20)}`;

    return {
      packet_id: packetId,
      status,
      generated_at: next.decision_trace.generated_at,
      expires_on: freshness.expires_on,
      execution_allowed: false,
      human_confirmation_required: true,
      procedure: {
        slug: next.procedure.slug,
        name: next.procedure.name,
        page_url: next.procedure.page_url,
      },
      current_step: next.current_step,
      selection: next.selection,
      handoff_packages: handoffPackages,
      available_options: next.available_actions.map((action) => ({
        transition_id: action.transition.id,
        condition: action.transition.condition,
        next_step_id: action.next_step.id,
        next_step_name: action.next_step.name,
      })),
      checklist,
      blocking_questions: blockingQuestions,
      official_sources: officialSources,
      audit: {
        event_fingerprint: normalizedEventFingerprint,
        decision_id: next.decision_trace.decision_id,
        source_fingerprint: next.decision_trace.source_fingerprint,
        legal_check_freshness: freshness,
      },
      safety: safetyBoundary(),
    };
  }

  #getInstitution(slug) {
    const normalizedSlug = normalize(slug);
    const institution = this.institutions.find((item) => normalize(item.slug) === normalizedSlug);
    if (institution) return institution;
    throw new ProcedureQueryError("procedure_not_found", "MCP 공개 대상에서 제도를 찾지 못했습니다.", {
      requested_slug: slug,
      available_slugs: [...this.bySlug.keys()],
    });
  }

  #resolveStep(institution, selector) {
    const query = normalize(selector);
    if (!query) {
      throw new ProcedureQueryError("step_required", "현재 단계의 ID 또는 이름이 필요합니다.", {
        slug: institution.slug,
      });
    }

    const exactId = institution.process.nodes.find((node) => normalize(node.id) === query);
    if (exactId) return exactId;
    const exactName = institution.process.nodes.find((node) => normalize(node.name) === query);
    if (exactName) return exactName;

    const partial = institution.process.nodes.filter((node) =>
      normalize(`${node.name} ${node.action ?? ""}`).includes(query),
    );
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) {
      throw new ProcedureQueryError("step_ambiguous", "현재 단계와 일치하는 후보가 여러 개입니다.", {
        slug: institution.slug,
        requested_step: selector,
        candidates: partial.map((node) => ({ id: node.id, name: node.name, actor: node.actor })),
      });
    }

    throw new ProcedureQueryError("step_not_found", "현재 단계를 찾지 못했습니다.", {
      slug: institution.slug,
      requested_step: selector,
      available_steps: institution.process.nodes.map((node) => ({ id: node.id, name: node.name, actor: node.actor })),
    });
  }
}
