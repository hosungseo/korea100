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

  /* milestone duration: parallel ref groups, sequential within a group */
  const durOf = new Map();
  orderedNodes.forEach((ms) => {
    const groups = new Map();
    procs.filter((p) => p.ms === ms.id).forEach((p) => {
      groups.set(p.ref, (groups.get(p.ref) ?? 0) + dayOf(p));
    });
    durOf.set(ms.id, Math.max(0, ...groups.values()));
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

  function schedule(ruleValues) {
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
            : q.relation === "finish_to_finish" ? ef.get(p) - (durOf.get(n.id) ?? 0)
            : ef.get(p);
          if (t > start) { start = t; from = p; }
        });
        if (n.status === "completed") { es.set(n.id, 0); ef.set(n.id, 0); }
        else if (n.status === "active") { es.set(n.id, 0); ef.set(n.id, durOf.get(n.id) ?? 0); }
        else { es.set(n.id, start); ef.set(n.id, start + (durOf.get(n.id) ?? 0)); }
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
    scenarios: combos.map(schedule),
    note: "법정기한+동종추정 합성, 역일 단순환산 모델 — 실적 예측 아님",
  };

  /* emit */
  const dir = `public/warroom/p/${project.id}`;
  write(`${dir}/data.json`, dataJson);
  write(`${dir}/daily.json`, dailyJson);
  write(`${dir}/path.json`, pathJson);
  if (cfg.root) {
    write("public/warroom/data.json", dataJson);
    write("public/warroom/daily.json", dailyJson);
    write("public/warroom/path.json", pathJson);
  }
  return { project, procs, stOf, pathJson, dataJson };
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
write("public/warroom/p/index.json", { projects: index });
console.log("wrote p/index.json:", index.map((p) => p.id).join(", "));
