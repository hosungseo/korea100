// 법제처 DRF 응답(lsStmd·lsDelegated XML, eflaw JSON)을 법령 지도 IR 재료로 바꾸는 순수 함수.
// 네트워크·파일 입출력 없음. 모든 출력에서 OC(인증값)를 제거한다.
import { articleLabel } from "./article-citations.mjs";
import { parseLawArticles } from "./law-service.mjs";

/** URL 문자열에서 OC 쿼리 파라미터를 통째로 지운다. 뒤따르는 구분자가 있으면 앞 구분자를 남긴다. */
export function stripOc(text) {
  return String(text ?? "").replace(
    /(\?|&amp;|&)OC=[^&"'<\s]*(&amp;|&)?/g,
    (_m, lead, trail) => (trail ? lead : ""),
  );
}

function field(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`);
  const m = String(block ?? "").match(re);
  if (!m) return "";
  return (m[1] ?? m[2] ?? "").trim();
}

function blocks(xml, tag) {
  return String(xml ?? "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?</${tag}>`, "g")) ?? [];
}

function ymd(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : null;
}

/** "제13조의2제2항" → { no, branch, label, rest }. 조문이 아니면 null. */
export function parseClause(text) {
  const s = String(text ?? "").replace(/\s+/g, "");
  const m = s.match(/^제(\d+)조(?:의(\d+))?(.*)$/);
  if (!m) return null;
  return {
    no: Number(m[1]),
    branch: m[2] ? Number(m[2]) : null,
    label: articleLabel(m[1], m[2] ?? null),
    rest: m[3] || "",
  };
}

function lawInfo(block) {
  return {
    lawId: field(block, "법령ID"),
    mst: field(block, "법령일련번호"),
    name: field(block, "법령명"),
    kind: field(block, "법종구분"),
    effectiveOn: ymd(field(block, "시행일자")),
    promulgatedOn: ymd(field(block, "공포일자")),
  };
}

function adminRuleInfo(block) {
  return {
    id: field(block, "행정규칙ID"),
    serial: field(block, "행정규칙일련번호"),
    name: field(block, "행정규칙명"),
    kind: field(block, "법종구분"),
    effectiveOn: ymd(field(block, "시행일자")),
    issuedOn: ymd(field(block, "발령일자")),
  };
}

function ordinanceInfo(block) {
  return {
    id: field(block, "자치법규ID"),
    serial: field(block, "자치법규일련번호"),
    name: field(block, "자치법규명"),
    kind: field(block, "법종구분"),
  };
}

function uniqueBy(list, keyOf) {
  const seen = new Set();
  return list.filter((item) => {
    const key = keyOf(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const STMD_SECTION_TIER = {
  시행령: "decrees",
  시행규칙: "rules",
  행정규칙: "adminRules",
  고시: "adminRules",
  훈령: "adminRules",
  예규: "adminRules",
  자치법규: "ordinances",
  조례: "ordinances",
  규칙: "ordinances",
};

/** lsStmd(법령체계도) XML → { root, decrees, rules, adminRules, ordinances } */
export function parseLsStmd(xml) {
  const text = stripOc(xml);
  if (!/<법령체계도>/.test(text)) throw new Error("lsStmd 응답이 아닙니다");
  const root = lawInfo(blocks(text, "기본정보")[0] ?? "");
  const body = text.match(/<상하위법>([\s\S]*?)<\/상하위법>/)?.[1] ?? "";
  const out = { root, decrees: [], rules: [], adminRules: [], ordinances: [] };
  const sectionRe = /<(법률|시행령|시행규칙|행정규칙|고시|훈령|예규|자치법규|조례|규칙)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = sectionRe.exec(body))) {
    const tier = STMD_SECTION_TIER[m[1]];
    if (!tier) continue;
    for (const block of blocks(m[2], "기본정보")) {
      if (tier === "adminRules") out.adminRules.push(adminRuleInfo(block));
      else if (tier === "ordinances") out.ordinances.push(ordinanceInfo(block));
      else out[tier].push(lawInfo(block));
    }
  }
  out.decrees = uniqueBy(out.decrees, (x) => x.mst);
  out.rules = uniqueBy(out.rules, (x) => x.mst);
  out.adminRules = uniqueBy(out.adminRules, (x) => x.serial);
  out.ordinances = uniqueBy(out.ordinances, (x) => x.serial);
  return out;
}
