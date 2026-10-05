import fs from "fs";
import path from "path";
import type { LawMap, LawMapIndex } from "./law-map-types";

const LAW_MAP_DIR = path.join(process.cwd(), "data", "law-map");

let indexCache: LawMapIndex | null | undefined;

export function getLawMapIndex(): LawMapIndex | null {
  if (indexCache !== undefined) return indexCache;
  const file = path.join(LAW_MAP_DIR, "index.json");
  indexCache = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as LawMapIndex) : null;
  return indexCache;
}

export function getLawMapIds(): string[] {
  return getLawMapIndex()?.laws.map((law) => law.lawId) ?? [];
}

export function getLawMap(lawId: string): LawMap | null {
  if (!/^\d+$/.test(lawId)) return null;
  const file = path.join(LAW_MAP_DIR, `${lawId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as LawMap;
}

/** 공백 제거한 법령명 → `/law/<lawId>/`. 제도 페이지의 법적 근거에서 법령 지도로 잇는 데 쓴다. */
export function getLawMapHrefsByName(): Record<string, string> {
  const hrefs: Record<string, string> = {};
  for (const law of getLawMapIndex()?.laws ?? []) {
    for (const name of law.names) hrefs[name.replace(/\s+/g, "")] = `/law/${law.lawId}/`;
  }
  return hrefs;
}
