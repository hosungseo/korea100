import assert from "node:assert/strict";
import test from "node:test";
import {
  createContributionPackage,
  createDraftFromInstitution,
  nextEdgeId,
  nextNodeId,
  remapNodesForListChange,
  validateDraft
} from "../src/lib/model.js";

const fixture = {
  slug: "sample",
  name: "표본 제도",
  oneLiner: "표본 절차",
  category: "행정",
  asOfDate: "2026-07-16",
  canvas: { purpose: "절차 확인" },
  process: {
    lanes: ["신청인", "기관"],
    stages: ["G0 신청", "G1 처리"],
    nodes: [
      {
        id: "P01",
        name: "신청",
        lane: "신청인",
        stage: "G0 신청",
        legal_basis: [{ law: "표본법", article: "제1조", text: "신청한다." }]
      },
      { id: "P02", name: "처리", lane: "기관", stage: "G1 처리" }
    ],
    edges: [{ id: "E01", source: "P01", target: "P02", type: "sequence", label: "접수" }]
  }
};

test("원본 제도를 편집 가능한 개인 초안으로 변환한다", () => {
  const draft = createDraftFromInstitution(fixture);
  assert.equal(draft.baseSlug, "sample");
  assert.equal(draft.nodes.length, 2);
  assert.equal(draft.nodes[0].legalBasis[0].article, "제1조");
  assert.equal(draft.sourceUrl, "https://hosungseo.github.io/korea100/model/sample/");
  assert.equal(validateDraft(draft).valid, true);
});

test("깨진 연결과 중복 ID를 거부한다", () => {
  const draft = createDraftFromInstitution(fixture);
  draft.nodes.push({ ...draft.nodes[0] });
  draft.edges.push({ id: "E02", source: "P01", target: "P99", type: "sequence", label: "" });
  const result = validateDraft(draft);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("중복")));
  assert.ok(result.errors.some((error) => error.includes("존재하지 않는")));
});

test("다음 노드와 연결 ID를 계산한다", () => {
  assert.equal(nextNodeId([{ id: "P01" }, { id: "P09" }]), "P10");
  assert.equal(nextEdgeId([{ id: "E02" }, { id: "E11" }]), "E12");
});

test("행위주체 이름 변경을 기존 노드에 반영하고 단순 순서 변경은 보존한다", () => {
  const nodes = [{ id: "P01", lane: "신청인" }, { id: "P02", lane: "기관" }];
  assert.deepEqual(
    remapNodesForListChange(nodes, "lane", ["신청인", "기관"], ["민원인", "기관"]),
    [{ id: "P01", lane: "민원인" }, { id: "P02", lane: "기관" }]
  );
  assert.deepEqual(
    remapNodesForListChange(nodes, "lane", ["신청인", "기관"], ["기관", "신청인"]),
    nodes
  );
});

test("기여 제안 패키지는 캡처 원문과 계정 식별자를 내보내지 않는다", () => {
  const draft = createDraftFromInstitution(fixture);
  const pack = createContributionPackage(draft, [
    {
      title: "공식 자료",
      url: "https://example.com/source?session=secret",
      excerpt: "외부 공개를 원하지 않는 캡처 문장",
      capturedAt: "2026-07-16T00:00:00.000Z",
      nodeId: "P01"
    }
  ], { target: "github" });
  const serialized = JSON.stringify(pack);
  assert.equal(pack.evidence[0].url, "https://example.com/source");
  assert.equal(serialized.includes("캡처 문장"), false);
  assert.equal(serialized.includes("session=secret"), false);
  assert.equal(pack.privacy.personalDataIncluded, false);
  assert.equal(pack.privacy.accountIdentityIncluded, false);
  assert.equal(pack.submission.platform, "github");
  assert.deepEqual(pack.submission.channels, ["issue", "pull-request"]);
});
