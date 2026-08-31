import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const MCP_DIR = fileURLToPath(new URL("../", import.meta.url));
const SERVER_PATH = path.join(MCP_DIR, "src/server.mjs");

test("stdio MCP가 도구·리소스를 공개하고 다음 행동을 구조화해 반환한다", async (context) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_PATH],
    cwd: MCP_DIR,
    stderr: "pipe",
    env: {
      ...process.env,
      KOREA100_MCP_MAX_LEGAL_CHECK_AGE_DAYS: "36500",
    },
  });
  const client = new Client(
    { name: "korea100-mcp-test", version: "0.1.0" },
    { capabilities: {} },
  );

  context.after(async () => {
    await client.close();
  });

  await client.connect(transport);

  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    [
      "check_case_linkage",
      "create_action_packet",
      "get_case_state",
      "get_next_actions",
      "get_procedure_map",
      "get_step_requirements",
      "load_ontology_case",
      "query_case",
      "resolve_work_event",
      "search_procedures",
    ],
  );
  assert.ok(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true));

  const resources = await client.listResources();
  assert.equal(resources.resources.length, 6);
  assert.ok(resources.resources.some((resource) => resource.uri === "korea100://procedures"));
  assert.ok(resources.resources.some((resource) => resource.uri === "korea100://status"));

  const result = await client.callTool({
    name: "get_next_actions",
    arguments: {
      slug: "national-rd-fund-use-settlement",
      current_step: "P05",
      condition: "승인 필요",
    },
  });

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.selection.status, "condition-matched");
  assert.equal(result.structuredContent.selected_actions[0].next_step.id, "P06");
  assert.match(
    result.structuredContent.selected_actions[0].next_step.legal_bases[0].official_url,
    /^https:\/\/law\.go\.kr\//,
  );

  const event = await client.callTool({
    name: "resolve_work_event",
    arguments: {
      metadata_only: true,
      source_system: "onnara",
      event_type: "approval.completed",
      procedure_hint: "national-rd-fund-use-settlement",
      step_hint: "P05",
      condition: "승인 필요",
    },
  });
  assert.equal(event.isError, undefined);
  assert.equal(event.structuredContent.resolution.status, "resolved");
  assert.equal(event.structuredContent.next_actions.selected_actions[0].next_step.id, "P06");

  const packet = await client.callTool({
    name: "create_action_packet",
    arguments: {
      slug: "national-rd-fund-use-settlement",
      current_step: "P05",
      condition: "승인 필요",
      event_fingerprint: event.structuredContent.event.event_fingerprint,
    },
  });
  assert.equal(packet.isError, undefined);
  assert.equal(packet.structuredContent.status, "ready-for-human-review");
  assert.equal(packet.structuredContent.execution_allowed, false);
  assert.equal(packet.structuredContent.human_confirmation_required, true);
  assert.equal(packet.structuredContent.ontology_packet.auto_execute, false);
  assert.equal(packet.structuredContent.ontology_packet.source_path, "r2-procedure");

  const rejectedEvent = await client.callTool({
    name: "resolve_work_event",
    arguments: {
      metadata_only: true,
      source_system: "onnara",
      event_type: "document.received",
      procedure_hint: "national-rd-fund-use-settlement",
      document_title: "person@example.com",
    },
  });
  assert.equal(rejectedEvent.isError, true);
  assert.match(rejectedEvent.content[0].text, /sensitive_metadata_rejected/u);

  const resource = await client.readResource({
    uri: "korea100://procedures/administrative-fine-pre-notice-opinion",
  });
  const procedure = JSON.parse(resource.contents[0].text);
  assert.equal(procedure.procedure.verification.readiness_level, "R2");
  assert.equal(procedure.procedure.safety.automatic_submission_or_approval, false);

  const statusResource = await client.readResource({ uri: "korea100://status" });
  const status = JSON.parse(statusResource.contents[0].text);
  assert.equal(status.procedure_count, 4);
  assert.equal(status.legal_check_policy.max_age_days, 36500);
  assert.ok(status.procedures.every((item) => item.legal_check.freshness.status === "current"));

  const caseQuery = await client.callTool({
    name: "query_case",
    arguments: { query: "부분공개 통지 왔는데 뭐 하면 됨?" },
  });
  assert.equal(caseQuery.isError, undefined);
  assert.equal(caseQuery.structuredContent.mode, "case_action_packet");
  assert.equal(caseQuery.structuredContent.execution_allowed, false);
  assert.equal(caseQuery.structuredContent.packet.packet_id, "ap:claimant-after-partial");
  assert.equal(caseQuery.structuredContent.packet.auto_execute, false);
  assert.equal(caseQuery.structuredContent.packet.execution_allowed, false);
  assert.equal(caseQuery.structuredContent.packet.human_confirmation_required, true);
  assert.equal(caseQuery.structuredContent.linkage.status, "aligned");
  assert.equal(caseQuery.structuredContent.linkage.next_action_allowed, true);
  assert.ok(
    !caseQuery.structuredContent.packet.risks.some((risk) => risk.includes("reference-only")),
    "R2 제도라면 준비도 미달 경고가 붙지 않아야 한다",
  );

  const linkage = await client.callTool({ name: "check_case_linkage", arguments: {} });
  assert.equal(linkage.isError, undefined);
  assert.equal(linkage.structuredContent.institution_slug, "information-disclosure");
  assert.equal(linkage.structuredContent.status, "aligned");
  assert.equal(linkage.structuredContent.readiness.level, "R2");
  assert.equal(linkage.structuredContent.execution_allowed, false);
});
