#!/usr/bin/env node
// Aggregate the news→warroom→institution loop into one status payload
// for /warroom/loop/. Pure read of existing artifacts — no network.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(WEB, "..");
const read = (p) => JSON.parse(readFileSync(p, "utf8"));

const signals = read(join(WEB, "public/warroom/map/signals.json"));
const mapData = read(join(WEB, "public/warroom/map/data.json"));
const gateQ = read(join(WEB, "public/warroom/map/gate-candidates.json"));
const manifest = read(join(REPO, "docs/institutions-100-manifest.json"));
const instQPath = join(REPO, "docs/institution-candidates/queue.json");
const instQ = existsSync(instQPath) ? read(instQPath) : { candidates: [] };

const kinds = {};
let articleCount = 0;
for (const arr of Object.values(signals.byGate)) {
  for (const a of arr) { kinds[a.kind] = (kinds[a.kind] ?? 0) + 1; articleCount++; }
}
const count = (list, st) => list.filter((c) => c.status === st).length;
const linkedGates = mapData.nodes.filter((n) => (n.templates ?? []).length > 0).length;

const data = {
  generatedAt: signals.generatedAt,
  pipeline: {
    signals: { articles: articleCount, gates: Object.keys(signals.byGate).length, kinds },
    suggestions: signals.statusSuggestions ?? [],
    gateQueue: {
      proposed: count(gateQ.candidates, "proposed"),
      accepted: count(gateQ.candidates, "accepted"),
      deferred: count(gateQ.candidates, "deferred"),
    },
    instQueue: {
      proposed: count(instQ.candidates, "proposed"),
      accepted: count(instQ.candidates, "accepted"),
      deferred: count(instQ.candidates, "deferred") + count(instQ.candidates, "rejected"),
    },
  },
  totals: {
    gates: mapData.nodes.length,
    deps: mapData.edges.length,
    procs: mapData.nodes.reduce((s, n) => s + (n.procs ?? 1), 0),
    linkedGates,
    institutions: manifest.length,
  },
  pendingGates: gateQ.candidates.filter((c) => c.status === "proposed").map((c) => c.proc),
  pendingInsts: instQ.candidates.filter((c) => c.status === "proposed").map((c) => c.name),
  issues: { gate: 139, institution: 145 },
};

const outDir = join(WEB, "public/warroom/loop");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "data.json"), `${JSON.stringify(data, null, 1)}\n`);
console.log(
  `loop status: ${data.generatedAt} · 신호 ${articleCount} · 제안 ${data.pipeline.suggestions.length} · ` +
  `관문후보 대기 ${data.pipeline.gateQueue.proposed} · 제도후보 대기 ${data.pipeline.instQueue.proposed}`,
);
