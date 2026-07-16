// 흐름도·근거법령 전수조사 (결정적 기계 검사)
//
// 검사 항목:
//  A. 삭제 조문 인용 — articleTexts 원문이 "삭제"인데 요지가 실체 내용을 주장
//  B. 내용 불일치 — 요지↔원문 containment < 0.5 (verify-citation-content와 동일 판정)
//  C. 원문 미연결 인용 — legal_basis에 조번호가 있는데 articleTexts 항목이 없음
//     (서술형 인용, 출처 미연결, 대조 실패 등 — 팝업에 원문이 안 뜨는 인용)
//  D. 서술형 인용 — article에 조번호(제N조) 자체가 없음
//  E. 캔버스 legalBasis 계층 정렬 위반 — 법률→대통령령→부령→행정규칙 순서 검사
//
// 출력: docs/full-audit-report.json + 콘솔 요약
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(REPO, "data", "institutions");
const OUT = path.join(REPO, "..", "docs", "full-audit-report.json");

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";
const isZW = (cp) => cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff;
function norm(s) {
  if (!s) return "";
  let c = "";
  for (const ch of s) { const cp = ch.codePointAt(0); if (isZW(cp)) continue; c += cp === 0xa0 ? " " : ch; }
  return c.replace(/[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/g, (m) => `(${CIRCLED.indexOf(m) + 1})`)
    .replace(/[「『」』]/g, "").replace(/[·•]/g, " ").replace(/\s+/g, " ").trim();
}
function grams(s) {
  const t = norm(s).toLowerCase().replace(/[\s,.?!;:()[\]{}"'`~<>/\\|+=*&^%$#@!-]+/gu, "");
  if (t.length < 2) return t ? [t] : [];
  const g = []; for (let i = 0; i < t.length - 1; i += 1) g.push(t.slice(i, i + 2));
  return g;
}
function containment(a, b) {
  const A = new Set(grams(a)), B = new Set(grams(b));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const g of A) if (B.has(g)) n += 1;
  return n / A.size;
}
function lcsLen(a, b) {
  a = norm(a); b = norm(b);
  const n = a.length, m = b.length;
  if (!n || !m) return 0;
  let prev = new Uint16Array(m + 1), curr = new Uint16Array(m + 1), best = 0;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) { const v = prev[j - 1] + 1; curr[j] = v; if (v > best) best = v; }
      else curr[j] = 0;
    }
    [prev, curr] = [curr, prev]; curr.fill(0);
  }
  return best;
}

const KIND_RANK = { "법률": 1, "대통령령": 2, "총리령·부령": 3, "부령": 3, "행정규칙": 4, "고시·지침": 4, "계약예규": 4, "조약": 0 };
const HAS_ARTICLE = /제\s*\d+\s*조/;

const findings = { deletedArticle: [], contentMismatch: [], noSourceText: [], descriptiveCitation: [], legalBasisOrder: [], emptyBasis: [] };
let citations = 0;

for (const f of fs.readdirSync(DATA).filter((x) => x.endsWith(".json")).sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
  const at = d.verification?.articleTexts ?? {};

  for (const node of d.process?.nodes ?? []) {
    // F. 근거 미기재: 업무·게이트 노드인데 legal_basis가 비어 있음(시스템 노드는 제외)
    if (!(node.legal_basis?.length) && node.type !== "system") {
      findings.emptyBasis.push({ slug: d.slug, node: node.id, name: (node.name ?? "").slice(0, 40), type: node.type });
    }
    for (const lb of node.legal_basis ?? []) {
      citations += 1;
      const ref = { slug: d.slug, node: node.id, law: lb.law, article: lb.article };
      if (!HAS_ARTICLE.test(lb.article ?? "")) {
        findings.descriptiveCitation.push({ ...ref, claim: (lb.text ?? "").slice(0, 80) });
        continue;
      }
      const entry = at[`${lb.law}::${lb.article}`];
      if (!entry?.text) {
        findings.noSourceText.push(ref);
        continue;
      }
      const src = entry.text.trim();
      // A. 삭제 조문: 원문이 사실상 '삭제'뿐인데 요지가 실체 내용을 주장
      // (항 추출본은 "② 삭제"처럼 원숫자로 시작하므로 마커를 벗기고 판정)
      const bare = src.replace(/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮\s]+/, "").replace(/[<〈([].*$/, "").trim();
      if (/^삭\s*제/.test(bare) && bare.length <= 6) {
        findings.deletedArticle.push({ ...ref, claim: (lb.text ?? "").slice(0, 100) });
        continue;
      }
      // B. 내용 불일치
      if (lb.text) {
        const source = `${entry.title ?? ""} ${src}`;
        if (lcsLen(lb.text, source) < 30 && containment(lb.text, source) < 0.5) {
          findings.contentMismatch.push({ ...ref, score: Number(containment(lb.text, source).toFixed(3)), claim: lb.text.slice(0, 100) });
        }
      }
    }
  }

  // E. 캔버스 legalBasis 정렬(층위 비내림차순)
  const lbArr = d.canvas?.legalBasis ?? [];
  let prevRank = 0;
  for (const b of lbArr) {
    const r = KIND_RANK[b.kind] ?? 9;
    if (r < prevRank) {
      findings.legalBasisOrder.push({ slug: d.slug, law: b.law, kind: b.kind, after: lbArr[lbArr.indexOf(b) - 1]?.law });
      break;
    }
    prevRank = Math.max(prevRank, r);
  }
}

findings.contentMismatch.sort((a, b) => a.score - b.score);
const summary = Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length]));
fs.writeFileSync(OUT, JSON.stringify({ checkedAt: new Date().toISOString().slice(0, 10), citations, summary, findings }, null, 1) + "\n");
console.log(`전수조사: 인용 ${citations}건`);
for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);
console.log(`→ docs/full-audit-report.json`);
