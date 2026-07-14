// 인용 조문의 현행 원문을 국가법령정보센터 Open API로 받아 institution JSON의
// verification.articleTexts 에 저장한다. 팝업(조문확인)에서 조문 원문을 보여주기 위한 데이터.
// 사용: LAW_OC=... KOREAN_LAW_CLI=... node scripts/populate-article-texts.mjs [--only slug]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(REPO_DIR, "data", "institutions");
const CLI = process.env.KOREAN_LAW_CLI;
const OC = process.env.LAW_OC;
if (!CLI || !OC) throw new Error("KOREAN_LAW_CLI, LAW_OC 환경변수가 필요합니다.");

const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg > -1 ? process.argv[onlyArg + 1] : null;

const compact = (s) => (s ?? "").replace(/\s+/g, "").replace(/[·ㆍ]/g, "");
// "제7조제1항", "제12조의2제3항" → base article "제7조", "제12조의2"
function baseArticle(article) {
  const m = String(article).match(/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/);
  if (!m) return null;
  return `제${m[1]}조${m[2] ? `의${m[2]}` : ""}`;
}

function stripToolNoise(s) {
  return (s || "")
    .split("\n")
    .filter(
      (line) =>
        !/^\(node:\d+\)/.test(line) &&
        !/UNDICI|EnvHttpProxyAgent/.test(line) &&
        !/--trace-warnings/.test(line),
    )
    .join("\n");
}

function runCli(args) {
  const res = spawnSync("node", [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env },
    maxBuffer: 64 * 1024 * 1024,
  });
  // stdout만 사용한다. stderr(UNDICI 경고 등 내부 노이즈)는 조문 원문에 섞지 않는다.
  return stripToolNoise(res.stdout || "");
}

async function fetchAdminRuleFull(serial) {
  const url = `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=admrul&ID=${serial}&type=JSON`;
  try {
    const r = await fetch(url);
    if (!r.ok) return "";
    const j = await r.json();
    return JSON.stringify(j);
  } catch {
    return "";
  }
}

// 본문 텍스트에서 "제N조(제목) …" 블록을 각 조문 단위로 분리
function parseArticleBodies(output) {
  const map = new Map();
  // 헤더 라인: 제7조(계약의 방법)  — 조문 제목 괄호 포함
  const headerRe = /제(\d+)조(?:의(\d+))?\s*\(([^)]*)\)/g;
  const marks = [];
  let m;
  while ((m = headerRe.exec(output)) !== null) {
    marks.push({ idx: m.index, key: `제${m[1]}조${m[2] ? `의${m[2]}` : ""}`, title: m[3], headEnd: headerRe.lastIndex });
  }
  for (let i = 0; i < marks.length; i += 1) {
    const start = marks[i].headEnd;
    const end = i + 1 < marks.length ? marks[i + 1].idx : output.length;
    let body = output.slice(start, end).trim();
    // JSON 잔여 구두점 정리
    body = body.replace(/\\n/g, "\n").replace(/^["\s,:]+/, "").replace(/["\s,]+$/, "").trim();
    if (!map.has(marks[i].key) && body) {
      map.set(marks[i].key, { title: marks[i].title, body });
    }
  }
  return map;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function processFile(file) {
  const p = path.join(DATA_DIR, file);
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const verification = d.verification;
  if (!verification || !Array.isArray(verification.sources)) return { file, filled: 0, skipped: "no-sources" };

  const sourceByLaw = new Map();
  for (const s of verification.sources) {
    sourceByLaw.set(compact(s.law), s);
    if (s.officialName) sourceByLaw.set(compact(s.officialName), s);
  }

  // 인용 (law, baseArticle) 수집
  const needed = new Map(); // sourceKey -> {source, articles:Set, citations:[{law,article,base}]}
  for (const node of d.process?.nodes ?? []) {
    for (const lb of node.legal_basis ?? []) {
      const base = baseArticle(lb.article);
      if (!base) continue;
      const src = sourceByLaw.get(compact(lb.law));
      if (!src) continue;
      const skey = src.mst ? `mst:${src.mst}` : src.adminRuleSerial ? `adm:${src.adminRuleSerial}` : null;
      if (!skey) continue;
      if (!needed.has(skey)) needed.set(skey, { source: src, bases: new Set(), keys: new Set() });
      needed.get(skey).bases.add(base);
      needed.get(skey).keys.add(`${lb.law}::${lb.article}`);
    }
  }

  const articleTexts = {}; // "law::article" -> {title, body, effectiveOn}
  for (const [, group] of needed) {
    const src = group.source;
    let output = "";
    if (src.mst) {
      for (const b of chunk([...group.bases], 20)) {
        output += "\n" + runCli(["get_batch_articles", "--mst", src.mst, "--articles", JSON.stringify(b)]);
      }
    } else if (src.adminRuleSerial) {
      output = runCli(["get_admin_rule", "--id", src.adminRuleSerial]);
      if (/응답이 너무 길어|too long/i.test(output)) {
        const full = await fetchAdminRuleFull(src.adminRuleSerial);
        if (full) output = full;
      }
    }
    const bodies = parseArticleBodies(output);
    for (const key of group.keys) {
      const [, article] = key.split("::");
      const base = baseArticle(article);
      const hit = bodies.get(base);
      if (hit) {
        articleTexts[key] = {
          article: base,
          title: hit.title,
          text: hit.body.slice(0, 1400),
          effectiveOn: src.effectiveOn ?? src.promulgatedOn ?? null,
        };
      }
    }
  }

  const filled = Object.keys(articleTexts).length;
  if (filled > 0) {
    verification.articleTexts = articleTexts;
    fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
  }
  return { file, filled };
}

const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json") && (!ONLY || f === `${ONLY}.json`));
let total = 0;
for (const f of files) {
  const r = await processFile(f);
  total += r.filled || 0;
  console.log(`${r.file}: ${r.filled ?? 0} 조문 원문${r.skipped ? ` (${r.skipped})` : ""}`);
}
console.log(`\n총 ${total}개 조문 원문 저장 (${files.length}개 제도)`);
