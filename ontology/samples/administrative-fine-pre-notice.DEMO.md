# 과태료 사전통지·의견제출 온톨로지 샘플 데모

샘플 2호. 1호(정보공개청구)와 두 가지가 다르다.

1. 구조 층을 손으로 쓰지 않고 `ontology/scripts/derive-case.mjs`가 제도 JSON에서 파생했다.
2. 제도 준비도가 **R2(next-action)**이라 `next_action_allowed = true`다. 1호는 R1이라 false다.

## 사안
2026-08-25 발송, 2026-08-27 수령한 과태료 사전통지. 의견 제출 기한은 2026-09-08.
as_of는 2026-09-01 — 아직 의견을 내지 않았고 기한은 남아 있다.

## 질문 1 — 당사자
> 과태료 사전통지 받았는데 뭐 해야 해?

| 칸 | 값 |
|---|---|
| 객체 | `case:AFN-2026-0901-001`, `doc:pre-notice` |
| 상태 | `pre_notice_received_opinion_open` (2026-08-27) |
| 규칙 | `rule:silence-treated-as-no-opinion` — 기한 내 의견이 없으면 의견이 없는 것으로 보고 부과로 진행(법 제16조제1항 후단) |
| 액션패킷 | `ap:party-after-pre-notice` |

## 질문 2 — 행정청
> 의견서 들어왔는데 다음에 뭐 하지?

| 칸 | 값 |
|---|---|
| 규칙 | `rule:substantial-reason-changes-outcome` — 상당한 이유가 있으면 미부과·변경(법 제16조제3항) |
| 분기 | 있음 → `step:P08` / 없음 → `step:P09` |
| 액션패킷 | `ap:agency-after-opinion` |

같은 케이스가 당사자와 행정청 양쪽에 서로 다른 패킷을 준다. 둘 다 `auto_execute: false`다.

## 확신 없으면 되묻는다
데모 질문과 충분히 가깝지 않은 질의는 패킷을 만들지 않고 `case_needs_disambiguation`으로
후보를 되돌려준다. 엉뚱한 패킷을 주는 것이 아무것도 안 주는 것보다 나쁘기 때문이다.

## 실행
```bash
node mcp/scripts/ontology-query-once.mjs --case samples/administrative-fine-pre-notice.case.json \
  "과태료 사전통지 받았는데 뭐 해야 해?"
```

## 조문 근거
2026-09-01 법제처 DRF 현행 원문(질서위반행위규제법, 2021-01-01 시행) 대조.
제16조(사전통지 및 의견 제출 등) · 제17조(과태료의 부과) · 제19조(제척기간) · 제20조(이의제기).
