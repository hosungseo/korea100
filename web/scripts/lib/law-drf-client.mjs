/**
 * 법제처 DRF client using LAW_GO_KR_OC. Never logs OC value.
 */
import { lawSearchUrl, lawServiceUrl, resolveLawGoKrOc } from "./law-go-kr-oc.mjs";

function stripNs(xml) {
  return String(xml).replace(/\sxmlns="[^"]+"/g, "");
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 Korea100Pipeline/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function textOf(el, tag) {
  if (!el) return "";
  const node = el.getElementsByTagName?.(tag)?.[0] || el.querySelector?.(tag);
  // DOMParser path not available in pure node without linkedom; use regex fallback below
  return "";
}

export async function searchLaws(query, { limit = 5 } = {}) {
  resolveLawGoKrOc(); // fail fast if missing
  const xml = stripNs(await fetchText(lawSearchUrl(query, { type: "XML" })));
  const total = Number((xml.match(/<totalCnt>(\d+)<\/totalCnt>/) || [])[1] || 0);
  const laws = [];
  const blocks = xml.match(/<law\b[^>]*>[\s\S]*?<\/law>/g) || [];
  for (const block of blocks) {
    if (laws.length >= limit) break;
    const mst = (block.match(/<법령일련번호>(\d+)<\/법령일련번호>/) || [])[1];
    const nameRaw =
      (block.match(/<법령명한글><!\[CDATA\[([\s\S]*?)\]\]><\/법령명한글>/) || [])[1] ||
      (block.match(/<법령명한글>([^<]*)<\/법령명한글>/) || [])[1] ||
      "";
    const lawId = (block.match(/<법령ID>([^<]*)<\/법령ID>/) || [])[1] || null;
    const effectiveOn = (block.match(/<시행일자>([^<]*)<\/시행일자>/) || [])[1] || null;
    const promulgatedOn = (block.match(/<공포일자>([^<]*)<\/공포일자>/) || [])[1] || null;
    const kind = (block.match(/<법령구분명>([^<]*)<\/법령구분명>/) || [])[1] || null;
    if (!mst || !nameRaw) continue;
    laws.push({
      mst,
      name: nameRaw.trim(),
      lawId,
      effectiveOn,
      promulgatedOn,
      kind,
    });
  }
  return { total, laws, rawBytes: xml.length };
}

export async function fetchLawArticles(mst) {
  resolveLawGoKrOc();
  const xml = stripNs(await fetchText(lawServiceUrl(mst, { type: "XML" })));
  const basic = {};
  for (const tag of ["법령명_한글", "법령명한글", "법령ID", "공포일자", "시행일자", "법종구분", "소관부처"]) {
    const mm = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    if (mm) basic[tag] = mm[1];
  }
  const name = basic["법령명_한글"] || basic["법령명한글"] || null;
  const articles = {};
  const unwrap = (raw) => {
    if (!raw) return "";
    let s = raw;
    const cd = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (cd) s = cd[1];
    return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  };
  const unitRe = /<조문단위(?:\s[^>]*)?>[\s\S]*?<\/조문단위>/g;
  let um;
  while ((um = unitRe.exec(xml))) {
    const block = um[0];
    if (!/<조문여부>조문<\/조문여부>/.test(block)) continue;
    const num = (block.match(/<조문번호>([^<]*)<\/조문번호>/) || [])[1];
    const branch = (block.match(/<조문가지번호>([^<]*)<\/조문가지번호>/) || [])[1] || "";
    const title = unwrap(
      (block.match(/<조문제목>([\s\S]*?)<\/조문제목>/) || [])[1] || "",
    );
    if (!num) continue;
    const parts = [];
    const c = block.match(/<조문내용>([\s\S]*?)<\/조문내용>/);
    if (c) parts.push(unwrap(c[1]));
    const hangRe = /<항(?:\s[^>]*)?>[\s\S]*?<\/항>/g;
    let hm;
    while ((hm = hangRe.exec(block))) {
      const ht = hm[0].match(/<항내용>([\s\S]*?)<\/항내용>/);
      if (ht) parts.push(unwrap(ht[1]));
      const hoRe = /<호(?:\s[^>]*)?>[\s\S]*?<\/호>/g;
      let ho;
      while ((ho = hoRe.exec(hm[0]))) {
        const hot = ho[0].match(/<호내용>([\s\S]*?)<\/호내용>/);
        if (hot) parts.push(unwrap(hot[1]));
      }
    }
    const full = parts.filter(Boolean).join(" ").trim();
    if (!full) continue;
    const label = branch && /^\d+$/.test(branch) ? `제${num}조의${branch}` : `제${num}조`;
    articles[label] = {
      label: title ? `${label}(${title})` : label,
      title,
      text: full.slice(0, 900),
    };
  }
  return {
    mst: String(mst),
    basic: {
      ...basic,
      법령명_한글: name,
    },
    articles,
    articleCount: Object.keys(articles).length,
  };
}

export function ymd(value) {
  const s = String(value || "");
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s || null;
}

export function pickBestLawMatch(query, laws) {
  if (!laws?.length) return null;
  const q = String(query || "").replace(/\s+/g, "");
  const scored = laws.map((law) => {
    const n = String(law.name || "").replace(/\s+/g, "");
    let score = 0;
    if (n === q) score += 100;
    if (n.includes(q) || q.includes(n)) score += 50;
    if (/법률$/.test(n)) score += 10;
    if (/시행령|시행규칙|고시|훈령|예규|지침/.test(n)) score -= 20;
    return { law, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].law : laws[0];
}
