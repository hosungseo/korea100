"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Article, Edge, EdgeKind, LawMap, LawMapClass, LawMapTexts, LawMapView } from "@/lib/law-map-types";
import { findRoute, indexEdgesByNode } from "@/lib/law-map-route.mjs";
import type { LawMapRoute } from "@/lib/law-map-route.mjs";
import { formatLawMapHash, parseLawMapHash } from "@/lib/law-map-hash.mjs";
import LawMapColumn from "./LawMapColumn";
import LawMapOverview from "./LawMapOverview";
import LawMapPanel from "./LawMapPanel";
import LawMapRuleGrid from "./LawMapRuleGrid";
import LawMapToolbar from "./LawMapToolbar";
import { EDGE_COLORS, EDGE_ORDER, TIER_ORDER, describeNode } from "./law-map-constants";
import styles from "./LawMapBoard.module.css";

interface Props {
  map: LawMap;
  /** 조문 분류(규칙 기반 추론). 없으면 규율 보기를 열 수 없다. */
  classMap?: LawMapClass | null;
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

/** 조문이 이 수를 넘는 법은 구조도으로 연다. 그 아래는 카드 목록이 한눈에 들어오므로 자세히 보기. */
const OVERVIEW_THRESHOLD = 150;
/** 이보다 좁은 창은 기본 보기를 자세히로 둔다(구조도 토글은 그대로 쓸 수 있다). */
const NARROW_WIDTH = 700;

export default function LawMapBoard({ map, classMap = null, textUrl }: Props) {
  const byCountDefault: LawMapView = map.articles.length > OVERVIEW_THRESHOLD ? "overview" : "detail";
  const ruleAvailable = classMap !== null;
  // 좁은 화면(모바일)은 구조도이 읽히지 않으므로 자세히가 기본. 서버에서는 폭을 모르니 마운트 뒤 효과에서 정한다.
  const [narrow, setNarrow] = useState(false);
  const defaultView: LawMapView = narrow ? "detail" : byCountDefault;
  const [view, setView] = useState<LawMapView>(byCountDefault);
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
  // 구조도에서 자세히로 넘어갈 때 카드가 아직 없으므로, 스크롤할 조문을 적어 두고 카드가 생기면 이동한다.
  const pendingScrollRef = useRef<string | null>(null);

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
    const canvas = canvasRef.current;
    if (!canvas) { pendingScrollRef.current = id; return; }
    const el = canvas.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
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

  // 카드 열이 생긴 뒤 밀린 스크롤을 처리한다.
  useLayoutEffect(() => {
    if (view !== "detail") return;
    const id = pendingScrollRef.current;
    if (!id) return;
    pendingScrollRef.current = null;
    scrollTo(id);
  }, [view, scrollTo]);

  // 해시 복원 (최초 1회). 해시는 동기로 읽고(아래 기록 효과가 먼저 지우므로) 상태 반영은 다음 프레임에.
  // 보기(v=)는 바로 반영한다. a=·route=만 있는 옛 링크는 자세히 보기로 연다.
  useEffect(() => {
    const state = parseLawMapHash(window.location.hash);
    // 분류 데이터가 없는 법령의 v=r 링크는 보기 지정이 없는 것으로 본다.
    if (state.view === "rule" && !ruleAvailable) delete state.view;
    const isNarrow = window.innerWidth < NARROW_WIDTH;
    if (!isNarrow && !state.view && !state.route && !state.article) return;
    const frame = requestAnimationFrame(() => {
      if (isNarrow) setNarrow(true);
      setView(state.view ?? (state.route || state.article || isNarrow ? "detail" : byCountDefault));
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
  }, [map.edges, isNode, scrollTo, byCountDefault, ruleAvailable]);

  // 해시 기록. 경로는 BFS가 실제로 찾은 양 끝점으로 기록한다(selected와 무관).
  // 보기는 선택·경로가 있거나 기본 보기와 다를 때만 적어, 처음 연 페이지의 주소는 그대로 둔다.
  useEffect(() => {
    const hash = formatLawMapHash({
      article: selected ?? undefined,
      route: route ? [route.nodes[0], route.nodes[route.nodes.length - 1]] : undefined,
      view: selected || route || view !== defaultView ? view : undefined,
    });
    if (window.location.hash === hash) return;
    window.history.replaceState(null, "", hash || `${window.location.pathname}${window.location.search}`);
  }, [selected, route, view, defaultView]);

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

  // view가 바뀌면 카드 캔버스가 새로 붙으므로 다시 잰다.
  useLayoutEffect(() => { measure(); }, [measure, view]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [measure, view]);

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

  const clearSelection = useCallback(() => {
    pendingScrollRef.current = null;
    setSelected(null); setRouteFrom(null); setRoute(null); setRouteMiss(false);
  }, []);

  // 선택이 사라지면 밀려 있던 스크롤도 버린다(나중에 자세히로 넘어갈 때 엉뚱한 곳으로 가지 않게).
  useEffect(() => {
    if (selected === null) pendingScrollRef.current = null;
  }, [selected]);

  // 구조도에서 장(또는 행정규칙·자치법규 상자)을, 규율 보기에서 조문 칩을 누르면 자세히 보기로 넘어가 그 조문(레인)을 연다.
  const pickFromOverview = useCallback((id: string) => {
    setView("detail");
    focusNode(id);
  }, [focusNode]);

  const changeView = useCallback((next: LawMapView) => {
    if (next === "rule" && !ruleAvailable) return;
    setView(next);
  }, [ruleAvailable]);

  // Esc: 선택 해제(입력란 안에서는 건드리지 않는다).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearSelection]);

  const onSearchSubmit = () => {
    const q = query.replace(/\s+/g, "");
    if (!q) return;
    const hit = map.articles.find((a) => a.label === q)
      ?? map.articles.find((a) => `${a.label}${a.title}`.replace(/\s+/g, "").includes(q));
    if (hit) focusNode(hit.id);
  };

  const routeNodes = useMemo(() => new Set(route?.nodes ?? []), [route]);
  // 구조도·규율 보기에서 고른 조문이 없으면 패널은 안내문뿐이므로 숨기고 그림이 폭을 다 쓴다.
  const panelHidden = view !== "detail" && selected === null;

  return (
    <div className={styles.layout} data-panel={panelHidden ? "hidden" : undefined}>
      <div className={styles.main}>
        <LawMapToolbar
          view={view}
          onChangeView={changeView}
          ruleDisabled={!ruleAvailable}
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
        <div className={styles.board} ref={boardRef} data-view={view}>
          {view === "overview" ? (
            <LawMapOverview
              map={map}
              laneById={laneById}
              edgesByNode={edgesByNode}
              kinds={kinds}
              selected={selected}
              routeNodes={routeNodes}
              onPick={pickFromOverview}
            />
          ) : view === "rule" && classMap ? (
            <LawMapRuleGrid
              map={map}
              classMap={classMap}
              kinds={kinds}
              selected={selected}
              onPick={pickFromOverview}
            />
          ) : (
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
          )}
        </div>
      </div>
      {!panelHidden && (
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
      )}
    </div>
  );
}
