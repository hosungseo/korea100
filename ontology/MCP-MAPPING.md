# Korea100 MCP ↔ Ontology Mapping

## 원칙
- MCP = 창구(tool surface)
- Ontology = 장부 문법(Entity/Relation/State/Rule/ActionPacket)
- 연계 후 MCP 케이스 모드는 ontology case JSON을 읽고, 패킷은 ontology ActionPacket 계약을 만족해야 한다.
- `execution_allowed` / `auto_execute` 는 항상 false.

## Tool → Ontology

| MCP tool | Ontology 역할 | 비고 |
|---|---|---|
| `search_procedures` | Institution Entity 검색 | R2 템플릿 경로 |
| `get_procedure_map` | Step/Gate Entity + sequence Relation | 제도 템플릿 |
| `get_step_requirements` | Step attrs + Statute cites | |
| `get_next_actions` | Rule 평가 + sequence/message edges | condition 임의추정 금지 |
| `resolve_work_event` | State 후보 매핑 (보수적) | |
| `create_action_packet` | **ActionPacket** 생성 | 사람 검토 전용 |
| `load_ontology_case` *(신규)* | Case graph 로드 | samples/*.case.json |
| `get_case_state` *(신규)* | State[] 조회 | 케이스 인스턴스 |
| `query_case` *(신규)* | Rule fire + ActionPacket 선택 | 데모 질문 해소 |
| `check_case_linkage` *(신규)* | Case ↔ Institution/Project 그래프 대조 | 준비도 등급으로 다음 행동 허용 판정 |
| `get_project_status` *(신규)* | 프로젝트 케이스 마일스톤 개폐 계산 | 아티팩트 의존 그래프에서 결정적 계산 |
| `explain_blocked_milestone` *(신규)* | 차단 아티팩트 → 상류 마일스톤 추적 | 추정 금지, 그래프만 따라간다 |

## 프로젝트 케이스 (case_kind: project)

제도 하나가 아니라 사업 하나를 다룬다. 대조 대상도 업무구조도가 아니라
메가프로젝트 오버레이(`web/data/mega-projects/projects/*.json`)다.

| 검사 | 어긋남 판정 |
|---|---|
| `milestone:Nxx` 가 오버레이 노드에 존재 | `unknown_milestone_ids` |
| 마일스톤 라벨 == 오버레이 노드명 | `label_mismatches` |
| `requires` 관계가 오버레이 의존에 존재 | `unknown_requires` |
| 케이스에 박은 준비도 == 현재 제도 파일 준비도 | `stale_readiness` |

`next_action_allowed = aligned && 참조 제도가 **전부** R2`. 제도 케이스보다 엄격하다.
사업은 가장 준비 안 된 제도만큼만 계산 가능하기 때문이다.

마일스톤 개폐는 아티팩트 의존에서 결정적으로 나온다. hard `finish_to_start`만 차단으로
보고 soft는 경고로 남긴다. 활성화 규칙이 걸린 마일스톤은 그 파라미터가 확정되기
전까지 `path_undetermined`로 두며, 오버레이 진행 상태보다 이 판정이 우선한다.

## 두 층의 대조 (case-link)

케이스는 제도 업무구조도의 투영이다. `mcp/src/case-link.mjs`가 매 질의마다 둘을 대조한다.

| 검사 | 어긋남 판정 |
|---|---|
| `step:Pxx` 엔티티·상태가 제도 노드에 존재 | `unknown_step_ids` |
| 단계 라벨 == 제도 노드명 | `label_mismatches` |
| step→step 관계가 제도 엣지에 존재 | `unknown_edges` |
| 제도 노드 중 케이스가 안 다루는 것 | `uncovered_node_ids` (경고, 어긋남 아님) |

`next_action_allowed = (status === "aligned") && readiness.level === "R2"`.
거짓이면 그 사유가 `query_case` 패킷의 `risks`로 들어간다. 등급이 모자란 제도의
케이스가 다음 행동을 확정한 것처럼 보이지 않게 하려는 것이다.

| 케이스 | 제도 | 준비도 | `next_action_allowed` |
|---|---|---|---|
| 1호 `IDC-2026-0901-001` | 정보공개청구 | R2 (2026-09-01 승격) | true |
| 2호 `AFN-2026-0901-001` | 과태료 사전통지·의견제출 | R2 | true |
| 3호 `GSC-2026-0901-001` | 광주 반도체 클러스터 (제도 108종 중 6종 R2·1종 R1) | 부분 | false (마일스톤 N03만 계산 가능) |

정보공개청구는 인용 오류 2건 정정·기한 성격 10건 재확인·전이 26건 수동 대조를 거쳐
R1에서 올라왔다: [승격 기록](../docs/information-disclosure-r2-2026-09-01.md).

## 계약 강제 지점

문서로만 두지 않는다. `mcp/src/packet-contract.mjs`가 두 경로의 봉투를 같은
ActionPacket 모양으로 정규화하고, 계약 위반이면 응답 대신 오류를 던진다.

| 경로 | 봉투 | 정규화 결과 |
|---|---|---|
| R2 `create_action_packet` | `packet_id`/`checklist[].instruction`/`official_sources` | `ontology_packet` (`source_path: r2-procedure`) |
| 온톨로지 `query_case` | `packet.*` | `ontology_packet` (`source_path: ontology-case`) |

강제 항목: `execution_allowed === false`, `human_confirmation_required === true`,
`auto_execute === false`, 필수 6항목(`id/title/actor/why/checklist/human_signoff`) 비어 있지 않음.

## create_action_packet (MCP) ↔ ActionPacket (Ontology)

| MCP field | Ontology field | 변환 |
|---|---|---|
| `packet_id` | `id` | 그대로 또는 `ap:…` 우선 |
| `status` | (derived) | ready/blocked → why에 반영 |
| `execution_allowed: false` | `auto_execute: false` | **필수 동치** |
| `human_confirmation_required: true` | `human_signoff` | 문구로 승격 |
| `procedure.slug` | based_on institution / case | |
| `current_step.id` | `based_on` step:Pxx | `step:{id}` |
| `checklist[].instruction` | `checklist[]` | 문자열 배열로 평탄화 |
| `checklist[].evidence` | `evidence_needed` | merge unique |
| `handoff_packages` | checklist + system_touchpoints | |
| `blocking_questions` | checklist 선행 질문 / risks | |
| `official_sources` | based_on statute refs | |
| `audit.*` | based_on + why | 감사 추적용 유지 |

## State 모드
| 조건 | 모드 |
|---|---|
| case_id 없음 | 제도 설명 모드 (기존 MCP) |
| case_id 있음 + case JSON 존재 | 케이스 판단 모드 (ontology bridge) |
| unverified entity/rule | needs_human, 단정 금지 |

## 계약 테스트
질문: `부분공개 통지 왔는데 뭐 하면 됨?`
- case: `IDC-2026-0901-001`
- packet id 포함: `ap:claimant-after-partial` 또는 동등 checklist
- `auto_execute` / `execution_allowed` == false

```bash
cd mcp && npm test   # 60건
```

- `test/packet-contract.test.mjs` — 두 경로가 같은 계약·같은 키 집합을 내는지
- `test/case-link.test.mjs` — 1호 케이스 17단계·26관계가 제도와 1:1인지, 어긋남 3종을 잡는지
- `test/derive-case.test.mjs` — 파생기가 1호의 구조 층을 그대로 재현하는지
- `test/case-fine-pre-notice.test.mjs` — 2호(R2)에서 `next_action_allowed`가 참인지, 확신 없으면 되묻는지
- `test/project-case.test.mjs` — 3호(프로젝트)가 오버레이와 1:1인지, 마일스톤 개폐·차단 추적이 맞는지
- `test/protocol.test.mjs` — stdio로 도구 12개 공개, `query_case`·`check_case_linkage`·`get_project_status` 실물 호출

## 질의 매칭

`query_case`는 케이스가 선언한 `demo_queries` 중 가장 가까운 것을 고른다. 제도별 어휘를
코드에 두지 않는다 — 케이스가 늘 때마다 매처를 고치게 되기 때문이다.

| 단계 | 판정 | `match_reason` |
|---|---|---|
| 부분 문자열 일치 | 채택 | `exact` |
| 문자 바이그램 유사도 ≥ 0.3 | 채택 | `similar` |
| "어디/단계/상태/지금/진행" 질문 | 상태 데모로 | `stage-question` |
| 그 외 | **고르지 않는다** | `case_needs_disambiguation` + 후보 목록 |

마지막 줄이 핵심이다. 엉뚱한 패킷을 주는 것이 아무것도 안 주는 것보다 나쁘다.
