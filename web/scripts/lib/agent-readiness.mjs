import { createHash } from "node:crypto";

const EXPLICIT_ARTICLE = /제\s*\d+(?:\s*조(?:의\s*\d+)?|\s*[~∼·-]\s*\d+\s*조)/u;
const CONDITIONAL_TEXT = /(선택|필요시|필요한 경우|해당하는 경우|요건 충족 시|이의|불복|재심|보완|반려|공청회)/u;
const TEMPLATE_TEXT = /(필요한 행위와 증빙을 확인하고 다음 담당자에게 인계한다|부터.+까지.+대상·요건 확인)/u;

export const AGENT_READINESS_LEVELS = new Set(["R0", "R1", "R2", "R3", "R4"]);
export const AGENT_MODES = new Set(["reference-only", "next-action"]);
export const AGENT_EVENTS = new Set([
  "procedure.started",
  "predecessor.completed",
  "application.received",
  "approval.completed",
  "notice.received",
  "supplement.requested",
  "external.reply.received",
  "objection.filed",
  "inspection.completed",
  "manual.confirmed",
]);
export const OBLIGATION_LEVELS = new Set([
  "required",
  "conditional",
  "optional",
  "operational",
  "unclassified",
]);
export const BASIS_STATUSES = new Set([
  "citation-verified",
  "source-linked",
  "unverified",
  "descriptive",
  "none",
]);
export const AUTOMATION_LEVELS = new Set(["inform-only", "draft-with-review", "manual-only"]);
export const LIVE_LEGAL_CHECK_STATUSES = new Set(["passed", "partial", "failed"]);
export const OFFICIAL_LAW_API_METHOD = "law.go.kr-DRF-direct";
export const DEADLINE_RULE_TYPES = new Set([
  "statutory",
  // 법령이 "지체 없이"처럼 즉시성만 정하고 날짜 계산은 주지 않는 경우.
  // statutory로 묶으면 계산 가능한 기한이 있는 것처럼 보이고,
  // needs-verification으로 묶으면 근거를 모르는 것처럼 보인다. 둘 다 사실이 아니다.
  "statutory-immediate",
  // 법령이 "5년을 단위로", "매년"처럼 **주기**만 정하는 경우. 법정 의무이지만
  // 사건 시점에서 날짜를 계산할 수 없다 — statutory-immediate와 같은 이유로 따로 둔다.
  "statutory-cycle",
  "internal-target",
  "document-defined",
  "not-specified",
  "needs-verification",
]);

const IMMEDIATE_DEADLINE = /(지체\s*없이|즉시)/u;

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function hasExplicitArticle(node) {
  const basis = node.legal_basis ?? [];
  return basis.length > 0 && basis.every((item) => EXPLICIT_ARTICLE.test(item.article ?? ""));
}

function isTemplateNode(node) {
  return TEMPLATE_TEXT.test(`${node.name ?? ""} ${node.action ?? ""}`);
}

function deriveBasisStatus(node, institution) {
  const basis = node.legal_basis ?? [];
  if (basis.length === 0) return "none";
  if (basis.some((item) => item.unverified === true)) return "unverified";
  if (!hasExplicitArticle(node)) return "descriptive";
  return institution.verification?.status === "article-verified" ? "citation-verified" : "source-linked";
}

function deriveObligation(node, basisStatus) {
  const text = `${node.name ?? ""} ${node.action ?? ""}`;
  if (/\(선택\)|임의/u.test(text)) return "optional";
  if (CONDITIONAL_TEXT.test(text)) return "conditional";
  if (basisStatus === "citation-verified") return "required";
  if (basisStatus === "none") return "operational";
  return "unclassified";
}

// "상시", "발의 시", "심사 종료 시" — 언제 시작하는지를 말할 뿐 언제까지 해야 하는지가 없다.
// 기한이 아니라 계기다. 법이 기한을 안 정했다는 사실이므로 not-specified가 맞다
// (needs-verification으로 두면 "근거를 모른다"는 뜻이 되어 사실과 다르다).
// 앞에 공백이 있는 "시"만 잡는다 — "공개 일시"의 끝 글자에 걸려 계산 가능한 기한을
// 계기로 내린 적이 있다.
const TRIGGER_ONLY_DEADLINE = /^(상시|수시|즉시)$|(때|\s시|시점)$/u;
// "5년을 단위로", "매년", "연 1회" — 법정 주기.
const CYCLE_DEADLINE = /(\d+\s*년을?\s*단위|매\s*(년|분기|월)|연\s*\d+\s*회|주기적)/u;

