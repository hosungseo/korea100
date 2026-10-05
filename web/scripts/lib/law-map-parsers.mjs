// 법제처 DRF 응답(lsStmd·lsDelegated XML, eflaw JSON)을 법령 지도 IR 재료로 바꾸는 순수 함수.
// 네트워크·파일 입출력 없음. 모든 출력에서 OC(인증값)를 제거한다.
import { articleLabel } from "./article-citations.mjs";
import { parseLawArticles } from "./law-service.mjs";

/** URL 문자열에서 OC 쿼리 파라미터를 통째로 지운다. 뒤따르는 구분자가 있으면 앞 구분자를 남긴다. */
export function stripOc(text) {
  return String(text ?? "").replace(
    /(\?|&amp;|&)OC=[^&"'<\s]*(&amp;|&)?/gi,
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

// <기본정보> 바로 앞에 오는 태그 → 층위. 법률은 root 자신이므로 건너뛴다.
const STMD_TAG_TIER = {
  시행령: "decrees",
  시행규칙: "rules",
  고시: "adminRules",
  훈령: "adminRules",
  예규: "adminRules",
  조례: "ordinances",
  규칙: "ordinances",
};

/**
 * lsStmd(법령체계도) XML → { root, decrees, rules, adminRules, ordinances }.
 * 실응답의 <상하위법>은 평탄하지 않다: 법률 > 시행령 > 시행규칙 > (행정규칙 > 고시·훈령) / (자치법규 > 조례·규칙)
 * 순으로 중첩되므로 섹션 범위를 자르지 않고, 각 <기본정보>를 바로 앞 태그로 분류한다.
 */
export function parseLsStmd(xml) {
  const text = stripOc(xml);
  if (!/<법령체계도>/.test(text)) throw new Error("lsStmd 응답이 아닙니다");
  const root = lawInfo(blocks(text, "기본정보")[0] ?? "");
  const body = text.match(/<상하위법>([\s\S]*?)<\/상하위법>/)?.[1] ?? "";
  const out = { root, decrees: [], rules: [], adminRules: [], ordinances: [] };
  const re = /<(법률|시행령|시행규칙|고시|훈령|예규|조례|규칙)(?:\s[^>]*)?>\s*(<기본정보>[\s\S]*?<\/기본정보>)/g;
  let m;
  while ((m = re.exec(body))) {
    const tier = STMD_TAG_TIER[m[1]];
    if (!tier) continue;
    const block = m[2];
    if (tier === "adminRules") out.adminRules.push(adminRuleInfo(block));
    else if (tier === "ordinances") out.ordinances.push(ordinanceInfo(block));
    else out[tier].push(lawInfo(block));
  }
  out.decrees = uniqueBy(out.decrees, (x) => x.mst);
  out.rules = uniqueBy(out.rules, (x) => x.mst);
  out.adminRules = uniqueBy(out.adminRules, (x) => x.serial);
  out.ordinances = uniqueBy(out.ordinances, (x) => x.serial);
  return out;
}

function fromArticle(block) {
  const raw = field(block, "조문번호").replace(/\s+/g, "");
  const m = raw.match(/^(\d+)(?:의(\d+))?$/);
  if (!m) return null;
  return {
    no: Number(m[1]),
    branch: m[2] ? Number(m[2]) : null,
    label: articleLabel(m[1], m[2] ?? null),
    title: field(block, "조문제목"),
  };
}

function targetArticleLabel(noText, branchText) {
  const no = Number(noText || 0);
  if (!no) return null;
  // 가지번호 "0"은 가지 없음
  const branch = /^\d+$/.test(branchText) && Number(branchText) > 0 ? branchText : null;
  return articleLabel(String(no), branch);
}

function targetArticleFields(t) {
  return {
    targetLabel: targetArticleLabel(field(t, "위임법령조문번호"), field(t, "위임법령조문가지번호")),
    targetTitle: field(t, "위임법령조문제목") || null,
    fromClause: field(t, "조항호목") || null,
    linkText: field(t, "링크텍스트"),
    phrase: field(t, "라인텍스트"),
  };
}

/**
 * <위임구분> 머리글이 없는 <위임법령조문정보>의 종류를 링크텍스트로 추정한다.
 * "대통령령" → 시행령, "…령"(국토교통부령·총리령) → 시행규칙, 「법령명」 → 인용법령.
 * 그 밖("제6항"·"제10조" 같은 조문 내부 참조)은 위임이 아니므로 null.
 */
function inferHeadDelegation(linkText) {
  const t = String(linkText ?? "").trim();
  const cited = t.match(/^「(.+)」$/);
  if (cited) return { kind: "인용법령", targetName: cited[1].trim() };
  if (t === "대통령령") return { kind: "시행령", targetName: null };
  if (/령$/.test(t)) return { kind: "시행규칙", targetName: null };
  return null;
}

/**
 * lsDelegated(위임법령) XML → { law, records, dropped }.
 * records는 (출발 조문 × 도착 하나)로 평탄화한다. 한 <위임정보> 안에 <위임구분>이 여러 번 나올 수 있어
 * 위임구분 단위로 쪼개 읽는다(인용법령이 그렇다). <위임구분> 앞에 머리글 없이 놓인 <위임법령조문정보>는
 * 링크텍스트로 종류를 추정하고(targetSerial·targetName은 null), 조문 내부 참조는 버리고 dropped에 센다.
 */
export function parseLsDelegated(xml) {
  const text = stripOc(xml);
  if (!/<lsDelegated>/.test(text)) throw new Error("lsDelegated 응답이 아닙니다");
  const info = blocks(text, "법령정보")[0] ?? "";
  const law = {
    mst: field(info, "법령일련번호"),
    lawId: field(info, "법령ID"),
    name: field(info, "법령명"),
    ministry: field(info, "소관부처") || null,
  };
  const records = [];
  let dropped = 0;
  for (const block of blocks(text, "위임조문정보")) {
    const from = fromArticle(blocks(block, "조정보")[0] ?? "");
    if (!from) continue;
    for (const wi of blocks(block, "위임정보")) {
      const [head, ...segments] = wi.split(/(?=<위임구분[\s>])/);
      for (const t of blocks(head, "위임법령조문정보")) {
        const inferred = inferHeadDelegation(field(t, "링크텍스트"));
        if (!inferred) { dropped += 1; continue; }
        records.push({ from, kind: inferred.kind, targetSerial: null, targetName: inferred.targetName, ...targetArticleFields(t) });
      }
      for (const seg of segments) {
        const kind = field(seg, "위임구분");
        if (kind === "시행령" || kind === "시행규칙" || kind === "인용법령") {
          const targetSerial = field(seg, "위임법령일련번호");
          const targetName = field(seg, "위임법령제목");
          for (const t of blocks(seg, "위임법령조문정보")) {
            records.push({ from, kind, targetSerial, targetName, ...targetArticleFields(t) });
          }
        } else if (kind === "위임행정규칙" || kind === "위임자치법규") {
          const tag = kind === "위임행정규칙" ? "위임행정규칙" : "위임자치법규";
          for (const t of blocks(seg, `${tag}조문정보`)) {
            records.push({
              from, kind,
              targetSerial: field(t, `${tag}일련번호`),
              targetName: field(t, `${tag}제목`),
              targetLabel: null, targetTitle: null,
              fromClause: field(t, "조항호목") || null,
              linkText: field(t, "링크텍스트"),
              phrase: field(t, "라인텍스트"),
            });
          }
        }
      }
    }
  }
  return { law, records, dropped };
}

/** eflaw JSON → 문서 순서의 조문 목록 [{ no, branch, label, title, chapter, text }] */
export function parseArticleList(payload) {
  const units = payload?.["법령"]?.["조문"]?.["조문단위"];
  const texts = parseLawArticles(payload);
  const list = [];
  const seen = new Set();
  let chapter = null;
  for (const unit of Array.isArray(units) ? units : []) {
    if (unit?.["조문여부"] === "전문") {
      const heading = String(unit["조문내용"] ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (/^제\d+장/.test(heading)) chapter = heading;
      continue;
    }
    if (unit?.["조문여부"] !== "조문") continue;
    const no = unit["조문번호"];
    const branch = unit["조문가지번호"];
    if (!/^\d+$/.test(no ?? "")) continue;
    const hasBranch = /^\d+$/.test(branch ?? "") && Number(branch) > 0; // 가지번호 "0"은 가지 없음
    const label = articleLabel(no, hasBranch ? branch : null);
    if (seen.has(label)) continue;
    seen.add(label);
    const rawTitle = typeof unit["조문제목"] === "string" ? unit["조문제목"].trim() : "";
    const body = String(unit["조문내용"] ?? "").trim();
    const title = rawTitle || (/^제\d+조(의\d+)?\s*삭제/.test(body) ? "삭제" : "");
    list.push({
      no: Number(no),
      branch: hasBranch ? Number(branch) : null,
      label, title, chapter,
      text: texts.get(label)?.text ?? "",
    });
  }
  return list;
}
