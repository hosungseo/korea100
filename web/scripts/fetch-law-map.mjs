#!/usr/bin/env node
// 법령 지도 생성: 법제처 DRF(lsStmd·lsDelegated·eflaw) →
//   web/data/law-map/<lawId>.json (구조) + web/public/law-map/<lawId>.text.json (조문 미리보기) + index.json
// 사용: node scripts/fetch-law-map.mjs --lawId 001823 [--lawId ...] | --all [--limit N] [--force]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLawGoKrOc } from "./lib/law-go-kr-oc.mjs";
import { resolveEffectiveLawVersion } from "./lib/law-service.mjs";
import { createDrfClient } from "./lib/law-map-drf.mjs";
import { parseArticleList, parseLsDelegated, parseLsStmd } from "./lib/law-map-parsers.mjs";
import { buildLawMap } from "./lib/law-map-build.mjs";
import { writeLawMapIndex } from "./lib/law-map-index.mjs";

const WEB = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(WEB, "data", "law-map");
const RAW_DIR = path.join(DATA_DIR, "raw");
const TEXT_DIR = path.join(WEB, "public", "law-map");
const INSTITUTIONS_DIR = path.join(WEB, "data", "institutions");
const REGISTRY = path.join(WEB, "data", "legal-source-registry.json");
const AUDIT_DIR = path.join(path.dirname(WEB), "docs", "audits");

const USAGE = "사용법: node scripts/fetch-law-map.mjs --lawId 001823 | --all [--limit N] [--force]";

function parseArgs(argv) {
  const args = { lawIds: [], all: false, limit: Infinity, force: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--lawId") args.lawIds.push(argv[++i]);
    else if (v === "--all") args.all = true;
    else if (v === "--limit") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) { console.error(USAGE); process.exit(2); }
      args.limit = n;
    } else if (v === "--force") args.force = true;
  }
  return args;
}

const today = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function registryLawIds() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  const ids = registry.entries.filter((e) => e.source?.kind === "법률" && e.source.lawId).map((e) => e.source.lawId);
  return [...new Set(ids)].sort();
}

function loadInstitutionCitations() {
  return fs.readdirSync(INSTITUTIONS_DIR).filter((f) => f.endsWith(".json")).map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(INSTITUTIONS_DIR, f), "utf8"));
    const citations = [];
    for (const b of j.canvas?.legalBasis ?? []) if (b.articles) citations.push({ law: b.law, article: b.articles });
    // 검증에서 근거 오인용으로 판정된 항목(wrong_basis)은 역참조에서 뺀다. 미검증(unverified)은 그대로 둔다.
    for (const n of j.process?.nodes ?? []) {
      for (const lb of n.legal_basis ?? []) if (!lb.wrong_basis) citations.push({ law: lb.law, article: lb.article });
    }
    return { slug: j.slug, name: j.name, citations };
  });
}

async function resolveLane(drf, oc, tier, info, asOf, warnings) {
  let { mst, effectiveOn } = info;
  // lsStmd는 시행 전 개정본을 줄 수 있다. 오늘 기준 시행 중인 판을 고른다.
  if (!effectiveOn || effectiveOn > asOf) {
    const version = await resolveEffectiveLawVersion(info.lawId, { oc, asOf, officialName: info.name });
    await sleep(300); // law-service는 DRF 클라이언트의 호출 간격을 거치지 않으므로 여기서 띄운다
    if (version) ({ mst, effectiveOn } = version);
    else if (tier === "statute") throw new Error(`${info.name}: 현행 시행판 미확인`);
    // 하위 레인은 lsStmd가 준(시행 전) 판으로 진행하되 보고서에 남긴다
    else if (effectiveOn) warnings.futureVersions.push({ lawId: info.lawId, mst, name: info.name, tier, effectiveOn });
  }
  if (!effectiveOn) throw new Error(`${info.name}: 시행일을 확인하지 못했습니다`);
  const payload = await drf.getJson({ target: "eflaw", MST: mst, efYd: effectiveOn.replace(/-/g, "") }, `eflaw-${mst}-${effectiveOn}.json`);
  const articles = parseArticleList(payload);
  if (articles.length === 0) throw new Error(`${info.name}(MST ${mst}): 조문이 비어 있습니다`);
  let delegated = null;
  try {
    // 일부 시행령·시행규칙은 lsDelegated가 체계적으로 HTTP 500을 준다 → 하위 레인은 한 번만 재시도해 백오프 시간을 줄인다
    const retries = tier === "statute" ? undefined : 1;
    delegated = parseLsDelegated(await drf.getText({ target: "lsDelegated", MST: mst }, `lsDelegated-${mst}.xml`, { retries }));
  } catch (err) {
    // 법률 레인은 위임선의 뿌리이므로 실패를 그대로 올리고,
    // 하위 레인은 조문만 싣고 위임선 없이 진행한다(빌더는 delegated가 null이면 그 레인의 위임선을 건너뛴다).
    if (tier === "statute") throw err;
    warnings.delegationUnavailable.push({ lawId: info.lawId, mst, name: info.name, tier, reason: drf.redact(err?.message ?? String(err)) });
  }
  return { tier, info: { ...info, mst, effectiveOn }, articles, delegated };
}