function deriveDeadlineRule(node, basisStatus) {
  const expression = typeof node.deadline === "string" && node.deadline.trim() ? node.deadline.trim() : null;
  if (!expression) return { type: "not-specified", expression: null };
  // 조문에 기한이 없다고 데이터가 스스로 밝힌 경우. 표현은 남기고 성격만 바로잡는다.
  if (/기한\s*(규정\s*)?없음/u.test(expression)) return { type: "not-specified", expression };
  if (/(내부|목표|예상|권고)/u.test(expression)) return { type: "internal-target", expression };
  if (
    /(개별 법령|공고|통지서|부과서|지정된 기한|기관별|협의)/u.test(expression)
    && /(정한|기재된|기간|기한)/u.test(expression)
  ) {
    return { type: "document-defined", expression };
  }
  if (/(법정|이내|날부터|받은 날|제출기한|처리기한|\d+\s*(?:일|개월|년)\s*이상)/u.test(expression)) {
    return { type: "statutory", expression };
  }
  if (
    basisStatus === "citation-verified"
    && /\d+\s*(일|개월|년)/u.test(expression)
    && /(부터|일부터|후|까지|수령일|통보일|종료)/u.test(expression)
  ) {
    return { type: "statutory", expression };
  }
  // 근거 조문이 확인된 "지체 없이"는 법정 의무다. 다만 날짜로 환산되지 않는다.
  if (basisStatus === "citation-verified" && IMMEDIATE_DEADLINE.test(expression)) {
    return { type: "statutory-immediate", expression };
  }
  // 주기 판정은 계산 가능한 기한을 다 본 뒤에 한다. "매년 1월 31일까지"는 주기이면서
  // 날짜가 계산되므로 statutory가 맞고, 여기까지 온 것만 순수 주기다.
  if (basisStatus === "citation-verified" && CYCLE_DEADLINE.test(expression)) {
    return { type: "statutory-cycle", expression };
  }
  if (TRIGGER_ONLY_DEADLINE.test(expression)) return { type: "not-specified", expression };
  return { type: "needs-verification", expression };
}

function deriveTriggerEvent(node, incomingEdges, nodeById) {
  if (incomingEdges.length === 0) return "procedure.started";
  if (incomingEdges.some((edge) => edge.type === "loop")) return "supplement.requested";
  if (/(이의신청|불복|심판청구|재심사청구)/u.test(node.name ?? "")) return "objection.filed";
  if (/(접수|신청 수령|청구 수령)/u.test(node.name ?? "")) return "application.received";
  if (/(통지 수령|결과 수령|송달)/u.test(node.name ?? "")) return "notice.received";
  const predecessors = incomingEdges.map((edge) => nodeById.get(edge.source)).filter(Boolean);
  if (predecessors.some((item) => /(결재|승인|허가|결정|확정|협의내용 통보)/u.test(item.name ?? ""))) {
    return "approval.completed";
  }
  if (predecessors.some((item) => /(조사|점검|검사) 완료/u.test(item.name ?? ""))) return "inspection.completed";
  if (incomingEdges.some((edge) => edge.type === "message")) return "external.reply.received";
  return "predecessor.completed";
}

function deriveTriggerCondition(node, incomingEdges, nodeById) {
  if (incomingEdges.length === 0) return `해당 절차가 개시되고 '${node.name}' 수행 요건이 확인될 때`;
  const predecessorNames = unique(incomingEdges.map((edge) => nodeById.get(edge.source)?.name)).slice(0, 3);
  if (incomingEdges.some((edge) => edge.type === "loop")) {
    return `보완·재수행이 결정되어 '${node.name}' 단계로 회귀할 때`;
  }
  return `${predecessorNames.join("·")} 완료 결과가 '${node.name}' 단계로 인계될 때`;
}

