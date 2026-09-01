#!/usr/bin/env node
/**
 * 마일스톤 하나 + 그것이 끌어 쓰는 제도 여럿 → 온톨로지 마일스톤 케이스 골격 파생.
 *
 * 제도 케이스(case_kind: institution)는 제도 하나의 안쪽을 답한다. 그런데 마일스톤에
 * 제도가 여섯이 걸리면 정작 물어야 할 것은 각 제도의 내부가 아니라 "그 여섯 중 어느
 * 조합을 밟을지"다. 그 조정 문제를 담는 것이 마일스톤 케이스다.
 *
 * 제도가 여럿이므로 단계 ID가 충돌한다. step:<slug>:<nodeId>로 이름을 붙인다.
 *
 * 사용:
 *   node ontology/scripts/derive-milestone-case.mjs --project gwangju-semiconductor-cluster \
 *     --milestone N23 --case-id GSC-N23-2026-0901 --as-of 2026-09-01
 *   node ontology/scripts/derive-milestone-case.mjs --remerge samples/<파일>.case.json
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { deriveStepEntities, ONTOLOGY_VERSION, INSTITUTION_DIR, loadInstitution } from "./derive-case.mjs";
import { loadProject, PROJECT_DIR, REPO_DIR } from "./derive-project-case.mjs";

/** 마일스톤이 참조하는 제도와 그 안에서 실제로 쓰이는 단계를 뽑는다. */
export function referencedInstitutions(milestone) {
  return (milestone.templateRefs ?? []).map((ref) => ({
    slug: ref.institution,
    mappingStatus: ref.mappingStatus ?? "exact",
    nodeIds: ref.nodeIds ?? null,
  }));
}

export function institutionEntity(ref, institution) {
  const readiness = institution.process?.agent_readiness ?? null;
  return {
    id: `institution:${ref.slug}`,
    type: "Institution",
    label: institution.name,
    // candidate는 적용 후보일 뿐 확정된 요건이 아니다. 단정하지 않는다.
    status: ref.mappingStatus === "candidate" ? "inferred" : "verified",
    attrs: {
      slug: ref.slug,
      mapping_status: ref.mappingStatus,
      referenced_step_ids: ref.nodeIds,
      applies_whole_template: ref.nodeIds === null,
      readiness_level: readiness?.level ?? "unassessed",
      readiness_mode: readiness?.mode ?? null,
      node_count: institution.process?.nodes?.length ?? 0,
    },
  };
}

/** 제도가 여럿이라 단계 ID가 충돌한다. 제도 슬러그로 이름을 붙인다. */
export function namespacedStepEntities(ref, institution) {
  const selected = ref.nodeIds
    ? institution.process.nodes.filter((node) => ref.nodeIds.includes(node.id))
    : institution.process.nodes;

  return deriveStepEntities({ ...institution, process: { ...institution.process, nodes: selected } })
    .map((entity) => ({
      ...entity,
      id: `step:${ref.slug}:${entity.attrs.process_id}`,
      // candidate 참조의 단계는 적용이 확정되지 않았다.
      status: ref.mappingStatus === "candidate" ? "inferred" : entity.status,
      attrs: {
        ...entity.attrs,
        institution_slug: ref.slug,
        mapping_status: ref.mappingStatus,
      },
    }));
}

export async function deriveMilestoneSkeleton(project, milestone, { caseId, asOf, institutions }) {
  const refs = referencedInstitutions(milestone);
  const institutionEntities = [];
  const stepEntities = [];
  const relations = [];

  for (const ref of refs) {
    const institution = institutions.get(ref.slug);
    if (!institution) continue;
    institutionEntities.push(institutionEntity(ref, institution));
    const steps = namespacedStepEntities(ref, institution);
    stepEntities.push(...steps);
    for (const step of steps) {
      relations.push({
        id: `R-owns-${ref.slug}-${step.attrs.process_id}`,
        type: "owns",
        from: `institution:${ref.slug}`,
        to: step.id,
        label: ref.mappingStatus === "candidate" ? "적용 후보 단계" : "적용 단계",
        condition: ref.mappingStatus,
      });
    }
  }

  const artifacts = (milestone.produces ?? []).map((artifact) => ({
    id: `artifact:${artifact}`,
    type: "Document",
    label: artifact,
    status: "verified",
    attrs: { artifact_id: artifact, produced_by_milestone: milestone.id },
  }));

  return {
    ontology_version: ONTOLOGY_VERSION,
    case_kind: "milestone",
    project_id: project.id,
    project_name: project.name,
    milestone_node_id: milestone.id,
    milestone_label: milestone.name,
    institution_slug: null,
    institution_slugs: refs.map((ref) => ref.slug),
    case_id: caseId,
    as_of: asOf,
    source_project_json: `web/data/mega-projects/projects/${project.id}.json`,
    derivation: {
      generator: "ontology/scripts/derive-milestone-case.mjs",
      derived_layers: [
        "Institution 엔티티(참조 제도와 mappingStatus·준비도)",
        "제도 슬러그로 이름 붙인 Step 엔티티",
        "owns 관계(제도 → 그 제도의 단계)",
      ],
      authored_layers: ["Case", "InformationItem", "Role", "State", "Rule", "ActionPacket", "demo_queries"],
      institution_count: institutionEntities.length,
      step_count: stepEntities.length,
      exact_refs: refs.filter((ref) => ref.mappingStatus !== "candidate").map((ref) => ref.slug),
      candidate_refs: refs.filter((ref) => ref.mappingStatus === "candidate").map((ref) => ref.slug),
    },
    entities: [...institutionEntities, ...artifacts, ...stepEntities],
    relations,
    states: [],
    rules: [],
    action_packets: [],
    demo_queries: [],
    notes: [
      "구조 층은 파생물이다. 오버레이를 고치면 --remerge로 다시 파생해야 한다.",
      "mappingStatus가 candidate인 제도는 적용 후보일 뿐 확정된 요건이 아니다.",
      "단계 ID는 제도 슬러그로 이름을 붙였다. 제도가 여럿이라 그러지 않으면 충돌한다.",
    ],
  };
}

