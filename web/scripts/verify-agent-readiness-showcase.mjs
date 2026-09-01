import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArticleReferences } from "./lib/article-citations.mjs";
import { fetchCurrentAdminRuleArticleSnapshot } from "./lib/admin-rule-service.mjs";
import {
  agentCitationFingerprint,
  assessAgentReadiness,
  OFFICIAL_LAW_API_METHOD,
  referenceOnlyReasons,
} from "./lib/agent-readiness.mjs";
import { fetchCurrentLawArticleSnapshot } from "./lib/law-service.mjs";
import {
  SHOWCASE_INSTITUTIONS,
  writeShowcaseReport,
} from "./generate-agent-readiness-showcase.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const CHECKED_AT = process.env.AGENT_VERIFY_DATE ?? localDate("Asia/Seoul");
const CONCURRENCY = Math.max(1, Number(process.env.AGENT_VERIFY_CONCURRENCY ?? 4) || 4);

if (!process.env.LAW_OC?.trim()) {
  throw new Error("LAW_OC 환경변수가 없어 현행 조문 검증을 중단합니다. 기존 파일은 변경하지 않았습니다.");
}

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
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[「」『』“”‘’·ㆍ]/g, "")
    .trim();
}

function sourceIndex(sources) {
  const index = new Map();
  for (const source of sources) {
    index.set(compactLawName(source.law), source);
    if (source.officialName) index.set(compactLawName(source.officialName), source);
  }
  return index;
}

function sourceKey(source) {
  const sourceType = source.sourceType ?? "statute";
  if (sourceType === "statute") return `statute:${source.lawId ?? "missing"}`;
  if (sourceType === "admin-rule") return `admin-rule:${source.adminRuleId ?? "missing"}`;
  return `${sourceType}:${source.law}`;
}

function sourceIdentifier(source) {
  return source.sourceType === "admin-rule" ? source.adminRuleId : source.lawId;
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/OC=[^&\s]+/gi, "OC=[redacted]").slice(0, 240);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ko"));
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchSourceResult(group) {
  const { source } = group;
  const sourceType = source.sourceType ?? "statute";
  const requestedArticles = uniqueSorted([...group.articles]);
  const base = {
    law: source.law,
    source_type: sourceType,
    source_id: String(sourceIdentifier(source) ?? ""),
    official_url: source.officialUrl ?? "",
    requested_articles: requestedArticles,
    verified_articles: [],
    missing_articles: [],
  };

  try {
    if (!base.source_id) throw new Error("현행 원문 조회용 안정 식별자가 없습니다.");
    let snapshot;
    if (sourceType === "statute") {
      snapshot = await fetchCurrentLawArticleSnapshot(source.lawId, {
        oc: process.env.LAW_OC,
        signal: AbortSignal.timeout(60_000),
        // 대조일에 시행 중이던 판을 집는다. 없으면 ID 조회로 떨어지고,
        // 그때 돌아온 판이 시행 전이면 아래 검사가 잡는다.
        asOf: CHECKED_AT,
        officialName: source.officialName ?? source.law,
      });
    } else if (sourceType === "admin-rule") {
      snapshot = await fetchCurrentAdminRuleArticleSnapshot(source.adminRuleId, {
        oc: process.env.LAW_OC,
        signal: AbortSignal.timeout(60_000),
      });
      if (snapshot.current !== "Y") throw new Error("법제처 응답이 현행 행정규칙이 아닙니다.");
    } else {
      throw new Error(`지원하지 않는 원문 유형: ${sourceType}`);
    }
    if (compactLawName(snapshot.officialName) !== compactLawName(source.officialName ?? source.law)) {
      throw new Error(`공식 원문명이 일치하지 않습니다: ${snapshot.officialName ?? "이름 없음"}`);
    }
    // 법제처가 돌려준 판이 아직 시행 전이면 '현행 조문 대조'가 아니다.
    // ID로 조회하면 최신 공포본이 오는데, 공포는 됐지만 시행일이 남은 개정본일 수 있다.
    // 그것을 현행이라고 부르면 대조 결과 전체가 사실과 달라진다.
    if (snapshot.effectiveOn && snapshot.effectiveOn > CHECKED_AT) {
      throw new Error(
        `법제처가 돌려준 판이 아직 시행 전입니다(시행 ${snapshot.effectiveOn}, 대조일 ${CHECKED_AT}). `
        + "현행 시행본을 지정해 조회해야 합니다.",
      );
    }
    const verifiedArticles = requestedArticles.filter((article) => snapshot.headers.has(article));
    const missingArticles = requestedArticles.filter((article) => !snapshot.headers.has(article));
    return {
      headers: snapshot.headers,
      result: {
        ...base,
        status: missingArticles.length === 0 ? "passed" : "partial",
        official_name: snapshot.officialName,
        version_key: String(snapshot.versionKey ?? snapshot.serial ?? ""),
        ...(snapshot.promulgatedOn ? { promulgated_on: snapshot.promulgatedOn } : {}),
        ...(snapshot.effectiveOn ? { effective_on: snapshot.effectiveOn } : {}),
        verified_articles: verifiedArticles,
        missing_articles: missingArticles,
      },
    };
  } catch (error) {
    return {
      headers: null,
      result: { ...base, status: "failed", error: safeError(error) },
    };
  }
}

