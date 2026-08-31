# 정보공개청구 온톨로지 샘플 데모

## 질문
부분공개 통지 왔는데 뭐 하면 됨?

## 해상 (맵 설명이 아님)
| 칸 | 값 |
|---|---|
| 객체 | `case:IDC-2026-0901-001`, `dec:partial-disclosure` |
| 상태 | `decision_notified_partial` (2026-08-28) |
| 규칙 | 부분공개 → 공개분 수령(P10) + 이의(P11) 병행 가능 |
| 액션패킷 | `ap:claimant-after-partial` |

## 패킷 요약
1. 통지서에서 공개/비공개 범위·조문 확인
2. 공개분 수령 (수수료/감면)
3. 불복 여부 결정 → 이의 / 행정심판 / 소송
4. **자동 제출 없음** — 청구인 확인 후

```bash
python3 ontology/scripts/demo_query.py
```
