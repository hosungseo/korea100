#!/usr/bin/env node
/**
 * 메가프로젝트 오버레이 → 온톨로지 프로젝트 케이스 골격 파생.
 *
 * 지금까지의 케이스는 "제도 하나, 사건 하나"였다. 메가프로젝트는 다르다.
 * 마일스톤 54개가 아티팩트 53종을 주고받으며 제도 108개를 끌어 쓴다.
 * 어긋나는 지점이 제도 안이 아니라 제도 사이에 있다.
 *
 * 구조 층(마일스톤·아티팩트·제도·근거 엔티티와 requires·hands_off_to 관계)은
 * 오버레이 JSON의 투영이므로 파생한다. 사건 고유 층(Rule·ActionPacket·demo_queries)만
 * 사람이 쓴다.
 *
 * 사용:
 *   node ontology/scripts/derive-project-case.mjs --project gwangju-semiconductor-cluster \
 *     --case-id GSC-2026-0901-001 --as-of 2026-09-01
 *   node ontology/scripts/derive-project-case.mjs --remerge samples/<파일>.case.json
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
// 결정 위상은 워룸 지도와 같은 정본에서 계산한다. 여기 다시 쓰지 않는다.
import { milestoneTier } from "../../web/scripts/lib/mega-tier.mjs";

export const ONTOLOGY_VERSION = "korea100.ontology.core.v0";
export const REPO_DIR = fileURLToPath(new URL("../../", import.meta.url));
export const PROJECT_DIR = path.join(REPO_DIR, "web", "data", "mega-projects", "projects");
export const ARTIFACT_REGISTRY = path.join(REPO_DIR, "web", "data", "mega-projects", "artifacts.json");
export const INSTITUTION_DIR = path.join(REPO_DIR, "web", "data", "institutions");

/** 오버레이 진행 상태 → 온톨로지 State */
const STATUS_TO_STATE = Object.freeze({
  completed: "done",
  active: "in_progress",
  planned: "pending",
  unknown: "path_undetermined",
});

/**
 * 조건부 마일스톤의 활성화 규칙을 파라미터 실제값까지 풀어 둔다.
 * 규칙만 적어 두면 "조건부"라는 사실은 남지만 "지금 그 조건을 아는가"는 사라진다.
 */
function activationResolution(node, project) {
  const activation = node.activation ?? {};
  if (activation.mode !== "rule") return { mode: activation.mode ?? "always", determined: true };
  const rule = (project.rules ?? []).find((item) => item.id === activation.rule) ?? null;
  const parameter = rule ? project.parameters?.[rule.parameter] ?? null : null;
  const status = parameter?.status ?? "unknown";
  return {
    mode: "rule",
    rule: activation.rule,
    equals: activation.equals,
    parameter: rule?.parameter ?? null,
    parameter_status: status,
    parameter_value: parameter?.value ?? null,
    parameter_reason: parameter?.reason ?? null,
    determined: status !== "unknown",
  };
}

export function milestoneEntities(project) {
  return project.nodes.map((node) => ({
    id: `milestone:${node.id}`,
    type: "Gate",
    label: node.name,
    // confidence: official > modeled. modeled는 공개자료로 재구성한 것이라 단정하지 않는다.
    status: node.confidence === "official" ? "verified" : "inferred",
    attrs: {
      node_id: node.id,
      stage: node.stage,
      classification: node.classification ?? null,
      lead_actor: node.leadActor ?? null,
      actor_roles: node.actorRoles ?? null,
      // 결정 위상 — 결정주체(없으면 주도주체) 중 가장 높은 계층. 관심층 계산의 입력.
      decision_tier: milestoneTier(node),
      authority: node.authority ?? null,
      activation: node.activation?.mode ?? null,
      activation_rule: node.activation?.rule ?? null,
      activation_resolution: activationResolution(node, project),
      produces: node.produces ?? [],
      overlay_status: node.status,
      confidence: node.confidence ?? null,
      note: node.note ?? null,
    },
  }));
}

