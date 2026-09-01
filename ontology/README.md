# Korea100 Ontology (v0)

목적: 제도 **맵**을 **객체·관계·상태·규칙·액션패킷**으로 닫아, 같은 질문에 같은 판단 패키지가 나오게 한다.

공공 액션 층 = 시스템 자동 write가 아니라 **사람 승인 패킷**.

## 파일
- `core-schema.json` — 5타입 코어 스키마 (`case_kind`: institution | project)
- `samples/information-disclosure.case.json` — **정보공개청구** 샘플 1호 (제도 R2)
- `samples/administrative-fine-pre-notice.case.json` — **과태료 사전통지·의견제출** 샘플 2호 (제도 R2)
- `samples/gwangju-semiconductor-cluster.case.json` — **광주 반도체 클러스터** 샘플 3호 (프로젝트, 제도 108개)
- `samples/semiconductor-cluster-designation.case.json` — **반도체클러스터 지정** 샘플 4호 (3호의 N03)
- `samples/semiconductor-infrastructure-fasttrack.case.json` — **기반시설 지원·신속처리** 샘플 5호 (3호의 N20)
- `samples/preliminary-feasibility-study.case.json` — **예비타당성조사** 샘플 6호 (3호의 N02, 1개 단계 격리)
- `samples/national-strategic-industry-complex.case.json` — **국가첨단전략산업 특화단지** 샘플 7호 (3호의 N03, 4호와 같은 마일스톤)
- `samples/distributed-energy-grid-assessment.case.json` — **정식 전력계통영향평가** 샘플 8호 (3호의 N19, 5호와 배타)
- `scripts/derive-case.mjs` — 제도 업무구조도 → 케이스 구조 층 파생
- `scripts/derive-project-case.mjs` — 메가프로젝트 오버레이 → 프로젝트 케이스 구조 층 파생
- `scripts/demo_query.py` — 샘플 질의 데모

## 두 가지 케이스 종류

`case_kind: "institution"` — 제도 하나, 사건 하나. 단계는 `step:Pxx`, 연결은 업무구조도 엣지.

제도 케이스는 `project_context`로 프로젝트의 특정 마일스톤을 채운다고 선언할 수 있다.
그 주장은 검사된다. 오버레이에 그 마일스톤이 있는지, 그 마일스톤이 실제로 이 제도를
참조하는지, 이름이 갈라지지 않았는지를 매 질의마다 대조한다.

`case_kind: "project"` — 사업 하나, 제도 여럿. 단계는 `milestone:Nxx`, 연결은
**아티팩트 인계**(`hands_off_to`)다. 어긋나는 지점이 제도 안이 아니라 제도 사이에 있다.
다음 행동 계산은 참조 제도가 **전부** R2일 때만 허용한다.

## 구조 층은 파생물이다
케이스의 Step/Gate/System 엔티티와 sequence·message·loop 관계는 제도 그래프의 투영이다.
손으로 옮겨 적으면 옮겨 적는 순간부터 어긋난다.

```bash
node ontology/scripts/derive-case.mjs --slug <제도 slug> --case-id <ID> --as-of <YYYY-MM-DD>
```

파생 규칙(노드 유형 → 엔티티 유형, 신뢰도 0.8 미만 → `unverified`)은 1호 손작성 케이스에서
역으로 읽어낸 것이고, `mcp/test/derive-case.test.mjs`가 파생 결과와 1호의 구조 층이
같은지 검사한다. 사람이 쓰는 것은 사건 고유 층(Case/Decision/Document/State/Rule/ActionPacket)뿐이다.

## 샘플 사안
**1호** 정보공개청구 (`information-disclosure`) — 케이스 `IDC-2026-0901-001`.
2026-08-28 부분공개 통지 후, 이의신청 전. as_of 2026-09-01.

**2호** 과태료 사전통지·의견제출 (`administrative-fine-pre-notice-opinion`) — 케이스 `AFN-2026-0901-001`.
2026-08-27 사전통지 수령, 의견 제출 기한 2026-09-08까지 열려 있음. as_of 2026-09-01.
당사자용·행정청용 패킷을 각각 낸다 → [DEMO](samples/administrative-fine-pre-notice.DEMO.md)

**4~7호** 3호의 마일스톤을 안쪽에서 채우는 제도 케이스 넷. 사업 층은 '어느 마일스톤이 열렸나'를,
제도 층은 '그 마일스톤 안에서 어느 단계인가'를 답한다.

| 케이스 | 제도 | 마일스톤 | 안쪽에서 막고 있는 것 |
|---|---|---|---|
| 4호 `GSC-N03-2026-0901` | 반도체클러스터 지정 | N03 | 사업구역 경계 미확정 (영 제17조제1항제2호) |
| 5호 `GSC-N20-2026-0901` | 기반시설 지원·신속처리 | N20 | 클러스터 지정 전이라 신청 자격 없음 (법 제27조제1항) |
| 6호 `GSC-N02-2026-0901` | 예비타당성조사 | N02 | 총사업비 미확정으로 대상 여부 판정 불가 (법 제38조제1항) |
| 7호 `GSC-N03B-2026-0901` | 국가첨단전략산업 특화단지 | N03 | 반도체클러스터와 중복 지정 가능, 경로 선택 |
| 8호 `GSC-N19-2026-0901` | 정식 전력계통영향평가 | N19 | 전력수요 미확정, 5호(N20)와 배타 |

