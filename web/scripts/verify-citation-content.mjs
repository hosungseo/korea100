// 조문 인용 '내용' 기계 대조 — korean-law-mcp의 citation-content-matcher 기법 이식
//
// 배경: verify:articles 는 조문 '실존'만 대조한다. 그러나 실존하는 조문에
// 엉뚱한 요지를 붙이는 환각(예: 제750조(계약해제) ← 실제는 불법행위)은 실존
// 검증으로 잡히지 않는다. korean-law-mcp(v4.7)의 verify_citations 도구는 이를
// 다층 매칭으로 잡는다:
//   L1 (exact)   — 정규화 후 연속 30자+ 공통 substring
//   L2 (jaccard) — 문자 bigram Jaccard ≥ 0.25 (교착어 조사/어미 차이에 robust)
// 이 스크립트는 그 순수함수 기법을 이식해, 각 노드 legal_basis.text(요지)를
// verification.articleTexts(법제처 현행 원문)와 대조하고 불일치를 보고한다.
//
// 사용: node scripts/verify-citation-content.mjs [--strict]
//   - 기본: 보고서(docs/citation-content-report.json) + 콘솔 요약, exit 0
//   - --strict: L1·L2 모두 실패한 인용이 있으면 exit 1 (CI 게이트용)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(REPO, "data", "institutions");
const REPORT = path.join(REPO, "..", "docs", "citation-content-report.json");
const STRICT = process.argv.includes("--strict");

const MIN_EXACT_LEN = 30;
const CONTAINMENT_THRESHOLD = 0.5;
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";

function isZeroWidth(cp) {
  return cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff;
}

// korean-law-mcp normalizeLegalText 이식: 원문자→(n), 「」 제거, 중점→공백, 공백 정리
function normalizeLegalText(s) {
  if (!s) return "";
  let cleaned = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (isZeroWidth(cp)) continue;
    cleaned += cp === 0x00a0 ? " " : ch;
  }
  return cleaned
    .replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/g, (m) => `(${CIRCLED.indexOf(m) + 1})`)
    .replace(/[「『]/g, "")
    .replace(/[」』]/g, "")
    .replace(/[·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 문자 bigram 토큰화 (교착어 조사·어미 차이에 강함)
function tokenize(s) {
  const compact = normalizeLegalText(s)
    .toLowerCase()
    .replace(/[\s,.?!;:()[\]{}"'`~<>/\\|+=*&^%$#@!-]+/gu, "");
  if (compact.length < 2) return compact ? [compact] : [];
  const grams = [];
  for (let i = 0; i < compact.length - 1; i += 1) grams.push(compact.slice(i, i + 2));
  return grams;
}

// 원본은 Jaccard(짧은 제목끼리 비교용). 우리 케이스는 '짧은 요지 vs 긴 원문'이라
// 합집합 분모가 커져 구조적으로 낮게 나온다 → containment(요지 bigram이 원문에
// 포함되는 비율 = |A∩B|/|A|)로 보정. 요지가 원문의 축약 패러프레이즈면 핵심
// 명사·수치의 bigram이 원문에 존재해 containment가 높고, 엉뚱한 내용이면 낮다.
function containment(claim, source) {
  const A = new Set(tokenize(claim));
  const B = new Set(tokenize(source));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return inter / A.size;
}

function longestCommonSubstringLen(a, b) {
  if (!a || !b) return 0;
  const n = a.length, m = b.length;
  let prev = new Uint16Array(m + 1);
  let curr = new Uint16Array(m + 1);
  let best = 0;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        const v = prev[j - 1] + 1;
        curr[j] = v;
        if (v > best) best = v;
      } else curr[j] = 0;
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return best;
}

// L1/L2 판정: claim(요지)이 원문과 의미적으로 닿아 있는가
function matchContent(claim, sourceText) {
  const c = normalizeLegalText(claim);
  const s = normalizeLegalText(sourceText);
  if (!c || !s) return { layer: "none", jaccard: 0, lcs: 0 };
  const lcs = longestCommonSubstringLen(c, s);
  if (lcs >= MIN_EXACT_LEN) return { layer: "L1-exact", score: null, lcs };
  const j = containment(c, s);
  if (j >= CONTAINMENT_THRESHOLD) return { layer: "L2-containment", score: Number(j.toFixed(3)), lcs };
  return { layer: "MISMATCH", score: Number(j.toFixed(3)), lcs };
}

const rows = [];
let checked = 0;
for (const f of fs.readdirSync(DATA).filter((x) => x.endsWith(".json")).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
  const at = d.verification?.articleTexts ?? {};
  for (const node of d.process?.nodes ?? []) {
    for (const lb of node.legal_basis ?? []) {
      const entry = at[`${lb.law}::${lb.article}`];
      if (!entry?.text || !lb.text) continue;
      checked += 1;
      // 제목 claim도 함께 비교 대상에 포함(제목 일치만으로도 인용 정합 신호)
      const source = `${entry.title ?? ""} ${entry.text}`;
      const m = matchContent(lb.text, source);
      if (m.layer === "MISMATCH") {
        rows.push({
          slug: d.slug, node: node.id, law: lb.law, article: lb.article,
          score: m.score, lcs: m.lcs, claim: lb.text.slice(0, 120),
        });
      }
    }
  }
}

rows.sort((a, b) => a.score - b.score);
fs.writeFileSync(REPORT, JSON.stringify({
  checkedAt: new Date().toISOString().slice(0, 10),
  method: "L1 exact(30자+) / L2 char-bigram containment≥0.5 — korean-law-mcp citation-content-matcher 이식(요지vs원문에 맞게 containment 보정)",
  checked, mismatches: rows.length, rows,
}, null, 1) + "\n");

console.log(`인용 내용 대조: ${checked}건 중 불일치(요지≁원문) ${rows.length}건 → docs/citation-content-report.json`);
for (const r of rows.slice(0, 12)) {
  console.log(`  [${r.score}] ${r.slug} ${r.node} ${r.law} ${r.article} :: ${r.claim.slice(0, 60)}`);
}
if (STRICT && rows.length > 0) process.exit(1);
