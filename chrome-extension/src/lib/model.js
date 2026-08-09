import {
  CONTRIBUTION_KIND,
  DRAFT_KIND,
  SCHEMA_VERSION,
  SITE_ORIGIN,
  WORKSPACE_KIND
} from "./constants.js";
import { normalizeText, sanitizeSourceUrl, scanForPersonalData } from "./privacy.js";

function now() {
  return new Date().toISOString();
}

export function makeId(prefix = "item") {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function list(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item, 500)).filter(Boolean);
  return String(value ?? "")
    .split(/\n|,/)
    .map((item) => normalizeText(item, 500))
    .filter(Boolean);
}

function normalizeLegalBasis(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      law: normalizeText(item?.law, 180),
      article: normalizeText(item?.article ?? item?.articles, 180),
      text: normalizeText(item?.text, 900),
      url: sanitizeSourceUrl(item?.url ?? item?.sourceUrl)
    }))
    .filter((item) => item.law || item.article || item.text);
}

function normalizeNode(node, index) {
  return {
    id: normalizeText(node?.id, 40) || `P${String(index + 1).padStart(2, "0")}`,
    name: normalizeText(node?.name, 160) || "이름 없는 단계",
    lane: normalizeText(node?.lane, 160),
    stage: normalizeText(node?.stage, 160),
    type: normalizeText(node?.type, 40) || "task",
    actor: normalizeText(node?.actor, 200),
    receiver: normalizeText(node?.receiver, 200),
    action: normalizeText(node?.action, 600),
    condition: normalizeText(node?.condition, 600),
    inputDocuments: list(node?.inputDocuments ?? node?.input_documents),
    outputDocuments: list(node?.outputDocuments ?? node?.output_documents),
    deadline: normalizeText(node?.deadline, 300),
    blocker: normalizeText(node?.blocker, 600),
    legalBasis: normalizeLegalBasis(node?.legalBasis ?? node?.legal_basis)
  };
}

function normalizeEdge(edge, index) {
  return {
    id: normalizeText(edge?.id, 40) || `E${String(index + 1).padStart(2, "0")}`,
    source: normalizeText(edge?.source, 40),
    target: normalizeText(edge?.target, 40),
    type: normalizeText(edge?.type, 40) || "sequence",
    label: normalizeText(edge?.label, 240)
  };
}

