/**
 * Case ↔ Institution linkage check.
 *
 * 온톨로지 케이스(ontology/samples/*.case.json)는 제도 업무구조도
 * (web/data/institutions/*.json)의 투영이다. 지금까지 그 대응을 아무도 검사하지 않았다.
 * 한쪽 그래프가 바뀌면 케이스는 조용히 어긋난다.
 *
 * 이 모듈은 두 층을 대조해 어긋남을 드러내고, 제도의 준비도 등급에 따라
 * 다음 행동 계산이 허용되는지(R2)를 판정한다. 읽기 전용이다.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_INSTITUTION_DIR = fileURLToPath(
  new URL("../../web/data/institutions/", import.meta.url),
);

const STEP_PREFIX = "step:";

function stepIdOf(entityId) {
  return String(entityId).startsWith(STEP_PREFIX) ? String(entityId).slice(STEP_PREFIX.length) : null;
}

/** 준비도 등급만 읽는다. R2 게이트를 통과하지 못한 제도도 읽을 수 있어야 한다. */
export async function loadInstitutionForLinkage(slug, { institutionDir = DEFAULT_INSTITUTION_DIR } = {}) {
  if (!slug || /[^a-z0-9-]/u.test(slug)) return null;
  try {
    const raw = await readFile(path.join(institutionDir, `${slug}.json`), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function checkCaseLinkage(caseData, institution) {
  const slug = caseData.institution_slug ?? null;

  if (!institution) {
    return {
      institution_slug: slug,
      institution_found: false,
      status: "institution_not_found",
      readiness: null,
      next_action_allowed: false,
      steps: null,
      sequence: null,
      notes: ["케이스가 가리키는 제도 파일을 찾지 못했습니다. 제도 슬러그를 확인하세요."],
    };
  }

  const nodes = institution.process?.nodes ?? [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const institutionEdges = new Set(
    (institution.process?.edges ?? []).map((edge) => `${edge.source}>${edge.target}`),
  );

  const caseStepIds = [...new Set([
    ...(caseData.entities ?? []).map((entity) => stepIdOf(entity.id)),
    ...(caseData.states ?? []).map((state) => stepIdOf(state.entity_id)),
  ].filter(Boolean))];

  const unknownStepIds = caseStepIds.filter((id) => !nodeById.has(id));
  const uncoveredNodeIds = nodes.map((node) => node.id).filter((id) => !caseStepIds.includes(id));

  const labelMismatches = [];
  for (const entity of caseData.entities ?? []) {
    const id = stepIdOf(entity.id);
    if (!id) continue;
    const node = nodeById.get(id);
    if (node && node.name !== entity.label) {
      labelMismatches.push({ step_id: id, case_label: entity.label, institution_name: node.name });
    }
  }

  const stepRelations = (caseData.relations ?? []).filter((relation) => (
    stepIdOf(relation.from) && stepIdOf(relation.to)
  ));
  const unknownEdges = stepRelations
    .filter((relation) => !institutionEdges.has(`${stepIdOf(relation.from)}>${stepIdOf(relation.to)}`))
    .map((relation) => ({ relation_id: relation.id, from: relation.from, to: relation.to, type: relation.type }));

  const readinessRaw = institution.process?.agent_readiness ?? null;
  const readiness = readinessRaw
    ? {
      level: readinessRaw.level,
      mode: readinessRaw.mode,
      assessed_at: readinessRaw.assessed_at,
      last_live_check: readinessRaw.last_live_check
        ? {
          checked_at: readinessRaw.last_live_check.checked_at,
          status: readinessRaw.last_live_check.status,
          verified_references: readinessRaw.last_live_check.verified_references,
          article_references: readinessRaw.last_live_check.article_references,
        }
        : null,
      blockers: readinessRaw.blockers ?? [],
    }
    : null;

  const drifted = unknownStepIds.length > 0 || labelMismatches.length > 0 || unknownEdges.length > 0;
  const status = drifted ? "drifted" : "aligned";

  const notes = [];
  if (drifted) {
    notes.push("케이스와 제도 업무구조도가 어긋났습니다. 케이스 판단을 신뢰하지 말고 먼저 대조를 맞추세요.");
  }
  if (!readiness) {
    notes.push("제도에 준비도 평가가 없습니다. 참고용으로만 쓰세요.");
  } else if (readiness.level !== "R2") {
    notes.push(
      `제도 준비도 ${readiness.level}(${readiness.mode})입니다. 다음 행동 자동 계산 대상이 아니며 남은 차단 사유: ${readiness.blockers.join("; ") || "없음"}`,
    );
  }
  if (uncoveredNodeIds.length > 0) {
    notes.push(`케이스가 다루지 않는 제도 단계 ${uncoveredNodeIds.length}개가 있습니다.`);
  }

  return {
    institution_slug: slug,
    institution_found: true,
    institution_name: institution.name ?? null,
    status,
    readiness,
    next_action_allowed: status === "aligned" && readiness?.level === "R2",
    steps: {
      case_step_count: caseStepIds.length,
      institution_node_count: nodes.length,
      unknown_step_ids: unknownStepIds,
      uncovered_node_ids: uncoveredNodeIds,
      label_mismatches: labelMismatches,
    },
    sequence: {
      case_relation_count: stepRelations.length,
      institution_edge_count: institutionEdges.size,
      unknown_edges: unknownEdges,
    },
    notes,
    execution_allowed: false,
  };
}

export const DEFAULT_PROJECT_DIR = fileURLToPath(
  new URL("../../web/data/mega-projects/projects/", import.meta.url),
);

export async function loadProjectForLinkage(projectId, { projectDir = DEFAULT_PROJECT_DIR } = {}) {
  if (!projectId || /[^a-z0-9-]/u.test(projectId)) return null;
  try {
    return JSON.parse(await readFile(path.join(projectDir, `${projectId}.json`), "utf8"));
  } catch {
    return null;
  }
}

/**
 * 프로젝트 케이스는 제도 하나가 아니라 오버레이 그래프와 대조한다.
 * 마일스톤·아티팩트·참조 제도 세 층이 모두 원본과 맞아야 한다.
 */
export function checkProjectLinkage(caseData, project, institutionReadiness = new Map()) {
  if (!project) {
    return {
      case_kind: "project",
      project_id: caseData.project_id ?? null,
      project_found: false,
      status: "project_not_found",
      next_action_allowed: false,
      notes: ["케이스가 가리키는 메가프로젝트 파일을 찾지 못했습니다."],
      execution_allowed: false,
    };
  }

  const overlayNodeIds = new Set(project.nodes.map((node) => node.id));
  const caseMilestones = (caseData.entities ?? []).filter((entity) => entity.id.startsWith("milestone:"));
  const unknownMilestoneIds = caseMilestones
    .map((entity) => entity.attrs?.node_id)
    .filter((nodeId) => !overlayNodeIds.has(nodeId));
  const uncoveredNodeIds = [...overlayNodeIds].filter((nodeId) => (
    !caseMilestones.some((entity) => entity.attrs?.node_id === nodeId)
  ));

  const overlayNameById = new Map(project.nodes.map((node) => [node.id, node.name]));
  const labelMismatches = caseMilestones
    .filter((entity) => overlayNameById.get(entity.attrs?.node_id) !== entity.label)
    .map((entity) => ({
      node_id: entity.attrs?.node_id,
      case_label: entity.label,
      overlay_name: overlayNameById.get(entity.attrs?.node_id) ?? null,
    }));

  const overlayEdges = new Set();
  for (const node of project.nodes) {
    for (const requirement of node.requires ?? []) {
      overlayEdges.add(`${node.id}>${requirement.artifact}`);
    }
  }
  const caseRequires = (caseData.relations ?? []).filter((relation) => relation.type === "requires");
  const unknownRequires = caseRequires
    .filter((relation) => {
      const nodeId = String(relation.from).replace("milestone:", "");
      const artifactId = String(relation.to).replace("artifact:", "");
      return !overlayEdges.has(`${nodeId}>${artifactId}`);
    })
    .map((relation) => ({ relation_id: relation.id, from: relation.from, to: relation.to }));

  // 참조 제도 준비도를 케이스에 박아 둔 값과 현재 제도 파일을 다시 대조한다.
  const caseInstitutions = (caseData.entities ?? []).filter((entity) => entity.id.startsWith("institution:"));
  const staleReadiness = caseInstitutions
    .filter((entity) => {
      const current = institutionReadiness.get(entity.attrs?.slug);
      const recorded = entity.attrs?.readiness_level ?? "unassessed";
      return current !== undefined && current !== recorded;
    })
    .map((entity) => ({
      slug: entity.attrs?.slug,
      recorded: entity.attrs?.readiness_level,
      current: institutionReadiness.get(entity.attrs?.slug),
    }));

  const r2Count = caseInstitutions
    .filter((entity) => entity.attrs?.readiness_level === "R2").length;

  const drifted = unknownMilestoneIds.length > 0
    || labelMismatches.length > 0
    || unknownRequires.length > 0
    || staleReadiness.length > 0;

  const notes = [];
  if (drifted) {
    notes.push("케이스와 메가프로젝트 오버레이가 어긋났습니다. --remerge로 구조 층을 다시 파생하세요.");
  }
  if (r2Count === 0) {
    notes.push(
      `참조 제도 ${caseInstitutions.length}개 중 R2가 없습니다. 마일스톤 내부 절차는 이 케이스로 답하지 않습니다.`,
    );
  }
  if (uncoveredNodeIds.length > 0) {
    notes.push(`케이스가 다루지 않는 오버레이 마일스톤 ${uncoveredNodeIds.length}개가 있습니다.`);
  }

  return {
    case_kind: "project",
    project_id: caseData.project_id,
    project_name: project.name,
    project_found: true,
    status: drifted ? "drifted" : "aligned",
    milestones: {
      case_milestone_count: caseMilestones.length,
      overlay_node_count: overlayNodeIds.size,
      unknown_milestone_ids: unknownMilestoneIds,
      uncovered_node_ids: uncoveredNodeIds,
      label_mismatches: labelMismatches,
    },
    dependencies: {
      case_requires_count: caseRequires.length,
      overlay_requires_count: overlayEdges.size,
      unknown_requires: unknownRequires,
    },
    institutions: {
      referenced_count: caseInstitutions.length,
      r2_count: r2Count,
      stale_readiness: staleReadiness,
    },
    // 프로젝트는 참조 제도가 전부 R2여야 마일스톤 내부 절차까지 답할 수 있다.
    next_action_allowed: !drifted && caseInstitutions.length > 0 && r2Count === caseInstitutions.length,
    notes,
    execution_allowed: false,
  };
}

async function readInstitutionReadiness(caseData, options) {
  const slugs = (caseData.entities ?? [])
    .filter((entity) => entity.id.startsWith("institution:"))
    .map((entity) => entity.attrs?.slug)
    .filter(Boolean);
  const entries = await Promise.all(slugs.map(async (slug) => {
    const institution = await loadInstitutionForLinkage(slug, options);
    if (!institution) return null;
    return [slug, institution.process?.agent_readiness?.level ?? "unassessed"];
  }));
  return new Map(entries.filter(Boolean));
}

/**
 * 제도 케이스가 "프로젝트의 어느 마일스톤을 안쪽에서 채운다"고 주장할 때 그 주장을 검사한다.
 * 주장만 적어 두면 오버레이가 바뀌어도 아무도 모른다.
 */
export function checkProjectContext(caseData, project) {
  const context = caseData.project_context;
  if (!context) return null;

  if (!project) {
    return {
      claimed: context,
      status: "project_not_found",
      notes: ["케이스가 가리키는 메가프로젝트 파일을 찾지 못했습니다."],
    };
  }

  const milestone = project.nodes.find((node) => node.id === context.milestone_node_id);
  if (!milestone) {
    return {
      claimed: context,
      status: "milestone_not_found",
      notes: [`오버레이에 ${context.milestone_node_id} 마일스톤이 없습니다.`],
    };
  }

  const referenced = (milestone.templateRefs ?? []).map((ref) => ref.institution);
  const slug = caseData.institution_slug;
  const notes = [];
  let status = "aligned";

  if (!referenced.includes(slug)) {
    status = "drifted";
    notes.push(
      `${context.milestone_node_id}은 ${slug}을 참조하지 않습니다. 참조 제도: ${referenced.join(", ") || "없음"}`,
    );
  }
  if (context.milestone_label && context.milestone_label !== milestone.name) {
    status = "drifted";
    notes.push(`마일스톤 이름이 갈라졌습니다: 케이스="${context.milestone_label}" 오버레이="${milestone.name}"`);
  }

  return {
    claimed: context,
    status,
    milestone_name: milestone.name,
    milestone_stage: milestone.stage ?? null,
    milestone_status: milestone.status ?? null,
    referenced_institutions: referenced,
    notes,
  };
}

/**
 * 마일스톤 케이스는 제도 하나가 아니라 그 마일스톤이 끌어 쓰는 제도 전부와 대조한다.
 * 단계 ID가 step:<slug>:<nodeId>로 이름 붙어 있으므로 제도별로 나눠 확인한다.
 */
export function checkMilestoneLinkage(caseData, project, institutions) {
  if (!project) {
    return {
      case_kind: "milestone",
      project_id: caseData.project_id ?? null,
      milestone_node_id: caseData.milestone_node_id ?? null,
      status: "project_not_found",
      next_action_allowed: false,
      notes: ["케이스가 가리키는 메가프로젝트 파일을 찾지 못했습니다."],
      execution_allowed: false,
    };
  }

  const milestone = project.nodes.find((node) => node.id === caseData.milestone_node_id);
  if (!milestone) {
    return {
      case_kind: "milestone",
      project_id: caseData.project_id,
      milestone_node_id: caseData.milestone_node_id,
      status: "milestone_not_found",
      next_action_allowed: false,
      notes: [`오버레이에 ${caseData.milestone_node_id} 마일스톤이 없습니다.`],
      execution_allowed: false,
    };
  }

  const overlayRefs = new Map(
    (milestone.templateRefs ?? []).map((ref) => [ref.institution, {
      mappingStatus: ref.mappingStatus ?? "exact",
      nodeIds: ref.nodeIds ?? null,
    }]),
  );

  const caseInstitutions = (caseData.entities ?? []).filter((entity) => entity.id.startsWith("institution:"));
  const caseSlugs = caseInstitutions.map((entity) => entity.attrs?.slug);
  const missingFromCase = [...overlayRefs.keys()].filter((slug) => !caseSlugs.includes(slug));
  const unknownInCase = caseSlugs.filter((slug) => !overlayRefs.has(slug));

  const mappingMismatches = caseInstitutions
    .filter((entity) => {
      const overlay = overlayRefs.get(entity.attrs?.slug);
      return overlay && overlay.mappingStatus !== entity.attrs?.mapping_status;
    })
    .map((entity) => ({
      slug: entity.attrs?.slug,
      case_mapping: entity.attrs?.mapping_status,
      overlay_mapping: overlayRefs.get(entity.attrs?.slug)?.mappingStatus,
    }));

  // step:<slug>:<nodeId>가 그 제도의 실제 노드인지 확인한다.
  const unknownStepIds = [];
  for (const entity of caseData.entities ?? []) {
    if (!entity.id.startsWith("step:")) continue;
    const slug = entity.attrs?.institution_slug;
    const nodeId = entity.attrs?.process_id;
    const institution = institutions.get(slug);
    if (!institution || !institution.process?.nodes?.some((node) => node.id === nodeId)) {
      unknownStepIds.push(entity.id);
    }
  }

  const readiness = caseInstitutions.map((entity) => ({
    slug: entity.attrs?.slug,
    mapping_status: entity.attrs?.mapping_status,
    recorded_level: entity.attrs?.readiness_level,
    current_level: institutions.get(entity.attrs?.slug)?.process?.agent_readiness?.level ?? "unassessed",
  }));
  const staleReadiness = readiness.filter((item) => item.recorded_level !== item.current_level);
  const notReady = readiness.filter((item) => item.current_level !== "R2");

  const drifted = missingFromCase.length > 0
    || unknownInCase.length > 0
    || mappingMismatches.length > 0
    || unknownStepIds.length > 0
    || staleReadiness.length > 0;

  const notes = [];
  if (drifted) notes.push("케이스와 오버레이가 어긋났습니다. --remerge로 구조 층을 다시 파생하세요.");
  if (notReady.length > 0) {
    notes.push(`참조 제도 ${notReady.length}개가 R2가 아닙니다: ${notReady.map((item) => item.slug).join(", ")}`);
  }
  const candidates = readiness.filter((item) => item.mapping_status === "candidate");
  if (candidates.length > 0) {
    notes.push(
      `적용 후보 제도 ${candidates.length}개는 확정 요건이 아닙니다: ${candidates.map((item) => item.slug).join(", ")}`,
    );
  }

  return {
    case_kind: "milestone",
    project_id: caseData.project_id,
    project_name: project.name,
    milestone_node_id: milestone.id,
    milestone_name: milestone.name,
    status: drifted ? "drifted" : "aligned",
    institutions: {
      case_count: caseInstitutions.length,
      overlay_count: overlayRefs.size,
      exact: readiness.filter((item) => item.mapping_status !== "candidate").map((item) => item.slug),
      candidate: candidates.map((item) => item.slug),
      missing_from_case: missingFromCase,
      unknown_in_case: unknownInCase,
      mapping_mismatches: mappingMismatches,
      stale_readiness: staleReadiness,
      not_ready: notReady.map((item) => item.slug),
    },
    steps: {
      case_step_count: (caseData.entities ?? []).filter((entity) => entity.id.startsWith("step:")).length,
      unknown_step_ids: unknownStepIds,
    },
    next_action_allowed: !drifted && caseInstitutions.length > 0 && notReady.length === 0,
    notes,
    execution_allowed: false,
  };
}

async function readInstitutions(slugs, options) {
  const entries = await Promise.all(slugs.map(async (slug) => {
    const institution = await loadInstitutionForLinkage(slug, options);
    return institution ? [slug, institution] : null;
  }));
  return new Map(entries.filter(Boolean));
}

export async function checkCaseLinkageFor(caseData, options = {}) {
  if (caseData?.case_kind === "milestone") {
    const project = await loadProjectForLinkage(caseData.project_id, options);
    const slugs = new Set([
      ...(caseData.institution_slugs ?? []),
      ...(project?.nodes ?? [])
        .filter((node) => node.id === caseData.milestone_node_id)
        .flatMap((node) => (node.templateRefs ?? []).map((ref) => ref.institution)),
    ]);
    return checkMilestoneLinkage(caseData, project, await readInstitutions([...slugs], options));
  }

  if (caseData?.case_kind === "project") {
    const project = await loadProjectForLinkage(caseData.project_id, options);
    const readiness = await readInstitutionReadiness(caseData, options);
    return checkProjectLinkage(caseData, project, readiness);
  }
  const institution = await loadInstitutionForLinkage(caseData.institution_slug, options);
  const linkage = checkCaseLinkage(caseData, institution);

  if (caseData.project_context) {
    const project = await loadProjectForLinkage(caseData.project_context.project_id, options);
    const projectContext = checkProjectContext(caseData, project);
    linkage.project_context = projectContext;
    if (projectContext.status !== "aligned") {
      linkage.status = "drifted";
      linkage.next_action_allowed = false;
      linkage.notes.push(...projectContext.notes);
    }
  }

  return linkage;
}
