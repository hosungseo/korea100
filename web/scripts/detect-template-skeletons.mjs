#!/usr/bin/env node
// 절차 모델이 실제 절차인가, 아니면 제네릭 사다리를 제도명만 갈아 끼운 골격인가.
//
//   node web/scripts/detect-template-skeletons.mjs            # 요약
//   node web/scripts/detect-template-skeletons.mjs --list      # 슬러그 전부
//   node web/scripts/detect-template-skeletons.mjs --json      # 기계용
//   node web/scripts/detect-template-skeletons.mjs --gate-r2   # 골격이 R2면 exit 1
//
// 왜 조문 검증으로는 안 잡히는가. 골격도 조문 번호는 실재하는 것을 달고 있어
// article-verified를 통과한다. 검증이 본 것은 "이 조문이 법에 있는가"이고,
// 안 본 것은 "이 절차가 그 조문의 절차인가"다. 최저임금 심의·결정·고시가
// "근로자·사업자가 신청·계획을 작성한다"로 되어 있어도 조문 대조는 통과한다.
//
// 판정은 사다리 일치 하나로 한다. 653개를 훑어 보니 이 12단을 그대로 쓰는 제도가
// 139개, 9단 이상 겹치는 제도가 0개였다 — 회색지대가 없어 문턱을 고민할 필요가 없다.
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INSTITUTION_DIR = path.join(ROOT, "data", "institutions");

// 일괄 생성기가 쓴 12단 사다리. 제도명만 접두로 갈아 끼우고 이 순서를 그대로 둔다.
const GENERIC_LADDER = Object.freeze([
  "대상·요건 확인",
  "신청·계획 작성",
  "접수·등록",
  "서류·현장 검토",
  "보완자료 제출",
  "관계기관·전문가 심의",
  "결정·처분",
  "결과 통지·공개",
  "이행·서비스·운영",
  "변경·갱신",
  "사후점검·기록",
  "시정·이의·재신청",
]);

// 곁증거. 판정에 쓰지는 않고 보고에만 싣는다 — 이것들만으로는 정상 제도도 걸린다.
const PLACEHOLDER_DEADLINE = "개별 법령·공고·통지서에서 확인";
const GENERIC_EDGE_LABELS = new Set(["결정", "시정·불복", "자료보완", "재신청", "조건부·보완"]);

function commonPrefix(values) {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < value.length && prefix[i] === value[i]) i += 1;
    prefix = prefix.slice(0, i);
    if (!prefix) break;
  }
  return prefix;
}

export function inspect(data) {
  const nodes = data.process?.nodes ?? [];
  const names = nodes.map((node) => String(node.name ?? ""));
  const prefix = commonPrefix(names);
  const suffixes = names.map((name) => name.slice(prefix.length).trim());

  const ladderMatch = suffixes.length === GENERIC_LADDER.length
    && suffixes.every((suffix, index) => suffix === GENERIC_LADDER[index]);

  const confidences = new Set(nodes.map((node) => node.confidence));
  const placeholders = nodes.filter((node) => node.deadline === PLACEHOLDER_DEADLINE).length;
  const edgeLabels = new Set((data.process?.edges ?? []).map((edge) => edge.label).filter(Boolean));
  const genericEdges = [...edgeLabels].every((label) => GENERIC_EDGE_LABELS.has(label)) && edgeLabels.size > 0;

  return {
    slug: data.slug,
    name: data.name,
    node_count: nodes.length,
    is_skeleton: ladderMatch,
    readiness: data.process?.agent_readiness?.level ?? null,
    verification_status: data.verification?.status ?? null,
    signals: {
      ladder_match: ladderMatch,
      shared_prefix_length: prefix.length,
      single_confidence: confidences.size === 1 ? [...confidences][0] : null,
      placeholder_deadlines: placeholders,
      all_edge_labels_generic: genericEdges,
      distinct_actors: new Set(nodes.map((node) => node.actor)).size,
    },
  };
}

export async function scanAll({ institutionDir = INSTITUTION_DIR } = {}) {
  const files = (await readdir(institutionDir)).filter((name) => /^[a-z0-9-]+\.json$/u.test(name));
  const out = [];
  for (const file of files.sort()) {
    const data = JSON.parse(await readFile(path.join(institutionDir, file), "utf8"));
    if (!data.process?.nodes?.length) continue;
    out.push(inspect(data));
  }
  return out;
}

/** 사업이 참조하는 제도 중 골격이 몇이고 어느 관문이 걸리는지. */
async function projectImpact(skeletonSlugs) {
  const dir = path.join(ROOT, "data", "mega-projects", "projects");
  const rows = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()) {
    const project = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    const refs = new Set((project.nodes ?? []).flatMap((n) => (n.templateRefs ?? []).map((r) => r.institution)));
    const gates = (project.nodes ?? [])
      .filter((n) => (n.templateRefs ?? []).some((r) => skeletonSlugs.has(r.institution)))
      .map((n) => n.id);
    rows.push({
      project: project.id,
      referenced: refs.size,
      skeleton: [...refs].filter((slug) => skeletonSlugs.has(slug)).length,
      gates,
    });
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const results = await scanAll();
  const skeletons = results.filter((row) => row.is_skeleton);
  const slugs = new Set(skeletons.map((row) => row.slug));

  if (args.includes("--json")) {
    const report = {
      checked_at: null,
      total: results.length,
      skeleton_count: skeletons.length,
      skeletons: skeletons.map(({ slug, name, readiness, verification_status: vs }) => ({ slug, name, readiness, verification_status: vs })),
      project_impact: await projectImpact(slugs),
    };
    const outIndex = args.indexOf("--out");
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (outIndex >= 0 && args[outIndex + 1]) await writeFile(path.resolve(args[outIndex + 1]), json);
    else process.stdout.write(json);
    return;
  }

  console.log(`제도 ${results.length}개 중 템플릿 골격 ${skeletons.length}개 (${(skeletons.length / results.length * 100).toFixed(1)}%)`);

  // 골격도 조문 검증은 통과한다는 사실을 눈에 보이게 남긴다.
  const verified = skeletons.filter((row) => row.verification_status === "article-verified").length;
  console.log(`  이 중 article-verified ${verified}개 — 조문 검증은 절차의 진위를 보지 않는다`);
  const promoted = skeletons.filter((row) => row.readiness === "R2");
  console.log(`  이 중 R2 ${promoted.length}개${promoted.length ? `: ${promoted.map((r) => r.slug).join(", ")}` : " (준비도 관문이 막았다)"}`);

  console.log("\n사업별 영향");
  for (const row of await projectImpact(slugs)) {
    console.log(`  ${row.project}: 참조 ${row.referenced}개 중 골격 ${row.skeleton}개 · 걸린 관문 ${row.gates.length}${row.gates.length ? ` (${row.gates.join(", ")})` : ""}`);
  }

  if (args.includes("--list")) {
    console.log("\n골격 제도");
    for (const row of skeletons) console.log(`  ${row.slug} — ${row.name}`);
  } else if (skeletons.length) {
    console.log(`\n--list 로 ${skeletons.length}개 전부, --json 으로 기계용 보고서를 볼 수 있습니다.`);
  }

  // 골격이 R2에 오르면 시행되지도 않은 절차로 다음 행동을 계산하게 된다.
  if (args.includes("--gate-r2") && promoted.length) {
    console.error(`\n템플릿 골격이 R2에 올라 있습니다: ${promoted.map((r) => r.slug).join(", ")}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exit(1);
  });
}
