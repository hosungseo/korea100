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
  MegaDisplayStatus,
  MegaProject,
  MegaProjectNode,
  MegaRuleValue,
  MegaRuleValues,
} from "@/lib/mega-project-types";
import styles from "./MegaProjectBoard.module.css";

interface MegaProjectBoardProps {
  project: MegaProject;
  artifacts: MegaArtifact[];
  templates: Record<string, string>;
}

type BoardFilter = "all" | "ready" | "protection";

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
}

interface EdgeGeometry extends GraphEdge {
  path: string;
}

const STATUS_META: Record<
  MegaDisplayStatus,
  { label: string; shortLabel: string }
> = {
  completed: { label: "완료", shortLabel: "완료" },
  active: { label: "진행 중", shortLabel: "진행" },
  ready: { label: "지금 착수 가능", shortLabel: "가능" },
  blocked: { label: "선행조건 대기", shortLabel: "대기" },
  conditional: { label: "조건 확인 필요", shortLabel: "조건" },
  inactive: { label: "현재 경로 아님", shortLabel: "제외" },
};

const CLASSIFICATION_LABELS: Record<
  MegaProjectNode["classification"],
  string
> = {
  policy: "정책 결정",
  governance: "추진체계",
  plan: "계획",
  legal_gate: "법적 게이트",
  protection_gate: "보호 게이트",
  technical_gate: "기술 게이트",
  delivery: "사업 이행",
  operation: "가동",
};

const CONFIDENCE_LABELS: Record<MegaProjectNode["confidence"], string> = {
  official: "공식 확인",
  statutory: "법령 근거",
  modeled: "구조 추정",
  unknown: "추가 확인",
};

const RELATION_LABELS: Record<MegaDependency["relation"], string> = {
  finish_to_start: "완료 후 착수",
  start_to_start: "병렬 착수",
  finish_to_finish: "완료 전 충족",
  satisfied_by: "충족 필요",
};

const KIND_LABELS: Record<MegaDependency["kind"], string> = {
  legal: "법적",
  protection: "보호",
  technical: "기술",
  policy: "정책",
  financial: "재정",
};

const RULE_CONTROLS: Array<{
  rule: string;
  label: string;
  options: Array<{ label: string; value: MegaRuleValue }>;
}> = [
  {
    rule: "RULE_PRIVATE_LAND_COMPENSATION",
    label: "사유지 보상",
    options: [
      { label: "미확정", value: null },
      { label: "필요", value: true },
      { label: "불필요", value: false },
    ],
  },
  {
    rule: "RULE_HERITAGE_PATH",
    label: "국가유산",
    options: [
      { label: "미확정", value: null },
      { label: "필요", value: true },
      { label: "불필요", value: false },
    ],
  },
  {
    rule: "RULE_POWER_GRID_PATH",
    label: "전력계통 경로",
    options: [
      { label: "미확정", value: "unknown" },
      { label: "정식 평가", value: "formal-assessment" },
      { label: "면제·신속", value: "exempt-or-expedited" },
    ],
  },
];