/** 사람이 쓴 층은 지키고 파생 층만 갈아끼운다. */
export function remergeMilestoneCase(existingCase, derived) {
  const derivedPrefixes = ["institution:", "step:", "artifact:"];
  const isDerived = (id) => derivedPrefixes.some((prefix) => String(id).startsWith(prefix));

  const authoredEntities = (existingCase.entities ?? []).filter((entity) => !isDerived(entity.id));
  const authoredRelations = (existingCase.relations ?? []).filter((relation) => (
    !isDerived(relation.from) || !isDerived(relation.to)
  ));
  const derivedIds = new Set(derived.entities.map((entity) => entity.id));
  const dropped = (existingCase.entities ?? [])
    .filter((entity) => isDerived(entity.id) && !derivedIds.has(entity.id))
    .map((entity) => entity.id);

  return {
    merged: {
      ...derived,
      rules: existingCase.rules ?? [],
      action_packets: existingCase.action_packets ?? [],
      demo_queries: existingCase.demo_queries ?? [],
      states: existingCase.states ?? [],
      notes: existingCase.notes ?? derived.notes,
      entities: [...authoredEntities, ...derived.entities],
      relations: [...derived.relations, ...authoredRelations],
    },
    dropped_entity_ids: dropped,
  };
}

async function loadInstitutionsFor(milestone) {
  const entries = await Promise.all(
    referencedInstitutions(milestone).map(async (ref) => {
      try {
        return [ref.slug, await loadInstitution(ref.slug, { institutionDir: INSTITUTION_DIR })];
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter(Boolean));
}

export async function build(projectId, milestoneId, { caseId, asOf }) {
  const project = await loadProject(projectId, { projectDir: PROJECT_DIR });
  const milestone = project.nodes.find((node) => node.id === milestoneId);
  if (!milestone) throw new Error(`${projectId}에 ${milestoneId} 마일스톤이 없습니다.`);
  const institutions = await loadInstitutionsFor(milestone);
  return deriveMilestoneSkeleton(project, milestone, { caseId, asOf, institutions });
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    if (key) args[key] = argv[index + 1];
  }
  return args;
}

/** 기존 케이스를 오버레이로 다시 파생해 합친다. 디스크에 쓰지 않는다. */
export async function remergeFromSource(existingCase) {
  const derived = await build(existingCase.project_id, existingCase.milestone_node_id, {
    caseId: existingCase.case_id,
    asOf: existingCase.as_of,
  });
  return remergeMilestoneCase(existingCase, derived);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.remerge) {
    const casePath = path.join(REPO_DIR, "ontology", args.remerge);
    const existingCase = JSON.parse(await readFile(casePath, "utf8"));
    const { merged, dropped_entity_ids: dropped } = await remergeFromSource(existingCase);
    await writeFile(casePath, `${JSON.stringify(merged, null, 1)}\n`);
    console.log(
      `${existingCase.case_id}: 구조 층 재파생 (제도 ${merged.derivation.institution_count}, 단계 ${merged.derivation.step_count})`,
    );
    if (dropped.length > 0) console.log(`  오버레이에서 사라진 엔티티: ${dropped.join(", ")}`);
    return;
  }

  if (!args.project || !args.milestone || !args["case-id"] || !args["as-of"]) {
    throw new Error(
      "사용: --project <projectId> --milestone <Nxx> --case-id <id> --as-of <YYYY-MM-DD> [--out <path>]\n"
      + "      또는 --remerge samples/<파일>.case.json",
    );
  }

  const skeleton = await build(args.project, args.milestone, { caseId: args["case-id"], asOf: args["as-of"] });
  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(REPO_DIR, "ontology", "samples", `${args.project}-${args.milestone.toLowerCase()}.case.json`);
  await writeFile(outPath, `${JSON.stringify(skeleton, null, 1)}\n`);
  const { institution_count: institutions, step_count: steps, exact_refs: exact, candidate_refs: candidate } = skeleton.derivation;
  console.log(
    `${args.milestone}: 제도 ${institutions}(확정 ${exact.length}·후보 ${candidate.length}) / 단계 ${steps} 파생 → ${path.relative(REPO_DIR, outPath)}`,
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  await main();
}
