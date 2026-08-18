"use client";

import Link from "next/link";
import { useEffect, Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  MegaArtifact,
  MegaDetailTemplate,
  MegaProject,
} from "@/lib/mega-project-types";
import {
  buildMegaProjectGraph,
  formatDate,
  STATUS_META,
} from "@/lib/mega-project-graph";
import MegaViewNav from "./MegaViewNav";
import styles from "./MegaProjectFlow.module.css";

interface MegaProjectFlowProps {
  project: MegaProject;
  artifacts: MegaArtifact[];
  templates: Record<string, string>;
  detailTemplates: Record<string, MegaDetailTemplate>;
}

type EdgeKind = "sequence" | "chain" | "handoff" | "internal" | "conditional";

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
}

interface FlowEdgePath extends FlowEdge {
  path: string;
}

interface ProcItem {
  key: string;
  mapping: string;
  procId: string;
  procName: string;
  procType: string;
  procActor: string;
  templateName: string;
  templateId?: string;
  outputs: string;
  legalBasis: number;
  title: string;
}

const LANES = [
  { id: "applicant", label: "신청인·사업자" },
  { id: "residents", label: "주민·이해관계자" },
  { id: "local", label: "지자체·인허가부서" },
  { id: "central", label: "중앙부처" },
  { id: "expert", label: "위원회·전문기관" },
  { id: "operator", label: "행정청·집행·시스템" },
] as const;

const EDGE_KINDS: { kind: EdgeKind; label: string }[] = [
  { kind: "sequence", label: "제도 내 순서" },
  { kind: "chain", label: "제도 간 연결" },
  { kind: "internal", label: "마일스톤 선행(기관 내)" },
  { kind: "handoff", label: "기관 간 인계" },
  { kind: "conditional", label: "미확정 분기" },
];

const EDGE_COLORS: { kind: EdgeKind; color: string }[] = [
  { kind: "sequence", color: "#16805e" },
  { kind: "chain", color: "#1c6ea4" },
  { kind: "internal", color: "#3f7a63" },
  { kind: "handoff", color: "#0d8160" },
  { kind: "conditional", color: "#b47a19" },
];

function laneOf(actor: string): number {
  if (/주민|토지소유|소유자|점유자|이해관계/.test(actor)) return 1;
  if (
    /신청인|사업시행자|사업자|기업|시공|영업자|취급자|할당대상|사업장|입주|수요|공급자|운송자/.test(
      actor,
    )
  )
    return 0;
  if (/광주시|지자체|지방자치|시장|군수|구청장|시·도|재정부서|교육감/.test(actor))
    return 2;
  if (/위원회|전문기관|심사|평가|심의|조사수행|검증|연구|검사기관/.test(actor))
    return 4;
  if (
    /[부처청]$|국방부|환경부|산업통상|기후|기획예산처|해양수산|행정안전|정부|중대본|장관/.test(
      actor,
    )
  )
    return 3;
  return 5;
}

