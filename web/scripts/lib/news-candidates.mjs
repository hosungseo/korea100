import { XMLParser } from "fast-xml-parser";

const TAG_PATTERN = /<[^>]+>/g;
const WHITESPACE_PATTERN = /\s+/g;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SOURCE_WEIGHT = new Map([
  ["policy_briefing", 4],
  ["naver_news", 2],
]);

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function cleanText(value) {
  return String(value ?? "")
    .replace(TAG_PATTERN, "")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
}

function compact(value) {
  return cleanText(value)
    .replace(/[「」『』“”‘’"'·ㆍ()[\]{}<>,.?!:;|/\\_-]/g, "")
    .replace(WHITESPACE_PATTERN, "")
    .toLowerCase();
}

function parseRfcDate(value) {
  const time = Date.parse(value ?? "");
  if (Number.isNaN(time)) return null;
  return localDateString(new Date(time), "Asia/Seoul");
}

function parsePolicyDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value ?? "");
  if (!match) return null;
  return `${match[3]}-${match[1]}-${match[2]}`;
}

export function apiDateWindow(value) {
  if (!DATE_PATTERN.test(value)) throw new Error(`Invalid date: ${value}`);
  const [year, month, day] = value.split("-").map(Number);
  const end = new Date(year, month - 1, day);
  const start = new Date(end);
  start.setDate(end.getDate() - 2);
  return [yyyymmdd(start), yyyymmdd(end)];
}

function yyyymmdd(date) {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
}

function localDateString(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseNaverResponse(payload, query) {
  return asArray(payload.items).map((entry) => ({
    title: cleanText(entry.title),
    body: cleanText(entry.description),
    url: entry.originallink || entry.link || "",
    sourceName: "네이버뉴스검색",
    sourceType: "naver_news",
    publishedAt: parseRfcDate(entry.pubDate),
    query,
  }));
}

const policyParser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  cdataPropName: false,
});

export function parsePolicyBriefingXml(xmlText, query) {
  const parsed = policyParser.parse(xmlText);
  const response = parsed.response ?? {};
  const resultCode = String(response.header?.resultCode ?? "");
  if (resultCode !== "0") {
    const resultMsg = response.header?.resultMsg ?? "UNKNOWN";
    throw new Error(`Policy Briefing API failed: ${resultCode} ${resultMsg}`);
  }
  return asArray(response.body?.NewsItem).map((entry) => ({
    title: cleanText(entry.Title),
    body: [entry.SubTitle1, entry.SubTitle2, entry.SubTitle3, entry.DataContents]
      .map(cleanText)
      .filter(Boolean)
      .join("\n"),
    url: entry.OriginalUrl || "",
    sourceName: "정책브리핑",
    sourceType: "policy_briefing",
    publishedAt: parsePolicyDate(entry.ApproveDate),
    query,
  }));
}

export function existingMatchers(manifest) {
  return manifest.map((entry) => ({
    name: entry.name,
    slug: entry.slug,
    compactName: compact(entry.name),
  }));
}

function matchedWords(text, words) {
  return words.filter((word) => text.includes(word));
}

function existingMatches(text, matchers) {
  return matchers
    .filter((entry) => entry.compactName && text.includes(entry.compactName))
    .map(({ name, slug }) => ({ name, slug }));
}

export function scoreCandidate(item, config, matchers) {
  const text = `${item.title} ${item.body}`;
  const compacted = compact(text);
  const institutionSignals = matchedWords(text, config.signals.institution);
  const processSignals = matchedWords(text, config.signals.process);
  const noveltySignals = matchedWords(text, config.signals.novelty);
  const noiseSignals = matchedWords(text, config.noise ?? []);
  const matches = existingMatches(compacted, matchers);
  const score =
    (SOURCE_WEIGHT.get(item.sourceType) ?? 1) +
    institutionSignals.length * 2 +
    processSignals.length * 2 +
    noveltySignals.length * 3 -
    matches.length * 5 -
    noiseSignals.length * 20;

  return {
    ...item,
    score,
    signals: {
      institution: institutionSignals,
      process: processSignals,
      novelty: noveltySignals,
      noise: noiseSignals,
    },
    existingMatches: matches,
  };
}

export function rankCandidates(items, config, manifest, limit = 30) {
  const seen = new Set();
  const matchers = existingMatchers(manifest);
  const candidates = [];
  for (const item of items) {
    const identity = item.url || compact(item.title);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    const candidate = scoreCandidate(item, config, matchers);
    if (candidate.score > 0) candidates.push(candidate);
  }
  candidates.sort((a, b) => b.score - a.score || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return candidates.slice(0, limit);
}

export function markdownReport(result) {
  const lines = [
    "# Korea100 뉴스 후보",
    "",
    `- 생성시각: ${result.generatedAt}`,
    `- 조회일: ${result.runDate}`,
    `- 원천: 네이버뉴스 ${result.sourceCounts.naver_news ?? 0}건, 정책브리핑 ${result.sourceCounts.policy_briefing ?? 0}건`,
    `- 후보: ${result.candidates.length}건`,
    "",
  ];
  for (const [index, candidate] of result.candidates.entries()) {
    const signals = [
      ...candidate.signals.institution,
      ...candidate.signals.process,
      ...candidate.signals.novelty,
    ].join(", ");
    lines.push(
      `## ${index + 1}. ${candidate.title}`,
      "",
      `- 점수: ${candidate.score}`,
      `- 출처: ${candidate.sourceName} / ${candidate.publishedAt ?? "날짜 없음"}`,
      `- 신호: ${signals || "없음"}`,
      `- 기존 제도 매칭: ${candidate.existingMatches.map((entry) => entry.name).join(", ") || "없음"}`,
      `- URL: ${candidate.url}`,
      "",
    );
  }
  return `${lines.join("\n").trim()}\n`;
}
