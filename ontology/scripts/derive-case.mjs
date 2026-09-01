#!/usr/bin/env node
/**
 * 제도 업무구조도 → 온톨로지 케이스 골격 파생.
 *
 * 케이스의 구조 층(Step/Gate/System 엔티티와 sequence·message·loop 관계)은
 * 제도 그래프의 투영이므로 손으로 옮겨 적을 이유가 없다. 손으로 옮기면
 * 옮겨 적는 순간부터 어긋나기 시작한다. 이 스크립트가 그 층을 파생하고,
 * 사건 고유의 층(Case/Decision/Document/State/Rule/ActionPacket)만 사람이 쓴다.
 *
 * 파생 규칙은 information-disclosure 손작성 케이스에서 역으로 읽어낸 것이며,
 * test/derive-case.test.mjs가 그 케이스의 구조 층을 그대로 재현하는지 검사한다.
 *
 * 사용:
 *   node ontology/scripts/derive-case.mjs --slug administrative-fine-pre-notice-opinion \
 *     --case-id AFN-2026-0901-001 --as-of 2026-09-01 [--out <path>]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ONTOLOGY_VERSION = "korea100.ontology.core.v0";
export const REPO_DIR = fileURLToPath(new URL("../../", import.meta.url));
export const INSTITUTION_DIR = path.join(REPO_DIR, "web", "data", "institutions");

/** 제도 노드 유형 → 온톨로지 엔티티 유형 */
const NODE_TYPE_TO_ENTITY = Object.freeze({
  task: "Step",
  gateway: "Gate",
  notice: "Step",
  system: "System",
});

/** 신뢰도 0.8 미만은 단정하지 않는다. */
const VERIFIED_CONFIDENCE = 0.8;

function entityStatus(node) {
  return (node.confidence ?? 1) < VERIFIED_CONFIDENCE ? "unverified" : "verified";
}

export function deriveStepEntities(institution) {
  return institution.process.nodes.map((node) => ({
    id: `step:${node.id}`,
    type: NODE_TYPE_TO_ENTITY[node.type] ?? "Step",
    label: node.name,
    status: entityStatus(node),
    ...(node.legal_basis?.length ? { legal_basis: node.legal_basis } : {}),
    attrs: {
      process_id: node.id,
      lane: node.lane,
      stage: node.stage,
      node_type: node.type,
      deadline: node.deadline ?? null,
      actor: node.actor ?? null,
      output_documents: node.output_documents ?? [],
    },
  }));
}

export function deriveStepRelations(institution) {
  return institution.process.edges.map((edge) => ({
    id: `R-${edge.id}`,
    type: edge.type,
    from: `step:${edge.source}`,
    to: `step:${edge.target}`,
    label: edge.label ?? null,
    condition: edge.label ?? null,
  }));
}

export function deriveRoleEntities(institution) {
  // 레인 이름은 한국어라 안정적인 슬러그를 만들 수 없다. 자리표시 ID를 주고
  // 사람이 의미 있는 ID로 바꾸도록 남긴다.
  return institution.process.lanes.map((lane, index) => ({
    id: `role:lane-${index + 1}`,
    type: "Role",
    label: lane,
    status: "verified",
    attrs: { lane, id_is_placeholder: true },
  }));
}

export function deriveStatuteEntities(institution) {
  return (institution.verification?.sources ?? []).map((source) => ({
    id: `statute:${source.sourceType ?? "statute"}-${source.lawId ?? source.adminRuleId ?? "unknown"}`,
    type: "Statute",
    label: source.officialName ?? source.law,
    status: "verified",
    attrs: {
      lawId: source.lawId ?? null,
      adminRuleId: source.adminRuleId ?? null,
      kind: source.kind ?? null,
      url: source.officialUrl ?? null,
      effectiveOn: source.effectiveOn ?? null,
      id_is_placeholder: true,
    },
  }));
}

export function deriveCaseSkeleton(institution, { caseId, asOf }) {
  const readiness = institution.process.agent_readiness ?? null;
  return {
    ontology_version: ONTOLOGY_VERSION,
    institution_slug: institution.slug,
    institution_name: institution.name,
    case_id: caseId,
    as_of: asOf,
    source_institution_json: `web/data/institutions/${institution.slug}.json`,
    derivation: {
      generator: "ontology/scripts/derive-case.mjs",
      derived_layers: ["Step/Gate/System 엔티티", "sequence/message/loop 관계", "Role·Statute 자리표시"],
      authored_layers: ["Case", "Decision", "Document", "State", "Rule", "ActionPacket", "demo_queries"],
      institution_readiness: readiness
        ? { level: readiness.level, mode: readiness.mode, assessed_at: readiness.assessed_at }
        : null,
      node_count: institution.process.nodes.length,
      edge_count: institution.process.edges.length,
    },
    entities: [
      ...deriveStatuteEntities(institution),
      ...deriveRoleEntities(institution),
      ...deriveStepEntities(institution),
    ],
    relations: deriveStepRelations(institution),
    states: [],
    rules: [],
    action_packets: [],
    demo_queries: [],
    notes: [
      "구조 층은 파생물이다. 제도 JSON을 고치면 이 파일도 다시 파생해야 한다.",
      "Role·Statute의 ID는 자리표시이며 사람이 의미 있는 이름으로 바꾼다.",
    ],
  };
}

