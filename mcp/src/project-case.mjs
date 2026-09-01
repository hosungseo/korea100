/**
 * 프로젝트 케이스 그래프 계산.
 *
 * 제도 케이스는 "이 사건이 어느 단계인가"를 묻는다. 프로젝트 케이스는
 * "어느 마일스톤이 지금 열려 있고, 닫힌 것은 무엇 때문에 닫혔는가"를 묻는다.
 * 답은 아티팩트 의존 그래프에서 결정적으로 나온다. 추정하지 않는다.
 *
 * 읽기 전용. 실행 권한 없음.
 */

const DONE_STATES = new Set(["done", "completed"]);
const OPEN_STATES = new Set(["in_progress", "ready", "available"]);

export class ProjectCaseError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProjectCaseError";
    this.code = code;
    this.details = details;
  }
}

export function isProjectCase(caseData) {
  return caseData?.case_kind === "project";
}

function assertProjectCase(caseData) {
  if (!isProjectCase(caseData)) {
    throw new ProjectCaseError("not_a_project_case", "프로젝트 케이스가 아닙니다.", {
      case_kind: caseData?.case_kind ?? null,
    });
  }
}

export function projectGraph(caseData) {
  assertProjectCase(caseData);

  const milestones = new Map();
  const artifacts = new Map();
  const institutions = new Map();
  for (const entity of caseData.entities ?? []) {
    if (entity.id.startsWith("milestone:")) milestones.set(entity.id, entity);
    else if (entity.id.startsWith("artifact:")) artifacts.set(entity.id, entity);
    else if (entity.id.startsWith("institution:")) institutions.set(entity.id, entity);
  }

  const stateById = new Map((caseData.states ?? []).map((state) => [state.entity_id, state]));

  // 아티팩트를 만드는 마일스톤들
  const producersOf = new Map();
  for (const milestone of milestones.values()) {
    for (const artifactId of milestone.attrs?.produces ?? []) {
      const key = `artifact:${artifactId}`;
      const list = producersOf.get(key) ?? [];
      list.push(milestone.id);
      producersOf.set(key, list);
    }
  }

  const requirementsOf = new Map();
  for (const relation of caseData.relations ?? []) {
    if (relation.type !== "requires") continue;
    const list = requirementsOf.get(relation.from) ?? [];
    list.push(relation);
    requirementsOf.set(relation.from, list);
  }

  return { milestones, artifacts, institutions, stateById, producersOf, requirementsOf };
}

/** 아티팩트는 그것을 만드는 마일스톤이 하나라도 완료되면 생산된 것으로 본다. */
function artifactProduced(graph, artifactId) {
  const producers = graph.producersOf.get(artifactId) ?? [];
  const satisfiedBy = producers.filter((id) => DONE_STATES.has(graph.stateById.get(id)?.state));
  return { produced: satisfiedBy.length > 0, producers, satisfied_by: satisfiedBy };
}

/**
 * 마일스톤 하나의 개폐를 판정한다.
 * hard 의존만 차단으로 본다. soft는 경고로 남기고 막지 않는다.
 */
