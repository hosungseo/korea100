import fs from "node:fs";
import path from "node:path";
import { parseArticleCitationDetails } from "./lib/article-citations.mjs";
import { findLegalSources, legalSourceKey } from "./lib/legal-source-resolution.mjs";

const DATA_DIR = path.resolve("data", "institutions");
const REGISTRY_PATH = path.resolve("data", "article-text-registry.json");

if (!fs.existsSync(REGISTRY_PATH)) throw new Error("조문 원문 레지스트리가 없습니다.");

const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
const files = fs.readdirSync(DATA_DIR).filter((file) => file.endsWith(".json")).sort();
const errors = [];
let processBases = 0;
let explicitBases = 0;
let fetchableBases = 0;
let mappedBases = 0;
let mappedReferences = 0;

for (const [key, article] of Object.entries(registry.articles ?? {})) {
  if (!article.text?.trim()) errors.push(`${key}: 원문 본문이 비어 있음`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(article.checkedAt ?? "")) {
    errors.push(`${key}: 원문 확인일 형식 오류`);
  }
  if (/\[object Object\]/i.test(article.text ?? "")) {
    errors.push(`${key}: 직렬화되지 않은 객체 문구 포함`);
  }
  if (!key.endsWith(`::${article.article}`)) {
    errors.push(`${key}: 레지스트리 키와 조문 번호 불일치`);
  }
}

for (const file of files) {
  const institution = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  const institutionMap = registry.institutions?.[institution.slug];
  if (!institutionMap) {
    errors.push(`${institution.slug}: 제도별 원문 인덱스 없음`);
    continue;
  }

  const sourceKeys = new Set(
    (institution.verification?.sources ?? []).map(legalSourceKey).filter(Boolean),
  );
  for (const node of institution.process?.nodes ?? []) {
    for (const [basisIndex, basis] of (node.legal_basis ?? []).entries()) {
      processBases += 1;
      const details = parseArticleCitationDetails(basis.article);
      if (details.length === 0) continue;
      explicitBases += 1;
      const sources = findLegalSources(basis.law, institution.verification?.sources ?? [])
        .filter((source) => legalSourceKey(source));
      if (sources.length === 0) continue;
      fetchableBases += 1;

      const basisKey = `${node.id}:${basisIndex}`;
      const references = institutionMap[basisKey] ?? [];
      if (references.length === 0) {
        errors.push(`${institution.slug} ${basisKey}: 수집 가능한 명시 조문이 원문에 연결되지 않음`);
        continue;
      }
      mappedBases += 1;

      const seen = new Set();
      for (const reference of references) {
        mappedReferences += 1;
        const signature = JSON.stringify(reference);
        if (seen.has(signature)) errors.push(`${institution.slug} ${basisKey}: 중복 원문 매핑`);
        seen.add(signature);

        const article = registry.articles?.[reference.key];
        if (!article) errors.push(`${institution.slug} ${basisKey}: 깨진 원문 참조 ${reference.key}`);
        if (article && article.article !== reference.article) {
          errors.push(`${institution.slug} ${basisKey}: 인용 조문과 저장 조문 불일치`);
        }
        const sourceId = reference.key.slice(0, reference.key.lastIndexOf("::"));
        if (!sourceKeys.has(sourceId)) {
          errors.push(`${institution.slug} ${basisKey}: 제도 출처에 없는 원문 참조 ${sourceId}`);
        }
      }
    }
  }
}

const result = {
  institutions: files.length,
  institutionMaps: Object.keys(registry.institutions ?? {}).length,
  storedArticles: Object.keys(registry.articles ?? {}).length,
  processBases,
  explicitBases,
  fetchableBases,
  mappedBases,
  mappedReferences,
  errors: errors.length,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) {
  console.error(errors.slice(0, 50).join("\n"));
  process.exitCode = 1;
}
