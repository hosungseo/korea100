// 규율 보기(규율 구조도)의 순수 레이아웃: 법률 조문을 주체 레인(세로) × 규율 단계(가로) 격자에 놓는다.
// 입력은 법령 지도 IR과 조문 분류(class.json). 브라우저·React 의존 없음.
// 분류는 규칙 기반 추론이므로 칸마다 신뢰도·근거를 그대로 들고 간다 — 그림은 추론임을 숨기지 않는다.

/** 가로축(규율 단계) 순서. unknown은 비어 있지 않을 때만 꼬리에 '미분류'로 붙는다. */
export const STAGE_ORDER = ["purpose", "standard", "procedure", "operation", "organization", "supervision", "penalty", "misc"];
export const STAGE_LABELS = {
  purpose: "목적·정의",
  standard: "기준·의무",
  procedure: "인허가·절차",
  operation: "행정 운영",
  organization: "조직·위원회",
  supervision: "감독·시정",
  penalty: "벌칙·과태료",
  misc: "보칙",
  unknown: "미분류",
};

/** 세로축(주체 레인) 순서. 수범자가 맨 위, 그 아래로 가까운 행정기관부터. */
export const ACTOR_ORDER = ["citizen", "local", "central", "committee", "court", "none"];
export const ACTOR_LABELS = {
  citizen: "국민·사업자",
  local: "지방자치단체",
  central: "중앙행정기관",
  committee: "위원회·전문기관",
  court: "법원·검찰",
  none: "주체 없음",
  unknown: "미분류",
};
export const UNCLASSIFIED_LABEL = "미분류";

/** 칸에 바로 보이는 칩 수. 넘치면 "+N"으로 접고 제자리에서 펼친다. */
export const CELL_CHIP_LIMIT = 5;
/** 점선 테두리 문턱: 이 아래의 추론은 흐리게 표시한다. */
export const LOW_CONFIDENCE = 0.5;

const AUTHORITY_LANES = ["local", "central", "committee", "court"];

/**
 * 격자를 만든다.
 * @param {import("./law-map-types").LawMap} map
 * @param {import("./law-map-types").LawMapClass | null} classMap
 * @returns {import("./law-map-rule-layout.mjs").RuleGrid}
 */
export function buildRuleGrid(map, classMap) {
  const statuteLanes = new Set(map.lanes.filter((l) => l.tier === "statute").map((l) => l.id));
  const entries = classMap?.articles ?? {};
  const cellMap = new Map(); // `${stage}|${actor}` → cell
  const stageCount = new Map();
  const actorCount = new Map();
  let total = 0;
  let deleted = 0;
  let low = 0;
  let withSecondary = 0;

  // 조문별 바깥 위임선(시행령·시행규칙)을 센다. 인용(cites)과 미해결(to=null)은 배지에 넣지 않는다.
  const delegations = new Map();
  for (const e of map.edges) {
    if (!e.to || (e.kind !== "decree" && e.kind !== "rule")) continue;
    const d = delegations.get(e.from) ?? { decree: 0, rule: 0 };
    d[e.kind] += 1;
    delegations.set(e.from, d);
  }

  for (const a of map.articles) {
    if (!statuteLanes.has(a.laneId)) continue;
    const c = entries[a.id];
    if (!c) continue;
    if (c.deleted) { deleted += 1; continue; }
    total += 1;
    const stage = STAGE_ORDER.includes(c.stage) ? c.stage : "unknown";
    const actor = ACTOR_ORDER.includes(c.actor) ? c.actor : "unknown";
    const secondary = (c.actors ?? []).filter((x) => x.role === "secondary" && x.actor !== actor).map((x) => ({ actor: x.actor, evidence: x.evidence ?? [] }));
    const lowConfidence = c.confidence < LOW_CONFIDENCE;
    if (lowConfidence) low += 1;
    if (secondary.length > 0) withSecondary += 1;
    const key = `${stage}|${actor}`;
    let cell = cellMap.get(key);
    if (!cell) {
      cell = { stage, actor, articles: [], delegations: { decree: 0, rule: 0 } };
      cellMap.set(key, cell);
    }
    const d = delegations.get(a.id);
    if (d) { cell.delegations.decree += d.decree; cell.delegations.rule += d.rule; }
    cell.articles.push({
      id: a.id,
      label: a.label,
      title: a.title,
      stage,
      actor,
      confidence: c.confidence,
      lowConfidence,
      secondary,
      evidence: c.evidence ?? [],
      method: c.method,
      delegations: d ?? { decree: 0, rule: 0 },
    });
    stageCount.set(stage, (stageCount.get(stage) ?? 0) + 1);
    actorCount.set(actor, (actorCount.get(actor) ?? 0) + 1);
  }

  const columns = [...STAGE_ORDER, "unknown"]
    .filter((s) => (stageCount.get(s) ?? 0) > 0)
    .map((s) => ({ stage: s, label: STAGE_LABELS[s], count: stageCount.get(s) }));
  const rows = [...ACTOR_ORDER, "unknown"]
    .filter((a) => (actorCount.get(a) ?? 0) > 0)
    .map((a) => ({ actor: a, label: ACTOR_LABELS[a], count: actorCount.get(a) }));
  const cells = [];
  for (const row of rows) for (const col of columns) {
    const cell = cellMap.get(`${col.stage}|${row.actor}`);
    if (cell) cells.push(cell);
  }

  return {
    columns,
    rows,
    cells,
    cellOf: (stage, actor) => cellMap.get(`${stage}|${actor}`) ?? null,
    total,
    deleted,
    lowConfidence: low,
    withSecondary,
    method: classMap?.method ?? null,
    headline: buildRuleHeadline(map, classMap, { cellMap, stageCount, actorCount, total }),
  };
}

