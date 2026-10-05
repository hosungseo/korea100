"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { Edge, EdgeKind, Lane, LawMap } from "@/lib/law-map-types";
import { countEdgeKinds } from "@/lib/law-map-route.mjs";
import { fitLabel, measureText } from "@/lib/law-map-overview-layout.mjs";
import { buildTreeLayout } from "@/lib/law-map-tree-layout.mjs";
import type { TreeLayout, TreeNode } from "@/lib/law-map-tree-layout.mjs";
import { EDGE_COLORS, EDGE_LABELS, EDGE_ORDER } from "./law-map-constants";
import styles from "./LawMapBoard.module.css";

interface Props {
  map: LawMap;
  laneById: Map<string, Lane>;
  edgesByNode: Map<string, Edge[]>;
  kinds: Set<EdgeKind>;
  selected: string | null;
  routeNodes: Set<string>;
  onPick: (id: string) => void;
}

// 화면 맞춤 상수. 레이아웃은 참조 축척(px)으로 계산되고 viewBox로 보드에 맞춘다.
const PAD = 8;               // 그림 둘레 여백(화면 px)
const TITLE_FONT = 11.2;     // 참조 축척에서 장 제목 글자 크기(축척 바닥 0.85에서 9.5px)
const MIN_SCALE = 0.85;      // 이보다 줄이지 않는다. 폭이 모자라면 가로, 높이가 모자라면 세로로 스크롤
const MAX_SCALE = 1.25;      // 작은 법이 그림판을 다 채우며 커지지 않게
const BADGE_H = 12;

/** 이 페이지 세션에서 큰 그림이 한 번 나타난 법령. 보기 전환으로 다시 붙어도 등장 동작을 반복하지 않는다. */
const animatedOnce = new Set<string>();
const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface ConnectorPath { parentId: string; childId: string; d: string; badge: { x: number; y: number; text: string; w: number } | null }
interface SpinePath { id: string; d: string }
interface CrossPath { id: string; from: string; to: string; kind: EdgeKind; d: string; width: number }

