import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "mega-projects");
const PROJECT_DIR = path.join(DATA_DIR, "projects");
const INSTITUTION_DIR = path.join(WEB_DIR, "data", "institutions");
const ARTIFACT_PATH = path.join(DATA_DIR, "artifacts.json");

const ARTIFACT_CATEGORIES = new Set([
  "policy",
  "governance",
  "designation",
  "plan",
  "participation",
  "environment",
  "land",
  "infrastructure",
  "permit",
  "construction",
  "operation",
]);
const PROJECT_STATUSES = new Set(["policy-announced", "planning", "permitting", "construction", "operating"]);
const NODE_STATUSES = new Set(["completed", "active", "planned", "unknown"]);
const NODE_CLASSES = new Set([
  "policy",
  "governance",
  "plan",
  "legal_gate",
  "protection_gate",
  "technical_gate",
  "delivery",
  "operation",
]);
const CONFIDENCE_LEVELS = new Set(["official", "statutory", "modeled", "unknown"]);
const RELATIONS = new Set(["finish_to_start", "start_to_start", "finish_to_finish", "satisfied_by"]);
const STRENGTHS = new Set(["hard", "soft"]);
const DEPENDENCY_KINDS = new Set(["legal", "protection", "technical", "policy", "financial"]);
const RULE_TYPES = new Set(["boolean", "enum"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
const warnings = [];

function fail(scope, message) {
  errors.push(`${scope}: ${message}`);
}

function warn(scope, message) {
  warnings.push(`${scope}: ${message}`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(path.relative(WEB_DIR, filePath), `JSON 파싱 실패 (${error.message})`);
    return null;
  }
}

function uniqueMap(items, key, scope, label) {
  const result = new Map();
  for (const item of items ?? []) {
    const value = item?.[key];
    if (!value) {
      fail(scope, `${label}에 ${key}가 없습니다`);
      continue;
    }
    if (result.has(value)) fail(`${scope}/${value}`, `${label} ${key}가 중복됩니다`);
    result.set(value, item);
  }
  return result;
}

function ruleValue(project, rule) {
  const parameter = project.parameters?.[rule.parameter];
  return parameter?.value ?? rule.default;
}

function compareRule(project, ruleMap, condition, scope) {
  if (!condition) return true;
  const rule = ruleMap.get(condition.rule);
  if (!rule) {
    fail(scope, `알 수 없는 rule ${condition.rule}`);
    return null;
  }
  const value = ruleValue(project, rule);
  if (value === null || value === undefined || value === "unknown") return null;
  return value === condition.equals;
}

function activationState(project, ruleMap, node, scope) {
  const activation = node.activation;
  if (!activation || activation.mode === "always") return true;
  if (activation.mode !== "rule") {
    fail(scope, `지원하지 않는 activation.mode ${activation.mode}`);
    return null;
  }
  return compareRule(project, ruleMap, activation, `${scope}#activation`);
}

function findCycle(nodeIds, adjacency) {
  const state = new Map();
  const stack = [];

  function visit(nodeId) {
    const current = state.get(nodeId) ?? 0;
    if (current === 1) {
      const index = stack.indexOf(nodeId);
      return [...stack.slice(index), nodeId];
    }
    if (current === 2) return null;

    state.set(nodeId, 1);
    stack.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(nodeId, 2);
    return null;
  }

  for (const nodeId of nodeIds) {
    const cycle = visit(nodeId);
    if (cycle) return cycle;
  }
  return null;
}

const registry = readJson(ARTIFACT_PATH);
if (!registry) process.exitCode = 1;

if (registry && registry.schemaVersion !== "1.0.0") {
  fail("data/mega-projects/artifacts.json", `지원하지 않는 schemaVersion ${registry.schemaVersion}`);
}
if (registry && !ISO_DATE.test(registry.asOfDate ?? "")) {
  fail("data/mega-projects/artifacts.json", "asOfDate는 YYYY-MM-DD 형식이어야 합니다");
}

const artifactMap = uniqueMap(
  registry?.artifacts,
  "id",
  "data/mega-projects/artifacts.json",
  "artifact",
);
for (const [artifactId, artifact] of artifactMap) {
  const scope = `data/mega-projects/artifacts.json#${artifactId}`;
  if (!artifact.label?.trim()) fail(scope, "label이 없습니다");
  if (!artifact.definition?.trim()) fail(scope, "definition이 없습니다");
  if (!ARTIFACT_CATEGORIES.has(artifact.category)) {
    fail(scope, `지원하지 않는 category ${artifact.category}`);
  }
  if (artifact.producerMode && artifact.producerMode !== "alternative") {
    fail(scope, `지원하지 않는 producerMode ${artifact.producerMode}`);
  }
}

const institutionCache = new Map();
function institutionNodeIds(slug) {
  if (institutionCache.has(slug)) return institutionCache.get(slug);
  const filePath = path.join(INSTITUTION_DIR, `${slug}.json`);
  if (!fs.existsSync(filePath)) {
    institutionCache.set(slug, null);
    return null;
  }
  const data = readJson(filePath);
  const ids = data ? new Set((data.process?.nodes ?? []).map((node) => node.id)) : null;
  institutionCache.set(slug, ids);
  return ids;
}

const projectFiles = fs.existsSync(PROJECT_DIR)
  ? fs.readdirSync(PROJECT_DIR).filter((file) => file.endsWith(".json")).sort()
  : [];
if (projectFiles.length === 0) fail("data/mega-projects/projects", "프로젝트 JSON이 없습니다");

const reports = [];
for (const file of projectFiles) {
  const filePath = path.join(PROJECT_DIR, file);
  const project = readJson(filePath);
  if (!project) continue;
  const projectScope = `data/mega-projects/projects/${file}`;

  if (project.schemaVersion !== "1.0.0") {
    fail(projectScope, `지원하지 않는 schemaVersion ${project.schemaVersion}`);
  }
  if (project.id !== file.replace(/\.json$/, "")) fail(projectScope, "id는 파일명과 같아야 합니다");
  if (!ISO_DATE.test(project.asOfDate ?? "")) fail(projectScope, "asOfDate는 YYYY-MM-DD 형식이어야 합니다");
  if (!PROJECT_STATUSES.has(project.status)) fail(projectScope, `지원하지 않는 status ${project.status}`);

  const sourceMap = uniqueMap(project.sources, "id", projectScope, "source");
  for (const [sourceId, source] of sourceMap) {
    const sourceScope = `${projectScope}#source:${sourceId}`;
    if (!source.title?.trim()) fail(sourceScope, "title이 없습니다");
    if (!source.type?.trim()) fail(sourceScope, "type이 없습니다");
    if (!source.url?.startsWith("https://")) fail(sourceScope, "url은 HTTPS여야 합니다");
    if (source.publishedOn && !ISO_DATE.test(source.publishedOn)) fail(sourceScope, "publishedOn 형식 오류");
    if (source.effectiveOn && !ISO_DATE.test(source.effectiveOn)) fail(sourceScope, "effectiveOn 형식 오류");
  }

  const stageMap = uniqueMap(project.stages, "id", projectScope, "stage");
  const ruleMap = uniqueMap(project.rules, "id", projectScope, "rule");
  for (const [ruleId, rule] of ruleMap) {
    const ruleScope = `${projectScope}#rule:${ruleId}`;
    if (!RULE_TYPES.has(rule.type)) fail(ruleScope, `지원하지 않는 type ${rule.type}`);
    if (!project.parameters?.[rule.parameter]) fail(ruleScope, `parameter ${rule.parameter}가 없습니다`);
    if (rule.type === "boolean" && rule.default !== null && typeof rule.default !== "boolean") {
      fail(ruleScope, "boolean rule의 default는 true, false 또는 null이어야 합니다");
    }
    if (rule.type === "enum") {
      if (!Array.isArray(rule.allowed) || rule.allowed.length < 2) fail(ruleScope, "enum allowed가 부족합니다");
      if (!rule.allowed?.includes(rule.default)) fail(ruleScope, "default가 allowed에 없습니다");
      const value = project.parameters?.[rule.parameter]?.value;
      if (value !== null && value !== undefined && !rule.allowed?.includes(value)) {
        fail(ruleScope, `parameter 값 ${value}가 allowed에 없습니다`);
      }
    }
    const value = ruleValue(project, rule);
    if (value === null || value === "unknown") warn(ruleScope, "조건값이 미확정입니다");
  }

  const nodeMap = uniqueMap(project.nodes, "id", projectScope, "node");
  const producers = new Map();
  let dependencyCount = 0;
  let conditionalNodeCount = 0;

  for (const [nodeId, node] of nodeMap) {
    const nodeScope = `${projectScope}#${nodeId}`;
    if (!node.name?.trim()) fail(nodeScope, "name이 없습니다");
    if (!stageMap.has(node.stage)) fail(nodeScope, `알 수 없는 stage ${node.stage}`);
    if (!node.authority?.trim()) fail(nodeScope, "authority가 없습니다");
    if (!NODE_STATUSES.has(node.status)) fail(nodeScope, `지원하지 않는 status ${node.status}`);
    if (!NODE_CLASSES.has(node.classification)) {
      fail(nodeScope, `지원하지 않는 classification ${node.classification}`);
    }
    if (!CONFIDENCE_LEVELS.has(node.confidence)) fail(nodeScope, `지원하지 않는 confidence ${node.confidence}`);

    const active = activationState(project, ruleMap, node, nodeScope);
    if (node.activation?.mode === "rule") conditionalNodeCount += 1;
    if (node.status === "completed") {
      if (!ISO_DATE.test(node.actual?.completedOn ?? "")) fail(nodeScope, "completed 노드에 actual.completedOn이 없습니다");
      if (active === false) fail(nodeScope, "비활성 조건부 노드가 completed 상태입니다");
    }

    for (const sourceId of node.evidence ?? []) {
      if (!sourceMap.has(sourceId)) fail(nodeScope, `알 수 없는 evidence ${sourceId}`);
    }
    if (!Array.isArray(node.evidence) || node.evidence.length === 0) fail(nodeScope, "evidence가 없습니다");

    for (const ref of node.templateRefs ?? []) {
      const refScope = `${nodeScope}#template:${ref.institution ?? "unknown"}`;
      if (!ref.institution) {
        fail(refScope, "institution이 없습니다");
        continue;
      }
      const ids = institutionNodeIds(ref.institution);
      if (!ids) {
        fail(refScope, "참조한 Korea100 institution 파일이 없습니다");
        continue;
      }
      for (const processNodeId of ref.nodeIds ?? []) {
        if (!ids.has(processNodeId)) fail(refScope, `process node ${processNodeId}가 없습니다`);
      }
    }

    if (!Array.isArray(node.requires)) fail(nodeScope, "requires가 배열이 아닙니다");
    for (const [index, dependency] of (node.requires ?? []).entries()) {
      dependencyCount += 1;
      const depScope = `${nodeScope}#requires:${index + 1}`;
      if (!artifactMap.has(dependency.artifact)) fail(depScope, `알 수 없는 artifact ${dependency.artifact}`);
      if (!RELATIONS.has(dependency.relation)) fail(depScope, `지원하지 않는 relation ${dependency.relation}`);
      if (!STRENGTHS.has(dependency.strength)) fail(depScope, `지원하지 않는 strength ${dependency.strength}`);
      if (!DEPENDENCY_KINDS.has(dependency.kind)) fail(depScope, `지원하지 않는 kind ${dependency.kind}`);
      if (!Array.isArray(dependency.basis) || dependency.basis.length === 0) fail(depScope, "basis가 없습니다");
      for (const sourceId of dependency.basis ?? []) {
        if (!sourceMap.has(sourceId)) fail(depScope, `알 수 없는 basis source ${sourceId}`);
      }
      if (dependency.whenRule) compareRule(project, ruleMap, dependency.whenRule, `${depScope}#whenRule`);
    }

    if (!Array.isArray(node.produces) || node.produces.length === 0) fail(nodeScope, "produces가 없습니다");
    for (const artifactId of node.produces ?? []) {
      if (!artifactMap.has(artifactId)) {
        fail(nodeScope, `알 수 없는 produced artifact ${artifactId}`);
        continue;
      }
      if (!producers.has(artifactId)) producers.set(artifactId, []);
      producers.get(artifactId).push(nodeId);
    }
  }

  for (const [artifactId, producerIds] of producers) {
    if (producerIds.length > 1 && artifactMap.get(artifactId)?.producerMode !== "alternative") {
      fail(projectScope, `artifact ${artifactId}의 producer가 중복됩니다 (${producerIds.join(", ")})`);
    }
  }

  for (const [nodeId, node] of nodeMap) {
    for (const dependency of node.requires ?? []) {
      if (!producers.has(dependency.artifact)) {
        fail(`${projectScope}#${nodeId}`, `required artifact ${dependency.artifact}의 producer가 없습니다`);
      }
    }
  }

  const adjacency = new Map([...nodeMap.keys()].map((nodeId) => [nodeId, new Set()]));
  for (const [consumerId, node] of nodeMap) {
    for (const dependency of node.requires ?? []) {
      if (dependency.strength !== "hard" || dependency.relation === "satisfied_by") continue;
      const condition = compareRule(project, ruleMap, dependency.whenRule, `${projectScope}#${consumerId}`);
      if (condition === false) continue;
      for (const producerId of producers.get(dependency.artifact) ?? []) {
        if (producerId !== consumerId) adjacency.get(producerId)?.add(consumerId);
      }
    }
  }
  const cycle = findCycle([...nodeMap.keys()], adjacency);
  if (cycle) fail(projectScope, `hard dependency cycle이 있습니다 (${cycle.join(" -> ")})`);

  const completedArtifacts = new Set();
  const startedArtifacts = new Set();
  for (const [nodeId, node] of nodeMap) {
    const active = activationState(project, ruleMap, node, `${projectScope}#${nodeId}`);
    if (active === false) continue;
    if (node.status === "active" || node.status === "completed") {
      for (const artifactId of node.produces ?? []) startedArtifacts.add(artifactId);
    }
    if (node.status === "completed") {
      for (const artifactId of node.produces ?? []) completedArtifacts.add(artifactId);
    }
  }

  const ready = [];
  const conditionalUnknown = [];
  for (const [nodeId, node] of nodeMap) {
    if (node.status === "completed" || node.status === "active") continue;
    const active = activationState(project, ruleMap, node, `${projectScope}#${nodeId}`);
    if (active === null) {
      conditionalUnknown.push(nodeId);
      continue;
    }
    if (!active) continue;

    let blocked = false;
    for (const dependency of node.requires ?? []) {
      if (dependency.strength !== "hard") continue;
      const condition = compareRule(project, ruleMap, dependency.whenRule, `${projectScope}#${nodeId}`);
      if (condition === null) {
        blocked = true;
        break;
      }
      if (!condition || dependency.relation === "finish_to_finish" || dependency.relation === "satisfied_by") continue;
      const satisfied = dependency.relation === "start_to_start"
        ? startedArtifacts.has(dependency.artifact)
        : completedArtifacts.has(dependency.artifact);
      if (!satisfied) {
        blocked = true;
        break;
      }
    }
    if (!blocked) ready.push(nodeId);
  }

  reports.push({
    id: project.id,
    nodes: nodeMap.size,
    dependencies: dependencyCount,
    conditionalNodes: conditionalNodeCount,
    ready,
    conditionalUnknown,
  });
}

if (errors.length > 0) {
  console.error(`메가프로젝트 데이터 검증 실패 (${errors.length}건)`);
  for (const error of errors) console.error(`- ${error}`);
  if (warnings.length > 0) {
    console.error(`\n경고 (${warnings.length}건)`);
    for (const message of warnings) console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log(`메가프로젝트 데이터 검증 통과: artifact ${artifactMap.size}개, project ${reports.length}개`);
for (const report of reports) {
  console.log(`- ${report.id}: node ${report.nodes}개, dependency ${report.dependencies}개, 조건부 ${report.conditionalNodes}개`);
  console.log(`  지금 착수 가능: ${report.ready.length > 0 ? report.ready.join(", ") : "없음"}`);
  console.log(`  조건 미확정: ${report.conditionalUnknown.length > 0 ? report.conditionalUnknown.join(", ") : "없음"}`);
}
if (warnings.length > 0) {
  console.log(`경고 ${warnings.length}건 (오류 아님)`);
  for (const message of warnings) console.log(`- ${message}`);
}
