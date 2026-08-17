"use client";

import Link from "next/link";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { trackEvent } from "@/lib/client-events";
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
  MegaRuleValue,
  MegaRuleValues,
} from "@/lib/mega-project-types";
import MegaViewNav from "./MegaViewNav";
import styles from "./MegaProjectBoard.module.css";

interface MegaProjectBoardProps {
  project: MegaProject;
  artifacts: MegaArtifact[];
  templates: Record<string, string>;
  detailTemplates: Record<string, MegaDetailTemplate>;
}

type DetailMapping = "exact" | "template" | "missing";

interface DetailGroup {
  id: string;
  templateId?: string;
  templateName: string;
  mapping: DetailMapping;
  nodes: MegaDetailNode[];
  edges: MegaDetailEdge[];
}

interface DetailEdgeGeometry {
  id: string;
  path: string;
  mapping: DetailMapping;
  type: MegaDetailEdge["type"] | "chain";
}

interface DependencyState {
  dependency: MegaDependency;
  applicable: boolean | "unknown";
  satisfied: boolean;
  producerIds: string[];
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  artifact: string;
  strength: "hard" | "soft";
  kind: MegaDependency["kind"];
  conditional: boolean;
  handoff: boolean;
}

interface EdgeGeometry extends GraphEdge {
  path: string;
}

const STATUS_META: Record<
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

const CLASSIFICATION_LABELS: Record<
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

const KIND_LABELS: Record<MegaDependency["kind"], string> = {
  legal: "법적",
  protection: "보호",
  technical: "기술",
  policy: "정책",
  financial: "재정",
};

const RELATION_LABELS: Record<MegaDependency["relation"], string> = {
  finish_to_start: "완료 후 착수",
  start_to_start: "병렬 착수",
  finish_to_finish: "완료 전 충족",
  satisfied_by: "충족 필요",
};

