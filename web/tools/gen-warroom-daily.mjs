#!/usr/bin/env node
// Generates web/public/warroom/daily.json — per-actor "today" window (now ±2)
// over the 1,281 unfolded procedures of the Gwangju semiconductor cluster.
// Ordering mirrors mega-project-graph.ts: stage order → project.nodes order →
// templateRef order → institution node order. Milestone status comes from
// web/tools/halo-data.json (same asOf snapshot).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));

const project = read("data/mega-projects/projects/gwangju-semiconductor-cluster.json");
const halo = read("tools/halo-data.json");

const msStatus = new Map();
halo.gates.forEach((g) => g.milestones.forEach((m) => msStatus.set(m.id, m.st)));

const stageOrder = new Map(project.stages.map((s, i) => [s.id, i]));
const orderedNodes = [...project.nodes].sort(
  (a, b) => stageOrder.get(a.stage) - stageOrder.get(b.stage),
);

const instCache = new Map();
function inst(slug) {
  if (!instCache.has(slug)) {
    try {
      instCache.set(slug, read(`data/institutions/${slug}.json`));
    } catch {
      instCache.set(slug, null);
    }
  }
  return instCache.get(slug);
}

// Statutory processing period, compressed for display (same precedence as
// the flow view's deadlineShortOf: "N일 의제" wins, else the first "N일").
// This is the legal deadline, NOT an empirical average — no such statistic
// exists in the law APIs.
function shortDeadline(text) {
  if (!text) return null;
  const uije = text.match(/(\d+)일\s*의제/);
  if (uije) return { days: Number(uije[1]), label: `${uije[1]}일 의제` };
  const days = text.match(/(\d+)일/);
  if (days) return { days: Number(days[1]), label: `${days[1]}일` };
  return { days: null, label: "별도 규정" };
}

// ME-POIs-style dual representation: the statutory text is the procedure's
// "documentary identity"; type/rhythm classification + multi-scale duration
// propagation approximate its "functional rhythm" until empirical stats land.
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
function typeOf(name) {
  for (const [label, re] of TYPES) if (re.test(name)) return label;
  return "기타";
}
const RHYTHMS = [
  ["위원회주기", /위원회|심의회|심사위|의결/],
  ["공고기간", /공고|공람|열람|공청회/],
  ["현장공사", /공사|준공|시공|설치|조성|정화|철거|해체/],
  ["상시처리", /신청|신고|접수|제출|통보|통지/],
];
function rhythmOf(name) {
  for (const [label, re] of RHYTHMS) if (re.test(name)) return label;
  return null;
}

// ── unfold all procedures in display order ──
const procs = [];
orderedNodes.forEach((ms) => {
  const gate = stageOrder.get(ms.stage);
  const st = msStatus.get(ms.id) ?? "blocked";
  const base = { ms: ms.id, msName: ms.name, gate, st };
  const refs = ms.templateRefs ?? [];
  const push = (pid, name, actor, tpl, dl) =>
    procs.push({
      ...base, pid, name, actor, tpl,
      dl: shortDeadline(dl),
      type: typeOf(name),
      rhythm: rhythmOf(name),
    });
  if (refs.length === 0) {
    push("TBD", "신청·검토·협의·의결·고시 단계 분해 필요", ms.authority, null, null);
    return;
  }
  refs.forEach((ref) => {
    const template = inst(ref.institution);
    const nodes = template?.process?.nodes ?? [];
    const selected = ref.nodeIds
      ? nodes.filter((n) => ref.nodeIds.includes(n.id))
      : nodes;
    if (!template || selected.length === 0) {
      push("TBD", "참조 템플릿의 적용 하위절차 확인 필요", ms.authority, ref.institution, null);
      return;
    }
    selected.forEach((n) =>
      push(n.id, n.name, n.actor || n.lane || ms.authority, template.name || ref.institution, n.deadline),
    );
  });
});

console.log(`unfolded procedures: ${procs.length}`);
if (procs.length !== 1281) {
  console.warn(`WARNING: expected 1281, got ${procs.length}`);
}

