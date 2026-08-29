#!/usr/bin/env node
// Consolidated warroom data generator (supersedes gen-warroom-daily.mjs).
// For each mega project/strategy it emits under web/public/warroom/p/<id>/:
//   data.json  — wall (gates → milestones → proc counts + derived status)
//   daily.json — per-lead-actor frontier ±2 window (documentary + rhythm layer)
//   path.json  — CPM schedule over the full scenario space (rule combinations)
// plus root-level copies for the default project (gwangju) for backcompat.
//
// Status derivation (validated against tools/halo-data.json for gwangju):
//   completed/active ← node.status; conditional ← activation.mode === "rule";
//   else ready if every hard-require artifact has a completed producer
//   (or no producer at all), else blocked.
//
// Durations are statutory day counts with ME-POIs-style multi-scale fallback
// (institution → type → project medians). Calendar conversion is naive
// (statutory days ≈ calendar days) — clearly a model, not a forecast.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const write = (p, v) => {
  mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
  writeFileSync(path.join(ROOT, p), JSON.stringify(v, null, 0));
};

// Empirical durations measured from open.go.kr 원문공개 결재문서
// (~/open-go-corpus, 큐레이션 54.8만 건, 2026-08-23). Each figure is the
// median span from a project's first document to its last within that
// procedure family — i.e. how long the whole family actually takes, not how
// long one procedure takes. So it maps to a milestone, never to a single
// procedure. Statutory deadlines for the same families run 15~60 days.
const EMPIRICAL = [
  { family: "산업단지계획", days: 334, n: 302, re: /산업단지계획|산업단지\s*(개발|지정)|특화단지/ },
  { family: "도시관리계획", days: 319, n: 1170, re: /도시관리계획|지구단위계획|도시계획\s*결정|도시·군관리계획/ },
  { family: "개발제한·용도", days: 286, n: 243, re: /개발제한구역|용도지역|용도폐지|형질변경|보호구역\s*해제/ },
  { family: "실시계획", days: 210, n: 988, re: /실시계획/ },
  { family: "공장설립·건축", days: 206, n: 1441, re: /공장설립|건축허가|사용승인|준공검사|공장등록|착공/ },
  { family: "환경영향평가", days: 193, n: 1304, re: /환경영향평가|전략환경|기후변화영향/ },
  { family: "사업인정·보상", days: 190, n: 201, re: /사업인정|보상|수용재결|취득/ },
  { family: "교통영향평가", days: 189, n: 359, re: /교통영향평가|광역교통/ },
  { family: "전력·에너지", days: 189, n: 17, re: /전원개발|송전|변전소|전력계통|집단에너지|에너지사용계획/ },
  { family: "용수·하수", days: 173, n: 394, re: /공업용수|수도|하수|폐수|재이용/ },
  { family: "국유재산·부지", days: 154, n: 328, re: /국유재산|공유재산|기부\s*대\s*양여|종전부지|용도폐지/ },
  { family: "재해영향평가", days: 88, n: 431, re: /재해영향평가|사전재해/ },
];
const empiricalOf = (text) => EMPIRICAL.find((e) => e.re.test(text)) ?? null;

const PROJECTS = [
  { id: "gwangju-semiconductor-cluster", short: "광주 반도체", anchorKey: "siteDecisionOn", anchorLabel: "입지 결정", root: true },
  { id: "five-poles-three-special", short: "5극3특", anchorKey: null, anchorLabel: null, root: false },
];

