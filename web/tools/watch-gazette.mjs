#!/usr/bin/env node
// Gazette precedent watch: scans the official gazette (관보) open API and
// links each published notice to the warroom milestones that cite the same
// statute. Most of a mega project's 1,281 procedures are still waiting, but
// the same statutory procedures are being executed elsewhere right now —
// that live execution is the closest thing to empirical rhythm data we have.
//
// Two signals per project:
//   precedent — same statute executed anywhere (proof the procedure is alive)
//   direct    — notice matching this project's own place/subject keywords
//               (candidate for a milestone status change; needs human review)
//
// Requires GAZETTE_API_KEY (data.go.kr 관보 통합 API, org 1741000).
//   GAZETTE_API_KEY=... node tools/watch-gazette.mjs [--days 30]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const write = (p, v) => {
  mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
  writeFileSync(path.join(ROOT, p), JSON.stringify(v, null, 0));
};

const KEY = process.env.GAZETTE_API_KEY;
if (!KEY) {
  console.error("GAZETTE_API_KEY not set (data.go.kr 관보 통합 API 키).");
  process.exit(1);
}
const API = "https://apis.data.go.kr/1741000/ApiTotalService/getApiTotalList";
const DAYS = Number(process.argv[process.argv.indexOf("--days") + 1]) || 30;
const CACHE = "data/gazette-cache";

// General-purpose procedural statutes: they appear on thousands of unrelated
// notices (service by publication, prior notice of disposition, promulgation)
// and would drown the precedent signal. Excluded from statute matching.
const GENERIC_LAWS = new Set([
  "행정절차법", "관보규정", "법령 등 공포에 관한 법률", "법제업무 운영규정",
  "민원 처리에 관한 법률", "행정효율과 협업 촉진에 관한 규정",
  "행정업무의 운영 및 혁신에 관한 규정", "국적법", "행정심판법", "행정대집행법",
]);

const PROJECTS = [
  {
    id: "gwangju-semiconductor-cluster",
    // direct = this project itself: needs BOTH a place and a subject term,
    // because "전남광주" alone matches every branch office of the province.
    place: ["광주", "전남", "무안", "함평", "빛그린"],
    subject: ["군공항", "반도체", "첨단전략", "특화단지", "산업단지", "종전부지", "클러스터"],
    // peer = same kind of project elsewhere: the closest observable analogue
    peer: ["반도체클러스터", "반도체 클러스터", "국가첨단전략산업", "특화단지", "산업단지계획"],
  },
  {
    id: "five-poles-three-special",
    place: [],
    subject: [],
    direct: ["초광역", "특별지방자치단체", "균형성장", "지방시대", "5극3특", "메가시티"],
    peer: ["초광역", "특별지방자치단체", "지역균형", "권한이양"],
  },
];

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const stripArticle = (s) => s.replace(/\s*제\d+조.*$/, "").replace(/\s*시행령$|\s*시행규칙$/, "").trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// data.go.kr enforces a per-second request cap and answers XML on refusal.
async function fetchDay(day, page = 1) {
  const url = `${API}?${new URLSearchParams({
    serviceKey: KEY, pageNo: String(page), pageSize: "500",
    reqFrom: day, reqTo: day, type: "1",
  })}`;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const text = await r.text();
      if (text.startsWith("<")) {
        const err = text.match(/<errMsg>(.*?)<\/errMsg>/)?.[1] ?? `HTTP ${r.status}`;
        throw new Error(err);
      }
      const res = JSON.parse(text).response ?? {};
      if (res.resultCode === "10") return { total: 0, items: [] };
      if (res.resultCode !== "0") throw new Error(`API ${res.resultCode} ${res.resultMsg}`);
      let items = res.items?.item ?? [];
      if (!Array.isArray(items)) items = [items];
      await sleep(350);           // stay under the per-second cap
      return { total: Number(res.totalCount || 0), items };
    } catch (e) {
      if (attempt === 6) throw e;
      await sleep(1200 * attempt);
    }
  }
}

/* ── collect (day-cached; gazette days are immutable once published) ── */
const today = new Date();
const days = [];
for (let i = DAYS - 1; i >= 0; i--) {
  const d = new Date(today);
  d.setDate(d.getDate() - i);
  days.push(ymd(d));
}
const notices = [];
let fetched = 0;
for (const day of days) {
  const cacheFile = `${CACHE}/${day}.json`;
  const abs = path.join(ROOT, cacheFile);
  let items;
  if (existsSync(abs)) {
    items = JSON.parse(readFileSync(abs, "utf8"));
  } else {
    const first = await fetchDay(day);
    items = first.items;
    for (let p = 2; (p - 1) * 500 < first.total; p++) {
      items = items.concat((await fetchDay(day, p)).items);
    }
    write(cacheFile, items);
    fetched++;
  }
  items.forEach((it) => notices.push({ ...it, day }));
}
console.log(`gazette notices: ${notices.length} over ${DAYS}일 (fetched ${fetched} new days)`);

