// web/data/law-map/<lawId>.json 들을 요약해 index.json을 만든다.
import fs from "node:fs";
import path from "node:path";

export function buildLawMapIndex(maps, generatedAt) {
  const laws = maps.map((m) => {
    const t = m.stats.articlesByTier;
    return {
      lawId: m.lawId,
      name: m.name,
      ministry: m.ministry ?? null,
      effectiveOn: m.effectiveOn ?? null,
      articleCount: (t.statute ?? 0) + (t.decree ?? 0) + (t.rule ?? 0),
      edgeCount: m.edges.length,
      institutionCount: m.institutions.length,
      unresolved: m.stats.unresolved,
      names: m.lanes.filter((l) => l.tier === "statute" || l.tier === "decree" || l.tier === "rule").map((l) => l.name),
    };
  });
  laws.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return { generatedAt, laws };
}

export function writeLawMapIndex(dataDir, generatedAt) {
  const files = fs.readdirSync(dataDir).filter((f) => /^\d+\.json$/.test(f)).sort();
  const maps = files.map((f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8")));
  const index = buildLawMapIndex(maps, generatedAt);
  fs.writeFileSync(path.join(dataDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}
