// 큰 그림(법령 체계 구조도)의 순수 계산. 위→아래 위계 트리: 법률 장 → 시행령 장 → 시행규칙 장 → 행정규칙·조례.
// 자리 자체가 관계를 말한다: 법률 장 하나가 기둥(세로 열) 하나이고, 노드는 자기를 가장 많이 받치는(위임선을
// 가장 많이 보내는) 장의 기둥 안에, 같은 층(줄)끼리 세로로 쌓인다. 좌표까지 여기서 계산하고(참조 축척),
// 화면 맞춤(viewBox 축척)과 그리기는 컴포넌트가 맡는다.

import { aggregateEdges, buildOverviewHeadline, groupLaneArticles } from "./law-map-overview-layout.mjs";

/** 툴팁에 나열하는 이름 수. 넘치면 "외 N". */
export const TOOLTIP_LIST_MAX = 8;
export const ROW_LABELS = ["법률", "시행령", "시행규칙", "행정규칙·조례"];

export const TREE_DEFAULTS = {
  pillarW: 112,      // 기둥(법률 장) 폭 = 법률 노드 폭. 고정이라 기둥 수가 곧 그림 폭이다.
  pillarGap: 12,     // 기둥 사이
  gutter: 16,        // 기둥 왼쪽에서 척추선과 가지가 쓰는 폭. 자식 노드는 이만큼 들여 쓴다.
  nodeH: 44,         // 장 노드(장 번호·레인 / 제목, 조문 N은 윗줄 오른쪽)
  leafH: 26,         // 행정규칙·조례 상자
  stackGap: 6,       // 같은 줄 안에서 세로로 쌓인 노드 사이
  rowGap: 28,        // 줄(row) 사이
  collapseAbove: 6,  // 한 부모의 같은 줄에 선이 닿는 자식이 이 수를 넘으면 요약 상자로 접는다(세로로 쌓이므로 넉넉히)
};

const DELEGATION_KINDS = new Set(["decree", "rule", "adminRule", "ordinance"]);
const ROW_OF_TIER = { statute: 0, decree: 1, rule: 2 };
const TIER_LABEL = { decree: "시행령", rule: "시행규칙" };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 부모 고르기: 위임선을 가장 많이 보내는 출발 묶음. 같으면 문서 순서가 앞선 쪽.
 * @param {{ source: string, count: number, order: number }[]} candidates
 * @returns {string | null}
 */
export function pickParent(candidates) {
  let best = null;
  for (const c of candidates) {
    if (!best || c.count > best.count || (c.count === best.count && c.order < best.order)) best = c;
  }
  return best ? best.source : null;
}

/**
 * 고아(들어오는 선이 없는 묶음)가 붙을 법률 장 번호: 자기 층 안의 상대 위치(index/total)를 법률 장 수에 투영한다.
 * 총칙은 총칙 아래, 벌칙은 벌칙 아래 놓이게 된다.
 */
export function orphanParentIndex(index, total, parentCount) {
  if (parentCount <= 0) return -1;
  if (total <= 0) return 0;
  return clamp(Math.floor((index / total) * parentCount), 0, parentCount - 1);
}

/**
 * 접기 규칙. 한 부모의 같은 줄에서 선이 닿는 자식이 collapseAbove를 넘으면 요약 상자 하나로 접는다.
 * 고아(선이 없어 상대 위치로만 놓인 묶음)는 하나하나가 자리 정보를 갖지 않으므로 2개부터 늘 하나로 접는다.
 * @template {{ orphan: boolean, order: number }} T
 * @param {T[]} children  문서 순서
 * @returns {{ kept: T[], connected: T[] | null, orphans: T[] | null }}
 */
export function collapseChildren(children, collapseAbove) {
  const connected = children.filter((c) => !c.orphan);
  const orphans = children.filter((c) => c.orphan);
  const kept = [];
  const out = { kept, connected: null, orphans: null };
  if (connected.length > collapseAbove) out.connected = connected; else kept.push(...connected);
  if (orphans.length >= 2) out.orphans = orphans; else kept.push(...orphans);
  kept.sort((a, b) => a.order - b.order);
  return out;
}

/** 세로로 쌓인 노드 더미의 높이. 0개면 0. */
export function stackHeight(count, nodeH, gap) {
  return count <= 0 ? 0 : count * nodeH + (count - 1) * gap;
}

