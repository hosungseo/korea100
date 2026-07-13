import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { filterUnresolvedAgainstSources, mergeExistingSources } from "./lib/source-merging.mjs";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const REGISTRY_PATH = path.join(WEB_DIR, "data", "legal-source-registry.json");
const REPORT_PATH = path.join(REPO_DIR, "docs", "verification-coverage.json");
const FRESHNESS_SUMMARY_PATH = path.join(WEB_DIR, "freshness-summary.md");

const WRITE = process.argv.includes("--write");
const CHECK = process.argv.includes("--check");
const CONCURRENCY = Number(process.env.SOURCE_SYNC_CONCURRENCY ?? 6);
const VERIFIED_AT = process.env.SOURCE_SYNC_DATE ?? localDate("Asia/Seoul");
const CLI = process.env.KOREAN_LAW_CLI ?? "korean-law";

if (!process.env.LAW_OC?.trim()) {
  throw new Error("LAW_OC 환경변수가 없어 출처 동기화를 중단합니다. 기존 검증 파일은 변경하지 않았습니다.");
}

const ADMIN_KINDS = new Set(["고시·지침", "행정규칙"]);
const ORDINANCE_KINDS = new Set(["조례", "조례·규칙"]);
const QUERY_ALIASES = new Map([
  ["지방자치분권 및 지역균형발전에 관한 특별법", "지방자치분권 및 균형성장에 관한 특별법"],
  ["정보시스템 감리기준(행정안전부 고시)", "정보시스템 감리기준"],
  ["행정안전부 지방보조금 관리기준(예규)", "지방보조금 관리기준"],
  ["행정안전부 인구감소지역 지정 고시", "인구감소지역 지정"],
  ["요양급여의 적용기준 및 방법에 관한 세부사항 등 고시", "요양급여의 적용기준 및 방법에 관한 세부사항"],
]);
const EXTERNAL_DOCUMENT_PATTERN =
  /기본계획|할당계획|평가편람|운용지침|운영 지침|산정 지침|산정 기준|관리기준|경영평가 기준|입안·심사 지침|기금운용평가 관련 지침/;

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

function compact(value) {
  return value
    .replace(/\s+/g, "")
    .replace(/[「」『』“”‘’·ㆍ]/g, "")
    .trim();
}

function queryName(law) {
  return (QUERY_ALIASES.get(law) ?? law).trim();
}

function queryCandidates(law) {
  const primary = queryName(law);
  const withoutParenthetical = primary.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const candidates = [primary, withoutParenthetical];
  for (const candidate of [...candidates]) {
    candidates.push(
      candidate.replace(
        /^(과학기술정보통신부|교육부|기획재정부|행정안전부|개인정보보호위원회)\s+/,
        "",
      ),
    );
  }
  return [...new Set(candidates.filter(Boolean))];
}