export function milestoneStatus(graph, milestoneId) {
  const milestone = graph.milestones.get(milestoneId);
  if (!milestone) {
    throw new ProjectCaseError("milestone_not_found", "마일스톤을 찾지 못했습니다.", { milestoneId });
  }
  const state = graph.stateById.get(milestoneId)?.state ?? "unknown";
  const requirements = graph.requirementsOf.get(milestoneId) ?? [];

  const blockedBy = [];
  const softPending = [];
  for (const requirement of requirements) {
    const { produced, producers } = artifactProduced(graph, requirement.to);
    if (produced) continue;
    const entry = {
      artifact: requirement.to,
      artifact_label: graph.artifacts.get(requirement.to)?.label ?? requirement.to,
      relation: requirement.attrs?.relation ?? requirement.label,
      strength: requirement.attrs?.strength ?? requirement.condition,
      produced_by: producers,
      basis: requirement.attrs?.basis ?? [],
    };
    if (entry.strength === "hard") blockedBy.push(entry);
    else softPending.push(entry);
  }

  // 조건부 마일스톤은 그 조건의 파라미터가 확정되기 전까지 개폐를 판정하지 않는다.
  // 오버레이 진행 상태보다 이쪽이 우선이다. 상태가 planned로 적혀 있어도
  // 활성화 여부를 모르면 "계획됨"이 아니라 "경로 미확정"이다.
  const activation = milestone.attrs?.activation_resolution ?? null;
  const undetermined = activation?.mode === "rule" && activation.determined === false;

  let openness;
  if (DONE_STATES.has(state)) openness = "done";
  else if (undetermined || state === "path_undetermined") openness = "path_undetermined";
  else if (blockedBy.length > 0) openness = "blocked";
  else if (OPEN_STATES.has(state)) openness = "in_progress";
  else openness = "ready";

  return {
    milestone_id: milestoneId,
    node_id: milestone.attrs?.node_id ?? null,
    label: milestone.label,
    stage: milestone.attrs?.stage ?? null,
    lead_actor: milestone.attrs?.lead_actor ?? null,
    state,
    openness,
    blocked_by: blockedBy,
    soft_pending: softPending,
    produces: milestone.attrs?.produces ?? [],
    activation: milestone.attrs?.activation ?? null,
    activation_resolution: activation,
    // 오버레이 상태와 활성화 판정이 어긋나면 데이터 쪽 불일치다. 숨기지 않는다.
    overlay_status_conflict: undetermined && state !== "path_undetermined"
      ? `오버레이 상태는 ${state}인데 활성화 파라미터(${activation.parameter})가 미확정입니다.`
      : null,
  };
}

export function allMilestoneStatuses(caseData) {
  const graph = projectGraph(caseData);
  return [...graph.milestones.keys()].map((id) => milestoneStatus(graph, id));
}

/** 참조 제도의 준비도가 마일스톤별로 다음 행동 계산을 허용하는지 판정한다. */
export function institutionReadinessFor(caseData, nodeId) {
  const graph = projectGraph(caseData);
  const referenced = [...graph.institutions.values()].filter((institution) => (
    (institution.attrs?.referenced_by ?? []).includes(nodeId)
  ));
  const notReady = referenced.filter((institution) => institution.attrs?.readiness_level !== "R2");
  return {
    referenced: referenced.map((institution) => ({
      slug: institution.attrs?.slug,
      name: institution.label,
      readiness_level: institution.attrs?.readiness_level,
      mapping_statuses: institution.attrs?.mapping_statuses ?? [],
    })),
    next_action_computable: referenced.length > 0 && notReady.length === 0,
    not_ready_slugs: notReady.map((institution) => institution.attrs?.slug),
  };
}

export function readinessRollup(caseData) {
  const graph = projectGraph(caseData);
  const byLevel = {};
  for (const institution of graph.institutions.values()) {
    const level = institution.attrs?.readiness_level ?? "unassessed";
    byLevel[level] = (byLevel[level] ?? 0) + 1;
  }
  const r2Slugs = [...graph.institutions.values()]
    .filter((institution) => institution.attrs?.readiness_level === "R2")
    .map((institution) => institution.attrs?.slug);

  const statuses = [...graph.milestones.keys()].map((id) => milestoneStatus(graph, id));
  const computable = statuses.filter((status) => (
    institutionReadinessFor(caseData, status.node_id).next_action_computable
  ));

  return {
    institution_count: graph.institutions.size,
    by_readiness_level: byLevel,
    r2_slugs: r2Slugs,
    milestone_count: statuses.length,
    next_action_computable_milestones: computable.map((status) => status.node_id),
    note: computable.length === 0
      ? "참조 제도 중 R2가 없어 어떤 마일스톤도 다음 행동을 계산할 수 없습니다. 이 케이스는 의존 구조 파악용입니다."
      : `마일스톤 ${computable.length}개만 다음 행동 계산 대상입니다.`,
  };
}