function deriveCompletionCondition(node, outputs) {
  if (node.type === "gateway") return `'${node.name}' 판단 결과와 후속 분기가 기록될 때`;
  if (node.type === "notice") return `'${node.name}' 통지와 송달·수령 기록이 남을 때`;
  if (outputs.length > 0) {
    return `다음 산출물이 생성·기록되어 후속 단계에서 확인될 때: ${outputs.join(", ")}`;
  }
  return `'${node.action ?? node.name}' 수행 완료를 담당자가 확인할 때`;
}

function deriveNodeInputs(node, incomingEdges, nodeById) {
  if (Array.isArray(node.input_documents) && node.input_documents.length > 0) return unique(node.input_documents);
  return unique(incomingEdges.flatMap((edge) => nodeById.get(edge.source)?.output_documents ?? []));
}

function deriveRecipients(node, outgoingEdges, nodeById) {
  const explicit = Array.isArray(node.recipients)
    ? node.recipients
    : typeof node.receiver === "string"
      ? [node.receiver]
      : [];
  const handoffs = outgoingEdges
    .map((edge) => nodeById.get(edge.target)?.actor)
    .filter((actor) => actor && actor !== node.actor);
  return unique([...explicit, ...handoffs]);
}

export function deriveNodeAgentContract(node, context) {
  const { institution, incomingEdges, outgoingEdges, nodeById } = context;
  const basisStatus = deriveBasisStatus(node, institution);
  const outputs = unique(node.output_documents ?? []);
  const lowConfidence = (node.confidence ?? 1) < 0.8;
  const templateLike = isTemplateNode(node);
  return {
    trigger_event: deriveTriggerEvent(node, incomingEdges, nodeById),
    trigger_condition: deriveTriggerCondition(node, incomingEdges, nodeById),
    completion_condition: deriveCompletionCondition(node, outputs),
    obligation: deriveObligation(node, basisStatus),
    basis_status: basisStatus,
    automation_level: basisStatus === "citation-verified" && !lowConfidence && !templateLike
      ? "draft-with-review"
      : "inform-only",
    human_confirmation_required: true,
    resolved_input_documents: deriveNodeInputs(node, incomingEdges, nodeById),
    completion_evidence: outputs,
    handoff_recipients: deriveRecipients(node, outgoingEdges, nodeById),
    deadline_rule: deriveDeadlineRule(node, basisStatus),
    derivation: "existing-data-and-graph",
  };
}

export function deriveEdgeAgentTransition(edge, nodeById, { sourceOutgoingCount = 1 } = {}) {
  const source = nodeById.get(edge.source);
  const target = nodeById.get(edge.target);
  // 이 인계가 실제로 옮기는 문서.
  //
  // 종전 식은 `source.outputs ∪ (target.inputs ∩ source.outputs)` 였는데 둘째 항이
  // 첫째 항의 부분집합이라 아무 일도 하지 않았다 — 좁히려던 의도가 무효였고,
  // 결과적으로 한 노드에서 갈라지는 모든 엣지가 같은 문서 목록을 복사해 달고 있었다
  // (전이 대조에서 "분기별로 갈리지 않은 채 복사된 handoff.documents"로 지적됨).
  //
  // 뒤 단계가 입력을 선언했고 그것이 앞 단계 산출물과 겹치면 그 교집합이 이 분기가
  // 옮기는 문서다. 겹치는 것이 없으면 좁히지 않는다 — 저장소 전체에서 교집합이
  // 비는 엣지가 909개인데, 그때 문서를 지우면 인계가 아무것도 안 옮기는 것처럼 보인다.
  const outputs = unique(source?.output_documents ?? []);
  const shared = outputs.filter((item) => (target?.input_documents ?? []).includes(item));
  const documents = shared.length > 0 ? shared : outputs;
  return {
    condition: edge.label?.trim()
      || (edge.type === "loop"
        ? `'${target?.name}' 보완·재수행이 필요할 때`
        : `'${source?.name}' 완료 결과가 '${target?.name}' 단계로 인계될 때`),
    transition_type: edge.type === "loop" || sourceOutgoingCount > 1 ? "conditional" : "required",
    handoff: {
      from_actor: source?.actor ?? "",
      to_actor: target?.actor ?? "",
      documents,
    },
    human_confirmation_required: true,
  };
}

