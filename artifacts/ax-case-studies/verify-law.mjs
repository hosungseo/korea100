// 법령 인용 감사: cases/*.json 의 statute 노드에서 (법령명, 조문)을 뽑아
// 국가법령정보센터 DRF로 실재 여부를 대조한다.
// 사용: node verify-law.mjs [--only slug]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES = path.join(HERE, "cases");
const CACHE_DIR = path.join(HERE, ".lawcache");
fs.mkdirSync(CACHE_DIR, { recursive: true });

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 법제처 오픈API 계정. 기본은 공용 데모 계정(test).
// 본인 OC 발급 시: LAW_OC=<아이디> node verify-law.mjs
const OC = process.env.LAW_OC || "test";
const DRF = "https://www.law.go.kr/DRF";

// --wait N : 점검 중이면 N분까지 3분 간격으로 재시도
const waitIdx = process.argv.indexOf("--wait");
const WAIT_MIN = waitIdx > -1 ? Number(process.argv[waitIdx + 1] || 60) : 0;

async function apiUp() {
  try {
    const r = await fetch(`${DRF}/lawSearch.do?OC=${OC}&target=law&type=XML&query=${encodeURIComponent("건축법")}`, { headers: UA });
    const t = await r.text();
    return !(t.includes("시스템 점검") || t.trimStart().startsWith("<!DOCTYPE html>"));
  } catch { return false; }
}

// sub 텍스트에서 "○○법 제12조", "○○에 관한 법률 제3조의2" 형태 추출
const LAW_TOKEN =
  /([가-힣A-Za-z0-9·ㆍ()\s]{2,40}?(?:법률|법|령|규정|규칙|조례|고시|훈령|예규))\s*제\s*(\d+)\s*조(?:의\s*(\d+))?/g;

function extractCitations(sub) {
  const out = [];
  let m;
  const text = String(sub).replace(/\s+/g, " ");
  while ((m = LAW_TOKEN.exec(text))) {
    let name = m[1].trim().replace(/^[·,]/, "").trim();
    // 앞쪽에 붙은 군더더기 제거
    name = name.replace(/^(?:및|과|와|그|이|저)\s+/, "");
    out.push({ law: name, article: m[3] ? `제${m[2]}조의${m[3]}` : `제${m[2]}조` });
  }
  return out;
}

const cacheGet = (k) => {
  const f = path.join(CACHE_DIR, encodeURIComponent(k) + ".txt");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
};
const cacheSet = (k, v) => {
  fs.writeFileSync(path.join(CACHE_DIR, encodeURIComponent(k) + ".txt"), v);
};

let MAINTENANCE = false;
const isMaintenance = (xml) =>
  xml.includes("시스템 점검") || xml.includes("<!DOCTYPE html>");

async function drfSearch(name) {
  const key = `search:${name}`;
  const hit = cacheGet(key);
  if (hit !== null) return hit ? JSON.parse(hit) : null;
  const targets = ["law", "ordin", "admrul"];
  let sawValidXml = false; // 유효 응답을 한 번이라도 받았는지 — 실패를 '없음'으로 캐시하지 않기 위함
  for (const target of targets) {
    const url = `${DRF}/lawSearch.do?OC=${OC}&target=${target}&type=XML&display=30&query=${encodeURIComponent(name)}`;
    let xml = "";
    try {
      const r = await fetch(url, { headers: UA });
      xml = await r.text();
    } catch { continue; }
    if (isMaintenance(xml)) { MAINTENANCE = true; return null; }
    if (!/<resultMsg>\s*success/i.test(xml)) { await sleep(300); continue; }
    sawValidXml = true;
    const recs = xml.match(/<(law|ordin|admrul)[^>]*>[\s\S]*?<\/\1>/g) || [];
    for (const rec of recs) {
      const nm =
        /<법령명한글><!\[CDATA\[(.*?)\]\]>/.exec(rec) ||
        /<자치법규명><!\[CDATA\[(.*?)\]\]>/.exec(rec) ||
        /<행정규칙명><!\[CDATA\[(.*?)\]\]>/.exec(rec);
      const mst =
        /<법령일련번호>(\d+)/.exec(rec) ||
        /<자치법규일련번호>(\d+)/.exec(rec) ||
        /<행정규칙일련번호>(\d+)/.exec(rec);
      if (!nm || !mst) continue;
      // 가운뎃점 표기(· ㆍ ･)와 공백 차이를 흡수해 비교한다
      const norm = (s) => s.replace(/[·ㆍ･‧]/g, "·").replace(/\s/g, "");
      if (norm(nm[1]) === norm(name)) {
        const val = { target, mst: mst[1], name: nm[1] };
        cacheSet(key, JSON.stringify(val));
        await sleep(120);
        return val;
      }
    }
    await sleep(120);
  }
  // 유효 응답을 한 번도 못 받았으면 '없음'으로 캐시하지 않는다 (일시 장애를 오탐으로 굳히지 않기 위함)
  if (sawValidXml) cacheSet(key, "");
  return null;
}

