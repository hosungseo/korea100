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
    .map(([name, meta]) => ({ parameter: name, status: "unknown", value: meta?.value ?? null, reason: meta?.reason ?? null, gates: [] }));

  return {
    case_id: caseData.case_id,
    project_id: caseData.project_id,
    as_of: caseData.as_of,
    undetermined_parameters: [...undetermined, ...declaredOnly],
    exclusive_branches: undetermined
      .filter((entry) => new Set(entry.gates.map((gate) => gate.activates_when)).size > 1)
      .map((entry) => ({
        parameter: entry.parameter,
        options: entry.gates.map((gate) => ({ value: gate.activates_when, milestone: gate.node_id, label: gate.label })),
      })),
    note: undetermined.length === 0
      ? "선언된 파라미터 중 미확정은 없습니다."
      : `파라미터 ${undetermined.length}개가 마일스톤 ${undetermined.reduce((sum, entry) => sum + entry.gates.length, 0)}개를 여닫습니다. 어느 값을 택할지는 사업이 정합니다.`,
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
