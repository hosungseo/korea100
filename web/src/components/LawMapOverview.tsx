"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { Article, Edge, EdgeKind, Lane, LawMap, Tier } from "@/lib/law-map-types";
import { countEdgeKinds } from "@/lib/law-map-route.mjs";
import {
  ADMIN_RULE_ALL, ADMIN_RULE_BOX_LIMIT, aggregateEdges, buildNodeMap, buildOverviewHeadline, distributeHeights, fitLabel,
  groupLaneArticles, measureText, strokeWidthFor,
} from "@/lib/law-map-overview-layout.mjs";
import type { ChapterGroup } from "@/lib/law-map-overview-layout.mjs";
import { EDGE_COLORS, EDGE_LABELS, EDGE_ORDER, TIER_LABELS } from "./law-map-constants";
import styles from "./LawMapBoard.module.css";

interface Props {
  map: LawMap;
  lanesByTier: { tier: Tier; lanes: Lane[] }[];
  articlesByLane: Map<string, Article[]>;
  articleById: Map<string, Article>;
  laneById: Map<string, Lane>;
  edgesByNode: Map<string, Edge[]>;
  kinds: Set<EdgeKind>;
  selected: string | null;
  routeNodes: Set<string>;
  onPick: (id: string) => void;
}

// 레이아웃 상수(px). 뷰포트 높이에 맞춰 블록 높이만 변하고 나머지는 고정이다.
const PAD_X = 8;
const PAD_TOP = 4;
const PAD_BOTTOM = 8;
const HEAD_H = 30;
const LANE_HEAD_H = 15;
const LANE_GAP = 10;
const BLOCK_GAP = 3;
const BLOCK_MIN = 22;
const MAX_UNIT = 8;       // 조문 1개당 최대 높이. 작은 법이 화면을 다 차지하지 않게 한다.
const ROW_H = 14;
const BOX_MAX = 40;
const SINGLE_BOX_H = 44;

interface Rect { x: number; y: number; w: number; h: number }

interface Node {
  id: string;
  type: "group" | "row" | "box";
  rect: Rect;
  title: string;
  count: number | null;       // 조문 수(묶음) · 건수(상자). 행은 null
  open?: boolean;             // 펼친 장의 머리 블록
  clickable: boolean;
}

interface LaneHead { id: string; rect: Rect; name: string; collapsible: boolean }

interface Column {
  tier: Tier;
  index: number;
  x: number;
  w: number;
  headCount: string;
  nodes: Node[];
  laneHeads: LaneHead[];
}

interface Layout {
  columns: Column[];
  rectById: Map<string, Rect>;
  nodeMap: Map<string, string>;
  groupById: Map<string, ChapterGroup>;
  contentH: number;
}