/** 지금 손댈 수 있는 마일스톤과 막힌 마일스톤을 갈라 준다. */
export function projectStatus(caseData) {
  const statuses = allMilestoneStatuses(caseData);
  const group = (openness) => statuses.filter((status) => status.openness === openness);

  return {
    case_id: caseData.case_id,
    project_id: caseData.project_id,
    project_name: caseData.project_name,
    as_of: caseData.as_of,
    counts: {
      done: group("done").length,
      in_progress: group("in_progress").length,
      ready: group("ready").length,
      blocked: group("blocked").length,
      path_undetermined: group("path_undetermined").length,
    },
    done: group("done").map((status) => status.node_id),
    in_progress: group("in_progress").map((status) => ({
      node_id: status.node_id,
      label: status.label,
      stage: status.stage,
    })),
    ready: group("ready").map((status) => ({
      node_id: status.node_id,
      label: status.label,
      stage: status.stage,
      lead_actor: status.lead_actor,
    })),
    path_undetermined: group("path_undetermined").map((status) => ({
      node_id: status.node_id,
      label: status.label,
      activation: status.activation,
    })),
    readiness: readinessRollup(caseData),
    execution_allowed: false,
  };
}

/**
 * 아직 사업이 정하지 않은 갈림길을 모은다.
 *
 * 제도 준비도 축은 R2 승격으로 풀리지만, 사업 파라미터 축은 사업이 정해야만 풀린다.
 * 어느 파라미터가 어느 마일스톤을 여닫는지, 각 값이 무엇을 활성화하는지 모아 준다.
 * 무엇을 고를지는 말하지 않는다. 고를 것이 무엇인지만 말한다.
 */
export function pendingDecisions(caseData) {
  const graph = projectGraph(caseData);
  const caseEntity = [...(caseData.entities ?? [])].find((entity) => entity.id.startsWith("case:"));
  const parameters = caseEntity?.attrs?.parameters ?? {};

  const byParameter = new Map();
  for (const milestone of graph.milestones.values()) {
    const activation = milestone.attrs?.activation_resolution;
    if (activation?.mode !== "rule" || !activation.parameter) continue;
    const entry = byParameter.get(activation.parameter) ?? {
      parameter: activation.parameter,
      status: activation.parameter_status,
      value: activation.parameter_value,
      reason: activation.parameter_reason ?? parameters[activation.parameter]?.reason ?? null,
      gates: [],
    };
    entry.gates.push({
      node_id: milestone.attrs?.node_id,
      label: milestone.label,
      stage: milestone.attrs?.stage ?? null,
      activates_when: activation.equals,
      openness: milestoneStatus(graph, milestone.id).openness,
    });
    byParameter.set(activation.parameter, entry);
  }

  const undetermined = [...byParameter.values()].filter((entry) => entry.status === "unknown");
  // 파라미터로 선언되지 않았지만 케이스가 미확정이라고 말하는 것도 있다.
  const declaredOnly = Object.entries(parameters)
    .filter(([name, meta]) => meta?.status === "unknown" && !byParameter.has(name))
    .map(([name, meta]) => ({
      parameter: name,
      status: "unknown",
      value: meta?.value ?? null,
      reason: meta?.reason ?? null,
      gates: [],
      // 마일스톤을 여닫지는 않지만 그 안쪽 제도 적용 여부를 정하는 파라미터.
      // gates가 비었다고 영향이 없는 것이 아니다.
      affects: meta?.affects ?? null,
      // 의존 그래프가 이미 같은 말을 하고 있는 파라미터. 결정할 것이 아니라
      // 선행 마일스톤이 안 끝났다는 사실의 다른 표기다.
      equivalent_to: meta?.equivalent_to ?? null,
    }));

  // 미확정 파라미터라고 전부 "사업이 골라야 할 것"이 아니다. 세 가지가 섞여 있다.
  // 골라야 하는 것, 마일스톤 안쪽 적용범위를 정하는 것, 그리고 의존 그래프가 이미
  // 말하고 있어 결정거리가 아닌 것. 섞어서 내면 PMO가 없는 결정을 찾게 된다.
  const classify = (entry) => {
    if (entry.equivalent_to) return "graph_redundant";
    if (entry.gates.length) return "gate";
    if (entry.affects?.milestone) return "inside_gate";
    return "information_gap";
  };
  const all = [...undetermined, ...declaredOnly].map((entry) => ({ ...entry, classification: classify(entry) }));
  const decisions = all.filter((entry) => entry.classification !== "graph_redundant");

  return {
    case_id: caseData.case_id,
    project_id: caseData.project_id,
    as_of: caseData.as_of,
    undetermined_parameters: all,
    decision_count: decisions.length,
    graph_redundant_parameters: all.filter((entry) => entry.classification === "graph_redundant"),
    exclusive_branches: undetermined
      .filter((entry) => new Set(entry.gates.map((gate) => gate.activates_when)).size > 1)
      .map((entry) => ({
        parameter: entry.parameter,
        options: entry.gates.map((gate) => ({ value: gate.activates_when, milestone: gate.node_id, label: gate.label })),
      })),
    note: all.length === 0
      ? "선언된 파라미터 중 미확정은 없습니다."
      : `사업이 정할 것 ${decisions.length}개`
        + `(관문 여닫음 ${all.filter((e) => e.classification === "gate").length}, `
        + `관문 안쪽 적용범위 ${all.filter((e) => e.classification === "inside_gate").length}, `
        + `값 미상 ${all.filter((e) => e.classification === "information_gap").length}). `
        + `${all.length - decisions.length}개는 의존 그래프가 이미 말하고 있어 결정거리가 아닙니다. `
        + `어느 값을 택할지는 사업이 정합니다.`,
    execution_allowed: false,
  };
}