export function artifactEntities(project, registry) {
  const byId = new Map(registry.artifacts.map((artifact) => [artifact.id, artifact]));
  const used = new Set();
  for (const node of project.nodes) {
    for (const artifact of node.produces ?? []) used.add(artifact);
    for (const requirement of node.requires ?? []) used.add(requirement.artifact);
  }
  return [...used].sort().map((id) => {
    const artifact = byId.get(id);
    return {
      id: `artifact:${id}`,
      type: "Document",
      label: artifact?.label ?? id,
      status: artifact ? "verified" : "unverified",
      attrs: {
        artifact_id: id,
        category: artifact?.category ?? null,
        definition: artifact?.definition ?? null,
        in_registry: Boolean(artifact),
      },
    };
  });
}

export function roleEntities(project) {
  return (project.actors ?? []).map((actor) => ({
    id: `role:${actor.id}`,
    type: "Role",
    label: actor.label,
    status: "verified",
    attrs: { code: actor.code ?? null, mandate: actor.mandate ?? null },
  }));
}

export function sourceEntities(project) {
  return (project.sources ?? []).map((source) => ({
    id: `source:${source.id}`,
    type: source.type === "statute" ? "Statute" : "Document",
    label: source.title,
    status: "verified",
    attrs: {
      source_id: source.id,
      source_type: source.type,
      url: source.url ?? null,
      effective_on: source.effectiveOn ?? null,
      published_on: source.publishedOn ?? null,
    },
  }));
}

/**
 * 참조 제도는 Institution 엔티티가 된다. 준비도를 함께 싣는 것이 핵심이다.
 * 준비도가 R2가 아닌 제도를 끌어 쓴 마일스톤은 다음 행동을 계산할 수 없다.
 */
export function institutionEntities(project, readinessBySlug) {
  const refs = new Map();
  for (const node of project.nodes) {
    for (const ref of node.templateRefs ?? []) {
      const entry = refs.get(ref.institution) ?? {
        slug: ref.institution,
        referenced_by: [],
        mapping_statuses: new Set(),
        node_ids: new Set(),
      };
      entry.referenced_by.push(node.id);
      entry.mapping_statuses.add(ref.mappingStatus ?? "exact");
      for (const nodeId of ref.nodeIds ?? []) entry.node_ids.add(nodeId);
      refs.set(ref.institution, entry);
    }
  }
  return [...refs.values()]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((entry) => {
      const readiness = readinessBySlug.get(entry.slug) ?? null;
      return {
        id: `institution:${entry.slug}`,
        type: "Institution",
        label: readiness?.name ?? entry.slug,
        status: readiness?.level === "R2" ? "verified" : "unverified",
        attrs: {
          slug: entry.slug,
          readiness_level: readiness?.level ?? "unassessed",
          readiness_mode: readiness?.mode ?? null,
          referenced_by: entry.referenced_by,
          mapping_statuses: [...entry.mapping_statuses].sort(),
          referenced_step_ids: [...entry.node_ids].sort(),
        },
      };
    });
}

export function projectRelations(project) {
  const relations = [];
  const producerOf = new Map();
  for (const node of project.nodes) {
    for (const artifact of node.produces ?? []) {
      const list = producerOf.get(artifact) ?? [];
      list.push(node.id);
      producerOf.set(artifact, list);
    }
  }

  let requireIndex = 0;
  let handoffIndex = 0;
  for (const node of project.nodes) {
    if (node.leadActor) {
      relations.push({
        id: `R-owns-${node.id}`,
        type: "owns",
        from: `role:${node.leadActor}`,
        to: `milestone:${node.id}`,
        label: "책임 레인",
        condition: null,
      });
    }

    for (const requirement of node.requires ?? []) {
      requireIndex += 1;
      relations.push({
        id: `R-req-${String(requireIndex).padStart(3, "0")}`,
        type: "requires",
        from: `milestone:${node.id}`,
        to: `artifact:${requirement.artifact}`,
        label: requirement.relation,
        condition: requirement.strength,
        attrs: {
          relation: requirement.relation,
          strength: requirement.strength,
          kind: requirement.kind ?? null,
          basis: requirement.basis ?? [],
          note: requirement.note ?? null,
        },
      });

      // 아티팩트를 만드는 마일스톤 → 그것을 요구하는 마일스톤. 진짜 인계선이다.
      for (const producer of producerOf.get(requirement.artifact) ?? []) {
        if (producer === node.id) continue;
        handoffIndex += 1;
        relations.push({
          id: `R-handoff-${String(handoffIndex).padStart(3, "0")}`,
          type: "hands_off_to",
          from: `milestone:${producer}`,
          to: `milestone:${node.id}`,
          label: requirement.artifact,
          condition: requirement.strength,
          attrs: {
            artifact: requirement.artifact,
            relation: requirement.relation,
            strength: requirement.strength,
          },
        });
      }
    }

    for (const sourceId of node.evidence ?? []) {
      relations.push({
        id: `R-cites-${node.id}-${sourceId}`,
        type: "cites",
        from: `milestone:${node.id}`,
        to: `source:${sourceId}`,
        label: null,
        condition: null,
      });
    }
  }
  return relations;
}

