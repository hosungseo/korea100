# korea100 web

대한민국 제도 100의 Next.js 정적 웹앱이다. 원본은 `data/institutions/`의 JSON과 manifest이며 GitHub Pages용 `out/`을 만든다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local # 선택 설정
npm run dev
```

`predev`가 검색·비교 인덱스와 현장 검증 큐를 다시 생성한다. 기본 주소는 `http://localhost:3000`이다.

## 품질 검사

```bash
npm run validate:data
npm run test:article-parser
npm run lint
npm audit
npm run build
```

## 주요 명령

- `npm run generate:catalog`: 지연 로딩 검색·비교 자산 생성
- `npm run generate:verification-queue`: 452개 현장 검증 큐 생성
- `npm run check:freshness`: 공식 법령 원문 버전 변경 여부 확인, `LAW_OC` 필요
- `npm run sync:sources -- --write`: 공식 출처 메타데이터 갱신, `LAW_OC` 필요
- `npm run verify:articles -- --write`: 명시 조문 존재 여부 재검증, `LAW_OC` 필요

배포 환경변수와 개인정보 미저장 요청 흐름은 `../docs/operations.md`를 따른다.