// ── 관심층(결재선) ──────────────────────────────────────────────────────────
//
// 마일스톤 54개가 끌어 쓰는 절차는 1,200개가 넘는다. 그 전부가 총리·국무위원의
// 의제일 수는 없고, "국무위원이 볼 절차"를 손으로 골라 태그하면 다음 주면 썩는다.
// 어느 마일스톤이 누구 책상에 올라가는지는 절차의 고정 속성이 아니라
// 결정 위상 × 개폐 상태 × 의존 그래프의 함수다. 그래서 계산한다.
//
// 세 층: cabinet(총리·국무위원) / agency(부처·지자체 기관장) / working(실무·완료).
// 사유 없이 층에 오르는 마일스톤은 없다 — reasons가 비면 working이다.

const ATTENTION_TIERS = Object.freeze(["cabinet", "agency", "working"]);
const CENTRAL_TIERS = new Set(["cabinet", "legislature", "presidential_committee", "minister"]);
const GOVERNMENT_TIERS = new Set([...CENTRAL_TIERS, "local"]);
const POLICY_CLASSES = new Set(["policy", "governance"]);
const ACTIVE_OPENNESS = new Set(["ready", "in_progress"]);

/**
 * 하류 파급 — 이 마일스톤의 산출물에 (전이적으로) 기대는 마일스톤 수.
 * 지렛대 크기다. 기간 정보가 없으므로 임계경로 대신 이것을 쓴다.
 */
function downstreamReach(caseData, graph) {
  const consumersOf = new Map();
  for (const relation of caseData.relations ?? []) {
    if (relation.type !== "hands_off_to") continue;
    const list = consumersOf.get(relation.from) ?? [];
    list.push(relation.to);
    consumersOf.set(relation.from, list);
  }
  const reach = new Map();
  for (const id of graph.milestones.keys()) {
    const seen = new Set();
    const stack = [...(consumersOf.get(id) ?? [])];
    while (stack.length) {
      const next = stack.pop();
      if (seen.has(next) || next === id) continue;
      seen.add(next);
      stack.push(...(consumersOf.get(next) ?? []));
    }
    reach.set(id, seen.size);
  }
  return reach;
}

/** 상위 사분위 경계. 미완료 마일스톤만 놓고 잰다 — 끝난 것은 지렛대가 아니다. */
function leverageThreshold(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return Infinity;
  const index = Math.floor(sorted.length * 0.75);
  return Math.max(1, sorted[Math.min(index, sorted.length - 1)]);
}

/**
 * 총리·국무위원 / 기관장 / 실무 세 층으로 마일스톤을 가른다.
 *
 * cabinet에 오르는 사유(하나면 충분):
 *   policy_or_governance   정책·거버넌스 분류(사업 방향 자체가 결정거리)
 *   central_decision       결정주체가 총리·국무회의·국회·대통령 소속 위원회
 *   cross_ministry_wait    막혀 있고, 막는 산출물이 *다른* 중앙부처 손에 지금 있음(다부처 물림)
 *   exclusive_branch_gate  사업이 정해야 하는 배타 분기가 걸린 관문
 *   high_leverage_open     지금 열려 있고 하류 파급이 상위 사분위인 정부·위원회 관문
 * agency에 오르는 사유:
 *   central_open           중앙부처 결정 관문이 열려 있거나 막혀 있음
 *   government_open        지자체장 결정 관문이 열려 있거나 막혀 있음
 *   pending_parameter      관문 안쪽 적용범위·값 미상 파라미터가 걸려 있음
 *   high_leverage_open     열려 있고 파급이 큰데 사업자·미특정 주체 손에 있음
 * 나머지(완료 포함)는 working. 절차 단계 목록은 그대로 두고 화면에서만 접는다.
 */
