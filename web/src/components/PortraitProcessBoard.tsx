"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ProcessEdge,
  ProcessLaneGroup,
  ProcessModel,
  ProcessNode,
  SourceVerification,
} from "@/lib/types";
import { ProcessVerificationSummaryBar } from "./ProcessVerification";
import {
  Legend,
  MobileProcessFlow,
  NodeDrawer,
  SwimlaneNodeCard,
  stageStatus,
} from "./SwimlaneBoard";

interface PortraitEdgePath {
  edge: ProcessEdge;
  path: string;
  labelX?: number;
  labelY?: number;
}

const STAGE_LABEL_WIDTH = 132;
const MIN_GROUP_WIDTH = 218;
const EMBEDDED_STAGE_LABEL_WIDTH = 84;
const EMBEDDED_GROUP_WIDTH = 196;
const ARROW_CLEARANCE = 7;

export default function PortraitProcessBoard({
  process,
  verification,
  laneGroups,
  initialNodeId,
  onNodeChange,
  embedded = false,
  showDrawer = true,
}: {
  process: ProcessModel;
  verification?: SourceVerification;
  laneGroups?: ProcessLaneGroup[];
  initialNodeId?: string;
  onNodeChange?: (nodeId: string | null) => void;
  embedded?: boolean;
  showDrawer?: boolean;
}) {
  const stageLabelWidth = embedded
    ? EMBEDDED_STAGE_LABEL_WIDTH
    : STAGE_LABEL_WIDTH;
  const minGroupWidth = embedded ? EMBEDDED_GROUP_WIDTH : MIN_GROUP_WIDTH;
  const groups = useMemo(
    () => laneGroups?.length ? laneGroups : fallbackGroups(process.lanes),
    [laneGroups, process.lanes]
  );
  const groupByLane = useMemo(
    () =>
      new Map(
        groups.flatMap((group, groupIndex) =>
          group.lanes.map((lane) => [lane, groupIndex] as const)
        )
      ),
    [groups]
  );
  const nodeById = useMemo(
    () => new Map(process.nodes.map((node) => [node.id, node])),
    [process.nodes]
  );
  const [activeNode, setActiveNode] = useState<ProcessNode | null>(() =>
    process.nodes.find((node) => node.id === initialNodeId) ?? null
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [edgePaths, setEdgePaths] = useState<PortraitEdgePath[]>([]);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const boardRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());
  const stageRefs = useRef<Map<string, HTMLElement>>(new Map());

  const computeEdges = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    setSvgSize({ width: board.scrollWidth, height: board.scrollHeight });
    setEdgePaths(
      buildPortraitEdgePaths(
        process.edges,
        nodeById,
        process.stages,
        groupByLane,
        nodeRefs.current,
        stageRefs.current,
        board,
        stageLabelWidth,
      )
    );
  }, [groupByLane, nodeById, process.edges, process.stages, stageLabelWidth]);

  useLayoutEffect(() => {
    computeEdges();
    const observer = new ResizeObserver(computeEdges);
    if (boardRef.current) observer.observe(boardRef.current);
    return () => observer.disconnect();
  }, [computeEdges]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(computeEdges);
    return () => window.cancelAnimationFrame(frame);
  }, [computeEdges]);

  const handleNodeClick = useCallback(
    (node: ProcessNode) => {
      setActiveNode(node);
      onNodeChange?.(node.id);
    },
    [onNodeChange]
  );
  const handleClose = useCallback(() => {
    setActiveNode(null);
    onNodeChange?.(null);
  }, [onNodeChange]);
  const handleStageClick = useCallback((stage: string) => {
    const target = stageRefs.current.get(stage);
    if (!target) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    target.scrollIntoView({
      block: "center",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, []);
  const handleBoardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      boardScrollRef.current?.scrollBy({
        left: event.key === "ArrowRight" ? 160 : -160,
        behavior: "auto",
      });
    },
    []
  );

  const connectedEdgeIds = new Set<string>();
  const connectedNodeIds = new Set<string>();
  if (hoveredNodeId) {
    for (const edge of process.edges) {
      if (edge.source === hoveredNodeId || edge.target === hoveredNodeId) {
        connectedEdgeIds.add(edge.id);
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
      }
    }
  }

  const minGridWidth = stageLabelWidth + groups.length * minGroupWidth;

  return (
    <div className="portrait-process-board" data-embedded={embedded ? "true" : undefined}>
      {!embedded && (
        <ProcessVerificationSummaryBar
          process={process}
          verification={verification}
        />
      )}

      <div className="portrait-process-desktop-view">
        {!embedded && <nav className="portrait-stage-nav" aria-label="업무 단계 바로가기">
          {process.stages.map((stage) => {
            const [code, ...label] = stage.split(" ");
            return (
              <button
                key={stage}
                type="button"
                data-status={stageStatus(stage, process.nodes)}
                onClick={() => handleStageClick(stage)}
              >
                <span>{code}</span>
                <strong>{label.join(" ")}</strong>
              </button>
            );
          })}
        </nav>}

        <div
          ref={boardScrollRef}
          className="portrait-process-scroll"
          role="region"
          aria-label="세로형 업무구조도 탐색 영역"
          tabIndex={0}
          onKeyDown={handleBoardKeyDown}
        >
          <div
            ref={boardRef}
            className="portrait-process-grid"
            style={{
              gridTemplateColumns: `${stageLabelWidth}px repeat(${groups.length}, minmax(${minGroupWidth}px, 1fr))`,
              minWidth: minGridWidth,
            }}
          >
            {svgSize.width > 0 && (
              <svg
                className="portrait-process-edges"
                aria-hidden="true"
                width={svgSize.width}
                height={svgSize.height}
              >
                <defs>
                  <PortraitArrowMarker id="portrait-arr-sequence" color="#55685e" />
                  <PortraitArrowMarker id="portrait-arr-message" color="#0d8a63" />
                  <PortraitArrowMarker id="portrait-arr-loop" color="#2563eb" />
                </defs>
                {edgePaths.map(({ edge, path, labelX, labelY }) => {
                  const color = edgeColor(edge.type);
                  const highlighted = hoveredNodeId
                    ? connectedEdgeIds.has(edge.id)
                    : false;
                  const dimmed = hoveredNodeId !== null && !highlighted;
                  const labelWidth = edge.label
                    ? Math.max(58, Array.from(edge.label).length * 7 + 16)
                    : 0;
                  return (
                    <g
                      key={edge.id}
                      opacity={dimmed ? 0.12 : highlighted ? 1 : 0.92}
                    >
                      <path
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth={highlighted ? 3 : edge.type === "loop" ? 2.5 : 2.2}
                        strokeDasharray={edgeDash(edge.type)}
                        markerEnd={`url(#portrait-arr-${edge.type})`}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {edge.label && labelX !== undefined && labelY !== undefined && (
                        <g>
                          <rect
                            x={labelX - labelWidth / 2}
                            y={labelY - 9}
                            width={labelWidth}
                            height={19}
                            rx={4}
                            fill="#ffffff"
                            stroke={color}
                            strokeWidth={0.7}
                          />
                          <text
                            x={labelX}
                            y={labelY + 5}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={650}
                            fill={color}
                          >
                            {edge.label}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}

            <div className="portrait-corner-cell">
              <strong>{embedded ? "게이트" : "단계 ↓"}</strong>
              <span>{embedded ? "↓" : "행위자 묶음 →"}</span>
            </div>

            {groups.map((group) => (
              <div
                key={group.id}
                className="portrait-group-header"
                style={{ "--portrait-group-accent": group.accent } as React.CSSProperties}
              >
                <strong>{group.title}</strong>
                <span title={group.lanes.join(" · ")}>{group.lanes.join(" · ")}</span>
              </div>
            ))}

            {process.stages.flatMap((stage, stageIndex) => {
              const [code, ...label] = stage.split(" ");
              const status = stageStatus(stage, process.nodes);
              return [
                <div
                  key={`stage-${stage}`}
                  ref={(element) => {
                    if (element) stageRefs.current.set(stage, element);
                    else stageRefs.current.delete(stage);
                  }}
                  className="portrait-stage-label"
                  data-status={status}
                  style={{ gridColumn: 1, gridRow: stageIndex + 2 }}
                >
                  <span className="mono">{code}</span>
                  <strong>{label.join(" ")}</strong>
                </div>,
                ...groups.map((group, groupIndex) => {
                  const cellNodes = process.nodes.filter(
                    (node) => node.stage === stage && group.lanes.includes(node.lane)
                  );
                  return (
                    <div
                      key={`${stage}-${group.id}`}
                      className="portrait-stage-cell"
                      data-current={status === "current"}
                      style={{
                        gridColumn: groupIndex + 2,
                        gridRow: stageIndex + 2,
                      }}
                    >
                      {cellNodes.map((node) => {
                        const hoverActive = hoveredNodeId !== null;
                        const connected = connectedNodeIds.has(node.id);
                        const current = hoveredNodeId === node.id;
                        const selected = activeNode?.id === node.id;
                        return (
                          <SwimlaneNodeCard
                            key={node.id}
                            node={node}
                            verification={verification}
                            onClick={handleNodeClick}
                            highlighted={selected || (hoverActive && (current || connected))}
                            dimmed={hoverActive && !current && !connected}
                            onHover={() => setHoveredNodeId(node.id)}
                            onLeave={() => setHoveredNodeId(null)}
                            setRef={(element) => {
                              if (element) nodeRefs.current.set(node.id, element);
                              else nodeRefs.current.delete(node.id);
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                }),
              ];
            })}
          </div>
        </div>

        <p className="portrait-layout-disclosure">
          원래 {process.lanes.length}개 행위자 레인을 {groups.length}개 레이아웃 묶음으로 배치했습니다.
        </p>
        <Legend />
      </div>

      {!embedded && <div className="portrait-process-mobile-view">
        <MobileProcessFlow
          process={process}
          verification={verification}
          onNodeClick={handleNodeClick}
        />
        <Legend />
      </div>}

      {showDrawer && activeNode && (
        <NodeDrawer
          node={activeNode}
          edges={process.edges}
          verification={verification}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

function PortraitArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      markerWidth={14}
      markerHeight={11}
      refX={12}
      refY={5.5}
      orient="auto"
      markerUnits="userSpaceOnUse"
    >
      <path
        d="M1,1 L13,5.5 L1,10 Z"
        fill={color}
        stroke="#ffffff"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </marker>
  );
}

function buildPortraitEdgePaths(
  edges: ProcessEdge[],
  nodeById: Map<string, ProcessNode>,
  stages: string[],
  groupByLane: Map<string, number>,
  nodeElements: Map<string, HTMLElement>,
  stageElements: Map<string, HTMLElement>,
  board: HTMLElement,
  stageLabelWidth: number,
): PortraitEdgePath[] {
  const boardRect = board.getBoundingClientRect();
  const stageIndex = new Map(stages.map((stage, index) => [stage, index]));

  return edges.flatMap((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceElement = nodeElements.get(edge.source);
    const targetElement = nodeElements.get(edge.target);
    if (!sourceNode || !targetNode || !sourceElement || !targetElement) return [];

    const source = relativeRect(sourceElement, boardRect);
    const target = relativeRect(targetElement, boardRect);
    const sourceStageIndex = stageIndex.get(sourceNode.stage) ?? 0;
    const targetStageIndex = stageIndex.get(targetNode.stage) ?? 0;
    const sourceGroupIndex = groupByLane.get(sourceNode.lane) ?? 0;
    const targetGroupIndex = groupByLane.get(targetNode.lane) ?? 0;
    const sourceRowElement = stageElements.get(sourceNode.stage);
    const targetRowElement = stageElements.get(targetNode.stage);
    if (!sourceRowElement || !targetRowElement) return [];
    const sourceRow = relativeRect(sourceRowElement, boardRect);
    const targetRow = relativeRect(targetRowElement, boardRect);
    const route = portraitRoute({
      edge,
      source,
      target,
      sourceRow,
      targetRow,
      sourceStageIndex,
      targetStageIndex,
      sourceGroupIndex,
      targetGroupIndex,
      stageLabelWidth,
    });
    return [{ edge, ...route }];
  });
}

function portraitRoute({
  edge,
  source,
  target,
  sourceRow,
  targetRow,
  sourceStageIndex,
  targetStageIndex,
  sourceGroupIndex,
  targetGroupIndex,
  stageLabelWidth,
}: {
  edge: ProcessEdge;
  source: Rect;
  target: Rect;
  sourceRow: Rect;
  targetRow: Rect;
  sourceStageIndex: number;
  targetStageIndex: number;
  sourceGroupIndex: number;
  targetGroupIndex: number;
  stageLabelWidth: number;
}) {
  const sourceCenterX = source.left + source.width / 2;
  const sourceCenterY = source.top + source.height / 2;
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const messageOffset = edge.type === "message" ? 10 : 0;

  if (sourceStageIndex === targetStageIndex && sourceGroupIndex === targetGroupIndex) {
    if (edge.type === "message") {
      const sideX = source.right + 18;
      return {
        path: `M ${round(source.right)} ${round(sourceCenterY)} H ${round(sideX)} V ${round(targetCenterY)} H ${round(target.right + ARROW_CLEARANCE)}`,
        labelX: sideX + 36,
        labelY: (sourceCenterY + targetCenterY) / 2,
      };
    }
    const downward = target.top >= source.bottom;
    return {
      path: downward
        ? `M ${round(sourceCenterX)} ${round(source.bottom)} V ${round(target.top - ARROW_CLEARANCE)}`
        : `M ${round(source.left)} ${round(sourceCenterY)} H ${round(sourceRow.left + stageLabelWidth - 12)} V ${round(targetCenterY)} H ${round(target.left - ARROW_CLEARANCE)}`,
      labelX: downward ? source.right + 34 : sourceRow.left + stageLabelWidth + 40,
      labelY: (sourceCenterY + targetCenterY) / 2,
    };
  }

  if (sourceStageIndex === targetStageIndex) {
    const channelY = sourceRow.bottom - 19 - (edge.type === "message" ? 8 : 0);
    return {
      path: `M ${round(sourceCenterX + messageOffset)} ${round(source.bottom)} V ${round(channelY)} H ${round(targetCenterX + messageOffset)} V ${round(target.bottom + ARROW_CLEARANCE)}`,
      labelX: (sourceCenterX + targetCenterX) / 2,
      labelY: channelY - 11,
    };
  }

  if (targetStageIndex > sourceStageIndex) {
    const channelY = sourceRow.bottom - 18 - (edge.type === "message" ? 9 : 0);
    return {
      path: `M ${round(sourceCenterX + messageOffset)} ${round(source.bottom)} V ${round(channelY)} H ${round(targetCenterX + messageOffset)} V ${round(target.top - ARROW_CLEARANCE)}`,
      labelX: (sourceCenterX + targetCenterX) / 2,
      labelY: channelY - 11,
    };
  }

  const railX = sourceRow.left + stageLabelWidth - 12;
  const channelY = targetRow.bottom - 22;
  return {
    path: `M ${round(source.left)} ${round(sourceCenterY)} H ${round(railX)} V ${round(channelY)} H ${round(targetCenterX)} V ${round(target.bottom + ARROW_CLEARANCE)}`,
    labelX: railX + 42,
    labelY: (sourceCenterY + channelY) / 2,
  };
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function relativeRect(element: HTMLElement, boardRect: DOMRect): Rect {
  const rect = element.getBoundingClientRect();
  const left = rect.left - boardRect.left;
  const top = rect.top - boardRect.top;
  return {
    left,
    top,
    right: left + rect.width,
    bottom: top + rect.height,
    width: rect.width,
    height: rect.height,
  };
}

function fallbackGroups(lanes: string[]): ProcessLaneGroup[] {
  const accents = ["#0f9f72", "#3b82f6", "#c78116", "#0891b2"];
  const groupCount = Math.min(4, lanes.length);
  const sizes = Array.from(
    { length: groupCount },
    () => Math.floor(lanes.length / groupCount)
  );
  const order = [2, 1, 0, 3].filter((index) => index < groupCount);
  for (let index = 0; index < lanes.length % groupCount; index += 1) {
    sizes[order[index] ?? index] += 1;
  }
  let cursor = 0;
  return sizes.map((size, index) => {
    const groupLanes = lanes.slice(cursor, cursor + size);
    cursor += size;
    return {
      id: `fallback-${index + 1}`,
      title: groupLanes[0],
      lanes: groupLanes,
      accent: accents[index],
    };
  });
}

function edgeColor(type: ProcessEdge["type"]) {
  if (type === "loop") return "#2563eb";
  if (type === "message") return "#0d8a63";
  return "#55685e";
}

function edgeDash(type: ProcessEdge["type"]) {
  if (type === "message") return "7 5";
  if (type === "loop") return "6 4";
  return undefined;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
