// 파서 결과(lsStmd·lsDelegated·조문 목록)와 제도 인용을 법령 지도 IR로 조립하는 순수 함수.
import { articleLabel } from "./article-citations.mjs";
import { parseClause } from "./law-map-parsers.mjs";

export const TEXT_PREVIEW_CHARS = 300;
// 조례 위임의 출발 조문을 고를 때 라인텍스트 앞부분만 조문 원문과 대조한다.
const PHRASE_MATCH_CHARS = 40;

const EDGE_KIND = { 시행령: "decree", 시행규칙: "rule", 위임행정규칙: "adminRule", 위임자치법규: "ordinance", 인용법령: "cites" };
const ALL_TIERS = ["statute", "decree", "rule", "adminRule", "ordinance"];
const ALL_EDGE_KINDS = ["decree", "rule", "adminRule", "ordinance", "cites"];

const compact = (s) => String(s ?? "").replace(/\s+/g, "");
// 라인텍스트는 "·"(U+00B7)·둥근 따옴표(“”), 조문 원문은 "ㆍ"(U+318D)·곧은 따옴표(")를 쓰므로 둘 다 하나로 맞춘 뒤 비교한다.
const normText = (s) => compact(s).replace(/[·ㆍ•∙]/g, "·").replace(/[“”"]/g, '"').replace(/[‘’']/g, "'");

export function lawUrl(name, label) {
  const base = `https://www.law.go.kr/법령/${compact(name)}`;
  return label ? `${base}/${label}` : base;
}

export function adminRuleUrl(name) {
  return `https://www.law.go.kr/행정규칙/${compact(name)}`;
}