export async function loadInstitution(slug, { institutionDir = INSTITUTION_DIR } = {}) {
  const raw = await readFile(path.join(institutionDir, `${slug}.json`), "utf8");
  return JSON.parse(raw);
}

/**
 * 이미 사람이 쓴 케이스에 구조 층만 다시 입힌다.
 * 제도 데이터를 고치면 케이스가 조용히 어긋나므로, 손작성 층은 지키고
 * 파생 층만 갈아끼울 길이 있어야 한다.
 */
export function remergeCase(existingCase, institution) {
  const derivedSteps = deriveStepEntities(institution);
  const derivedIds = new Set(derivedSteps.map((entity) => entity.id));
  const authoredEntities = (existingCase.entities ?? []).filter((entity) => !entity.id.startsWith("step:"));
  const dropped = (existingCase.entities ?? [])
    .filter((entity) => entity.id.startsWith("step:") && !derivedIds.has(entity.id))
    .map((entity) => entity.id);

  const derivedRelations = deriveStepRelations(institution);
  const derivedRelationIds = new Set(derivedRelations.map((relation) => relation.id));
  const authoredRelations = (existingCase.relations ?? []).filter((relation) => (
    !(String(relation.from).startsWith("step:") && String(relation.to).startsWith("step:"))
  ));
  const droppedRelations = (existingCase.relations ?? [])
    .filter((relation) => (
      String(relation.from).startsWith("step:")
      && String(relation.to).startsWith("step:")
      && !derivedRelationIds.has(relation.id)
    ))
    .map((relation) => relation.id);

  return {
    merged: {
      ...existingCase,
      entities: [...authoredEntities, ...derivedSteps],
      relations: [...derivedRelations, ...authoredRelations],
    },
    dropped_step_ids: dropped,
    dropped_relation_ids: droppedRelations,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    if (!key) continue;
    args[key] = argv[index + 1];
  }
  return args;
}

/**
 * 기존 케이스를 원본 제도로 다시 파생해 합친다. 디스크에 쓰지 않는다 —
 * 재파생 진입점이 main() 안에만 있으면 검증기가 같은 일을 다시 구현하게 된다.
 */
export async function remergeFromSource(existingCase) {
  const institution = await loadInstitution(existingCase.institution_slug);
  return remergeCase(existingCase, institution);
}

async function remergeMain(caseRelativePath) {
  const casePath = path.join(REPO_DIR, "ontology", caseRelativePath);
  const existingCase = JSON.parse(await readFile(casePath, "utf8"));
  const { merged, dropped_step_ids: droppedSteps, dropped_relation_ids: droppedRelations } =
    await remergeFromSource(existingCase);
  await writeFile(casePath, `${JSON.stringify(merged, null, 1)}\n`);
  console.log(
    `${existingCase.case_id}: 구조 층 재파생 (단계 ${merged.entities.filter((e) => e.id.startsWith("step:")).length}, 관계 ${merged.relations.length})`,
  );
  if (droppedSteps.length > 0) console.log(`  제도에서 사라진 단계: ${droppedSteps.join(", ")}`);
  if (droppedRelations.length > 0) console.log(`  제도에서 사라진 관계: ${droppedRelations.join(", ")}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.remerge) return remergeMain(args.remerge);
  if (!args.slug || !args["case-id"] || !args["as-of"]) {
    throw new Error(
      "사용: --slug <slug> --case-id <id> --as-of <YYYY-MM-DD> [--out <path>]\n"
      + "      또는 --remerge samples/<파일>.case.json (구조 층만 재파생)",
    );
  }
  const institution = await loadInstitution(args.slug);
  const skeleton = deriveCaseSkeleton(institution, { caseId: args["case-id"], asOf: args["as-of"] });
  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(REPO_DIR, "ontology", "samples", `${args.slug}.derived.case.json`);
  await writeFile(outPath, `${JSON.stringify(skeleton, null, 1)}\n`);
  console.log(
    `${args.slug}: 노드 ${skeleton.derivation.node_count} / 엣지 ${skeleton.derivation.edge_count} 파생 → ${path.relative(REPO_DIR, outPath)}`,
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  await main();
}
