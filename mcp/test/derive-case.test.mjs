import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadOntologyCase } from "../src/ontology-bridge.mjs";
import {
  deriveCaseSkeleton,
  deriveStepEntities,
  deriveStepRelations,
  loadInstitution,
} from "../../ontology/scripts/derive-case.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));

function byId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

test("파생기는 손으로 쓴 케이스의 단계 엔티티를 그대로 재현한다", async () => {
  const handWritten = await loadOntologyCase({ ontologyDir });
  const institution = await loadInstitution("information-disclosure");

  const derived = byId(deriveStepEntities(institution));
  const authored = (handWritten.entities ?? []).filter((entity) => entity.id.startsWith("step:"));

  assert.equal(authored.length, derived.size, "단계 수가 같아야 한다");
  for (const entity of authored) {
    assert.deepEqual(
      derived.get(entity.id),
      entity,
      `${entity.id}의 파생 결과가 손작성과 다르다`,
    );
  }
});

test("파생기는 손으로 쓴 케이스의 단계 관계를 그대로 재현한다", async () => {
  const handWritten = await loadOntologyCase({ ontologyDir });
  const institution = await loadInstitution("information-disclosure");

  const derived = byId(deriveStepRelations(institution));
  const authored = (handWritten.relations ?? []).filter((relation) => (
    relation.from.startsWith("step:") && relation.to.startsWith("step:")
  ));

  assert.equal(authored.length, derived.size);
  for (const relation of authored) {
    assert.deepEqual(derived.get(relation.id), relation, `${relation.id}의 파생 결과가 손작성과 다르다`);
  }
});

test("신뢰도 0.8 미만 단계는 unverified로 파생한다", async () => {
  const institution = await loadInstitution("information-disclosure");
  const derived = byId(deriveStepEntities(institution));

  for (const node of institution.process.nodes) {
    const expected = (node.confidence ?? 1) < 0.8 ? "unverified" : "verified";
    assert.equal(derived.get(`step:${node.id}`).status, expected, `${node.id} 상태`);
  }
});

test("골격은 사건 고유 층을 비워 두고 제도 준비도를 기록한다", async () => {
  const institution = await loadInstitution("administrative-fine-pre-notice-opinion");
  const skeleton = deriveCaseSkeleton(institution, { caseId: "TEST-0001", asOf: "2026-09-01" });

  assert.equal(skeleton.institution_slug, "administrative-fine-pre-notice-opinion");
  assert.deepEqual(skeleton.states, []);
  assert.deepEqual(skeleton.rules, []);
  assert.deepEqual(skeleton.action_packets, []);
  assert.equal(skeleton.derivation.institution_readiness.level, "R2");
  assert.equal(skeleton.derivation.node_count, institution.process.nodes.length);
  assert.equal(skeleton.derivation.edge_count, institution.process.edges.length);
  assert.equal(
    skeleton.relations.length,
    institution.process.edges.length,
    "모든 연결선이 관계로 파생되어야 한다",
  );
});
