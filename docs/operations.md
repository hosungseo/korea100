# 운영 가이드

## 배포

`main`에 push하면 `.github/workflows/pages.yml`이 `web/out/`을 빌드해 GitHub Pages에 배포한다.

GitHub Actions variables:

- `ANALYTICS_ENDPOINT`: 선택. 개인정보 없는 이벤트 수집 주소

GitHub Actions secret:

- `LAW_OC`: 법령 최신성 점검에 사용하는 국가법령정보센터 Open API ID

로컬에서는 `web/.env.example`을 `web/.env.local`로 복사해 같은 값을 설정한다. 공개 클라이언트 변수에는 비밀값을 넣지 않는다. `LAW_OC`는 `NEXT_PUBLIC_` 변수로 만들지 않는다.

## 제도 제작 요청

요청 페이지는 입력값을 서버로 전송하거나 `localStorage`·`sessionStorage`에 저장하지 않는다. 입력값은 `mailto:` 이메일 초안을 만드는 데만 사용하며 실제 발송은 사용자의 메일 앱에서 이루어진다.

연락처 입력란과 별도 구독 신청란은 제공하지 않는다. 이전 버전이 브라우저에 남긴 요청·알림 초안 키는 요청 페이지 방문 시 삭제한다.

## 이벤트 수집 API

`NEXT_PUBLIC_ANALYTICS_ENDPOINT`는 다음 형식의 beacon 또는 JSON POST를 받는다.

```json
{
  "name": "comparison_open",
  "properties": { "selected_count": 2 },
  "path": "/",
  "occurredAt": "2026-07-10T00:00:00.000Z"
}
```

검색 이벤트에는 검색어 원문을 넣지 않고 결과 수와 0건 여부만 포함한다. 요청 폼 입력값은 이벤트 속성에 포함하지 않는다. 엔드포인트가 없더라도 기능은 중단되지 않으며 브라우저에는 이벤트명별 로컬 합계만 남긴다.

## 법령 최신성 점검

`.github/workflows/law-freshness.yml`은 매주 일요일 21:17 UTC에 실행된다. `npm run check:freshness`가 현행 원문의 MST·공포일·시행일 또는 행정규칙 일련번호를 레지스트리와 비교한다.

- 변경 없음: 작업 종료
- 변경 있음: `law-freshness` 라벨의 열린 이슈를 생성하거나 갱신
- `LAW_OC` 없음: 파일을 변경하지 않고 실패

수동 점검:

```bash
cd web
LAW_OC=... npm run check:freshness
```

변경 이슈를 확인한 뒤에만 `sync:sources -- --write`, `verify:articles -- --write`, 전체 품질 검사를 실행해 갱신 내용을 커밋한다.

## 현장 검증 큐

`npm run generate:verification-queue`가 전체 제도의 `fieldVerification`에서 `docs/field-verification-queue.json`과 `.md`를 만든다. 완료 근거를 반영할 때는 원본 제도 JSON을 수정하고 큐를 재생성한다. 개인 사건 정보와 비공개 내부 자료는 저장하지 않는다.

## 출시 전 점검

```bash
cd web
npm ci
npm run validate:data
npm run test:article-parser
npm run lint
npm audit
npm run build
```

정적 산출물의 홈, 비교 URL, 상세 기본/전체 모드, 검증 대장, 요청 메일 초안 경로를 데스크톱과 390px 모바일에서 확인한다.

---

## 인수인계 — 콘텐츠 제작·검증 운영 (2026-07-13 기준)

이 문서는 후임 운영자(사람 또는 AI 에이전트)가 이 리포지토리의 콘텐츠 제작·검증·배포 파이프라인을 그대로 이어받기 위한 상세 안내다. 규칙의 원본은 `docs/content-principles.md`(1~11조)이며, 이 문서는 그 실행 방법을 설명한다.

### 1. 서비스 개요

- 대한민국 공공조달·계약 제도를 "한 장 캔버스 + 상태 인식형 업무구조도"로 보여주는 정적 웹서비스.
- 라이브: <https://milkbuttercheese2.github.io/procurement-system-100/> (GitHub Pages, main 머지 시 `.github/workflows/pages.yml` 자동 배포)
- 제도 1건 = `web/data/institutions/{slug}.json` 1파일. 스키마 원본: `docs/data-contract.md`.
- 분류·공개순서: `docs/institutions-100-manifest.json` (validate가 파일 수·priority 연속성·name/type 일치를 강제)

### 2. 콘텐츠 규칙 (요약 — 원본은 content-principles.md)