const RULE_LABELS: Record<string, { code: string; label: string }> = {
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

const CONFIDENCE_META: Record<
  MegaProjectNode["confidence"],
  { code: string; label: string }
> = {
  official: { code: "OBS", label: "공식 현황 확인" },
  statutory: { code: "LAW", label: "법령상 필수 단계" },
  modeled: { code: "MOD", label: "분석상 프로젝트 모델" },
  unknown: { code: "UNK", label: "공개자료 부족" },
};

const COUNT_ORDER: MegaDisplayStatus[] = [
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

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${year}.${month}.${day}`;
}

function formatArtifactLabel(
  artifactId: string,
  artifactMap: Map<string, MegaArtifact>,
) {
  return artifactMap.get(artifactId)?.label ?? artifactId;
}

function formatRuleValue(value: MegaRuleValue | number) {
  if (value === null || value === "unknown") return "미확정";
  if (value === true) return "필요";
  if (value === false) return "불필요";
  return String(value);
}

function formatCompactActors(actors: string[]) {
  if (actors.length === 0) return "—";
  return `${actors[0]}${actors.length > 1 ? ` +${actors.length - 1}` : ""}`;
}

function MegaDetailFlow({
  groups,
  registerEntryNode,
  registerExitNode,
}: {
  groups: DetailGroup[];
  registerEntryNode?: (element: HTMLElement | null) => void;
  registerExitNode?: (element: HTMLElement | null) => void;
}) {
  const flowRef = useRef<HTMLDivElement | null>(null);
  const detailNodeRefs = useRef(new Map<string, HTMLElement>());
  const [geometry, setGeometry] = useState<DetailEdgeGeometry[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const updateGeometry = useCallback(() => {
    const flow = flowRef.current;
    if (!flow || flow.offsetParent === null) return;
    const flowRect = flow.getBoundingClientRect();
    const buildPath = (sourceId: string, targetId: string) => {
      const source = detailNodeRefs.current.get(sourceId);
      const target = detailNodeRefs.current.get(targetId);
      if (!source || !target) return null;
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const sourceX = sourceRect.right - flowRect.left;
      const sourceY = sourceRect.top - flowRect.top + sourceRect.height / 2;
      const targetX = targetRect.left - flowRect.left;
      const targetY = targetRect.top - flowRect.top + targetRect.height / 2;
      const sameRow = Math.abs(sourceY - targetY) < sourceRect.height * 0.65;
      if (sameRow && targetX > sourceX) {
        const bend = Math.max(2, (targetX - sourceX) * 0.46);
        return `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`;
      }
      const sourceBottom = sourceRect.bottom - flowRect.top;
      const targetTop = targetRect.top - flowRect.top;
      const sourceCenter = sourceRect.left - flowRect.left + sourceRect.width / 2;
      const targetCenter = targetRect.left - flowRect.left + targetRect.width / 2;
      const bend = Math.max(3, Math.abs(targetTop - sourceBottom) * 0.5);
      return `M ${sourceCenter} ${sourceBottom} C ${sourceCenter} ${sourceBottom + bend}, ${targetCenter} ${targetTop - bend}, ${targetCenter} ${targetTop}`;
    };

    const withinGroup = groups.flatMap((group) =>
      group.edges.flatMap((edge) => {
        const path = buildPath(
          `${group.id}:${edge.source}`,
          `${group.id}:${edge.target}`,
        );
        if (!path) return [];
        return [
          {
            id: `${group.id}:${edge.id}`,
            path,
            mapping: group.mapping,
            type: edge.type as DetailEdgeGeometry["type"],
          },
        ];
      }),
    );

    const chained = groups.flatMap((group, index) => {
      const nextGroup = groups[index + 1];
      const lastNode = group.nodes[group.nodes.length - 1];
      const firstNode = nextGroup?.nodes[0];
      if (!nextGroup || !lastNode || !firstNode) return [];
      const path = buildPath(
        `${group.id}:${lastNode.id}`,
        `${nextGroup.id}:${firstNode.id}`,
      );
      if (!path) return [];
      return [
        {
          id: `chain:${group.id}->${nextGroup.id}`,
          path,
          mapping: nextGroup.mapping,
          type: "chain" as const,
        },
      ];
    });

    setSize({ width: flow.clientWidth, height: flow.clientHeight });
    setGeometry([...withinGroup, ...chained]);
  }, [groups]);

  useLayoutEffect(() => {
    updateGeometry();
    const flow = flowRef.current;
    if (!flow) return;
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(flow);
    detailNodeRefs.current.forEach((node) => observer.observe(node));
    window.addEventListener("resize", updateGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateGeometry);
    };
  }, [updateGeometry]);

  const setDetailNodeRef = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) detailNodeRefs.current.set(id, element);
      else detailNodeRefs.current.delete(id);
    },
    [],
  );

  const nonEmptyGroups = groups.filter((group) => group.nodes.length > 0);
  const firstGroup = nonEmptyGroups[0];
  const lastGroup = nonEmptyGroups[nonEmptyGroups.length - 1];
  const entryKey = firstGroup
    ? `${firstGroup.id}:${firstGroup.nodes[0].id}`
    : undefined;
  const exitKey = lastGroup
    ? `${lastGroup.id}:${lastGroup.nodes[lastGroup.nodes.length - 1].id}`
    : undefined;

  return (
    <div
      className={styles.detailFlow}
      ref={flowRef}
      aria-label="Korea100 하위 행정절차"
    >
      <svg
        className={styles.detailEdgeLayer}
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
        aria-hidden="true"
      >
        {geometry.map((edge) => (
          <path
            key={edge.id}
            className={styles.detailEdge}
            d={edge.path}
            data-mapping={edge.mapping}
            data-type={edge.type}
          />
        ))}
      </svg>
      {groups.map((group) => (
        <div
          className={styles.detailGroup}
          key={group.id}
          data-mapping={group.mapping}
        >
          <span
            className={styles.detailGroupLabel}
            title={`${group.templateName} · ${group.nodes.length}개 절차 / 내부선 ${group.edges.length}건`}
          >
            <b>
              {group.mapping === "exact"
                ? "MAP"
                : group.mapping === "template"
                  ? "TPL"
                  : "GAP"}
            </b>
            {group.templateId ? (
              <Link href={`/model/${group.templateId}/`}>
                {group.templateName}
              </Link>
            ) : (
              <strong>{group.templateName}</strong>
            )}
            <small>{group.nodes.length}</small>
          </span>
          <span className={styles.detailNodes}>
            {group.nodes.map((node) => {
              const nodeKey = `${group.id}:${node.id}`;
              return (
              <span
                className={styles.detailNode}
                key={nodeKey}
                ref={(element) => {
                  setDetailNodeRef(nodeKey)(element);
                  if (nodeKey === entryKey) registerEntryNode?.(element);
                  if (nodeKey === exitKey) registerExitNode?.(element);
                }}
                data-mapping={group.mapping}
                data-type={node.type}
                title={[
                  `${node.id} ${node.name}`,
                  `담당 ${node.actor}`,
                  `단계 ${node.stage}`,
                  node.outputDocuments.length > 0
                    ? `산출물 ${node.outputDocuments.join(" · ")}`
                    : "산출물 미기재",
                  `법적 근거 ${node.legalBasisCount}건`,
                ].join(" / ")}
              >
                <b>{node.id}</b>
                <i>{node.name}</i>
              </span>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function MegaProjectBoard({
  project,
  artifacts,
  templates,
  detailTemplates,
}: MegaProjectBoardProps) {
  const [edgeGeometry, setEdgeGeometry] = useState<EdgeGeometry[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const nodeEntryRefs = useRef(new Map<string, HTMLElement>());
  const nodeExitRefs = useRef(new Map<string, HTMLElement>());

  const ruleValues = useMemo(() => getInitialRuleValues(project), [project]);
  const artifactMap = useMemo(
    () => new Map(artifacts.map((artifact) => [artifact.id, artifact])),
    [artifacts],
  );
  const sourceMap = useMemo(
    () => new Map(project.sources.map((source) => [source.id, source])),
    [project.sources],
  );
  const sourceCodeMap = useMemo(
    () =>
      new Map(
        project.sources.map((source, index) => [
          source.id,
          `S${String(index + 1).padStart(2, "0")}`,
        ]),
      ),
    [project.sources],
  );
  const nodeOrder = useMemo(
    () => new Map(project.nodes.map((node, index) => [node.id, index])),
    [project.nodes],
  );
  const nodeById = useMemo(
    () => new Map(project.nodes.map((node) => [node.id, node])),
    [project.nodes],
  );
  const nodesByActorAndStage = useMemo(() => {
    const result = new Map<string, MegaProjectNode[]>();
    project.nodes.forEach((node) => {
      const key = `${node.leadActor}:${node.stage}`;
      const current = result.get(key) ?? [];
      current.push(node);
      result.set(key, current);
    });
    return result;
  }, [project.nodes]);
  const detailGroupsByNode = useMemo(() => {
    const result = new Map<string, DetailGroup[]>();
    project.nodes.forEach((projectNode) => {
      const references = projectNode.templateRefs ?? [];
      if (references.length === 0) {
        result.set(projectNode.id, [
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
      result.set(projectNode.id, groups);
    });
    return result;
  }, [detailTemplates, project.nodes, templates]);
  const detailMappingByNode = useMemo(() => {
    const result = new Map<
      string,
      DetailMapping | "mixed"
    >();
    detailGroupsByNode.forEach((groups, nodeId) => {
      const mappings = new Set(groups.map((group) => group.mapping));
      if (mappings.has("missing")) result.set(nodeId, "missing");
      else if (mappings.size > 1) result.set(nodeId, "mixed");
      else result.set(nodeId, groups[0]?.mapping ?? "missing");
    });
    return result;
  }, [detailGroupsByNode]);
  const detailInventory = useMemo(() => {
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
    return {
      exact,
      template,
      internalEdges,
      missingMilestones,
      uniqueTemplates: uniqueTemplates.size,
    };
  }, [detailGroupsByNode]);
  const detailWeightByNode = useMemo(
    () =>
      new Map(
        project.nodes.map((node) => {
          const groups = detailGroupsByNode.get(node.id) ?? [];
          const nodeCount = groups.reduce(
            (total, group) => total + group.nodes.length,
            0,
          );
          return [node.id, Math.max(12, nodeCount + groups.length * 5)];
        }),
      ),
    [detailGroupsByNode, project.nodes],
  );
  const actorNodeCounts = useMemo(
    () =>
      new Map(
        project.actors.map((actor) => [
          actor.id,
          project.nodes.filter((node) => node.leadActor === actor.id).length,
        ]),
      ),
    [project.actors, project.nodes],
  );
  const producersByArtifact = useMemo(() => {
    const producerMap = new Map<string, string[]>();
    project.nodes.forEach((node) => {
      node.produces.forEach((artifact) => {
        const current = producerMap.get(artifact) ?? [];
        current.push(node.id);
        producerMap.set(artifact, current);
      });
    });
    return producerMap;
  }, [project.nodes]);

  const activationByNode = useMemo(
    () =>
      new Map(
        project.nodes.map((node) => [
          node.id,
          getActivationState(node, ruleValues),
        ]),
      ),
    [project.nodes, ruleValues],
  );

  const completedArtifacts = useMemo(() => {
    const completed = new Set<string>();
    project.nodes.forEach((node) => {
      if (
        node.status === "completed" &&
        activationByNode.get(node.id) !== "inactive"
      ) {
        node.produces.forEach((artifact) => completed.add(artifact));
      }
    });
    return completed;
  }, [activationByNode, project.nodes]);

  const startedNodeIds = useMemo(
    () =>
      new Set(
        project.nodes
          .filter(
            (node) =>
              (node.status === "active" || node.status === "completed") &&
              activationByNode.get(node.id) !== "inactive",
          )
          .map((node) => node.id),
      ),
    [activationByNode, project.nodes],
  );

  const dependencyState = useCallback(
    (dependency: MegaDependency): DependencyState => {
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
    },
    [completedArtifacts, producersByArtifact, ruleValues, startedNodeIds],
  );

  const getStartBlockers = useCallback(
    (node: MegaProjectNode) =>
      node.requires
        .map((dependency) => dependencyState(dependency))
        .filter(
          (state) =>
            state.dependency.strength === "hard" &&
            state.dependency.relation !== "finish_to_finish" &&
            state.applicable !== false &&
            !state.satisfied,
        ),
    [dependencyState],
  );

  const displayStatusByNode = useMemo(() => {
    const result = new Map<string, MegaDisplayStatus>();
    project.nodes.forEach((node) => {
      const activation = activationByNode.get(node.id);
      if (activation === "inactive") {
        result.set(node.id, "inactive");
      } else if (node.status === "completed") {
        result.set(node.id, "completed");
      } else if (node.status === "active") {
        result.set(node.id, "active");
      } else if (activation === "unknown") {
        result.set(node.id, "conditional");
      } else if (getStartBlockers(node).length === 0) {
        result.set(node.id, "ready");
      } else {
        result.set(node.id, "blocked");
      }
    });
    return result;
  }, [activationByNode, getStartBlockers, project.nodes]);

  const edges = useMemo<GraphEdge[]>(() => {
    const result: GraphEdge[] = [];
    project.nodes.forEach((targetNode) => {
      targetNode.requires.forEach((dependency) => {
        const applicable = getDependencyApplicability(dependency, ruleValues);
        if (applicable === false) return;
        (producersByArtifact.get(dependency.artifact) ?? []).forEach((sourceId) => {
          const sourceNode = nodeById.get(sourceId);
          result.push({
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
        });
      });
    });
    return result;
  }, [activationByNode, nodeById, producersByArtifact, project.nodes, ruleValues]);

  const handoffCount = useMemo(
    () => edges.filter((edge) => edge.handoff).length,
    [edges],
  );

  const downstreamByNode = useMemo(() => {
    const result = new Map<string, string[]>();
    project.nodes.forEach((node) => result.set(node.id, []));
    edges.forEach((edge) => {
      const current = result.get(edge.source) ?? [];
      if (!current.includes(edge.target)) current.push(edge.target);
      result.set(edge.source, current);
    });
    result.forEach((ids) =>
      ids.sort((left, right) =>
        (nodeOrder.get(left) ?? 0) - (nodeOrder.get(right) ?? 0),
      ),
    );
    return result;
  }, [edges, nodeOrder, project.nodes]);

  const updateEdgeGeometry = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const width = canvas.scrollWidth;
    const height = canvas.scrollHeight;
    const paths = edges.flatMap((edge) => {
      const source =
        nodeExitRefs.current.get(edge.source) ?? nodeRefs.current.get(edge.source);
      const target =
        nodeEntryRefs.current.get(edge.target) ?? nodeRefs.current.get(edge.target);
      if (!source || !target) return [];
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const sourceLeft = sourceRect.left - canvasRect.left;
      const sourceX = sourceRect.right - canvasRect.left;
      const sourceY = sourceRect.top - canvasRect.top + sourceRect.height / 2;
      const targetLeft = targetRect.left - canvasRect.left;
      const targetRight = targetRect.right - canvasRect.left;
      const targetY = targetRect.top - canvasRect.top + targetRect.height / 2;
      const sameColumn = Math.abs(sourceLeft - targetLeft) < 12;

      let path: string;
      if (sameColumn) {
        const sourceAbove = targetY >= sourceY;
        const anchorX = sourceLeft + sourceRect.width * 0.5;
        const sourceAnchorY = sourceAbove
          ? sourceRect.bottom - canvasRect.top
          : sourceRect.top - canvasRect.top;
        const targetAnchorY = sourceAbove
          ? targetRect.top - canvasRect.top
          : targetRect.bottom - canvasRect.top;
        const bend = Math.max(8, Math.abs(targetAnchorY - sourceAnchorY) * 0.38);
        const direction = sourceAbove ? 1 : -1;
        path = `M ${anchorX} ${sourceAnchorY} C ${anchorX + 6} ${sourceAnchorY + bend * direction}, ${anchorX - 6} ${targetAnchorY - bend * direction}, ${anchorX} ${targetAnchorY}`;
      } else if (targetLeft > sourceX + 18) {
        const bend = Math.max(28, (targetLeft - sourceX) * 0.42);
        path = `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetLeft - bend} ${targetY}, ${targetLeft} ${targetY}`;
      } else {
        const loopX = Math.max(sourceX, targetRight) + 18;
        path = `M ${sourceX} ${sourceY} C ${loopX} ${sourceY}, ${loopX} ${targetY}, ${targetRight} ${targetY}`;
      }
      return [{ ...edge, path }];
    });

    setCanvasSize({ width, height });
    setEdgeGeometry(paths);
  }, [edges]);

  useLayoutEffect(() => {
    updateEdgeGeometry();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(updateEdgeGeometry);
    observer.observe(canvas);
    nodeRefs.current.forEach((node) => observer.observe(node));
    nodeEntryRefs.current.forEach((node) => observer.observe(node));
    nodeExitRefs.current.forEach((node) => observer.observe(node));
    window.addEventListener("resize", updateEdgeGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateEdgeGeometry);
    };
  }, [updateEdgeGeometry]);

  const counts = useMemo(() => {
    const initial: Record<MegaDisplayStatus, number> = {
      completed: 0,
      active: 0,
      ready: 0,
      blocked: 0,
      conditional: 0,
      inactive: 0,
    };
    displayStatusByNode.forEach((status) => {
      initial[status] += 1;
    });
    return initial;
  }, [displayStatusByNode]);

  const readyNodes = useMemo(
    () =>
      project.nodes.filter(
        (node) => displayStatusByNode.get(node.id) === "ready",
      ),
    [displayStatusByNode, project.nodes],
  );

  const setNodeRef = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) nodeRefs.current.set(id, element);
      else nodeRefs.current.delete(id);
    },
    [],
  );

  const setNodeEntryRef = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) nodeEntryRefs.current.set(id, element);
      else nodeEntryRefs.current.delete(id);
    },
    [],
  );

  const setNodeExitRef = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) nodeExitRefs.current.set(id, element);
      else nodeExitRefs.current.delete(id);
    },
    [],
  );

  const graphStyle = {
    "--stage-count": project.stages.length,
    "--actor-count": project.actors.length,
  } as CSSProperties & {
    "--stage-count": number;
    "--actor-count": number;
  };

  return (
    <div className={`${styles.page} mega-synoptic-page`}>
      <header className={styles.commandHeader}>
        <div className={styles.identity}>
          <p className={styles.kicker}>
            MEGA / PERMIT SYNOPTIC <span>PROJECT 01</span>
          </p>
          <h1>{project.name} 행정절차 전경</h1>
          <p className={styles.heroStats} aria-label="핵심 규모">
            <span>
              <b>
                {(
                  detailInventory.exact +
                  detailInventory.template +
                  detailInventory.missingMilestones
                ).toLocaleString()}
              </b>
              <small>행정절차</small>
            </span>
            <span>
              <b>{detailInventory.uniqueTemplates}</b>
              <small>법정 제도</small>
            </span>
            <span>
              <b>{project.nodes.length}</b>
              <small>마일스톤</small>
            </span>
            <span>
              <b>{project.stages.length}</b>
              <small>게이트</small>
            </span>
          </p>
          <p className={styles.summary}>{project.summary}</p>
        </div>

        <dl className={styles.scopeMatrix}>
          <div>
            <dt>정책 입지</dt>
            <dd>{project.scope.location}</dd>
          </div>
          <div>
            <dt>발표 면적</dt>
            <dd>{project.scope.announcedArea}</dd>
          </div>
          <div>
            <dt>경계 상태</dt>
            <dd>{project.scope.boundaryStatus}</dd>
          </div>
          <div>
            <dt>기준일</dt>
            <dd>{formatDate(project.asOfDate)}</dd>
          </div>
        </dl>

        <dl className={styles.statusMatrix} aria-label="절차 상태 집계">
          {COUNT_ORDER.map((status) => (
            <div key={status} data-status={status}>
              <dt>{STATUS_META[status].label}</dt>
              <dd>{String(counts[status]).padStart(2, "0")}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className={styles.viewNavStrip}>
        <MegaViewNav projectId={project.id} active="poster" />
        <span>화면이 작으면 스윔레인·펼쳐보기가 읽기 편합니다</span>
      </div>

      <section className={styles.signalDeck} aria-label="현재 병렬축과 미확정 분기">
        <div className={styles.readyRail}>
          <div className={styles.railLead}>
            <span className={styles.railCode}>NOW OPEN</span>
            <strong>{String(readyNodes.length).padStart(2, "0")}</strong>
            <small>{handoffCount}개 기관 간 인계 · 지금 병렬 착수 가능한 축</small>
          </div>
          <ol
            className={styles.readyList}
            style={
              {
                "--ready-count": Math.max(1, readyNodes.length),
              } as CSSProperties
            }
          >
            {readyNodes.map((node) => (
              <li key={node.id}>
                <span>{node.id}</span>
                <strong>{node.name}</strong>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.branchRail}>
          <div className={styles.railLead}>
            <span className={styles.railCode}>OPEN BRANCH</span>
            <strong>{String(project.rules.length).padStart(2, "0")}</strong>
            <small>선택하지 않고 모든 조건부 경로를 함께 표시</small>
          </div>
          <div
            className={styles.branchList}
            style={
              {
                "--branch-count": Math.max(1, project.rules.length),
              } as CSSProperties
            }
          >
            {project.rules.map((rule) => {
              const meta = RULE_LABELS[rule.id] ?? {
                code: "B--",
                label: rule.id,
              };
              const parameter = project.parameters[rule.parameter];
              return (
                <article key={rule.id}>
                  <span>{meta.code}</span>
                  <div>
                    <strong>{meta.label}</strong>
                    <small title={parameter?.reason}>
                      {formatRuleValue(parameter?.value ?? rule.default)} · {parameter?.reason}
                    </small>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className={styles.workspace}
        aria-label={`${project.nodes.length}개 행정절차 선행조건 지도`}
      >
        <div className={styles.graphViewport}>
          <div className={styles.graphCanvas} ref={canvasRef} style={graphStyle}>
            <svg
              className={styles.edgeLayer}
              width={canvasSize.width}
              height={canvasSize.height}
              viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="mega-arrow"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" />
                </marker>
                <marker
                  id="mega-arrow-handoff"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" />
                </marker>
                <marker
                  id="mega-arrow-conditional"
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" />
                </marker>
              </defs>
              {edgeGeometry.map((edge) => (
                <path
                  key={edge.id}
                  className={styles.edge}
                  d={edge.path}
                  data-strength={edge.strength}
                  data-conditional={edge.conditional ? "true" : "false"}
                  data-handoff={edge.handoff ? "true" : "false"}
                  data-kind={edge.kind}
                  markerEnd={
                    edge.conditional
                      ? "url(#mega-arrow-conditional)"
                      : edge.handoff
                        ? "url(#mega-arrow-handoff)"
                        : "url(#mega-arrow)"
                  }
                />
              ))}
            </svg>

            <div className={styles.stageAxis}>
              <div className={styles.axisCorner}>
                <span>RESPONSIBLE ACTOR</span>
                <strong>책임 주체 ↓</strong>
                <small>행정 게이트 →</small>
              </div>
              {project.stages.map((stage, stageIndex) => {
                const stageNodes = project.nodes.filter(
                  (node) => node.stage === stage.id,
                );
                return (
                  <header className={styles.stageHeader} key={stage.id}>
                    <span>{String(stageIndex + 1).padStart(2, "0")}</span>
                    <div>
                      <h2>{stage.label}</h2>
                      <small>{stageNodes.length} PROCEDURES</small>
                    </div>
                  </header>
                );
              })}
            </div>

            <div className={styles.laneGrid}>
              {project.actors.map((actor, actorIndex) => {
                const stageCellLists = project.stages.map(
                  (stage) =>
                    nodesByActorAndStage.get(`${actor.id}:${stage.id}`) ?? [],
                );
                const laneRows = Math.max(
                  1,
                  ...stageCellLists.map((list) => list.length),
                );
                const laneRowHeights = Array.from(
                  { length: laneRows },
                  (_, rowIndex) => {
                    const weight = Math.max(
                      0,
                      ...stageCellLists.map((list) => {
                        const node = list[rowIndex];
                        return node ? (detailWeightByNode.get(node.id) ?? 12) : 0;
                      }),
                    );
                    return weight > 0 ? Math.max(58, 30 + weight * 2.4) : 40;
                  },
                )
                  .map((height) => `minmax(${height}px, auto)`)
                  .join(" ");

                return (
                  <section
                    className={styles.actorLane}
                    key={actor.id}
                    data-actor={actor.id}
                    style={
                      {
                        "--actor-index": actorIndex,
                        "--lane-row-heights": laneRowHeights,
                      } as CSSProperties & { "--actor-index": number }
                    }
                  >
                    <header className={styles.actorHeader}>
                      <span className={styles.actorCode}>{actor.code}</span>
                      <div>
                        <h2>{actor.label}</h2>
                        <small>{actor.mandate}</small>
                      </div>
                      <strong>{String(actorNodeCounts.get(actor.id) ?? 0).padStart(2, "0")}</strong>
                    </header>

                    {project.stages.flatMap((stage, stageIndex) => {
                      const cellNodes = stageCellLists[stageIndex];
                      return Array.from({ length: laneRows }, (_, rowIndex) => {
                        const rowNodes = cellNodes[rowIndex]
                          ? [cellNodes[rowIndex]]
                          : [];
                        const detailRows = rowNodes
                          .map(
                            (node) =>
                              `${detailWeightByNode.get(node.id) ?? 12}fr`,
                          )
                          .join(" ");
                        const nodeRows = `repeat(${Math.max(1, rowNodes.length)}, minmax(0, 1fr))`;
                        return (
                          <div
                            className={styles.stageCell}
                            key={`${actor.id}:${stage.id}:${rowIndex}`}
                            data-count={rowNodes.length}
                            data-stage-index={stageIndex}
                            style={
                              {
                                gridColumn: stageIndex + 2,
                                gridRow: rowIndex + 1,
                                "--detail-rows": detailRows || "minmax(0, 1fr)",
                                "--node-rows": nodeRows,
                              } as CSSProperties
                            }
                          >
                            {rowNodes.map((node) => {
                            const status =
                              displayStatusByNode.get(node.id) ?? "blocked";
                            const blockers = getStartBlockers(node);
                            const successors = downstreamByNode.get(node.id) ?? [];
                            const activation = activationByNode.get(node.id);
                            const blockerLabels = blockers.map((blocker) =>
                              formatArtifactLabel(
                                blocker.dependency.artifact,
                                artifactMap,
                              ),
                            );
                            const blockerDetail = blockers
                              .map(
                                (blocker) =>
                                  `${KIND_LABELS[blocker.dependency.kind]} · ${RELATION_LABELS[blocker.dependency.relation]} · ${formatArtifactLabel(blocker.dependency.artifact, artifactMap)}${blocker.dependency.note ? ` · ${blocker.dependency.note}` : ""}`,
                              )
                              .join(" / ");
                            const lockLabel =
                              status === "completed"
                                ? "완료·산출물 확보"
                                : status === "active"
                                  ? "필수조건 충족·진행 중"
                                  : status === "ready"
                                    ? "없음·지금 착수"
                                    : status === "inactive"
                                      ? "현재 경로 제외"
                                      : activation === "unknown"
                                        ? "? 적용 여부 미확정"
                                        : blockerLabels.join("·") || "검토 필요";
                            const outputLabels = node.produces.map((artifact) =>
                              formatArtifactLabel(artifact, artifactMap),
                            );
                            const successorTitle = successors
                              .map((id) => {
                                const successor = nodeById.get(id);
                                return successor ? `${id} ${successor.name}` : id;
                              })
                              .join(" · ");
                            const roleTitle = [
                              `주관 ${node.actorRoles.lead.join(" · ")}`,
                              `협의 ${node.actorRoles.consult.join(" · ") || "없음"}`,
                              `결정 ${node.actorRoles.decision.join(" · ")}`,
                              `원문 담당 ${node.authority}`,
                            ].join(" / ");
                            const detailGroups =
                              detailGroupsByNode.get(node.id) ?? [];
                            const detailMapping =
                              detailMappingByNode.get(node.id) ?? "missing";

                            return (
                              <article
                                key={node.id}
                                ref={setNodeRef(node.id)}
                                className={styles.node}
                                data-status={status}
                                data-confidence={node.confidence}
                                data-protection={
                                  node.classification === "protection_gate"
                                    ? "true"
                                    : "false"
                                }
                                aria-label={`${node.id} ${node.name}, ${actor.label} 주관, ${STATUS_META[status].label}`}
                                style={
                                  {
                                    "--node-index": nodeOrder.get(node.id) ?? 0,
                                  } as CSSProperties & { "--node-index": number }
                                }
                              >
                                <div className={styles.nodeTopline}>
                                  <span className={styles.nodeCode}>{node.id}</span>
                                  <span
                                    className={styles.detailState}
                                    data-mapping={detailMapping}
                                    title={
                                      detailMapping === "exact"
                                        ? "광주 프로젝트 적용 하위절차가 정확히 지정됨"
                                        : detailMapping === "mixed"
                                          ? "정확 매핑과 템플릿 후보가 함께 연결됨"
                                          : detailMapping === "template"
                                            ? "연결 템플릿 전체가 적용 후보이며 선별 필요"
                                            : "상세 하위절차 분해 필요"
                                    }
                                  >
                                    {detailMapping === "exact"
                                      ? "MAP"
                                      : detailMapping === "mixed"
                                        ? "MIX"
                                        : detailMapping === "template"
                                          ? "TPL"
                                          : "GAP"}
                                  </span>
                                  <span
                                    className={styles.confidenceState}
                                    data-confidence={node.confidence}
                                    title={CONFIDENCE_META[node.confidence].label}
                                  >
                                    {CONFIDENCE_META[node.confidence].code}
                                  </span>
                                  <h3 title={`${node.name} · ${CLASSIFICATION_LABELS[node.classification]}`}>
                                    {node.name}
                                  </h3>
                                  <span className={styles.nodeStatus} data-status={status}>
                                    {STATUS_META[status].code}
                                  </span>
                                </div>

                                <p className={styles.nodeRoles} title={roleTitle}>
                                  <span><b>주</b>{formatCompactActors(node.actorRoles.lead)}</span>
                                  <span><b>협</b>{formatCompactActors(node.actorRoles.consult)}</span>
                                  <span><b>결</b>{formatCompactActors(node.actorRoles.decision)}</span>
                                </p>

                                <MegaDetailFlow
                                  groups={detailGroups}
                                  registerEntryNode={setNodeEntryRef(node.id)}
                                  registerExitNode={setNodeExitRef(node.id)}
                                />

                                <footer className={styles.nodeFlow}>
                                  <span
                                    className={styles.nodeLock}
                                    data-unknown={activation === "unknown" ? "true" : "false"}
                                    title={blockerDetail || lockLabel}
                                  >
                                    <b>잠</b>{lockLabel}
                                  </span>
                                  <span className={styles.nodeOutput} title={outputLabels.join(" · ")}>
                                    <b>산</b>{outputLabels[0]}{outputLabels.length > 1 ? ` +${outputLabels.length - 1}` : ""}
                                  </span>
                                  <span className={styles.successors} title={successorTitle}>
                                    →{successors.length > 0 ? successors.join("·") : "END"}
                                  </span>
                                  <span className={styles.references}>
                                    {node.templateRefs?.map((reference) => (
                                      <Link
                                        key={reference.institution}
                                        href={`/model/${reference.institution}/`}
                                        title={`Korea100 · ${templates[reference.institution]}`}
                                      >
                                        K
                                      </Link>
                                    ))}
                                    {node.evidence.map((sourceId) => {
                                      const source = sourceMap.get(sourceId);
                                      if (!source) return null;
                                      return (
                                        <a
                                          key={source.id}
                                          href={source.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          title={source.title}
                                          onClick={() =>
                                            trackEvent("mega_project_source_opened", {
                                              project_id: project.id,
                                              node_id: node.id,
                                              source_id: source.id,
                                            })
                                          }
                                        >
                                          {sourceCodeMap.get(source.id)}
                                        </a>
                                      );
                                    })}
                                  </span>
                                </footer>
                              </article>
                            );
                          })}
                        </div>
                      );
                      });
                    })}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.readingKey}>
        <p>
          <strong>4단계 구조</strong>
          {project.stages.length}개 게이트 → {project.nodes.length}개 마일스톤 → {detailInventory.exact + detailInventory.template}개 하위절차 → 공식 산출물
        </p>
        <div className={styles.legend} aria-label="지도 범례">
          <span><i data-edge="internal" />기관 내 선행</span>
          <span><i data-edge="handoff" />기관 간 인계 {handoffCount}건</span>
          <span><i data-edge="conditional" />미확정 분기</span>
          <span title="정확 매핑 / 템플릿 후보 / 상세분해 필요 마일스톤">
            <b>D</b>{detailInventory.exact}/{detailInventory.template}/{detailInventory.missingMilestones}
          </span>
          <span><b>K</b>Korea100</span>
          <span><b>S</b>공식 근거 {project.sources.length}건</span>
        </div>
        <p className={styles.viewportHint}>
          {detailInventory.uniqueTemplates}개 제도 템플릿 · 내부선 {detailInventory.internalEdges}건
        </p>
      </footer>
    </div>
  );
}