function ratio(part, total) {
  return total === 0 ? 0 : Number((part / total).toFixed(4));
}

export function agentCitationFingerprint(institution) {
  const sources = (institution.verification?.sources ?? []).map((source) => ({
    law: source.law ?? "",
    officialName: source.officialName ?? "",
    sourceType: source.sourceType ?? "statute",
    lawId: source.lawId ?? "",
    adminRuleId: source.adminRuleId ?? "",
  })).sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b)));
  const nodes = (institution.process?.nodes ?? []).map((node) => ({
    id: node.id,
    legal_basis: (node.legal_basis ?? []).map((basis) => ({
      law: basis.law ?? "",
      article: basis.article ?? "",
      unverified: basis.unverified === true,
    })).sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b))),
  })).sort((a, b) => compareText(a.id, b.id));
  return `sha256:${createHash("sha256").update(JSON.stringify({ sources, nodes })).digest("hex")}`;
}

function hasPassedLiveLegalCheck(check, institution) {
  // 대조 대상은 실행 대상 노드다. 참고용으로 격리된 노드는 다음 행동 계산에
  // 쓰이지 않으므로 그 노드가 검증되지 않았다고 해서 대조가 실패한 것은 아니다.
  const nodeIds = (institution.process?.nodes ?? [])
    .filter((node) => referenceOnlyReasons(node).length === 0)
    .map((node) => node.id);
  const verifiedNodeIds = new Set(check?.verified_node_ids ?? []);
  return check?.status === "passed"
    && check.method === OFFICIAL_LAW_API_METHOD
    && check.citation_fingerprint === agentCitationFingerprint(institution)
    && check.sources_checked > 0
    && check.source_failures === 0
    && check.article_references > 0
    && check.verified_references === check.article_references
    && check.missing_references?.length === 0
    && check.uncheckable_references?.length === 0
    && check.unverified_node_ids?.length === 0
    && nodeIds.length === verifiedNodeIds.size
    && nodeIds.every((nodeId) => verifiedNodeIds.has(nodeId))
    && check.source_results?.every((source) => source.status === "passed");
}

function liveLegalCheckBlocker(check, institution) {
  if (!check) return "법제처 API 현행 조문 직접 대조 미완료";
  if (check.method !== OFFICIAL_LAW_API_METHOD) return "공식 법제처 DRF API 직접 대조 방식이 아님";
  if (check.citation_fingerprint !== agentCitationFingerprint(institution)) {
    return "법제처 API 대조 이후 조문 또는 원문 식별자가 변경됨";
  }
  if (check.status === "passed") {
    return hasPassedLiveLegalCheck(check, institution) ? null : "법제처 API 대조 결과 집계 무결성 오류";
  }
  return `법제처 API 현행 조문 직접 대조 ${check.status ?? "failed"}(누락 ${check.missing_references?.length ?? 0}건, 확인불가 ${check.uncheckable_references?.length ?? 0}건)`;
}

/**
 * 노드 하나를 '참고용'으로 떼어 낼 사유.
 *
 * 근거의 품질 문제만 여기 들어온다. 모델 자체가 미완인 것(계약 누락, 증빙 문서 없음,
 * 템플릿성 문장, 명시 조문 없음)은 제도 전체를 막는 사유로 남긴다. 근거가 약한 노드는
 * 격리하면 되지만 모델이 비어 있으면 격리할 대상 자체가 불분명하기 때문이다.
 */
export function referenceOnlyReasons(node) {
  const reasons = [];
  if ((node.confidence ?? 1) < 0.8) reasons.push("신뢰도 0.8 미만");
  if (node.agent?.basis_status === "unverified") reasons.push("근거가 미검증으로 표시됨");
  if (node.agent?.obligation === "unclassified") reasons.push("의무 성격 미분류");
  if (node.agent?.deadline_rule?.type === "needs-verification") reasons.push("기한 성격 재확인 필요");
  return reasons;
}