/**
 * 줄 높이 = 기둥마다 쌓인 더미 중 가장 높은 것. 노드가 하나도 없는 줄은 0(그 줄은 그리지 않는다).
 * @param {Map<number, number>[]} pillarCounts  기둥별 { row → 노드 수 }
 * @param {(row: number) => number} nodeHOf
 */
export function rowHeights(pillarCounts, nodeHOf, gap, rowCount = 4) {
  const out = Array.from({ length: rowCount }, () => 0);
  for (const counts of pillarCounts) {
    for (const [row, count] of counts) out[row] = Math.max(out[row], stackHeight(count, nodeHOf(row), gap));
  }
  return out;
}

/** "제2장 건축물의 건축" → { no: "제2장", rest: "건축물의 건축" }. 장 번호가 없으면 no는 null. */
export function splitChapter(title) {
  const m = /^(제\d+장(?:의\d+)?)\s*(.*)$/.exec(title);
  return m ? { no: m[1], rest: m[2] } : { no: null, rest: title };
}

/** 툴팁용 이름 목록: 앞 max개 + "외 N". */
export function listNames(names, max = TOOLTIP_LIST_MAX) {
  return { items: names.slice(0, max), more: Math.max(0, names.length - max) };
}

/**
 * 법령 지도 → 구조도 레이아웃.
 * @param {{ lanes: any[], articles: any[], edges: any[], name: string }} map
 * @param {Partial<typeof TREE_DEFAULTS>} [options]
 */
