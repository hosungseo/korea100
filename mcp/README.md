# Korea100 행정절차 MCP

Korea100의 업무구조도를 AI 에이전트가 질의할 수 있는 **읽기 전용 행정절차 MCP**다. 법령 검색기가 아니라, 현재 업무 단계가 끝난 뒤 누가 무엇을 확인하고 어떤 문서를 누구에게 넘겨야 하는지를 반환한다.

현재 구현은 온나라 등 실제 전자결재시스템에 접속하지 않는다. 비식별 업무 이벤트를 제도·단계에 보수적으로 연결하고, 담당자가 검토할 다음 행동 패킷을 만드는 연계 인터페이스다.

## 현재 범위

전체 653개를 자동 변환하지 않는다. 다음 열두 제도만 R2(`next-action`) 검증을 통과해 공개한다.

- 과태료 사전통지·의견제출
- 과태료 이의제기·법원재판
- 국가연구개발비 지급·사용·정산
- 정보공개청구 (2026-09-01 승격)
- 반도체클러스터 조성계획 승인·지정·조정 (2026-09-01 승격)
- 반도체 산업기반시설 지원·예타·인허가 신속처리 (2026-09-01 승격)
- 국가첨단전략산업 특화단지 지정·지원 (2026-09-01 승격)
- 인허가 일괄협의·의제 처리 (2026-09-01 승격)
- 예타 특례·신속인허가 (2026-09-01 승격)
- 지방재정 투자심사·타당성조사 (2026-09-01 승격)
- 분산에너지사업 등록·전력거래 (2026-09-01 승격)
- 예비타당성조사 (2026-09-01 승격, 1개 단계 참고용 격리)

서버 시작 시 세 JSON의 R2 등급, 법제처 현행 조문 대조 통과, 모든 노드·전이의 사람 확인 강제를 다시 검사한다. 하나라도 어긋나면 R2 카탈로그를 비우고 그 사실을 stderr에 남긴다. R2 도구는 빈 카탈로그로 응답하고 온톨로지 도구는 계속 동작한다. 즉 검증되지 않은 절차가 조용히 공개되는 일은 없다. 마지막 원문 대조일이 기본 30일을 넘으면 절차를 검색할 수는 있지만 다음 경로 선택은 중단한다.

## 도구

| 도구 | 용도 |
|---|---|
| `search_procedures` | 제도명·업무·기관·문서·법령과 담당자로 R2 절차 검색 |
| `get_procedure_map` | 단계 ID, 담당자, 입력·산출물, 기한, 전이 조건 확인 |
| `get_step_requirements` | 현재 단계의 시작 조건·완료 기준·증빙·법제처 원문 링크 확인 |
| `get_next_actions` | 현재 단계 이후의 다음 행동·인계 주체·문서·분기 조건 계산 |
| `resolve_work_event` | 비식별 전자결재 이벤트를 제도·단계 후보에 보수적으로 매핑 |
| `create_action_packet` | 인계 문서·다음 단계·확인 질문·감사 식별자를 사람 검토용 패킷으로 구성 |
| `load_ontology_case` | 온톨로지 케이스 JSON 로드(케이스 메타·패킷 목록) |
| `get_case_state` | 케이스의 State 목록과 열린 단계 조회 |
| `query_case` | 케이스 상태·규칙으로 사람 검토용 ActionPacket 선택 |
| `check_case_linkage` | 케이스 그래프를 제도 업무구조도(또는 메가프로젝트 오버레이)와 대조하고 준비도 등급으로 다음 행동 허용 여부 판정 |
| `get_project_status` | 프로젝트 케이스의 마일스톤을 완료·진행·착수가능·차단·경로미확정으로 분류 |
| `explain_blocked_milestone` | 마일스톤을 막는 아티팩트와 상류 선행 마일스톤 추적 |

`create_action_packet`과 `query_case`는 서로 다른 경로지만 같은 ActionPacket 계약을 통과한다.
두 응답 모두 정규화된 `ontology_packet`을 함께 반환하고, `execution_allowed=false`·
`human_confirmation_required=true`·`auto_execute=false`가 깨지면 응답 대신 오류를 낸다
(`src/packet-contract.mjs`, 매핑표는 [../ontology/MCP-MAPPING.md](../ontology/MCP-MAPPING.md)).

