// 파서 결과(lsStmd·lsDelegated·조문 목록)와 제도 인용을 법령 지도 IR로 조립하는 순수 함수.
import { articleLabel } from "./article-citations.mjs";
import { parseClause } from "./law-map-parsers.mjs";

export const TEXT_PREVIEW_CHARS = 300;

const EDGE_KIND = { 시행령: "decree", 시행규칙: "rule", 위임행정규칙: "adminRule", 위임자치법규: "ordinance", 인용법령: "cites" };
const ALL_TIERS = ["statute", "decree", "rule", "adminRule", "ordinance"];
const ALL_EDGE_KINDS = ["decree", "rule", "adminRule", "ordinance", "cites"];

const compact = (s) => String(s ?? "").replace(/\s+/g, "");

export function lawUrl(name, label) {
  const base = `https://www.law.go.kr/법령/${compact(name)}`;
  return label ? `${base}/${label}` : base;
}

export function adminRuleUrl(name) {
  return `https://www.law.go.kr/행정규칙/${compact(name)}`;
}

/** "제32조·제33조, 제4조의2" → ["제32조","제33조","제4조의2"] */
export function extractArticleLabels(text) {
  const out = [];
  const re = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g;
  let m;
  while ((m = re.exec(String(text ?? "")))) out.push(articleLabel(m[1], m[2] ?? null));
  return [...new Set(out)];
}

