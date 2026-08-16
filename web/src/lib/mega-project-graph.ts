import type {
  MegaActivationState,
  MegaArtifact,
  MegaDependency,
  MegaDetailEdge,
  MegaDetailNode,
  MegaDetailTemplate,
  MegaDisplayStatus,
  MegaProject,
  MegaProjectNode,
  MegaProjectSource,
  MegaRuleValue,
  MegaRuleValues,
} from "./mega-project-types";

export type DetailMapping = "exact" | "template" | "missing";

export interface DetailGroup {
  id: string;
  templateId?: string;
  templateName: string;
  mapping: DetailMapping;
  nodes: MegaDetailNode[];
  edges: MegaDetailEdge[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  artifact: string;
  strength: "hard" | "soft";
  kind: MegaDependency["kind"];
  conditional: boolean;
  handoff: boolean;
}

export interface DependencyState {
  dependency: MegaDependency;
  applicable: boolean | "unknown";
  satisfied: boolean;
  producerIds: string[];
}

export const STATUS_META: Record<
  MegaDisplayStatus,
  { label: string; code: string }
> = {
  completed: { label: "완료", code: "DONE" },
  active: { label: "진행 중", code: "LIVE" },
  ready: { label: "지금 착수", code: "OPEN" },
  blocked: { label: "선행 대기", code: "WAIT" },
  conditional: { label: "조건 미정", code: "BRANCH" },
  inactive: { label: "경로 제외", code: "OFF" },
};

export const CLASSIFICATION_LABELS: Record<
  MegaProjectNode["classification"],
  string
> = {
  policy: "정책",
  governance: "거버넌스",
  plan: "계획",
  legal_gate: "법정",
  protection_gate: "보호",
  technical_gate: "기술",
  delivery: "이행",
  operation: "가동",
};

export const KIND_LABELS: Record<MegaDependency["kind"], string> = {
  legal: "법적",
  protection: "보호",
  technical: "기술",
  policy: "정책",
  financial: "재정",
};

export const RELATION_LABELS: Record<MegaDependency["relation"], string> = {
  finish_to_start: "완료 후 착수",
  start_to_start: "병렬 착수",
  finish_to_finish: "완료 전 충족",
  satisfied_by: "충족 필요",
};

export const RULE_LABELS: Record<string, { code: string; label: string }> = {
  RULE_PRIVATE_LAND_COMPENSATION: {
    code: "B01",
    label: "사유지 보상 경로",
  },
  RULE_HERITAGE_PATH: {
    code: "B02",
    label: "국가유산 조사 경로",
  },
  RULE_POWER_GRID_PATH: {
    code: "B03",
    label: "전력계통 검토 경로",
  },
  RULE_HAZARDOUS_FACILITY_PATH: {
    code: "B04",
    label: "위험물·고압가스 경로",
  },
};

export const CONFIDENCE_META: Record<
  MegaProjectNode["confidence"],
  { code: string; label: string }
> = {
  official: { code: "OBS", label: "공식 현황 확인" },
  statutory: { code: "LAW", label: "법령상 필수 단계" },
  modeled: { code: "MOD", label: "분석상 프로젝트 모델" },
  unknown: { code: "UNK", label: "공개자료 부족" },
};

export const COUNT_ORDER: MegaDisplayStatus[] = [
  "completed",
  "active",
  "ready",
  "conditional",
  "blocked",
];

function valuesEqual(left: MegaRuleValue, right: MegaRuleValue) {
  return left === right;
}

function isUnknownRuleValue(value: MegaRuleValue) {
  return value === null || value === "unknown";
}

function getInitialRuleValues(project: MegaProject): MegaRuleValues {
  return Object.fromEntries(
    project.rules.map((rule) => {
      const parameter = project.parameters[rule.parameter];
      const parameterValue = parameter?.value;
      const value =
        typeof parameterValue === "number"
          ? rule.default
          : (parameterValue ?? rule.default);
      return [rule.id, value];
    }),
  );
}

function getActivationState(
  node: MegaProjectNode,
  ruleValues: MegaRuleValues,
): MegaActivationState {
  if (node.activation.mode === "always") return "active";
  const current = ruleValues[node.activation.rule];
  if (isUnknownRuleValue(current)) return "unknown";
  return valuesEqual(current, node.activation.equals) ? "active" : "inactive";
}

function getDependencyApplicability(
  dependency: MegaDependency,
  ruleValues: MegaRuleValues,
): boolean | "unknown" {
  if (!dependency.whenRule) return true;
  const current = ruleValues[dependency.whenRule.rule];
  if (isUnknownRuleValue(current)) return "unknown";
  return valuesEqual(current, dependency.whenRule.equals);
}

export function formatArtifactLabel(
  artifactId: string,
  artifactMap: Map<string, MegaArtifact>,
) {
  return artifactMap.get(artifactId)?.label ?? artifactId;
}

export function formatRuleValue(value: MegaRuleValue | number) {
  if (value === null || value === "unknown") return "미확정";
  if (value === true) return "필요";
  if (value === false) return "불필요";
  return String(value);
}

export function formatCompactActors(actors: string[]) {
  if (actors.length === 0) return "—";
  return `${actors[0]}${actors.length > 1 ? ` +${actors.length - 1}` : ""}`;
}

export function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${year}.${month}.${day}`;
}

export interface MegaProjectGraph {
  ruleValues: MegaRuleValues;
  artifactMap: Map<string, MegaArtifact>;
  sourceMap: Map<string, MegaProjectSource>;
  sourceCodeMap: Map<string, string>;
  nodeOrder: Map<string, number>;
  nodeById: Map<string, MegaProjectNode>;
  detailGroupsByNode: Map<string, DetailGroup[]>;
  detailMappingByNode: Map<string, DetailMapping | "mixed">;
  detailInventory: {
    exact: number;
    template: number;
    internalEdges: number;
    missingMilestones: number;
    uniqueTemplates: number;
  };
  detailWeightByNode: Map<string, number>;
  actorNodeCounts: Map<string, number>;
  activationByNode: Map<string, MegaActivationState>;
  displayStatusByNode: Map<string, MegaDisplayStatus>;
  blockersByNode: Map<string, DependencyState[]>;
  edges: GraphEdge[];
  handoffCount: number;
  downstreamByNode: Map<string, string[]>;
  counts: Record<MegaDisplayStatus, number>;
  readyNodes: MegaProjectNode[];
}

export function buildMegaProjectGraph(
  project: MegaProject,
  artifacts: MegaArtifact[],
  templates: Record<string, string>,
  detailTemplates: Record<string, MegaDetailTemplate>,
): MegaProjectGraph {
  const ruleValues = getInitialRuleValues(project);
  const artifactMap = new Map(
    artifacts.map((artifact) => [artifact.id, artifact]),
  );
  const sourceMap = new Map(
    project.sources.map((source) => [source.id, source]),
  );
  const sourceCodeMap = new Map(
    project.sources.map((source, index) => [
      source.id,
      `S${String(index + 1).padStart(2, "0")}`,
    ]),
  );
  const nodeOrder = new Map(
    project.nodes.map((node, index) => [node.id, index]),
  );
  const nodeById = new Map(project.nodes.map((node) => [node.id, node]));

  const detailGroupsByNode = new Map<string, DetailGroup[]>();
  project.nodes.forEach((projectNode) => {
    const references = projectNode.templateRefs ?? [];
    if (references.length === 0) {
      detailGroupsByNode.set(projectNode.id, [
        {
          id: `${projectNode.id}:gap`,
          templateName: "상세 하위절차 매핑 필요",
          mapping: "missing",
          nodes: [
            {
              id: "TBD",
              name: "신청·검토·협의·의결·고시 단계 분해 필요",
              actor: projectNode.authority,
              stage: projectNode.stage,
              type: "gateway",
              outputDocuments: [],
              legalBasisCount: 0,
            },
          ],
          edges: [],
        },
      ]);
      return;
    }

    const groups = references.map((reference, index): DetailGroup => {
      const template = detailTemplates[reference.institution];
      const selectedIds = reference.nodeIds
        ? new Set(reference.nodeIds)
        : null;
      const selectedNodes = (template?.nodes ?? []).filter(
        (node) => !selectedIds || selectedIds.has(node.id),
      );
      const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
      const selectedEdges = (template?.edges ?? []).filter(
        (edge) =>
          selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target),
      );
      if (!template || selectedNodes.length === 0) {
        return {
          id: `${projectNode.id}:${reference.institution}:${index}`,
          templateId: reference.institution,
          templateName:
            templates[reference.institution] ?? reference.institution,
          mapping: "missing",
          nodes: [
            {
              id: "TBD",
              name: "참조 템플릿의 적용 하위절차 확인 필요",
              actor: projectNode.authority,
              stage: projectNode.stage,
              type: "gateway",
              outputDocuments: [],
              legalBasisCount: 0,
            },
          ],
          edges: [],
        };
      }
      return {
        id: `${projectNode.id}:${reference.institution}:${index}`,
        templateId: reference.institution,
        templateName: template.name,
        mapping:
          reference.mappingStatus === "candidate"
            ? "template"
            : selectedIds
              ? "exact"
              : "template",
        nodes: selectedNodes,
        edges: selectedEdges,
      };
    });
    detailGroupsByNode.set(projectNode.id, groups);
  });

  const detailMappingByNode = new Map<string, DetailMapping | "mixed">();
  detailGroupsByNode.forEach((groups, nodeId) => {
    const mappings = new Set(groups.map((group) => group.mapping));
    if (mappings.has("missing")) detailMappingByNode.set(nodeId, "missing");
    else if (mappings.size > 1) detailMappingByNode.set(nodeId, "mixed");
    else detailMappingByNode.set(nodeId, groups[0]?.mapping ?? "missing");
  });

  let exact = 0;
  let template = 0;
  let internalEdges = 0;
  let missingMilestones = 0;
  const uniqueTemplates = new Set<string>();
  detailGroupsByNode.forEach((groups) => {
    if (groups.some((group) => group.mapping === "missing")) {
      missingMilestones += 1;
    }
    groups.forEach((group) => {
      if (group.templateId) uniqueTemplates.add(group.templateId);
      if (group.mapping === "exact") exact += group.nodes.length;
      if (group.mapping === "template") template += group.nodes.length;
      internalEdges += group.edges.length;
    });
  });
  const detailInventory = {
    exact,
    template,
    internalEdges,
    missingMilestones,
    uniqueTemplates: uniqueTemplates.size,
  };

  const detailWeightByNode = new Map(
    project.nodes.map((node) => {
      const groups = detailGroupsByNode.get(node.id) ?? [];
      const nodeCount = groups.reduce(
        (total, group) => total + group.nodes.length,
        0,
      );
      return [node.id, Math.max(12, nodeCount + groups.length * 2)];
    }),
  );

  const actorNodeCounts = new Map(
    project.actors.map((actor) => [
      actor.id,
      project.nodes.filter((node) => node.leadActor === actor.id).length,
    ]),
  );

  const producersByArtifact = new Map<string, string[]>();
  project.nodes.forEach((node) => {
    node.produces.forEach((artifact) => {
      const current = producersByArtifact.get(artifact) ?? [];
      current.push(node.id);
      producersByArtifact.set(artifact, current);
    });
  });

  const activationByNode = new Map(
    project.nodes.map((node) => [
      node.id,
      getActivationState(node, ruleValues),
    ]),
  );

  const completedArtifacts = new Set<string>();
  project.nodes.forEach((node) => {
    if (
      node.status === "completed" &&
      activationByNode.get(node.id) !== "inactive"
    ) {
      node.produces.forEach((artifact) => completedArtifacts.add(artifact));
    }
  });

  const startedNodeIds = new Set(
    project.nodes
      .filter(
        (node) =>
          (node.status === "active" || node.status === "completed") &&
          activationByNode.get(node.id) !== "inactive",
      )
      .map((node) => node.id),
  );

  const dependencyState = (dependency: MegaDependency): DependencyState => {
    const applicable = getDependencyApplicability(dependency, ruleValues);
    const producerIds = producersByArtifact.get(dependency.artifact) ?? [];
    const completed = completedArtifacts.has(dependency.artifact);
    const producerStarted = producerIds.some((id) => startedNodeIds.has(id));

    let satisfied = applicable === false;
    if (applicable !== false) {
      if (dependency.relation === "start_to_start") {
        satisfied = completed || producerStarted;
      } else if (dependency.relation === "finish_to_finish") {
        satisfied = true;
      } else {
        satisfied = completed;
      }
    }

    return { dependency, applicable, satisfied, producerIds };
  };

  const getStartBlockers = (node: MegaProjectNode) =>
    node.requires
      .map((dependency) => dependencyState(dependency))
      .filter(
        (state) =>
          state.dependency.strength === "hard" &&
          state.dependency.relation !== "finish_to_finish" &&
          state.applicable !== false &&
          !state.satisfied,
      );

  const blockersByNode = new Map<string, DependencyState[]>();
  const displayStatusByNode = new Map<string, MegaDisplayStatus>();
  project.nodes.forEach((node) => {
    const blockers = getStartBlockers(node);
    blockersByNode.set(node.id, blockers);
    const activation = activationByNode.get(node.id);
    if (activation === "inactive") {
      displayStatusByNode.set(node.id, "inactive");
    } else if (node.status === "completed") {
      displayStatusByNode.set(node.id, "completed");
    } else if (node.status === "active") {
      displayStatusByNode.set(node.id, "active");
    } else if (activation === "unknown") {
      displayStatusByNode.set(node.id, "conditional");
    } else if (blockers.length === 0) {
      displayStatusByNode.set(node.id, "ready");
    } else {
      displayStatusByNode.set(node.id, "blocked");
    }
  });

  const edges: GraphEdge[] = [];
  project.nodes.forEach((targetNode) => {
    targetNode.requires.forEach((dependency) => {
      const applicable = getDependencyApplicability(dependency, ruleValues);
      if (applicable === false) return;
      (producersByArtifact.get(dependency.artifact) ?? []).forEach(
        (sourceId) => {
          const sourceNode = nodeById.get(sourceId);
          edges.push({
            id: `${sourceId}-${targetNode.id}-${dependency.artifact}`,
            source: sourceId,
            target: targetNode.id,
            artifact: dependency.artifact,
            strength: dependency.strength,
            kind: dependency.kind,
            conditional:
              applicable === "unknown" ||
              activationByNode.get(sourceId) === "unknown" ||
              activationByNode.get(targetNode.id) === "unknown",
            handoff: sourceNode?.leadActor !== targetNode.leadActor,
          });
        },
      );
    });
  });

  const handoffCount = edges.filter((edge) => edge.handoff).length;

  const downstreamByNode = new Map<string, string[]>();
  project.nodes.forEach((node) => downstreamByNode.set(node.id, []));
  edges.forEach((edge) => {
    const current = downstreamByNode.get(edge.source) ?? [];
    if (!current.includes(edge.target)) current.push(edge.target);
    downstreamByNode.set(edge.source, current);
  });
  downstreamByNode.forEach((ids) =>
    ids.sort(
      (left, right) => (nodeOrder.get(left) ?? 0) - (nodeOrder.get(right) ?? 0),
    ),
  );

  const counts: Record<MegaDisplayStatus, number> = {
    completed: 0,
    active: 0,
    ready: 0,
    blocked: 0,
    conditional: 0,
    inactive: 0,
  };
  displayStatusByNode.forEach((status) => {
    counts[status] += 1;
  });

  const readyNodes = project.nodes.filter(
    (node) => displayStatusByNode.get(node.id) === "ready",
  );

  return {
    ruleValues,
    artifactMap,
    sourceMap,
    sourceCodeMap,
    nodeOrder,
    nodeById,
    detailGroupsByNode,
    detailMappingByNode,
    detailInventory,
    detailWeightByNode,
    actorNodeCounts,
    activationByNode,
    displayStatusByNode,
    blockersByNode,
    edges,
    handoffCount,
    downstreamByNode,
    counts,
    readyNodes,
  };
}