export default function MegaProjectFlow({
  project,
  artifacts,
  templates,
  detailTemplates,
}: MegaProjectFlowProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const procRefs = useRef(new Map<string, HTMLElement>());
  const [edgePaths, setEdgePaths] = useState<FlowEdgePath[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [hiddenKinds, setHiddenKinds] = useState<Set<EdgeKind>>(new Set());
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  // 좁은 화면 기본 축소 — SSR 하이드레이션 불일치를 피해 마운트 후 적용
  useEffect(() => {
    if (window.innerWidth < 720) setZoom(0.8);
  }, []);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [matchIndex, setMatchIndex] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [scrollPos, setScrollPos] = useState<{
    gate: string;
    gateId: string;
    milestoneId: string;
    milestoneName: string;
  } | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const strips = canvas.querySelectorAll<HTMLElement>("[data-ms-name]");
      // offsetTop은 stageBand 기준 상대값이라 못 쓴다 — 캔버스 rect 기준으로 계산
      const canvasTop = canvas.getBoundingClientRect().top;
      const marker = viewport.getBoundingClientRect().top - canvasTop + 140;
      let current: HTMLElement | null = null;
      for (const strip of strips) {
        if (strip.getBoundingClientRect().top - canvasTop <= marker) current = strip;
        else break;
      }
      if (!current) {
        setScrollPos(null);
        return;
      }
      setScrollPos({
        gate: current.dataset.gate ?? "",
        gateId: current.dataset.gateId ?? "",
        milestoneId: current.id,
        milestoneName: current.dataset.msName ?? "",
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const derived = useMemo(() => {
    const graph = buildMegaProjectGraph(
      project,
      artifacts,
      templates,
      detailTemplates,
    );

    const TOP_ACTORS = 30;
    const actorCounts = new Map<string, number>();
    project.nodes.forEach((node) => {
      (graph.detailGroupsByNode.get(node.id) ?? []).forEach((group) => {
        group.nodes.forEach((proc) => {
          actorCounts.set(proc.actor, (actorCounts.get(proc.actor) ?? 0) + 1);
        });
      });
    });
    const sortedActors = [...actorCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    );
    const topActors = new Set(
      sortedActors.slice(0, TOP_ACTORS).map(([actor]) => actor),
    );
    const laneTopActors: string[][] = LANES.map(() => []);
    const laneOtherActors: string[][] = LANES.map(() => []);
    sortedActors.forEach(([actor]) => {
      if (topActors.has(actor)) laneTopActors[laneOf(actor)].push(actor);
      else laneOtherActors[laneOf(actor)].push(actor);
    });
    const subColumnOfActor = new Map<string, number>();
    const subColumns: { label: string; lane: number; isOther: boolean }[] = [];
    const laneSubColumnCounts: number[] = LANES.map(() => 0);
    LANES.forEach((_, laneIndex) => {
      laneTopActors[laneIndex].forEach((actor) => {
        subColumnOfActor.set(actor, subColumns.length);
        subColumns.push({ label: actor, lane: laneIndex, isOther: false });
        laneSubColumnCounts[laneIndex] += 1;
      });
      const others = laneOtherActors[laneIndex];
      if (others.length > 0) {
        const otherIndex = subColumns.length;
        others.forEach((actor) => subColumnOfActor.set(actor, otherIndex));
        subColumns.push({
          label: `기타 ${others.length}종`,
          lane: laneIndex,
          isOther: true,
        });
        laneSubColumnCounts[laneIndex] += 1;
      }
    });

    const milestoneEntryProc = new Map<string, string>();
    const milestoneExitProc = new Map<string, string>();
    const procLaneByKey = new Map<string, number>();
    const edges: FlowEdge[] = [];
    let totalProcs = 0;

    const stageBands = project.stages
      .map((stage, stageIndex) => {
        const stageNodes = project.nodes.filter(
          (node) => node.stage === stage.id,
        );
        const milestones: {
          id: string;
          name: string;
          status: string;
          procCount: number;
          exactCount: number;
          laneCounts: number[];
          cells: Map<number, ProcItem[]>;
        }[] = [];

        stageNodes.forEach((node) => {
          const groups = (graph.detailGroupsByNode.get(node.id) ?? []).filter(
            (group) => group.nodes.length > 0,
          );
          if (groups.length === 0) return;
          const cells = new Map<number, ProcItem[]>();
          const milestone = {
            id: node.id,
            name: node.name,
            status: graph.displayStatusByNode.get(node.id) ?? "blocked",
            procCount: 0,
            exactCount: 0,
            laneCounts: LANES.map(() => 0),
            cells,
          };
          milestones.push(milestone);
          const firstGroup = groups[0];
          const lastGroup = groups[groups.length - 1];
          milestoneEntryProc.set(
            node.id,
            `${firstGroup.id}:${firstGroup.nodes[0].id}`,
          );
          milestoneExitProc.set(
            node.id,
            `${lastGroup.id}:${lastGroup.nodes[lastGroup.nodes.length - 1].id}`,
          );
          groups.forEach((group, groupIndex) => {
            group.nodes.forEach((proc) => {
              totalProcs += 1;
              milestone.procCount += 1;
              if (group.mapping === "exact") milestone.exactCount += 1;
              const lane = laneOf(proc.actor);
              milestone.laneCounts[lane] += 1;
              procLaneByKey.set(`${group.id}:${proc.id}`, lane);
              const subColumn = subColumnOfActor.get(proc.actor) ?? 0;
              const cell = cells.get(subColumn) ?? [];
              cell.push({
                key: `${group.id}:${proc.id}`,
                mapping: group.mapping,
                procId: proc.id,
                procName: proc.name,
                procType: proc.type,
                procActor: proc.actor,
                templateName: group.templateName,
                templateId: group.templateId,
                outputs: proc.outputDocuments.join(" · "),
                legalBasis: proc.legalBasisCount,
                title: [
                  `${node.id} ${node.name}`,
                  `${group.templateName}`,
                  `${proc.id} ${proc.name}`,
                  `담당 ${proc.actor}`,
                  proc.outputDocuments.length > 0
                    ? `산출물 ${proc.outputDocuments.join(" · ")}`
                    : "산출물 미기재",
                  `법적 근거 ${proc.legalBasisCount}건`,
                ].join(" / "),
              });
              cells.set(subColumn, cell);
            });
            group.edges.forEach((edge) => {
              edges.push({
                id: `${group.id}:${edge.id}`,
                source: `${group.id}:${edge.source}`,
                target: `${group.id}:${edge.target}`,
                kind: "sequence",
              });
            });
            const nextGroup = groups[groupIndex + 1];
            if (nextGroup) {
              edges.push({
                id: `chain:${group.id}->${nextGroup.id}`,
                source: `${group.id}:${group.nodes[group.nodes.length - 1].id}`,
                target: `${nextGroup.id}:${nextGroup.nodes[0].id}`,
                kind: "chain",
              });
            }
          });
        });

        return {
          stageId: stage.id,
          label: `${String(stageIndex + 1).padStart(2, "0")} ${stage.label}`,
          shortLabel: `${String(stageIndex + 1).padStart(2, "0")} ${stage.label}`,
          milestones,
        };
      })
      .filter((band) => band.milestones.length > 0);

    graph.edges.forEach((edge) => {
      const source = milestoneExitProc.get(edge.source);
      const target = milestoneEntryProc.get(edge.target);
      if (!source || !target) return;
      edges.push({
        id: `dep:${edge.id}`,
        source,
        target,
        kind: edge.conditional
          ? "conditional"
          : edge.handoff
            ? "handoff"
            : "internal",
      });
    });

    const neighborsByNode = new Map<string, Set<string>>();
    edges.forEach((edge) => {
      if (!neighborsByNode.has(edge.source))
        neighborsByNode.set(edge.source, new Set());
      if (!neighborsByNode.has(edge.target))
        neighborsByNode.set(edge.target, new Set());
      neighborsByNode.get(edge.source)!.add(edge.target);
      neighborsByNode.get(edge.target)!.add(edge.source);
    });

    const gridTemplate = `var(--gutter-width) ${subColumns
      .map(() => "var(--subcol-width)")
      .join(" ")}`;

    // Lane-to-lane handoff matrix for the mini sankey summary.
    const handoffMatrix: number[][] = LANES.map(() => LANES.map(() => 0));
    let handoffTotal = 0;
    graph.edges.forEach((edge) => {
      if (!edge.handoff) return;
      const source = milestoneExitProc.get(edge.source);
      const target = milestoneEntryProc.get(edge.target);
      if (!source || !target) return;
      const sourceLane = procLaneByKey.get(source);
      const targetLane = procLaneByKey.get(target);
      if (sourceLane === undefined || targetLane === undefined) return;
      if (sourceLane === targetLane) return;
      handoffMatrix[sourceLane][targetLane] += 1;
      handoffTotal += 1;
    });

    const maxCellCount = Math.max(
      1,
      ...stageBands.flatMap((band) =>
        band.milestones.flatMap((milestone) => milestone.laneCounts),
      ),
    );
    const maxMilestoneProcs = Math.max(
      1,
      ...stageBands.flatMap((band) =>
        band.milestones.map((milestone) => milestone.procCount),
      ),
    );

    return {
      edges,
      stageBands,
      subColumns,
      laneSubColumnCounts,
      totalProcs,
      neighborsByNode,
      gridTemplate,
      handoffMatrix,
      handoffTotal,
      maxCellCount,
      maxMilestoneProcs,
    };
  }, [artifacts, detailTemplates, project, templates]);

  const {
    edges,
    stageBands,
    subColumns,
    laneSubColumnCounts,
    totalProcs,
    neighborsByNode,
    handoffMatrix,
    handoffTotal,
    maxCellCount,
    maxMilestoneProcs,
    gridTemplate,
  } = derived;

  const procByKey = useMemo(() => {
    const map = new Map<
      string,
      {
        proc: ProcItem;
        milestoneId: string;
        milestoneName: string;
        gate: string;
        stageId: string;
      }
    >();
    for (const band of derived.stageBands) {
      for (const milestone of band.milestones) {
        for (const procs of milestone.cells.values()) {
          for (const proc of procs) {
            map.set(proc.key, {
              proc,
              milestoneId: milestone.id,
              milestoneName: milestone.name,
              gate: band.label,
              stageId: band.stageId,
            });
          }
        }
      }
    }
    return map;
  }, [derived]);
  const detailKey = pinnedKey ?? hoverKey;
  const hoverDetail = detailKey ? procByKey.get(detailKey) : null;
  const detailLinks = useMemo(() => {
    if (!detailKey) return [];
    return derived.edges
      .filter((edge) => edge.source === detailKey || edge.target === detailKey)
      .map((edge) => {
        const outgoing = edge.source === detailKey;
        const counterpartKey = outgoing ? edge.target : edge.source;
        const counterpart = procByKey.get(counterpartKey);
        return counterpart
          ? {
              key: counterpartKey,
              outgoing,
              kind: edge.kind,
              label: `${counterpart.proc.procId} ${counterpart.proc.procName}`,
              milestoneId: counterpart.milestoneId,
            }
          : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [detailKey, derived.edges, procByKey]);

  const scrollToProc = useCallback(
    (key: string) => {
      const info = procByKey.get(key);
      if (info) {
        setCollapsed((previous) => {
          if (!previous.has(info.stageId)) return previous;
          const next = new Set(previous);
          next.delete(info.stageId);
          return next;
        });
      }
      setPinnedKey(key);
      setFlashKey(key);
      window.setTimeout(() => {
        procRefs.current
          .get(key)
          ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }, 60);
      window.setTimeout(() => setFlashKey((value) => (value === key ? null : value)), 1800);
    },
    [procByKey],
  );

  useEffect(() => {
    setMatchIndex(0);
  }, [query]);

  // 핀 절차의 전체 사슬(상류·하류) — 핀 시 경로 밖은 흐림 처리
  const adjacency = useMemo(() => {
    const forward = new Map<string, string[]>();
    const backward = new Map<string, string[]>();
    for (const edge of derived.edges) {
      if (!forward.has(edge.source)) forward.set(edge.source, []);
      forward.get(edge.source)!.push(edge.target);
      if (!backward.has(edge.target)) backward.set(edge.target, []);
      backward.get(edge.target)!.push(edge.source);
    }
    return { forward, backward };
  }, [derived.edges]);

  const pinnedPath = useMemo(() => {
    if (!pinnedKey) return null;
    const walk = (start: string, next: Map<string, string[]>) => {
      const seen = new Set<string>();
      const queue = [start];
      while (queue.length) {
        const node = queue.pop()!;
        for (const neighbor of next.get(node) ?? []) {
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      seen.delete(start);
      return seen;
    };
    const downstream = walk(pinnedKey, adjacency.forward);
    const upstream = walk(pinnedKey, adjacency.backward);
    const nodes = new Set<string>([pinnedKey, ...upstream, ...downstream]);
    return { nodes, upstream: upstream.size, downstream: downstream.size };
  }, [pinnedKey, adjacency]);

  // 딥링크: ?p=<절차키> — 핀과 URL 동기화, 로드 시 자동 이동
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    deepLinkApplied.current = true;
    const param = new URLSearchParams(window.location.search).get("p");
    if (param && procByKey.has(param)) {
      window.setTimeout(() => scrollToProc(param), 500);
    }
  }, [procByKey, scrollToProc]);

  useEffect(() => {
    if (!deepLinkApplied.current) return;
    const url = new URL(window.location.href);
    if (pinnedKey) url.searchParams.set("p", pinnedKey);
    else url.searchParams.delete("p");
    window.history.replaceState(null, "", url.toString());
  }, [pinnedKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinnedKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const updateGeometry = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    // CSS zoom 상태에서 getBoundingClientRect는 확대된 px을 주므로
    // SVG(비확대 좌표계)와 맞추려면 zoom으로 나눠 정규화한다.
    const zoomFactor = zoom || 1;

    interface Rect {
      left: number;
      right: number;
      top: number;
      bottom: number;
      cx: number;
      cy: number;
      width: number;
      height: number;
    }
    const rectCache = new Map<string, Rect>();
    const rectOf = (key: string): Rect | null => {
      const cached = rectCache.get(key);
      if (cached) return cached;
      const element = procRefs.current.get(key);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      const rect: Rect = {
        left: (r.left - canvasRect.left) / zoomFactor,
        right: (r.right - canvasRect.left) / zoomFactor,
        top: (r.top - canvasRect.top) / zoomFactor,
        bottom: (r.bottom - canvasRect.top) / zoomFactor,
        cx: (r.left - canvasRect.left + r.width / 2) / zoomFactor,
        cy: (r.top - canvasRect.top + r.height / 2) / zoomFactor,
        width: r.width / zoomFactor,
        height: r.height / zoomFactor,
      };
      rectCache.set(key, rect);
      return rect;
    };

    // Route classification per edge, so ports can be grouped by node side.
    type RouteKind = "down" | "up" | "side";
    interface Routed {
      edge: FlowEdge;
      kind: RouteKind;
      s: Rect;
      t: Rect;
      goRight: boolean;
    }
    const routed: Routed[] = [];
    edges.forEach((edge) => {
      const s = rectOf(edge.source);
      const t = rectOf(edge.target);
      if (!s || !t) return;
      const verticalOverlap = t.top < s.bottom && t.bottom > s.top;
      const kind: RouteKind = verticalOverlap
        ? "side"
        : t.top >= s.bottom
          ? "down"
          : "up";
      routed.push({ edge, kind, s, t, goRight: t.cx > s.cx });
    });

    // Port assignment: spread each node's departures/arrivals along the
    // relevant box side, ordered by where the counterpart sits, so no two
    // edges share the same anchor point.
    const portGroups = new Map<string, Routed[]>();
    const groupKey = (nodeKey: string, side: string) => `${nodeKey}|${side}`;
    const sideOfSource = (r: Routed) =>
      r.kind === "side" ? (r.goRight ? "right" : "left") : r.kind === "down" ? "bottom" : "top";
    const sideOfTarget = (r: Routed) =>
      r.kind === "side" ? (r.goRight ? "left" : "right") : r.kind === "down" ? "top" : "bottom";
    routed.forEach((r) => {
      const sKey = groupKey(r.edge.source, `out-${sideOfSource(r)}`);
      const tKey = groupKey(r.edge.target, `in-${sideOfTarget(r)}`);
      (portGroups.get(sKey) ?? portGroups.set(sKey, []).get(sKey)!).push(r);
      (portGroups.get(tKey) ?? portGroups.set(tKey, []).get(tKey)!).push(r);
    });
    portGroups.forEach((group, key) => {
      const horizontal = key.endsWith("bottom") || key.endsWith("top");
      const isOut = key.includes("|out-");
      group.sort((a, b) => {
        const ra = isOut ? a.t : a.s;
        const rb = isOut ? b.t : b.s;
        return horizontal ? ra.cx - rb.cx || ra.cy - rb.cy : ra.cy - rb.cy || ra.cx - rb.cx;
      });
    });
    const portOffset = (
      nodeKey: string,
      side: string,
      r: Routed,
      rect: Rect,
    ) => {
      const group = portGroups.get(groupKey(nodeKey, side)) ?? [];
      const index = group.indexOf(r);
      const count = group.length;
      const span = side.endsWith("bottom") || side.endsWith("top")
        ? rect.width
        : rect.height;
      const usable = Math.max(8, span - 12);
      return count <= 1
        ? 0
        : ((index + 1) / (count + 1) - 0.5) * usable;
    };

    // Channel assignment: horizontal runs near the same Y (or vertical runs
    // near the same X) get successive 4px slots instead of piling up.
    const channelSlots = new Map<string, number>();
    const channelOffset = (axis: "h" | "v", base: number) => {
      const key = `${axis}:${Math.round(base / 10)}`;
      const slot = channelSlots.get(key) ?? 0;
      channelSlots.set(key, slot + 1);
      const step = Math.ceil(slot / 2) * 4;
      return slot % 2 === 1 ? step : -step;
    };

    // Render an orthogonal polyline with rounded corners so long routes read
    // as flows, not empty rectangles.
    const roundedPath = (points: [number, number][]) => {
      if (points.length < 2) return "";
      let d = `M ${points[0][0]} ${points[0][1]}`;
      for (let i = 1; i < points.length - 1; i += 1) {
        const [px, py] = points[i - 1];
        const [cx, cy] = points[i];
        const [nx, ny] = points[i + 1];
        const inLen = Math.hypot(cx - px, cy - py);
        const outLen = Math.hypot(nx - cx, ny - cy);
        const r = Math.min(6, inLen / 2, outLen / 2);
        if (r < 1) {
          d += ` L ${cx} ${cy}`;
          continue;
        }
        const inX = cx - ((cx - px) / inLen) * r;
        const inY = cy - ((cy - py) / inLen) * r;
        const outX = cx + ((nx - cx) / outLen) * r;
        const outY = cy + ((ny - cy) / outLen) * r;
        d += ` L ${inX} ${inY} Q ${cx} ${cy} ${outX} ${outY}`;
      }
      const last = points[points.length - 1];
      d += ` L ${last[0]} ${last[1]}`;
      return d;
    };

    const paths = routed.map((r) => {
      const { edge, kind, s, t, goRight } = r;
      let path: string;
      if (kind === "side") {
        const sx = goRight ? s.right : s.left;
        const tx = goRight ? t.left : t.right;
        const sy = s.cy + portOffset(edge.source, `out-${goRight ? "right" : "left"}`, r, s);
        const ty = t.cy + portOffset(edge.target, `in-${goRight ? "left" : "right"}`, r, t);
        if (Math.abs(sy - ty) < 4) {
          path = `M ${sx} ${sy} L ${tx} ${ty}`;
        } else {
          // Vertical hop hugs the target column instead of floating mid-gap.
          const hop = 10 + Math.abs(channelOffset("v", tx));
          const midX = goRight
            ? Math.max(sx + 4, tx - hop)
            : Math.min(sx - 4, tx + hop);
          path = roundedPath([
            [sx, sy],
            [midX, sy],
            [midX, ty],
            [tx, ty],
          ]);
        }
      } else {
        const down = kind === "down";
        const sy = down ? s.bottom : s.top;
        const ty = down ? t.top : t.bottom;
        const overlapLeft = Math.max(s.left, t.left);
        const overlapRight = Math.min(s.right, t.right);
        const gap = Math.abs(ty - sy);
        if (overlapRight - overlapLeft > 12 && gap < 22) {
          // Neighbouring boxes in the same stack: one straight vertical stem.
          const x = Math.min(
            overlapRight - 6,
            Math.max(overlapLeft + 6, (s.cx + t.cx) / 2),
          );
          path = `M ${x} ${sy} L ${x} ${ty}`;
        } else {
          const sx = s.cx + portOffset(edge.source, `out-${down ? "bottom" : "top"}`, r, s);
          const tx = t.cx + portOffset(edge.target, `in-${down ? "top" : "bottom"}`, r, t);
          if (Math.abs(sx - tx) < 4) {
            path = `M ${sx} ${sy} L ${tx} ${ty}`;
          } else {
            // Horizontal channel hugs the destination row (a few px before the
            // target edge) instead of crossing the middle of empty space.
            const gapLow = Math.min(sy, ty);
            const gapHigh = Math.max(sy, ty);
            const hug = 8 + Math.abs(channelOffset("h", ty));
            const midY = Math.min(
              gapHigh - 3,
              Math.max(gapLow + 3, down ? ty - hug : ty + hug),
            );
            path = roundedPath([
              [sx, sy],
              [sx, midY],
              [tx, midY],
              [tx, ty],
            ]);
          }
        }
      }
      return { ...edge, path };
    });

    // scrollHeight는 절대배치 SVG(직전 크기)를 포함해 순환 잠금을 만든다 — border box 사용
    setSize({ width: canvas.offsetWidth, height: canvas.offsetHeight });
    setEdgePaths(paths);
  }, [edges, zoom]);

  useLayoutEffect(() => {
    updateGeometry();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(canvas);
    window.addEventListener("resize", updateGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateGeometry);
    };
  }, [updateGeometry]);

  const setProcRef = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) procRefs.current.set(id, element);
      else procRefs.current.delete(id);
    },
    [],
  );

  const toggleKind = useCallback((kind: EdgeKind) => {
    setHiddenKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const jumpToGate = useCallback((stageId: string) => {
    document
      .getElementById(`gate-${stageId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const hoverNeighbors = hoverKey ? neighborsByNode.get(hoverKey) : undefined;

  const trimmedQuery = query.trim().toLowerCase();
  const queryActive = trimmedQuery.length >= 2;
  const matchKeys = new Set<string>();
  const matchList: string[] = [];
  if (queryActive) {
    stageBands.forEach((band) =>
      band.milestones.forEach((milestone) =>
        milestone.cells.forEach((procs) =>
          procs.forEach((proc) => {
            const haystack =
              `${proc.procId} ${proc.procName} ${proc.procActor} ${milestone.id} ${milestone.name}`.toLowerCase();
            if (haystack.includes(trimmedQuery)) {
              matchKeys.add(proc.key);
              matchList.push(proc.key);
            }
          }),
        ),
      ),
    );
  }
  const stepMatch = (delta: number) => {
    if (!matchList.length) return;
    const next = (matchIndex + delta + matchList.length) % matchList.length;
    setMatchIndex(next);
    scrollToProc(matchList[next]);
  };

  return (
    <div className={`${styles.page} mega-flow-page`}>
      <header className={styles.header}>
        <p className={styles.kicker}>MEGA / PERMIT GIANT SWIMLANE</p>
        <div className={styles.headerRow}>
          <div>
            <h1>{project.name} 절차 스윔레인</h1>
            <p className={styles.kpis}>
              <span>
                <b>{totalProcs}</b>
                <small>절차</small>
              </span>
              <span>
                <b>{edges.length}</b>
                <small>연결선</small>
              </span>
              <span>
                <b>{subColumns.length}</b>
                <small>담당자 컬럼</small>
              </span>
              <span>
                <b>{stageBands.length}</b>
                <small>게이트</small>
              </span>
              <span>
                <b>
                  {stageBands.reduce(
                    (total, band) => total + band.milestones.length,
                    0,
                  )}
                </b>
                <small>마일스톤</small>
              </span>
              <span>
                <b>{handoffTotal}</b>
                <small>기관 간 인계</small>
              </span>
              <span className={styles.kpiDate}>
                기준일 {formatDate(project.asOfDate)}
              </span>
            </p>
          </div>
          <div className={styles.headerRight}>
            <MegaViewNav projectId={project.id} active="flow" />
            <nav className={styles.gateNav} aria-label="게이트 바로가기">
              {stageBands.map((band) => (
                <button
                  type="button"
                  key={band.stageId}
                  onClick={() => jumpToGate(band.stageId)}
                >
                  {band.label.slice(0, 2)}
                  <small>{band.label.slice(3)}</small>
                </button>
              ))}
            </nav>
          </div>
        </div>
        <p className={styles.legend}>
          {EDGE_KINDS.map(({ kind, label }) => (
            <button
              type="button"
              key={kind}
              data-kind={kind}
              aria-pressed={!hiddenKinds.has(kind)}
              onClick={() => toggleKind(kind)}
              title={
                hiddenKinds.has(kind)
                  ? `${label} 선 표시하기`
                  : `${label} 선 숨기기`
              }
            >
              {label}
            </button>
          ))}
          <span className={styles.legendHint}>
            절차에 마우스를 올리면 연결된 선만 강조됩니다
          </span>
          <span className={styles.search}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="절차 검색 — 이름·담당·마일스톤"
              aria-label="절차 검색"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  stepMatch(event.shiftKey ? -1 : 1);
                }
              }}
            />
            {queryActive && matchList.length > 0 && (
              <span className={styles.searchNav}>
                <button type="button" onClick={() => stepMatch(-1)} aria-label="이전 일치">
                  ‹
                </button>
                <b>
                  {Math.min(matchIndex + 1, matchList.length)}/{matchList.length}
                </b>
                <button type="button" onClick={() => stepMatch(1)} aria-label="다음 일치">
                  ›
                </button>
              </span>
            )}
            {queryActive && matchList.length === 0 && <b>일치 없음</b>}
          </span>
          <button
            type="button"
            className={styles.bulkToggle}
            onClick={() =>
              setCollapsed((previous) =>
                previous.size < stageBands.length
                  ? new Set(stageBands.map((band) => band.stageId))
                  : new Set(),
              )
            }
          >
            {collapsed.size < stageBands.length ? "모두 접기" : "모두 펼치기"}
          </button>
          <span className={styles.zoomControl} role="group" aria-label="확대·축소">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.7, Math.round((value - 0.1) * 10) / 10))}
              aria-label="축소"
            >
              −
            </button>
            <button type="button" onClick={() => setZoom(1)} title="기본 크기">
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(1.6, Math.round((value + 0.1) * 10) / 10))}
              aria-label="확대"
            >
              +
            </button>
          </span>
        </p>

        <div className={styles.summaryStrip}>
          <div className={styles.minimap} aria-label="마일스톤×레인 밀도 미니맵">
            <p className={styles.summaryCaption}>
              <span>밀도 미니맵</span>
              <small>마일스톤 × 주체군 · 클릭하면 이동</small>
            </p>
            <div className={styles.minimapBands}>
              {stageBands.map((band) => (
                <div
                  className={styles.minimapBand}
                  key={band.stageId}
                  data-current={scrollPos?.gateId === band.stageId ? "true" : undefined}
                >
                  <div className={styles.minimapGrid}>
                    {band.milestones.map((milestone) => (
                      <button
                        type="button"
                        className={styles.minimapCol}
                        key={milestone.id}
                        data-status={milestone.status}
                        title={`${milestone.id} ${milestone.name} · ${milestone.procCount}개 절차`}
                        onClick={() => {
                          setCollapsed((previous) => {
                            if (!previous.has(band.stageId)) return previous;
                            const next = new Set(previous);
                            next.delete(band.stageId);
                            return next;
                          });
                          requestAnimationFrame(() =>
                          document
                            .getElementById(milestone.id)
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            }),
                          );
                        }}
                      >
                        {milestone.laneCounts.map((count, laneIndex) => (
                          <i
                            key={LANES[laneIndex].id}
                            style={{
                              opacity:
                                count === 0
                                  ? 0.08
                                  : 0.25 + 0.75 * (count / maxCellCount),
                            }}
                          />
                        ))}
                      </button>
                    ))}
                  </div>
                  <small>{band.label.slice(0, 2)}</small>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.sankey} aria-label="주체군 간 인계 요약">
            <p className={styles.summaryCaption}>
              <span>레인 간 인계</span>
              <small>{handoffTotal}건</small>
            </p>
            <svg viewBox="0 0 240 120" className={styles.sankeySvg}>
              {LANES.map((lane, index) => (
                <text
                  key={`l-${lane.id}`}
                  x={2}
                  y={index * 19 + 13}
                  className={styles.sankeyLabel}
                >
                  {lane.label.split("·")[0]}
                </text>
              ))}
              {LANES.map((lane, index) => (
                <text
                  key={`r-${lane.id}`}
                  x={238}
                  y={index * 19 + 13}
                  textAnchor="end"
                  className={styles.sankeyLabel}
                >
                  {lane.label.split("·")[0]}
                </text>
              ))}
              {handoffMatrix.flatMap((row, sourceLane) =>
                row.map((count, targetLane) => {
                  if (count === 0) return null;
                  const y1 = sourceLane * 19 + 10;
                  const y2 = targetLane * 19 + 10;
                  const width = Math.min(9, 1 + count * 0.7);
                  return (
                    <path
                      key={`${sourceLane}-${targetLane}`}
                      className={styles.sankeyBand}
                      d={`M 62 ${y1} C 120 ${y1}, 120 ${y2}, 178 ${y2}`}
                      strokeWidth={width}
                    >
                      <title>
                        {`${LANES[sourceLane].label} → ${LANES[targetLane].label} · ${count}건`}
                      </title>
                    </path>
                  );
                }),
              )}
            </svg>
          </div>
        </div>
      </header>

      {hoverDetail && (
        <aside
          className={styles.hoverPanel}
          data-pinned={pinnedKey ? "true" : "false"}
          aria-live="polite"
        >
          {pinnedKey && (
            <button
              type="button"
              className={styles.panelClose}
              onClick={() => setPinnedKey(null)}
              aria-label="고정 해제"
            >
              ×
            </button>
          )}
          <p>
            <b>{hoverDetail.proc.procId}</b> {hoverDetail.proc.procName}
          </p>
          <small>
            {hoverDetail.proc.templateId ? (
              <Link
                className={styles.templateLink}
                href={`/model/${hoverDetail.proc.templateId}/#${hoverDetail.proc.procId}`}
              >
                {hoverDetail.proc.templateName} — 제도 원본에서 보기 ↗
              </Link>
            ) : (
              hoverDetail.proc.templateName
            )}
          </small>
          <dl>
            <div>
              <dt>담당</dt>
              <dd>{hoverDetail.proc.procActor}</dd>
            </div>
            <div>
              <dt>마일스톤</dt>
              <dd>
                {hoverDetail.milestoneId} {hoverDetail.milestoneName}
              </dd>
            </div>
            <div>
              <dt>산출물</dt>
              <dd>{hoverDetail.proc.outputs || "미기재"}</dd>
            </div>
            <div>
              <dt>법적 근거</dt>
              <dd>{hoverDetail.proc.legalBasis}건</dd>
            </div>
            {pinnedPath && (
              <div>
                <dt>전체 사슬</dt>
                <dd>
                  상류 {pinnedPath.upstream} · 하류 {pinnedPath.downstream} —
                  경로만 강조 중
                </dd>
              </div>
            )}
          </dl>
          {pinnedKey && (
            <button
              type="button"
              className={styles.copyLink}
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href);
              }}
            >
              이 절차 링크 복사
            </button>
          )}
          {detailLinks.length > 0 && (
            <div className={styles.linkList}>
              <span>
                연결 절차 {detailLinks.length}건
                {!pinnedKey && " — 절차를 클릭하면 따라갈 수 있습니다"}
              </span>
              {pinnedKey && (
                <ul>
                  {detailLinks.slice(0, 8).map((link) => (
                    <li key={`${link.key}:${link.outgoing ? "o" : "i"}`}>
                      <button type="button" onClick={() => scrollToProc(link.key)}>
                        <em data-kind={link.kind}>{link.outgoing ? "다음 →" : "← 이전"}</em>
                        <span>{link.label}</span>
                        <small>{link.milestoneId}</small>
                      </button>
                    </li>
                  ))}
                  {detailLinks.length > 8 && <li className={styles.linkMore}>외 {detailLinks.length - 8}건</li>}
                </ul>
              )}
            </div>
          )}
        </aside>
      )}
      {scrollPos && (
        <button
          type="button"
          className={styles.positionHud}
          onClick={() =>
            document
              .getElementById(scrollPos.milestoneId)
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          title="현재 위치 — 클릭하면 마일스톤 시작으로 이동"
        >
          <b>{scrollPos.gate}</b>
          <span>
            {scrollPos.milestoneId} {scrollPos.milestoneName}
          </span>
        </button>
      )}
      <div className={styles.viewport} ref={viewportRef}>
        <div
          className={styles.sheet}
          style={{ "--flow-columns": gridTemplate, zoom } as CSSProperties & { zoom: number }}
        >
          <div className={styles.laneHeader}>
            <span className={styles.laneHeaderGate}>게이트 / 마일스톤</span>
            {LANES.map((lane, laneIndex) => {
              const count = laneSubColumnCounts[laneIndex];
              if (count === 0) return null;
              return (
                <span
                  className={styles.laneGroupHead}
                  key={lane.id}
                  style={{ gridColumn: `span ${count}` }}
                >
                  {lane.label}
                  <small>{count}</small>
                </span>
              );
            })}
          </div>
          <div className={styles.actorHeader}>
            <span className={styles.actorHeaderGate} />
            {subColumns.map((subColumn, index) => (
              <span
                key={`${subColumn.lane}:${subColumn.label}`}
                data-lane={subColumn.lane}
                data-other={subColumn.isOther ? "true" : "false"}
                data-first={
                  index === 0 || subColumns[index - 1].lane !== subColumn.lane
                    ? "true"
                    : "false"
                }
                title={subColumn.label}
              >
                {subColumn.label}
              </span>
            ))}
          </div>

          <div
            className={styles.canvas}
            ref={canvasRef}
            onMouseLeave={() => setHoverKey(null)}
          >
            <svg
              className={styles.edgeLayer}
              width={size.width}
              height={size.height}
              viewBox={`0 0 ${size.width} ${size.height}`}
              aria-hidden="true"
            >
              <defs>
                {EDGE_COLORS.map(({ kind, color }) => (
                  <marker
                    key={kind}
                    id={`flow-arrow-${kind}`}
                    viewBox="0 0 8 8"
                    refX="7"
                    refY="4"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill={color} />
                  </marker>
                ))}
              </defs>
              {edgePaths
                .filter((edge) => !hiddenKinds.has(edge.kind))
                .map((edge) => {
                  const active =
                    hoverKey !== null &&
                    (edge.source === hoverKey || edge.target === hoverKey);
                  const onPath = pinnedPath
                    ? pinnedPath.nodes.has(edge.source) &&
                      pinnedPath.nodes.has(edge.target)
                    : false;
                  return (
                    <path
                      key={edge.id}
                      className={styles.edge}
                      d={edge.path}
                      data-kind={edge.kind}
                      data-active={active || onPath ? "true" : "false"}
                      data-dim={
                        (queryActive &&
                          !matchKeys.has(edge.source) &&
                          !matchKeys.has(edge.target)) ||
                        (pinnedPath
                          ? !onPath
                          : hoverKey !== null && !active)
                          ? "true"
                          : "false"
                      }
                      markerEnd={`url(#flow-arrow-${edge.kind})`}
                    />
                  );
                })}
            </svg>

            {stageBands.map((band) => (
              <section
                className={styles.stageBand}
                key={band.stageId}
                id={`gate-${band.stageId}`}
              >
                <h2
                  className={styles.stageTitle}
                  data-collapsed={collapsed.has(band.stageId) ? "true" : "false"}
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(band.stageId)) next.delete(band.stageId);
                      else next.add(band.stageId);
                      return next;
                    })
                  }
                  title={collapsed.has(band.stageId) ? "펼치기" : "접기"}
                >
                  <span>
                    <em className={styles.stageChevron} aria-hidden="true">
                      {collapsed.has(band.stageId) ? "▸" : "▾"}
                    </em>
                    {band.label}
                    <small>
                      {band.milestones.length}개 마일스톤 ·{" "}
                      {band.milestones.reduce(
                        (total, milestone) => total + milestone.procCount,
                        0,
                      )}
                      개 절차
                      {collapsed.has(band.stageId) ? " · 접힘" : ""}
                    </small>
                  </span>
                </h2>
                {!collapsed.has(band.stageId) && band.milestones.map((milestone) => (
                  <div
                    className={styles.milestoneStrip}
                    key={milestone.id}
                    id={milestone.id}
                    data-status={milestone.status}
                    data-gate={band.label}
                    data-gate-id={band.stageId}
                    data-ms-name={milestone.name}
                  >
                    <div className={styles.milestoneGutter}>
                      <div className={styles.gutterSticky}>
                      <p>
                        <b>{milestone.id}</b>
                        <small data-status={milestone.status}>
                          {
                            STATUS_META[
                              milestone.status as keyof typeof STATUS_META
                            ]?.code
                          }
                        </small>
                      </p>
                      <span>{milestone.name}</span>
                      <span
                        className={styles.gutterBullet}
                        title={`절차 ${milestone.procCount}개 중 확정 매핑(MAP) ${milestone.exactCount}개`}
                      >
                        <i
                          style={{
                            width: `${(milestone.procCount / maxMilestoneProcs) * 100}%`,
                          }}
                        >
                          <b
                            style={{
                              width: `${
                                milestone.procCount > 0
                                  ? (milestone.exactCount /
                                      milestone.procCount) *
                                    100
                                  : 0
                              }%`,
                            }}
                          />
                        </i>
                      </span>
                      <small>
                        {milestone.procCount}절차 · MAP{" "}
                        {milestone.procCount > 0
                          ? Math.round(
                              (milestone.exactCount / milestone.procCount) *
                                100,
                            )
                          : 0}
                        %
                      </small>
                      </div>
                    </div>
                    {[...milestone.cells.entries()].map(
                      ([subColumn, procs]) => (
                        <div
                          className={styles.cell}
                          key={subColumn}
                          data-lane={subColumns[subColumn]?.lane}
                          style={{ gridColumn: subColumn + 2, gridRow: 1 }}
                        >
                          {procs.map((proc, procIndex) => {
                            const showTemplate =
                              procIndex === 0 ||
                              procs[procIndex - 1].templateName !==
                                proc.templateName;
                            const isHovered = hoverKey === proc.key;
                            const isNeighbor =
                              hoverNeighbors?.has(proc.key) ?? false;
                            return (
                              <Fragment key={proc.key}>
                              {showTemplate && (
                                <i
                                  className={styles.procTemplate}
                                  title={proc.templateName}
                                >
                                  {proc.templateName}
                                </i>
                              )}
                              <span
                                className={styles.proc}
                                ref={setProcRef(proc.key)}
                                data-mapping={proc.mapping}
                                data-type={proc.procType}
                                data-hover={isHovered ? "true" : "false"}
                                data-dim={
                                  (queryActive && !matchKeys.has(proc.key)) ||
                                  (pinnedPath
                                    ? !pinnedPath.nodes.has(proc.key)
                                    : hoverKey !== null &&
                                      !isHovered &&
                                      !isNeighbor)
                                    ? "true"
                                    : "false"
                                }
                                title={proc.title}
                                data-pinned={pinnedKey === proc.key ? "true" : "false"}
                                data-flash={flashKey === proc.key ? "true" : "false"}
                                onMouseEnter={() => setHoverKey(proc.key)}
                                onClick={() =>
                                  setPinnedKey((value) =>
                                    value === proc.key ? null : proc.key,
                                  )
                                }
                              >
                                <b>{proc.procId}</b>
                                <i>{proc.procName}</i>
                                {subColumns[subColumn]?.isOther && (
                                  <small>{proc.procActor}</small>
                                )}
                              </span>
                              </Fragment>
                            );
                          })}
                        </div>
                      ),
                    )}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