/* ── index notices by base statute ── */
const byLaw = new Map();
notices.forEach((n) => {
  const base = stripArticle((n.basisLawNm || "").trim());
  if (!base || GENERIC_LAWS.has(base)) return;
  if (!byLaw.has(base)) byLaw.set(base, []);
  byLaw.get(base).push(n);
});

const instCache = new Map();
function inst(slug) {
  if (!instCache.has(slug)) {
    try { instCache.set(slug, read(`data/institutions/${slug}.json`)); }
    catch { instCache.set(slug, null); }
  }
  return instCache.get(slug);
}
const legalLaws = (lb) => {
  const arr = Array.isArray(lb) ? lb : lb ? [lb] : [];
  return arr.map((e) => (e?.law || "").trim()).filter(Boolean);
};

const index = [];
for (const cfg of PROJECTS) {
  const project = read(`data/mega-projects/projects/${cfg.id}.json`);

  // milestone → cited statutes
  const lawsByMs = new Map();
  project.nodes.forEach((ms) => {
    const set = new Set();
    (ms.templateRefs ?? []).forEach((ref) => {
      const t = inst(ref.institution);
      const ids = ref.nodeIds ? new Set(ref.nodeIds) : null;
      (t?.process?.nodes ?? []).forEach((n) => {
        if (ids && !ids.has(n.id)) return;
        legalLaws(n.legal_basis).forEach((l) => set.add(stripArticle(l)));
      });
    });
    lawsByMs.set(ms.id, set);
  });

  const milestones = {};
  const lawRoll = new Map();
  project.nodes.forEach((ms) => {
    const hits = [];
    lawsByMs.get(ms.id).forEach((law) => {
      (byLaw.get(law) ?? []).forEach((n) => hits.push({ law, n }));
    });
    if (!hits.length) return;
    hits.sort((a, b) => b.n.day.localeCompare(a.n.day));
    const laws = {};
    hits.forEach(({ law }) => (laws[law] = (laws[law] || 0) + 1));
    milestones[ms.id] = {
      count: hits.length,
      laws: Object.entries(laws).sort((a, b) => b[1] - a[1]).map(([law, n]) => ({ law, n })),
      recent: hits.slice(0, 3).map(({ law, n }) => ({
        day: n.day, law,
        title: (n.cntntSj || "").replace(/\s+/g, " ").trim().slice(0, 90),
        inst: (n.pblcnInstNm || "").trim(),
      })),
    };
    Object.entries(laws).forEach(([law, n]) => lawRoll.set(law, (lawRoll.get(law) || 0) + n));
  });

  const slim = (n) => ({
    day: n.day,
    title: (n.cntntSj || "").replace(/\s+/g, " ").trim().slice(0, 110),
    inst: (n.pblcnInstNm || "").trim(),
    law: (n.basisLawNm || "").trim(),
    pdf: n.pdfFilePath ? `https://gwanbo.go.kr${n.pdfFilePath}` : null,
  });
  const titleOf = (n) => `${n.cntntSj || ""} ${n.ofcttBookNm || ""}`;
  const dedupe = (list) => {
    const seen = new Set();
    return list.filter((n) => {
      const k = n.cntntSeqNo || titleOf(n);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  // direct = this project's own notices → milestone status change candidates
  const isDirect = (n) => {
    const t = titleOf(n);
    if (cfg.direct) return cfg.direct.some((k) => t.includes(k));
    return cfg.place.some((k) => t.includes(k)) && cfg.subject.some((k) => t.includes(k));
  };
  const direct = dedupe(notices.filter(isDirect)).map(slim);

  // peer = the same kind of project running elsewhere (observable analogue)
  const peer = dedupe(
    notices.filter((n) => !isDirect(n) && cfg.peer.some((k) => titleOf(n).includes(k))),
  ).map(slim).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 12);

  const covered = Object.keys(milestones).length;
  const out = {
    scannedAt: ymd(today),
    windowDays: DAYS,
    totalNotices: notices.length,
    milestonesCovered: covered,
    precedentTotal: Object.values(milestones).reduce((a, m) => a + m.count, 0),
    topLaws: [...lawRoll.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([law, n]) => ({ law, n })),
    milestones,
    direct,
    peer,
  };
  write(`public/warroom/p/${cfg.id}/gazette.json`, out);
  if (cfg.id === "gwangju-semiconductor-cluster") write("public/warroom/gazette.json", out);
  index.push({ id: cfg.id, covered, precedent: out.precedentTotal, direct: direct.length });
  console.log(
    `  ${cfg.id}: 마일스톤 ${covered}개 · 선례 ${out.precedentTotal}건 · 동종사업 ${peer.length}건 · 직접 ${direct.length}건`,
  );
  direct.slice(0, 3).forEach((d) => console.log(`    [직접] ${d.day} ${d.title.slice(0, 60)}`));
  peer.slice(0, 3).forEach((d) => console.log(`    [동종] ${d.day} ${d.title.slice(0, 60)}`));
}
