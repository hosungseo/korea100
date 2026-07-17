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
import { buildProcessEdgeRouteSlots } from "@/lib/process-layout.mjs";
import { ProcessVerificationSummaryBar } from "./ProcessVerification";
import {
  Legend,
  MobileProcessFlow,
  NodeDrawer,
  SwimlaneNodeCard,
  stageStatus,
} from "./SwimlaneBoard";
import { ARROW_HEAD, EDGE_TYPE_COLORS, EDGE_LINE_COLORS, EDGE_DASH } from "@/lib/edge-style.mjs";

interface PortraitEdgePath {
  edge: ProcessEdge;
  path: string;
  labelX?: number;
  labelY?: number;
}

const STAGE_LABEL_WIDTH = 132;
const MIN_GROUP_WIDTH = 218;
const EMBEDDED_STAGE_LABEL_WIDTH = 64;
const ARROW_CLEARANCE = 7;
const EDGE_PORT_GAP = 14;
const EDGE_CHANNEL_GAP = 12;
const EDGE_RAIL_GAP = 6;
const EDGE_RAIL_INSET = 4;

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
  const groups = useMemo(
    () => laneGroups?.length ? laneGroups : fallbackGroups(process.lanes),
    [laneGroups, process.lanes]
  );
  const lanePageStarts = useMemo(() => {
    if (groups.length === 0) return [];
    if (groups.length <= 2) return [0];
    return [0, groups.length - 2];
  }, [groups.length]);
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
  const [activeLanePage, setActiveLanePage] = useState(0);
  const [boardScrollLeft, setBoardScrollLeft] = useState(0);
  const [actorStrip, setActorStrip] = useState<
    { id: string; title: string; left: number; width: number }[]
  >([]);
  const [showActorSticky, setShowActorSticky] = useState(false);
  const [edgePaths, setEdgePaths] = useState<PortraitEdgePath[]>([]);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const boardRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const groupHeaderRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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

  // 행위자 헤더 틀고정용 측정: overflow-x 스크롤 컨테이너가 sticky 기준을
  // 가로채 세로 sticky가 무력화되므로, 스크롤 밖 스티키 스트립을
  // 헤더 실측 위치와 동기화해 렌더한다.
  useEffect(() => {
    const measure = () => {
      const next = groups
        .map((group) => {
          const el = groupHeaderRefs.current.get(group.id);
          if (!el) return null;
          return { id: group.id, title: group.title, left: el.offsetLeft, width: el.offsetWidth };
        })
        .filter((v): v is { id: string; title: string; left: number; width: number } => v !== null);
      setActorStrip(next);
    };
    measure();
    const onScroll = () => {
      const first = groupHeaderRefs.current.values().next().value as
        | HTMLElement
        | undefined;
      if (!first) return;
      // 원본 헤더가 사이트 헤더(52px) 아래로 완전히 지나갔을 때만 클론 표시
      setShowActorSticky(first.getBoundingClientRect().bottom < 52);
    };
    onScroll();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
    };
  }, [groups]);

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

  const scrollToLanePage = useCallback(
    (pageIndex: number) => {
      const scroller = boardScrollRef.current;
      if (!scroller || lanePageStarts.length === 0) return;
      const nextPage = Math.max(
        0,
        Math.min(pageIndex, lanePageStarts.length - 1)
      );
      const group = groups[lanePageStarts[nextPage]];
      const header = group ? groupHeaderRefs.current.get(group.id) : null;
      if (!header) return;
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      scroller.scrollTo({
        left: Math.min(
          maxScroll,
          Math.max(0, header.offsetLeft - stageLabelWidth)
        ),
        behavior: reducedMotion ? "auto" : "smooth",
      });
    },
    [groups, lanePageStarts, stageLabelWidth]
  );

  const handleBoardScroll = useCallback(() => {
    const scroller = boardScrollRef.current;
    if (!scroller) return;
    setBoardScrollLeft(scroller.scrollLeft);
    if (lanePageStarts.length <= 1) return;
    const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    let nearestPage = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    lanePageStarts.forEach((groupIndex, pageIndex) => {
      const group = groups[groupIndex];
      const header = group ? groupHeaderRefs.current.get(group.id) : null;
      if (!header) return;
      const target = Math.min(
        maxScroll,
        Math.max(0, header.offsetLeft - stageLabelWidth)
      );
      const distance = Math.abs(scroller.scrollLeft - target);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPage = pageIndex;
      }
    });
    setActiveLanePage((current) =>
      current === nearestPage ? current : nearestPage
    );
  }, [groups, lanePageStarts, stageLabelWidth]);

  const handleBoardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      scrollToLanePage(
        activeLanePage + (event.key === "ArrowRight" ? 1 : -1)
      );
    },
    [activeLanePage, scrollToLanePage]
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

  const embeddedGroupWidthSum = groups
    .map(() => "var(--portrait-group-width)")
    .join(" + ");
  const embeddedMinGridWidth = embeddedGroupWidthSum
    ? `calc(var(--portrait-stage-width) + ${embeddedGroupWidthSum})`
    : "var(--portrait-stage-width)";

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

        {embedded && lanePageStarts.length > 1 && (
          <nav className="portrait-lane-pager" aria-label="행위자 묶음 보기">
            <span>행위자 묶음</span>
            <div>
              {lanePageStarts.map((groupIndex, pageIndex) => {
                const pageGroups = groups.slice(groupIndex, groupIndex + 2);
                const pageEnd = Math.min(groupIndex + 2, groups.length);
                const pageTitle = pageGroups.map((group) => group.title).join(" · ");
                return (
                  <button
                    key={groupIndex}
                    type="button"
                    aria-label={`${pageTitle} 보기`}
                    aria-pressed={activeLanePage === pageIndex}
                    title={pageTitle}
                    onClick={() => scrollToLanePage(pageIndex)}
                  >
                    행위자 {groupIndex + 1}–{pageEnd}
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        {showActorSticky && actorStrip.length > 0 && (
          <div className="portrait-actor-sticky" aria-hidden="true">
            {/* 원본 행위자 헤더 셀의 클론 — 같은 클래스·같은 내용으로 고정 표시 */}
            <div
              className="portrait-corner-cell"
              style={{ width: stageLabelWidth, flexShrink: 0 }}
            >
              <strong>{embedded ? "게이트" : "단계 ↓"}</strong>
              <span>{embedded ? "↓" : "행위자 묶음 →"}</span>
            </div>
            <div className="portrait-actor-sticky-track">
              {actorStrip.map((g) => {
                const group = groups.find((x) => x.id === g.id);
                if (!group) return null;
                return (
                  <div
                    key={g.id}
                    className="portrait-group-header"
                    style={
                      {
                        left: g.left - stageLabelWidth - boardScrollLeft,
                        width: g.width,
                        "--portrait-group-accent": group.accent,
                      } as React.CSSProperties
                    }
                  >
                    <strong>{group.title}</strong>
                    <span title={group.lanes.join(" · ")}>{group.lanes.join(" · ")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div
          ref={boardScrollRef}
          className="portrait-process-scroll"
          role="region"
          aria-label="세로형 업무구조도 탐색 영역"
          tabIndex={0}
          onKeyDown={handleBoardKeyDown}
          onScroll={handleBoardScroll}
        >
          <div
            ref={boardRef}
            className="portrait-process-grid"
            style={
              embedded
                ? ({
                    "--portrait-stage-width": `${stageLabelWidth}px`,
                    gridTemplateColumns: `var(--portrait-stage-width) repeat(${groups.length}, minmax(var(--portrait-group-width), 1fr))`,
                    minWidth: embeddedMinGridWidth,
                  } as React.CSSProperties)
                : {
                    gridTemplateColumns: `${stageLabelWidth}px repeat(${groups.length}, minmax(${MIN_GROUP_WIDTH}px, 1fr))`,
                    minWidth: stageLabelWidth + groups.length * MIN_GROUP_WIDTH,
                  }
            }
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
                {edgePaths.map(({ edge, path }) => {
                  const color = edgeColor(edge.type);
                  const highlighted = hoveredNodeId
                    ? connectedEdgeIds.has(edge.id)
                    : false;
                  const dimmed = hoveredNodeId !== null && !highlighted;
                  // 선 굵기 PC(1.15/1.8)와 통일
                  const strokeWidth = highlighted ? 1.8 : 1.15;
                  return (
                    <g
                      key={edge.id}
                      opacity={dimmed ? 0.12 : highlighted ? 1 : 0.92}
                    >
                      <path
                        d={path}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth={strokeWidth + 2.8}
                        strokeDasharray={edgeDash(edge.type)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={edgeDash(edge.type)}
                        markerEnd={`url(#portrait-arr-${edge.type})`}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  );
                })}
{/* 관계 라벨은 데스크톱 보드와 동일하게 렌더하지 않는다 —
                    모바일 밀집 레이아웃에서 카드에 가려지고 가장자리에서 잘려
                    오히려 혼란을 준다 (2026-07-17 운영자 결정) */}
              </svg>
            )}

            <div className="portrait-corner-cell">
              <strong>{embedded ? "게이트" : "단계 ↓"}</strong>
              <span>{embedded ? "↓" : "행위자 묶음 →"}</span>
            </div>

            {groups.map((group, groupIndex) => (
              <div
                key={group.id}
                ref={(element) => {
                  if (element) groupHeaderRefs.current.set(group.id, element);
                  else groupHeaderRefs.current.delete(group.id);
                }}
                className="portrait-group-header"
                data-page-start={
                  lanePageStarts.includes(groupIndex) ? "true" : undefined
                }
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
                            variant="grid"
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
      markerWidth={ARROW_HEAD.width}
      markerHeight={ARROW_HEAD.height}
      refX={ARROW_HEAD.refX}
      refY={ARROW_HEAD.refY}
      orient="auto"
      markerUnits="userSpaceOnUse"
    >
      <path
        d={ARROW_HEAD.d}
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
  const groupCount = Math.max(0, ...groupByLane.values()) + 1;
  const nodeRects = new Map(
    [...nodeElements].map(([nodeId, element]) => [
      nodeId,
      relativeRect(element, boardRect),
    ])
  );
  const edgeRouteSlots = buildProcessEdgeRouteSlots(
    edges,
    new Map(
      [...nodeById].map(([nodeId, node]) => [
        nodeId,
        {
          stageIndex: stageIndex.get(node.stage) ?? 0,
          groupIndex: groupByLane.get(node.lane) ?? 0,
        },
      ])
    )
  );

  return edges.flatMap((edge) => {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceElement = nodeElements.get(edge.source);
    const targetElement = nodeElements.get(edge.target);
    if (!sourceNode || !targetNode || !sourceElement || !targetElement) return [];

    const source = nodeRects.get(edge.source);
    const target = nodeRects.get(edge.target);
    if (!source || !target) return [];
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
      slot: edgeRouteSlots.get(edge.id),
      source,
      target,
      sourceRow,
      targetRow,
      sourceStageIndex,
      targetStageIndex,
      sourceGroupIndex,
      targetGroupIndex,
      stageLabelWidth,
      groupCount,
      boardWidth: boardRect.width,
      nodeRects,
    });
    return [{ edge, ...route }];
  });
}

function portraitRoute({
  edge,
  slot,
  source,
  target,
  sourceRow,
  targetRow,
  sourceStageIndex,
  targetStageIndex,
  sourceGroupIndex,
  targetGroupIndex,
  stageLabelWidth,
  groupCount,
  boardWidth,
  nodeRects,
}: {
  edge: ProcessEdge;
  slot?: {
    sourcePort: number;
    targetPort: number;
    channel: number;
    rail: number;
    railSide: -1 | 1;
    approach: number;
    sourceChannel: number;
    targetChannel: number;
    backRail: number;
  };
  source: Rect;
  target: Rect;
  sourceRow: Rect;
  targetRow: Rect;
  sourceStageIndex: number;
  targetStageIndex: number;
  sourceGroupIndex: number;
  targetGroupIndex: number;
  stageLabelWidth: number;
  groupCount: number;
  boardWidth: number;
  nodeRects: Map<string, Rect>;
}) {
  const sourceCenterX = source.left + source.width / 2;
  const sourceCenterY = source.top + source.height / 2;
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const routeSlot = slot ?? {
    sourcePort: 0,
    targetPort: 0,
    channel: 0,
    rail: 0,
    railSide: 1,
    approach: 0,
    sourceChannel: 0,
    targetChannel: 0,
    backRail: 0,
  };
  const sourcePortX =
    sourceCenterX +
    routeSlot.sourcePort * EDGE_PORT_GAP +
    alternatingSlotOffset(routeSlot.sourceChannel) * 3 +
    alternatingSlotOffset(routeSlot.channel) * 3;
  const targetPortX =
    targetCenterX +
    routeSlot.targetPort * EDGE_PORT_GAP +
    alternatingSlotOffset(routeSlot.targetChannel) * 3 +
    alternatingSlotOffset(routeSlot.channel) * 3;

  if (sourceStageIndex === targetStageIndex && sourceGroupIndex === targetGroupIndex) {
    if (edge.type === "message") {
      const sideX = source.right + 18 + routeSlot.channel * EDGE_RAIL_GAP;
      const sourceSideY =
        sourceCenterY +
        portraitSidePortOffset(routeSlot.sourcePort, routeSlot.sourceChannel);
      const targetSideY =
        targetCenterY +
        portraitSidePortOffset(routeSlot.targetPort, routeSlot.targetChannel);
      return {
        path: `M ${round(source.right)} ${round(sourceSideY)} H ${round(sideX)} V ${round(targetSideY)} H ${round(target.right + ARROW_CLEARANCE)}`,
        labelX: sideX + 36,
        labelY: (sourceSideY + targetSideY) / 2,
      };
    }
    const downward = target.top >= source.bottom;
    const middleY = (source.bottom + target.top) / 2;
    return {
      path: downward
        ? Math.abs(sourcePortX - targetPortX) < 1
          ? `M ${round(sourcePortX)} ${round(source.bottom)} V ${round(target.top - ARROW_CLEARANCE)}`
          : `M ${round(sourcePortX)} ${round(source.bottom)} V ${round(middleY)} H ${round(targetPortX)} V ${round(target.top - ARROW_CLEARANCE)}`
        : `M ${round(source.left)} ${round(sourceCenterY)} H ${round(sourceRow.left + stageLabelWidth - 12 - routeSlot.backRail * EDGE_RAIL_GAP)} V ${round(targetCenterY)} H ${round(target.left - ARROW_CLEARANCE)}`,
      labelX: downward ? source.right + 34 : sourceRow.left + stageLabelWidth + 40,
      labelY: (sourceCenterY + targetCenterY) / 2,
    };
  }

  if (sourceStageIndex === targetStageIndex) {
    const forward = targetGroupIndex > sourceGroupIndex;
    const sourceSideY =
      sourceCenterY +
      portraitSidePortOffset(routeSlot.sourcePort, routeSlot.sourceChannel);
    const targetSideY =
      targetCenterY +
      portraitSidePortOffset(routeSlot.targetPort, routeSlot.targetChannel);
    const channelX = forward
      ? target.left - 18 - routeSlot.channel * EDGE_RAIL_GAP
      : target.right + 18 + routeSlot.channel * EDGE_RAIL_GAP;
    return {
      path: forward
        ? `M ${round(source.right)} ${round(sourceSideY)} H ${round(channelX)} V ${round(targetSideY)} H ${round(target.left - ARROW_CLEARANCE)}`
        : `M ${round(source.left)} ${round(sourceSideY)} H ${round(channelX)} V ${round(targetSideY)} H ${round(target.right + ARROW_CLEARANCE)}`,
      labelX: forward
        ? (source.right + target.left) / 2
        : (source.left + target.right) / 2,
      labelY: (sourceSideY + targetSideY) / 2 - 11,
    };
  }

  if (targetStageIndex > sourceStageIndex) {
    const channelY =
      sourceRow.bottom - 18 - routeSlot.channel * EDGE_CHANNEL_GAP;
    const groupWidth = (boardWidth - stageLabelWidth) / groupCount;
    const sourceBlocked = portraitVerticalRouteBlocked(
      sourcePortX,
      source.bottom,
      channelY,
      edge,
      nodeRects
    );
    const sourceSide =
      targetGroupIndex > sourceGroupIndex
        ? 1
        : targetGroupIndex < sourceGroupIndex
          ? -1
          : routeSlot.railSide;
    const sourceGroupLeft = stageLabelWidth + sourceGroupIndex * groupWidth;
    const blockedRailNudge =
      alternatingSlotOffset(routeSlot.sourceChannel) * EDGE_RAIL_GAP;
    const sourceRailX =
      sourceSide < 0
        ? sourceGroupLeft + EDGE_RAIL_INSET + blockedRailNudge
        : sourceGroupLeft +
          groupWidth -
          EDGE_RAIL_INSET +
          blockedRailNudge;
    const sourceSideY =
      sourceCenterY +
      portraitSidePortOffset(routeSlot.sourcePort, routeSlot.sourceChannel);
    const sourcePath = sourceBlocked
      ? sourceSide < 0
        ? `M ${round(source.left)} ${round(sourceSideY)} H ${round(sourceRailX)} V ${round(channelY)}`
        : `M ${round(source.right)} ${round(sourceSideY)} H ${round(sourceRailX)} V ${round(channelY)}`
      : `M ${round(sourcePortX)} ${round(source.bottom)} V ${round(channelY)}`;
    if (targetStageIndex - sourceStageIndex > 1) {
      const targetGroupLeft = stageLabelWidth + targetGroupIndex * groupWidth;
      const routeRailNudge =
        alternatingSlotOffset(routeSlot.channel) * EDGE_RAIL_GAP;
      const railX =
        routeSlot.railSide < 0
          ? targetGroupLeft +
            EDGE_RAIL_INSET +
            routeSlot.rail * EDGE_RAIL_GAP +
            routeRailNudge
          : targetGroupLeft +
            groupWidth -
            EDGE_RAIL_INSET -
            routeSlot.rail * EDGE_RAIL_GAP +
            routeRailNudge;
      const targetApproachY = target.top - 20 - routeSlot.approach * 7;
      const longSourcePath =
        sourceBlocked && sourceGroupIndex === targetGroupIndex
          ? routeSlot.railSide < 0
            ? `M ${round(source.left)} ${round(sourceSideY)} H ${round(railX)} V ${round(channelY)}`
            : `M ${round(source.right)} ${round(sourceSideY)} H ${round(railX)} V ${round(channelY)}`
          : sourcePath;
      return {
        path: `${longSourcePath} H ${round(railX)} V ${round(targetApproachY)} H ${round(targetPortX)} V ${round(target.top - ARROW_CLEARANCE)}`,
        labelX: railX,
        labelY: (channelY + targetApproachY) / 2,
      };
    }
    const targetBlocked = portraitVerticalRouteBlocked(
      targetPortX,
      channelY,
      target.top - ARROW_CLEARANCE,
      edge,
      nodeRects
    );
    if (targetBlocked) {
      const targetSide =
        sourceGroupIndex < targetGroupIndex
          ? -1
          : sourceGroupIndex > targetGroupIndex
            ? 1
            : routeSlot.railSide;
      const targetGroupLeft = stageLabelWidth + targetGroupIndex * groupWidth;
      const targetRailNudge =
        alternatingSlotOffset(routeSlot.targetChannel) * EDGE_RAIL_GAP;
      const targetRailX =
        targetSide < 0
          ? targetGroupLeft + EDGE_RAIL_INSET + targetRailNudge
          : targetGroupLeft +
            groupWidth -
            EDGE_RAIL_INSET +
            targetRailNudge;
      const targetSideY =
        targetCenterY +
        portraitSidePortOffset(routeSlot.targetPort, routeSlot.targetChannel);
      return {
        path:
          targetSide < 0
            ? `${sourcePath} H ${round(targetRailX)} V ${round(targetSideY)} H ${round(target.left - ARROW_CLEARANCE)}`
            : `${sourcePath} H ${round(targetRailX)} V ${round(targetSideY)} H ${round(target.right + ARROW_CLEARANCE)}`,
        labelX: (sourcePortX + targetRailX) / 2,
        labelY: channelY - 11,
      };
    }
    return {
      path: `${sourcePath} H ${round(targetPortX)} V ${round(target.top - ARROW_CLEARANCE)}`,
      labelX: (sourcePortX + targetPortX) / 2,
      labelY: channelY - 11,
    };
  }

  const railX =
    sourceRow.left +
    stageLabelWidth -
    12 -
    routeSlot.backRail * EDGE_RAIL_GAP;
  const channelY =
    targetRow.bottom - 22 - routeSlot.channel * EDGE_CHANNEL_GAP;
  return {
    path: `M ${round(source.left)} ${round(sourceCenterY + portraitSidePortOffset(routeSlot.sourcePort, routeSlot.sourceChannel))} H ${round(railX)} V ${round(channelY)} H ${round(targetPortX)} V ${round(target.bottom + ARROW_CLEARANCE)}`,
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

function portraitVerticalRouteBlocked(
  x: number,
  startY: number,
  endY: number,
  edge: ProcessEdge,
  nodeRects: Map<string, Rect>
) {
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);
  return [...nodeRects].some(([nodeId, node]) => {
    if (nodeId === edge.source || nodeId === edge.target) return false;
    return (
      x > node.left - 3 &&
      x < node.right + 3 &&
      bottom > node.top - 3 &&
      top < node.bottom + 3
    );
  });
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
  // 선 색은 PC(데스크톱 v2)와 동일한 공유 팔레트 — 방향 강조는 화살촉이 담당
  if (type === "loop") return EDGE_LINE_COLORS.loop;
  if (type === "message") return EDGE_LINE_COLORS.message;
  return EDGE_LINE_COLORS.sequence;
}

function edgeDash(type: ProcessEdge["type"]) {
  // 대시 패턴도 PC와 동일(공유 스펙)
  return EDGE_DASH[type] || undefined;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function alternatingSlotOffset(index: number) {
  if (index === 0) return 0;
  const magnitude = Math.ceil(index / 2);
  return index % 2 === 1 ? -magnitude : magnitude;
}

function portraitSidePortOffset(port: number, channel: number) {
  return port * 8 + channel * 1.5;
}
