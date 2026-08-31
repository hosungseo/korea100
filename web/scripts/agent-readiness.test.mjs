import test from "node:test";
import assert from "node:assert/strict";
import {
  agentCitationFingerprint,
  assessAgentReadiness,
  deriveEdgeAgentTransition,
  deriveNodeAgentContract,
  enrichInstitutionForAgent,
  validateAgentInstitution,
} from "./lib/agent-readiness.mjs";

function fixture() {
  return {
    slug: "fixture",
    fieldVerification: [],
    verification: { status: "article-verified", sources: [] },
    process: {
      nodes: [
        {
          id: "P01",
          name: "신청서 접수",
          type: "task",
          actor: "신청인",
          action: "신청서를 제출한다.",
          output_documents: ["신청서"],
          deadline: "내부 목표 3일",
          confidence: 0.9,
          legal_basis: [{ law: "예시법", article: "제1조" }],
        },
        {
          id: "P02",
          name: "신청 심사",
          type: "gateway",
          actor: "행정청",
          action: "신청 요건을 심사한다.",
          input_documents: ["신청서"],
          output_documents: ["심사결과서"],
          deadline: "접수한 날부터 10일 이내",
          confidence: 0.9,
          legal_basis: [{ law: "예시법", article: "제2조" }],
        },
      ],
      edges: [{ id: "E01", source: "P01", target: "P02", type: "message" }],
    },
  };
}

function passedLiveCheck(institution, nodeIds = ["P01", "P02"]) {
  return {
    checked_at: "2026-07-16",
    method: "law.go.kr-DRF-direct",
    status: "passed",
    citation_fingerprint: agentCitationFingerprint(institution),
    sources_checked: 1,
    source_failures: 0,
    article_references: nodeIds.length,
    verified_references: nodeIds.length,
    missing_references: [],
    uncheckable_references: [],
    verified_node_ids: nodeIds,
    unverified_node_ids: [],
    source_results: [{
      law: "예시법",
      source_type: "statute",
      source_id: "000001",
      official_url: "https://law.go.kr/법령/예시법",
      status: "passed",
      requested_articles: ["제1조", "제2조"],
      verified_articles: ["제1조", "제2조"],
      missing_articles: [],
    }],
  };
}

function contractFor(node) {
  const institution = fixture();
  institution.process.nodes[0] = { ...institution.process.nodes[0], ...node };
  const nodeById = new Map(institution.process.nodes.map((item) => [item.id, item]));
  return deriveNodeAgentContract(institution.process.nodes[0], {
    institution,
    incomingEdges: [],
    outgoingEdges: institution.process.edges,
    nodeById,
  });
}

test("내부 목표를 법정기한으로 분류하지 않는다", () => {
  assert.equal(contractFor({ deadline: "내부 목표 3일" }).deadline_rule.type, "internal-target");
});

test("법정 최소 의견제출 기간과 문서 기재 기한을 구분한다", () => {
  assert.equal(contractFor({ deadline: "의견 제출 기간은 10일 이상" }).deadline_rule.type, "statutory");
  assert.equal(contractFor({ deadline: "부과서에 기재된 납부기한" }).deadline_rule.type, "document-defined");
});

test("'지체 없이'는 법정 의무이되 날짜로 환산되지 않는다고 구분한다", () => {
  assert.equal(
    contractFor({ deadline: "제3자에게 지체 없이 통지" }).deadline_rule.type,
    "statutory-immediate",
  );
  // 즉시성과 일수가 함께 있으면 계산 가능한 쪽을 택한다.
  assert.equal(
    contractFor({ deadline: "이송 후 10일 이내에 지체 없이 통지" }).deadline_rule.type,
    "statutory",
  );
  // 근거 조문이 확인되지 않으면 즉시성만으로 법정이라고 하지 않는다.
  assert.equal(
    contractFor({ deadline: "지체 없이 처리", legal_basis: [{ law: "임의", article: "미상" }] }).deadline_rule.type,
    "needs-verification",
  );
});

test("회귀 연결선은 조건부 전이로 반환한다", () => {
  const institution = fixture();
  const nodeById = new Map(institution.process.nodes.map((node) => [node.id, node]));
  const transition = deriveEdgeAgentTransition(
    { id: "L01", source: "P02", target: "P01", type: "loop", label: "보완 필요" },
    nodeById,
  );
  assert.equal(transition.transition_type, "conditional");
  assert.equal(transition.condition, "보완 필요");
});

test("수동 전이 대조나 공식 API 대조가 없으면 R2를 부여하지 않는다", () => {
  const institution = enrichInstitutionForAgent(fixture(), { transitionReviewed: false });
  assert.equal(institution.process.agent_readiness.level, "R1");
  assert.ok(institution.process.agent_readiness.blockers.some((blocker) => /수동 대조/.test(blocker)));
  assert.ok(institution.process.agent_readiness.blockers.some((blocker) => /법제처 API/.test(blocker)));
});

test("전체 계약·수동 전이 대조·공식 API 직접 대조를 통과하면 R2를 부여한다", () => {
  const institution = fixture();
  const liveLegalCheck = passedLiveCheck(institution);
  enrichInstitutionForAgent(institution, { transitionReviewed: true, liveLegalCheck });
  const readiness = assessAgentReadiness(institution, { transitionReviewed: true, liveLegalCheck });
  assert.equal(readiness.level, "R2");
  assert.equal(readiness.mode, "next-action");
  assert.deepEqual(validateAgentInstitution(institution), []);
});

test("공식 API 대조 후 조문이 바뀌면 저장된 통과 결과를 무효화한다", () => {
  const institution = fixture();
  const liveLegalCheck = passedLiveCheck(institution);
  institution.process.nodes[0].legal_basis[0].article = "제3조";
  enrichInstitutionForAgent(institution, { transitionReviewed: true, liveLegalCheck });
  assert.equal(institution.process.agent_readiness.level, "R1");
  assert.ok(institution.process.agent_readiness.blockers.some((blocker) => /식별자가 변경/.test(blocker)));
  assert.match(validateAgentInstitution(institution).join("\n"), /근거 데이터가 변경/);
});

test("템플릿성 행위 문장은 R2를 차단한다", () => {
  const institution = fixture();
  institution.process.nodes[0].action = "필요한 행위와 증빙을 확인하고 다음 담당자에게 인계한다.";
  enrichInstitutionForAgent(institution, {
    transitionReviewed: true,
    liveLegalCheck: passedLiveCheck(institution),
  });
  assert.equal(institution.process.agent_readiness.level, "R1");
  assert.equal(institution.process.agent_readiness.metrics.template_like_nodes, 1);
});
