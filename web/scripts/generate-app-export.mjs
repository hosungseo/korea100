// web/scripts/generate-app-export.mjs — iOS 앱 원격 갱신용 export
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(webRoot, "data/institutions");
const outDir = path.join(webRoot, "public/app");
const outInst = path.join(outDir, "institutions");
fs.mkdirSync(outInst, { recursive: true });

const files = fs.readdirSync(dataDir).filter((f) => f.endsWith(".json")).sort();
const entries = [];
for (const f of files) {
  const raw = fs.readFileSync(path.join(dataDir, f), "utf8");
  const d = JSON.parse(raw);
  const compact = {
    slug: d.slug,
    name: d.name,
    oneLiner: d.oneLiner,
    type: d.type,
    priority: d.priority,
    category: d.category ?? "기타",
    asOfDate: d.asOfDate,
    canvas: d.canvas,
    related: d.related ?? [],
    verifiedReferences: d.verification?.articleVerification?.verifiedReferences ?? null,
    articleReferences: d.verification?.articleVerification?.articleReferences ?? null,
  };
  fs.writeFileSync(path.join(outInst, `${d.slug}.json`), JSON.stringify(compact));
  entries.push({
    slug: d.slug,
    hash: crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16),
    name: d.name,
    category: d.category ?? "기타",
  });
}
fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), entries })
);
console.log(`app export: ${entries.length} institutions`);
