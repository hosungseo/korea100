import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  maskCrossLawReferences,
  parseArticleHeaders,
  parseArticleReferences,
} from "./lib/article-citations.mjs";
import { fetchAdminRuleArticleHeaders } from "./lib/admin-rule-service.mjs";
import { fetchLawArticleHeaders } from "./lib/law-service.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const REPORT_PATH = path.join(REPO_DIR, "docs", "article-verification-coverage.json");

const WRITE = process.argv.includes("--write");
const CONCURRENCY = Number(process.env.ARTICLE_VERIFY_CONCURRENCY ?? 6);
const VERIFIED_AT = process.env.ARTICLE_VERIFY_DATE ?? localDate("Asia/Seoul");
const CLI = process.env.KOREAN_LAW_CLI ?? "korean-law";
const ARTICLE_BATCH_SIZE = 40;

if (!process.env.LAW_OC?.trim()) {
  throw new Error("LAW_OC 환경변수가 없어 조문 검증을 중단합니다. 기존 검증 파일은 변경하지 않았습니다.");
}

const LAW_ALIASES = new Map(
  [
    ["하도급법", "하도급거래 공정화에 관한 법률"],
    ["공정거래법", "독점규제 및 공정거래에 관한 법률"],
    ["배출권거래법", "온실가스 배출권의 할당 및 거래에 관한 법률"],
    ["배출권거래법 시행령", "온실가스 배출권의 할당 및 거래에 관한 법률 시행령"],
    ["인공지능 기본법", "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법"],
    ["인공지능 기본법 시행령", "인공지능 발전과 신뢰 기반 조성 등에 관한 기본법 시행령"],
    ["112신고의 운영 및 처리 등에 관한 법률", "112신고의 운영 및 처리에 관한 법률"],
    ["법률구조법 시행령·공단 내부규정", "법률구조법 시행령"],
  ].map(([alias, official]) => [compactLawName(alias), official]),
);

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

function compactLawName(value) {
  return (value ?? "")
    .replace(/\s+/g, "")
    .replace(/[「」『』“”‘’·ㆍ]/g, "")
    .trim();
}

function sourceKey(source) {
  const sourceType = source.sourceType ?? "statute";
  if (sourceType === "statute") return `statute:${source.mst}`;
  if (sourceType === "admin-rule") return `admin-rule:${source.adminRuleSerial}`;
  return `${sourceType}:${source.treatyId ?? source.law}`;
}

function sourceIndex(sources) {
  const index = new Map();
  for (const source of sources) {
    index.set(compactLawName(source.law), source);
    if (source.officialName) index.set(compactLawName(source.officialName), source);
  }
  return index;
}

function resolveSource(law, index) {
  const direct = index.get(compactLawName(law));
  if (direct) return direct;
  const alias = LAW_ALIASES.get(compactLawName(law));
  return alias ? index.get(compactLawName(alias)) ?? null : null;
}

