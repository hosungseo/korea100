import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";

import { loadAgentReadyInstitutions } from "./catalog.mjs";
import { AdministrativeProcedureService, ProcedureQueryError } from "./service.mjs";
import {
  loadOntologyCase,
  getCaseState,
  queryCase,
  OntologyBridgeError,
  DEFAULT_CASE_FILE,
} from "./ontology-bridge.mjs";
import { certifyPacketEnvelope, PacketContractError } from "./packet-contract.mjs";
import { checkCaseLinkageFor } from "./case-link.mjs";

const SERVER_NAME = "korea100-administrative-procedure";
const SERVER_VERSION = "0.2.0";
const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

function successResult(summary, data) {
  return {
    content: [
      {
        type: "text",
        text: `${summary}\n\n${JSON.stringify(data, null, 2)}`,
      },
    ],
    structuredContent: data,
  };
}

function errorResult(error) {
  const known = error instanceof ProcedureQueryError
    || error instanceof OntologyBridgeError
    || error instanceof PacketContractError
    || error?.code === "catalog_invariant_failed";
  const payload = {
    error: {
      code: known ? error.code : "internal_error",
      message: known ? error.message : "행정절차 MCP 처리 중 오류가 발생했습니다.",
      details: known ? error.details : {},
    },
  };
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

function registerReadOnlyTool(server, name, config, handler, summarize) {
  server.registerTool(
    name,
    {
      ...config,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      try {
        const data = await handler(args);
        return successResult(summarize(data), data);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}

export function createAdministrativeProcedureMcpServer(service, { ontologyEnabled = true } = {}) {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: [
        "이 서버는 Korea100의 R2 검증 절차만 읽기 전용으로 제공합니다.",
        "먼저 search_procedures로 제도를 찾고 get_procedure_map으로 단계 ID를 확인하세요.",
        "현재 단계의 요건은 get_step_requirements, 이후 행동은 get_next_actions를 사용하세요.",
        "전자결재의 비식별 메타데이터는 resolve_work_event로 보수적으로 제도·단계 후보에 매핑할 수 있습니다.",
        "담당자에게 넘길 체크리스트는 create_action_packet으로 만들되, 이 패킷 자체에는 실행 권한이 없습니다.",
        "분기가 둘 이상이면 condition을 임의 추정하지 말고 available_actions의 조건을 사용자나 담당자에게 확인하세요.",
        "법령 대조가 만료되면 다음 행동 선택을 중단하고 법제처 공식 원문 재검증을 요구하세요.",
        "응답은 결재·접수·발송 권한을 부여하지 않습니다. human_confirmation_required를 항상 지키고 공식 원문 링크를 함께 제시하세요.",
      ].join(" "),
    },
  );

  registerReadOnlyTool(
    server,
    "search_procedures",
    {
      title: "행정절차 찾기",
      description: "R2 검증을 통과한 행정절차를 제도명·업무·기관·문서·법령 키워드와 행위자로 검색합니다.",
      inputSchema: {
        query: z.string().trim().max(100).optional().describe("제도명, 업무, 문서 또는 법령 검색어"),
        actor: z.string().trim().max(100).optional().describe("담당 기관 또는 행위자 필터"),
        limit: z.number().int().min(1).max(20).default(10).describe("최대 결과 수"),
      },
    },
    ({ query = "", actor = "", limit = 10 }) => service.searchProcedures({ query, actor, limit }),
    (data) => `R2 행정절차 ${data.match_count}개를 찾았습니다.`,
  );

  registerReadOnlyTool(
    server,
    "get_procedure_map",
    {
      title: "행정절차 단계 지도",
      description: "제도의 전체 단계 ID, 담당자, 입력·산출물, 기한과 조건부 전이를 반환합니다.",
      inputSchema: {
        slug: z.string().trim().min(1).max(160).describe("search_procedures가 반환한 제도 slug"),
      },
    },
    ({ slug }) => service.getProcedureMap(slug),
    (data) => `${data.procedure.name}: ${data.steps.length}개 단계와 ${data.transitions.length}개 전이입니다.`,
  );

  registerReadOnlyTool(
    server,
    "get_step_requirements",
    {
      title: "현재 단계 요건 확인",
      description: "현재 단계의 시작 조건, 완료 기준, 입력 문서, 완료 증빙, 기한과 법제처 공식 원문 링크를 반환합니다.",
      inputSchema: {
        slug: z.string().trim().min(1).max(160).describe("제도 slug"),
        step: z.string().trim().min(1).max(160).describe("단계 ID(P01 등) 또는 단계명"),
      },
    },
    ({ slug, step }) => service.getStepRequirements(slug, step),
    (data) => `${data.procedure.name}의 ${data.step.id} '${data.step.name}' 요건입니다.`,
  );

  registerReadOnlyTool(
    server,
    "get_next_actions",
    {
      title: "결재 이후 다음 행동",
      description: "현재 단계가 완료된 뒤 가능한 다음 단계, 인계 주체, 전달 문서와 분기 조건을 반환합니다. 분기 조건을 확인하지 못하면 경로를 선택하지 않습니다.",
      inputSchema: {
        slug: z.string().trim().min(1).max(160).describe("제도 slug"),
        current_step: z.string().trim().min(1).max(160).describe("완료된 현재 단계의 ID 또는 단계명"),
        condition: z.string().trim().max(160).optional().describe("담당자가 확인한 분기 조건 문구. 모르면 생략"),
      },
    },
    ({ slug, current_step, condition = "" }) => service.getNextActions(slug, current_step, { condition }),
    (data) => {
      if (data.terminal) return `${data.current_step.id} 이후 등록된 후속 단계가 없습니다.`;
      if (data.selection.decision_required) {
        return `${data.current_step.id} 이후 ${data.available_actions.length}개 분기가 있어 담당자 판단이 필요합니다.`;
      }
      return `${data.current_step.id} 이후 선택 가능한 다음 행동 ${data.selected_actions.length}개를 반환합니다.`;
    },
  );

  registerReadOnlyTool(
    server,
    "resolve_work_event",
    {
      title: "전자결재 이벤트 절차 매핑",
      description: "문서 본문·첨부·개인정보를 제외한 전자결재 이벤트 메타데이터를 R2 제도와 현재 단계 후보에 보수적으로 매핑합니다. 정확한 제도와 단계가 함께 확인될 때만 다음 행동을 계산합니다.",
      inputSchema: {
        metadata_only: z.boolean().describe("본문·첨부·개인정보를 제외한 메타데이터만 보냈다는 명시적 확인. true만 허용"),
        source_system: z.string().trim().min(1).max(80).optional().describe("이벤트를 발생시킨 시스템 식별자. 예: onnara"),
        event_type: z.enum([
          "approval.completed",
          "approval.rejected",
          "supplement.requested",
          "document.received",
          "manual.confirmed",
        ]).describe("업무 이벤트 유형"),
        procedure_hint: z.string().trim().max(160).optional().describe("알고 있는 제도 slug 또는 정확한 제도명"),
        step_hint: z.string().trim().max(160).optional().describe("알고 있는 단계 ID(P01 등) 또는 정확한 단계명"),
        document_title: z.string().trim().max(160).optional().describe("개인정보를 제거한 문서 유형·서식명"),
        actor: z.string().trim().max(100).optional().describe("개인 이름이 아닌 기관·역할명"),
        condition: z.string().trim().max(160).optional().describe("담당자가 확인한 후속 분기 조건"),
      },
    },
    (args) => service.resolveWorkEvent(args),
    (data) => data.resolution.status === "resolved"
      ? `${data.resolution.procedure_slug}의 ${data.resolution.step_id} 단계로 확인했습니다.`
      : `자동 매핑을 중단하고 ${data.candidates.length}개 후보를 반환했습니다.`,
  );

  registerReadOnlyTool(
    server,
    "create_action_packet",
    {
      title: "사람 검토용 다음 행동 패킷",
      description: "현재 단계 완료 뒤의 인계 문서, 다음 단계, 법령 원문, 확인 질문과 감사 식별자를 하나의 읽기 전용 검토 패킷으로 구성합니다. 실제 결재·접수·발송은 수행하지 않습니다.",
      inputSchema: {
        slug: z.string().trim().min(1).max(160).describe("제도 slug"),
        current_step: z.string().trim().min(1).max(160).describe("완료된 현재 단계의 ID 또는 단계명"),
        condition: z.string().trim().max(160).optional().describe("담당자가 확인한 분기 조건. 모르면 생략"),
        event_fingerprint: z.string().trim().max(100).optional().describe("resolve_work_event가 반환한 비식별 이벤트 지문"),
      },
    },
    ({ slug, current_step, condition = "", event_fingerprint: eventFingerprint = null }) => {
      const packet = service.createActionPacket(slug, current_step, { condition, eventFingerprint });
      // R2 패킷도 온톨로지 ActionPacket 계약을 통과해야 한다(MCP-MAPPING.md).
      return { ...packet, ontology_packet: certifyPacketEnvelope(packet) };
    },
    (data) => data.status === "ready-for-human-review"
      ? `${data.procedure.name}: 담당자 검토가 필요한 인계 패킷 ${data.packet_id}를 만들었습니다.`
      : `${data.procedure.name}: ${data.status} 상태로 실행 준비를 중단했습니다.`,
  );


  if (ontologyEnabled) {
    registerReadOnlyTool(
      server,
      "load_ontology_case",
      {
        title: "온톨로지 케이스 로드",
        description: "Korea100 ontology case JSON을 읽어 케이스 메타·패킷 목록을 반환합니다. 실행 권한 없음.",
        inputSchema: {
          case_file: z.string().trim().max(200).optional().describe("ontology/ 기준 상대경로. 기본 information-disclosure 샘플"),
          case_id: z.string().trim().max(120).optional().describe("케이스 ID 검증용(선택)"),
        },
      },
      async ({ case_file = DEFAULT_CASE_FILE, case_id = null }) => {
        const data = await loadOntologyCase({ caseFile: case_file, caseId: case_id || null });
        return {
          case_id: data.case_id,
          institution_slug: data.institution_slug,
          institution_name: data.institution_name,
          as_of: data.as_of,
          ontology_version: data.ontology_version,
          entity_count: data.entities?.length ?? 0,
          relation_count: data.relations?.length ?? 0,
          state_count: data.states?.length ?? 0,
          rule_count: data.rules?.length ?? 0,
          action_packets: (data.action_packets ?? []).map((p) => ({ id: p.id, title: p.title, for_query: p.for_query })),
          demo_queries: (data.demo_queries ?? []).map((d) => d.q),
          execution_allowed: false,
        };
      },
      (data) => `온톨로지 케이스 ${data.case_id} (${data.institution_name})를 로드했습니다.`,
    );

    registerReadOnlyTool(
      server,
      "get_case_state",
      {
        title: "온톨로지 케이스 상태",
        description: "케이스의 State 목록과 열린 단계(ready/available)를 반환합니다.",
        inputSchema: {
          case_file: z.string().trim().max(200).optional(),
          case_id: z.string().trim().max(120).optional(),
        },
      },
      async ({ case_file = DEFAULT_CASE_FILE, case_id = null }) => {
        const data = await loadOntologyCase({ caseFile: case_file, caseId: case_id || null });
        return { ...getCaseState(data), execution_allowed: false };
      },
      (data) => `케이스 ${data.case_id} 상태: ${data.case_state}`,
    );

    registerReadOnlyTool(
      server,
      "query_case",
      {
        title: "온톨로지 케이스 질의",
        description: "케이스 상태·규칙을 바탕으로 ActionPacket(사람 검토용)을 반환합니다. 자동 집행 없음.",
        inputSchema: {
          query: z.string().trim().min(1).max(300).describe("예: 부분공개 통지 왔는데 뭐 하면 됨?"),
          case_file: z.string().trim().max(200).optional(),
          case_id: z.string().trim().max(120).optional(),
        },
      },
      async ({ query, case_file = DEFAULT_CASE_FILE, case_id = null }) => {
        const data = await loadOntologyCase({ caseFile: case_file, caseId: case_id || null });
        const result = queryCase(data, query);
        const linkage = await checkCaseLinkageFor(data);
        if (result.packet && (linkage.status !== "aligned" || !linkage.next_action_allowed)) {
          // 제도 층이 다음 행동을 보증하지 못하면 패킷에 그 사실을 남긴다.
          result.packet.risks = [...(result.packet.risks ?? []), ...linkage.notes];
        }
        return { ...result, linkage };
      },
      (data) => data.mode === "case_action_packet"
        ? `케이스 패킷 ${data.packet.packet_id} (제도 대조 ${data.linkage.status}, execution_allowed=false)`
        : `케이스 상태 조회 (${data.state?.case_state ?? "unknown"})`,
    );

    registerReadOnlyTool(
      server,
      "check_case_linkage",
      {
        title: "케이스↔제도 대조",
        description: "온톨로지 케이스의 단계·연결선이 제도 업무구조도와 일치하는지 대조하고, 제도 준비도 등급으로 다음 행동 계산 허용 여부를 판정합니다.",
        inputSchema: {
          case_file: z.string().trim().max(200).optional().describe("ontology/ 기준 상대경로. 기본 information-disclosure 샘플"),
          case_id: z.string().trim().max(120).optional(),
        },
      },
      async ({ case_file = DEFAULT_CASE_FILE, case_id = null }) => {
        const data = await loadOntologyCase({ caseFile: case_file, caseId: case_id || null });
        return checkCaseLinkageFor(data);
      },
      (data) => data.institution_found
        ? `${data.institution_slug}: 대조 ${data.status}, 준비도 ${data.readiness?.level ?? "미평가"}, 다음행동 허용 ${data.next_action_allowed}`
        : `${data.institution_slug}: 제도 파일을 찾지 못했습니다.`,
    );
  }

  server.registerResource(
    "administrative-procedure-status",
    "korea100://status",
    {
      title: "행정절차 MCP 검증 상태",
      description: "R2 절차별 법령 대조 신선도와 읽기 전용 안전 정책",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(service.getStatus(), null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "agent-ready-procedure-index",
    "korea100://procedures",
    {
      title: "Korea100 R2 행정절차 목록",
      description: "행정절차 MCP에서 다음 행동 질의가 가능한 검증 제도 목록",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(service.searchProcedures({ limit: 20 }), null, 2),
        },
      ],
    }),
  );

  for (const resource of service.listProcedureResources()) {
    const slug = resource.uri.split("/").at(-1);
    server.registerResource(
      `procedure-${slug}`,
      resource.uri,
      {
        title: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(service.getProcedureMap(slug), null, 2),
          },
        ],
      }),
    );
  }

  return server;
}

export async function startStdioServer() {
  const rawMaxAge = process.env.KOREA100_MCP_MAX_LEGAL_CHECK_AGE_DAYS;
  const maxLegalCheckAgeDays = rawMaxAge === undefined ? 30 : Number(rawMaxAge);
  if (!Number.isInteger(maxLegalCheckAgeDays) || maxLegalCheckAgeDays < 0) {
    throw new TypeError("KOREA100_MCP_MAX_LEGAL_CHECK_AGE_DAYS는 0 이상의 정수여야 합니다.");
  }

  let institutions = [];
  try {
    institutions = await loadAgentReadyInstitutions();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[${SERVER_NAME}] R2 catalog unavailable; ontology tools still enabled. (${msg})`);
    institutions = [];
  }

  const service = new AdministrativeProcedureService(institutions, { maxLegalCheckAgeDays });
  const server = createAdministrativeProcedureMcpServer(service, { ontologyEnabled: true });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startStdioServer().catch((error) => {
    console.error(`[${SERVER_NAME}] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