async function buildOne(drf, oc, lawId, institutions, asOf, warnings) {
  const stmd = parseLsStmd(await drf.getText({ target: "lsStmd", ID: lawId }, `lsStmd-${lawId}.xml`));
  if (!stmd.root.lawId) throw new Error("lsStmd 기본정보가 비어 있습니다");
  const laws = [await resolveLane(drf, oc, "statute", stmd.root, asOf, warnings)];
  for (const d of stmd.decrees) laws.push(await resolveLane(drf, oc, "decree", d, asOf, warnings));
  for (const r of stmd.rules) laws.push(await resolveLane(drf, oc, "rule", r, asOf, warnings));
  return buildLawMap({ stmd, laws, institutions, generatedAt: asOf });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lawIds = args.all ? registryLawIds().slice(0, args.limit) : args.lawIds;
  if (lawIds.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }
  const oc = resolveLawGoKrOc();
  const drf = createDrfClient({ oc, cacheDir: RAW_DIR, force: args.force });
  const institutions = loadInstitutionCitations();
  const asOf = today();
  for (const dir of [DATA_DIR, TEXT_DIR, AUDIT_DIR]) fs.mkdirSync(dir, { recursive: true });

  const report = {
    generatedAt: asOf, built: [], skipped: [], unresolved: [], institutionMisses: [], addedAdminRules: [], delegationUnavailable: [],
    futureVersions: [], selfReferences: 0, ambiguousSources: [],
  };
  for (const lawId of lawIds) {
    try {
      const { map, texts, report: r } = await buildOne(drf, oc, lawId, institutions, asOf, report);
      // 구조 파일은 손으로 diff하지 않는 생성물 → 들여쓰기 없이 저장(건축법 기준 용량 ~17% 절감). index.json은 index 모듈이 보기 좋게 쓴다.
      fs.writeFileSync(path.join(DATA_DIR, `${lawId}.json`), `${JSON.stringify(map)}\n`);
      fs.writeFileSync(path.join(TEXT_DIR, `${lawId}.text.json`), JSON.stringify(texts));
      report.built.push({
        lawId, name: map.name, articles: map.articles.length, edges: map.edges.length,
        unresolved: map.stats.unresolved, droppedReferences: r.droppedReferences, selfReferences: r.selfReferences,
      });
      report.unresolved.push(...r.unresolved);
      report.institutionMisses.push(...r.institutionMisses);
      report.addedAdminRules.push(...r.addedAdminRules.map((name) => ({ lawId, name })));
      report.selfReferences += r.selfReferences;
      report.ambiguousSources.push(...r.ambiguousSources);
      console.log(`✓ ${lawId} ${map.name}: 조문 ${map.articles.length}, 위임선 ${map.edges.length}, 미해결 ${map.stats.unresolved}, 제외 참조 ${r.droppedReferences}, 자기인용 ${r.selfReferences}, 제도 ${map.institutions.length}`);
    } catch (err) {
      const reason = drf.redact(err?.message ?? String(err));
      report.skipped.push({ lawId, reason });
      console.error(`✗ ${lawId}: ${reason}`);
    }
  }
  writeLawMapIndex(DATA_DIR, asOf);
  const reportPath = path.join(AUDIT_DIR, `law-map-build-${asOf}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`생성 ${report.built.length}건, 건너뜀 ${report.skipped.length}건, 미해결 ${report.unresolved.length}건 → ${path.relative(process.cwd(), reportPath)}`);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