/**
 * 참고용 노드를 빼고 나면 절차를 끝까지 걸을 수 있는가.
 *
 * 잎에 달린 노드 하나를 떼는 것과 중간 노드를 떼서 앞뒤가 끊기는 것은 다르다.
 * 후자는 남은 노드가 다 검증됐어도 다음 행동을 계산할 수 없다.
 * 방향을 무시한 연결성으로 본다. 회귀·메시지 엣지도 경로를 잇기 때문이다.
 */
export function severedActionablePath(actionableNodes, edges) {
  if (actionableNodes.length <= 1) return false;
  const ids = new Set(actionableNodes.map((node) => node.id));
  const neighbors = new Map([...ids].map((id) => [id, []]));
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    neighbors.get(edge.source).push(edge.target);
    neighbors.get(edge.target).push(edge.source);
  }

  const seen = new Set([actionableNodes[0].id]);
  const queue = [actionableNodes[0].id];
  while (queue.length > 0) {
    for (const next of neighbors.get(queue.pop()) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size !== ids.size;
}

export function assessAgentReadiness(
  institution,
  { transitionReviewed = false, assessedAt = "2026-07-16", liveLegalCheck = null } = {},
) {
  const nodes = institution.process?.nodes ?? [];
  const edges = institution.process?.edges ?? [];
  const explicitBasisNodes = nodes.filter(hasExplicitArticle);
  const outputNodes = nodes.filter((node) => (node.output_documents ?? []).length > 0);
  const lowConfidenceNodes = nodes.filter((node) => (node.confidence ?? 1) < 0.8);
  const templateNodes = nodes.filter(isTemplateNode);
  const deadlineReviewNodes = nodes.filter((node) => node.agent?.deadline_rule?.type === "needs-verification");
  const contractedNodes = nodes.filter((node) => node.agent);
  const contractedEdges = edges.filter((edge) => edge.agent_transition);
  const referenceOnlyNodes = nodes.filter((node) => referenceOnlyReasons(node).length > 0);
  const actionableNodes = nodes.filter((node) => !referenceOnlyNodes.includes(node));
  const severed = severedActionablePath(actionableNodes, edges);
  const metrics = {
    nodes: nodes.length,
    edges: edges.length,
    node_contract_coverage: ratio(contractedNodes.length, nodes.length),
    transition_contract_coverage: ratio(contractedEdges.length, edges.length),
    explicit_basis_coverage: ratio(explicitBasisNodes.length, nodes.length),
    output_document_coverage: ratio(outputNodes.length, nodes.length),
    low_confidence_nodes: lowConfidenceNodes.length,
    template_like_nodes: templateNodes.length,
    deadline_review_nodes: deadlineReviewNodes.length,
    reference_only_nodes: referenceOnlyNodes.length,
    actionable_coverage: ratio(actionableNodes.length, nodes.length),
    field_verification_items: institution.fieldVerification?.length ?? 0,
  };
  const blockers = [];
  if (metrics.node_contract_coverage < 1) blockers.push("노드 에이전트 계약이 완전하지 않음");
  if (metrics.transition_contract_coverage < 1) blockers.push("연결선 전이 조건이 완전하지 않음");
  if (metrics.explicit_basis_coverage < 1) blockers.push(`명시 조문이 없는 노드 ${nodes.length - explicitBasisNodes.length}개`);
  if (metrics.output_document_coverage < 1) blockers.push(`완료 증빙 문서가 없는 노드 ${nodes.length - outputNodes.length}개`);
  if (templateNodes.length > 0) blockers.push(`템플릿성 행위 문장 노드 ${templateNodes.length}개`);
  // 근거가 약한 노드는 제도 전체를 막지 않는다. 참고용으로 떼어 격리하고
  // 서비스가 그 노드를 지나는 다음 행동 계산을 거부한다.
  // 다만 떼어 낸 뒤 절차가 끊기면 계산 자체가 불가능하므로 그때는 막는다.
  if (actionableNodes.length === 0) blockers.push("실행 대상 노드가 없음");
  else if (severed) blockers.push(`참고용 노드 ${referenceOnlyNodes.length}개를 제외하면 실행 경로가 끊어짐`);
  if (!transitionReviewed) blockers.push("전이 조건·인계 수동 대조 미완료");
  const liveCheckBlocker = liveLegalCheckBlocker(liveLegalCheck, institution);
  if (liveCheckBlocker) blockers.push(liveCheckBlocker);

  const sourceReady = institution.verification?.status === "article-verified";
  const level = blockers.length === 0 && sourceReady && hasPassedLiveLegalCheck(liveLegalCheck, institution)
    ? "R2"
    : sourceReady
      ? "R1"
      : "R0";
  return {
    contract_version: "1.1.0",
    level,
    mode: level === "R2" ? "next-action" : "reference-only",
    assessed_at: assessedAt,
    assessment_method: [
      "스키마 검증·그래프 파생",
      transitionReviewed ? "전이 수동 대조" : "전이 수동 대조 필요",
      hasPassedLiveLegalCheck(liveLegalCheck, institution) ? "법제처 DRF API 직접 대조" : "법제처 DRF API 직접 대조 필요",
    ].join("·"),
    live_legal_check: "required-before-use",
    ...(liveLegalCheck ? { last_live_check: liveLegalCheck } : {}),
    actionable_node_ids: level === "R2" ? actionableNodes.map((node) => node.id) : [],
    reference_only_node_ids: level === "R2" ? referenceOnlyNodes.map((node) => node.id) : nodes.map((node) => node.id),
    // 왜 참고용인지를 남긴다. 이유 없는 격리는 다음 사람이 되돌릴 수 없다.
    reference_only_reasons: level === "R2"
      ? Object.fromEntries(referenceOnlyNodes.map((node) => [node.id, referenceOnlyReasons(node)]))
      : {},
    blockers,
    metrics,
  };
}

export function enrichInstitutionForAgent(institution, options = {}) {
  const process = institution.process;
  if (!process) throw new Error(`${institution.slug}: process가 없습니다.`);
  const nodeById = new Map(process.nodes.map((node) => [node.id, node]));
  const incomingByNode = new Map(process.nodes.map((node) => [node.id, []]));
  const outgoingByNode = new Map(process.nodes.map((node) => [node.id, []]));
  for (const edge of process.edges) {
    incomingByNode.get(edge.target)?.push(edge);
    outgoingByNode.get(edge.source)?.push(edge);
  }
  for (const node of process.nodes) {
    node.agent = deriveNodeAgentContract(node, {
      institution,
      incomingEdges: incomingByNode.get(node.id) ?? [],
      outgoingEdges: outgoingByNode.get(node.id) ?? [],
      nodeById,
    });
  }
  for (const edge of process.edges) {
    edge.agent_transition = deriveEdgeAgentTransition(edge, nodeById, {
      sourceOutgoingCount: outgoingByNode.get(edge.source)?.length ?? 0,
    });
  }
  process.agent_readiness = assessAgentReadiness(institution, options);
  return institution;
}

export function validateAgentInstitution(institution) {
  const errors = [];
  const readiness = institution.process?.agent_readiness;
  if (!readiness) return errors;
  const nodes = institution.process?.nodes ?? [];
  const edges = institution.process?.edges ?? [];
  if (!AGENT_READINESS_LEVELS.has(readiness.level)) errors.push(`지원하지 않는 준비도 ${readiness.level}`);
  if (!AGENT_MODES.has(readiness.mode)) errors.push(`지원하지 않는 모드 ${readiness.mode}`);
  if (readiness.contract_version !== "1.1.0") errors.push("지원하지 않는 에이전트 계약 버전");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readiness.assessed_at ?? "")) errors.push("assessed_at은 YYYY-MM-DD 형식이어야 함");
  if (readiness.live_legal_check !== "required-before-use") errors.push("실행 전 법제처 API 확인 의무가 누락됨");

  const liveCheck = readiness.last_live_check;
  if (liveCheck) {
    if (!LIVE_LEGAL_CHECK_STATUSES.has(liveCheck.status)) errors.push("지원하지 않는 현행 조문 대조 상태");
    if (liveCheck.method !== OFFICIAL_LAW_API_METHOD) errors.push("현행 조문 대조는 법제처 DRF API 직접 방식이어야 함");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(liveCheck.checked_at ?? "")) errors.push("현행 조문 checked_at 형식 오류");
    if (!/^sha256:[a-f0-9]{64}$/.test(liveCheck.citation_fingerprint ?? "")) errors.push("현행 조문 대조 지문 형식 오류");
    if (liveCheck.citation_fingerprint !== agentCitationFingerprint(institution)) errors.push("현행 조문 대조 이후 근거 데이터가 변경됨");
    for (const field of ["sources_checked", "source_failures", "article_references", "verified_references"]) {
      if (!Number.isInteger(liveCheck[field]) || liveCheck[field] < 0) errors.push(`현행 조문 ${field} 집계 오류`);
    }
    for (const field of ["missing_references", "uncheckable_references", "verified_node_ids", "unverified_node_ids", "source_results"]) {
      if (!Array.isArray(liveCheck[field])) errors.push(`현행 조문 ${field}는 배열이어야 함`);
    }
    if (liveCheck.status === "passed" && !hasPassedLiveLegalCheck(liveCheck, institution)) {
      errors.push("현행 조문 통과 결과의 집계 또는 노드 범위가 일치하지 않음");
    }
  }
  for (const node of nodes) {
    const contract = node.agent;
    if (!contract) {
      errors.push(`${node.id}: agent 계약 누락`);
      continue;
    }
    if (!AGENT_EVENTS.has(contract.trigger_event)) errors.push(`${node.id}: 지원하지 않는 trigger_event`);
    if (!contract.trigger_condition?.trim()) errors.push(`${node.id}: trigger_condition 누락`);
    if (!contract.completion_condition?.trim()) errors.push(`${node.id}: completion_condition 누락`);
    if (!OBLIGATION_LEVELS.has(contract.obligation)) errors.push(`${node.id}: 지원하지 않는 obligation`);
    if (!BASIS_STATUSES.has(contract.basis_status)) errors.push(`${node.id}: 지원하지 않는 basis_status`);
    if (!AUTOMATION_LEVELS.has(contract.automation_level)) errors.push(`${node.id}: 지원하지 않는 automation_level`);
    if (contract.human_confirmation_required !== true) errors.push(`${node.id}: 사람 확인 의무는 true여야 함`);
    if (!Array.isArray(contract.resolved_input_documents)) errors.push(`${node.id}: resolved_input_documents는 배열이어야 함`);
    if (!Array.isArray(contract.completion_evidence)) errors.push(`${node.id}: completion_evidence는 배열이어야 함`);
    if (!Array.isArray(contract.handoff_recipients)) errors.push(`${node.id}: handoff_recipients는 배열이어야 함`);
    if (!DEADLINE_RULE_TYPES.has(contract.deadline_rule?.type)) errors.push(`${node.id}: 지원하지 않는 deadline_rule`);
  }
  for (const edge of edges) {
    const transition = edge.agent_transition;
    if (!transition?.condition?.trim()) errors.push(`${edge.id}: 전이 조건 누락`);
    if (!new Set(["required", "conditional"]).has(transition?.transition_type)) errors.push(`${edge.id}: 전이 유형 오류`);
    if (!transition?.handoff?.from_actor || !transition?.handoff?.to_actor) errors.push(`${edge.id}: 인계 행위자 누락`);
    if (!Array.isArray(transition?.handoff?.documents)) errors.push(`${edge.id}: 인계 문서는 배열이어야 함`);
    if (transition?.human_confirmation_required !== true) errors.push(`${edge.id}: 사람 확인 의무는 true여야 함`);
  }
  if (readiness.level === "R2" && (readiness.mode !== "next-action" || readiness.blockers?.length > 0)) {
    errors.push("R2는 next-action 모드이고 blockers가 없어야 함");
  }
  if (readiness.level === "R2" && !hasPassedLiveLegalCheck(liveCheck, institution)) {
    errors.push("R2는 법제처 DRF API 직접 대조를 통과해야 함");
  }
  if (readiness.level !== "R2" && readiness.mode !== "reference-only") errors.push("R2 미만은 reference-only 모드여야 함");
  return errors;
}