function isoDate(value) {
  if (!/^\d{8}$/.test(value ?? "")) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function officialUrl(section, name) {
  return `https://law.go.kr/${section}/${name.replace(/\s+/g, "")}`;
}

function sourceTypeFor(basis) {
  if (basis.kind === "조약" || /협약$/.test(basis.law)) return "treaty";
  if (ADMIN_KINDS.has(basis.kind)) return "admin-rule";
  if (ORDINANCE_KINDS.has(basis.kind)) return "ordinance";
  return "statute";
}

function unresolvedRecord(basis, fallbackReason) {
  if (ORDINANCE_KINDS.has(basis.kind)) {
    return {
      law: basis.law,
      kind: basis.kind,
      reasonCode: "local-scope",
      reason: "적용 지역이 특정되지 않아 단일 자치법규 원문을 확정할 수 없음",
      nextStep: "적용할 시·도 또는 시·군·구를 지정한 뒤 해당 자치법규를 연결해야 한다.",
    };
  }
  if (/각 부처|개별 처분|각 개별법|특별지방자치단체 규약/.test(basis.law)) {
    return {
      law: basis.law,
      kind: basis.kind,
      reasonCode: "institution-scope",
      reason: "적용 기관·업종·처분을 지정해야 단일 원문을 확정할 수 있음",
      nextStep: "구체적인 기관, 업종 또는 처분 유형을 선택해 해당 법령을 연결해야 한다.",
    };
  }
  if (/내부규정/.test(basis.law)) {
    return {
      law: basis.law,
      kind: basis.kind,
      reasonCode: "internal-rule",
      reason: "기관 내부규정으로 국가법령정보센터 공개 원문을 확인할 수 없음",
      nextStep: "소관 기관의 현행 내부규정 공개본이나 정보공개 자료로 확인해야 한다.",
    };
  }
  if (EXTERNAL_DOCUMENT_PATTERN.test(basis.law)) {
    return {
      law: basis.law,
      kind: basis.kind,
      reasonCode: "external-official-document",
      reason: "계획·편람·업무지침으로 국가법령정보센터 식별자를 확정할 수 없음",
      nextStep: "소관 부처가 공개한 해당 연도 문서의 공식 URL과 발행 버전을 지정해야 한다.",
    };
  }
  return {
    law: basis.law,
    kind: basis.kind,
    reasonCode: "title-needs-confirmation",
    reason: fallbackReason,
    nextStep: "소관 기관의 공식 제명을 확인한 뒤 국가법령정보센터에서 다시 조회해야 한다.",
  };
}

class CliExecutionError extends Error {}

async function runCli(args) {
  try {
    const { stdout } = await execFileAsync(CLI, args, {
      env: process.env,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
    });
    return stdout;
  } catch (error) {
    const detail = [error.stdout, error.stderr]
      .filter((value) => typeof value === "string" && value.trim())
      .join("\n")
      .trim();
    if (/\[NOT_FOUND\]|검색 결과가 없습니다|실제 데이터를 찾지 못했습니다/.test(detail)) {
      return detail;
    }
    throw new CliExecutionError(
      detail || `Korean Law CLI 실행 실패: ${args[0]}`,
    );
  }
}

function parseStatutes(output) {
  const results = [];
  const pattern = /^\d+\. (.+?)(?: \[현행\])?\n\s+- 법령ID: (\d+)\n\s+- MST: (\d+)\n\s+- 공포일: (\d{8}) \/ 시행일: (\d{8})\n\s+- 구분: (.+)$/gm;
  for (const match of output.matchAll(pattern)) {
    results.push({
      name: match[1].trim(),
      lawId: match[2],
      mst: match[3],
      promulgatedOn: isoDate(match[4]),
      effectiveOn: isoDate(match[5]),
      officialKind: match[6].trim(),
    });
  }
  return results;
}

function parseAdminRules(output) {
  const results = [];
  const pattern = /^\d+\. (.+?)\n\s+- 행정규칙일련번호: (\d+)\n\s+- 행정규칙ID: (\d+)\n\s+- 공포일: (\d{8})\n\s+- 구분: (.+?)\n\s+- 소관부처: (.+)$/gm;
  for (const match of output.matchAll(pattern)) {
    results.push({
      name: match[1].trim(),
      adminRuleSerial: match[2],
      adminRuleId: match[3],
      promulgatedOn: isoDate(match[4]),
      officialKind: match[5].trim(),
      ministry: match[6].trim(),
    });
  }
  return results;
}

function parseTreaties(output) {
  const results = [];
  const pattern = /^\[(\d+)\] (.+?)\n\s+조약번호: (.+?)\n\s+체결일: (.+?)\n\s+발효일: (.+?)\n\s+구분: (.+?)\n/gm;
  for (const match of output.matchAll(pattern)) {
    results.push({
      name: match[2].trim(),
      treatyId: match[1],
      treatyNumber: match[3].trim(),
      effectiveOn: isoDate(match[5].trim()),
      officialKind: match[6].trim(),
    });
  }
  return results;
}

function exactResult(results, expected) {
  const target = compact(expected);
  return results.find((result) => compact(result.name) === target) ?? null;
}

async function resolveBasis(basis) {
  const candidates = queryCandidates(basis.law);
  const sourceType = sourceTypeFor(basis);

  if (sourceType === "ordinance") {
    return {
      unresolved: unresolvedRecord(basis, "자치법규 원문을 확정할 수 없음"),
    };
  }

  try {
    if (sourceType === "statute") {
      let result = null;
      for (const query of candidates) {
        const output = await runCli(["search_law", "--query", query, "--display", "20"]);
        result = exactResult(parseStatutes(output), query);
        if (result) break;
      }
      if (!result) {
        for (const query of candidates) {
          const output = await runCli(["search_all", "--query", query, "--display", "50"]);
          result = exactResult(parseStatutes(output), query);
          if (result) break;
        }
      }
      if (!result) throw new Error("현행 법령 정확 일치 없음");
      return {
        source: {
          law: basis.law,
          kind: basis.kind,
          sourceType,
          officialName: result.name,
          lawId: result.lawId,
          mst: result.mst,
          promulgatedOn: result.promulgatedOn,
          effectiveOn: result.effectiveOn,
          officialUrl: officialUrl("법령", result.name),
        },
      };
    }

    if (sourceType === "admin-rule") {
      for (const query of candidates) {
        const output = await runCli(["search_admin_rule", "--query", query, "--display", "20"]);
        const result = exactResult(parseAdminRules(output), query);
        if (result) {
          return {
            source: {
              law: basis.law,
              kind: basis.kind,
              sourceType,
              officialName: result.name,
              adminRuleId: result.adminRuleId,
              adminRuleSerial: result.adminRuleSerial,
              promulgatedOn: result.promulgatedOn,
              officialUrl: officialUrl("행정규칙", result.name),
            },
          };
        }
      }

      for (const query of candidates) {
        const output = await runCli(["search_law", "--query", query, "--display", "20"]);
        const result = exactResult(parseStatutes(output), query);
        if (result) {
          return {
            source: {
              law: basis.law,
              kind: basis.kind,
              sourceType: "statute",
              officialName: result.name,
              lawId: result.lawId,
              mst: result.mst,
              promulgatedOn: result.promulgatedOn,
              effectiveOn: result.effectiveOn,
              officialUrl: officialUrl("법령", result.name),
            },
          };
        }
      }
      throw new Error("행정규칙·법령 정확 일치 없음");
    }

    const query = candidates[0];
    const output = await runCli(["search_treaties", "--query", query, "--display", "20"]);
    const result = exactResult(parseTreaties(output), query);
    if (!result) throw new Error("조약 정확 일치 없음");
    return {
      source: {
        law: basis.law,
        kind: basis.kind,
        sourceType,
        officialName: result.name,
        treatyId: result.treatyId,
        treatyNumber: result.treatyNumber,
        effectiveOn: result.effectiveOn,
        officialUrl: officialUrl("조약", result.name),
      },
    };
  } catch (error) {
    if (error instanceof CliExecutionError) throw error;
    return {
      unresolved: unresolvedRecord(basis, error.message),
    };
  }
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

const files = fs.readdirSync(DATA_DIR).filter((file) => file.endsWith(".json")).sort();
const institutions = files.map((file) => ({
  file,
  data: JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")),
}));

const uniqueBasis = new Map();
for (const { data } of institutions) {
  for (const basis of data.canvas.legalBasis) {
    uniqueBasis.set(`${basis.kind}\u0000${basis.law}`, { law: basis.law, kind: basis.kind });
  }
}

const basisEntries = [...uniqueBasis.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko"));
const resolutions = await mapLimit(basisEntries, CONCURRENCY, async ([key, basis], index) => {
  const result = await resolveBasis(basis);
  process.stderr.write(`\r출처 조회 ${index + 1}/${basisEntries.length}`);
  return [key, result];
});
process.stderr.write("\n");

const registry = new Map(resolutions);
const coverage = [];

for (const { file, data } of institutions) {
  const generatedSources = [];
  const unresolved = [];
  for (const basis of data.canvas.legalBasis) {
    const result = registry.get(`${basis.kind}\u0000${basis.law}`);
    if (result?.source) generatedSources.push(result.source);
    if (result?.unresolved) unresolved.push(result.unresolved);
  }
  const sources = mergeExistingSources(generatedSources, data.verification?.sources);
  const remainingUnresolved = filterUnresolvedAgainstSources(unresolved, sources);
  const linkedCount = data.canvas.legalBasis.length - remainingUnresolved.length;

  data.verification = {
    status: remainingUnresolved.length === 0 ? "source-linked" : "needs-review",
    verifiedAt: VERIFIED_AT,
    method: "국가법령정보센터 Open API (Korean Law MCP CLI)",
    scope:
      remainingUnresolved.length === 0
        ? `법적 근거 ${linkedCount}건의 현행 공식 원문을 연결했다. 개별 인용 조문의 내용 일치 여부는 후속 검수 대상이다.`
        : `법적 근거 ${linkedCount + remainingUnresolved.length}건 중 공식 원문 ${linkedCount}건을 연결했다. 단일 원문을 특정할 수 없는 ${remainingUnresolved.length}건은 적용 범위나 공식 문서 버전 지정이 필요하다.`,
    ...(data.verification?.notes?.length ? { notes: data.verification.notes } : {}),
    sources,
    ...(remainingUnresolved.length ? { unresolved: remainingUnresolved } : {}),
  };

  coverage.push({
    priority: data.priority,
    slug: data.slug,
    name: data.name,
    status: data.verification.status,
    total: linkedCount + remainingUnresolved.length,
    linked: linkedCount,
    unresolved: remainingUnresolved.length,
  });

  if (WRITE) {
    fs.writeFileSync(path.join(DATA_DIR, file), `${JSON.stringify(data, null, 1)}\n`);
  }
}

const registryOutput = {
  generatedAt: VERIFIED_AT,
  total: basisEntries.length,
  linked: resolutions.filter(([, result]) => result.source).length,
  unresolved: resolutions.filter(([, result]) => result.unresolved).length,
  entries: resolutions.map(([key, result]) => ({ key, ...result })),
};
const reportOutput = {
  generatedAt: VERIFIED_AT,
  institutions: coverage.length,
  sourceLinked: coverage.filter((item) => item.status === "source-linked").length,
  needsReview: coverage.filter((item) => item.status === "needs-review").length,
  linkedSources: coverage.reduce((sum, item) => sum + item.linked, 0),
  unresolvedReferences: coverage.reduce((sum, item) => sum + item.unresolved, 0),
  coverage: coverage.sort((a, b) => a.priority - b.priority),
};

const previousRegistry = fs.existsSync(REGISTRY_PATH)
  ? JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"))
  : { entries: [] };
const previousByKey = new Map(
  (previousRegistry.entries ?? []).map((entry) => [entry.key, entry]),
);
const freshnessChanges = resolutions.flatMap(([key, result]) => {
  const previous = previousByKey.get(key);
  const before = sourceVersion(previous);
  const after = sourceVersion({ key, ...result });
  return before === after
    ? []
    : [{ key, law: key.split("\u0000")[1] ?? key, before, after }];
});

if (WRITE) {
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registryOutput, null, 2)}\n`);
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(reportOutput, null, 2)}\n`);
}

