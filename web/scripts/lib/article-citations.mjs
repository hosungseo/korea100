export function articleLabel(article, branch) {
  return `제${Number(article)}조${branch ? `의${Number(branch)}` : ""}`;
}

function overlaps(ranges, start, end) {
  return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart);
}

function pushUnique(target, seen, value) {
  if (seen.has(value)) return;
  seen.add(value);
  target.push(value);
}

export function parseArticleReferences(value) {
  if (typeof value !== "string" || !value.trim()) return [];

  const text = value.replace(/[∼～〜–—]/g, "~");
  const references = [];
  const seen = new Set();
  const consumedRanges = [];
  const rangePattern = /제\s*(\d+)\s*(?:조(?:\s*의\s*(\d+))?)?\s*[~-]\s*(?:제\s*)?(\d+)\s*조(?:\s*의\s*(\d+))?/g;

  for (const match of text.matchAll(rangePattern)) {
    const startArticle = Number(match[1]);
    const startBranch = match[2] ? Number(match[2]) : null;
    const endArticle = Number(match[3]);
    const endBranch = match[4] ? Number(match[4]) : null;
    consumedRanges.push([match.index, match.index + match[0].length]);

    if (
      startArticle === endArticle &&
      startBranch !== null &&
      endBranch !== null &&
      endBranch >= startBranch &&
      endBranch - startBranch <= 100
    ) {
      for (let branch = startBranch; branch <= endBranch; branch += 1) {
        pushUnique(references, seen, articleLabel(startArticle, branch));
      }
      continue;
    }

    if (
      startBranch === null &&
      endBranch === null &&
      endArticle >= startArticle &&
      endArticle - startArticle <= 200
    ) {
      for (let article = startArticle; article <= endArticle; article += 1) {
        pushUnique(references, seen, articleLabel(article));
      }
      continue;
    }

    pushUnique(references, seen, articleLabel(startArticle, startBranch));
    pushUnique(references, seen, articleLabel(endArticle, endBranch));
  }

  const singlePattern = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g;
  for (const match of text.matchAll(singlePattern)) {
    if (overlaps(consumedRanges, match.index, match.index + match[0].length)) continue;
    pushUnique(references, seen, articleLabel(match[1], match[2]));
  }

  return references;
}

export function parseArticleHeaders(value) {
  if (typeof value !== "string") return new Set();
  const references = new Set();
  const pattern = /^제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?=\s|\(|$)/gm;
  for (const match of value.matchAll(pattern)) {
    references.add(articleLabel(match[1], match[2]));
  }
  return references;
}

export function maskCrossLawReferences(value) {
  if (typeof value !== "string") return "";
  const article = String.raw`제\s*\d+\s*조(?:\s*의\s*\d+)?(?:\s*제\s*\d+\s*(?:항|호|목))*`;
  const chain = String.raw`${article}(?:\s*[·,]\s*${article})*`;
  const prefix = String.raw`(?:[가-힣A-Za-z0-9·ㆍ]+(?:법률|법)|설치법|산안법|근기법|노조법|시행령|시행규칙|통칙|영|법)`;
  return value.replace(new RegExp(`${prefix}\\s+${chain}`, "g"), "");
}
