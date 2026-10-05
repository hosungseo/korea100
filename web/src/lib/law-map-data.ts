import fs from "fs";
import path from "path";
import type { LawMap, LawMapClass, LawMapIndex } from "./law-map-types";

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

/** 조문 분류(<lawId>.class.json) 전체. 없으면 null — 규율 보기 단추가 비활성화된다. 감사 시트용 원본. */
export function getLawMapClass(lawId: string): LawMapClass | null {
  if (!/^\d+$/.test(lawId)) return null;
  const file = path.join(LAW_MAP_DIR, `${lawId}.class.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as LawMapClass;
}

/**
 * 클라이언트로 보낼 분류: 규율 보기가 쓰는 법률 레인 조문만, 필드도 stage·actor·actors·confidence·evidence·method·deleted만.
 * 시행령·시행규칙 조문(전체의 3/4)과 집계는 보내지 않는다.
 */
export function projectLawMapClassForClient(cls: LawMapClass | null, map: LawMap): LawMapClass | null {
  if (!cls) return null;
  const statuteLanes = new Set(map.lanes.filter((l) => l.tier === "statute").map((l) => l.id));
  const articles: LawMapClass["articles"] = {};
  for (const a of map.articles) {
    if (!statuteLanes.has(a.laneId)) continue;
    const c = cls.articles[a.id];
    if (!c) continue;
    const entry: LawMapClass["articles"][string] = {
      stage: c.stage,
      actor: c.actor,
      confidence: c.confidence,
      evidence: c.evidence ?? [],
      method: c.method,
    };
    const actors = (c.actors ?? []).map((x) => (x.role === "primary" ? { actor: x.actor, role: x.role } : x));
    if (actors.length > 1) entry.actors = actors;
    if (c.deleted) entry.deleted = true;
    articles[a.id] = entry;
  }
  return { lawId: cls.lawId, generatedAt: cls.generatedAt, method: cls.method, articles, stats: {} };
}

/**
 * 공백 제거한 법령명 → `/law/<lawId>/`. 제도 페이지의 법적 근거에서 법령 지도로 잇는 데 쓴다.
 * 같은 부령이 두 법률 지도에 모두 나오면(공동부령) 목록 순서상 먼저 나온 법률이 이긴다.
 */
export function getLawMapHrefsByName(): Record<string, string> {
  const hrefs: Record<string, string> = {};
  for (const law of getLawMapIndex()?.laws ?? []) {
    for (const name of law.names) {
      const key = name.replace(/\s+/g, "");
      if (!(key in hrefs)) hrefs[key] = `/law/${law.lawId}/`;
    }
  }
  return hrefs;
}
