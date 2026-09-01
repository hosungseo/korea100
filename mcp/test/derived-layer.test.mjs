import assert from "node:assert/strict";
import test from "node:test";

import { checkAllCases } from "../../ontology/scripts/verify-derived-layer.mjs";

const ontologyDir = new URL("../../ontology/", import.meta.url).pathname;

// PRD 원칙 3 — 구조 층은 파생물이다. 지금까지 이 원칙은 사람이 --remerge를
// 기억해야만 지켜졌다. 제도 JSON이나 오버레이를 고치고 재파생을 잊으면 케이스는
// 옛 그림을 든 채로 남고 아무도 알려주지 않았다. 이 테스트가 그 자리를 막는다.
test("모든 케이스의 구조 층이 원본과 일치한다", async () => {
  const results = await checkAllCases();

  assert.ok(results.length >= 12, `케이스가 ${results.length}건뿐입니다`);

  const notCurrent = results.filter((result) => result.status !== "current");
  const report = notCurrent
    .map((result) => {
      const detail = (result.diffs ?? [])
        .map((diff) => `${diff.label}: +${diff.added.length} -${diff.removed.length} ~${diff.changed.length}`)
        .join(" / ");
      return `${result.file} [${result.status}] ${detail || result.message || ""}`;
    })
    .join("\n");

  assert.deepEqual(
    notCurrent,
    [],
    `구조 층이 원본과 어긋났습니다. node ontology/scripts/verify-derived-layer.mjs --fix 로 재파생하세요.\n${report}`,
  );
});

test("검사는 세 종류 케이스를 모두 다룬다", async () => {
  const results = await checkAllCases();
  const kinds = new Set(results.map((result) => result.kind));

  // 종류를 하나라도 못 알아보면 그 케이스는 조용히 검사에서 빠진다.
  assert.deepEqual([...kinds].sort(), ["institution", "milestone", "project"]);
  assert.ok(!results.some((result) => result.status === "unknown_kind"));
});

// M2 — 메가프로젝트 4종 전부에 project 케이스가 있다. 셋은 R2 제도가 적어
// 다음 행동은 계산하지 못하지만, 개폐·차단·갈림길 같은 그래프 질문은 답한다.
test("메가프로젝트 4종에 project 케이스가 모두 있다", async () => {
  const { loadOntologyCase } = await import("../src/ontology-bridge.mjs");
  const { checkCaseLinkageFor } = await import("../src/case-link.mjs");

  const projects = [
    "gwangju-semiconductor-cluster",
    "five-poles-three-special",
    "arctic-route",
    "daegu-gyeongbuk-airport",
  ];
  for (const id of projects) {
    const caseData = await loadOntologyCase({ ontologyDir, caseFile: `samples/${id}.case.json` });
    assert.equal(caseData.case_kind, "project", `${id}가 project 케이스여야 한다`);
    assert.equal(caseData.project_id, id);
    // 케이스가 오버레이와 어긋난 채로 배포되면 지도가 거짓말을 한다.
    const linkage = await checkCaseLinkageFor(caseData);
    assert.equal(linkage.status, "aligned", `${id}: ${JSON.stringify(linkage.notes ?? [])}`);
  }
});