`query_case`는 매번 케이스를 제도 업무구조도와 대조한다(`src/case-link.mjs`). 케이스가
제도에 없는 단계·연결선을 가리키거나 제도 준비도가 R2에 못 미치면 그 사유가 패킷의
`risks`로 들어간다. 샘플 케이스는 3건이다.

| 케이스 파일 | 제도 | 준비도 | 다음 행동 계산 |
|---|---|---|---|
| `samples/information-disclosure.case.json` (기본) | 정보공개청구 | R2 | 가능 |
| `samples/administrative-fine-pre-notice.case.json` | 과태료 사전통지·의견제출 | R2 | 가능 |
| `samples/gwangju-semiconductor-cluster.case.json` | 광주 반도체 클러스터 (제도 108종 중 8종 R2) | 부분 | N02·N03·N19·N20 |
| `samples/semiconductor-cluster-designation.case.json` | 반도체클러스터 지정 (N03) | R2 | 가능 |
| `samples/semiconductor-infrastructure-fasttrack.case.json` | 기반시설 지원·신속처리 (N20) | R2 | 가능 |
| `samples/preliminary-feasibility-study.case.json` | 예비타당성조사 (N02) | R2 | 가능 (P16 격리) |
| `samples/national-strategic-industry-complex.case.json` | 특화단지 (N03) | R2 | 가능 |

질의가 케이스의 데모 질문과 충분히 가깝지 않으면 패킷을 만들지 않고
`case_needs_disambiguation`으로 후보를 되묻는다.

```bash
node scripts/ontology-query-once.mjs --case samples/administrative-fine-pre-notice.case.json \
  "과태료 사전통지 받았는데 뭐 해야 해?"
```

## 참고용 단계 격리

R2는 제도의 모든 단계가 실행 대상이라는 뜻이 아니다. 근거가 약한 단계는 `reference_only_node_ids`로
격리하고 나머지만 실행 대상으로 삼는다. 격리는 근거 품질 문제(신뢰도 0.8 미만, 미검증 근거,
의무 성격 미분류, 기한 성격 재확인)에만 허용한다. 모델 자체가 미완인 경우(계약 누락, 증빙 문서 없음,
템플릿성 문장, 명시 조문 없음)는 여전히 제도 전체를 막는다. 격리한 뒤 절차가 끊어지면 R2를 주지 않는다.

격리는 표시로 끝나지 않는다. 서비스가 실제로 거부한다.

- `get_next_actions`가 격리된 단계에서 출발하면 `reference-only-step`으로 계산을 중단한다
- 격리된 단계로 가는 전이는 선택 후보에서 빼고 `reference_only.excluded_actions`에 사유와 함께 남긴다
- `create_action_packet`은 `blocked-reference-only` 상태로 인계 문서 없이 반환한다

예비타당성조사가 이 경우다. 지자체 사업 건의(P16)는 국가재정법이 정한 절차 단계가 아니라
실무 관행이어서 격리했고, 나머지 16개 단계는 실행 대상이다.

`get_next_actions`는 복수 분기에서 조건을 임의로 선택하지 않는다. 조건이 없거나 `승인`처럼 여러 경로에 걸치는 표현이면 `decision_required: true`와 모든 후보를 반환한다.

`resolve_work_event`도 제도와 단계가 정확히 함께 확인될 때만 `resolved`를 반환한다. 부분 일치, 동점 후보, 개인정보로 보이는 값, 본문·첨부 포함 가능성이 있으면 자동 매핑하거나 다음 행동을 실행하지 않는다.

## 실행과 검증

Node.js 20 이상이 필요하다.

```bash
cd mcp
npm install
npm test
npm start
```

`npm start`는 MCP 클라이언트가 자식 프로세스로 실행하는 stdio 서버이므로 일반 터미널 화면에는 별도 UI가 뜨지 않는다.

법령 대조 허용 기간은 기본 30일이다. 운영 정책상 다른 값이 필요하면 서버 프로세스에 0 이상의 정수로 지정한다.

```bash
KOREA100_MCP_MAX_LEGAL_CHECK_AGE_DAYS=30 npm start
```

MCP 클라이언트 설정에는 [mcp-config.example.json](mcp-config.example.json)의 경로를 실제 절대경로로 바꿔 등록한다.

```json
{
  "mcpServers": {
    "korea100-administrative-procedure": {
      "command": "node",
      "args": ["/absolute/path/to/korea100/mcp/src/server.mjs"]
    }
  }
}
```

