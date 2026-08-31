import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAgentReadyInstitutions } from "../src/catalog.mjs";
import { AdministrativeProcedureService } from "../src/service.mjs";
import { loadOntologyCase, queryCase } from "../src/ontology-bridge.mjs";
import {
  certifyPacketEnvelope,
  toOntologyPacket,
  assertOntologyPacket,
  PacketContractError,
  PACKET_CONTRACT_VERSION,
} from "../src/packet-contract.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));

async function createService() {
  const institutions = await loadAgentReadyInstitutions();
  return new AdministrativeProcedureService(institutions, { maxLegalCheckAgeDays: 36500 });
}

test("R2 패킷이 온톨로지 ActionPacket 계약을 통과한다", async () => {
  const service = await createService();
  const envelope = service.createActionPacket("national-rd-fund-use-settlement", "P05", {
    condition: "승인 필요",
  });
  const packet = certifyPacketEnvelope(envelope);

  assert.equal(packet.contract, PACKET_CONTRACT_VERSION);
  assert.equal(packet.source_path, "r2-procedure");
  assert.equal(packet.auto_execute, false);
  assert.ok(packet.checklist.length >= 3);
  assert.ok(packet.based_on.includes("institution:national-rd-fund-use-settlement"));
  assert.ok(packet.based_on.includes("step:P05"));
  assert.ok(packet.based_on.some((item) => item.startsWith("statute:")));
  assert.ok(packet.human_signoff.length > 0);
});

test("온톨로지 케이스 패킷이 같은 계약을 통과한다", async () => {
  const data = await loadOntologyCase({ ontologyDir });
  const result = queryCase(data, "부분공개 통지 왔는데 뭐 하면 됨?");
  const packet = result.packet.ontology_packet;

  assert.equal(packet.contract, PACKET_CONTRACT_VERSION);
  assert.equal(packet.source_path, "ontology-case");
  assert.equal(packet.id, "ap:claimant-after-partial");
  assert.equal(packet.auto_execute, false);
  assert.ok(packet.checklist.length >= 3);
  assert.ok(packet.based_on.length >= 1);
});

test("두 경로의 정규화 패킷은 같은 필수 키 집합을 가진다", async () => {
  const service = await createService();
  const r2 = certifyPacketEnvelope(
    service.createActionPacket("national-rd-fund-use-settlement", "P05", { condition: "승인 필요" }),
  );
  const data = await loadOntologyCase({ ontologyDir });
  const ontology = queryCase(data, "부분공개 통지 왔는데 뭐 하면 됨?").packet.ontology_packet;

  assert.deepEqual(Object.keys(r2).sort(), Object.keys(ontology).sort());
});

test("분기 미확정으로 막힌 패킷도 계약을 통과하고 위험을 남긴다", async () => {
  const service = await createService();
  const envelope = service.createActionPacket("national-rd-fund-use-settlement", "P05");
  assert.equal(envelope.status, "blocked-decision-required");

  const packet = certifyPacketEnvelope(envelope);
  assert.equal(packet.auto_execute, false);
  assert.ok(packet.risks.length >= 1, "미확정 분기 질문이 risks로 넘어와야 한다");
});

test("execution_allowed가 false가 아니면 계약이 깨진다", () => {
  assert.throws(
    () => toOntologyPacket({ packet_id: "x", execution_allowed: true, human_confirmation_required: true }),
    PacketContractError,
  );
});

test("auto_execute가 true인 패킷은 거부된다", () => {
  assert.throws(
    () => assertOntologyPacket({
      id: "x",
      title: "t",
      actor: "a",
      why: "w",
      checklist: ["c"],
      human_signoff: "s",
      auto_execute: true,
    }),
    PacketContractError,
  );
});

test("체크리스트가 비면 계약이 깨진다", () => {
  assert.throws(
    () => certifyPacketEnvelope({
      packet_id: "x",
      execution_allowed: false,
      human_confirmation_required: true,
      checklist: [],
      procedure: { slug: "s", name: "n" },
      current_step: { id: "P01", actor: "담당" },
    }),
    PacketContractError,
  );
});
