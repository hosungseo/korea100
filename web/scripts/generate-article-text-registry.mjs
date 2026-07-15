import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArticleCitationDetails } from "./lib/article-citations.mjs";
import { fetchAdminRuleArticles } from "./lib/admin-rule-service.mjs";
import { fetchLawArticles } from "./lib/law-service.mjs";
import { findLegalSources, legalSourceKey } from "./lib/legal-source-resolution.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const REGISTRY_PATH = path.join(WEB_DIR, "data", "article-text-registry.json");
const WRITE = process.argv.includes("--write");
const REFRESH = process.argv.includes("--refresh");
const ONLY_INDEX = process.argv.indexOf("--only");
const ONLY = ONLY_INDEX >= 0 ? process.argv[ONLY_INDEX + 1] : null;
const CONCURRENCY = Number(process.env.ARTICLE_TEXT_CONCURRENCY ?? 4);
const CHECKED_AT = process.env.ARTICLE_TEXT_DATE ?? localDate("Asia/Seoul");

if (!process.env.LAW_OC?.trim()) {
  throw new Error("LAW_OC 환경변수가 없어 조문 원문 생성을 중단합니다.");
}
if (ONLY_INDEX >= 0 && !ONLY) throw new Error("--only 뒤에 제도 slug가 필요합니다.");

function localDate(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return { version: 1, generatedAt: CHECKED_AT, articles: {}, institutions: {} };
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
}

function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker)).then(() => results);
}

async function retry(task, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

async function fetchSourceArticles(source) {
  const type = source.sourceType ?? "statute";
  if (type === "statute") {
    return fetchLawArticles(source.mst, {
      oc: process.env.LAW_OC,
      signal: AbortSignal.timeout(90_000),
    });
  }
  if (type === "admin-rule") {
    return fetchAdminRuleArticles(source.adminRuleSerial, {
      oc: process.env.LAW_OC,
      signal: AbortSignal.timeout(90_000),
    });
  }
  throw new Error("조약 원문 자동 수집은 지원하지 않습니다.");
}

const fileNames = fs.readdirSync(DATA_DIR)
  .filter((file) => file.endsWith(".json") && (!ONLY || file === `${ONLY}.json`))
  .sort();
if (fileNames.length === 0) throw new Error(ONLY ? `제도 파일을 찾을 수 없습니다: ${ONLY}` : "제도 파일이 없습니다.");

const institutions = fileNames.map((file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")));
const groups = new Map();
const associations = new Map();

for (const institution of institutions) {
  const sourceList = institution.verification?.sources ?? [];
  const institutionAssociations = {};
  for (const node of institution.process?.nodes ?? []) {
    for (const [basisIndex, basis] of (node.legal_basis ?? []).entries()) {
      const details = parseArticleCitationDetails(basis.article);
      const sources = findLegalSources(basis.law, sourceList);
      const basisKey = `${node.id}:${basisIndex}`;
      const refs = [];
      for (const source of sources) {
        const sourceId = legalSourceKey(source);
        if (!sourceId) continue;
        const group = groups.get(sourceId) ?? { source, articles: new Set() };
        for (const detail of details) {
          group.articles.add(detail.article);
          refs.push({ key: `${sourceId}::${detail.article}`, ...detail });
        }
        groups.set(sourceId, group);
      }
      if (refs.length > 0) institutionAssociations[basisKey] = refs;
    }
  }
  associations.set(institution.slug, institutionAssociations);
}

const registry = loadRegistry();
const articles = { ...(registry.articles ?? {}) };
const groupEntries = [...groups.entries()];
const groupsToFetch = groupEntries.filter(([sourceId, group]) =>
  REFRESH || [...group.articles].some((article) => !articles[`${sourceId}::${article}`]),
);
const failures = [];

await mapLimit(groupsToFetch, CONCURRENCY, async ([sourceId, group], index) => {
  try {
    const found = await retry(() => fetchSourceArticles(group.source));
    for (const article of group.articles) {
      const key = `${sourceId}::${article}`;
      const entry = found.get(article);
      if (entry) articles[key] = { ...entry, checkedAt: CHECKED_AT };
      else if (REFRESH) delete articles[key];
    }
  } catch (error) {
    failures.push({ source: group.source.law, sourceId, reason: error instanceof Error ? error.message : String(error) });
  }
  process.stderr.write(`\r조문 원문 수집 ${index + 1}/${groupsToFetch.length}`);
});
if (groupsToFetch.length > 0) process.stderr.write("\n");

const nextInstitutionMap = ONLY ? { ...(registry.institutions ?? {}) } : {};
const requiredArticleKeys = new Set();
let mappedReferences = 0;
let missingReferences = 0;
for (const institution of institutions) {
  const mapped = {};
  for (const [basisKey, refs] of Object.entries(associations.get(institution.slug) ?? {})) {
    const available = [];
    const seen = new Set();
    for (const ref of refs) {
      requiredArticleKeys.add(ref.key);
      const signature = `${ref.key}:${ref.paragraph ?? ""}:${ref.item ?? ""}:${ref.subitem ?? ""}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      if (articles[ref.key]) {
        available.push(ref);
        mappedReferences += 1;
      } else {
        missingReferences += 1;
      }
    }
    if (available.length > 0) mapped[basisKey] = available;
  }
  nextInstitutionMap[institution.slug] = mapped;
}

if (!ONLY) {
  for (const key of Object.keys(articles)) {
    if (!requiredArticleKeys.has(key)) delete articles[key];
  }
}

const output = {
  version: 1,
  generatedAt: CHECKED_AT,
  articles: Object.fromEntries(Object.entries(articles).sort(([left], [right]) => left.localeCompare(right, "ko"))),
  institutions: Object.fromEntries(Object.entries(nextInstitutionMap).sort(([left], [right]) => left.localeCompare(right))),
  stats: {
    institutions: Object.keys(nextInstitutionMap).length,
    sourceGroups: groups.size,
    fetchedSourceGroups: groupsToFetch.length,
    storedArticles: Object.keys(articles).length,
    mappedReferences,
    missingReferences,
    failedSources: failures.length,
  },
};

if (WRITE) fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ write: WRITE, ...output.stats, failures: failures.slice(0, 20) }, null, 2));
