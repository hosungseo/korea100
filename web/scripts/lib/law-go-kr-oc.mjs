import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

/**
 * Resolve 법제처 OpenAPI OC. Prefer env/secret file; never log the value.
 */
export function resolveLawGoKrOc() {
  readEnvFile(path.join(WEB_DIR, ".env.local"));
  readEnvFile(path.join(path.dirname(WEB_DIR), ".env"));
  const fromEnv = process.env.LAW_GO_KR_OC || process.env.MOLEG_OC || process.env.LAW_OC;
  if (fromEnv) return fromEnv.trim();
  const secretPath = path.join(process.env.HOME || "", ".openclaw/secrets/law-go-kr-oc");
  if (fs.existsSync(secretPath)) {
    const v = fs.readFileSync(secretPath, "utf8").trim();
    if (v) return v;
  }
  throw new Error("LAW_GO_KR_OC missing. Set web/.env.local or ~/.openclaw/secrets/law-go-kr-oc");
}

export function lawSearchUrl(query, { type = "XML" } = {}) {
  const oc = encodeURIComponent(resolveLawGoKrOc());
  const q = encodeURIComponent(query);
  return `https://www.law.go.kr/DRF/lawSearch.do?OC=${oc}&target=law&query=${q}&type=${type}`;
}

export function lawServiceUrl(mst, { type = "XML" } = {}) {
  const oc = encodeURIComponent(resolveLawGoKrOc());
  return `https://www.law.go.kr/DRF/lawService.do?OC=${oc}&target=law&MST=${encodeURIComponent(mst)}&type=${type}`;
}
