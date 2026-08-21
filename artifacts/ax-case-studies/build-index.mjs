// cases/*.json → web/src/app/ax-cases/cases.generated.json (갤러리 페이지용 인덱스)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCases } from "./render-cases.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "../../web/src/app/ax-cases/cases.generated.json");

const cnt = (nodes, kind) => nodes.filter((a) => a[3] === kind).length;

const GROUP = {
  "13-sweep-central.md": "중앙부처",
  "13-sweep-metro.md": "광역지자체",
  "13-sweep-basic.md": "기초지자체",
  "13-sweep-special.md": "경찰·소방·군 등 특수직역",
  "13-sweep-public-org.md": "공공기관·공기업",
  "13-sweep-awards.md": "사례집·수상",
  "13-sweep-community.md": "공직자 자체 개발",
  "14-master-pool.md": "정부 공공 깃랩",
  "11-axboard-internal-work-shortlist.md": "정부 공공 깃랩",
  "10-pax-internal-work-shortlist.md": "정부 공공 깃랩",
};
const groupOf = (c) =>
  c.meta?.group || GROUP[c.meta?.sweep] || "기타";

// 카드 표시용 기관명 정리: 출처 불명 표기는 짧게, '추정'은 정직하게 유지
function orgLabel(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/\s*[—-]?\s*저장소에 기관 미표기/g, "");
  s = s.replace(/\(\s*\)/g, "").trim();
  if (/미표기/.test(s)) s = s.replace(/\(\s*미표기\s*\)/g, "").trim();
  return s.length > 26 ? s.replace(/\s*\([^)]*\)\s*$/, "").trim() : s;
}

const cases = loadCases().map((c) => {
  const a = c.asis.nodes, t = c.tobe.nodes;
  return {
    id: c.id,
    slug: c.slug,
    org: orgLabel(c.meta?.org),
    work: c.meta?.work ?? "",
    stage: c.meta?.stage ?? "",
    citizen: !!c.meta?.citizen,
    group: groupOf(c),
    asisTitle: c.asis.title,
    tobeTitle: c.tobe.title,
    asisHeadline: c.asis.headline,
    tobeHeadline: c.tobe.headline,
    sources: c.meta?.sources ?? [],
    stats: {
      steps: a.length,
      statute: cnt(a, "statute"),
      inferred: cnt(a, "inferred"),
      replaced: cnt(t, "replaced"),
      changed: cnt(t, "changed"),
      removed: cnt(t, "removed"),
      auto: cnt(t, "auto"),
    },
  };
});

fs.writeFileSync(OUT, JSON.stringify(cases, null, 1));

const agg = cases.reduce(
  (s, c) => ({
    steps: s.steps + c.stats.steps,
    statute: s.statute + c.stats.statute,
    inferred: s.inferred + c.stats.inferred,
    replaced: s.replaced + c.stats.replaced,
    changed: s.changed + c.stats.changed,
    removed: s.removed + c.stats.removed,
  }),
  { steps: 0, statute: 0, inferred: 0, replaced: 0, changed: 0, removed: 0 },
);
console.log(`indexed ${cases.length} cases → ${OUT}`);
console.log("합계", agg, "| 추론비율", (agg.inferred / agg.steps * 100).toFixed(1) + "%");
