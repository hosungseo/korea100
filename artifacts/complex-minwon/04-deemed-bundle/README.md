# 복합민원 체계도 4호 — 산단 지정 의제 덩어리 (N36→N15)

asOf: 2026-09-05
엔진: `../_lib/compare/` (load → extract → match → judge → emit). 이 폴더의 `case-data.mjs`·`improvements.mjs`·`compare/*.json`은 생성 파일이다.

## 숫자
| 항목 | 값 |
|---|---|
| 마일스톤 / 절차 / 제도 | 12 / 222 / 21 |
| 추출 ok / failed | 222 / 0 |
| 후보 묶음 (A 같은 지표 / C 기관 왕복) | 16 (15 / 1) |
| 판정 통과 | 16 |
| 개선 카드 (merge / automate / shorten) | 16 (14/1/1) |
| 조문 대조 | 435/435, 음성 대조군 OK |
| 배선 | 관통 0 · 선 겹침 23(full) / 21(improve) · 테두리 근접 44/42. laneWidth 480/560/640까지 3회 키운 뒤 잔여. |

## 판
- `review.html` / `.png` — 비교대조 판 (지표×법률, 기관×마일스톤)
- `deemed-bundle-full.html` / `-improve.html` / `.png` — 체계도 4호 (기관 레인 × 관문)

## 스냅샷 없는 법령
없음 (절차 법령 23종 전부 DRF 현행본 수신)

## 재발견 (Grok 4.6 `-p`, 2026-09-05, 법제처 DRF 원문 대조 후 2차)
- 군공항 N32 음성 대조: FOUND (덩어리와 같은 묶음에 안 섞임)
- 3호 I5 FOUND: 법제처 원문 확인 결과 특별법 제26조(의제)는 제11조제5항 승인을 전제로 한다. 제26조를 `semiconductor-cluster-designation-coordination` P04·P06(협의·승인 절차)에 legal_basis로 추가하자 A-landuse-01에서 제11조·제26조 절차가 한 묶음으로 재발견됨.
- 1호 I2 FOUND: 소방시설법 제6조(건축허가등 동의)를 `building-permit-use-approval` P05(의제 협의·도지사 사전승인, 이미 건축법 제11조제2항·제6항 보유)에 legal_basis로 추가하자 A-landuse-01에서 재발견됨. 재발견 must에서 국토계획법 제61조는 제거함(해당 템플릿에 없고, 건축허가 의제는 건축법 자체 조문으로 충분).
- 3호 I2 MISS (구조적 한계, 엔진 버그 아님): 시행령 제17조제2항(사전협의 의무)가 단독 절차가 아니라 P01(조성계획안 작성, act=apply)의 여러 legal_basis 중 하나로 묶여있음. 추출은 절차 단위로 act/subjects를 매기므로 P01은 subjects=[]로 나오고 A축에 못 들어간다. 절차 레코드를 조문 단위로 쪽개는 것은 이번 판의 규칙 밖이라 손대지 않음.

## 템플릿 오류 후보 (verify-basis 실패)
없음

## 재실행
```
cd ../_lib/compare && node load.mjs && node extract.mjs && node match.mjs && node judge.mjs && node emit-cards.mjs && node emit-review.mjs --png && node emit-casedata.mjs
cd ../../04-deemed-bundle && node verify-basis.mjs; node gen.mjs --png && node ../_lib/check-overlap.mjs deemed-bundle-*.html
```
