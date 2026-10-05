// 큰 그림의 공통 순수 계산. 장(章) 묶음 만들기, 묶음 사이 위임선 집계, 선 굵기, 라벨 자르기, 머리글.
// 구조도 좌표는 law-map-tree-layout.mjs가 맡고, 여기는 DOM 없이 돌아가는 바탕 함수만 둔다.

export const MISC_CHAPTER = "총칙·기타";

/**
 * 한 레인의 조문을 장(章) 단위 묶음으로 나눈다. 문서 순서대로 **이어지는 구간**마다 묶음 하나다.
 * 민법·상법처럼 편(編)마다 "제1장 총칙"이 되풀이되면 각각 따로 묶여 제자리에 놓인다.
 * chapter가 null인 조문도 이어지는 구간끼리만 "총칙·기타" 묶음으로 모은다.
 * 장이 하나도 없으면 레인 이름을 단 묶음 하나가 된다.
 * @param {{ id: string, name: string }} lane
 * @param {{ id: string, chapter: string | null }[]} articles  이 레인의 조문(문서 순서)
 */
export function groupLaneArticles(lane, articles) {
  const hasChapter = articles.some((a) => a.chapter !== null);
  if (!hasChapter) {
    return [{ id: `${lane.id}#lane`, laneId: lane.id, title: lane.name, isLane: true, articleIds: articles.map((a) => a.id) }];
  }
  const groups = [];
  let chapterIndex = 0;
  let miscIndex = 0;
  let prevChapter;
  for (const a of articles) {
    if (groups.length === 0 || a.chapter !== prevChapter) {
      const id = a.chapter === null ? `${lane.id}#misc${miscIndex++}` : `${lane.id}#ch${chapterIndex++}`;
      groups.push({ id, laneId: lane.id, title: a.chapter ?? MISC_CHAPTER, isLane: false, articleIds: [] });
    }
    groups[groups.length - 1].articleIds.push(a.id);
    prevChapter = a.chapter;
  }
  return groups;
}

/**
 * 위임선을 (출발 노드, 도착 노드, 종류) 단위로 합친다. to가 없는 인용선과 꺼진 종류는 뺀다.
 * 같은 묶음 안에서 도는 선(self loop)은 그릴 수 없으므로 뺀다.
 * @param {{ id: string, from: string, to: string | null, kind: string }[]} edges
 * @param {Map<string, string>} nodeMap  조문·레인 id → 그려지는 노드 id
 * @param {Set<string>} kinds  보이는 종류
 */
export function aggregateEdges(edges, nodeMap, kinds) {
  const out = new Map();
  for (const e of edges) {
    if (!e.to || !kinds.has(e.kind)) continue;
    const from = nodeMap.get(e.from);
    const to = nodeMap.get(e.to);
    if (!from || !to || from === to) continue;
    const key = `${from}>${to}>${e.kind}`;
    let agg = out.get(key);
    if (!agg) {
      agg = { id: key, from, to, kind: e.kind, count: 0 };
      out.set(key, agg);
    }
    agg.count += 1;
  }
  return [...out.values()];
}

/** 선 굵기: 1건 1px, 제곱근으로 커져 36건 이상은 6px. */
export function strokeWidthFor(count) {
  return Math.min(6, Math.max(1, Math.sqrt(count)));
}

/** 글자 폭 추정(px). 한글·한자 등 전각은 fontSize, 그 밖은 0.56배로 센다. */
export function measureText(text, fontSize) {
  let width = 0;
  for (const ch of text) width += ch.charCodeAt(0) > 0x2e7f ? fontSize : fontSize * 0.56;
  return width;
}

/** maxWidth 안에 들어가게 자르고 "…"을 붙인다. 한 글자도 못 넣으면 빈 문자열. */
export function fitLabel(text, maxWidth, fontSize) {
  if (measureText(text, fontSize) <= maxWidth) return text;
  const ellipsis = measureText("…", fontSize);
  let width = 0;
  let out = "";
  for (const ch of text) {
    const w = ch.charCodeAt(0) > 0x2e7f ? fontSize : fontSize * 0.56;
    if (width + w + ellipsis > maxWidth) break;
    width += w;
    out += ch;
  }
  return out ? `${out}…` : "";
}

export const OVERVIEW_SUBTITLE = "위에서 아래로 법률 → 시행령 → 시행규칙 → 행정규칙·조례 · 자리 = 어느 장을 받치는가 · 색 선 = 다른 기둥으로 건너가는 위임";

/**
 * 큰 그림 위에 놓는 한 문장. 사실(조문 수·위임 조문 수) + 판단(가장 많이 맡기는 장).
 * M = 시행령·시행규칙 위임선이 한 건이라도 있는 법률 조문 수(미해결 포함).
 * 장은 그림과 같은 묶음(이어지는 구간) 단위로 센다. 장이 없으면 마지막 절을 뺀다.
 * @param {{ name: string, lanes: { id: string, name: string, tier: string }[], articles: { id: string, laneId: string, chapter: string | null }[], edges: { from: string, kind: string }[] }} map
 */
export function buildOverviewHeadline(map) {
  const statuteLanes = map.lanes.filter((l) => l.tier === "statute");
  const statuteLaneIds = new Set(statuteLanes.map((l) => l.id));
  const statuteArticles = map.articles.filter((a) => statuteLaneIds.has(a.laneId));
  const groupOf = new Map();
  for (const lane of statuteLanes) {
    for (const g of groupLaneArticles(lane, statuteArticles.filter((a) => a.laneId === lane.id))) {
      if (g.isLane) continue;
      for (const id of g.articleIds) groupOf.set(id, g);
    }
  }
  const statuteIds = new Set(statuteArticles.map((a) => a.id));
  const delegating = new Set();
  const perGroup = new Map();
  for (const e of map.edges) {
    if (e.kind !== "decree" && e.kind !== "rule") continue;
    if (!statuteIds.has(e.from)) continue;
    delegating.add(e.from);
    const group = groupOf.get(e.from);
    if (group && group.title !== MISC_CHAPTER) perGroup.set(group, (perGroup.get(group) ?? 0) + 1);
  }
  let topChapter = null;
  let topCount = 0;
  for (const [group, count] of perGroup) {
    if (count > topCount) { topChapter = group.title; topCount = count; }
  }
  const head = `「${map.name}」 조문 ${statuteArticles.length}개 중 ${delegating.size}개가 시행령·시행규칙에 세부를 맡기고`;
  const title = topChapter ? `${head}, 가장 많이 맡기는 장은 「${topChapter}」입니다.` : `${head} 있습니다.`;
  return { title, subtitle: OVERVIEW_SUBTITLE, delegatingCount: delegating.size, topChapter };
}