const FILTERS: Array<{ id: BoardFilter; label: string }> = [
  { id: "all", label: "전체 경로" },
  { id: "ready", label: "지금 가능" },
  { id: "protection", label: "보호 절차" },
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

function ruleValueKey(value: MegaRuleValue) {
  if (value === null) return "null";
  return String(value);
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

function getClearStateMessage(status: MegaDisplayStatus) {
  if (status === "completed") return "이 절차는 완료됐습니다.";
  if (status === "active") return "필수 착수조건을 충족해 현재 진행 중입니다.";
  if (status === "inactive") return "선택한 시나리오에서는 적용되지 않는 경로입니다.";
  if (status === "conditional") {
    return "필수 착수조건과 별개로 경로 적용 여부를 먼저 확인해야 합니다.";
  }
  return "필수 착수조건이 충족됐습니다. 현재 바로 착수할 수 있습니다.";
}

export default function MegaProjectBoard({
  project,
  artifacts,
  templates,
}: MegaProjectBoardProps) {
  const [selectedNodeId, setSelectedNodeId] = useState(
    project.nodes.find((node) => node.id === "N04")?.id ??
      project.nodes[0]?.id ??
      "",
  );
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [ruleValues, setRuleValues] = useState<MegaRuleValues>(() =>
    getInitialRuleValues(project),
  );
  const [edgeGeometry, setEdgeGeometry] = useState<EdgeGeometry[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());

  const nodeMap = useMemo(
    () => new Map(project.nodes.map((node) => [node.id, node])),
    [project.nodes],
  );
  const artifactMap = useMemo(
    () => new Map(artifacts.map((artifact) => [artifact.id, artifact])),
    [artifacts],
  );
  const sourceMap = useMemo(
    () => new Map(project.sources.map((source) => [source.id, source])),
    [project.sources],
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
    (
      dependency: MegaDependency,
      extraCompleted: Set<string> = new Set(),
    ): DependencyState => {
      const applicable = getDependencyApplicability(dependency, ruleValues);
      const producerIds = producersByArtifact.get(dependency.artifact) ?? [];
      const completed =
        completedArtifacts.has(dependency.artifact) ||
        extraCompleted.has(dependency.artifact);
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
    (node: MegaProjectNode, extraCompleted: Set<string> = new Set()) =>
      node.requires
        .map((dependency) => dependencyState(dependency, extraCompleted))
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
          result.push({
            id: `${sourceId}-${targetNode.id}-${dependency.artifact}`,
            source: sourceId,
            target: targetNode.id,
            artifact: dependency.artifact,
            strength: dependency.strength,
            kind: dependency.kind,
            conditional:
              applicable === "unknown" ||
              activationByNode.get(sourceId) === "unknown",
          });
        });
      });
    });
    return result;
  }, [activationByNode, producersByArtifact, project.nodes, ruleValues]);

  const updateEdgeGeometry = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const width = canvas.scrollWidth;
    const height = canvas.scrollHeight;
    const paths = edges.flatMap((edge) => {
      const source = nodeRefs.current.get(edge.source);
      const target = nodeRefs.current.get(edge.target);
      if (!source || !target) return [];
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const sourceX = sourceRect.right - canvasRect.left;
      const sourceY = sourceRect.top - canvasRect.top + sourceRect.height / 2;
      const targetLeft = targetRect.left - canvasRect.left;
      const targetRight = targetRect.right - canvasRect.left;
      const targetY = targetRect.top - canvasRect.top + targetRect.height / 2;

      let path: string;
      if (targetLeft > sourceX + 26) {
        const bend = Math.max(34, (targetLeft - sourceX) * 0.46);
        path = `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetLeft - bend} ${targetY}, ${targetLeft} ${targetY}`;
      } else {
        const loopX = Math.max(sourceX, targetRight) + 24;
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
    window.addEventListener("resize", updateEdgeGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateEdgeGeometry);
    };
  }, [updateEdgeGeometry]);

  const selectedNode = nodeMap.get(selectedNodeId) ?? project.nodes[0];
  const selectedStatus = selectedNode
    ? (displayStatusByNode.get(selectedNode.id) ?? "blocked")
    : "blocked";
  const selectedDependencyStates = selectedNode
    ? selectedNode.requires.map((dependency) => dependencyState(dependency))
    : [];
  const selectedBlockers = selectedDependencyStates.filter(
    (state) =>
      state.dependency.strength === "hard" &&
      state.dependency.relation !== "finish_to_finish" &&
      state.applicable !== false &&
      !state.satisfied,
  );
  const finishRequirements = selectedDependencyStates.filter(
    (state) =>
      state.dependency.relation === "finish_to_finish" &&
      state.applicable !== false,
  );

  const downstream = useMemo(() => {
    if (!selectedNode) return [];
    const produced = new Set(selectedNode.produces);
    const directConsumers = project.nodes.filter((node) =>
      node.requires.some((dependency) => produced.has(dependency.artifact)),
    );
    return directConsumers.map((node) => {
      const blockers = getStartBlockers(node, produced);
      const activation = activationByNode.get(node.id);
      return {
        node,
        blockers,
        opens:
          activation === "active" &&
          node.status !== "completed" &&
          blockers.length === 0,
      };
    });
  }, [activationByNode, getStartBlockers, project.nodes, selectedNode]);

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

  const selectedIncomingArtifacts = useMemo(
    () => new Set(selectedNode?.requires.map((item) => item.artifact) ?? []),
    [selectedNode],
  );
  const selectedOutgoingArtifacts = useMemo(
    () => new Set(selectedNode?.produces ?? []),
    [selectedNode],
  );

  const setNodeRef = useCallback(
    (id: string) => (element: HTMLButtonElement | null) => {
      if (element) nodeRefs.current.set(id, element);
      else nodeRefs.current.delete(id);
    },
    [],
  );

  const handleNodeSelect = (node: MegaProjectNode) => {
    setSelectedNodeId(node.id);
    trackEvent("mega_project_node_selected", {
      project_id: project.id,
      node_id: node.id,
      node_status: displayStatusByNode.get(node.id),
    });
  };

  const handleRuleChange = (rule: string, value: MegaRuleValue) => {
    setRuleValues((current) => ({ ...current, [rule]: value }));
    trackEvent("mega_project_scenario_changed", {
      project_id: project.id,
      rule,
      value: ruleValueKey(value),
    });
  };

  const handleFilterChange = (nextFilter: BoardFilter) => {
    setFilter(nextFilter);
    trackEvent("mega_project_filter_changed", {
      project_id: project.id,
      filter: nextFilter,
    });
  };

  const isNodeEmphasized = (node: MegaProjectNode) => {
    if (node.id === selectedNodeId || filter === "all") return true;
    const status = displayStatusByNode.get(node.id);
    if (filter === "ready") return status === "ready" || status === "active";
    return node.classification === "protection_gate";
  };

  const graphStyle = {
    "--stage-count": project.stages.length,
  } as CSSProperties & { "--stage-count": number };

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="mega-project-title">
        <div className={styles.heroTopline}>
          <p>MEGA / PERMIT LAB · PROJECT 01</p>
          <span>기준일 {formatDate(project.asOfDate)}</span>
        </div>
        <div className={styles.heroGrid}>
          <div>
            <p className={styles.eyebrow}>구조 임계경로 · 선행조건 보드</p>
            <h1 id="mega-project-title">광주 반도체, 무엇이 지금 가능한가</h1>
            <p className={styles.summary}>{project.summary}</p>
          </div>
          <dl className={styles.scopeList}>
            <div>
              <dt>정책 입지</dt>
              <dd>{project.scope.location}</dd>
            </div>
            <div>
              <dt>발표 면적</dt>
              <dd>{project.scope.announcedArea}</dd>
            </div>
            <div>
              <dt>현재 경계</dt>
              <dd>{project.scope.boundaryStatus}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className={styles.statusStrip} aria-label="프로젝트 상태 요약">
        <div className={styles.statusIntro}>
          <span className={styles.liveDot} aria-hidden="true" />
          <strong>정책 발표 이후</strong>
          <span>30개 절차의 구조적 선후관계를 계산합니다.</span>
        </div>
        <dl className={styles.statusCounts}>
          <div>
            <dt>완료</dt>
            <dd>{counts.completed}</dd>
          </div>
          <div>
            <dt>진행</dt>
            <dd>{counts.active}</dd>
          </div>
          <div className={styles.readyCount}>
            <dt>지금 가능</dt>
            <dd>{counts.ready}</dd>
          </div>
          <div>
            <dt>조건 미정</dt>
            <dd>{counts.conditional}</dd>
          </div>
          <div>
            <dt>선행 대기</dt>
            <dd>{counts.blocked}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.controlBar} aria-label="경로 조건과 보기 설정">
        <div className={styles.ruleControls}>
          <div className={styles.controlLead}>
            <span>경로 조건</span>
            <small>공식 확인 전까지 미확정 유지</small>
          </div>
          {RULE_CONTROLS.map((control) => (
            <div className={styles.ruleControl} key={control.rule}>
              <span>{control.label}</span>
              <div className={styles.segmented}>
                {control.options.map((option) => {
                  const active = valuesEqual(
                    ruleValues[control.rule],
                    option.value,
                  );
                  return (
                    <button
                      key={ruleValueKey(option.value)}
                      type="button"
                      className={active ? styles.segmentActive : undefined}
                      aria-pressed={active}
                      onClick={() =>
                        handleRuleChange(control.rule, option.value)
                      }
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.filterControl} aria-label="경로 강조">
          {FILTERS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={filter === item.id ? styles.filterActive : undefined}
              aria-pressed={filter === item.id}
              onClick={() => handleFilterChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div className={styles.workspace}>
        <section className={styles.boardPanel} aria-labelledby="dependency-board-title">
          <div className={styles.boardHeading}>
            <div>
              <p>DEPENDENCY RAIL</p>
              <h2 id="dependency-board-title">행정절차 선행조건</h2>
            </div>
            <div className={styles.legend} aria-label="상태 범례">
              {(
                [
                  "completed",
                  "active",
                  "ready",
                  "conditional",
                  "blocked",
                ] as MegaDisplayStatus[]
              ).map((status) => (
                <span key={status} data-status={status}>
                  <i aria-hidden="true" />
                  {STATUS_META[status].shortLabel}
                </span>
              ))}
            </div>
          </div>

          <div className={styles.scrollHint} aria-hidden="true">
            좌우로 이동해 8개 행정 게이트를 확인하세요 →
          </div>
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
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3.5"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L7,3.5 L0,7 Z" />
                  </marker>
                  <marker
                    id="mega-arrow-focus"
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3.5"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L7,3.5 L0,7 Z" />
                  </marker>
                </defs>
                {edgeGeometry.map((edge) => {
                  const focused =
                    edge.source === selectedNodeId ||
                    edge.target === selectedNodeId ||
                    selectedIncomingArtifacts.has(edge.artifact) ||
                    selectedOutgoingArtifacts.has(edge.artifact);
                  return (
                    <path
                      key={edge.id}
                      d={edge.path}
                      className={styles.edge}
                      data-strength={edge.strength}
                      data-kind={edge.kind}
                      data-conditional={edge.conditional ? "true" : "false"}
                      data-focused={focused ? "true" : "false"}
                      markerEnd={
                        focused
                          ? "url(#mega-arrow-focus)"
                          : "url(#mega-arrow)"
                      }
                    />
                  );
                })}
              </svg>

              <div className={styles.stageGrid}>
                {project.stages.map((stage, stageIndex) => {
                  const stageNodes = project.nodes.filter(
                    (node) => node.stage === stage.id,
                  );
                  return (
                    <section className={styles.stage} key={stage.id}>
                      <header className={styles.stageHeader}>
                        <span>{String(stageIndex + 1).padStart(2, "0")}</span>
                        <h3>{stage.label}</h3>
                        <small>{stageNodes.length}개 절차</small>
                      </header>
                      <div className={styles.stageNodes}>
                        {stageNodes.map((node, nodeIndex) => {
                          const status =
                            displayStatusByNode.get(node.id) ?? "blocked";
                          const selected = node.id === selectedNodeId;
                          const emphasized = isNodeEmphasized(node);
                          return (
                            <button
                              key={node.id}
                              ref={setNodeRef(node.id)}
                              type="button"
                              className={styles.node}
                              data-status={status}
                              data-selected={selected ? "true" : "false"}
                              data-emphasized={emphasized ? "true" : "false"}
                              data-classification={node.classification}
                              aria-pressed={selected}
                              aria-label={`${node.name}, ${STATUS_META[status].label}`}
                              onClick={() => handleNodeSelect(node)}
                              style={
                                {
                                  "--node-index": nodeIndex,
                                } as CSSProperties & { "--node-index": number }
                              }
                            >
                              <span className={styles.nodeTopline}>
                                <span>{node.id}</span>
                                <span className={styles.nodeStatus}>
                                  {STATUS_META[status].shortLabel}
                                </span>
                              </span>
                              <strong>{node.name}</strong>
                              <span className={styles.nodeAuthority}>
                                {node.authority}
                              </span>
                              {node.classification === "protection_gate" && (
                                <span className={styles.protectionLabel}>
                                  보호절차
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
          <p className={styles.boardFootnote}>
            실선은 필수 선행조건, 흐린 선은 병렬·완료 조건입니다. 이 화면은
            기간 데이터가 아닌 구조상 선후관계를 계산하므로 “시간 임계경로”가
            아니라 “구조 임계경로”입니다.
          </p>
        </section>

        {selectedNode && (
          <aside className={styles.inspector} aria-live="polite">
            <div className={styles.inspectorSticky} key={selectedNode.id}>
              <div className={styles.inspectorTopline}>
                <span>{selectedNode.id}</span>
                <span data-status={selectedStatus}>
                  {STATUS_META[selectedStatus].label}
                </span>
              </div>
              <h2>{selectedNode.name}</h2>
              <p className={styles.inspectorAuthority}>
                {selectedNode.authority}
              </p>

              <dl className={styles.nodeMeta}>
                <div>
                  <dt>유형</dt>
                  <dd>
                    {CLASSIFICATION_LABELS[selectedNode.classification]}
                  </dd>
                </div>
                <div>
                  <dt>근거 수준</dt>
                  <dd>{CONFIDENCE_LABELS[selectedNode.confidence]}</dd>
                </div>
                {selectedNode.actual?.completedOn && (
                  <div>
                    <dt>확인일</dt>
                    <dd>{formatDate(selectedNode.actual.completedOn)}</dd>
                  </div>
                )}
              </dl>

              <section className={styles.inspectorSection}>
                <h3>지금 막는 조건</h3>
                {selectedBlockers.length === 0 ? (
                  <p className={styles.clearState}>
                    <span aria-hidden="true">✓</span>
                    {getClearStateMessage(selectedStatus)}
                  </p>
                ) : (
                  <ul className={styles.conditionList}>
                    {selectedBlockers.map((state, index) => (
                      <li key={`${state.dependency.artifact}-${index}`}>
                        <span
                          className={styles.conditionIcon}
                          data-unknown={
                            state.applicable === "unknown" ? "true" : "false"
                          }
                          aria-hidden="true"
                        >
                          {state.applicable === "unknown" ? "?" : index + 1}
                        </span>
                        <div>
                          <strong>
                            {formatArtifactLabel(
                              state.dependency.artifact,
                              artifactMap,
                            )}
                          </strong>
                          <span>
                            {state.applicable === "unknown"
                              ? "경로 적용 여부부터 확인 필요"
                              : `${KIND_LABELS[state.dependency.kind]} · ${RELATION_LABELS[state.dependency.relation]}`}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {finishRequirements.length > 0 && (
                  <div className={styles.finishGate}>
                    <strong>병렬 진행하되 완료 전 확인</strong>
                    {finishRequirements.map((state) => (
                      <span key={state.dependency.artifact}>
                        {formatArtifactLabel(
                          state.dependency.artifact,
                          artifactMap,
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section className={styles.inspectorSection}>
                <h3>완료되면 열리는 절차</h3>
                {downstream.length === 0 ? (
                  <p className={styles.emptyState}>직접 이어지는 후속 절차가 없습니다.</p>
                ) : (
                  <ul className={styles.downstreamList}>
                    {downstream.map(({ node, blockers, opens }) => (
                      <li key={node.id}>
                        <button type="button" onClick={() => handleNodeSelect(node)}>
                          <span>{node.id}</span>
                          <strong>{node.name}</strong>
                          <small data-opens={opens ? "true" : "false"}>
                            {opens
                              ? "즉시 착수 가능"
                              : `남은 필수조건 ${blockers.length}개`}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {(selectedNode.note || selectedNode.verificationNeeded) && (
                <section className={styles.inspectorSection}>
                  <h3>판단 메모</h3>
                  {selectedNode.note && <p>{selectedNode.note}</p>}
                  {selectedNode.verificationNeeded && (
                    <p className={styles.verificationNote}>
                      <strong>추가 확인</strong>
                      {selectedNode.verificationNeeded}
                    </p>
                  )}
                </section>
              )}

              <section className={styles.inspectorSection}>
                <h3>생성되는 행정 산출물</h3>
                <div className={styles.artifactList}>
                  {selectedNode.produces.map((artifact) => (
                    <span key={artifact}>
                      {formatArtifactLabel(artifact, artifactMap)}
                    </span>
                  ))}
                </div>
              </section>

              {selectedNode.templateRefs && selectedNode.templateRefs.length > 0 && (
                <section className={styles.inspectorSection}>
                  <h3>Korea100 제도 모델</h3>
                  <div className={styles.templateLinks}>
                    {selectedNode.templateRefs.map((reference) => (
                      <Link
                        key={reference.institution}
                        href={`/model/${reference.institution}/`}
                      >
                        <span>{templates[reference.institution]}</span>
                        <small>
                          {reference.nodeIds?.length
                            ? `${reference.nodeIds.join(" · ")} 연결`
                            : "전체 모델 연결"}
                        </small>
                        <b aria-hidden="true">↗</b>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <section className={styles.inspectorSection}>
                <h3>공식 근거</h3>
                <ol className={styles.sourceList}>
                  {selectedNode.evidence.map((sourceId) => {
                    const source = sourceMap.get(sourceId);
                    if (!source) return null;
                    return (
                      <li key={source.id}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() =>
                            trackEvent("mega_project_source_opened", {
                              project_id: project.id,
                              node_id: selectedNode.id,
                              source_id: source.id,
                            })
                          }
                        >
                          <span>{source.title}</span>
                          <small>
                            {source.publishedOn
                              ? formatDate(source.publishedOn)
                              : source.effectiveOn
                                ? `시행 ${formatDate(source.effectiveOn)}`
                                : "현행 법령"}
                          </small>
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
