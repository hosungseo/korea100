# 미해결 출처·조문 추적 대장

> ## 🔴 다음 세션 최우선 지시 (운영자, 2026-07-16)
> **전체 제도의 법적 근거 내용을 전수 재검토하라.** 종심제(comprehensive-evaluation-award)를 비롯해 노드의 법적 근거가 **잘못 선택되었거나 비어 있는** 사례가 발견됨.
> 1. `web/scripts/audit-legal-bases.mjs` + `npm run verify:citation-content` 재실행으로 기계 후보 추출
> 2. **근거 미기재(not-cited) 노드 전수 목록화** — 기계 감사에 빈 legal_basis 검출 추가 권장
> 3. Opus 정정 + Fable 검토 병렬로 오귀속·공란 정정(종심제 최우선), 법제처 원문 대조 필수(규칙 16·17)
> 4. 완료 후 나머지 시간은 컨텐츠 생성 계속(백로그 `docs/topic-backlog.md`, _pending 4종 검토 승격 포함)


규칙 20(content-principles)에 따라, 법제처에서 출처를 찾지 못했거나 조문 대조가 불가한 항목을 기록한다.
**매 세션 시작 시 이 대장의 미해결 항목 재탐색을 우선 시도**하고, 해소되면 상태를 갱신한다.

| # | 제도(slug) | 미해결 항목 | 사유 | 마지막 탐색 | 다음 조치 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | stockpile-goods | 조달청 비축사업 운영규정 | 법제처 행정규칙 검색에서 현행 게시본 식별자 미확정(연혁본 2100000195854, 최신 훈령 제2226호 추정) | 2026-07-16 | 법제처에서 현행 발령본 serial 확정 후 sources 연결, 안 되면 pps.go.kr 출처 URL 워크시트 기록 | 미해결 |
| 2 | international-bidding | 공공계약에서의 국제입찰 대상금액(기획재정부 고시) | 법제처 행정규칙 검색 미등록(국가계약용, 2026-07-16 확인 — 행안부 지자체용만 존재) | 2026-07-16 | 기재부 관보·홈페이지에서 최신 고시번호·금액 확인, 법제처 등재 여부 주기 재확인 | 미해결 |
| 3 | social-enterprise-preference | 사회적기업 제품 우선구매 지침(고용노동부) | 법제처 행정규칙 검색 미등록(2026-07-16 확인) | 2026-07-16 | 고용노동부 홈페이지 현행 지침 확인, 법제처 등재 여부 주기 재확인 | 미해결 |

- 2026-07-16: 위 3건은 운영자 명시 지시("출처소스를 찾을 수 없으면 못 찾는다 기록하고 일단 배포")로 article-verified 상태로 배포함(v0.17.0). 검증 게이트·validate 규칙 자체는 엄격 기준을 유지하며, 이 예외는 본 대장으로 추적한다. 다음 통합 시 validate가 이 3건을 다시 지적하면 이 대장을 확인하라.

## 진행 중 작업 재개 정보 (2026-07-17, 세션 한도로 중단)

전 제도 법적 근거 전수 재검토(61개 중 **약 25개 완료 + 종심제 직접 정정**). 잔여 ~36개는 세션 한도(1:50am UTC 리셋)로 중단됨. 재개 방법: 아래 runId를 resumeFromRunId로 재실행하면 완료분은 캐시 재생된다(스크립트: scratchpad/legal-recheck-wf.js — 소멸 시 이 대장의 그룹 목록으로 재작성).
- wf_48bd5f46-423 그룹1(debarment·direct-production·total-and-unit·procurement-request·contract-method·international-bidding — 종심제는 직접 정정 완료로 제외 가능)
- wf_b8f1d7ff-a98 (inspection-and-acceptance·qualification-screening·innovation-product·social-enterprise·designated-competitive·innovation-trial / contract-termination·subcontract·stockpile·contract-dispute·bid-announcement·long-term)
- wf_425e29fc-812 그룹2(bidder-registration·price-survey·government-furnished·quality-inspection·price-fluctuation·bid-protest)
- wf_0e753137-34a 그룹1(invalid-bids·design-change·performance-certification·shopping-mall·excellent-product·procurement-contract-disclosure)
- 완료 그룹들의 Fable 검증(verify) 단계도 한도로 대부분 미실행 — 재개 시 검증 단계부터 캐시 재생됨.
