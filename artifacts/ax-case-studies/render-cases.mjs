// cases/*.json → web/public/ax-cases/sheets/{slug}-{asis|tobe}.html
// 사용: node render-cases.mjs [--out <dir>]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES = path.join(HERE, "cases");
const outArg = process.argv.indexOf("--out");
const OUT =
  outArg > -1
    ? process.argv[outArg + 1]
    : path.join(HERE, "../../web/public/ax-cases/sheets");

const TPL = fs.readFileSync(path.join(HERE, "sheet-template.js"), "utf8");
const { sheet } = new Function(`${TPL}\nreturn { sheet };`)();

const citizenize = (html) =>
  html
    .replaceAll(">추론</em>", ">탐색</em>")
    .replaceAll("추론(암묵지) <b>", "탐색(제도 문해) <b>")
    .replaceAll(
      "추론 — 규정에 없는 암묵지·실무 관행",
      "탐색 — 제도를 알아야 넘는 구간(시민의 제도 문해 부담)",
    );

const N = (a) => ({
  id: a[0], gate: a[1], lane: a[2], kind: a[3], name: a[4], sub: a[5], tag: a[6],
});

export function loadCases() {
  if (!fs.existsSync(CASES)) return [];
  return fs
    .readdirSync(CASES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const c = JSON.parse(fs.readFileSync(path.join(CASES, f), "utf8"));
      c._file = f;
      return c;
    })
    .sort((a, b) => (a.id ?? 999) - (b.id ?? 999));
}

function widthFor(laneCount) {
  return Math.max(1400, 300 + laneCount * 290);
}

export function renderCase(c) {
  const lanesT = [...c.lanes, c.toolLane || "AI 도구"];
  const common = { gates: c.gates, basisNote: c.basisNote };
  const asis = sheet({
    ...common,
    variant: `${c.id}호 · AS-IS`,
    lanes: c.lanes,
    width: widthFor(c.lanes.length),
    title: c.asis.title,
    subtitle: c.asis.subtitle,
    headline: c.asis.headline,
    nodes: c.asis.nodes.map(N),
    edges: c.asis.edges,
  });
  const tobe = sheet({
    ...common,
    variant: `${c.id}호 · AI 적용`,
    lanes: lanesT,
    toolLane: true,
    width: widthFor(lanesT.length),
    title: c.tobe.title,
    subtitle: c.tobe.subtitle,
    headline: c.tobe.headline,
    nodes: c.tobe.nodes.map(N),
    edges: c.tobe.edges,
  });
  return c.meta?.citizen
    ? { asis: citizenize(asis), tobe: citizenize(tobe) }
    : { asis, tobe };
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cases = loadCases();
  let n = 0;
  for (const c of cases) {
    try {
      const { asis, tobe } = renderCase(c);
      fs.writeFileSync(path.join(OUT, `${c.slug}-asis.html`), asis);
      fs.writeFileSync(path.join(OUT, `${c.slug}-tobe.html`), tobe);
      n++;
    } catch (e) {
      console.error(`RENDER FAIL ${c._file}: ${e.message}`);
    }
  }
  console.log(`rendered ${n}/${cases.length} cases → ${OUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
