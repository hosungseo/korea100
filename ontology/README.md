# Korea100 Ontology (v0)

목적: 제도 **맵**을 **객체·관계·상태·규칙·액션패킷**으로 닫아, 같은 질문에 같은 판단 패키지가 나오게 한다.

공공 액션 층 = 시스템 자동 write가 아니라 **사람 승인 패킷**.

## 파일
- `core-schema.json` — 5타입 코어 스키마 (`case_kind`: institution | project)
- `samples/information-disclosure.case.json` — **정보공개청구** 샘플 1호 (제도 R2)
- `samples/administrative-fine-pre-notice.case.json` — **과태료 사전통지·의견제출** 샘플 2호 (제도 R2)
- `samples/gwangju-semiconductor-cluster.case.json` — **광주 반도체 클러스터** 샘플 3호 (프로젝트, 제도 108개)
- `scripts/derive-case.mjs` — 제도 업무구조도 → 케이스 구조 층 파생
- `scripts/derive-project-case.mjs` — 메가프로젝트 오버레이 → 프로젝트 케이스 구조 층 파생
- `scripts/demo_query.py` — 샘플 질의 데모

## 두 가지 케이스 종류

`case_kind: "institution"` — 제도 하나, 사건 하나. 단계는 `step:Pxx`, 연결은 업무구조도 엣지.

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
- N02를 열려면 예타 계열 3종(preliminary-feasibility-study, pfs-exemption-fast-track, local-finance-investment-review-feasibility) R2 승격 필요
- N23 용수·도로는 5종이 미평가라 가장 멀다
- 남은 R2 제도 2종에 케이스 추가 (과태료 이의제기·법원재판, 국가연구개발비 정산)
- 제도·오버레이 변경 시 케이스 재파생을 CI로 강제 (지금은 `--remerge` 수동 실행)


## MCP 연계
- 매핑표: [MCP-MAPPING.md](MCP-MAPPING.md)
- 브리지: `mcp/src/ontology-bridge.mjs`
- MCP 도구: `load_ontology_case`, `get_case_state`, `query_case`, `check_case_linkage`, `get_project_status`, `explain_blocked_milestone`
- 패킷 계약: `mcp/src/packet-contract.mjs` — R2 경로(`create_action_packet`)와 온톨로지 경로가 같은 ActionPacket 계약을 통과해야 한다
- 케이스 대조: `mcp/src/case-link.mjs` — 케이스 그래프가 제도 업무구조도와 어긋나면 드러낸다
- 테스트: `cd mcp && npm test` (59건)
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
| 반도체클러스터 지정·조정, 반도체 기반시설 신속처리, 국가첨단전략산업 특화단지, 인허가 일괄협의 | R2 (2026-09-01 승격) | 3호가 참조 | 마일스톤 N03만 true |
| 광주 반도체 클러스터 참조 나머지 104종 | 미평가 | 3호(프로젝트) | false |

정보공개청구는 2026-09-01에 R1에서 승격했다. 조문이 틀렸던 것이 아니라
기한의 성격과 전이가 대조되지 않았던 것이다. 자세한 내용은
[R2 승격 기록](../docs/information-disclosure-r2-2026-09-01.md).

준비도가 R2에 못 미치면 `next_action_allowed`가 거짓이 되고 그 사유가
케이스 질의 응답의 `risks`로 흘러나온다.
