# Korea100 Ontology (v0)

목적: 제도 **맵**을 **객체·관계·상태·규칙·액션패킷**으로 닫아, 같은 질문에 같은 판단 패키지가 나오게 한다.

공공 액션 층 = 시스템 자동 write가 아니라 **사람 승인 패킷**.

## 파일
- `core-schema.json` — 5타입 코어 스키마
- `samples/information-disclosure.case.json` — **정보공개청구** 샘플 1건
- `scripts/demo_query.py` — 샘플 질의 데모

## 샘플 사안
- 제도: 정보공개청구 (`information-disclosure`)
- 케이스: `IDC-2026-0901-001`
- 상태: 2026-08-28 부분공개 통지 후, 이의신청 전
- as_of: 2026-09-01

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
- 같은 스키마로 환평/예타 중 1개 추가
- MCP `create_action_packet` 출력을 이 JSON 형태로 고정


## MCP 연계
- 매핑표: [MCP-MAPPING.md](MCP-MAPPING.md)
- 브리지: `mcp/src/ontology-bridge.mjs`
- MCP 도구: `load_ontology_case`, `get_case_state`, `query_case`, `check_case_linkage`
- 패킷 계약: `mcp/src/packet-contract.mjs` — R2 경로(`create_action_packet`)와 온톨로지 경로가 같은 ActionPacket 계약을 통과해야 한다
- 케이스 대조: `mcp/src/case-link.mjs` — 케이스 그래프가 제도 업무구조도와 어긋나면 드러낸다
- 테스트: `cd mcp && npm test` (36건)
- 데모: `node mcp/scripts/ontology-query-once.mjs`

## 제도 층과의 관계
케이스는 제도 업무구조도의 투영이다. 샘플 케이스는 `information-disclosure`의
17개 노드·26개 엣지와 1:1로 대응하고, 매 질의마다 그 대응이 검사된다.

준비도는 `web/data/institutions/*.json`의 `process.agent_readiness`에 있다
(생성 `web/scripts/generate-agent-readiness-showcase.mjs`, 법제처 대조
`LAW_OC=... AGENT_VERIFY_DATE=... node web/scripts/verify-agent-readiness-showcase.mjs`).

| 제도 | 등급 | 뜻 |
|---|---|---|
| 과태료 사전통지·의견제출 외 2종 | R2 (next-action) | 다음 행동 후보 계산 허용 |
| 정보공개청구 | R1 (reference-only) | 케이스 패킷은 참고용, 다음 행동 자동 계산 금지 |

R1인 이유는 조문이 틀려서가 아니다(30/30 현행 대조 통과). 신뢰도 0.8 미만 노드 3개,
기한 성격 재확인 10개, 전이 수동 대조 미완료가 남아서다. 그 사유는 데이터에
`blockers`로 남아 있고, 케이스 질의 응답의 `risks`로 그대로 흘러나온다.