/* ── shared classifiers (documentary identity → functional rhythm) ── */
function shortDeadline(text) {
  if (!text) return null;
  const uije = text.match(/(\d+)일\s*의제/);
  if (uije) return { days: Number(uije[1]), label: `${uije[1]}일 의제` };
  const days = text.match(/(\d+)일/);
  if (days) return { days: Number(days[1]), label: `${days[1]}일` };
  return { days: null, label: "별도 규정" };
}
const TYPES = [
  ["심의", /심의|의결|심사위|위원회|자문|조정회의/],
  ["협의", /협의|의견|조회|회신|사전검토/],
  ["고시·공고", /고시|공고|공람|열람|공표|공청회|공지/],
  ["검사·조사", /검사|검증|점검|조사|진단|측정|확인/],
  ["승인·지정", /승인|허가|인가|지정|결정|면허|등록/],
  ["신청·신고", /신청|신고|접수|제출|요청|건의/],
  ["공사·집행", /공사|착공|준공|시공|설치|건설|조성|정화|철거|해체/],
  ["통보·송부", /통보|통지|송부|회부|교부/],
];
const typeOf = (name) => (TYPES.find(([, re]) => re.test(name)) ?? ["기타"])[0];
const RHYTHMS = [
  ["위원회주기", /위원회|심의회|심사위|의결/],
  ["공고기간", /공고|공람|열람|공청회/],
  ["현장공사", /공사|준공|시공|설치|조성|정화|철거|해체/],
  ["상시처리", /신청|신고|접수|제출|통보|통지/],
];
const rhythmOf = (name) => (RHYTHMS.find(([, re]) => re.test(name)) ?? [null])[0];
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const instCache = new Map();
function inst(slug) {
  if (!instCache.has(slug)) {
    try { instCache.set(slug, read(`data/institutions/${slug}.json`)); }
    catch { instCache.set(slug, null); }
  }
  return instCache.get(slug);
}

/* ══ actor axis (prime-minister situation board) ══
   The source graph names who leads each milestone in actorRoles.lead, but the
   strings mix real institutions ("국방부", "광주특별시") with statutory role
   names whose holder is not yet fixed ("산업단지 지정권자", "환경 협의기관").
   We normalise and classify, but we never guess a ministry behind a role name:
   "산업단지 지정권자" is the 시·도지사 or 국토부 depending on the case, and
   asserting one would be a fabricated fact on a board meant for decisions.
   Role-name actors are kept as their own type so the board can surface them as
   what they are — work whose responsible body is still undetermined. */
const ACTOR_TYPES = {
  ministry: { label: "중앙부처", steerable: true, named: true },
  committee: { label: "위원회·전담조직", steerable: true, named: true },
  local: { label: "지방자치단체", steerable: true, named: true },
  public: { label: "공공기관", steerable: true, named: true },
  private: { label: "민간", steerable: false, named: true },
  // Not missing data: these nodes carry confidence "statutory", i.e. the law
  // itself designates the actor by role ("산업단지 지정권자"), and which body
  // holds it follows from the designation route once that is fixed.
  role: { label: "법정 역할 · 담당기관 미확정", steerable: false, named: false },
};
// Explicit classification. Anything unmatched falls to `role` and is reported,
// so an unclassified string is visible rather than silently mistyped.
const ACTOR_CLASS = [
  [/^(국방부|산업통상부|기후에너지환경부|환경부|국토교통부|행정안전부|기획재정부|과학기술정보통신부|문화체육관광부|농림축산식품부|해양수산부|고용노동부)$/, "ministry"],
  [/^(국가유산청|산림청|소방청|경찰청|병무청|조달청)$/, "ministry"],
  [/위원회$|전담조직$|^정부·청와대$|^정부$/, "committee"],
  [/^(광주특별시|전남광주통합특별시|광주광역시|전라남도|전남도|무안군|함평군|이전지역 지방자치단체|지방자치단체)$/, "local"],
  [/^(한국전력|한전|한국수자원공사|한국도로공사|한국가스공사|한국환경공단|국가철도공단)$/, "public"],
  [/^(사업시행자|개발사업시행자|산업단지 사업시행자|사업자|입주기업|건축주|감리자|정화책임자|신청인|신청인\(당사자\))$/, "private"],
];
// Merged only where the two strings denote the same body beyond doubt.
// 사업시행자 / 개발사업시행자 / 산업단지 사업시행자 are NOT merged: they are
// distinct legal positions under different statutes and may be different firms.
const ACTOR_ALIAS = { "한전": "한국전력" };
// Compound lead strings that name two actors at once. Listed explicitly because
// many single actor names legitimately contain "·" (e.g. "정부·청와대").
const ACTOR_COMPOUND = { "광주특별시·산업단지 지정권자": ["광주특별시", "산업단지 지정권자"] };
const actorSlug = (name) => "a" + [...name].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 0xfffffff, 7).toString(36);
const actorsOfRegistry = (reg) => [...reg.values()];
const classifyActor = (name) => (ACTOR_CLASS.find(([re]) => re.test(name)) ?? [null, "role"])[1];