async function drfArticles(target, mst) {
  const key = `arts:${target}:${mst}`;
  const hit = cacheGet(key);
  if (hit !== null) return new Set(JSON.parse(hit));
  const url = `${DRF}/lawService.do?OC=${OC}&target=${target}&MST=${mst}&type=XML`;
  let xml = "";
  try {
    const r = await fetch(url, { headers: UA });
    xml = await r.text();
  } catch { return new Set(); }
  const set = new Set();
  for (const m of xml.matchAll(/제(\d+)조(?:의(\d+))?\s*\(/g))
    set.add(m[2] ? `제${m[1]}조의${m[2]}` : `제${m[1]}조`);
  for (const m of xml.matchAll(/<조문번호>(\d+)<\/조문번호>/g)) set.add(`제${m[1]}조`);
  cacheSet(key, JSON.stringify([...set]));
  await sleep(120);
  return set;
}

// 점검 중이면 --wait 분만큼 대기하며 재시도
if (WAIT_MIN > 0) {
  const deadline = Date.now() + WAIT_MIN * 60_000;
  let up = await apiUp();
  while (!up && Date.now() < deadline) {
    process.stderr.write(`법제처 API 점검 중 — 3분 후 재시도 (남은 ${Math.max(0, Math.round((deadline - Date.now()) / 60000))}분)\n`);
    await sleep(180_000);
    up = await apiUp();
  }
  if (!up) {
    console.log("[SKIP] 대기 시간 내에 법제처 API가 복구되지 않았습니다.");
    process.exit(2);
  }
  console.error("법제처 API 응답 확인 — 감사 시작");
}

const only = process.argv.indexOf("--only") > -1 ? process.argv[process.argv.indexOf("--only") + 1] : null;
const files = fs.existsSync(CASES) ? fs.readdirSync(CASES).filter((f) => f.endsWith(".json")) : [];
const results = [];

for (const f of files) {
  const c = JSON.parse(fs.readFileSync(path.join(CASES, f), "utf8"));
  if (only && c.slug !== only) continue;
  const cites = new Map();
  for (const which of ["asis", "tobe"])
    for (const n of c[which]?.nodes || [])
      if (n[3] === "statute")
        for (const cit of extractCitations(n[5]))
          cites.set(`${cit.law}|${cit.article}`, { ...cit, node: `${which}/${n[0]}` });
  for (const cit of cites.values()) {
    if (MAINTENANCE) break;
    const found = await drfSearch(cit.law);
    if (MAINTENANCE) break;
    if (!found) {
      results.push({ file: f, sev: "ERROR", code: "law-not-found", msg: `법령 미검출: "${cit.law}" (${cit.node})` });
      continue;
    }
    const arts = await drfArticles(found.target, found.mst);
    if (arts.size && !arts.has(cit.article))
      results.push({ file: f, sev: "ERROR", code: "article-not-found", msg: `${found.name}에 ${cit.article} 없음 (${cit.node})` });
  }
  process.stderr.write(`. `);
}

const errs = results.filter((r) => r.sev === "ERROR");
if (MAINTENANCE) {
  console.log("\n[SKIP] law.go.kr 점검 중 — 법령 감사를 수행하지 못했습니다. 나중에 재실행하세요.");
  process.exit(2);
}
console.log("\n" + (results.length ? results.map((r) => `[${r.sev}] ${r.file} — ${r.msg}`).join("\n") : "법령 인용 이상 없음"));
console.log(`\n법령 감사: 파일 ${files.length} · 오류 ${errs.length}`);
process.exit(errs.length ? 1 : 0);