function zeroCounts(keys) {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

/**
 * @param {object} input
 * @param {object} input.stmd parseLsStmd 결과
 * @param {Array} input.laws [{ tier, info, articles, delegated|null }] — statute → decree → rule 순서
 * @param {Array} input.institutions [{ slug, name, citations:[{ law, article }] }]
 * @param {string} input.generatedAt YYYY-MM-DD
 */
export function buildLawMap({ stmd, laws, institutions = [], generatedAt }) {
  const lanes = [];
  const articles = [];
  const texts = {};
  const report = { unresolved: [], institutionMisses: [], addedAdminRules: [], droppedReferences: 0 };
  const counters = { decree: 0, rule: 0, adminRule: 0 };
  const laneByMst = new Map();
  const laneByName = new Map();
  const laneBySerial = new Map();

  for (const law of laws) {
    const id = law.tier === "statute" ? "L1" : law.tier === "decree" ? `D${++counters.decree}` : `R${++counters.rule}`;
    const lane = {
      id, tier: law.tier, name: law.info.name, kind: law.info.kind,
      lawId: law.info.lawId, mst: law.info.mst, effectiveOn: law.info.effectiveOn,
      officialUrl: lawUrl(law.info.name), articleCount: law.articles.length,
    };
    lanes.push(lane);
    laneByMst.set(lane.mst, lane);
    laneByName.set(compact(lane.name), lane);
    for (const a of law.articles) {
      const aid = `${id}:${a.label}`;
      articles.push({
        id: aid, laneId: id, no: a.no, branch: a.branch, label: a.label,
        title: a.title, chapter: a.chapter, officialUrl: lawUrl(law.info.name, a.label),
      });
      if (a.text) {
        texts[aid] = a.text.length > TEXT_PREVIEW_CHARS ? `${a.text.slice(0, TEXT_PREVIEW_CHARS)}…` : a.text;
      }
    }
  }

  const addAdminRuleLane = (serial, name, kind, effectiveOn) => {
    const lane = {
      id: `A${++counters.adminRule}`, tier: "adminRule", name, kind: kind || "행정규칙",
      serial, effectiveOn: effectiveOn ?? null, officialUrl: adminRuleUrl(name), articleCount: 0,
    };
    lanes.push(lane);
    laneBySerial.set(serial, lane);
    return lane;
  };
  for (const r of stmd.adminRules) {
    if (!laneBySerial.has(r.serial)) addAdminRuleLane(r.serial, r.name, r.kind, r.effectiveOn);
  }

  const ordinanceLane = {
    id: "O1", tier: "ordinance", name: "자치법규", kind: "조례·규칙",
    officialUrl: lawUrl(stmd.root.name), articleCount: 0,
    collapsed: { count: stmd.ordinances.length, items: stmd.ordinances.map((o) => ({ name: o.name, serial: o.serial })) },
  };

  const articleIds = new Set(articles.map((a) => a.id));
  const edges = [];
  const seenEdge = new Set();
  const pushEdge = (e) => {
    const key = [e.from, e.kind, e.to, e.fromClause, e.targetName, e.targetLabel].join("|");
    if (seenEdge.has(key)) return;
    seenEdge.add(key);
    edges.push({ id: `e${edges.length + 1}`, ...e });
  };

  for (const law of laws) {
    if (!law.delegated) continue;
    report.droppedReferences += law.delegated.dropped ?? 0;
    const laneId = lanes.find((l) => l.tier === law.tier && l.mst === law.info.mst).id;
    for (const rec of law.delegated.records) {
      const fromLabel = (rec.fromClause && parseClause(rec.fromClause)?.label) || rec.from.label;
      const from = `${laneId}:${fromLabel}`;
      const kind = EDGE_KIND[rec.kind];
      if (!kind) continue;
      if (!articleIds.has(from)) {
        report.unresolved.push({ lawId: law.info.lawId, reason: "from-missing", from, kind, targetName: rec.targetName });
        continue;
      }
      const base = { from, fromClause: rec.fromClause, kind, phrase: rec.phrase, targetName: rec.targetName };
      if (kind === "decree" || kind === "rule") {
        let lane = (rec.targetSerial && laneByMst.get(rec.targetSerial))
          || (rec.targetName && laneByName.get(compact(rec.targetName)))
          || null;
        if (!lane && rec.targetSerial == null && rec.targetName == null) {
          // 머리글 없는 위임 블록(도착 법령 미표기): 그 층위의 레인이 하나뿐이면 그 레인으로 본다
          const tierLanes = lanes.filter((l) => l.tier === kind);
          if (tierLanes.length === 1) lane = tierLanes[0];
        }
        // Edge.targetName은 문자열이어야 한다 → 레인 이름, 그것도 없으면 링크텍스트("국토교통부령")
        const targetName = rec.targetName ?? lane?.name ?? rec.linkText ?? "";
        const to = lane && rec.targetLabel ? `${lane.id}:${rec.targetLabel}` : null;
        if (to && articleIds.has(to)) {
          pushEdge({ ...base, targetName, to, targetLabel: rec.targetLabel });
        } else {
          pushEdge({ ...base, targetName, to: null, ...(rec.targetLabel ? { targetLabel: rec.targetLabel } : {}), unresolved: true });
          report.unresolved.push({
            lawId: law.info.lawId, reason: lane ? "article-missing" : "lane-missing",
            from, kind, targetName, targetLabel: rec.targetLabel,
          });
        }
      } else if (kind === "adminRule") {
        let lane = laneBySerial.get(rec.targetSerial);
        if (!lane) {
          lane = addAdminRuleLane(rec.targetSerial, rec.targetName, "행정규칙", null);
          report.addedAdminRules.push(rec.targetName);
        }
        pushEdge({ ...base, to: lane.id });
      } else if (kind === "ordinance") {
        pushEdge({ ...base, to: ordinanceLane.id, targetName: "지방자치단체의 조례·규칙" });
      } else {
        pushEdge({ ...base, to: null, ...(rec.targetLabel ? { targetLabel: rec.targetLabel } : {}) });
      }
    }
  }
  lanes.push(ordinanceLane);

  const institutionRefs = [];
  for (const inst of institutions) {
    const ids = new Set();
    for (const c of inst.citations) {
      const lane = laneByName.get(compact(c.law));
      if (!lane) continue;
      const labels = extractArticleLabels(c.article);
      if (labels.length === 0) continue;
      let hit = false;
      for (const label of labels) {
        const id = `${lane.id}:${label}`;
        if (articleIds.has(id)) { ids.add(id); hit = true; }
      }
      if (!hit) report.institutionMisses.push({ slug: inst.slug, law: c.law, article: c.article });
    }
    if (ids.size) institutionRefs.push({ slug: inst.slug, name: inst.name, articles: [...ids] });
  }

  const articlesByTier = zeroCounts(ALL_TIERS);
  for (const lane of lanes) articlesByTier[lane.tier] += lane.articleCount;
  const edgesByKind = zeroCounts(ALL_EDGE_KINDS);
  for (const e of edges) edgesByKind[e.kind] += 1;

  const statute = laws[0];
  return {
    map: {
      schemaVersion: 1,
      lawId: stmd.root.lawId,
      mst: statute.info.mst,
      name: stmd.root.name,
      ministry: statute.delegated?.law?.ministry ?? null,
      effectiveOn: statute.info.effectiveOn,
      promulgatedOn: statute.info.promulgatedOn,
      generatedAt,
      lanes, articles, edges,
      institutions: institutionRefs,
      stats: { articlesByTier, edgesByKind, unresolved: edges.filter((e) => e.unresolved).length },
    },
    texts,
    report,
  };
}