N23 용수·도로는 제도 여섯이 걸린 가장 복잡한 자리인데 여섯 모두 R2가 되어 열렸다.

N03에는 케이스가 둘 붙는다. 반도체특별법 제11조제5항 후단이 두 지정의 중복을 명문으로
허용하기 때문이다. 배타 관계가 아니라 순서와 조합의 문제다
→ [4호 DEMO](samples/semiconductor-cluster-designation.DEMO.md)

**3호** 광주 군공항 부지 반도체 클러스터 (`gwangju-semiconductor-cluster`) — 케이스 `GSC-2026-0901-001`.
마일스톤 54·아티팩트 53·참조 제도 108·관계 462. 완료 2 / 진행 1 / 착수가능 10 / 차단 36 / 경로미확정 5.
2026-09-01 임계경로 제도 4종을 R2로 올려 **N03 반도체클러스터 지정**이 처음으로 다음 행동 계산 대상이 됐다 → [DEMO](samples/gwangju-semiconductor-cluster.DEMO.md)

```bash
node ontology/scripts/derive-project-case.mjs --project gwangju-semiconductor-cluster \
  --case-id GSC-2026-0901-001 --as-of 2026-09-01
node ontology/scripts/derive-project-case.mjs --remerge samples/gwangju-semiconductor-cluster.case.json
```

## Before → After
**Before (맵만):** "정보공개는 청구→결정→불복 구조입니다…" (장문 설명)

**After (온톨로지):**
1. 객체: `case:IDC-…` + `dec:partial-disclosure`
2. 상태: `decision_notified_partial`
3. 규칙: 부분공개면 수령(P10)과 이의(P11) 병행 가능
4. 패킷: `ap:claimant-after-partial` 체크리스트

## 데모
```bash
python3 ontology/scripts/demo_query.py
python3 ontology/scripts/demo_query.py "부분공개 통지 왔는데 뭐 하면 됨?"
```

## 다음
- 계산 가능한 마일스톤은 N02·N03·N19·N20·N23이다. 남은 미평가 제도는 95종
- N23 용수·도로는 5종이 미평가라 가장 멀다
- 남은 R2 제도 2종에 케이스 추가 (과태료 이의제기·법원재판, 국가연구개발비 정산)
- 제도·오버레이 변경 시 케이스 재파생을 CI로 강제 (지금은 `--remerge` 수동 실행)


## MCP 연계
- 매핑표: [MCP-MAPPING.md](MCP-MAPPING.md)
- 브리지: `mcp/src/ontology-bridge.mjs`
- MCP 도구: `load_ontology_case`, `get_case_state`, `query_case`, `check_case_linkage`, `get_project_status`, `explain_blocked_milestone`
- 패킷 계약: `mcp/src/packet-contract.mjs` — R2 경로(`create_action_packet`)와 온톨로지 경로가 같은 ActionPacket 계약을 통과해야 한다
- 케이스 대조: `mcp/src/case-link.mjs` — 케이스 그래프가 제도 업무구조도와 어긋나면 드러낸다
- 테스트: `cd mcp && npm test` (79건)
- 데모: `node mcp/scripts/ontology-query-once.mjs [--case samples/<파일>] "<질문>"`

## 제도 층과의 관계
케이스는 제도 업무구조도의 투영이다. 1호는 17개 노드·26개 엣지, 2호는 10개 노드·11개 엣지와
1:1로 대응하고, 매 질의마다 그 대응이 검사된다.

준비도는 `web/data/institutions/*.json`의 `process.agent_readiness`에 있다
(생성 `web/scripts/generate-agent-readiness-showcase.mjs`, 법제처 대조
`LAW_OC=... AGENT_VERIFY_DATE=... node web/scripts/verify-agent-readiness-showcase.mjs`).

| 제도 | 등급 | 케이스 | `next_action_allowed` |
|---|---|---|---|
| 정보공개청구 | R2 (next-action) | 1호 | true |
| 과태료 사전통지·의견제출 | R2 (next-action) | 2호 | true |
| 과태료 이의제기·법원재판, 국가연구개발비 정산 | R2 (next-action) | 없음 | — |
| 반도체 클러스터 임계경로 8종 | R2 (2026-09-01 승격) | 3호가 참조 | 마일스톤 N02·N03·N19·N20 |
| 예비타당성조사 | R2 (1개 단계 참고용 격리) | 3호가 참조 | 지자체 건의(P16)는 법정 절차가 아니라 격리 |
| 광주 반도체 클러스터 참조 나머지 100종 | 미평가 | 3호(프로젝트) | false |

정보공개청구는 2026-09-01에 R1에서 승격했다. 조문이 틀렸던 것이 아니라
기한의 성격과 전이가 대조되지 않았던 것이다. 자세한 내용은
[R2 승격 기록](../docs/information-disclosure-r2-2026-09-01.md).

준비도가 R2에 못 미치면 `next_action_allowed`가 거짓이 되고 그 사유가
케이스 질의 응답의 `risks`로 흘러나온다.