/* Normalised lead actors of one node: alias-folded, compound-split. */
function leadActorsOf(node) {
  const raw = (node.actorRoles?.lead ?? []).filter(Boolean);
  const out = [];
  raw.forEach((s) => {
    (ACTOR_COMPOUND[s] ?? [s]).forEach((part) => {
      const name = ACTOR_ALIAS[part] ?? part;
      if (!out.includes(name)) out.push(name);
    });
  });
  return out;
}

/* ── per-project build ── */
function build(cfg) {
  const project = read(`data/mega-projects/projects/${cfg.id}.json`);
  const stageOrder = new Map(project.stages.map((s, i) => [s.id, i]));
  const orderedNodes = [...project.nodes].sort(
    (a, b) => stageOrder.get(a.stage) - stageOrder.get(b.stage),
  );

  /* status derivation */
  const producers = new Map(); // artifact → node ids
  project.nodes.forEach((n) =>
    (n.produces ?? []).forEach((a) => {
      if (!producers.has(a)) producers.set(a, []);
      producers.get(a).push(n.id);
    }),
  );
  const nodeById = new Map(project.nodes.map((n) => [n.id, n]));
  const stOf = new Map();
  project.nodes.forEach((n) => {
    if (n.status === "completed" || n.status === "active") return stOf.set(n.id, n.status);
    if (n.activation?.mode === "rule") return stOf.set(n.id, "conditional");
    const hardOk = (n.requires ?? [])
      .filter((q) => q.strength === "hard")
      .every((q) => {
        const ps = producers.get(q.artifact) ?? [];
        return ps.length === 0 || ps.some((p) => nodeById.get(p)?.status === "completed");
      });
    stOf.set(n.id, hardOk ? "ready" : "blocked");
  });

  /* unfold procedures */
  const procs = [];
  orderedNodes.forEach((ms) => {
    const gate = stageOrder.get(ms.stage);
    const st = stOf.get(ms.id);
    const base = { ms: ms.id, msName: ms.name, gate, st };
    const push = (pid, name, actor, tpl, dl, ref) =>
      procs.push({
        ...base, pid, name, actor, tpl, ref,
        dl: shortDeadline(dl), type: typeOf(name), rhythm: rhythmOf(name),
      });
    const refs = ms.templateRefs ?? [];
    if (refs.length === 0) {
      push("TBD", "신청·검토·협의·의결·고시 단계 분해 필요", ms.authority, null, null, `${ms.id}:gap`);
      return;
    }
    refs.forEach((ref, ri) => {
      const template = inst(ref.institution);
      const nodes = template?.process?.nodes ?? [];
      const selected = ref.nodeIds ? nodes.filter((n) => ref.nodeIds.includes(n.id)) : nodes;
      const refKey = `${ms.id}:${ref.institution}:${ri}`;
      if (!template || selected.length === 0) {
        push("TBD", "참조 템플릿의 적용 하위절차 확인 필요", ms.authority, ref.institution, null, refKey);
        return;
      }
      selected.forEach((n) =>
        push(n.id, n.name, n.actor || n.lane || ms.authority, template.name || ref.institution, n.deadline, refKey),
      );
    });
  });

  /* duration estimation: institution → type → project median */
  const daysBy = (key) => {
    const m = new Map();
    procs.forEach((p) => {
      if (p.dl?.days == null) return;
      const k = key(p);
      if (!k) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p.dl.days);
    });
    return m;
  };
  const byTpl = daysBy((p) => p.tpl);
  const byType = daysBy((p) => p.type);
  const allDays = procs.filter((p) => p.dl?.days != null).map((p) => p.dl.days);
  const globalMedian = median(allDays) ?? 20;
  function estimate(p) {
    if (p.dl?.days != null) return null;
    const tpl = byTpl.get(p.tpl);
    if (tpl && tpl.length >= 2) return { days: median(tpl), basis: "제도", n: tpl.length };
    const ty = byType.get(p.type);
    if (ty && ty.length >= 3) return { days: median(ty), basis: "유형", n: ty.length };
    return { days: globalMedian, basis: "전체", n: allDays.length };
  }
  const dayOf = (p) => p.dl?.days ?? estimate(p)?.days ?? globalMedian;

  /* milestone duration, two bases.
     statutory — statute deadlines plus same-kind medians (the legal picture)
     empirical — measured family spans from the disclosure corpus, matched on
                 the milestone name and the institutions it references.
     A milestone with no family match keeps its statutory duration, so the
     empirical schedule is a floor, not a fabricated number. */
  const durOf = new Map();
  const empOf = new Map();
  const empHit = new Map();
  orderedNodes.forEach((ms) => {
    const groups = new Map();
    const mine = procs.filter((p) => p.ms === ms.id);
    mine.forEach((p) => {
      groups.set(p.ref, (groups.get(p.ref) ?? 0) + dayOf(p));
    });
    const statutory = Math.max(0, ...groups.values());
    durOf.set(ms.id, statutory);

    const haystack = `${ms.name} ${[...new Set(mine.map((p) => p.tpl).filter(Boolean))].join(" ")}`;
    const emp = empiricalOf(haystack);
    empOf.set(ms.id, emp ? Math.max(emp.days, statutory) : statutory);
    if (emp) empHit.set(ms.id, { family: emp.family, days: emp.days, n: emp.n });
  });

  /* wall data.json */
  const gates = project.stages.map((s, i) => ({
    label: `${String(i + 1).padStart(2, "0")} ${s.label}`,
    milestones: orderedNodes
      .filter((n) => n.stage === s.id)
      .map((n) => ({
        id: n.id, name: n.name,
        procs: procs.filter((p) => p.ms === n.id).length,
        st: stOf.get(n.id),
      })),
  }));
  const anchorDate = cfg.anchorKey ? project.scope?.[cfg.anchorKey] ?? null : null;
  const dataJson = {
    asOf: project.asOfDate,
    project: { id: project.id, name: project.name, short: cfg.short },
    gates,
  };

  /* daily.json */
  const RANK = { active: 0, ready: 1, conditional: 2, blocked: 3, completed: 4 };
  const leadByMs = new Map(project.nodes.map((n) => [n.id, n.leadActor]));
  const rows = project.actors.map((actor) => {
    const list = procs.filter((p) => leadByMs.get(p.ms) === actor.id);
    if (!list.length) return null;
    let nowIdx = -1;
    for (const st of ["active", "ready", "conditional", "blocked"]) {
      nowIdx = list.findIndex((p) => p.st === st);
      if (nowIdx >= 0) break;
    }
    if (nowIdx < 0) nowIdx = list.length - 1;
    const lo = Math.max(0, nowIdx - 2), hi = Math.min(list.length, nowIdx + 3);
    return {
      actor: actor.label, short: actor.shortLabel ?? actor.label, code: actor.code,
      milestones: new Set(list.map((p) => p.ms)).size,
      total: list.length, nowPos: nowIdx + 1, nowSt: list[nowIdx]?.st ?? "completed",
      dlHave: list.filter((p) => p.dl && p.dl.days !== null).length,
      window: list.slice(lo, hi).map((p, i) => ({
        pid: p.pid, name: p.name, who: p.actor, ms: p.ms, msName: p.msName,
        gate: p.gate, st: p.st, tpl: p.tpl, dl: p.dl,
        type: p.type, rhythm: p.rhythm, est: estimate(p),
        rel: lo + i - nowIdx,
      })),
    };
  }).filter(Boolean);
  rows.sort((a, b) => RANK[a.nowSt] - RANK[b.nowSt] || b.total - a.total);
  const dailyJson = {
    asOf: project.asOfDate,
    anchor: { date: anchorDate, label: cfg.anchorLabel },
    totalProcs: procs.length,
    totalWithDeadline: allDays.length,
    rows,
  };

  /* path.json — CPM over the scenario space */
  const usedRules = project.rules.filter((r) =>
    project.nodes.some((n) => n.activation?.rule === r.id),
  );
  const optionsOf = (r) =>
    r.type === "boolean"
      ? [true, false]
      : [...new Set(project.nodes.filter((n) => n.activation?.rule === r.id).map((n) => n.activation.equals))];
  const combos = usedRules.reduce(
    (acc, r) => acc.flatMap((c) => optionsOf(r).map((v) => ({ ...c, [r.id]: v }))),
    [{}],
  );

  function schedule(ruleValues, dur = durOf) {
    const included = new Set(
      project.nodes
        .filter((n) => n.activation?.mode !== "rule" || ruleValues[n.activation.rule] === n.activation.equals)
        .map((n) => n.id),
    );
    const es = new Map(), ef = new Map(), pick = new Map();
    const done = new Set();
    let guard = project.nodes.length + 2;
    while (done.size < included.size && guard-- > 0) {
      project.nodes.forEach((n) => {
        if (!included.has(n.id) || done.has(n.id)) return;
        const hards = (n.requires ?? []).filter((q) => q.strength === "hard");
        const deps = hards.flatMap((q) =>
          (producers.get(q.artifact) ?? []).filter((p) => included.has(p)).map((p) => ({ q, p })),
        );
        if (deps.some(({ p }) => !done.has(p))) return;
        let start = 0, from = null;
        deps.forEach(({ q, p }) => {
          const t = q.relation === "start_to_start" ? es.get(p)
            : q.relation === "finish_to_finish" ? ef.get(p) - (dur.get(n.id) ?? 0)
            : ef.get(p);
          if (t > start) { start = t; from = p; }
        });
        if (n.status === "completed") { es.set(n.id, 0); ef.set(n.id, 0); }
        else if (n.status === "active") { es.set(n.id, 0); ef.set(n.id, dur.get(n.id) ?? 0); }
        else { es.set(n.id, start); ef.set(n.id, start + (dur.get(n.id) ?? 0)); }
        pick.set(n.id, from);
        done.add(n.id);
      });
    }
    const unresolved = [...included].filter((id) => !done.has(id));
    let endId = null, total = 0;
    done.forEach((id) => { if (ef.get(id) >= total) { total = ef.get(id); endId = id; } });
    const critical = [];
    for (let id = endId; id; id = pick.get(id)) critical.unshift(id);
    return {
      params: ruleValues, totalDays: Math.round(total), end: endId, critical,
      unresolved,
      eta: Object.fromEntries([...done].map((id) => [id, [Math.round(es.get(id)), Math.round(ef.get(id))]])),
    };
  }

  const pathJson = {
    asOf: project.asOfDate,
    anchor: anchorDate,
    rules: usedRules.map((r) => ({
      id: r.id, type: r.type, options: optionsOf(r), description: r.description ?? "",
    })),
    // Two schedules over the same scenario space: what the law allows, and
    // what comparable projects actually took.
    scenarios: combos.map((c) => schedule(c, durOf)),
    empiricalScenarios: combos.map((c) => schedule(c, empOf)),
    empiricalCoverage: [...empHit.entries()].map(([id, e]) => ({ ms: id, ...e })),
    note: "statutory=법정기한+동종추정 · empirical=정보공개 원문공개 결재문서에서 측정한 절차군 생애주기 중앙값(개별 절차가 아니라 마일스톤 단위). 역일 단순환산 모델 — 실적 예측 아님",
  };

  /* ── actor axis: registry + handoff graph ── */
  const msProcs = new Map(), msName = new Map(), msGate = new Map();
  dataJson.gates.forEach((g, gi) => g.milestones.forEach((m) => {
    msProcs.set(m.id, m.procs); msName.set(m.id, m.name); msGate.set(m.id, gi);
  }));
  const leadOf = new Map(project.nodes.map((n) => [n.id, leadActorsOf(n)]));

  // Registry keyed by normalised display name.
  const reg = new Map();
  const actorOf = (name) => {
    if (!reg.has(name)) {
      const type = classifyActor(name);
      reg.set(name, {
        id: actorSlug(name), name, type, typeLabel: ACTOR_TYPES[type].label,
        steerable: ACTOR_TYPES[type].steerable, named: ACTOR_TYPES[type].named,
        milestones: [], msCount: 0, procs: 0,
        status: { completed: 0, active: 0, ready: 0, conditional: 0, blocked: 0 },
        now: [], waitingOn: [], blocking: { procs: 0, targets: [] },
        aliases: [], roleHint: null, confidence: {},
      });
    }
    return reg.get(name);
  };
  Object.entries(ACTOR_ALIAS).forEach(([from, to]) => {
    if ([...leadOf.values()].some((l) => l.includes(to))) actorOf(to).aliases.push(from);
  });
  project.nodes.forEach((n) => {
    const st = stOf.get(n.id);
    leadOf.get(n.id).forEach((name) => {
      const a = actorOf(name);
      a.milestones.push(n.id);
      a.msCount += 1;
      a.procs += msProcs.get(n.id) ?? 0;
      a.status[st] = (a.status[st] ?? 0) + 1;
      const cf = n.confidence ?? "unknown";
      a.confidence[cf] = (a.confidence[cf] ?? 0) + 1;
      if (st === "active" || st === "ready") a.now.push(n.id);
    });
  });
  // A compound lead ("광주특별시·산업단지 지정권자") is the only evidence in the
  // graph about who a role name might be. Surface it as a hint, never as fact.
  Object.entries(ACTOR_COMPOUND).forEach(([, parts]) => {
    const named = parts.find((p) => ACTOR_TYPES[classifyActor(p)].named);
    const role = parts.find((p) => !ACTOR_TYPES[classifyActor(p)].named);
    if (!named || !role || !reg.has(role)) return;
    const where = project.nodes.filter((n) => (n.actorRoles?.lead ?? []).some((s) => ACTOR_COMPOUND[s])).map((n) => n.id);
    reg.get(role).roleHint = { likely: named, evidence: where, note: `${where.join(",")} 에서 ${named}과 병기됨 — 확정 아님` };
  });

  // Handoff edges: a hard requirement satisfied by another node's output.
  const edges = [];
  project.nodes.forEach((n) => {
    (n.requires ?? []).filter((q) => q.strength === "hard").forEach((q) => {
      (producers.get(q.artifact) ?? []).forEach((p) => {
        if (p === n.id) return;
        const from = leadOf.get(p) ?? [], to = leadOf.get(n.id) ?? [];
        const cross = from.some((f) => !to.includes(f)) || to.some((t) => !from.includes(t));
        edges.push({
          fromMs: p, toMs: n.id, artifact: q.artifact,
          fromActors: from, toActors: to, cross,
          blocked: stOf.get(p) !== "completed",
          procs: msProcs.get(n.id) ?? 0,
        });
      });
    });
  });
  // Actor-pair rollup: how much downstream work sits behind each handoff.
  const pairKey = (f, t) => `${f} ${t}`;
  const pairs = new Map();
  edges.forEach((e) => {
    e.fromActors.forEach((f) => e.toActors.forEach((t) => {
      if (f === t) return;
      const k = pairKey(f, t);
      if (!pairs.has(k)) pairs.set(k, { from: f, to: t, procs: 0, edges: 0, blockedEdges: 0, ms: [] });
      const g = pairs.get(k);
      g.edges += 1;
      if (e.blocked) {
        g.blockedEdges += 1;
        if (!g.ms.includes(e.toMs)) { g.ms.push(e.toMs); g.procs += e.procs; }
      }
    }));
  });
  const byPair = [...pairs.values()].filter((g) => g.blockedEdges > 0).sort((a, b) => b.procs - a.procs);
  byPair.forEach((g) => {
    const a = reg.get(g.from);
    if (!a) return;
    a.blocking.procs += g.procs;
    a.blocking.targets.push({ actor: g.to, procs: g.procs });
  });
  // What each actor is waiting for, and who owes it.
  project.nodes.forEach((n) => {
    if (stOf.get(n.id) !== "blocked") return;
    const needs = [];
    (n.requires ?? []).filter((q) => q.strength === "hard").forEach((q) => {
      (producers.get(q.artifact) ?? []).forEach((p) => {
        if (p === n.id || nodeById.get(p)?.status === "completed") return;
        if (!needs.some((x) => x.ms === p)) needs.push({ ms: p, name: msName.get(p), actors: leadOf.get(p) ?? [] });
      });
    });
    if (!needs.length) return;
    leadOf.get(n.id).forEach((name) => {
      const a = reg.get(name);
      if (a) a.waitingOn.push({ ms: n.id, name: msName.get(n.id), procs: msProcs.get(n.id) ?? 0, needs });
    });
  });

  /* ── simulated time axis ──
     A model, not a forecast. Two CPM runs over the same graph: statutory
     deadlines, and medians measured from disclosed approval documents. Both
     convert statutory days to calendar days naively. Scenario 0 stands in for
     the whole scenario space because the spread across all rule combinations
     is tiny (recorded below so the board can state it rather than hide it). */
  // A project without a decided anchor (no site decision yet) has no calendar
  // to hang the model on. Day offsets are still meaningful relative to project
  // start; calendar dates are not, so they stay null rather than invented.
  const anchorMs = anchorDate ? Date.parse(`${anchorDate}T00:00:00Z`) : NaN;
  const anchored = Number.isFinite(anchorMs);
  const dayToDate = (d) => (anchored ? new Date(anchorMs + d * 86400000).toISOString().slice(0, 10) : null);
  const BASES = [
    { key: "statutory", label: "법정 기준", scenarios: pathJson.scenarios },
    { key: "empirical", label: "실측 기준", scenarios: pathJson.empiricalScenarios },
  ];
  const timelineMeta = { anchor: anchorDate, anchored, bases: {} };
  BASES.forEach((b) => {
    const totals = b.scenarios.map((s) => s.totalDays);
    const lo = Math.min(...totals), hi = Math.max(...totals);
    timelineMeta.bases[b.key] = {
      label: b.label,
      totalDays: b.scenarios[0].totalDays,
      end: dayToDate(b.scenarios[0].totalDays),
      years: +(b.scenarios[0].totalDays / 365.25).toFixed(1),
      scenarioCount: b.scenarios.length,
      spreadDays: hi - lo,
      critical: b.scenarios[0].critical,
    };
  });
  timelineMeta.gapDays = timelineMeta.bases.empirical.totalDays - timelineMeta.bases.statutory.totalDays;
  timelineMeta.gapYears = +(timelineMeta.gapDays / 365.25).toFixed(1);
  timelineMeta.note = "모의 일정 — 법정기한과 절차군 실측 중앙값을 역일로 단순환산한 CPM 모델. 실적 예측이 아니며 착수 지연·재협의 루프를 반영하지 않는다.";

  actorsOfRegistry(reg).forEach((a) => {
    a.timeline = {};
    BASES.forEach((b) => {
      const eta = b.scenarios[0].eta;
      const win = a.milestones.filter((id) => eta[id]).map((id) => ({ ms: id, es: eta[id][0], ef: eta[id][1] }));
      const off = a.milestones.filter((id) => !eta[id]);
      if (!win.length) { a.timeline[b.key] = null; return; }
      const es = Math.min(...win.map((w) => w.es)), ef = Math.max(...win.map((w) => w.ef));
      a.timeline[b.key] = {
        es, ef, days: ef - es,
        start: dayToDate(es), end: dayToDate(ef),
        span: +((ef - es) / 365.25).toFixed(1),
        windows: win.sort((x, y) => x.es - y.es),
        excluded: off, // milestones outside this scenario (rule-conditional)
      };
    });
  });

  const actors = [...reg.values()].sort((a, b) => b.procs - a.procs);
  const typeCount = {};
  actors.forEach((a) => { typeCount[a.typeLabel] = (typeCount[a.typeLabel] ?? 0) + 1; });
  const rawStrings = new Set();
  project.nodes.forEach((n) => (n.actorRoles?.lead ?? []).forEach((s) => rawStrings.add(s)));
  const actorsJson = {
    asOf: project.asOfDate,
    project: { id: project.id, name: project.name, short: cfg.short },
    types: ACTOR_TYPES,
    timeline: timelineMeta,
    actors,
    summary: {
      actorCount: actors.length,
      rawStringCount: rawStrings.size,
      byType: typeCount,
      unnamedRoleCount: actors.filter((a) => !a.named).length,
      unnamedRoleProcs: actors.filter((a) => !a.named).reduce((s, a) => s + a.procs, 0),
    },
  };
  const handoffsJson = {
    asOf: project.asOfDate,
    edges,
    byPair,
    summary: {
      total: edges.length,
      cross: edges.filter((e) => e.cross).length,
      blockedCross: edges.filter((e) => e.cross && e.blocked).length,
    },
  };

  /* emit */
  const dir = `public/warroom/p/${project.id}`;
  write(`${dir}/actors.json`, actorsJson);
  write(`${dir}/handoffs.json`, handoffsJson);
  if (cfg.root) {
    write("public/warroom/actors.json", actorsJson);
    write("public/warroom/handoffs.json", handoffsJson);
  }
  write(`${dir}/data.json`, dataJson);
  write(`${dir}/daily.json`, dailyJson);
  write(`${dir}/path.json`, pathJson);
  if (cfg.root) {
    write("public/warroom/data.json", dataJson);
    write("public/warroom/daily.json", dailyJson);
    write("public/warroom/path.json", pathJson);
  }
  return { project, procs, stOf, pathJson, dataJson, actorsJson, handoffsJson };
}

