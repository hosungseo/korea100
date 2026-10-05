// 큰 그림 모드의 순수 계산. 장(章) 묶음 만들기, 묶음 사이 위임선 집계, 선 굵기, 라벨 자르기.
// 좌표 계산은 컴포넌트가 맡고, 여기는 DOM 없이 돌아가는 함수만 둔다.

export const MISC_CHAPTER = "총칙·기타";
export const ADMIN_RULE_ALL = "adminRule:all";
export const ADMIN_RULE_BOX_LIMIT = 12;

/**
 * 한 레인의 조문을 장(章) 단위 묶음으로 나눈다. 문서 순서를 지키고, chapter가 null인 조문은
 * 레인당 하나의 "총칙·기타" 묶음에 모은다. 장이 하나도 없으면 레인 이름을 단 묶음 하나가 된다.
 * @param {{ id: string, name: string }} lane
 * @param {{ id: string, chapter: string | null }[]} articles  이 레인의 조문(문서 순서)
 */
export function groupLaneArticles(lane, articles) {
  const hasChapter = articles.some((a) => a.chapter !== null);
  if (!hasChapter) {
    return [{ id: `${lane.id}#lane`, laneId: lane.id, title: lane.name, isLane: true, articleIds: articles.map((a) => a.id) }];
  }
  const groups = [];
  const byKey = new Map();
  let chapterIndex = 0;
  for (const a of articles) {
    const key = a.chapter ?? MISC_CHAPTER;
    let group = byKey.get(key);
    if (!group) {
      const id = a.chapter === null ? `${lane.id}#misc` : `${lane.id}#ch${chapterIndex++}`;
      group = { id, laneId: lane.id, title: key, isLane: false, articleIds: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.articleIds.push(a.id);
  }
  return groups;
}

/**
 * 노드 id → 그림에 실제로 그려지는 노드 id. 접힌 장의 조문은 장 묶음으로, 펼친 장의 조문은 자기 자신으로,
 * 행정규칙 레인은 상자 수 상한을 넘으면 묶음 상자 하나로 간다.
 * @param {{ id: string, articleIds: string[] }[]} groups
 * @param {{ id: string, tier: string }[]} lanes
 * @param {Set<string>} expanded  펼친 장 묶음 id
 */
export function buildNodeMap(groups, lanes, expanded) {
  const map = new Map();
  for (const g of groups) {
    const open = expanded.has(g.id);
    for (const id of g.articleIds) map.set(id, open ? id : g.id);
  }
  const adminLanes = lanes.filter((l) => l.tier === "adminRule");
  const collapseAdmin = adminLanes.length > ADMIN_RULE_BOX_LIMIT;
  for (const l of adminLanes) map.set(l.id, collapseAdmin ? ADMIN_RULE_ALL : l.id);
  for (const l of lanes) if (l.tier === "ordinance") map.set(l.id, l.id);
  return map;
}

/**
 * 위임선을 (출발 노드, 도착 노드, 종류) 단위로 합친다. to가 없는 인용선과 꺼진 종류는 뺀다.
 * 같은 묶음 안에서 도는 선(self loop)은 그릴 수 없으므로 뺀다.
 * @param {{ id: string, from: string, to: string | null, kind: string }[]} edges
 * @param {Map<string, string>} nodeMap
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

/**
 * 묶음 높이 배분. 조문 수에 비례하되 최소 높이를 보장하고, 가능하면 avail 안에 들어가게 단위를 줄인다.
 * 못 들어가면 전부 최소 높이(넘친 만큼은 스크롤).
 * @param {number[]} counts  묶음별 조문 수
 * @param {number} avail  쓸 수 있는 높이(묶음 외 고정 높이는 뺀 값)
 * @param {{ min: number, maxUnit: number }} opt
 */
export function distributeHeights(counts, avail, { min, maxUnit }) {
  const fixed = new Set();
  let unit = maxUnit;
  for (let pass = 0; pass < counts.length + 1; pass++) {
    let flexCount = 0;
    let fixedH = 0;
    counts.forEach((c, i) => { if (fixed.has(i)) fixedH += min; else flexCount += c; });
    unit = flexCount > 0 ? Math.min(maxUnit, (avail - fixedH) / flexCount) : maxUnit;
    let changed = false;
    counts.forEach((c, i) => {
      if (!fixed.has(i) && c * unit < min) { fixed.add(i); changed = true; }
    });
    if (!changed) break;
  }
  if (!(unit > 0)) unit = 0;
  return counts.map((c, i) => (fixed.has(i) ? min : Math.max(min, c * unit)));
}

export const OVERVIEW_SUBTITLE = "법률 → 시행령 → 시행규칙 → 행정규칙 → 자치법규 · 선 굵기 = 위임 건수 · 장을 누르면 조문이 펼쳐집니다";

/**
 * 큰 그림 위에 놓는 한 문장. 사실(조문 수·위임 조문 수) + 판단(가장 많이 맡기는 장).
 * M = 시행령·시행규칙 위임선이 한 건이라도 있는 법률 조문 수(미해결 포함). 장이 없으면 마지막 절을 뺀다.
 * @param {{ name: string, lanes: { id: string, tier: string }[], articles: { id: string, laneId: string, chapter: string | null }[], edges: { from: string, kind: string }[] }} map
 */
export function buildOverviewHeadline(map) {
  const statuteLanes = new Set(map.lanes.filter((l) => l.tier === "statute").map((l) => l.id));
  const statuteArticles = map.articles.filter((a) => statuteLanes.has(a.laneId));
  const chapterOf = new Map(statuteArticles.map((a) => [a.id, a.chapter]));
  const delegating = new Set();
  const perChapter = new Map();
  for (const e of map.edges) {
    if (e.kind !== "decree" && e.kind !== "rule") continue;
    if (!chapterOf.has(e.from)) continue;
    delegating.add(e.from);
    const chapter = chapterOf.get(e.from);
    if (chapter !== null) perChapter.set(chapter, (perChapter.get(chapter) ?? 0) + 1);
  }
  let topChapter = null;
  let topCount = 0;
  for (const [chapter, count] of perChapter) {
    if (count > topCount) { topChapter = chapter; topCount = count; }
  }
  const head = `「${map.name}」 조문 ${statuteArticles.length}개 중 ${delegating.size}개가 시행령·시행규칙에 세부를 맡기고`;
  const title = topChapter ? `${head}, 가장 많이 맡기는 장은 「${topChapter}」입니다.` : `${head} 있습니다.`;
  return { title, subtitle: OVERVIEW_SUBTITLE, delegatingCount: delegating.size, topChapter };
}