export function attentionView(caseData) {
  const graph = projectGraph(caseData);
  const statuses = new Map([...graph.milestones.keys()].map((id) => [id, milestoneStatus(graph, id)]));
  const reach = downstreamReach(caseData, graph);
  const threshold = leverageThreshold(
    [...statuses.entries()].filter(([, status]) => status.openness !== "done").map(([id]) => reach.get(id) ?? 0),
  );
  const decisions = pendingDecisions(caseData);
  const exclusiveGates = new Set(
    decisions.exclusive_branches.flatMap((branch) => branch.options.map((option) => option.milestone)),
  );
  const softPending = new Map();
  for (const entry of decisions.undetermined_parameters) {
    if (entry.classification === "graph_redundant") continue;
    const targets = entry.gates.map((gate) => gate.node_id);
    if (entry.affects?.milestone) targets.push(entry.affects.milestone);
    for (const nodeId of targets) {
      if (!nodeId) continue;
      const list = softPending.get(nodeId) ?? [];
      list.push(entry.parameter);
      softPending.set(nodeId, list);
    }
  }
  const tierMissing = [];

  const entries = [];
  for (const [id, milestone] of graph.milestones) {
    const status = statuses.get(id);
    const tier = milestone.attrs?.decision_tier ?? null;
    if (!tier) tierMissing.push(status.node_id);
    const reasons = [];
    const done = status.openness === "done";

    const leverage = reach.get(id) ?? 0;
    // 정책 항목이라도 하류에 아무것도 안 걸려 있으면 총리 의제가 아니라 부처 사업이다.
    // 오버레이가 classification=policy를 느슨하게 쓰는 사업(북극항로 R&D·인력양성)이 있다.
    if (!done && POLICY_CLASSES.has(milestone.attrs?.classification)
      && (milestone.attrs.classification === "governance" || leverage >= 1)) {
      reasons.push({ code: "policy_or_governance", tier: "cabinet", evidence: `${milestone.attrs.classification}, 하류 ${leverage}` });
    }
    if (!done && tier && CENTRAL_TIERS.has(tier) && tier !== "minister") {
      reasons.push({ code: "central_decision", tier: "cabinet", evidence: tier });
    }
    if (status.openness === "blocked" && tier && GOVERNMENT_TIERS.has(tier)) {
      for (const blocker of status.blocked_by) {
        for (const producerId of blocker.produced_by) {
          const producer = graph.milestones.get(producerId);
          const producerStatus = statuses.get(producerId);
          const producerTier = producer?.attrs?.decision_tier;
          const sameLane = producer?.attrs?.lead_actor === milestone.attrs?.lead_actor;
          // 상류가 더 막혀 있으면 그쪽이 의제다. 지금 손에 쥔 부처만 잡는다.
          const inHandNow = producerStatus && (ACTIVE_OPENNESS.has(producerStatus.openness) || producerStatus.openness === "path_undetermined");
          if (!sameLane && producerTier && CENTRAL_TIERS.has(producerTier) && inHandNow) {
            reasons.push({
              code: "cross_ministry_wait",
              tier: "cabinet",
              evidence: `${blocker.artifact} ← ${producerStatus.node_id}(${producer.attrs.lead_actor}, ${producerStatus.openness})`,
            });
          }
        }
      }
    }
    if (!done && exclusiveGates.has(status.node_id)) {
      reasons.push({ code: "exclusive_branch_gate", tier: "cabinet", evidence: "배타 분기" });
    }
    // 열려 있는데 하류 파급이 상위 사분위면 지연이 곧 사업 전체 지연이다. 정부 기관이나
    // 법정 위원회 손에 있으면 총리 의제, 사업자·미특정 주체 손에 있으면 소관 기관이 챙긴다.
    if (ACTIVE_OPENNESS.has(status.openness) && leverage >= threshold) {
      reasons.push({
        code: "high_leverage_open",
        tier: tier && tier !== "field" ? "cabinet" : "agency",
        evidence: `하류 ${leverage}개 ≥ 경계 ${threshold}`,
      });
    }
    if (!done && status.openness !== "path_undetermined" && tier && CENTRAL_TIERS.has(tier)) {
      reasons.push({ code: "central_open", tier: "agency", evidence: status.openness });
    }
    if (!done && status.openness !== "path_undetermined" && tier === "local") {
      reasons.push({ code: "government_open", tier: "agency", evidence: status.openness });
    }
    if (!done && softPending.has(status.node_id) && !exclusiveGates.has(status.node_id)) {
      reasons.push({ code: "pending_parameter", tier: "agency", evidence: softPending.get(status.node_id).join(", ") });
    }

    const attentionTier = reasons.some((reason) => reason.tier === "cabinet")
      ? "cabinet"
      : reasons.some((reason) => reason.tier === "agency") ? "agency" : "working";
    entries.push({
      node_id: status.node_id,
      label: status.label,
      stage: status.stage,
      lead_actor: status.lead_actor,
      decision_tier: tier,
      openness: status.openness,
      downstream_reach: leverage,
      attention_tier: attentionTier,
      reasons,
    });
  }

  const byTier = Object.fromEntries(ATTENTION_TIERS.map((tier) => [tier, entries.filter((entry) => entry.attention_tier === tier)]));
  const referencedInstitutions = graph.institutions.size;
  return {
    case_id: caseData.case_id,
    project_id: caseData.project_id,
    project_name: caseData.project_name,
    as_of: caseData.as_of,
    leverage_threshold: threshold,
    counts: Object.fromEntries(ATTENTION_TIERS.map((tier) => [tier, byTier[tier].length])),
    cabinet: byTier.cabinet,
    agency: byTier.agency,
    working: byTier.working.map(({ node_id, label, openness }) => ({ node_id, label, openness })),
    inventory: {
      milestone_count: graph.milestones.size,
      institution_count: referencedInstitutions,
      note: "참조 제도의 절차 단계 전량은 장부다. 의제는 위 두 층에서만 나온다.",
    },
    // 결정 위상이 없는 마일스톤은 계산에서 빠진 것이 아니라 근거 없이 working에 남은 것이다.
    decision_tier_missing: tierMissing,
    note: `총리·국무위원 ${byTier.cabinet.length} / 기관장 ${byTier.agency.length} / 실무·완료 ${byTier.working.length}. `
      + "층은 결정 위상×개폐×의존 그래프에서 매 질의 계산되며 손으로 고른 목록이 아니다.",
    execution_allowed: false,
  };
}