// ── multi-scale duration propagation (ME-POIs spatial propagation analog) ──
// A procedure without its own statutory day count borrows the median of the
// nearest scale that has signal: same institution → same type → all procs.
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
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
function estimate(p) {
  if (p.dl?.days != null) return null; // has its own statutory count
  const tpl = byTpl.get(p.tpl);
  if (tpl && tpl.length >= 2)
    return { days: median(tpl), basis: "제도", n: tpl.length };
  const ty = byType.get(p.type);
  if (ty && ty.length >= 3)
    return { days: median(ty), basis: "유형", n: ty.length };
  if (allDays.length)
    return { days: median(allDays), basis: "전체", n: allDays.length };
  return null;
}
const typeStats = {};
procs.forEach((p) => (typeStats[p.type] = (typeStats[p.type] || 0) + 1));
console.log("types:", Object.entries(typeStats).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log(
  "type medians:",
  [...byType.entries()].map(([k, v]) => `${k} ${median(v)}일(n=${v.length})`).join(" · "),
  `| 전체 ${median(allDays)}일(n=${allDays.length})`,
);

// ── rows = project actors (ministry-level lead actors of milestones) ──
// Each row: that actor's procedures in global order, frontier ±2 window.
// Cell `who` keeps the fine-grained performer (institution lane) inside.
const RANK = { active: 0, ready: 1, conditional: 2, blocked: 3, completed: 4 };
const leadByMs = new Map(project.nodes.map((n) => [n.id, n.leadActor]));

const rows = project.actors.map((actor) => {
  const list = procs.filter((p) => leadByMs.get(p.ms) === actor.id);
  // now = the first spot this actor can actually move today:
  // active > ready > conditional; if nothing is actionable, the first
  // blocked procedure (= where they start once upstream clears).
  let nowIdx = -1;
  for (const st of ["active", "ready", "conditional", "blocked"]) {
    nowIdx = list.findIndex((p) => p.st === st);
    if (nowIdx >= 0) break;
  }
  if (nowIdx < 0) nowIdx = list.length - 1; // all completed
  const lo = Math.max(0, nowIdx - 2);
  const hi = Math.min(list.length, nowIdx + 3);
  const msSet = new Set(list.map((p) => p.ms));
  const dlHave = list.filter((p) => p.dl && p.dl.days !== null).length;
  return {
    dlHave,
    actor: actor.label,
    short: actor.shortLabel ?? actor.label,
    code: actor.code,
    mandate: actor.mandate ?? "",
    milestones: msSet.size,
    total: list.length,
    nowPos: nowIdx + 1,
    nowSt: list[nowIdx]?.st ?? "completed",
    window: list.slice(lo, hi).map((p, i) => ({
      pid: p.pid,
      name: p.name,
      who: p.actor,
      ms: p.ms,
      msName: p.msName,
      gate: p.gate,
      st: p.st,
      tpl: p.tpl,
      dl: p.dl,
      type: p.type,
      rhythm: p.rhythm,
      est: estimate(p),
      rel: lo + i - nowIdx, // -2..+2, 0 = now
    })),
  };
});

rows.sort((a, b) => RANK[a.nowSt] - RANK[b.nowSt] || b.total - a.total);
const out = {
  asOf: halo.asOf,
  // Elapsed-days anchor: the only hard project date — the site decision.
  // Applies to procedures in the active milestone(s) only.
  anchor: { date: project.scope?.siteDecisionOn ?? null, label: "입지 결정" },
  totalProcs: procs.length,
  totalWithDeadline: procs.filter((p) => p.dl && p.dl.days !== null).length,
  rows,
};
writeFileSync(
  path.join(ROOT, "public/warroom/daily.json"),
  JSON.stringify(out, null, 0),
);
console.log(`actor rows: ${rows.length} → public/warroom/daily.json`);
rows.forEach((r) =>
  console.log(
    `  ${r.short.padEnd(6)} ${String(r.total).padStart(3)}절차 now=${r.nowPos} [${r.nowSt}] ${r.window.find((w) => w.rel === 0)?.name.slice(0, 26)}`,
  ),
);
