// 법제처 DRF 호출기. 캐시 우선, HTML 오류 페이지 감지, 지수 백오프, 캐시·오류 메시지에서 OC 제거.
import fs from "node:fs";
import path from "node:path";
import { stripOc } from "./law-map-parsers.mjs";

const BASE = "https://www.law.go.kr/DRF/lawService.do";
const sleep = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

export function createDrfClient({
  oc, cacheDir, delayMs = 300, retries = 3, backoffMs = 1000, force = false, fetchImpl = fetch,
}) {
  if (!oc) throw new Error("OC가 필요합니다");
  fs.mkdirSync(cacheDir, { recursive: true });
  // stripOc은 "OC=…" 쿼리 꼴만 지우므로, 다른 자리(오류 본문·경로 등)에 박힌 OC 값은 리터럴로 한 번 더 지운다.
  const redact = (s) => stripOc(String(s ?? "")).split(oc).join("[OC]");

  async function request(params, type) {
    const url = new URL(BASE);
    url.searchParams.set("OC", oc);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set("type", type);
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(backoffMs * 3 ** (attempt - 1));
      try {
        const res = await fetchImpl(url, { headers: { "User-Agent": "Mozilla/5.0 Korea100LawMap/1.0" } });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!text.trim() || /^\s*(<!DOCTYPE html|<html)/i.test(text)) throw new Error("법제처가 오류 페이지를 돌려줬습니다");
        await sleep(delayMs);
        return text;
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(`${redact(url.toString())}: ${redact(lastErr?.message ?? lastErr)}`);
  }

  async function cached(cacheName, loader) {
    const file = path.join(cacheDir, cacheName);
    if (!force && fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    const safe = redact(await loader());
    // 임시 파일에 쓰고 이름을 바꿔 중단돼도 반쪽 캐시가 남지 않게 한다
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, safe);
    fs.renameSync(tmp, file);
    return safe;
  }

  return {
    redact,
    getText: (params, cacheName) => cached(cacheName, () => request(params, "XML")),
    getJson: async (params, cacheName) => JSON.parse(await cached(cacheName, () => request(params, "JSON"))),
  };
}
