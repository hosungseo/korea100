/**
 * Cron-safe institution candidate extractor from news feed.
 * Briefings are signals; output is named 제도 candidates with basis hints.
 * No external LLM required.
 */
const REJECT_TITLE = [
  /국회\s*통과/,
  /법안\s*\d+\s*개/,
  /후속법안/,
  /본회의\s*통과/,
  /여행경비|반값\s*여행/,
  /상품권/,
  /펀드.{0,12}투자/,
  /\d+조\s*투입/,
  /사실은\s*이렇습니다/,
  /민생이 경제/,
  /대책 발표/,
];

const PROCEDURE = /신청|청구|접수|심사|심의|인가|허가|승인|신고|지정|인증|평가|지침|절차|패스트트랙|신속심사|센터|차단|삭제|보상|면책|적발|자격/;

const LAW_HINT =
  /([가-힣A-Za-z0-9ㆍ·\s]{2,40}?(?:특별법|기본법|촉진법|지원법|관리법|사업법|공사법|특례법|법률|법))/g;

export function extractInstitutionCandidatesFromFeed(feed, { existingNames = [], queueNames = [] } = {}) {
  const existing = new Set([...(existingNames || []), ...(queueNames || [])].map((n) => String(n).trim()));
  const out = [];
  const seen = new Set();

  for (const item of feed || []) {
    const title = String(item.title || "").replace(/\[[^\]]*]/g, "").trim();
    const body = String(item.body || "").replace(/\s+/g, " ").trim();
    const text = `${title} ${body}`;
    if (!title) continue;
    if (REJECT_TITLE.some((re) => re.test(title) || re.test(text))) continue;
    if (!PROCEDURE.test(title)) continue;

    // Derive a compact institution-like name from title
    let name = title
      .replace(/….*$/, "")
      .replace(/["“”']/g, "")
      .replace(/\s+/g, " ")
      .trim();
    // Prefer clause before punctuation that looks like institution
    const cut = name.split(/[,，·|]/)[0].trim();
    if (cut.length >= 6 && cut.length <= 40) name = cut;
    if (name.length < 6 || name.length > 40) continue;
    if (/[…]|,|，|위해|까지|합니다|습니다/.test(name)) continue;
    if (existing.has(name) || seen.has(name)) continue;

    const laws = [];
    let m;
    // Prefer title-only law hints to avoid body false positives (e.g. 저작권법 boilerplate).
    const lawRe = new RegExp(LAW_HINT);
    while ((m = lawRe.exec(title)) && laws.length < 3) {
      const law = m[1].replace(/\s+/g, " ").trim();
      if (law.length >= 6 && /법$/.test(law) && !laws.includes(law)) laws.push(law);
    }
    const basis = laws[0] || "확인 필요";
    // ministry rough guess
    let ministry = "?";
    if (/주택|부동산|PF|건설/.test(text)) ministry = "국토교통부";
    else if (/전기|에너지|분산|요금/.test(text)) ministry = "기후에너지환경부";
    else if (/통신|방송|촬영|디지털/.test(text)) ministry = "방송미디어통신위원회";
    else if (/해양|수난|구조/.test(text)) ministry = "해양경찰청";
    else if (/농|직불|수산/.test(text)) ministry = "농림축산식품부";
    else if (/금융|모기지|보금자리/.test(text)) ministry = "금융위원회";
    else if (/산업|위기지역/.test(text)) ministry = "산업통상자원부";
    else if (/규제|행정/.test(text)) ministry = "국무조정실";

    const score =
      (PROCEDURE.test(title) ? 3 : 0) +
      (laws.length ? 4 : 0) +
      (/신설|제정|도입|마련/.test(title) ? 2 : 0) +
      (item.score || 0);

    out.push({
      name,
      basis,
      ministry,
      why: body.slice(0, 120) || title,
      status: "proposed",
      source: "news-deterministic",
      score,
      articles: [
        {
          title: item.title,
          url: item.url,
          publishedAt: item.publishedAt,
          sourceName: item.sourceName,
        },
      ],
    });
    seen.add(name);
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}
