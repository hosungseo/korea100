// 법령 지도 위임선 그래프 유틸. 클라이언트와 테스트가 함께 쓰는 순수 함수.

/** 하향 위임선(인용 제외, 미해결 제외)만 따라 fromId → toId 최단 경로를 BFS로 찾는다. */
export function findRoute(edges, fromId, toId) {
  if (fromId === toId) return { nodes: [fromId], edges: [] };
  const out = new Map();
  for (const e of edges) {
    if (e.kind === "cites" || !e.to) continue;
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e);
  }
  const prev = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const current = queue.shift();
    for (const e of out.get(current) ?? []) {
      if (prev.has(e.to)) continue;
      prev.set(e.to, e);
      if (e.to === toId) return unwind(prev, toId);
      queue.push(e.to);
    }
  }
  return null;
}

function unwind(prev, toId) {
  const nodes = [toId];
  const edgeIds = [];
  let current = toId;
  while (prev.get(current)) {
    const e = prev.get(current);
    edgeIds.unshift(e.id);
    nodes.unshift(e.from);
    current = e.from;
  }
  return { nodes, edges: edgeIds };
}

/** 노드 id → 그 노드에 닿는 위임선 목록 */
export function indexEdgesByNode(edges) {
  const index = new Map();
  for (const e of edges) {
    for (const id of [e.from, e.to]) {
      if (!id) continue;
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(e);
    }
  }
  return index;
}

export function countEdgeKinds(edges) {
  const counts = { decree: 0, rule: 0, adminRule: 0, ordinance: 0, cites: 0 };
  for (const e of edges) counts[e.kind] += 1;
  return counts;
}
