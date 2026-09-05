# 복합민원 체계도 4호 — 산단 지정 의제 덩어리 (N36→N15)

asOf: 2026-09-05
엔진: `../_lib/compare/` (load → extract → match → judge → emit). 이 폴더의 `case-data.mjs`·`improvements.mjs`·`compare/*.json`은 생성 파일이다.

## 숫자
| 항목 | 값 |
|---|---|
| 마일스톤 / 절차 / 제도 | 12 / 222 / 21 |
| 추출 ok / failed | 222 / 0 |
| 후보 묶음 (A 같은 지표 / C 기관 왕복) | 13 (12 / 1) — 절차를 절반 이상 공유하는 A 묶음 4개(대기·수질·소음·생태)를 병합 |
| 판정 통과 | 13 |
| 개선 카드 (merge / automate / shorten) | 13 (11/1/1) — 병합 전 16장 중 환평 계열 5장이 같은 말이었음 |
| 조문 대조 | 435/435, 음성 대조군 OK |
| 배선 | 관통 0 · 선 겹침 0 · 테두리 근접 16 (full/improve 동일). 규칙 2개로 해결: ①같은 칸 바로 아래 카드로 가는 seq 선 58개 생략 ②절차 24개 넘는 마일스톤(N14 73·N13 30)은 제도별 행으로 분리 → 관문 12→19 |

## 판
- 체계도는 `meta.pngScale=1.5`로 렌더(19행이라 @2x는 Chromium 캡처 한계 초과). 1~3호는 기본 2 유지.
- `review.html` / `.png` — 비교대조 판 (지표×법률, 기관×마일스톤)
- `deemed-bundle-full.html` / `-improve.html` / `.png` — 체계도 4호 (기관 레인 × 관문)

## 스냅샷 없는 법령
없음 (절차 법령 23종 전부 DRF 현행본 수신)

## 실행 출처
- 추출 222·1차 판정·1차 카드: Grok 4.6 (`_lib/compare/grok-p.sh`를 `COMPARE_CLAUDE_BIN`으로). 병합 묶음 `A-air-ecosystem-noise-water-01`의 판정·카드와 음성 대조군 판정 3회: `claude -p` (xai 크레딧 소진 시점).

## 재발견 (2026-09-05, 법제처 DRF 원문 대조 후 3차)
- 군공항 N32 음성 대조: FOUND(isolated). 지표가 같으면(소음·입지·보상) 대조 단계에서 군공항 절차가 덩어리 묶음에 들어오는 건 당연하므로, **판정이 "묶을 수 있다"고 한 쌍이 군공항×산단을 건널 때만 위반**으로 센다. 혼합 묶음 3개(A-landuse-01 253쌍 · A-air-ecosystem-noise-water-01 351쌍 · A-compensation-01 28쌍)에서 교차 mergeable 0 → 통과. `compare/rediscovery-neg/verdicts-mixed.json`.
- 3호 I5 FOUND: 법제처 원문 확인 결과 특별법 제26조(의제)는 제11조제5항 승인을 전제로 한다. 제26조를 `semiconductor-cluster-designation-coordination` P04·P06(협의·승인 절차)에 legal_basis로 추가하자 A-landuse-01에서 제11조·제26조 절차가 한 묶음으로 재발견됨.
- 1호 I2 FOUND(병합 후 `A-landuse-safety-01`): 소방시설법 제6조(건축허가등 동의)를 `building-permit-use-approval` P05(의제 협의·도지사 사전승인, 이미 건축법 제11조제2항·제6항 보유)에 legal_basis로 추가하자 A-landuse-01에서 재발견됨. 재발견 must에서 국토계획법 제61조는 제거함(해당 템플릿에 없고, 건축허가 의제는 건축법 자체 조문으로 충분).
- 3호 I2 MISS (구조적 한계, 엔진 버그 아님): 시행령 제17조제2항(사전협의 의무)가 단독 절차가 아니라 P01(조성계획안 작성, act=apply)의 여러 legal_basis 중 하나로 묶여있음. 추출은 절차 단위로 act/subjects를 매기므로 P01은 subjects=[]로 나오고 A축에 못 들어간다. 절차 레코드를 조문 단위로 쪽개는 것은 이번 판의 규칙 밖이라 손대지 않음.

## 템플릿 오류 후보 (verify-basis 실패)
없음

## 재실행
```
cd ../_lib/compare && node load.mjs && node extract.mjs && node match.mjs && node judge.mjs && node emit-cards.mjs && node emit-review.mjs --png && node emit-casedata.mjs
cd ../../04-deemed-bundle && node verify-basis.mjs; node gen.mjs --png && node ../_lib/check-overlap.mjs deemed-bundle-*.html
```
