"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Article, Edge, EdgeKind, LawMap, LawMapTexts } from "@/lib/law-map-types";
import { findRoute, indexEdgesByNode } from "@/lib/law-map-route.mjs";
import type { LawMapRoute } from "@/lib/law-map-route.mjs";
import { formatLawMapHash, parseLawMapHash } from "@/lib/law-map-hash.mjs";
import LawMapColumn from "./LawMapColumn";
import LawMapPanel from "./LawMapPanel";
import LawMapToolbar from "./LawMapToolbar";
import { EDGE_COLORS, EDGE_ORDER, TIER_ORDER, describeNode } from "./law-map-constants";
import styles from "./LawMapBoard.module.css";

interface Props {
  map: LawMap;
  textUrl: string;
}

/** Live site header height; falls back to the desktop value from globals.css when the header is absent. */
function headerHeight(): number {
  return document.querySelector(".site-header")?.getBoundingClientRect().height ?? 56;
}

interface Wire {
  id: string;
  kind: EdgeKind;
  d: string;
  onRoute: boolean;
}

export default function LawMapBoard({ map, textUrl }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [routeMode, setRouteMode] = useState(false);
  const [routeFrom, setRouteFrom] = useState<string | null>(null);
  const [route, setRoute] = useState<LawMapRoute | null>(null);
  const [routeMiss, setRouteMiss] = useState(false);
  const [kinds, setKinds] = useState<Set<EdgeKind>>(() => new Set(EDGE_ORDER));
  const [query, setQuery] = useState("");
  const [texts, setTexts] = useState<LawMapTexts | null>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const edgesByNode = useMemo(() => indexEdgesByNode(map.edges), [map.edges]);
  const edgeById = useMemo(() => new Map(map.edges.map((e) => [e.id, e])), [map.edges]);
  const articleById = useMemo(() => new Map(map.articles.map((a) => [a.id, a])), [map.articles]);
  const laneById = useMemo(() => new Map(map.lanes.map((l) => [l.id, l])), [map.lanes]);
  const articlesByLane = useMemo(() => {
    const grouped = new Map<string, Article[]>();
    for (const a of map.articles) {
      if (!grouped.has(a.laneId)) grouped.set(a.laneId, []);
      grouped.get(a.laneId)!.push(a);
    }
    return grouped;
  }, [map.articles]);
  const lanesByTier = useMemo(
    () => TIER_ORDER.map((tier) => ({ tier, lanes: map.lanes.filter((l) => l.tier === tier) })),
    [map.lanes],
  );
  const institutionsByArticle = useMemo(() => {
    const grouped = new Map<string, { slug: string; name: string }[]>();
    for (const inst of map.institutions) {
      for (const id of inst.articles) {
        if (!grouped.has(id)) grouped.set(id, []);
        grouped.get(id)!.push({ slug: inst.slug, name: inst.name });
      }
    }
    return grouped;
  }, [map.institutions]);

  // 조문 미리보기 지연 로드. 실패해도 보드는 동작한다.
  useEffect(() => {
    let alive = true;
    fetch(textUrl)
      .then((res) => (res.ok ? res.json() : {}))
      .then((json: LawMapTexts) => { if (alive) setTexts(json ?? {}); })
      .catch(() => { if (alive) setTexts({}); });
    return () => { alive = false; };
  }, [textUrl]);

  const isNode = useCallback((id: string) => articleById.has(id) || laneById.has(id), [articleById, laneById]);

  // 보드 안에서만 스크롤한다. scrollIntoView는 창까지 밀어 툴바가 사이트 헤더 밑으로 들어가므로 쓰지 않는다.
  const scrollTo = useCallback((id: string) => {
    const board = boardRef.current;
    const el = canvasRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
    if (!board || !el) return;
    const b = board.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    board.scrollTo({
      top: board.scrollTop + (r.top - b.top) - (b.height - r.height) / 2,
      left: board.scrollLeft + (r.left - b.left) - (b.width - r.width) / 2,
      behavior: "smooth",
    });
    const headerH = headerHeight();
    const mainTop = board.parentElement?.getBoundingClientRect().top ?? headerH;
    if (mainTop > headerH) window.scrollBy({ top: mainTop - headerH, behavior: "smooth" });
  }, []);

  // 해시 복원 (최초 1회). 해시는 동기로 읽고(아래 기록 효과가 먼저 지우므로) 상태 반영은 다음 프레임에.
  useEffect(() => {
    const state = parseLawMapHash(window.location.hash);
    if (!state.route && !state.article) return;
    const frame = requestAnimationFrame(() => {
      if (state.route && isNode(state.route[0]) && isNode(state.route[1])) {
        const found = findRoute(map.edges, state.route[0], state.route[1]);
        setRouteMode(true);
        setRouteFrom(state.route[0]);
        setSelected(state.route[1]);
        setRoute(found);
        setRouteMiss(!found);
        scrollTo(state.route[1]);
      } else if (state.article && isNode(state.article)) {
        setSelected(state.article);
        scrollTo(state.article);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [map.edges, isNode, scrollTo]);

  // 해시 기록. 경로는 BFS가 실제로 찾은 양 끝점으로 기록한다(selected와 무관).
  useEffect(() => {
    const hash = formatLawMapHash({
      article: selected ?? undefined,
      route: route ? [route.nodes[0], route.nodes[route.nodes.length - 1]] : undefined,
    });
    if (window.location.hash === hash) return;
    window.history.replaceState(null, "", hash || `${window.location.pathname}${window.location.search}`);
  }, [selected, route]);

  const active = hover ?? selected;
  const visibleEdges = useMemo(() => {
    const picked = new Map<string, Edge>();
    if (route) for (const id of route.edges) { const e = edgeById.get(id); if (e) picked.set(id, e); }
    if (active) for (const e of edgesByNode.get(active) ?? []) if (e.to && kinds.has(e.kind)) picked.set(e.id, e);
    return [...picked.values()];
  }, [route, active, edgesByNode, edgeById, kinds]);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const base = canvas.getBoundingClientRect();
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    setCanvasSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    const rectOf = (id: string) => {
      const el = canvas.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left - base.left, right: r.right - base.left, y: r.top - base.top + r.height / 2 };
    };
    const routeEdges = new Set(route?.edges ?? []);
    const next: Wire[] = [];
    for (const e of visibleEdges) {
      if (!e.to) continue;
      const a = rectOf(e.from);
      const b = rectOf(e.to);
      if (!a || !b) continue;
      const forward = b.left >= a.right;
      const x1 = forward ? a.right : a.left;
      const x2 = forward ? b.left : b.right;
      const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1);
      next.push({ id: e.id, kind: e.kind, onRoute: routeEdges.has(e.id), d: `M ${x1} ${a.y} C ${x1 + dx} ${a.y}, ${x2 - dx} ${b.y}, ${x2} ${b.y}` });
    }
    setWires(next);
  }, [visibleEdges, route]);

  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [measure]);

  // 패널 버튼·검색에서 온 이동. 경로 밖 노드로 가면 경로를 지운다(출발점·경로 모드는 유지해 이어 갈 수 있게).
  const focusNode = useCallback((id: string) => {
    if (route && !route.nodes.includes(id)) setRoute(null);
    if (routeMiss) setRouteMiss(false);
    setSelected(id);
    setHover(null);
    scrollTo(id);
  }, [route, routeMiss, scrollTo]);

  const onNodeClick = useCallback((id: string) => {
    if (routeMode) {
      if (!routeFrom || route || routeMiss) {
        setRouteFrom(id); setRoute(null); setRouteMiss(false); setSelected(id);
        return;
      }
      // 출발 카드를 다시 누른 경우: 0단계 경로를 만들지 않고 선택만 유지한다.
      if (routeFrom === id) { setSelected(id); return; }
      const found = findRoute(map.edges, routeFrom, id);
      setRoute(found); setRouteMiss(!found); setSelected(id);
      return;
    }
    setSelected((prev) => (prev === id ? null : id));
  }, [routeMode, routeFrom, route, routeMiss, map.edges]);

  const toggleRouteMode = () => {
    setRouteMode((on) => !on);
    setRouteFrom(null); setRoute(null); setRouteMiss(false);
  };

  const clearSelection = () => {
    setSelected(null); setRouteFrom(null); setRoute(null); setRouteMiss(false);
  };

  const onSearchSubmit = () => {
    const q = query.replace(/\s+/g, "");
    if (!q) return;
    const hit = map.articles.find((a) => a.label === q)
      ?? map.articles.find((a) => `${a.label}${a.title}`.replace(/\s+/g, "").includes(q));
    if (hit) focusNode(hit.id);
  };

  const routeNodes = useMemo(() => new Set(route?.nodes ?? []), [route]);

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <LawMapToolbar
          kinds={kinds}
          onToggleKind={(kind) => setKinds((prev) => { const next = new Set(prev); if (next.has(kind)) next.delete(kind); else next.add(kind); return next; })}
          query={query}
          onQuery={setQuery}
          onSearchSubmit={onSearchSubmit}
          routeMode={routeMode}
          onToggleRoute={toggleRouteMode}
          routeFromLabel={routeFrom ? describeNode(routeFrom, articleById, laneById) : null}
          onClear={clearSelection}
        />
        <div className={styles.board} ref={boardRef}>
          <div className={styles.canvas} ref={canvasRef}>
            {lanesByTier.map(({ tier, lanes }) => (
              <LawMapColumn
                key={tier}
                tier={tier}
                lanes={lanes}
                articlesByLane={articlesByLane}
                edgesByNode={edgesByNode}
                selected={selected}
                routeNodes={routeNodes}
                routeFrom={routeFrom}
                hasRoute={route !== null}
                query={query}
                onClick={onNodeClick}
                onHover={setHover}
              />
            ))}
            <svg className={styles.wires} width={canvasSize.w} height={canvasSize.h} aria-hidden>
              {wires.map((wire) => (
                <path
                  key={wire.id}
                  d={wire.d}
                  fill="none"
                  stroke={EDGE_COLORS[wire.kind]}
                  strokeWidth={wire.onRoute ? 3 : 1.75}
                  opacity={route && !wire.onRoute ? 0.35 : 0.9}
                />
              ))}
            </svg>
          </div>
        </div>
      </div>
      <LawMapPanel
        selected={selected}
        articleById={articleById}
        laneById={laneById}
        edgesByNode={edgesByNode}
        institutionsByArticle={institutionsByArticle}
        texts={texts}
        route={route}
        routeMiss={routeMiss}
        routeFrom={routeFrom}
        onFocus={focusNode}
      />
    </div>
  );
}