/** 받침 유무로 조사를 고른다(은/는, 이/가). 한글이 아니면 받침 있는 쪽. */
function hasFinalConsonant(word) {
  const ch = String(word ?? "").trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return true;
  return (code - 0xac00) % 28 !== 0;
}
const topicParticle = (word) => (hasFinalConsonant(word) ? "은" : "는");
const subjectParticle = (word) => (hasFinalConsonant(word) ? "이" : "가");

const n = (x) => `${x}개 조문`;

/**
 * 머리말 한 문장. 수범자(국민·사업자) 레인에서 가장 큰 두 칸 + 행정기관 레인 중 감독·절차가 가장 많은 레인의 가장 큰 칸.
 * 예: 「건축법」은 국민·사업자에게 기준·의무 25개 조문과 인허가·절차 21개 조문을 지우고, 지방자치단체가 감독·시정 7개 조문을 맡습니다.
 * @returns {{ title: string, subtitle: string }}
 */
export function buildRuleHeadline(map, classMap, pre = null) {
  const grid = pre ?? collect(map, classMap);
  const name = `「${map.name}」${topicParticle(map.name)}`;
  const subtitle = "세로 = 누구에게 적용되는가 · 가로 = 규율 단계 · 점선 = 추론 신뢰도 0.5 미만";
  if (!classMap || grid.total === 0) {
    return { title: `${name} 조문 분류가 아직 없습니다.`, subtitle };
  }
  const cellsOf = (actor) => STAGE_ORDER
    .map((s) => ({ stage: s, count: grid.cellMap.get(`${s}|${actor}`)?.articles.length ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));

  const parts = [];
  const citizen = cellsOf("citizen").slice(0, 2);
  if (citizen.length > 0) {
    const phrase = citizen.map((c) => `${STAGE_LABELS[c.stage]} ${n(c.count)}`).join("과 ");
    parts.push(`${ACTOR_LABELS.citizen}에게 ${phrase}을 지우고`);
  }
  // 행정기관 레인: 감독·시정 + 인허가·절차 합이 가장 큰 레인(동률이면 레인 순서).
  const authority = AUTHORITY_LANES
    .map((a) => ({ actor: a, weight: (grid.cellMap.get(`supervision|${a}`)?.articles.length ?? 0) + (grid.cellMap.get(`procedure|${a}`)?.articles.length ?? 0), total: grid.actorCount.get(a) ?? 0 }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.weight - a.weight || b.total - a.total || AUTHORITY_LANES.indexOf(a.actor) - AUTHORITY_LANES.indexOf(b.actor))[0];
  if (authority) {
    const top = cellsOf(authority.actor)[0];
    if (top) parts.push(`${ACTOR_LABELS[authority.actor]}${subjectParticle(ACTOR_LABELS[authority.actor])} ${STAGE_LABELS[top.stage]} ${n(top.count)}을 맡습니다`);
  }
  if (parts.length === 0) {
    const biggest = [...grid.cellMap.values()].sort((a, b) => b.articles.length - a.articles.length)[0];
    parts.push(`${ACTOR_LABELS[biggest.actor]} 레인의 ${STAGE_LABELS[biggest.stage]} ${n(biggest.articles.length)}이 가장 큽니다`);
  }
  let title = `${name} ${parts.join(", ")}`;
  if (!title.endsWith("습니다")) title = title.replace(/지우고$/, "지웁니다");
  return { title: `${title}.`, subtitle };
}

/** buildRuleHeadline을 단독으로 부를 때 쓰는 가벼운 집계(격자 전체를 만들지 않는다). */
function collect(map, classMap) {
  const statuteLanes = new Set(map.lanes.filter((l) => l.tier === "statute").map((l) => l.id));
  const cellMap = new Map();
  const stageCount = new Map();
  const actorCount = new Map();
  let total = 0;
  for (const a of map.articles) {
    if (!statuteLanes.has(a.laneId)) continue;
    const c = classMap?.articles?.[a.id];
    if (!c || c.deleted) continue;
    total += 1;
    const stage = STAGE_ORDER.includes(c.stage) ? c.stage : "unknown";
    const actor = ACTOR_ORDER.includes(c.actor) ? c.actor : "unknown";
    const key = `${stage}|${actor}`;
    const cell = cellMap.get(key) ?? { stage, actor, articles: [] };
    cell.articles.push(a.id);
    cellMap.set(key, cell);
    stageCount.set(stage, (stageCount.get(stage) ?? 0) + 1);
    actorCount.set(actor, (actorCount.get(actor) ?? 0) + 1);
  }
  return { cellMap, stageCount, actorCount, total };
}

/** 툴팁에 보여 줄 근거 단서: "stage/title:허가" → "단계 제목:허가". 앞 limit개만. */
export function describeEvidence(evidence, limit = 6) {
  return (evidence ?? []).slice(0, limit).map((e) => e
    .replace(/^stage\//, "단계 · ")
    .replace(/^actor\//, "주체 · "));
}