function issue(occurrence, reason) {
  return {
    node_id: occurrence.nodeId,
    law: occurrence.law,
    article: occurrence.article,
    reason,
  };
}

async function verifyInstitution(institution) {
  if (institution.process.nodes.some((node) => !node.agent)) {
    throw new Error(`${institution.slug}: 먼저 node scripts/generate-agent-readiness-showcase.mjs를 실행해야 합니다.`);
  }
  const index = sourceIndex(institution.verification?.sources ?? []);
  const occurrences = [];
  const groups = new Map();
  const seen = new Set();

  for (const node of institution.process.nodes) {
    for (const basis of node.legal_basis ?? []) {
      for (const article of parseArticleReferences(basis.article)) {
        const occurrenceKey = `${node.id}\u0000${basis.law}\u0000${article}`;
        if (seen.has(occurrenceKey)) continue;
        seen.add(occurrenceKey);
        const source = index.get(compactLawName(basis.law)) ?? null;
        const occurrence = {
          nodeId: node.id,
          law: basis.law,
          article,
          source,
          preflightError: basis.unverified === true
            ? "데이터에 미검증 근거로 표시됨"
            : source
              ? null
              : "verification.sources에서 공식 원문을 찾지 못함",
        };
        occurrences.push(occurrence);
        if (occurrence.preflightError) continue;
        const key = sourceKey(source);
        const group = groups.get(key) ?? { key, source, articles: new Set() };
        group.articles.add(article);
        groups.set(key, group);
        occurrence.groupKey = key;
      }
    }
  }

  const groupEntries = [...groups.values()];
  const fetched = await mapLimit(groupEntries, CONCURRENCY, fetchSourceResult);
  const fetchedByKey = new Map(fetched.map((entry, indexPosition) => [groupEntries[indexPosition].key, entry]));
  const missingReferences = [];
  const uncheckableReferences = [];
  const verifiedOccurrenceKeys = new Set();
  for (const occurrence of occurrences) {
    const occurrenceKey = `${occurrence.nodeId}\u0000${occurrence.law}\u0000${occurrence.article}`;
    if (occurrence.preflightError) {
      uncheckableReferences.push(issue(occurrence, occurrence.preflightError));
      continue;
    }
    const fetchedSource = fetchedByKey.get(occurrence.groupKey);
    if (!fetchedSource || fetchedSource.result.status === "failed") {
      uncheckableReferences.push(issue(occurrence, fetchedSource?.result.error ?? "법제처 API 조회 실패"));
      continue;
    }
    if (!fetchedSource.headers.has(occurrence.article)) {
      missingReferences.push(issue(occurrence, "현행 공식 원문에서 조문 번호를 찾지 못함"));
      continue;
    }
    verifiedOccurrenceKeys.add(occurrenceKey);
    occurrence.verified = true;
  }

  const occurrencesByNode = new Map(institution.process.nodes.map((node) => [node.id, []]));
  for (const occurrence of occurrences) occurrencesByNode.get(occurrence.nodeId)?.push(occurrence);
  // 참고용으로 격리된 노드는 다음 행동 계산에 쓰이지 않는다. 그 노드의 인용을
  // 대조 실패로 세면 "근거가 약하다"는 정직한 표시가 등급을 깎는 벌점이 된다.
  // 별도로 보고하되 통과 여부에는 넣지 않는다.
  const referenceOnlyNodeIds = new Set(
    institution.process.nodes
      .filter((node) => referenceOnlyReasons(node).length > 0)
      .map((node) => node.id),
  );

  const verifiedNodeIds = [];
  const unverifiedNodeIds = [];
  const referenceOnlyReferences = [];
  for (const node of institution.process.nodes) {
    const nodeOccurrences = occurrencesByNode.get(node.id) ?? [];
    if (referenceOnlyNodeIds.has(node.id)) {
      for (const occurrence of nodeOccurrences) {
        referenceOnlyReferences.push(issue(occurrence, referenceOnlyReasons(node).join(", ")));
      }
      continue;
    }
    const verified = nodeOccurrences.length > 0 && nodeOccurrences.every((occurrence) => (
      verifiedOccurrenceKeys.has(`${occurrence.nodeId}\u0000${occurrence.law}\u0000${occurrence.article}`)
    ));
    if (verified) {
      verifiedNodeIds.push(node.id);
    } else {
      unverifiedNodeIds.push(node.id);
      if (nodeOccurrences.length === 0) {
        uncheckableReferences.push({
          node_id: node.id,
          law: "",
          article: "",
          reason: "명시 조문이 없어 현행 원문을 대조할 수 없음",
        });
      }
    }
  }

  const inScope = (item) => !referenceOnlyNodeIds.has(item.node_id);
  const scopedMissing = missingReferences.filter(inScope);
  const scopedUncheckable = uncheckableReferences.filter(inScope);
  const scopedOccurrences = occurrences.filter((occurrence) => !referenceOnlyNodeIds.has(occurrence.nodeId));

  const sourceResults = fetched.map((entry) => entry.result);
  const sourceFailures = sourceResults.filter((entry) => entry.status === "failed").length;
  const articleReferences = scopedOccurrences.length;
  const verifiedReferences = scopedOccurrences.filter((occurrence) => occurrence.verified === true).length;
  const passed = articleReferences > 0
    && verifiedReferences === articleReferences
    && unverifiedNodeIds.length === 0
    && scopedMissing.length === 0
    && scopedUncheckable.length === 0
    && sourceFailures === 0;
  return {
    checked_at: CHECKED_AT,
    method: OFFICIAL_LAW_API_METHOD,
    status: passed ? "passed" : verifiedReferences === 0 ? "failed" : "partial",
    citation_fingerprint: agentCitationFingerprint(institution),
    sources_checked: sourceResults.length,
    source_failures: sourceFailures,
    article_references: articleReferences,
    verified_references: verifiedReferences,
    missing_references: scopedMissing,
    uncheckable_references: scopedUncheckable,
    reference_only_references: referenceOnlyReferences,
    verified_node_ids: verifiedNodeIds,
    unverified_node_ids: unverifiedNodeIds,
    source_results: sourceResults,
  };
}

const assessed = [];
for (const entry of SHOWCASE_INSTITUTIONS) {
  const filePath = path.join(DATA_DIR, `${entry.slug}.json`);
  const institution = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const liveLegalCheck = await verifyInstitution(institution);
  institution.process.agent_readiness = assessAgentReadiness(institution, {
    transitionReviewed: entry.transitionReviewed,
    assessedAt: CHECKED_AT,
    liveLegalCheck,
  });
  assessed.push({ filePath, institution });
  console.log(
    `${institution.slug}: ${liveLegalCheck.status} ${liveLegalCheck.verified_references}/${liveLegalCheck.article_references} -> ${institution.process.agent_readiness.level}`,
  );
}

for (const { filePath, institution } of assessed) {
  fs.writeFileSync(filePath, `${JSON.stringify(institution, null, 1)}\n`);
}
writeShowcaseReport(assessed.map((entry) => entry.institution));
if (assessed.some((entry) => entry.institution.process.agent_readiness.last_live_check.source_failures > 0)) {
  process.exitCode = 1;
}