export function milestoneStates(project, { asOf }) {
  return project.nodes.map((node) => ({
    id: `S-${node.id}`,
    entity_id: `milestone:${node.id}`,
    state: STATUS_TO_STATE[node.status] ?? node.status,
    as_of: node.actual?.completedOn ?? asOf,
    evidence: {
      kind: node.confidence === "official" ? "official_plan" : "proxy",
      source: (node.evidence ?? []).join(", ") || "overlay",
      ...(node.note ? { note: node.note } : {}),
    },
  }));
}

export async function loadReadiness({ institutionDir = INSTITUTION_DIR } = {}, slugs) {
  const entries = await Promise.all([...slugs].map(async (slug) => {
    try {
      const raw = await readFile(path.join(institutionDir, `${slug}.json`), "utf8");
      const institution = JSON.parse(raw);
      const readiness = institution.process?.agent_readiness ?? null;
      return [slug, {
        name: institution.name,
        level: readiness?.level ?? null,
        mode: readiness?.mode ?? null,
      }];
    } catch {
      return [slug, null];
    }
  }));
  return new Map(entries.filter(([, value]) => value));
}

function referencedSlugs(project) {
  const slugs = new Set();
  for (const node of project.nodes) {
    for (const ref of node.templateRefs ?? []) slugs.add(ref.institution);
  }
  return slugs;
}

export async function deriveProjectSkeleton(project, registry, { caseId, asOf, readinessBySlug }) {
  const entities = [
    {
      id: `case:${caseId}`,
      type: "Case",
      label: `${project.name} 사업 케이스`,
      status: "verified",
      attrs: {
        project_id: project.id,
        project_family: project.projectFamily ?? null,
        overlay_status: project.status,
        overlay_as_of: project.asOfDate,
        scope: project.scope ?? null,
        parameters: project.parameters ?? null,
      },
    },
    ...roleEntities(project),
    ...institutionEntities(project, readinessBySlug),
    ...sourceEntities(project),
    ...artifactEntities(project, registry),
    ...milestoneEntities(project),
  ];

  return {
    ontology_version: ONTOLOGY_VERSION,
    case_kind: "project",
    project_id: project.id,
    project_name: project.name,
    institution_slug: null,
    case_id: caseId,
    as_of: asOf,
    source_project_json: `web/data/mega-projects/projects/${project.id}.json`,
    source_artifact_registry: "web/data/mega-projects/artifacts.json",
    derivation: {
      generator: "ontology/scripts/derive-project-case.mjs",
      derived_layers: [
        "Gate(마일스톤)·Document(아티팩트)·Institution(참조 제도)·Statute/Document(근거) 엔티티",
        "requires·hands_off_to·owns·cites 관계",
        "마일스톤 진행 상태",
      ],
      authored_layers: ["Rule", "ActionPacket", "demo_queries"],
      milestone_count: project.nodes.length,
      artifact_count: entities.filter((entity) => entity.id.startsWith("artifact:")).length,
      institution_count: entities.filter((entity) => entity.id.startsWith("institution:")).length,
      source_count: (project.sources ?? []).length,
    },
    entities,
    relations: projectRelations(project),
    states: [
      {
        id: "S-case",
        entity_id: `case:${caseId}`,
        state: project.status,
        as_of: project.asOfDate,
        evidence: { kind: "official_plan", source: "mega-project overlay" },
      },
      ...milestoneStates(project, { asOf }),
    ],
    rules: [],
    action_packets: [],
    demo_queries: [],
    notes: [
      "구조 층은 파생물이다. 오버레이(web/data/mega-projects)를 고치면 이 파일도 다시 파생해야 한다.",
      "참조 제도의 준비도는 Institution 엔티티의 attrs.readiness_level에 있다. R2가 아니면 다음 행동을 계산하지 않는다.",
      "mappingStatus가 candidate인 참조는 적용 후보일 뿐 확정된 요건이 아니다.",
    ],
  };
}