1. **4대 원칙**: 누가(담당자) · 어떤 서류를 · 언제까지(기한) · 어떤 사업종류·금액구간. 이 4요소 누락은 검증 must-fix.
2. **캔버스 구성**: 절차 / 법적 근거 / 적용 대상(간결: 대상+근거조항만) / 제출서류(담당자별 `{actor, documents[]}`) / 유의사항(필드명은 bottlenecks) / 관련 제도 / 현장 검증 필요. 목적(purpose)은 제목 아래 설명으로 표시.
3. **분류(순차 단계)**: 등록 → 발주 → 공고 → 입찰 → 심사·평가 → 계약·이행 → 분쟁·권리구제 → 사후관리·제재. category와 type은 동일 값.
4. **정렬**: 1차 = 단계 순서, 2차 = 같은 단계 안에서 일반 → 특수.
5. **법적 근거 나열**: 법률 → 대통령령 → 부령 → 행정규칙 순. 같은 층위에서는 일반 규정(계약예규 등) 먼저, 조달청 규정을 다음 항목으로.
6. **어휘**: '병목' 대신 '유의사항'. 회귀(loop) 노드는 파란색.

### 3. 법령 검증 체계 (가장 중요)

### 3.1 원칙
- 법령정보는 **법제처 국가법령정보센터(law.go.kr)로만** 최종 확인한다 (7조). WebSearch는 후보 탐색용.
- **조달청 발표 규정 우선** (8조). 법제처 미등재 조달청 규칙만 pps.go.kr 게시를 출처로 쓰고 `unresolved(external-official-document)` 처리 (9조).
- 행정규칙은 반드시 **현행([현행] 표시·발령일) 확인** (10조). 실제 사례: 「물품 다수공급자계약 2단계경쟁 업무처리기준」은 2023-07-01 폐지되어 「물품 다수공급자계약 업무처리규정」 제49조로 통합됨 — 폐지 규범 인용을 이 규칙으로 잡아냈다.

### 3.2 도구 (이 환경에서 검증된 실행 방법)
- 환경 필수 조건: 네트워크 allowlist에 `law.go.kr`, `www.law.go.kr`, `pps.go.kr`, 그리고 `LAW_OC` 인증키(**절대 커밋 금지, 환경변수로만**).
- 법령정보 도구는 `korean-law-mcp` 패키지(npm) 하나로, **두 가지 모드**를 쓴다:
  - **MCP 서버 모드 (레포에 등록됨, 콘텐츠 작성용)**: 루트 `.mcp.json`에 `korean-law` 서버로 등록되어 있다. Claude 세션(및 작성 에이전트)이 `search_law`·`get_law_text`·`get_batch_articles`·`search_admin_rule`·`get_admin_rule` 도구로 **법제처 현행 원문을 직접 조회**한다. 작성 단계에서 조문 원문에 근거해 초안을 쓰게 하는 것이 목적(웹 검색 스니펫 의존을 줄임). `.mcp.json`은 `LAW_OC`를 `${LAW_OC}` 환경변수로 참조하므로 키가 코드에 남지 않는다.
  - **CLI 모드 (기계 검증·원문 추출용, 결정적)**: 스크립트가 CLI를 직접 실행해 조문 실존을 정규식 대조하고 원문을 추출한다. 최종 검증 게이트와 화면 표시 원문은 이 결정적 경로가 담당한다(AI 개입 없음).
- 기계 검증 (리포 파이프라인, `web/`에서 실행):
  ```bash
  export LAW_OC=<인증키> NODE_USE_ENV_PROXY=1   # CA는 NODE_EXTRA_CA_CERTS(환경 제공) 상속
  npm run sync:sources -- --write         # 법령·행정규칙 공식 식별자(lawId/MST/일련번호) 연결
  npm run verify:articles -- --write      # 전 제도 조문 실존 기계 대조 → article-verified 승격
  node scripts/populate-article-texts.mjs # 인용 조문 현행 원문을 verification.articleTexts에 추출·저장(팝업 원문)
  npm run verify:citation-content         # 요지↔원문 '내용' 기계 대조(bigram containment) → docs/citation-content-report.json
  ```
  - 내용 대조의 배경·판정 기준·운영 방식(report-only → --strict 게이트 승격 계획)은 `docs/anti-hallucination-review.md` 참조.
  - **호스트 패치는 더 이상 불필요**: `korean-law-mcp@4.7.2`는 이미 `www.law.go.kr`을 호출한다(구버전은 `open.law.go.kr`을 써서 호스트 패치가 필요했으나 현재 버전은 불필요). `NODE_USE_ENV_PROXY=1`만 있으면 전역 설치본(`korean-law`/`korean-law-mcp`)이 프록시 환경에서 그대로 동작한다. 스크립트는 `KOREAN_LAW_CLI`로 CLI 경로를 지정하며 미지정 시 전역 `korean-law`를 쓰도록 유지한다.
  - 세션 내 실행이 불가능한 환경이면 GitHub Actions 러너 우회: `.github/workflows/law-verify.yml`을 `workflow_dispatch`로 실행 (mode=write, sync_sources, fetch_cache 입력 지원). 리포 시크릿 `LAW_OC` 우선.
- **원문 캐시**: `sources/law-cache/`에 법령·계약예규·조달청 고시 전문 사본(33종+). 갱신: `node scripts/fetch-law-cache.mjs` (대상 목록: `sources/law-cache/law-list.json`). 주의: CLI 응답이 50,000자에서 잘리므로 대형 예규는 DRF API 직접 호출(`lawService.do?target=admrul&ID=<일련번호>&type=JSON`)로 전문을 받는다.
- 식별자 재사용: `web/data/legal-source-registry.json` — sources 블록에 넣을 공식 식별자는 여기서 복사한다. 명칭은 반드시 공식 제명(예: `(계약예규) 적격심사기준`)을 쓴다. 통칭이나 괄호 주석이 붙은 이름은 sync가 매칭하지 못한다.

