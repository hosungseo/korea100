import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadOntologyCase,
  getCaseState,
  queryCase,
  ontologyPacketToMcpEnvelope,
  getActionPacket,
} from "../src/ontology-bridge.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));

test("loads information-disclosure ontology case", async () => {
  const data = await loadOntologyCase({ ontologyDir });
  assert.equal(data.institution_slug, "information-disclosure");
  assert.ok(data.entities.length >= 10);
  assert.ok(data.action_packets.length >= 1);
});

test("case state exposes open steps after partial disclosure", async () => {
  const data = await loadOntologyCase({ ontologyDir });
  const state = getCaseState(data);
  assert.equal(state.case_state, "decision_notified_partial");
  assert.ok(state.open_steps.some((s) => s.entity_id === "step:P10"));
  assert.ok(state.open_steps.some((s) => s.entity_id === "step:P11"));
});

test("query_case returns ontology action packet with execution disabled", async () => {
  const data = await loadOntologyCase({ ontologyDir });
  const result = queryCase(data, "부분공개 통지 왔는데 뭐 하면 됨?");
  assert.equal(result.mode, "case_action_packet");
  assert.equal(result.packet.packet_id, "ap:claimant-after-partial");
  assert.equal(result.packet.execution_allowed, false);
  assert.equal(result.packet.auto_execute, false);
  assert.equal(result.packet.human_confirmation_required, true);
  assert.ok(result.packet.checklist.length >= 3);
  assert.ok((result.rules_fired?.length ?? 0) >= 1 || result.packet.ontology.based_on.length >= 1);
});

test("MCP envelope mapping keeps auto_execute false", async () => {
  const data = await loadOntologyCase({ ontologyDir });
  const packet = getActionPacket(data, "ap:claimant-after-partial");
  const env = ontologyPacketToMcpEnvelope(data, packet, { query: "test" });
  assert.equal(env.execution_allowed, false);
  assert.equal(env.auto_execute, false);
  assert.equal(env.ontology.case_id, data.case_id);
});

test("stage query returns state mode", async () => {
  const data = await loadOntologyCase({ ontologyDir });
  const result = queryCase(data, "지금 어디 단계야");
  assert.equal(result.mode, "case_state");
  assert.equal(result.execution_allowed, false);
  assert.equal(result.state.case_state, "decision_notified_partial");
});
