#!/usr/bin/env node
// 단계 결정 위상(decision.tier)을 제도 JSON에 적용한다.
//
// 왜: 관심층 계산은 마일스톤 위상은 파생 데이터로 쓰지만, 그 안 절차의 위상은
// 담당 표기 문자열에 정규식을 돌려 추정한다("산업단지 지정권자"→분류 불가,
// "관계 행정기관"→분류 불가). 그 추정을 **조문이 누구에게 권한을 줬는지**로 바꾼다.
//
// 판정과 적용을 가른다 — 판정은 조문을 읽은 에이전트가 하고, 이 스크립트는
// 그 판정이 데이터와 맞는지 검사한 뒤에만 쓴다. 검사에 걸린 판정은 버리지 않고
// unknown 으로 강등해 사유를 남긴다(원칙 5: 없는 것은 없다고 말한다).
//
//   node scripts/apply-step-decision-tier.mjs <판정.json>          # 적용
//   node scripts/apply-step-decision-tier.mjs <판정.json> --dry-run # 검사만
//
// 입력 형식: { tiers: [{ slug, steps: [{ node_id, decision_tier, is_decision,
//                                        basis_article, basis_quote, rationale, confidence }] }] }

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TIER_RANK } from "./lib/mega-tier.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTITUTIONS = join(WEB, "data", "institutions");
const REVIEWED_AT = "2026-09-02";
const VALID_TIERS = new Set([...Object.keys(TIER_RANK), "unknown"]);
// 조문이 권한자를 정하지 않았다고 판정한 경우엔 근거 조문을 요구하지 않는다.
const NEEDS_BASIS = (tier) => tier !== "unknown" && tier !== "field";

/** 파일의 들여쓰기를 감지한다. 원본이 1인데 2로 저장하면 전체가 재포맷돼 diff가 터진다. */
function detectIndent(text) {
  const match = text.match(/\n(\s+)"/);
  return match ? match[1].length : 2;
}

/**
 * 근거 조문이 그 노드의 legal_basis에 있는가.
 *
 * 판정은 "물환경보전법 제49조제2항"처럼 법령명을 붙여 오기도 하고, 노드는 "제49조제2항"만
 * 들고 있기도 하다. 조문 부분만 떼어 비교한다 — 느슨하게 풀면 제1조와 제11조가 붙는다.
 * 적용기와 검증기가 각자 규칙을 들면 한쪽이 통과시킨 것을 다른 쪽이 막는다. 정의는 여기 하나다.
 */
export function articleInBasis(basisArticle, legalBasis) {
  const part = (value) => (String(value ?? "").match(/제\d+조(의\d+)?(제\d+항)?(제\d+호)?/) ?? [""])[0];
  const want = part(basisArticle);
  return (legalBasis ?? []).some((basis) => {
    const own = part(basis.article);
    return basis.article === basisArticle || (own && want && own === want) || String(basis.article).startsWith(basisArticle);
  });
}

/** 판정 하나를 노드와 대조한다. 통과하면 적용 값을, 아니면 강등 사유를 돌려준다. */
export function validateStep(step, node) {
  const problems = [];
  let tier = step.decision_tier;

  if (!VALID_TIERS.has(tier)) {
    problems.push(`위상 어휘 밖: ${tier}`);
    tier = "unknown";
  }
  const articles = (node.legal_basis ?? []).map((basis) => basis.article);
  const basis = (step.basis_article ?? "").trim();
  if (basis && !articleInBasis(basis, node.legal_basis)) {
    // 노드가 안 들고 있는 조문을 끌어온 판정. 조문이 틀렸을 수도, 노드가 근거를
    // 빠뜨렸을 수도 있다. 어느 쪽이든 이 자리에서 정할 일이 아니므로 강등한다.
    problems.push(`근거 조문이 노드 legal_basis에 없음: ${basis} (노드: ${articles.join(", ") || "없음"})`);
    tier = "unknown";
  }
  if (!basis && NEEDS_BASIS(tier)) {
    problems.push(`권한자를 정한 조문을 대지 못함 (판정: ${tier})`);
    tier = "unknown";
  }
  if (typeof step.confidence === "number" && step.confidence < 0.7 && tier !== "unknown") {
    problems.push(`신뢰도 ${step.confidence} < 0.7`);
    tier = "unknown";
  }
  return {
    tier,
    is_decision: Boolean(step.is_decision),
    basis_article: tier === "unknown" ? "" : basis,
    problems,
  };
}

export function applyToInstitution(institution, steps) {
  const byId = new Map((institution.process?.nodes ?? []).map((node) => [node.id, node]));
  const seen = new Set();
  const report = { applied: 0, unknown: 0, problems: [], missing: [], extra: [] };

  for (const step of steps) {
    const node = byId.get(step.node_id);
    if (!node) {
      report.extra.push(step.node_id);
      continue;
    }
    seen.add(step.node_id);
    const result = validateStep(step, node);
    for (const problem of result.problems) report.problems.push(`${step.node_id}: ${problem}`);
    node.decision = {
      tier: result.tier,
      is_decision: result.is_decision,
      ...(result.basis_article ? { basis_article: result.basis_article } : {}),
      // 이 값이 조문을 읽고 나온 것인지, 아니면 판정이 강등돼 비어 있는 것인지 구분한다.
      // 화면과 계산은 이 필드를 보고 "데이터인가 추정인가"를 말할 수 있어야 한다.
      source: result.tier === "unknown" ? "unresolved" : "article-reviewed",
      reviewed_at: REVIEWED_AT,
      ...(result.problems.length ? { note: result.problems.join(" / ") } : {}),
    };
    if (result.tier === "unknown") report.unknown += 1;
    else report.applied += 1;
  }
  for (const id of byId.keys()) if (!seen.has(id)) report.missing.push(id);
  return report;
}

function main() {
  const [inputPath] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");
  if (!inputPath) {
    console.error("사용법: node scripts/apply-step-decision-tier.mjs <판정.json> [--dry-run]");
    process.exit(1);
  }
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const entries = input.tiers ?? input;
  let totalApplied = 0;
  let totalUnknown = 0;
  let blocked = 0;

  for (const entry of entries) {
    const path = join(INSTITUTIONS, `${entry.slug}.json`);
    const raw = readFileSync(path, "utf8");
    const institution = JSON.parse(raw);
    const report = applyToInstitution(institution, entry.steps ?? []);

    const label = `${entry.slug}: 적용 ${report.applied} · unknown ${report.unknown}`;
    if (report.missing.length) {
      // 판정이 빠진 노드가 있으면 그 제도는 통째로 건너뛴다. 반쯤 채운 데이터가
      // 가장 나쁘다 — 화면은 채워진 것만 보고 "전부 판정됐다"고 읽는다.
      console.error(`${label} — 건너뜀: 판정 없는 노드 ${report.missing.length}개 (${report.missing.join(", ")})`);
      blocked += 1;
      continue;
    }
    if (report.extra.length) console.error(`  ⚠ 제도에 없는 노드 판정 무시: ${report.extra.join(", ")}`);
    for (const problem of report.problems) console.error(`  · ${problem}`);
    console.log(label);
    totalApplied += report.applied;
    totalUnknown += report.unknown;
    if (!dryRun) {
      writeFileSync(path, `${JSON.stringify(institution, null, detectIndent(raw))}\n`);
    }
  }
  console.log(`\n합계: 적용 ${totalApplied} · unknown ${totalUnknown} · 건너뛴 제도 ${blocked}${dryRun ? " (dry-run, 저장 안 함)" : ""}`);
  if (blocked) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith("apply-step-decision-tier.mjs")) main();