/** 막힌 마일스톤의 원인을 선행 마일스톤까지 거슬러 준다. */
export function explainBlocked(caseData, nodeId, { maxDepth = 6 } = {}) {
  const graph = projectGraph(caseData);
  const milestoneId = `milestone:${nodeId}`;
  const root = milestoneStatus(graph, milestoneId);

  const chain = [];
  const seen = new Set([milestoneId]);
  let frontier = root.blocked_by;
  let depth = 0;

  while (frontier.length > 0 && depth < maxDepth) {
    depth += 1;
    const next = [];
    for (const blocker of frontier) {
      for (const producerId of blocker.produced_by) {
        if (seen.has(producerId)) continue;
        seen.add(producerId);
        const status = milestoneStatus(graph, producerId);
        chain.push({
          depth,
          node_id: status.node_id,
          label: status.label,
          stage: status.stage,
          openness: status.openness,
          produces_needed_artifact: blocker.artifact,
        });
        if (status.openness === "blocked") next.push(...status.blocked_by);
      }
    }
    frontier = next;
  }

  return {
    milestone: {
      node_id: root.node_id,
      label: root.label,
      stage: root.stage,
      openness: root.openness,
    },
    blocked_by: root.blocked_by,
    soft_pending: root.soft_pending,
    upstream_chain: chain,
    truncated: depth >= maxDepth && frontier.length > 0,
    institution_readiness: institutionReadinessFor(caseData, nodeId),
    execution_allowed: false,
  };
}
