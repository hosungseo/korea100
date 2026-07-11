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

`npm run generate:verification-queue`가 100개 제도의 `fieldVerification`에서 `docs/field-verification-queue.json`과 `.md`를 만든다. 완료 근거를 반영할 때는 원본 제도 JSON을 수정하고 큐를 재생성한다. 개인 사건 정보와 비공개 내부 자료는 저장하지 않는다.

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