export function buildTreeLayout(map, options = {}) {
  const opt = { ...TREE_DEFAULTS, ...options };
  const headline = buildOverviewHeadline(map);

  // 1) 레인별 조문(문서 순서) → 장 묶음. 문서 순서 번호(order)는 법률 → 시행령 → 시행규칙 층 순, 레인 순, 장 순.
  const articlesByLane = new Map();
  for (const a of map.articles) {
    if (!articlesByLane.has(a.laneId)) articlesByLane.set(a.laneId, []);
    articlesByLane.get(a.laneId).push(a);
  }
  const laneById = new Map(map.lanes.map((l) => [l.id, l]));
  const tierGroups = { statute: [], decree: [], rule: [] };
  const groupById = new Map();
  let order = 0;
  for (const tier of ["statute", "decree", "rule"]) {
    for (const lane of map.lanes) {
      if (lane.tier !== tier) continue;
      for (const g of groupLaneArticles(lane, articlesByLane.get(lane.id) ?? [])) {
        if (g.articleIds.length === 0) continue; // 조문이 없는 레인은 그릴 것이 없다
        const entry = { ...g, tier, order: order++, tierIndex: tierGroups[tier].length };
        tierGroups[tier].push(entry);
        groupById.set(g.id, entry);
      }
    }
  }
  const adminLanes = map.lanes.filter((l) => l.tier === "adminRule");
  const ordinanceLanes = map.lanes.filter((l) => l.tier === "ordinance");
  const statutes = tierGroups.statute;
  const empty = { nodes: [], connectors: [], crossEdges: [], nodeOf: new Map(), rows: [], pillars: [], width: 0, height: 0, headline };
  if (statutes.length === 0) return empty;

  // 2) 조문 → 묶음, 레인 → 레인으로 접은 위임선 집계(인용 제외).
  const nodeMap = new Map();
  for (const g of groupById.values()) for (const id of g.articleIds) nodeMap.set(id, g.id);
  for (const l of adminLanes) nodeMap.set(l.id, l.id);
  for (const l of ordinanceLanes) nodeMap.set(l.id, l.id);
  const agg = aggregateEdges(map.edges, nodeMap, DELEGATION_KINDS);

  // 도착 노드별 후보 부모(종류별): 시행령 장은 decree선, 시행규칙 장은 rule선, 행정규칙은 adminRule선.
  const candidatesOf = new Map();
  for (const e of agg) {
    const src = groupById.get(e.from);
    if (!src) continue;
    const key = `${e.to}|${e.kind}`;
    if (!candidatesOf.has(key)) candidatesOf.set(key, []);
    candidatesOf.get(key).push({ source: e.from, count: e.count, order: src.order });
  }
  const candidates = (id, kind, allowTiers) =>
    (candidatesOf.get(`${id}|${kind}`) ?? []).filter((c) => allowTiers.has(groupById.get(c.source).tier));

  // 3) 묶음 → 그려지는 노드(접힌 묶음은 요약 상자). 부모 결정은 줄 순서대로.
  const collapsedInto = new Map();
  const resolve = (id) => collapsedInto.get(id) ?? id;
  const nodes = [];
  const nodeById = new Map();
  const childrenOf = new Map();  // 그려지는 부모 id → 자식 노드 id(줄·문서 순서)
  const parentOf = new Map();
  const nodeOf = new Map();      // 조문·레인 id → 그려지는 노드 id

  const addNode = (node) => { nodes.push(node); nodeById.set(node.id, node); return node; };
  const attach = (parentId, childId) => {
    parentOf.set(childId, parentId);
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId).push(childId);
  };
  const chapterNode = (g, parentId, orphan) => {
    const lane = laneById.get(g.laneId);
    const { no, rest } = splitChapter(g.title);
    return addNode({
      id: g.id, row: ROW_OF_TIER[g.tier], x: 0, y: 0, h: opt.nodeH, w: g.tier === "statute" ? opt.pillarW : opt.pillarW - opt.gutter,
      label: g.title, sub: `조문 ${g.articleIds.length}`, kind: "chapter", tier: g.tier, laneId: g.laneId,
      parentId, articleIds: g.articleIds, orphan, order: g.order,
      meta: { laneName: lane?.name ?? g.laneId, laneKind: lane?.kind ?? null, isLane: g.isLane, chapterNo: no, chapterRest: rest, articleCount: g.articleIds.length },
    });
  };
  const summaryNode = (groups, parentId, orphan) => {
    const tier = groups[0].tier;
    const articleIds = groups.flatMap((g) => g.articleIds);
    const unit = groups.every((g) => g.isLane) ? "건" : "장";
    const id = `sum:${parentId}:${tier}${orphan ? ":orphan" : ""}`;
    const names = groups.map((g) => (g.isLane ? g.title : `${laneById.get(g.laneId)?.name ?? g.laneId} ${g.title}`));
    for (const g of groups) collapsedInto.set(g.id, id);
    return addNode({
      id, row: ROW_OF_TIER[tier], x: 0, y: 0, h: opt.nodeH, w: opt.pillarW - opt.gutter,
      label: `${TIER_LABEL[tier]} ${groups.length}${unit}`, sub: `조문 ${articleIds.length}`, kind: "summary", tier, laneId: null,
      parentId, articleIds, orphan, order: Math.min(...groups.map((g) => g.order)),
      meta: { ...listNames(names), childIds: groups.map((g) => g.id), articleCount: articleIds.length, unit },
    });
  };
  // 한 줄의 묶음들을 부모별로 모아 접기 규칙을 적용하고 노드로 만든다.
  const placeRow = (groups, parentFor) => {
    const byParent = new Map();
    for (const g of groups) {
      const { parentId, orphan } = parentFor(g);
      if (!byParent.has(parentId)) byParent.set(parentId, []);
      byParent.get(parentId).push({ ...g, orphan });
    }
    for (const [parentId, kids] of byParent) {
      kids.sort((a, b) => a.order - b.order);
      const { kept, connected, orphans } = collapseChildren(kids, opt.collapseAbove);
      const made = kept.map((g) => chapterNode(g, parentId, g.orphan));
      if (connected) made.push(summaryNode(connected, parentId, false));
      if (orphans) made.push(summaryNode(orphans, parentId, true));
      made.sort((a, b) => a.order - b.order);
      for (const n of made) attach(parentId, n.id);
    }
  };

  // 줄 0: 법률 장 = 기둥.
  const roots = statutes.map((g) => chapterNode(g, null, false).id);
  // 줄 1: 시행령 장 → decree선을 가장 많이 보내는 법률 장 아래.
  const statuteTier = new Set(["statute"]);
  placeRow(tierGroups.decree, (g) => {
    const parent = pickParent(candidates(g.id, "decree", statuteTier));
    if (parent) return { parentId: parent, orphan: false };
    return { parentId: statutes[orphanParentIndex(g.tierIndex, tierGroups.decree.length, statutes.length)].id, orphan: true };
  });
  // 줄 2: 시행규칙 장 → rule선을 가장 많이 보내는 법률·시행령 장 아래(접힌 장이면 그 요약 상자 아래).
  const upperTiers = new Set(["statute", "decree"]);
  placeRow(tierGroups.rule, (g) => {
    const parent = pickParent(candidates(g.id, "rule", upperTiers));
    if (parent) return { parentId: resolve(parent), orphan: false };
    return { parentId: statutes[orphanParentIndex(g.tierIndex, tierGroups.rule.length, statutes.length)].id, orphan: true };
  });
  for (const g of groupById.values()) for (const id of g.articleIds) nodeOf.set(id, resolve(g.id));

  // 줄 3: 잎. 행정규칙은 부모별로 상자 하나("행정규칙 N건"), 조례는 부모별로 위임 건수 상자 하나.
  const anyTier = new Set(["statute", "decree", "rule"]);
  const adminByParent = new Map();
  const orphanAdminByParent = new Map();
  adminLanes.forEach((lane, i) => {
    const parent = pickParent(candidates(lane.id, "adminRule", anyTier));
    const target = parent ? adminByParent : orphanAdminByParent;
    const parentId = parent ? resolve(parent) : statutes[orphanParentIndex(i, adminLanes.length, statutes.length)].id;
    if (!target.has(parentId)) target.set(parentId, []);
    target.get(parentId).push(lane);
  });
  const ordinanceByParent = new Map();
  const ordinanceIds = new Set(ordinanceLanes.map((l) => l.id));
  for (const e of agg) {
    if (e.kind !== "ordinance" || !ordinanceIds.has(e.to) || !groupById.has(e.from)) continue;
    const parentId = resolve(e.from);
    ordinanceByParent.set(parentId, (ordinanceByParent.get(parentId) ?? 0) + e.count);
  }
  const ordinanceTotal = ordinanceLanes.reduce((s, l) => s + (l.collapsed?.count ?? 0), 0);
  const leafW = opt.pillarW - opt.gutter;
  // 잎은 부모 바로 밑이 아니라 기둥 맨 아래 줄에 쌓이므로, 부모의 문서 순서를 물려받아 기둥 안에서 부모 차례대로 놓인다.
  // 고아 상자(선 없음)는 맨 아래로 보낸다.
  const addLeaf = (node, slot) => {
    const parent = nodeById.get(node.parentId);
    node.order = (node.orphan ? 1e6 : 0) + (parent?.order ?? 0) * 4 + slot;
    addNode(node);
    parentOf.set(node.id, node.parentId);
  };
  const adminBox = (parentId, lanes, orphan) => {
    const id = `adm:${parentId}${orphan ? ":orphan" : ""}`;
    for (const l of lanes) nodeOf.set(l.id, id);
    addLeaf({
      id, row: 3, x: 0, y: 0, w: leafW, h: opt.leafH,
      label: `행정규칙 ${lanes.length}건`, sub: null, kind: "adminRules", tier: "adminRule", laneId: null,
      parentId, articleIds: [], orphan, order: 0,
      meta: { ...listNames(lanes.map((l) => l.name)), laneIds: lanes.map((l) => l.id), count: lanes.length },
    }, orphan ? 1 : 0);
  };
  for (const [parentId, lanes] of adminByParent) adminBox(parentId, lanes, false);
  for (const [parentId, lanes] of orphanAdminByParent) adminBox(parentId, lanes, true);
  let ordinanceBest = null;
  for (const [parentId, count] of ordinanceByParent) {
    const id = `ord:${parentId}`;
    addLeaf({
      id, row: 3, x: 0, y: 0, w: leafW, h: opt.leafH,
      label: `조례 위임 ${count}건`, sub: null, kind: "ordinances", tier: "ordinance", laneId: ordinanceLanes[0]?.id ?? null,
      parentId, articleIds: [], orphan: false, order: 2,
      meta: { count, total: ordinanceTotal },
    }, 2);
    if (!ordinanceBest || count > ordinanceBest.count) ordinanceBest = { id, count };
  }
  if (ordinanceBest) for (const l of ordinanceLanes) nodeOf.set(l.id, ordinanceBest.id);

  // 4) 기둥: 노드는 자기 부모의 기둥(법률 장)에 들어간다. 같은 기둥·같은 줄의 노드는 문서 순서로 세로로 쌓인다.
  const pillarIndex = new Map(roots.map((id, i) => [id, i]));
  const pillarOf = (id) => {
    if (pillarIndex.has(id)) return pillarIndex.get(id);
    const parentId = parentOf.get(id);
    return parentId === undefined ? 0 : pillarOf(parentId);
  };
  const stacks = new Map(); // `${pillar}:${row}` → 노드 id[]
  for (const n of nodes) {
    n.pillar = pillarOf(n.id);
    const key = `${n.pillar}:${n.row}`;
    if (!stacks.has(key)) stacks.set(key, []);
    stacks.get(key).push(n.id);
  }
  for (const ids of stacks.values()) ids.sort((a, b) => nodeById.get(a).order - nodeById.get(b).order || a.localeCompare(b));
  const pillarCounts = roots.map((_, i) => {
    const counts = new Map();
    for (let row = 0; row < 4; row++) counts.set(row, stacks.get(`${i}:${row}`)?.length ?? 0);
    return counts;
  });

  // 5) 줄 높이는 모든 기둥에서 같다(같은 층 = 같은 높이). 노드가 없는 줄은 건너뛴다(시행규칙이 없는 법 등).
  const rowH = rowHeights(pillarCounts, (row) => (row === 3 ? opt.leafH : opt.nodeH), opt.stackGap);
  const rowY = new Map();
  let y = 0;
  const rows = [];
  rowH.forEach((h, row) => {
    if (h === 0) return;
    rowY.set(row, y);
    rows.push({ row, y, h, label: ROW_LABELS[row] });
    y += h + opt.rowGap;
  });
  const height = Math.max(0, y - opt.rowGap);
  const width = roots.length * opt.pillarW + (roots.length - 1) * opt.pillarGap;
  for (const [key, ids] of stacks) {
    const [pillar, row] = key.split(":").map(Number);
    const x0 = pillar * (opt.pillarW + opt.pillarGap);
    let cy = rowY.get(row);
    for (const id of ids) {
      const n = nodeById.get(id);
      n.x = row === 0 ? x0 : x0 + opt.gutter;
      n.y = cy;
      cy += n.h + opt.stackGap;
    }
  }
  // 기둥 척추선: 법률 노드 아래에서, 선이 닿는 마지막 자손의 가운데 높이까지. 자손이 모두 고아면 없다.
  const pillars = roots.map((id, i) => {
    const root = nodeById.get(id);
    const x = i * (opt.pillarW + opt.pillarGap);
    const connected = nodes.filter((n) => n.pillar === i && n.row > 0 && !n.orphan);
    const spineY2 = connected.length ? Math.max(...connected.map((n) => n.y + n.h / 2)) : null;
    return { id, index: i, x, spineX: round1(x + opt.gutter / 2), spineY1: root.y + root.h, spineY2: spineY2 === null ? null : round1(spineY2) };
  });
  for (const n of nodes) { n.x = round1(n.x); n.y = round1(n.y); }

  // 6) 선. 부모→자식은 연결선(건수 배지), 그 밖의 위임은 건너가는 선(cross edge).
  const drawnTarget = (to, from) => {
    if (groupById.has(to)) return resolve(to);
    if (ordinanceIds.has(to)) return `ord:${resolve(from)}`;
    return nodeOf.get(to) ?? null;
  };
  const connectorByChild = new Map();
  for (const n of nodes) {
    if (!n.parentId || n.orphan) continue;
    connectorByChild.set(n.id, { parentId: n.parentId, childId: n.id, count: 0, byKind: { decree: 0, rule: 0, adminRule: 0, ordinance: 0 } });
  }
  const crossByKey = new Map();
  for (const e of agg) {
    if (!groupById.has(e.from)) continue;
    const from = resolve(e.from);
    const to = drawnTarget(e.to, e.from);
    if (!to || from === to) continue;
    const conn = connectorByChild.get(to);
    if (conn && conn.parentId === from) {
      conn.count += e.count;
      conn.byKind[e.kind] += e.count;
      continue;
    }
    const key = `${from}>${to}>${e.kind}`;
    const cross = crossByKey.get(key) ?? { id: key, from, to, kind: e.kind, count: 0 };
    cross.count += e.count;
    crossByKey.set(key, cross);
  }

  return {
    nodes, connectors: [...connectorByChild.values()], crossEdges: [...crossByKey.values()],
    nodeOf, rows, pillars, width: round1(width), height: round1(height), headline,
  };
}

const round1 = (v) => Math.round(v * 10) / 10;