export default function LawMapOverview({ map, laneById, edgesByNode, kinds, selected, routeNodes, onPick }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  // 첫 그리기에서만 줄이 위에서부터 차례로 나타난다. 축소 동작 선호(reduced motion)면 건너뛰고,
  // 자세히 보기에 다녀와 다시 붙을 때(같은 페이지 세션)도 되풀이하지 않는다.
  const [animate, setAnimate] = useState(() =>
    typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !animatedOnce.has(map.lawId));
  const [ready, setReady] = useState(false);
  // 포인터가 호버를 지원할 때만 선 강조를 건다(터치에서는 탭이 호버로 남아 전체가 흐려지는 일을 막는다).
  const [canHover] = useState(() => typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches);

  const layout = useMemo<TreeLayout>(() => buildTreeLayout(map), [map]);
  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);

  // 그림판 크기. 스크롤 상자만 재서, svg가 넘쳐도 되먹임이 생기지 않게 한다.
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
    // 끝까지 보여 준 뒤에만 '한 번 했다'로 친다. 옛 #a= 링크처럼 한 프레임 만에 자세히 보기로 넘어가면 다음에 다시 보여 준다.
    const done = window.setTimeout(() => { animatedOnce.add(map.lawId); setAnimate(false); }, 1000);
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); window.clearTimeout(done); };
  }, [size.w, animate, map.lawId]);

  // 축척: 폭과 높이 둘 다에 맞추되 바닥(0.85) 아래로는 줄이지 않는다. 바닥에 걸리면 모자란 쪽으로 스크롤한다
  // (기둥 폭이 고정이라 기둥 32개짜리 민법 같은 법만 가로로 넘친다).
  const railW = size.w < 700 ? 44 : 64;
  const scale = useMemo(() => {
    if (!size.w || !layout.width || !layout.height) return 1;
    const fitW = (size.w - railW - PAD * 2) / layout.width;
    const fitH = (size.h - PAD * 2) / layout.height;
    return Math.max(MIN_SCALE, Math.min(fitW, fitH, MAX_SCALE));
  }, [size, layout.width, layout.height, railW]);
  const svgW = layout.width * scale + PAD * 2;
  const svgH = layout.height * scale + PAD * 2;
  const pad = PAD / scale;

  // 기둥 척추선: 법률 노드 아래에서 선이 닿는 마지막 자손까지 한 줄.
  const spines = useMemo<SpinePath[]>(() => layout.pillars
    .filter((p) => p.spineY2 !== null)
    .map((p) => ({ id: p.id, d: `M ${p.spineX} ${r1(p.spineY1)} V ${p.spineY2}` })), [layout]);

  // 가지: 척추선에서 자식 노드 왼쪽 가장자리까지 짧은 가로선. 건수 배지는 가지 위에 얹는다.
  const connectors = useMemo<ConnectorPath[]>(() => {
    const out: ConnectorPath[] = [];
    for (const c of layout.connectors) {
      const k = nodeById.get(c.childId);
      const pillar = layout.pillars[k?.pillar ?? -1];
      if (!k || !pillar) continue;
      const cy = r1(k.y + k.h / 2);
      const visible = EDGE_ORDER.reduce((s, kind) => s + (kind !== "cites" && kinds.has(kind) ? c.byKind[kind] : 0), 0);
      const text = visible && k.row < 3 ? String(visible) : "";
      const w = text ? Math.ceil(measureText(text, 8)) + 6 : 0;
      out.push({
        parentId: c.parentId, childId: c.childId,
        d: `M ${pillar.spineX} ${cy} H ${k.x}`,
        badge: text ? { x: r1((pillar.spineX + k.x) / 2), y: r1(cy - BADGE_H / 2), text, w } : null,
      });
    }
    return out;
  }, [layout, nodeById, kinds]);

  const crossPaths = useMemo<CrossPath[]>(() => {
    const out: CrossPath[] = [];
    for (const e of layout.crossEdges) {
      if (!kinds.has(e.kind)) continue;
      const a = nodeById.get(e.from);
      const b = nodeById.get(e.to);
      if (!a || !b) continue;
      // 출발 노드의 오른쪽 가장자리에서 도착 노드의 왼쪽 가장자리로(도착이 왼쪽 기둥이면 반대로).
      const forward = b.pillar > a.pillar || (b.pillar === a.pillar && b.x >= a.x);
      const x1 = r1(forward ? a.x + a.w : a.x);
      const y1 = r1(a.y + a.h / 2);
      const x2 = r1(forward ? b.x : b.x + b.w);
      const y2 = r1(b.y + b.h / 2);
      const dx = Math.max(18, Math.abs(x2 - x1) * 0.4) * (forward ? 1 : -1);
      out.push({
        id: e.id, from: e.from, to: e.to, kind: e.kind, width: crossWidthFor(e.count),
        d: `M ${x1} ${y1} C ${r1(x1 + dx)} ${y1}, ${r1(x2 - dx)} ${y2}, ${x2} ${y2}`,
      });
    }
    return out;
  }, [layout, nodeById, kinds]);

  const nodeIdAt = (target: EventTarget | null): string | null =>
    (target as Element | null)?.closest?.("[data-node-id]")?.getAttribute("data-node-id") ?? null;

  const onClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const id = nodeIdAt(event.target);
    setHoverId(null); // 터치에서는 mouseleave가 오지 않으므로 탭할 때 호버 상태를 지운다.
    const node = id ? nodeById.get(id) : null;
    if (!node) return;
    const target = pickTarget(node);
    if (target) onPick(target);
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
    tip.style.left = `${(flip ? px - 12 : px + 14) + host.scrollLeft}px`;
    tip.style.top = `${py + 14 + host.scrollTop}px`;
    tip.style.transform = flip ? "translateX(-100%)" : "";
  };
  const onMouseLeave = () => setHoverId(null);

  // 호버 강조는 React 밖에서: 선 하나하나를 다시 그리지 않고 <style> 한 장만 바꾼다.
  const hoverCss = useMemo(() => {
    if (!hoverId || !canHover || !nodeById.has(hoverId)) return "";
    const sel = JSON.stringify(hoverId);
    const conn = `[data-parent=${sel}],[data-child=${sel}]`;
    const cross = `[data-src=${sel}],[data-dst=${sel}]`;
    return [
      `[data-ov-root] .${styles.trConn}:is(${conn}){opacity:1}`,
      `[data-ov-root] .${styles.trConn}:is(${conn}) path{stroke:var(--color-ink);stroke-width:1.75}`,
      `[data-ov-root] .${styles.trConn}:not(${conn}){opacity:.14}`,
      `[data-ov-root] .${styles.trCross}:is(${cross}){opacity:.95}`,
      `[data-ov-root] .${styles.trCross}:not(${cross}){opacity:.06}`,
      `[data-ov-root] [data-node-id=${sel}]>rect{stroke:var(--color-ink);stroke-width:1.5}`,
    ].join("");
  }, [hoverId, canHover, nodeById]);

  const tooltip = useMemo(
    () => (hoverId ? describeHover(nodeById.get(hoverId) ?? null, layout, laneById, edgesByNode) : null),
    [hoverId, nodeById, layout, laneById, edgesByNode],
  );

  const selectedNode = selected ? layout.nodeOf.get(selected) ?? selected : null;
  const routeTargets = useMemo(() => {
    const out = new Set<string>();
    for (const id of routeNodes) out.add(layout.nodeOf.get(id) ?? id);
    return out;
  }, [routeNodes, layout]);

  const counts = useMemo(() => {
    const n = (pred: (node: TreeNode) => boolean) => layout.nodes.filter(pred).length;
    const adminLanes = map.lanes.filter((l) => l.tier === "adminRule").length;
    const ordinanceEdges = layout.nodes.filter((x) => x.kind === "ordinances").reduce((s, x) => s + (x.meta.count ?? 0), 0);
    return { statute: n((x) => x.row === 0), decree: n((x) => x.row === 1), rule: n((x) => x.row === 2), adminLanes, ordinanceEdges, cross: layout.crossEdges.length };
  }, [layout, map.lanes]);
  const ariaLabel = `${map.name} 법령 체계 구조도 — 법률 ${counts.statute}장이 기둥, 그 아래로 시행령 ${counts.decree}, 시행규칙 ${counts.rule}, `
    + `행정규칙 ${counts.adminLanes}건, 조례 위임 ${counts.ordinanceEdges}건이 줄마다 쌓임. 기둥이 받치는 장을 뜻하고, 다른 기둥으로 건너가는 위임 ${counts.cross}갈래는 색 선.`;

  const rowEls = useMemo(() => layout.rows.map((row) => (
    <g key={row.row} className={styles.trRow} style={{ "--row-i": layout.rows.indexOf(row) } as CSSProperties}>
      {layout.nodes.filter((n) => n.row === row.row).map((node) => (
        <NodeView key={node.id} node={node} selected={selectedNode === node.id} onRoute={routeTargets.has(node.id)} />
      ))}
    </g>
  )), [layout, selectedNode, routeTargets]);

  const connectorEls = useMemo(() => (
    <>
      {spines.map((sp) => <path key={sp.id} className={styles.trSpine} d={sp.d} />)}
      {connectors.map((c) => (
        <g key={`${c.parentId}>${c.childId}`} className={styles.trConn} data-parent={c.parentId} data-child={c.childId}>
          <path d={c.d} />
          {c.badge && (
            <g className={styles.trBadge}>
              <rect x={r1(c.badge.x - c.badge.w / 2)} y={c.badge.y} width={c.badge.w} height={BADGE_H} rx={3} />
              <text x={c.badge.x} y={c.badge.y + BADGE_H - 3} textAnchor="middle">{c.badge.text}</text>
            </g>
          )}
        </g>
      ))}
    </>
  ), [spines, connectors]);

  const crossEls = useMemo(() => crossPaths.map((e) => (
    <path
      key={e.id} className={styles.trCross} d={e.d} data-src={e.from} data-dst={e.to}
      fill="none" stroke={EDGE_COLORS[e.kind]} strokeWidth={e.width} strokeLinecap="round"
    />
  )), [crossPaths]);

  return (
    <div className={styles.overviewWrap}>
      <div className={styles.ovHead}>
        <p className={styles.ovTitle}>{layout.headline.title}</p>
        <p className={styles.ovSub}>{layout.headline.subtitle}</p>
      </div>
      <div className={styles.ovHost} ref={hostRef}>
        {size.w > 0 && layout.nodes.length > 0 && (
          <>
            <div className={styles.trRail} style={{ width: railW, height: svgH }} aria-hidden>
              {layout.rows.map((row) => (
                <span key={row.row} style={{ top: PAD + (row.y + row.h / 2) * scale }}>{row.label.replace("·", "·\n")}</span>
              ))}
            </div>
            <svg
              className={styles.overviewSvg}
              data-ov-root
              data-animate={animate || undefined}
              data-ready={ready || !animate || undefined}
              width={r1(svgW)}
              height={r1(svgH)}
              viewBox={`0 0 ${r1(svgW / scale)} ${r1(svgH / scale)}`}
              role="img"
              aria-label={ariaLabel}
              onClick={onClick}
              onMouseOver={onMouseOver}
              onMouseMove={onMouseMove}
              onMouseLeave={onMouseLeave}
            >
              {hoverCss && <style>{hoverCss}</style>}
              <g transform={`translate(${r1(pad)} ${r1(pad)})`}>
                <g className={styles.trLines}>
                  {connectorEls}
                  {crossEls}
                </g>
                {rowEls}
              </g>
            </svg>
          </>
        )}
        <div ref={tooltipRef} className={styles.tooltip} data-show={tooltip !== null} role="presentation">
          {tooltip && (
            <>
              <strong>{tooltip.title}</strong>
              {tooltip.sub && <span className={styles.tooltipSub}>{tooltip.sub}</span>}
              {tooltip.items && (
                <span className={styles.tooltipList}>
                  {tooltip.items.map((item, i) => <span key={i}>{item}</span>)}
                  {tooltip.more > 0 && <span>외 {tooltip.more}</span>}
                </span>
              )}
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

/** 건너가는 선 굵기: 1건 1.2px, 제곱근으로 커져 36건 안팎에서 3.5px. 연결선(1.25px)과 같은 급으로 둬 그림을 덮지 않게 한다. */
function crossWidthFor(count: number): number {
  return r1(clamp(0.75 + Math.sqrt(count) * 0.45, 1, 3.5));
}

/** 노드를 누르면 자세히 보기에서 열 조문·레인. 장은 첫 조문, 요약 상자는 첫 장의 첫 조문, 상자는 첫 행정규칙·자치법규 레인. */
function pickTarget(node: TreeNode): string | null {
  switch (node.kind) {
    case "chapter":
    case "summary":
      return node.articleIds[0] ?? null;
    case "adminRules":
      return node.meta.laneIds?.[0] ?? null;
    case "ordinances":
      return node.laneId;
  }
}

function NodeView({ node, selected, onRoute }: { node: TreeNode; selected: boolean; onRoute: boolean }) {
  const { x, y, w, h } = node;
  const leaf = node.row === 3;
  // 윗줄 왼쪽: 법률은 장 번호(굵게), 시행령·시행규칙 장은 레인 이름, 레인 묶음은 법종구분, 요약 상자는 접힌 첫 장 이름.
  // 윗줄 오른쪽: 조문 N. 아랫줄: 제목(요약 상자는 "시행령 N장").
  let top: string | null = null;
  let main: string;
  let topBold = false;
  if (node.kind === "chapter" && node.tier === "statute") {
    top = node.meta.chapterNo ?? null;
    topBold = true;
    main = node.meta.chapterNo ? (node.meta.chapterRest ?? "") : node.label;
  } else if (node.kind === "chapter") {
    top = node.meta.isLane ? (node.meta.laneKind ?? null) : (node.meta.laneName ?? null);
    main = node.label;
  } else if (node.kind === "summary") {
    top = node.meta.items?.[0] ?? null;
    main = node.label;
  } else {
    main = node.label;
  }
  const subW = node.sub && !leaf ? measureText(node.sub, 8.5) + 8 : 0;
  const inner = w - 12;
  return (
    <g
      className={leaf ? styles.trLeaf : styles.trNode}
      data-node-id={node.id}
      data-kind={node.kind}
      data-tier={node.tier}
      data-orphan={node.orphan || undefined}
      data-selected={selected || undefined}
      data-route={onRoute || undefined}
    >
      <rect x={x} y={y} width={w} height={h} rx={leaf ? 3 : 4} />
      {leaf ? (
        <text className={styles.trMain} x={x + 6} y={r1(y + h / 2 + 3.6)} fontSize={9.5}>{fitLabel(main, inner, 9.5)}</text>
      ) : (
        <>
          {top && <text className={topBold ? styles.trTopStrong : styles.trTop} x={x + 6} y={y + 14}>{fitLabel(top, inner - subW, topBold ? 10 : 8.5)}</text>}
          {node.sub && <text className={styles.trSub} x={x + w - 6} y={y + 14} textAnchor="end">{node.sub}</text>}
          <text className={styles.trMain} x={x + 6} y={r1(y + h - 12)} fontSize={TITLE_FONT}>{fitLabel(main, inner, TITLE_FONT)}</text>
        </>
      )}
    </g>
  );
}

interface Tooltip { title: string; sub: string | null; items: string[] | null; more: number; kinds: [EdgeKind, number][]; hint: string | null }

function describeHover(node: TreeNode | null, layout: TreeLayout, laneById: Map<string, Lane>, edgesByNode: Map<string, Edge[]>): Tooltip | null {
  if (!node) return null;
  const kindsOf = (counts: Record<string, number>): [EdgeKind, number][] =>
    EDGE_ORDER.filter((kind) => kind !== "cites" && (counts[kind] ?? 0) > 0).map((kind) => [kind, counts[kind]]);
  const outgoing = (ids: string[]) => {
    const seen = new Map<string, Edge>();
    for (const id of ids) for (const e of edgesByNode.get(id) ?? []) if (e.from === id && e.to) seen.set(e.id, e);
    return kindsOf(countEdgeKinds([...seen.values()]));
  };
  // 잎 상자에 닿는 선: 연결선(부모에서) + 건너오는 선
  const incoming = (id: string) => {
    const counts: Record<string, number> = {};
    for (const c of layout.connectors) if (c.childId === id) for (const [k, n] of Object.entries(c.byKind)) counts[k] = (counts[k] ?? 0) + n;
    for (const e of layout.crossEdges) if (e.to === id) counts[e.kind] = (counts[e.kind] ?? 0) + e.count;
    return kindsOf(counts);
  };
  const orphanNote = node.orphan ? " · 들어오는 위임선 없음(문서 위치로 놓음)" : "";
  switch (node.kind) {
    case "chapter": {
      const lane = node.laneId ? laneById.get(node.laneId) : null;
      const sub = node.meta.isLane ? (lane?.kind ?? null) : (lane ? `${lane.name} · ${lane.kind}` : null);
      return { title: `${node.label} · 조문 ${node.articleIds.length}`, sub: sub ? sub + orphanNote : orphanNote || null, items: null, more: 0, kinds: outgoing(node.articleIds), hint: "클릭하면 자세히 보기로 이동" };
    }
    case "summary":
      return {
        title: `${node.label} · 조문 ${node.articleIds.length}`, sub: `한 자리에 접은 ${node.meta.childIds?.length ?? 0}개 묶음${orphanNote}`,
        items: node.meta.items ?? null, more: node.meta.more ?? 0, kinds: outgoing(node.articleIds), hint: "클릭하면 자세히 보기로 이동",
      };
    case "adminRules":
      return {
        title: node.label, sub: node.orphan ? "들어오는 위임선 없음(문서 위치로 놓음)" : null,
        items: node.meta.items ?? null, more: node.meta.more ?? 0, kinds: incoming(node.id), hint: "클릭하면 자세히 보기로 이동",
      };
    case "ordinances":
      return {
        title: node.label, sub: `이 장에서 조례·규칙으로 보내는 위임 ${node.meta.count}건 · 전국 조례·규칙 ${node.meta.total ?? 0}건`,
        items: null, more: 0, kinds: incoming(node.id), hint: "클릭하면 자세히 보기로 이동",
      };
  }
}
