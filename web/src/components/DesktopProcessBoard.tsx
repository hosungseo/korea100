"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProcessEdge, ProcessModel, ProcessNode } from "@/lib/types";
import { NODE_STATUS_META, nodeStatusAriaLabel } from "@/lib/node-status";
import { ARROW_HEAD, EDGE_TYPE_COLORS, EDGE_END_INSET } from "@/lib/edge-style.mjs";

type EdgeKind = "sequence" | "message" | "loop";

interface EdgePath {
  edge: ProcessEdge;
  path: string;
}

interface EdgeOverlay {
  width: number;
  height: number;
  paths: EdgePath[];
}

interface NodeRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

const EDGE_COLOR: Record<EdgeKind, string> = {
  sequence: "#c3cfc8",
  message: "#aab6af",
  loop: "#2563eb",
};

export default function DesktopProcessBoard({
  process,
  compact,
  selectedNodeId,
  onNodeChange,
}: {
  process: ProcessModel;
  compact: boolean;
  selectedNodeId: string;
  onNodeChange: (nodeId: string) => void;
}) {
  const stages = useMemo(
    () => process.stages.map((stage) => splitStage(stage)),
    [process.stages],
  );
  const loopLabels = useMemo(() => {
    const labels = new Map<string, string>();
    process.edges
      .filter((edge) => edge.type === "loop")
      .forEach((edge) => {
        labels.set(
          edge.source,
          `${edge.label ? `${edge.label} · ` : ""}${edge.target}로`,
        );
      });
    return labels;
  }, [process.edges]);

  if (compact) {
    return (
      <CoreProcessFlow
        process={process}
        selectedNodeId={selectedNodeId}
        loopLabels={loopLabels}
        onNodeChange={onNodeChange}
      />
    );
  }

  return (
    <FullProcessGrid
      process={process}
      stages={stages}
      selectedNodeId={selectedNodeId}
      loopLabels={loopLabels}
      onNodeChange={onNodeChange}
    />
  );
}