/** 사람이 쓴 층은 지키고 파생 층만 갈아끼운다. */
export function remergeProjectCase(existingCase, derived) {
  const authoredPrefixes = ["case:"];
  const derivedPrefixes = ["role:", "institution:", "source:", "artifact:", "milestone:"];
  const isDerived = (id) => derivedPrefixes.some((prefix) => String(id).startsWith(prefix));

  const authoredEntities = (existingCase.entities ?? []).filter((entity) => (
    !isDerived(entity.id) && !authoredPrefixes.some((prefix) => String(entity.id).startsWith(prefix))
  ));
  const derivedIds = new Set(derived.entities.map((entity) => entity.id));
  const dropped = (existingCase.entities ?? [])
    .filter((entity) => isDerived(entity.id) && !derivedIds.has(entity.id))
    .map((entity) => entity.id);

  const authoredRelations = (existingCase.relations ?? []).filter((relation) => (
    !isDerived(relation.from) || !isDerived(relation.to)
  ));

  return {
    merged: {
      ...derived,
      rules: existingCase.rules ?? [],
      action_packets: existingCase.action_packets ?? [],
      demo_queries: existingCase.demo_queries ?? [],
      notes: existingCase.notes ?? derived.notes,
      entities: [...derived.entities, ...authoredEntities],
      relations: [...derived.relations, ...authoredRelations],
    },
    dropped_entity_ids: dropped,
  };
}

export async function loadProject(projectId, { projectDir = PROJECT_DIR } = {}) {
  return JSON.parse(await readFile(path.join(projectDir, `${projectId}.json`), "utf8"));
}

export async function loadArtifactRegistry({ registryPath = ARTIFACT_REGISTRY } = {}) {
  return JSON.parse(await readFile(registryPath, "utf8"));
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

export async function build(projectId, { caseId, asOf }) {
  const project = await loadProject(projectId);
  const registry = await loadArtifactRegistry();
  const readinessBySlug = await loadReadiness({}, referencedSlugs(project));
  return deriveProjectSkeleton(project, registry, { caseId, asOf, readinessBySlug });
}

/** 기존 케이스를 오버레이로 다시 파생해 합친다. 디스크에 쓰지 않는다. */
export async function remergeFromSource(existingCase) {
  const derived = await build(existingCase.project_id, {
    caseId: existingCase.case_id,
    asOf: existingCase.as_of,
  });
  return remergeProjectCase(existingCase, derived);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.remerge) {
    const casePath = path.join(REPO_DIR, "ontology", args.remerge);
    const existingCase = JSON.parse(await readFile(casePath, "utf8"));
    const { merged, dropped_entity_ids: droppedIds } = await remergeFromSource(existingCase);
    await writeFile(casePath, `${JSON.stringify(merged, null, 1)}\n`);
    console.log(`${existingCase.case_id}: 구조 층 재파생 (마일스톤 ${merged.derivation.milestone_count}, 관계 ${merged.relations.length})`);
    if (droppedIds.length > 0) console.log(`  오버레이에서 사라진 엔티티: ${droppedIds.join(", ")}`);
    return;
  }

  if (!args.project || !args["case-id"] || !args["as-of"]) {
    throw new Error(
      "사용: --project <projectId> --case-id <id> --as-of <YYYY-MM-DD> [--out <path>]\n"
      + "      또는 --remerge samples/<파일>.case.json",
    );
  }

  const skeleton = await build(args.project, { caseId: args["case-id"], asOf: args["as-of"] });
  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(REPO_DIR, "ontology", "samples", `${args.project}.case.json`);
  await writeFile(outPath, `${JSON.stringify(skeleton, null, 1)}\n`);
  const { milestone_count: milestones, artifact_count: artifacts, institution_count: institutions } = skeleton.derivation;
  console.log(
    `${args.project}: 마일스톤 ${milestones} / 아티팩트 ${artifacts} / 참조 제도 ${institutions} / 관계 ${skeleton.relations.length} 파생 → ${path.relative(REPO_DIR, outPath)}`,
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  await main();
}
