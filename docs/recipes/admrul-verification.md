You verify 행정규칙(훈령·예규·고시·지침) citations that were previously marked "unverified": true in korea100 institution files, using the newly confirmed 법제처 행정규칙 API.
Repo: /Users/seohoseong/korea100, branch fix/admrul-verification (already checked out — do NOT switch).

## API (curl)
- 목록 검색: curl -s "http://www.law.go.kr/DRF/lawSearch.do?OC=test&target=admrul&query=<규칙명>&type=XML"
  → 행정규칙일련번호, 행정규칙명, 행정규칙종류(훈령/예규/고시/지침), 발령일자, 발령번호, 소관부처명, 현행연혁구분
  검색 팁: 정확명이 0건이면 핵심 키워드로 재검색(예: "예비타당성조사"), search=2(본문검색)도 가능
- 본문 조회: curl -s "http://www.law.go.kr/DRF/lawService.do?OC=test&target=admrul&ID=<행정규칙일련번호>&type=XML"
  → 조문형식여부=Y면 조문 구조, 아니면 별표·본문 텍스트

## Per unverified ref in your target institutions
1. admrul에서 해당 규칙 검색 → 현행 확인 (소관부처명이 개편 후 기관인지 주목 — 구 기획재정부 규칙이면 현 소관이 기획예산처/재정경제부 중 어디로 갔는지 확인).
2. 본문에서 그 노드의 행위·기준을 규정하는 조문(제N조)/별표를 찾아 확인.
3. 확인되면 legal_basis 항목 갱신: "unverified" 키 삭제, law=현행 공식 규칙명(소관 변경 시 새 명칭), article="제N조(제목)" 또는 "별표 N" 또는 조문 없으면 "고시 제2024-53호(발령 20240627)" 형식, text=확인한 요지. 
4. 규칙 전체가 admrul에 없으면(내부규정 등) unverified 유지하되 text에 "행정규칙 API(admrul) 미등재 확인(2026-07-12)" 추가 — 부재의 확인도 검증이다.
5. verification.sources 배열에 확인한 행정규칙 추가: {"law": <규칙명>, "kind": <훈령|예규|고시|지침>, "sourceType": "admrul", "officialName": <규칙명>, "admrulSeq": <일련번호>, "promulgatedOn": <발령일자 YYYY-MM-DD>, "issueNo": <발령번호>, "org": <소관부처명>, "officialUrl": "https://law.go.kr/행정규칙/<규칙명 공백제거>"}
6. articleVerification 카운트 갱신: 검증 성공분만큼 citationEntries/explicitCitationEntries/articleReferences/verifiedReferences 증가 (unverified 유지분은 집계 제외 컨벤션).
7. 해당 파일 fieldVerification에서 이번에 해소된 항목(예: "행정규칙 근거 조문 확인 필요: ...", "구 기획재정부 명의 행정규칙 재발령 확인")은 제거. 조례·내부규정 등 미해소분은 유지.
8. process.warnings에 기록: "2026-07-12 행정규칙 검증: <규칙명> admrul 대조(일련번호, 발령번호) — N건 확정, M건 미등재 유지. 소관 변경사항: ..."

## 지어내기 절대 금지
본문에서 확인 못 한 조문 번호는 절대 쓰지 않는다. 검색 실패 시 여러 키워드로 3회까지 시도 후 미등재 처리.

## Verify & commit
cd /Users/seohoseong/korea100/web && node scripts/generate-field-verification-queue.mjs && node scripts/validate-data.mjs (exit code 직접 확인, 검증 성공 필수)
ONE commit per institution: git add web/data/ docs/ && git commit -m "fix: <slug> 행정규칙 인용 admrul 검증 — ..."
index.lock 실패 시 2초 후 재시도(3회). Push 금지. 다른 제도 파일 수정 금지.
Commit 메시지 끝: 
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013WXa2uVeD6vUjpK4hHNLZU

## Report (FINAL message = report only)
Per institution: slug | 해소 N건 / 미등재 유지 M건 | 확인 규칙(일련번호·발령번호·소관부처, 소관 변경 여부) | commit SHA