## 수동 질의 흐름

1. `search_procedures({ "query": "연구비 사전승인" })`
2. `get_procedure_map({ "slug": "national-rd-fund-use-settlement" })`
3. `get_next_actions({ "slug": "national-rd-fund-use-settlement", "current_step": "P05" })`
4. 담당자가 분기 조건을 확인한다.
5. `get_next_actions({ "slug": "national-rd-fund-use-settlement", "current_step": "P05", "condition": "승인 필요" })`

마지막 응답은 `P06 사전승인 신청·결정`, 인계 대상 `중앙행정기관·전문기관`, 전달 문서 `사전승인 대상 검토표`를 반환한다.

## 전자결재 이벤트 흐름

문서 본문, 첨부파일, 주민등록번호, 개인 연락처, 이메일을 보내지 않는다. 시스템명, 이벤트 유형, 제도·단계 식별자, 비식별 문서 유형처럼 매핑에 필요한 최소 메타데이터만 전달한다.

```json
{
  "metadata_only": true,
  "source_system": "onnara",
  "event_type": "approval.completed",
  "procedure_hint": "national-rd-fund-use-settlement",
  "step_hint": "P05",
  "condition": "승인 필요"
}
```

1. `resolve_work_event`가 입력값을 저장하지 않고 `event_fingerprint`를 만든다.
2. 정확한 제도와 단계가 함께 확인되면 다음 행동을 조회한다.
3. 모호하면 `needs-mapping`과 최대 5개 후보만 반환한다.
4. 확인된 이벤트 지문과 조건으로 `create_action_packet`을 호출한다.
5. 패킷이 `ready-for-human-review`여도 `execution_allowed`는 항상 `false`다.

패킷은 다음 상태 중 하나다.

- `ready-for-human-review`: 분기와 법령 대조가 유효하며 담당자 검토 가능
- `blocked-decision-required`: 사건에 적용할 분기가 확인되지 않음
- `blocked-verification-required`: 법령 원문 대조 유효기간 만료
- `terminal`: 등록된 후속 단계 없음

## 리소스

- `korea100://procedures`: MCP 공개 대상 목록
- `korea100://procedures/{slug}`: 개별 절차 지도
- `korea100://status`: 절차별 법령 대조 신선도와 안전 정책

## 안전 경계

- 읽기 전용이며 파일, 전자결재, 민원·연구비 시스템을 수정하지 않는다.
- 업무 이벤트는 비식별 메타데이터만 허용하고, 주민등록번호·전화번호·이메일로 보이는 값은 거부한다.
- 이벤트 원문을 저장하지 않으며 정규화된 메타데이터의 SHA-256 지문 일부만 감사 연결용으로 반환한다.
- 모든 응답은 `human_confirmation_required: true`다.
- 실행 패킷은 항상 `execution_allowed: false`다.
- 공식 원문은 별도 법령 MCP를 거치지 않고 `law.go.kr` 링크로 직접 연결한다.
- 저장된 대조 결과는 조문 번호의 존재를 확인한 것이며, 개별 사건에 대한 법률 해석이나 처분 권한을 대신하지 않는다.

## 다음 단계

- R3: 현업 담당자가 실제 업무분장, 내부 서식, 시스템 입력 필드와 인계 방식을 확인
- 이벤트 어댑터: 기관별 업무분류·문서유형 코드를 제도 slug·단계 ID에 매핑
- 실행 게이트웨이: MCP의 읽기 전용 제안과 실제 시스템 쓰기를 분리하고 별도 권한·감사로그·사람 승인을 강제
- R4: 온나라 등 전자결재 테스트 환경에서 이벤트→다음 행동 제안→담당자 확인 흐름을 검증


## 온톨로지 연계 (2026-09-01)

R2 카탈로그와 별도로 **ontology case** 경로를 제공한다. 케이스는 두 종류다.

- `case_kind: institution` — 제도 하나, 사건 하나 (1·2호)
- `case_kind: project` — 사업 하나, 제도 여럿 (3호 광주 반도체 클러스터, 제도 108종)

매핑표: [../ontology/MCP-MAPPING.md](../ontology/MCP-MAPPING.md)

R2 제도 JSON에 `agent_readiness`가 없으면 R2 도구 카탈로그는 비고 온톨로지 도구는 계속 동작한다.