export function createBlankDraft(name = "새 제도 초안") {
  const timestamp = now();
  return {
    kind: DRAFT_KIND,
    schemaVersion: SCHEMA_VERSION,
    id: makeId("draft"),
    baseSlug: "",
    sourceUrl: "",
    name: normalizeText(name, 160),
    summary: "",
    category: "",
    asOfDate: "",
    purpose: "",
    contributionNote: "",
    lanes: ["신청인", "담당기관"],
    stages: ["G0 준비", "G1 처리"],
    nodes: [],
    edges: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createDraftFromInstitution(institution) {
  const process = institution?.process ?? {};
  const draft = createBlankDraft(institution?.name || process?.institution_name || "제도 초안");
  return {
    ...draft,
    baseSlug: normalizeText(institution?.slug, 180),
    sourceUrl:
      sanitizeSourceUrl(institution?.pageUrl) ||
      (institution?.slug ? `${SITE_ORIGIN}/model/${institution.slug}/` : ""),
    summary: normalizeText(institution?.oneLiner ?? institution?.summary, 600),
    category: normalizeText(institution?.category, 120),
    asOfDate: normalizeText(institution?.asOfDate, 30),
    purpose: normalizeText(institution?.canvas?.purpose ?? institution?.purpose, 1_500),
    lanes: list(process?.lanes).length ? list(process.lanes) : draft.lanes,
    stages: list(process?.stages).length ? list(process.stages) : draft.stages,
    nodes: (process?.nodes ?? institution?.nodes ?? []).map(normalizeNode),
    edges: (process?.edges ?? institution?.edges ?? []).map(normalizeEdge)
  };
}

export function normalizeDraft(value) {
  if (value?.kind === CONTRIBUTION_KIND && value?.institution) {
    return createDraftFromInstitution(value.institution);
  }
  if (value?.kind !== DRAFT_KIND) {
    return createDraftFromInstitution(value);
  }

  const base = createBlankDraft(value.name);
  return {
    ...base,
    ...value,
    kind: DRAFT_KIND,
    schemaVersion: SCHEMA_VERSION,
    id: normalizeText(value.id, 120) || base.id,
    baseSlug: normalizeText(value.baseSlug, 180),
    sourceUrl: sanitizeSourceUrl(value.sourceUrl),
    name: normalizeText(value.name, 160) || base.name,
    summary: normalizeText(value.summary, 600),
    category: normalizeText(value.category, 120),
    asOfDate: normalizeText(value.asOfDate, 30),
    purpose: normalizeText(value.purpose, 1_500),
    contributionNote: normalizeText(value.contributionNote, 1_000),
    lanes: list(value.lanes),
    stages: list(value.stages),
    nodes: (value.nodes ?? []).map(normalizeNode),
    edges: (value.edges ?? []).map(normalizeEdge),
    createdAt: value.createdAt || base.createdAt,
    updatedAt: now()
  };
}

export function nextNodeId(nodes) {
  const highest = nodes.reduce((max, node) => {
    const match = /^P(\d+)$/.exec(node.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `P${String(highest + 1).padStart(2, "0")}`;
}

export function nextEdgeId(edges) {
  const highest = edges.reduce((max, edge) => {
    const match = /^E(\d+)$/.exec(edge.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `E${String(highest + 1).padStart(2, "0")}`;
}

export function remapNodesForListChange(nodes, key, previousList, nextList) {
  if (previousList.length !== nextList.length) return nodes;
  const sameMembers =
    previousList.length === nextList.length && previousList.every((item) => nextList.includes(item));
  if (sameMembers) return nodes;
  const replacements = new Map(
    previousList
      .map((item, index) => [item, nextList[index]])
      .filter(([before, after]) => before && after && before !== after)
  );
  if (!replacements.size) return nodes;
  return nodes.map((node) => (replacements.has(node[key]) ? { ...node, [key]: replacements.get(node[key]) } : node));
}

export function validateDraft(draft, { checkPrivacy = true } = {}) {
  const errors = [];
  if (!draft?.name?.trim()) errors.push("제도명이 비어 있습니다.");
  if (!Array.isArray(draft?.lanes) || draft.lanes.length === 0) errors.push("행위주체를 하나 이상 입력하세요.");
  if (!Array.isArray(draft?.stages) || draft.stages.length === 0) errors.push("단계를 하나 이상 입력하세요.");
  if ((draft?.nodes?.length ?? 0) > 1_000) errors.push("업무 노드는 1,000개까지 저장할 수 있습니다.");

  const nodeIds = new Set();
  for (const node of draft?.nodes ?? []) {
    if (!node.id || nodeIds.has(node.id)) errors.push(`중복되거나 비어 있는 노드 ID: ${node.id || "없음"}`);
    nodeIds.add(node.id);
    if (!node.name) errors.push(`${node.id || "노드"}의 이름이 비어 있습니다.`);
    if (!draft.lanes.includes(node.lane)) errors.push(`${node.id}의 행위주체가 목록에 없습니다.`);
    if (!draft.stages.includes(node.stage)) errors.push(`${node.id}의 단계가 목록에 없습니다.`);
  }

  const edgeIds = new Set();
  for (const edge of draft?.edges ?? []) {
    if (!edge.id || edgeIds.has(edge.id)) errors.push(`중복되거나 비어 있는 연결 ID: ${edge.id || "없음"}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push(`${edge.id}가 존재하지 않는 노드를 연결합니다.`);
    }
  }

  const privacyFindings = checkPrivacy ? scanForPersonalData(draft) : [];
  return { valid: errors.length === 0 && privacyFindings.length === 0, errors, privacyFindings };
}

export function createContributionPackage(draft, sources = [], { target = "generic" } = {}) {
  const submissionTargets = {
    generic: { platform: "generic", channels: ["issue", "change-request"] },
    github: { platform: "github", channels: ["issue", "pull-request"] },
    gitlab: { platform: "gitlab", channels: ["issue", "merge-request"] }
  };
  const submission = submissionTargets[target] ?? submissionTargets.generic;
  const institution = {
    slug: draft.baseSlug,
    name: draft.name,
    oneLiner: draft.summary,
    category: draft.category,
    asOfDate: draft.asOfDate,
    canvas: { purpose: draft.purpose },
    process: {
      institution_name: draft.name,
      lanes: draft.lanes,
      stages: draft.stages,
      nodes: draft.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        lane: node.lane,
        stage: node.stage,
        type: node.type,
        actor: node.actor,
        receiver: node.receiver,
        action: node.action,
        condition: node.condition,
        input_documents: node.inputDocuments,
        output_documents: node.outputDocuments,
        deadline: node.deadline,
        blocker: node.blocker,
        legal_basis: node.legalBasis
      })),
      edges: draft.edges
    }
  };

  const evidence = sources.map((source) => ({
    title: source.title,
    url: sanitizeSourceUrl(source.url),
    capturedAt: source.capturedAt,
    nodeId: source.nodeId || ""
  }));

  return {
    kind: CONTRIBUTION_KIND,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now(),
    baseSlug: draft.baseSlug,
    changeSummary: draft.contributionNote || "Korea100 작업대에서 작성한 제도 초안",
    submission,
    institution,
    evidence,
    privacy: {
      personalDataIncluded: false,
      accountIdentityIncluded: false,
      excerptIncluded: false
    }
  };
}

export function createWorkspacePackage(drafts, sources, favorites) {
  return {
    kind: WORKSPACE_KIND,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now(),
    drafts,
    sources,
    favorites
  };
}

export function parseList(value) {
  return list(value);
}

export function parseLegalBasis(value) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [law = "", article = "", text = ""] = line.split("|").map((part) => part.trim());
      return { law, article, text, url: "" };
    });
}

export function formatLegalBasis(items) {
  return (items ?? []).map((item) => [item.law, item.article, item.text].filter(Boolean).join(" | ")).join("\n");
}