function splitCitation(law, articleText) {
  if (compactLawName(law) !== compactLawName("근로기준법·노동조합 및 노동관계조정법")) {
    return [{ law, articleText }];
  }

  const markers = [...articleText.matchAll(/(근기법|노조법)\s*/g)];
  if (markers.length === 0) return [{ law, articleText }];
  return markers.map((marker, index) => ({
    law: marker[1] === "근기법" ? "근로기준법" : "노동조합 및 노동관계조정법",
    articleText: articleText
      .slice(marker.index + marker[0].length, markers[index + 1]?.index ?? articleText.length)
      .replace(/^[\s·,;]+|[\s·,;]+$/g, ""),
  }));
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function runCli(args) {
  try {
    const { stdout } = await execFileAsync(CLI, args, {
      env: process.env,
      maxBuffer: 24 * 1024 * 1024,
      timeout: 60_000,
    });
    return { ok: true, output: stdout };
  } catch (error) {
    const output = [error.stdout, error.stderr].filter((value) => typeof value === "string").join("\n");
    return { ok: false, output };
  }
}

function lookupFailed(result) {
  return (
    !result.ok ||
    /^\[(?:ERROR|NOT_FOUND)\]/m.test(result.output) ||
    /전문을 조회할 수 없습니다|법령 데이터를 찾을 수 없습니다/.test(result.output)
  );
}

async function verifyGroup(group) {
  const statuses = new Map();
  const requested = [...group.articles];
  const sourceType = group.source.sourceType ?? "statute";

  if (sourceType === "statute") {
    let found;
    let lookupError = null;
    try {
      found = await fetchLawArticleHeaders(group.source.mst, {
        oc: process.env.LAW_OC,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      lookupError = error;
      found = new Set();
      for (const batch of chunks(requested, ARTICLE_BATCH_SIZE)) {
        const result = await runCli([
          "get_batch_articles",
          "--mst",
          group.source.mst,
          "--articles",
          JSON.stringify(batch),
        ]);
        for (const article of parseArticleHeaders(result.output)) found.add(article);
        if (!lookupFailed(result) && found.size > 0) lookupError = null;
      }
    }
    for (const article of requested) {
      statuses.set(
        article,
        lookupError && found.size === 0
          ? { status: "uncheckable", reason: "법령 조문 API 조회 실패" }
          : found.has(article)
            ? { status: "verified" }
            : { status: "missing", reason: "현행 원문에서 조문 번호를 찾지 못함" },
      );
    }
    return statuses;
  }

  if (sourceType === "admin-rule") {
    let found;
    let lookupError = null;
    try {
      found = await fetchAdminRuleArticleHeaders(group.source.adminRuleSerial, {
        oc: process.env.LAW_OC,
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      lookupError = error;
      const result = await runCli(["get_admin_rule", "--id", group.source.adminRuleSerial]);
      found = parseArticleHeaders(result.output);
      if (!lookupFailed(result) && found.size > 0) lookupError = null;
    }
    for (const article of requested) {
      statuses.set(
        article,
        lookupError && found.size === 0
          ? { status: "uncheckable", reason: "행정규칙 전문 API 미지원 또는 조회 실패" }
          : found.has(article)
            ? { status: "verified" }
            : { status: "missing", reason: "현행 행정규칙에서 조문 번호를 찾지 못함" },
      );
    }
    return statuses;
  }

  for (const article of requested) {
    statuses.set(article, { status: "uncheckable", reason: "조약 조문 자동 검증은 지원하지 않음" });
  }
  return statuses;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function issueSummary(occurrences) {
  const summaries = new Map();
  for (const occurrence of occurrences.filter((item) => item.result.status !== "verified")) {
    const key = [occurrence.result.status, occurrence.law, occurrence.article, occurrence.result.reason].join("\u0000");
    const summary = summaries.get(key) ?? {
      status: occurrence.result.status,
      law: occurrence.law,
      article: occurrence.article,
      reason: occurrence.result.reason,
      occurrences: 0,
      locations: [],
    };
    summary.occurrences += 1;
    summary.locations.push({
      slug: occurrence.slug,
      context: occurrence.context,
      ...(occurrence.nodeId ? { nodeId: occurrence.nodeId } : {}),
      articleText: occurrence.articleText,
    });
    summaries.set(key, summary);
  }
  return [...summaries.values()].sort(
    (a, b) => a.status.localeCompare(b.status) || a.law.localeCompare(b.law, "ko") || a.article.localeCompare(b.article, "ko"),
  );
}

const files = fs.readdirSync(DATA_DIR).filter((file) => file.endsWith(".json")).sort();
const institutions = files.map((file) => ({
  file,
  data: JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")),
}));

const occurrences = [];
const groups = new Map();
const institutionEntryCounts = new Map();

function collectCitation(institution, index, citation) {
  const split = splitCitation(citation.law, citation.articleText);
  for (const segment of split) {
    const articles = parseArticleReferences(segment.articleText);
    if (articles.length === 0) continue;
    const source = resolveSource(segment.law, index);
    for (const article of articles) {
      const occurrence = {
        slug: institution.slug,
        institutionName: institution.name,
        priority: institution.priority,
        context: citation.context,
        nodeId: citation.nodeId,
        law: segment.law,
        articleText: segment.articleText,
        article,
        source,
      };
      occurrences.push(occurrence);

      if (!source) continue;
      const key = sourceKey(source);
      const group = groups.get(key) ?? { key, source, articles: new Set() };
      group.articles.add(article);
      groups.set(key, group);
      occurrence.checkKey = `${key}\u0000${article}`;
    }
  }
}

for (const { data: institution } of institutions) {
  const index = sourceIndex(institution.verification.sources);
  let citationEntries = 0;
  let explicitCitationEntries = 0;

  for (const basis of institution.canvas.legalBasis) {
    citationEntries += 1;
    const articleText = maskCrossLawReferences(basis.articles ?? "");
    if (parseArticleReferences(articleText).length > 0) explicitCitationEntries += 1;
    collectCitation(institution, index, {
      context: "canvas",
      law: basis.law,
      articleText,
    });
  }

  for (const node of institution.process.nodes) {
    for (const basis of node.legal_basis ?? []) {
      citationEntries += 1;
      if (parseArticleReferences(basis.article).length > 0) explicitCitationEntries += 1;
      collectCitation(institution, index, {
        context: "process",
        nodeId: node.id,
        law: basis.law,
        articleText: basis.article,
      });
    }
  }

  institutionEntryCounts.set(institution.slug, { citationEntries, explicitCitationEntries });
}

const groupEntries = [...groups.values()];
const groupResults = await mapLimit(groupEntries, CONCURRENCY, async (group, index) => {
  const result = await verifyGroup(group);
  process.stderr.write(`\r조문 원문 대조 ${index + 1}/${groupEntries.length}`);
  return [group.key, result];
});
process.stderr.write("\n");

const checks = new Map();
for (const [groupKey, statuses] of groupResults) {
  for (const [article, result] of statuses) checks.set(`${groupKey}\u0000${article}`, result);
}

for (const occurrence of occurrences) {
  occurrence.result = occurrence.source
    ? checks.get(occurrence.checkKey) ?? { status: "uncheckable", reason: "조문 검증 결과 없음" }
    : { status: "uncheckable", reason: "제도별 공식 출처 목록에서 법령을 찾지 못함" };
}

const coverage = [];
for (const { file, data: institution } of institutions) {
  const institutionOccurrences = occurrences.filter((item) => item.slug === institution.slug);
  const entryCounts = institutionEntryCounts.get(institution.slug);
  const verifiedReferences = institutionOccurrences.filter((item) => item.result.status === "verified").length;
  const missingReferences = institutionOccurrences.filter((item) => item.result.status === "missing").length;
  const uncheckableReferences = institutionOccurrences.filter((item) => item.result.status === "uncheckable").length;
  const sourceUnresolved = institution.verification.unresolved?.length ?? 0;
  const legalBasisCount = institution.canvas.legalBasis.length;
  const sourceLinked = legalBasisCount - sourceUnresolved;
  const status =
    sourceUnresolved === 0 && missingReferences === 0 && uncheckableReferences === 0
      ? "article-verified"
      : "needs-review";

  institution.verification.status = status;
  institution.verification.verifiedAt = VERIFIED_AT;
  institution.verification.method = "국가법령정보센터 Open API (Korean Law MCP CLI) 출처·조문 대조";
  institution.verification.scope =
    `법적 근거 ${legalBasisCount}건 중 공식 원문 ${sourceLinked}건을 연결했다. ` +
    `캔버스와 절차 노드의 명시 조문 ${institutionOccurrences.length}건 가운데 ${verifiedReferences}건의 조문 번호 존재를 확인했고, ` +
    `${missingReferences}건은 불일치, ${uncheckableReferences}건은 자동 검증 불가로 분류했다. 인용 문구의 해석·적용 타당성은 검증 범위에 포함하지 않는다.`;
  institution.verification.articleVerification = {
    checkedAt: VERIFIED_AT,
    method: "현행 법령 조문 일괄조회 및 행정규칙 전문조회",
    citationEntries: entryCounts.citationEntries,
    explicitCitationEntries: entryCounts.explicitCitationEntries,
    articleReferences: institutionOccurrences.length,
    verifiedReferences,
    missingReferences,
    uncheckableReferences,
  };

  coverage.push({
    priority: institution.priority,
    slug: institution.slug,
    name: institution.name,
    status,
    sourceUnresolved,
    unresolvedReasonCodes: [
      ...new Set((institution.verification.unresolved ?? []).map((item) => item.reasonCode)),
    ],
    ...institution.verification.articleVerification,
  });

  if (WRITE) {
    fs.writeFileSync(path.join(DATA_DIR, file), `${JSON.stringify(institution, null, 1)}\n`);
  }
}

const report = {
  generatedAt: VERIFIED_AT,
  institutions: institutions.length,
  articleVerified: coverage.filter((item) => item.status === "article-verified").length,
  needsReview: coverage.filter((item) => item.status === "needs-review").length,
  citationEntries: coverage.reduce((sum, item) => sum + item.citationEntries, 0),
  explicitCitationEntries: coverage.reduce((sum, item) => sum + item.explicitCitationEntries, 0),
  articleReferences: occurrences.length,
  verifiedReferences: occurrences.filter((item) => item.result.status === "verified").length,
  missingReferences: occurrences.filter((item) => item.result.status === "missing").length,
  uncheckableReferences: occurrences.filter((item) => item.result.status === "uncheckable").length,
  unresolvedSources: coverage.reduce((sum, item) => sum + item.sourceUnresolved, 0),
  unresolvedByReason: Object.fromEntries(
    [
      "local-scope",
      "institution-scope",
      "internal-rule",
      "external-official-document",
      "title-needs-confirmation",
    ].map((reasonCode) => [
      reasonCode,
      institutions.reduce(
        (sum, { data }) =>
          sum + (data.verification.unresolved ?? []).filter((item) => item.reasonCode === reasonCode).length,
        0,
      ),
    ]),
  ),
  checkedSources: groupEntries.length,
  checkedUniqueArticles: groupEntries.reduce((sum, group) => sum + group.articles.size, 0),
  issues: issueSummary(occurrences),
  coverage: coverage.sort((a, b) => a.priority - b.priority),
};

if (WRITE) fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ write: WRITE, ...report, issues: report.issues.length }, null, 2));