interface Wire { id: string; from: string; to: string; kind: EdgeKind; d: string; width: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** 이 페이지 세션에서 큰 그림이 한 번 나타난 법령. 보기 전환으로 다시 붙어도 등장 동작을 반복하지 않는다. */
const animatedOnce = new Set<string>();
const r1 = (v: number) => Math.round(v * 10) / 10;

export default function LawMapOverview({
  map, lanesByTier, articlesByLane, articleById, laneById, edgesByNode, kinds, selected, routeNodes, onPick,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [hoverId, setHoverId] = useState<string | null>(null);
  // 첫 그리기에서만 열별로 차례로 나타난다. 축소 동작 선호(reduced motion)면 건너뛰고,
  // 자세히 보기에 다녀와 다시 붙을 때(같은 페이지 세션)도 되풀이하지 않는다.
  const [animate, setAnimate] = useState(() =>
    typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !animatedOnce.has(map.lawId));
  const [ready, setReady] = useState(false);

  const headline = useMemo(() => buildOverviewHeadline(map), [map]);
  const chapterGroupsByLane = useMemo(() => {
    const out = new Map<string, ChapterGroup[]>();
    for (const lane of map.lanes) {
      if (lane.tier === "adminRule" || lane.tier === "ordinance") continue;
      out.set(lane.id, groupLaneArticles(lane, articlesByLane.get(lane.id) ?? []));
    }
    return out;
  }, [map.lanes, articlesByLane]);
  const delegationCount = useMemo(() => map.edges.filter((e) => e.to !== null).length, [map.edges]);

  // 보드 영역 크기. 호스트(svg를 담는 상자)만 재서, svg가 넘쳐도 되먹임이 생기지 않게 한다.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const w = host.clientWidth;
      const h = Math.max(480 - 60, host.clientHeight);
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!size.w || !animate) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setReady(true)); });
    animatedOnce.add(map.lawId);
    const done = window.setTimeout(() => setAnimate(false), 900);
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); window.clearTimeout(done); };
  }, [size.w, animate, map.lawId]);

  // Esc: 펼친 장을 모두 접는다.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded((prev) => (prev.size ? new Set() : prev)); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const layout = useMemo<Layout | null>(() => {
    if (!size.w) return null;
    const W = size.w;
    const colGap = W < 700 ? 12 : 28;
    const colW = (W - PAD_X * 2 - colGap * 4) / 5;
    const avail = size.h - PAD_TOP - HEAD_H - PAD_BOTTOM;
    const top = PAD_TOP + HEAD_H + 6;
    const rectById = new Map<string, Rect>();
    const groupById = new Map<string, ChapterGroup>();
    const effectiveGroups: ChapterGroup[] = [];
    let contentH = top;

    const columns = lanesByTier.map(({ tier, lanes }, index): Column => {
      const x = PAD_X + index * (colW + colGap);
      const nodes: Node[] = [];
      const laneHeads: LaneHead[] = [];
      const total = lanes.reduce((sum, lane) => sum + lane.articleCount, 0);
      let headCount = `${lanes.length}건 · 조문 ${total}`;
      let y = top;

      if (tier === "ordinance") {
        const lane = lanes[0];
        const count = lane?.collapsed?.count ?? 0;
        headCount = `${count}건`;
        if (lane) {
          const rect = { x, y, w: colW, h: SINGLE_BOX_H };
          nodes.push({ id: lane.id, type: "box", rect, title: "조례·규칙", count, clickable: true });
          rectById.set(lane.id, rect);
          y += SINGLE_BOX_H;
        }
      } else if (tier === "adminRule") {
        headCount = `${lanes.length}건`;
        if (lanes.length > ADMIN_RULE_BOX_LIMIT) {
          const rect = { x, y, w: colW, h: SINGLE_BOX_H };
          nodes.push({ id: ADMIN_RULE_ALL, type: "box", rect, title: "행정규칙", count: lanes.length, clickable: false });
          rectById.set(ADMIN_RULE_ALL, rect);
          y += SINGLE_BOX_H;
        } else if (lanes.length) {
          const h = clamp((avail - (lanes.length - 1) * BLOCK_GAP) / lanes.length, BLOCK_MIN, BOX_MAX);
          for (const lane of lanes) {
            const rect = { x, y, w: colW, h };
            nodes.push({ id: lane.id, type: "box", rect, title: lane.name, count: null, clickable: true });
            rectById.set(lane.id, rect);
            y += h + BLOCK_GAP;
          }
          y -= BLOCK_GAP;
        }
      } else {
        // 장 단위가 다 안 들어가는 열(국가공무원법 시행령 55개 등)은 레인 단위로 접고, 레인을 누르면 장이 나온다.
        const perLane = lanes.map((lane) => chapterGroupsByLane.get(lane.id) ?? []);
        const chapterModeH = perLane.reduce((sum, groups) => {
          const head = groups.length === 1 && groups[0].isLane ? 0 : LANE_HEAD_H;
          return sum + head + groups.length * BLOCK_MIN + Math.max(0, groups.length - 1) * BLOCK_GAP;
        }, 0) + Math.max(0, lanes.length - 1) * LANE_GAP;
        const laneMode = chapterModeH > avail && lanes.length > 1;
        const laneGap = laneMode ? 2 : LANE_GAP;
        const blockMin = laneMode ? clamp(Math.floor((avail - (lanes.length - 1) * laneGap) / lanes.length), 10, BLOCK_MIN) : BLOCK_MIN;

        const items = lanes.map((lane, i) => {
          const chapterGroups = perLane[i];
          if (laneMode) {
            const laneGroupId = `${lane.id}#lane`;
            const open = expanded.has(laneGroupId);
            const groups = open
              ? chapterGroups
              : [{ id: laneGroupId, laneId: lane.id, title: lane.name, isLane: true, articleIds: (articlesByLane.get(lane.id) ?? []).map((a) => a.id) }];
            return { lane, groups, showHead: open, headId: laneGroupId, headCollapsible: true };
          }
          const showHead = !(chapterGroups.length === 1 && chapterGroups[0].isLane);
          return { lane, groups: chapterGroups, showHead, headId: `${lane.id}#lane`, headCollapsible: false };
        });

        let fixed = Math.max(0, lanes.length - 1) * laneGap;
        const collapsedCounts: number[] = [];
        for (const item of items) {
          if (item.showHead) fixed += LANE_HEAD_H;
          fixed += Math.max(0, item.groups.length - 1) * BLOCK_GAP;
          for (const g of item.groups) {
            if (expanded.has(g.id)) fixed += BLOCK_MIN + g.articleIds.length * ROW_H;
            else collapsedCounts.push(g.articleIds.length);
          }
        }
        const heights = distributeHeights(collapsedCounts, avail - fixed, { min: blockMin, maxUnit: MAX_UNIT });
        let k = 0;
        for (const item of items) {
          if (item.showHead) {
            laneHeads.push({ id: item.headId, rect: { x, y, w: colW, h: LANE_HEAD_H }, name: item.lane.name, collapsible: item.headCollapsible });
            y += LANE_HEAD_H;
          }
          item.groups.forEach((g, gi) => {
            effectiveGroups.push(g);
            groupById.set(g.id, g);
            if (expanded.has(g.id)) {
              const rect = { x, y, w: colW, h: BLOCK_MIN };
              nodes.push({ id: g.id, type: "group", rect, title: g.title, count: g.articleIds.length, open: true, clickable: true });
              rectById.set(g.id, rect);
              y += BLOCK_MIN;
              for (const id of g.articleIds) {
                const a = articleById.get(id);
                const row = { x, y, w: colW, h: ROW_H };
                nodes.push({ id, type: "row", rect: row, title: a ? `${a.label} ${a.title}`.trim() : id, count: null, clickable: true });
                rectById.set(id, row);
                y += ROW_H;
              }
            } else {
              const h = heights[k++];
              const rect = { x, y, w: colW, h };
              nodes.push({ id: g.id, type: "group", rect, title: g.title, count: g.articleIds.length, clickable: true });
              rectById.set(g.id, rect);
              y += h;
            }
            if (gi < item.groups.length - 1) y += BLOCK_GAP;
          });
          y += laneGap;
        }
        y -= laneGap;
      }
      contentH = Math.max(contentH, y);
      return { tier, index, x, w: colW, headCount, nodes, laneHeads };
    });

    const nodeMap = buildNodeMap(effectiveGroups, map.lanes, expanded);
    return { columns, rectById, nodeMap, groupById, contentH: contentH + PAD_BOTTOM };
  }, [size, lanesByTier, chapterGroupsByLane, articlesByLane, articleById, expanded, map.lanes]);

  const wires = useMemo<Wire[]>(() => {
    if (!layout) return [];
    const out: Wire[] = [];
    for (const agg of aggregateEdges(map.edges, layout.nodeMap, kinds)) {
      const a = layout.rectById.get(agg.from);
      const b = layout.rectById.get(agg.to);
      if (!a || !b) continue;
      const forward = b.x >= a.x + a.w;
      const x1 = forward ? a.x + a.w : a.x;
      const x2 = forward ? b.x : b.x + b.w;
      const y1 = a.y + a.h / 2;
      const y2 = b.y + b.h / 2;
      const dx = Math.max(16, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1);
      out.push({
        id: agg.id, from: agg.from, to: agg.to, kind: agg.kind, width: strokeWidthFor(agg.count),
        d: `M ${r1(x1)} ${r1(y1)} C ${r1(x1 + dx)} ${r1(y1)}, ${r1(x2 - dx)} ${r1(y2)}, ${r1(x2)} ${r1(y2)}`,
      });
    }
    return out;
  }, [layout, map.edges, kinds]);

  const toggleGroup = useCallback((id: string) => {
    setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const nodeIdAt = (target: EventTarget | null): string | null =>
    (target as Element | null)?.closest?.("[data-node-id]")?.getAttribute("data-node-id") ?? null;

  const onClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const id = nodeIdAt(event.target);
    if (!id || !layout) return;
    if (layout.groupById.has(id) || id.endsWith("#lane")) { toggleGroup(id); return; }
    if (id === ADMIN_RULE_ALL) return;
    if (articleById.has(id) || laneById.has(id)) onPick(id);
  };

  const onMouseOver = (event: ReactMouseEvent<SVGSVGElement>) => {
    const id = nodeIdAt(event.target);
    if (id !== hoverId) setHoverId(id);
  };
  const onMouseMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const tip = tooltipRef.current;
    const host = hostRef.current;
    if (!tip || !host) return;
    const base = host.getBoundingClientRect();
    const px = event.clientX - base.left;
    const py = event.clientY - base.top;
    const flip = px + 260 > base.width;
    tip.style.left = `${flip ? px - 12 : px + 14}px`;
    tip.style.top = `${py + 14}px`;
    tip.style.transform = flip ? "translateX(-100%)" : "";
  };
  const onMouseLeave = () => setHoverId(null);

  // 호버 강조는 React 밖에서: 선 하나하나를 다시 그리지 않고 <style> 한 장만 바꾼다.
  const hoverCss = useMemo(() => {
    if (!hoverId) return "";
    const sel = JSON.stringify(hoverId);
    return [
      `[data-ov-root] path[data-src=${sel}],[data-ov-root] path[data-dst=${sel}]{opacity:1}`,
      `[data-ov-root] path:not([data-src=${sel}]):not([data-dst=${sel}]){opacity:.1}`,
      `[data-ov-root] [data-node-id=${sel}]>rect{stroke:var(--color-ink);stroke-width:1.5}`,
    ].join("");
  }, [hoverId]);

  const tooltip = useMemo(
    () => (hoverId && layout ? describeHover(hoverId, layout, expanded, chapterGroupsByLane, articleById, laneById, edgesByNode, map.lanes) : null),
    [hoverId, layout, expanded, chapterGroupsByLane, articleById, laneById, edgesByNode, map.lanes],
  );

  const selectedNode = selected ? layout?.nodeMap.get(selected) ?? selected : null;
  const routeTargets = useMemo(() => {
    const out = new Set<string>();
    if (!layout) return out;
    for (const id of routeNodes) out.add(layout.nodeMap.get(id) ?? id);
    return out;
  }, [routeNodes, layout]);

  const wireEls = useMemo(() => wires.map((w) => (
    <path key={w.id} d={w.d} data-src={w.from} data-dst={w.to} fill="none" stroke={EDGE_COLORS[w.kind]} strokeWidth={w.width} strokeLinecap="round" />
  )), [wires]);

  const columnEls = useMemo(() => layout?.columns.map((col) => (
    <g key={col.tier} className={styles.ovCol} style={{ "--col-i": col.index } as CSSProperties}>
      <text className={styles.ovTier} x={col.x} y={PAD_TOP + 14}>{TIER_LABELS[col.tier]}</text>
      {col.w >= 120 && <text className={styles.ovTierCount} x={col.x + col.w} y={PAD_TOP + 14} textAnchor="end">{col.headCount}</text>}
      <line className={styles.ovTierRule} x1={col.x} x2={col.x + col.w} y1={PAD_TOP + HEAD_H - 4} y2={PAD_TOP + HEAD_H - 4} />
      {col.laneHeads.map((head) => (
        <g key={`head:${head.id}`} className={styles.ovLaneHead} data-node-id={head.collapsible ? head.id : undefined}>
          <rect x={head.rect.x} y={head.rect.y} width={head.rect.w} height={head.rect.h} fill="transparent" />
          <text x={head.rect.x + 1} y={head.rect.y + 11}>{fitLabel(`${head.collapsible ? "▾ " : ""}${head.name}`, head.rect.w - 2, 9.5)}</text>
        </g>
      ))}
      {col.nodes.map((node) => (
        <NodeView
          key={node.id}
          node={node}
          selected={selectedNode === node.id}
          onRoute={routeTargets.has(node.id)}
        />
      ))}
    </g>
  )), [layout, selectedNode, routeTargets]);

  const svgH = layout ? Math.max(size.h, layout.contentH) : size.h;

  return (
    <div className={styles.overviewWrap}>
      <div className={styles.ovHead}>
        <p className={styles.ovTitle}>{headline.title}</p>
        <p className={styles.ovSub}>{headline.subtitle}</p>
      </div>
      <div className={styles.ovHost} ref={hostRef}>
        {layout && (
          <svg
            className={styles.overviewSvg}
            data-ov-root
            data-animate={animate || undefined}
            data-ready={ready || !animate || undefined}
            width={size.w}
            height={svgH}
            viewBox={`0 0 ${size.w} ${svgH}`}
            role="img"
            aria-label={`${map.name} 법령 지도 개요 — 조문 ${map.articles.length}개, 위임선 ${delegationCount}개`}
            onClick={onClick}
            onMouseOver={onMouseOver}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
          >
            {hoverCss && <style>{hoverCss}</style>}
            <g className={styles.ovWires}>{wireEls}</g>
            {columnEls}
          </svg>
        )}
        <div ref={tooltipRef} className={styles.tooltip} data-show={tooltip !== null} role="presentation">
          {tooltip && (
            <>
              <strong>{tooltip.title}</strong>
              {tooltip.sub && <span className={styles.tooltipSub}>{tooltip.sub}</span>}
              {tooltip.kinds.length > 0 && (
                <span className={styles.tooltipKinds}>
                  {tooltip.kinds.map(([kind, n]) => (
                    <span key={kind}><i style={{ background: EDGE_COLORS[kind] }} />{EDGE_LABELS[kind]} {n}</span>
                  ))}
                </span>
              )}
              {tooltip.hint && <span className={styles.tooltipHint}>{tooltip.hint}</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NodeView({ node, selected, onRoute }: { node: Node; selected: boolean; onRoute: boolean }) {
  const { x, y, w, h } = node.rect;
  const isRow = node.type === "row";
  const fontSize = isRow ? 9.5 : h < 14 ? 8.5 : 10.5;
  const showText = h >= 10 && w >= 24;
  const countLabel = node.count === null ? "" : node.type === "box" ? `${node.count}건` : `조문 ${node.count}`;
  const showCount = showText && countLabel && w >= 90;
  const countW = showCount ? measureText(countLabel, 9) + 6 : 0;
  const title = showText ? fitLabel(`${node.open ? "▾ " : ""}${node.title}`, w - 12 - countW, fontSize) : "";
  return (
    <g
      className={isRow ? styles.ovRow : node.type === "box" ? styles.ovBox : styles.ovBlock}
      data-node-id={node.id}
      data-open={node.open || undefined}
      data-selected={selected || undefined}
      data-route={onRoute || undefined}
      data-clickable={node.clickable || undefined}
    >
      <rect x={r1(x)} y={r1(y)} width={r1(w)} height={r1(h)} rx={isRow ? 0 : 3} />
      {title && <text x={r1(x + 6)} y={r1(y + h / 2 + fontSize * 0.36)} fontSize={fontSize}>{title}</text>}
      {showCount && <text className={styles.ovCount} x={r1(x + w - 6)} y={r1(y + h / 2 + 3.2)} textAnchor="end">{countLabel}</text>}
    </g>
  );
}

interface Tooltip { title: string; sub: string | null; kinds: [EdgeKind, number][]; hint: string | null }

function describeHover(
  id: string, layout: Layout, expanded: Set<string>, chapterGroupsByLane: Map<string, ChapterGroup[]>,
  articleById: Map<string, Article>, laneById: Map<string, Lane>, edgesByNode: Map<string, Edge[]>, lanes: Lane[],
): Tooltip {
  const kindsOf = (edges: Edge[]): [EdgeKind, number][] => {
    const counts = countEdgeKinds(edges);
    return EDGE_ORDER.filter((kind) => kind !== "cites" && counts[kind] > 0).map((kind) => [kind, counts[kind]]);
  };
  const unionEdges = (ids: string[]) => {
    const seen = new Map<string, Edge>();
    for (const nid of ids) for (const e of edgesByNode.get(nid) ?? []) if (e.to) seen.set(e.id, e);
    return [...seen.values()];
  };
  const article = articleById.get(id);
  if (article) {
    return {
      title: article.title ? `${article.label}(${article.title})` : article.label,
      sub: laneById.get(article.laneId)?.name ?? null,
      kinds: kindsOf((edgesByNode.get(id) ?? []).filter((e) => e.to)),
      hint: "클릭하면 자세히 보기로 이동",
    };
  }
  if (id === ADMIN_RULE_ALL) {
    const adminLanes = lanes.filter((l) => l.tier === "adminRule");
    return { title: `행정규칙 ${adminLanes.length}건`, sub: null, kinds: kindsOf(unionEdges(adminLanes.map((l) => l.id))), hint: null };
  }
  const lane = laneById.get(id);
  if (lane) {
    const title = lane.tier === "ordinance" ? `조례·규칙 ${lane.collapsed?.count ?? 0}건` : lane.name;
    return { title, sub: lane.tier === "ordinance" ? null : lane.kind, kinds: kindsOf(edgesByNode.get(id) ?? []), hint: "클릭하면 자세히 보기로 이동" };
  }
  const group = layout.groupById.get(id);
  if (group) {
    const open = expanded.has(group.id);
    const laneName = laneById.get(group.laneId)?.name ?? null;
    // 레인 단위로 접힌 블록은 누르면 장이 먼저 나온다(그 레인에 장이 있을 때).
    const chapters = chapterGroupsByLane.get(group.laneId) ?? [];
    const opensToChapters = group.isLane && !(chapters.length === 1 && chapters[0].isLane);
    return {
      title: `${group.title} · 조문 ${group.articleIds.length}`,
      sub: group.isLane ? null : laneName,
      kinds: kindsOf(unionEdges(group.articleIds)),
      hint: open ? "클릭하면 접힙니다" : opensToChapters ? "클릭하면 장이 펼쳐집니다" : "클릭하면 조문이 펼쳐집니다",
    };
  }
  // 레인 단위로 접힌 열에서 펼친 레인의 머리글
  const laneId = id.replace(/#lane$/, "");
  const head = laneById.get(laneId);
  return { title: head?.name ?? id, sub: null, kinds: [], hint: "클릭하면 접힙니다" };
}