### 3.3 검증 상태 규칙
- `article-verified`(자동대조 완료): 기계 대조 통과 + 모든 출처 연결. 공개 기본 기준.
- `needs-review`(출처 확인): 작성 직후 상태. 통합 시 sync+verify 재실행으로 승격.
- validate 규칙: needs-review는 unresolved≥1 또는 (missing+uncheckable)≥1이어야 함. 상세: `web/scripts/validate-data.mjs`.

### 4. 제작 파이프라인 (다중 에이전트)

- 공용 가이드: 세션 scratchpad의 `agent-guide.md` (세션이 바뀌면 이 문서와 content-principles로 재구성).
- 구조: **Opus 작성자**(law-cache 원문 cite-then-write + 워크시트 작성) → **Fable 검증자**(원문 대조 적대 검증, 구조화 verdict) → **Opus 수정자** → **Fable 재검증** (제도별 체인, 최대 2회 수정 루프).
- Workflow 스크립트: 세션 workflows 디렉터리의 `procurement-content-batch-*.js` — `args.items[{slug,name,type,category,priority,users,hints}]`로 배치를 파라미터화. resumeFromRunId로 중단·재개 가능(캐시 재사용).
- 동시성: 워크플로당 에이전트 2개(4코어 기준). 더 많은 병렬이 필요하면 워크플로를 여러 개 띄운다.
- 워크시트: `sources/batch-YYYY-MM-DD/{slug}-worksheet.md` — 인용 조문·증거·수치·정정 이력 기록. 검증자와 후임자가 대조하는 근거 문서.

### 5. 통합·배포 절차 (관리자가 직접)

1. 후보 선별: article-verified + 신스키마(applicability/submittedDocuments) + current 노드 1개.
2. manifest 편입: 단계 분류·일반→특수 순서로 priority 재부여(JSON의 priority·type도 동일하게).
3. `npm run generate:catalog && npm run generate:verification-queue && npm run validate:data`
4. `npm run test:article-parser && npm run test:process-layout && npm run lint && npx tsc --noEmit && npm run build`
5. **화면 검증 필수**: 정적 서버(`python3 -m http.server --directory web/out`) + Playwright(`/opt/pw-browsers/chromium`) 스크린샷으로 홈·상세 확인. (과거 사고: CSS 셀렉터 그룹 파손으로 업무구조도가 좁아진 채 배포된 적 있음 — 그 후 화면 검증이 필수 단계가 됨.)
6. PR 생성 → main 머지 → Pages 배포 런 success 확인 → 사용자 푸시 알림(PushNotification).
7. 버전: `web/package.json` version과 `CHANGELOG.md`를 함께 올린다 (제도 추가=minor).

### 6. 현재 상태 (2026-07-13)

- 배포: v0.6.1, 제도 33건 전부 article-verified (조문 총계는 `docs/article-verification-coverage.json`).
- 진행 중: 배치 3~6 재개로 미배포분(계약서 작성·검사검수·설계변경·해제해지·공동계약·재입찰·개찰·과징금·직접생산·경쟁제품·장기계속·쇼핑몰·이의신청·조정·제3자단가·총액단가·시설공사·가격조사·기술개발·우선구매·하자·전자입찰·하도급·품질·혁신지정·혁신시범 등) 작성·검증 중. 목표 46건.
- 주의: 여러 세션/계정이 병행 작업 중 — 머지 전 반드시 `git fetch origin main` 후 diff 확인. 같은 제도를 두 세션이 만들었으면 **기계 대조 통과본 + 최신 정정(예: MAS 제49조)** 을 우선한다.
- 미해결: 지방계약(행정안전부 예규) 계열은 아직 미착수. topic map(`docs/procurement-topic-map-v0.md`)의 나머지 후보 참조.

### 7. 함정·트러블슈팅 모음

- **Actions 러너 push 경합**: law-verify가 결과를 커밋할 때 다른 push와 경합하면 실패 → 워크플로에 pull --rebase 재시도 5회 내장됨. 러너 실행 중에는 해당 브랜치 push를 삼가면 안전.
- **CLI 50k 잘림**: get_admin_rule 출력이 50,031자에서 잘림 — 대형 예규 전문은 DRF 직접 호출.
- **법제처 API 일시 장애**: EXTERNAL_API_ERROR 전량 실패 사례 있음 — 재시도로 해결.
- **워크트리 빌드**: node_modules 심볼릭 링크는 Turbopack이 거부 — 워크트리마다 npm ci.
- **stop-hook**: 커밋 안 된 변경이 있으면 세션이 커밋·푸시를 요구함. wip 커밋으로 대응.
- **부처명**: 2026 조직개편으로 현행 원문은 `재정경제부`. 검색 결과의 `기획재정부`와 표기 차이는 오류가 아님(병기 관례).
