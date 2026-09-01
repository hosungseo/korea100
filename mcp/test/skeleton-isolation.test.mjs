import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { scanAll } from "../../web/scripts/detect-template-skeletons.mjs";
import { loadOntologyCase } from "../src/ontology-bridge.mjs";
import { allMilestoneStatuses, institutionReadinessFor } from "../src/project-case.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));
const load = (file) => loadOntologyCase({ ontologyDir, caseFile: `samples/${file}` });

// 653개 중 139개가 제네릭 12단 사다리에 제도명만 갈아 끼운 골격이다. 조문 번호는
// 실재해서 article-verified를 통과하지만, 그 절차가 그 조문의 절차라는 보장이 없다.
// 이 테스트가 지키는 것은 하나다 — 골격이 "다음 행동"을 계산하는 자리에 못 들어온다.

async function skeletonSlugs() {
  return new Set((await scanAll()).filter((row) => row.is_skeleton).map((row) => row.slug));
}

test("골격 제도는 R2가 될 수 없다", async () => {
  const rows = await scanAll();
  const promoted = rows.filter((row) => row.is_skeleton && row.readiness === "R2");
  assert.deepEqual(promoted.map((row) => row.slug), [], "골격이 R2에 올랐습니다");

  // 판정이 무너지지 않았는지도 본다. 0이 되면 탐지가 죽은 것이지 코퍼스가 나아진 게 아니다.
  const count = rows.filter((row) => row.is_skeleton).length;
  assert.ok(count > 0, "골격 탐지가 0을 반환했습니다 — 사다리 정의가 데이터와 어긋났는지 확인하세요");
});

test("다음 행동을 계산하는 케이스는 골격 위에 서 있지 않다", async () => {
  const skeletons = await skeletonSlugs();
  const actionable = [
    "information-disclosure.case.json",
    "administrative-fine-pre-notice.case.json",
    "preliminary-feasibility-study.case.json",
    "semiconductor-cluster-designation.case.json",
    "semiconductor-infrastructure-fasttrack.case.json",
    "national-strategic-industry-complex.case.json",
    "distributed-energy-grid-assessment.case.json",
    "water-road-supply-plan.case.json",
  ];

  for (const file of actionable) {
    const caseData = await load(file);
    const slugs = new Set();
    if (caseData.institution_slug) slugs.add(caseData.institution_slug);
    for (const entity of caseData.entities ?? []) {
      if (entity.id?.startsWith("institution:")) slugs.add(entity.attrs?.slug ?? entity.id.slice("institution:".length));
    }
    const hit = [...slugs].filter((slug) => skeletons.has(slug));
    assert.deepEqual(hit, [], `${file}이 골격 제도를 참조합니다: ${hit.join(", ")}`);
  }
});

test("계산 가능 마일스톤의 참조 제도에 골격이 없다", async () => {
  const skeletons = await skeletonSlugs();
  const project = await load("gwangju-semiconductor-cluster.case.json");
  const overlay = JSON.parse(await readFile(
    new URL("../../web/data/mega-projects/projects/gwangju-semiconductor-cluster.json", import.meta.url), "utf8",
  ));

  const computable = allMilestoneStatuses(project)
    .filter((status) => institutionReadinessFor(project, status.node_id)?.next_action_computable)
    .map((status) => status.node_id);
  assert.ok(computable.length >= 5, `계산 가능 마일스톤이 ${computable.length}개뿐입니다`);

  for (const nodeId of computable) {
    const node = overlay.nodes.find((item) => item.id === nodeId);
    const hit = (node.templateRefs ?? []).map((ref) => ref.institution).filter((slug) => skeletons.has(slug));
    assert.deepEqual(hit, [], `${nodeId}이 골격 제도를 참조합니다: ${hit.join(", ")}`);
  }
});