/** 법제처 자치법규 검색(법령명으로 질의) */
export function ordinanceSearchUrl(rootName) {
  return `https://www.law.go.kr/LSW/ordinSc.do?menuId=3&query=${encodeURIComponent(rootName)}`;
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
  const report = {
    unresolved: [], institutionMisses: [], addedAdminRules: [], droppedReferences: 0,
    selfReferences: 0, ambiguousSources: [],
  };
  const counters = { decree: 0, rule: 0, adminRule: 0 };
  const laneByMst = new Map();
  const laneByName = new Map();
  const laneBySerial = new Map();
  const adminLaneByName = new Map();
  const laneOfLaw = new Map();
  const rootName = compact(stmd.root.name);

  for (const law of laws) {
    const id = law.tier === "statute" ? "L1" : law.tier === "decree" ? `D${++counters.decree}` : `R${++counters.rule}`;
    const lane = {
      id, tier: law.tier, name: law.info.name, kind: law.info.kind,
      lawId: law.info.lawId, mst: law.info.mst, effectiveOn: law.info.effectiveOn,
      officialUrl: lawUrl(law.info.name), articleCount: law.articles.length,
    };
    lanes.push(lane);
    laneOfLaw.set(law, lane);
    if (lane.mst) laneByMst.set(lane.mst, lane);
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

  // 행정규칙 레인: 일련번호로 찾고, 없으면 이름으로 찾는다(lsStmd와 lsDelegated가 같은 고시에 다른 일련번호를 달기 때문).
  // 이름으로 맞으면 새 일련번호를 그 레인의 별칭으로 등록해 다음부터는 일련번호로도 맞는다.
  const findAdminRuleLane = (serial, name) => {
    const bySerial = serial ? laneBySerial.get(serial) : null;
    if (bySerial) return bySerial;
    const byName = adminLaneByName.get(compact(name));
    if (byName && serial) laneBySerial.set(serial, byName);
    return byName ?? null;
  };
  const addAdminRuleLane = (serial, name, kind, effectiveOn) => {
    const lane = {
      id: `A${++counters.adminRule}`, tier: "adminRule", name, kind: kind || "행정규칙",
      serial, effectiveOn: effectiveOn ?? null, officialUrl: adminRuleUrl(name), articleCount: 0,
    };
    lanes.push(lane);
    if (serial) laneBySerial.set(serial, lane);
    if (compact(name)) adminLaneByName.set(compact(name), lane);
    return lane;
  };
  for (const r of stmd.adminRules) {
    if (!findAdminRuleLane(r.serial, r.name)) addAdminRuleLane(r.serial, r.name, r.kind, r.effectiveOn);
  }

  const ordinanceLane = {
    id: "O1", tier: "ordinance", name: "자치법규", kind: "조례·규칙",
    officialUrl: ordinanceSearchUrl(stmd.root.name), articleCount: 0,
    collapsed: { count: stmd.ordinances.length, items: stmd.ordinances.map((o) => ({ name: o.name, serial: o.serial })) },
  };

  const articleIds = new Set(articles.map((a) => a.id));
  const edges = [];
  const seenEdge = new Set();
  /** 새 선이면 추가하고 true, 같은 선이 이미 있으면 false. */
  const pushEdge = (e) => {
    const key = [e.from, e.kind, e.to, e.fromClause, e.targetName, e.targetLabel].join("|");
    if (seenEdge.has(key)) return false;
    seenEdge.add(key);
    edges.push({ id: `e${edges.length + 1}`, ...e });
    return true;
  };
  // 보고 항목은 선의 중복 제거 키(from·kind·fromClause·targetName·targetLabel)를 모두 담아 stats.unresolved와 개수가 맞는다.
  const seenUnresolved = new Set();
  const reportUnresolved = (entry) => {
    const key = JSON.stringify(entry);
    if (seenUnresolved.has(key)) return;
    seenUnresolved.add(key);
    report.unresolved.push({ rootLawId: stmd.root.lawId, ...entry });
  };

  /**
   * 조례 위임(위임자치법규)은 조항호목이 비어 있고 조문번호에 가지번호가 없어 출발이 기본 조문(제4조)으로만 온다.
   * 레인에 가지 조문(제4조의2…)이 있으면 라인텍스트(원문 문장)를 조문 원문과 대조해 하나로 고른다.
   * 못 고르면 기본 조문으로 두고 ambiguousSources에 보고한다.
   */
  const seenAmbiguous = new Set();
  const resolveOrdinanceSource = (law, laneId, rec) => {
    const base = rec.from.label;
    const branches = law.articles.filter((a) => a.label.startsWith(`${base}의`));
    const needle = normText(rec.phrase).slice(0, PHRASE_MATCH_CHARS);
    if (branches.length === 0 || !needle) return base;
    const baseArticle = law.articles.find((a) => a.label === base);
    const candidates = [...(baseArticle ? [baseArticle] : []), ...branches];
    const hits = candidates.filter((a) => normText(a.text).includes(needle));
    if (hits.length === 1) return hits[0].label;
    const key = `${laneId}:${base}|${needle}`;
    if (!seenAmbiguous.has(key)) {
      seenAmbiguous.add(key);
      report.ambiguousSources.push({
        rootLawId: stmd.root.lawId, lawId: law.info.lawId, from: `${laneId}:${base}`, kind: "ordinance", phrase: rec.phrase,
        candidates: (hits.length ? hits : candidates).map((a) => `${laneId}:${a.label}`),
      });
    }
    return base;
  };

  for (const law of laws) {
    if (!law.delegated) continue;
    report.droppedReferences += law.delegated.dropped ?? 0;
    const laneId = laneOfLaw.get(law).id;
    const ownName = compact(law.info.name);
    for (const rec of law.delegated.records) {
      const kind = EDGE_KIND[rec.kind];
      if (!kind) continue;
      if (kind === "cites") {
        // 자기 인용은 인용 법령이 아니다: 시행령·시행규칙 레인이 뿌리 법률을 거꾸로 가리키는 「건축법」, 각 레인이 자기 자신을 가리키는 "이 법"·"이 영".
        // 형제 인용(시행규칙 → 「건축법 시행령」)은 그대로 박스 없는 cites 선으로 둔다. 법률 레인이 자기 시행령을 가리키는 경우는 cites가 아닌 decree 위임으로 온다.
        const target = compact(rec.targetName);
        if (target && (target === rootName || target === ownName)) { report.selfReferences += 1; continue; }
      }
      let fromLabel = (rec.fromClause && parseClause(rec.fromClause)?.label) || rec.from.label;
      if (kind === "ordinance" && !rec.fromClause) fromLabel = resolveOrdinanceSource(law, laneId, rec);
      const from = `${laneId}:${fromLabel}`;
      if (!articleIds.has(from)) {
        reportUnresolved({ lawId: law.info.lawId, reason: "from-missing", from, fromClause: rec.fromClause, kind, targetName: rec.targetName });
        continue;
      }
      const base = { from, fromClause: rec.fromClause, kind, phrase: rec.phrase, targetName: rec.targetName };
      if (kind === "decree" || kind === "rule") {
        let lane = (rec.targetSerial && laneByMst.get(rec.targetSerial))
          || (rec.targetName && laneByName.get(compact(rec.targetName)))
          || null;
        if (!lane && rec.targetSerial == null && rec.targetName == null) {
          // 머리글 없는 위임 블록(도착 법령 미표기): (a) 법종구분이 링크텍스트("행정안전부령")와 같은 레인이 하나면 그 레인,
          // (c) 도착 조문번호(+제목)가 같은 조문을 가진 그 층위의 레인이 하나면 그 레인,
          // (b) 그 층위의 레인이 하나뿐이면 그 레인으로 본다
          const tierLanes = lanes.filter((l) => l.tier === kind);
          const byKind = tierLanes.filter((l) => compact(l.kind) === compact(rec.linkText));
          const hasTargetArticle = (l) => laws.find((w) => laneOfLaw.get(w) === l)?.articles.some((a) =>
            a.label === rec.targetLabel && (!rec.targetTitle || compact(a.title) === compact(rec.targetTitle)));
          const byArticle = rec.targetLabel ? tierLanes.filter(hasTargetArticle) : [];
          if (byKind.length === 1) lane = byKind[0];
          else if (byArticle.length === 1) lane = byArticle[0];
          else if (tierLanes.length === 1) lane = tierLanes[0];
        }
        // Edge.targetName은 문자열이어야 한다 → 레인 이름, 그것도 없으면 링크텍스트("국토교통부령")
        const targetName = rec.targetName ?? lane?.name ?? rec.linkText ?? "";
        const titled = {
          ...(rec.targetLabel ? { targetLabel: rec.targetLabel } : {}),
          ...(rec.targetTitle ? { targetTitle: rec.targetTitle } : {}),
        };
        const to = lane && rec.targetLabel ? `${lane.id}:${rec.targetLabel}` : null;
        if (to && articleIds.has(to)) {
          // 도착 레인이 확정되면 위임선 kind는 그 레인의 층위를 따른다(검증기 KIND_TO_TIER 계약).
          // lsStmd는 대법원규칙·헌법재판소규칙·중앙선관위규칙·감사원규칙을 시행령 자리(decree)에 두는데,
          // 위임 레코드는 "…규칙으로 정하는"을 rule로 분류해 23개 법률·627개 위임선이 어긋났다.
          pushEdge({ ...base, kind: lane.tier, targetName, to, ...titled });
        } else if (pushEdge({ ...base, targetName, to: null, ...titled, unresolved: true })) {
          reportUnresolved({
            lawId: law.info.lawId, reason: lane ? "article-missing" : "lane-missing",
            from, fromClause: rec.fromClause, kind, targetName, targetLabel: rec.targetLabel,
          });
        }
      } else if (kind === "adminRule") {
        let lane = findAdminRuleLane(rec.targetSerial, rec.targetName);
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
