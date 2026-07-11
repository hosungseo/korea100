# 한 장으로 끝내는 대한민국 제도 100

대한민국의 주요 제도를 법령, 조직, 절차, 예산, 문서, 데이터, 권한 관계로 나누어 한 장의 구조도로 읽는 공개 웹서비스입니다.

라이브 홈페이지: https://hosungseo.github.io/korea100/

> 기업에는 비즈니스 모델이 있듯이, 국가에는 제도 모델이 있다.

## 현재 상태

- 제도 101개 모두 표준 캔버스와 상태 인식형 swimlane 업무구조도를 제공합니다.
- 각 제도는 법적 근거, 행위자, 절차, 산출 문서, 기한, 병목, 개선점과 현장 검증 항목을 포함합니다.
- 웹앱은 Next.js 정적 내보내기로 101개 제도 상세 페이지를 생성합니다.
- 홈에서는 법령·기관·문서·병목까지 검색하고, URL로 필터 상태를 공유하며, 최대 3개 제도를 같은 기준으로 비교할 수 있습니다.
- 상세 페이지에서는 핵심 흐름과 전체 구조도를 전환하고 노드 상태를 URL로 공유할 수 있습니다.
- `/verification/`에서 452개 현장 검증 항목을 분야와 검증 영역별로 공개합니다.
- 법령 기준일은 각 JSON의 `asOfDate`에 기록합니다.
- 101개 제도에 공식 출처 437건을 연결했습니다. 고유 법적 근거 354건 중 325건은 국가법령정보센터 식별자와 연결되어 있습니다.
- 캔버스와 1,594개 절차 노드의 명시 조문 인용 3,767건을 현행 원문과 대조했고, 3,767건 모두 조문 번호의 존재를 확인했습니다.
- 75개 제도는 `article-verified`입니다. 나머지 26개는 조문 불일치가 아니라 지역·기관·내부규정·부처 문서 범위를 지정해야 하는 출처 30건을 사유별로 기록했습니다.
- `current`, `progress` 등 노드 상태는 실시간 행정 데이터가 아니라 제도 흐름을 설명하기 위한 편집 상태입니다.
- 제도 제작 요청은 입력값을 저장하지 않고 사용자의 메일 앱에 초안으로 전달합니다. 이용 지표는 개인정보 없는 선택형 이벤트 엔드포인트만 사용합니다.
- 법령 원문 변경 여부는 GitHub Actions 주간 점검으로 감시할 수 있습니다. 실행에는 저장소 secret `LAW_OC`가 필요합니다.

이 콘텐츠는 제도 이해를 위한 참고 자료이며 법률 자문이나 정부기관의 공식 해석을 대신하지 않습니다.

## 실행

```bash
cd web
npm install
cp .env.example .env.local # 선택: 이용 지표 엔드포인트 설정
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 검증과 빌드

```bash
cd web
npm run validate:data
npm run test:article-parser
npm run lint
npm audit
npm run build
```

`validate:data`는 다음 항목을 검사합니다.

- 제도 JSON과 manifest의 개수 일치 및 연속 우선순위
- slug, 이름, 유형과 manifest 일치 여부
- lane·stage·node·edge 참조 무결성
- 노드 유형·상태와 edge 유형
- 진행률·법령 근거 확신도 범위
- 제도별 `current` 노드 존재 여부
- 공식 출처와 미해결 사유 코드의 완전성
- 제도별 조문 검증 합계와 상태 일치 여부
- 452개 현장 검증 큐의 ID, 제도 참조, 필수 필드와 집계

공식 출처와 조문 보고서를 새로 생성할 때는 `LAW_OC` 환경 변수가 필요합니다.

```bash
cd web
LAW_OC=... npm run sync:sources -- --write
LAW_OC=... npm run verify:articles -- --write
LAW_OC=... npm run check:freshness
```

- `docs/verification-coverage.json`: 제도별 공식 출처 연결 현황
- `docs/article-verification-coverage.json`: 조문 대조 결과와 범위별 미해결 사유
- `web/data/legal-source-registry.json`: 고유 법적 근거별 국가법령정보센터 식별자

정적 산출물은 `web/out/`에 생성됩니다.

## 주요 경로

- `/`: 101개 제도 검색·필터·정렬·비교
- `/model/{slug}/`: 제도 한 장 요약과 업무구조도
- `/verification/`: 현장 검증 공개 대장
- `/request/`: 메일 앱 기반 제도 제작 요청
- `web/src/app/`: 홈, 상세, 검증 현황, 제작 요청 페이지
- `web/src/components/DesktopProcessBoard.tsx`: 데스크톱 업무구조도
- `web/src/components/InstitutionExplorer.tsx`: 제도 검색·분류 UI
- `web/data/institutions/`: 제도별 정규화 JSON 101개
- `docs/institutions-100-manifest.json`: 우선순위와 대분류 manifest
- `docs/data-contract.md`: 콘텐츠와 화면 데이터 계약
- `docs/field-verification-queue.json`: 452개 현장 검증 작업 큐
- `docs/operations.md`: 배포 환경변수, 개인정보 미저장 요청 흐름, 최신성 점검 운영법
- `docs/verification-summary.md`: 101개 출처·조문 검증 결과와 한계
- `docs/product-requirements-v1.md`: 현재 공개 서비스 요구사항
- `docs/product-requirements-v0.md`: 초기 10개 MVP 요구사항 기록
- `sources/law-to-process-mvp-2026-07-09/`: 법령 조문 기반 프로세스 추출기 초기 프로토타입
- `site/`: Next.js 전 정적 홈페이지 MVP

## 데이터 모델

각 제도 JSON은 두 층으로 구성됩니다.

1. `canvas`: 목적, 이해관계자, 법적 근거, 기관 권한, 대표 절차, 돈·문서 흐름, 병목과 개선점
2. `process`: 행위주체 lane, 단계 gate, 업무 node, 순서·정보·회귀 edge, 근거 조문과 확신도

법령만으로 확인하기 어려운 내부 처리, 실무 관행, 시스템 단계는 `fieldVerification` 또는 낮은 `confidence`로 구분합니다.

## 관련 작업

- 법령 API + Mermaid/BPMN 작업 폴더: `/Users/seohoseong/.openclaw/workspace/law-process-map`
- 환경영향평가 샘플: `law-process-map/examples/environmental-impact-assessment-swimlane.mmd`