function FullProcessGrid({
  process,
  stages,
  selectedNodeId,
  loopLabels,
  onNodeChange,
}: {
  process: ProcessModel;
  stages: ReturnType<typeof splitStage>[];
  selectedNodeId: string;
  loopLabels: Map<string, string>;
  onNodeChange: (nodeId: string) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const overlaySignature = useRef("");
  const [overlay, setOverlay] = useState<EdgeOverlay>({
    width: 0,
    height: 0,
    paths: [],
  });
  const markerPrefix = `desktop-process-${useId().replaceAll(":", "")}`;

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    let active = true;
    let frame = 0;

    const measure = () => {
      if (!active) return;
      const next = measureEdges(
        board,
        process.nodes,
        process.edges,
        nodeRefs.current,
      );
      const signature = JSON.stringify(next);
      if (signature !== overlaySignature.current) {
        overlaySignature.current = signature;
        setOverlay(next);
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(board);
    nodeRefs.current.forEach((node) => observer.observe(node));
    window.addEventListener("resize", schedule);
    void document.fonts.ready.then(schedule);
    schedule();

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [process.edges, process.nodes]);

  const sortedPaths = [...overlay.paths].sort(
    (left, right) =>
      Number(isSelectedEdge(left.edge, selectedNodeId)) -
      Number(isSelectedEdge(right.edge, selectedNodeId)),
  );
  const minWidth = 128 + stages.length * 135;

  return (
    <div
      className="desktop-process-v2-scroll"
      role="region"
      aria-label="업무구조도 스윔레인 탐색 영역"
      tabIndex={0}
    >
      <div
        ref={boardRef}
        className="desktop-process-v2-grid"
        style={{
          gridTemplateColumns: `128px repeat(${stages.length}, minmax(135px, 1fr))`,
          minWidth,
        }}
      >
        {overlay.width > 0 && (
          <svg
            className="desktop-process-v2-edges"
            width={overlay.width}
            height={overlay.height}
            aria-hidden="true"
          >
            <defs>
              <ArrowMarker id={`${markerPrefix}-sequence`} color={EDGE_TYPE_COLORS.sequence} />
              <ArrowMarker id={`${markerPrefix}-message`} color={EDGE_TYPE_COLORS.message} />
              <ArrowMarker id={`${markerPrefix}-loop`} color={EDGE_TYPE_COLORS.loop} />
              <ArrowMarker id={`${markerPrefix}-selected`} color="#0f9f72" />
              <ArrowMarker id={`${markerPrefix}-selected-loop`} color="#1d4ed8" />
            </defs>
            {sortedPaths.map(({ edge, path }) => {
              const selected = isSelectedEdge(edge, selectedNodeId);
              const color = selected
                ? edge.type === "loop"
                  ? "#1d4ed8"
                  : "#0f9f72"
                : EDGE_COLOR[edge.type];
              const marker = selected
                ? edge.type === "loop"
                  ? `${markerPrefix}-selected-loop`
                  : `${markerPrefix}-selected`
                : `${markerPrefix}-${edge.type}`;
              const strokeWidth = selected ? 1.8 : 1.15;
              const strokeDasharray =
                edge.type === "loop"
                  ? "5 4"
                  : edge.type === "message"
                    ? "2 4"
                    : undefined;
              return (
                <g
                  key={edge.id}
                  data-source={edge.source}
                  data-target={edge.target}
                  opacity={selected ? 1 : 0.9}
                >
                  <path
                    d={path}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={strokeWidth + 2.8}
                    strokeDasharray={strokeDasharray}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    markerEnd={`url(#${marker})`}
                  />
                </g>
              );
            })}
          </svg>
        )}

        <div className="desktop-process-v2-corner">
          레인 <span aria-hidden="true">＼</span> 게이트
        </div>
        {stages.map((stage, stageIndex) => (
          <div
            key={stage.full}
            className="desktop-process-v2-stage"
            style={{ gridColumn: stageIndex + 2, gridRow: 1 }}
          >
            <span>{stage.code}</span>
            <strong>{stage.label}</strong>
          </div>
        ))}

        {process.lanes.flatMap((lane, laneIndex) => {
          const row = laneIndex + 2;
          return [
            <div
              key={`lane-${lane}`}
              className="desktop-process-v2-lane"
              style={{ gridColumn: 1, gridRow: row }}
            >
              {lane}
            </div>,
            ...stages.map((stage, stageIndex) => {
              const nodes = process.nodes.filter(
                (node) => node.lane === lane && node.stage === stage.full,
              );
              return (
                <div
                  key={`${lane}-${stage.full}`}
                  className="desktop-process-v2-cell"
                  data-even={laneIndex % 2 === 0 ? "true" : undefined}
                  style={{ gridColumn: stageIndex + 2, gridRow: row }}
                >
                  {nodes.map((node) => (
                    <ProcessGridCard
                      key={node.id}
                      node={node}
                      loopLabel={loopLabels.get(node.id)}
                      selected={selectedNodeId === node.id}
                      onClick={() => onNodeChange(node.id)}
                      setRef={(element) => {
                        if (element) nodeRefs.current.set(node.id, element);
                        else nodeRefs.current.delete(node.id);
                      }}
                    />
                  ))}
                </div>
              );
            }),
          ];
        })}
      </div>
    </div>
  );
}

function CoreProcessFlow({
  process,
  selectedNodeId,
  loopLabels,
  onNodeChange,
}: {
  process: ProcessModel;
  selectedNodeId: string;
  loopLabels: Map<string, string>;
  onNodeChange: (nodeId: string) => void;
}) {
  const stages = process.stages
    .map((stage) => ({ ...splitStage(stage), nodes: process.nodes.filter((node) => node.stage === stage) }))
    .filter((stage) => stage.nodes.length > 0);

  return (
    <div className="desktop-process-v2-core" aria-label="핵심 업무 흐름">
      {stages.map((stage) => (
        <section key={stage.full}>
          <header>
            <span>{stage.code}</span>
            <strong>{stage.label}</strong>
          </header>
          <div>
            {stage.nodes.map((node, index) => (
              <div className="desktop-process-v2-core-step" key={node.id}>
                <ProcessGridCard
                  node={node}
                  loopLabel={loopLabels.get(node.id)}
                  selected={selectedNodeId === node.id}
                  onClick={() => onNodeChange(node.id)}
                />
                {index < stage.nodes.length - 1 && <span aria-hidden="true">→</span>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ProcessGridCard({
  node,
  loopLabel,
  selected,
  onClick,
  setRef,
}: {
  node: ProcessNode;
  loopLabel?: string;
  selected: boolean;
  onClick: () => void;
  setRef?: (element: HTMLButtonElement | null) => void;
}) {
  const status = NODE_STATUS_META[node.status];
  return (
    <button
      ref={setRef}
      type="button"
      className="desktop-process-v2-card"
      data-node-id={node.id}
      data-status={node.status}
      aria-pressed={selected}
      aria-label={nodeStatusAriaLabel(node.name, node.status)}
      onClick={onClick}
    >
      <span className="desktop-process-v2-card-meta">
        <b>{node.id}</b>
        {status.label && <i>{status.label}</i>}
      </span>
      <strong>{node.name}</strong>
      {loopLabel && <small>↩ {loopLabel}</small>}
    </button>
  );
}

function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={id}
      viewBox={`0 0 ${ARROW_HEAD.width} ${ARROW_HEAD.height}`}
      refX={ARROW_HEAD.refX}
      refY={ARROW_HEAD.refY}
      markerWidth={ARROW_HEAD.width}
      markerHeight={ARROW_HEAD.height}
      markerUnits="userSpaceOnUse"
      orient="auto-start-reverse"
    >
      <path
        d={ARROW_HEAD.d}
        fill={color}
        stroke={ARROW_HEAD.outline}
        strokeWidth={ARROW_HEAD.outlineWidth}
        strokeLinejoin="round"
      />
    </marker>
  );
}

function measureEdges(
  board: HTMLDivElement,
  nodes: ProcessNode[],
  edges: ProcessEdge[],
  nodeElements: Map<string, HTMLButtonElement>,
): EdgeOverlay {
  const boardRect = board.getBoundingClientRect();
  const rects = new Map<string, NodeRect>();
  nodes.forEach((node) => {
    const element = nodeElements.get(node.id);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    rects.set(node.id, {
      left: rect.left - boardRect.left,
      right: rect.right - boardRect.left,
      top: rect.top - boardRect.top,
      bottom: rect.bottom - boardRect.top,
      centerX: rect.left - boardRect.left + rect.width / 2,
      centerY: rect.top - boardRect.top + rect.height / 2,
    });
  });

  const gutterUse = new Map<number, number>();
  const nudge = (value: number) => {
    const key = Math.round(value / 8);
    const count = gutterUse.get(key) ?? 0;
    gutterUse.set(key, count + 1);
    return value + (count % 2 === 0 ? 1 : -1) * Math.ceil(count / 2) * 6;
  };

  const routable = edges.flatMap((edge) => {
    const source = rects.get(edge.source);
    const target = rects.get(edge.target);
    if (!source || !target) return [];
    const sameColumn = Math.abs(source.left - target.left) < 8;
    const direction = sameColumn ? "same" : target.left > source.right ? "forward" : "back";
    const vertical =
      sameColumn &&
      edge.type !== "loop" &&
      hasClearVerticalPath(edge, source, target, rects);
    return [{ edge, source, target, direction, vertical }];
  });

  const sideCount = new Map<string, number>();
  const sideSeen = new Map<string, number>();
  routable.forEach(({ edge, direction, vertical }) => {
    if (vertical) return;
    const outputSide = direction === "back" ? "left" : "right";
    const inputSide = direction === "forward" ? "left" : "right";
    const outputKey = `${edge.source}:${outputSide}`;
    const inputKey = `${edge.target}:${inputSide}`;
    sideCount.set(outputKey, (sideCount.get(outputKey) ?? 0) + 1);
    sideCount.set(inputKey, (sideCount.get(inputKey) ?? 0) + 1);
  });

  const spread = (key: string, center: number, top: number, bottom: number) => {
    const count = sideCount.get(key) ?? 0;
    if (count <= 1) return center;
    const index = sideSeen.get(key) ?? 0;
    sideSeen.set(key, index + 1);
    const gap = Math.min(12, (bottom - top - 8) / count);
    return center + (index - (count - 1) / 2) * gap;
  };

  const paths = routable.map(({ edge, source, target, direction, vertical }) => {
    if (vertical) {
      const down = target.top > source.bottom;
      const points = down
        ? [[target.centerX, source.bottom], [target.centerX, target.top - EDGE_END_INSET]]
        : [[target.centerX, source.top], [target.centerX, target.bottom + EDGE_END_INSET]];
      return { edge, path: roundedPath(points, 8) };
    }

    const outputSide = direction === "back" ? "left" : "right";
    const inputSide = direction === "forward" ? "left" : "right";
    const sourceY = spread(
      `${edge.source}:${outputSide}`,
      source.centerY,
      source.top,
      source.bottom,
    );
    const targetY = spread(
      `${edge.target}:${inputSide}`,
      target.centerY,
      target.top,
      target.bottom,
    );

    let points: number[][];
    if (direction === "same") {
      const channelX = nudge(Math.max(source.right, target.right) + 14);
      points = [[source.right, sourceY], [channelX, sourceY], [channelX, targetY], [target.right + EDGE_END_INSET, targetY]];
    } else if (direction === "forward") {
      const channelX = nudge(target.left - 10);
      points = Math.abs(sourceY - targetY) < 2
        ? [[source.right, sourceY], [target.left - EDGE_END_INSET, targetY]]
        : [[source.right, sourceY], [channelX, sourceY], [channelX, targetY], [target.left - EDGE_END_INSET, targetY]];
    } else {
      const channelX = nudge(source.left - 10);
      points = [[source.left, sourceY], [channelX, sourceY], [channelX, targetY], [target.right + EDGE_END_INSET, targetY]];
    }
    return { edge, path: roundedPath(points, 8) };
  });

  return {
    width: Math.ceil(boardRect.width),
    height: Math.ceil(boardRect.height),
    paths,
  };
}

function hasClearVerticalPath(
  edge: ProcessEdge,
  source: NodeRect,
  target: NodeRect,
  rects: Map<string, NodeRect>,
) {
  const top = Math.min(source.bottom, target.bottom);
  const bottom = Math.max(source.top, target.top);
  return [...rects.entries()].every(([nodeId, rect]) =>
    nodeId === edge.source ||
    nodeId === edge.target ||
    rect.right <= target.centerX ||
    rect.left >= target.centerX ||
    rect.bottom <= top ||
    rect.top >= bottom,
  );
}

function roundedPath(points: number[][], radius: number) {
  if (points.length < 2) return "";
  let path = `M ${round(points[0][0])} ${round(points[0][1])}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const [previousX, previousY] = points[index - 1];
    const [currentX, currentY] = points[index];
    const [nextX, nextY] = points[index + 1];
    const incoming = Math.hypot(currentX - previousX, currentY - previousY);
    const outgoing = Math.hypot(nextX - currentX, nextY - currentY);
    const cornerRadius = Math.min(radius, incoming / 2, outgoing / 2);
    if (cornerRadius < 1) {
      path += ` L ${round(currentX)} ${round(currentY)}`;
      continue;
    }
    const incomingX = currentX - Math.sign(currentX - previousX) * cornerRadius * Number(currentX !== previousX);
    const incomingY = currentY - Math.sign(currentY - previousY) * cornerRadius * Number(currentY !== previousY);
    const outgoingX = currentX + Math.sign(nextX - currentX) * cornerRadius * Number(nextX !== currentX);
    const outgoingY = currentY + Math.sign(nextY - currentY) * cornerRadius * Number(nextY !== currentY);
    path += ` L ${round(incomingX)} ${round(incomingY)} Q ${round(currentX)} ${round(currentY)} ${round(outgoingX)} ${round(outgoingY)}`;
  }
  const [lastX, lastY] = points.at(-1)!;
  return `${path} L ${round(lastX)} ${round(lastY)}`;
}

function splitStage(stage: string) {
  const separator = stage.indexOf(" ");
  return separator > 0
    ? { full: stage, code: stage.slice(0, separator), label: stage.slice(separator + 1) }
    : { full: stage, code: stage, label: "" };
}

function isSelectedEdge(edge: ProcessEdge, selectedNodeId: string) {
  return edge.source === selectedNodeId || edge.target === selectedNodeId;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
