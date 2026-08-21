// 인용 표기 정규화: 항 표기를 붙이는 과정에서 생긴 중복을 정리한다.
// 사용: node normalize-citations.mjs [--dry]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES = path.join(HERE, "cases");
const DRY = process.argv.includes("--dry");

// 1) "제29조(제목) — 제29조제1항: 내용"  →  "제29조(제목) 제1항 — 내용"
const dupArticle = /(제\s*(\d+)\s*조(?:의\s*\d+)?)\s*(\([^)]*\))\s*[—-]\s*제\s*\2\s*조(?:의\s*\d+)?\s*(제\s*\d+\s*항(?:제\s*\d+\s*호)?)\s*[:：]?\s*/g;
// 2) "제29조(제목) 제1항 — 제29조제1항: 내용" 같은 잔여 중복
const dupArticle2 = /(제\s*(\d+)\s*조(?:의\s*\d+)?\s*\([^)]*\)\s*제\s*\d+\s*항)\s*[—-]\s*제\s*\2\s*조[^—:]*[:：]\s*/g;
// 3) 같은 법령명이 한 문장에서 두 번 이상 → 두 번째부터 '같은 법'
function collapseLawName(s) {
  const m = s.match(/([가-힣ㆍ·A-Za-z0-9\s]{4,40}?(?:에 관한 법률|기본법|법률|법|규정|규칙|조례))\s*제\s*\d+\s*조/);
  if (!m) return s;
  const name = m[1].trim();
  if (name.length < 6) return s;
  // 두 번째 등장부터 치환 (시행령/시행규칙은 '같은 법 시행령'으로)
  let first = true;
  return s.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s*시행령|\\s*시행규칙)?", "g"), (full, tail) => {
    if (first) { first = false; return full; }
    return tail ? `같은 법${tail}` : "같은 법";
  });
}

let files = 0, changes = 0;
for (const f of fs.readdirSync(CASES).filter((x) => x.endsWith(".json"))) {
  const p = path.join(CASES, f);
  const c = JSON.parse(fs.readFileSync(p, "utf8"));
  let touched = 0;
  const fix = (s) => {
    if (typeof s !== "string") return s;
    let t = s;
    t = t.replace(dupArticle, "$1$3 $4 — ");
    t = t.replace(dupArticle2, "$1 — ");
    // 주의: 반복되는 법령명을 '같은 법'으로 줄이지 않는다.
    // verify-law.mjs가 sub 텍스트에서 법령명을 추출해 대조하므로, 줄이면 '같은 법'이
    // 법령명으로 잡혀 전부 미검출 오류가 난다. 표기가 길어도 검증 가능성을 택한다.
    t = t.replace(/\s{2,}/g, " ").replace(/\s+—\s*$/, "").trim();
    if (t !== s) touched++;
    return t;
  };
  for (const w of ["asis", "tobe"])
    for (const n of c[w].nodes) n[5] = fix(n[5]);
  c.basisNote = fix(c.basisNote);
  if (touched) {
    changes += touched;
    files++;
    if (!DRY) fs.writeFileSync(p, JSON.stringify(c, null, 1));
  }
}
console.log(`${DRY ? "[dry] " : ""}정규화: ${files}개 파일 · ${changes}곳`);
