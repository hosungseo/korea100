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

## 템플릿 오류 후보 (verify-basis 실패)
없음

## 재실행
```
cd ../_lib/compare && node load.mjs && node extract.mjs && node match.mjs && node judge.mjs && node emit-cards.mjs && node emit-review.mjs --png && node emit-casedata.mjs
cd ../../04-deemed-bundle && node verify-basis.mjs; node gen.mjs --png && node ../_lib/check-overlap.mjs deemed-bundle-*.html
```