if (CHECK) {
  const lines = [
    "# 법령 최신성 점검",
    "",
    `점검일: ${VERIFIED_AT}`,
    `변경 감지: ${freshnessChanges.length}건`,
    "",
    ...(
      freshnessChanges.length
        ? freshnessChanges.flatMap((change) => [
            `## ${change.law}`,
            `- 이전: ${change.before}`,
            `- 현재: ${change.after}`,
            "",
          ])
        : ["저장된 공식 원문 식별자와 다른 변경을 찾지 못했습니다."]
    ),
  ];
  fs.writeFileSync(FRESHNESS_SUMMARY_PATH, `${lines.join("\n")}\n`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `changed_count=${freshnessChanges.length}\nsummary_path=${FRESHNESS_SUMMARY_PATH}\n`,
    );
  }
}

console.log(
  JSON.stringify(
    {
      write: WRITE,
      check: CHECK,
      freshnessChanges: freshnessChanges.length,
      ...reportOutput,
    },
    null,
    2,
  ),
);

function sourceVersion(entry) {
  if (!entry) return "기록 없음";
  if (entry.unresolved) return `미해결:${entry.unresolved.reasonCode}`;
  const source = entry.source;
  if (!source) return "공식 원문 없음";
  const sourceType = source.sourceType ?? "statute";
  if (sourceType === "statute") {
    return `법령:${source.mst ?? "-"}:공포 ${source.promulgatedOn ?? "-"}:시행 ${source.effectiveOn ?? "-"}`;
  }
  if (sourceType === "admin-rule") {
    return `행정규칙:${source.adminRuleSerial ?? "-"}:공포 ${source.promulgatedOn ?? "-"}`;
  }
  return `조약:${source.treatyId ?? source.treatyNumber ?? "-"}:시행 ${source.effectiveOn ?? "-"}`;
}