/* ── run + validation ── */
const index = [];
for (const cfg of PROJECTS) {
  const r = build(cfg);
  index.push({ id: r.project.id, name: r.project.name, short: cfg.short });
  const s0 = r.pathJson.scenarios[0];
  console.log(
    `${cfg.short}: procs ${r.procs.length}, scenarios ${r.pathJson.scenarios.length}, ` +
    `scenario0 total ${s0.totalDays}일, critical ${s0.critical.join("→")}` +
    (s0.unresolved.length ? ` | UNRESOLVED: ${s0.unresolved.join(",")}` : ""),
  );
  const as = r.actorsJson.summary, hs = r.handoffsJson.summary;
  console.log(
    `  주체 ${as.actorCount} (원문 ${as.rawStringCount}문자열 → ` +
    Object.entries(as.byType).map(([k, v]) => `${k} ${v}`).join(", ") +
    `) | 실명 미특정 역할 ${as.unnamedRoleCount}종 ${as.unnamedRoleProcs}절차` +
    ` | 인계 ${hs.total} 중 주체간 ${hs.cross} (막힘 ${hs.blockedCross})`,
  );
  if (cfg.id === "gwangju-semiconductor-cluster") {
    try {
      const halo = read("tools/halo-data.json");
      const haloSt = new Map();
      halo.gates.forEach((g) => g.milestones.forEach((m) => haloSt.set(m.id, m.st)));
      const diffs = [...r.stOf.entries()].filter(([id, st]) => haloSt.get(id) !== st);
      console.log(diffs.length
        ? `  status diff vs halo-data: ${diffs.map(([i, s]) => `${i}:${s}≠${haloSt.get(i)}`).join(" ")}`
        : "  status derivation matches halo-data ✓");
    } catch { /* no halo data */ }
  }
}
// 이 생성기가 모르는 사업(워룸 지도만 있는 메가프로젝트)을 지우지 않는다.
// 예전에는 자기가 아는 목록으로 통째로 덮어써서 사업 전환기에서 사라졌다.
let merged = index;
try {
  const prev = read("public/warroom/p/index.json").projects ?? [];
  const known = new Set(index.map((p) => p.id));
  const kept = prev.filter((p) => !known.has(p.id));
  merged = [...index, ...kept];
  if (kept.length) console.log(`  보존: ${kept.map((p) => p.id).join(", ")}`);
} catch { /* 최초 생성 */ }
write("public/warroom/p/index.json", { projects: merged });
console.log("wrote p/index.json:", merged.map((p) => p.id).join(", "));
