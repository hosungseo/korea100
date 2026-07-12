# 개발 문서

korea100의 로컬 실행, 검증 스크립트, 저장소 구조, 데이터 모델 안내입니다. 서비스 소개는 [루트 README](../README.md)를 보세요.

## 로컬 실행

```bash
cd web
npm install
cp .env.example .env.local # 선택: 이용 지표 엔드포인트 설정
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 정적 산출물은 `npm run build` 후 `web/out/`에 생성됩니다.

## 검증과 빌드

```bash
cd web
npm run validate:data
npm run test:article-parser
npm run lint
npm audit
npm run build
```

`validate:data`는 다음을 검사합니다.

- 제도 JSON과 manifest의 개수 일치 및 연속 우선순위
- slug, 이름, 유형과 manifest 일치 여부
- lane·stage·node·edge 참조 무결성
- 노드 유형·상태와 edge 유형, 불복 노드의 심사 경유 규칙
- 진행률·법령 근거 확신도 범위, 제도별 `current` 노드 존재
- 공식 출처와 미해결 사유 코드의 완전성
- 현장 검증 큐의 ID, 제도 참조, 필수 필드와 집계

### 내용 감사 (audit-process.mjs)

스키마 검증과 별개로, 내용 오류 후보를 기계적으로 찾는 감사 스크립트가 있습니다.

```bash
node web/scripts/audit-process.mjs            # 오늘 날짜 리포트
node web/scripts/audit-process.mjs 2026-07-12 # 날짜 지정
```

검사 항목: 서술형 조문 인용(조문 번호 없음), 묶음 표기, 그래프 도달 가능성(고아·도달불가·종결 없음), 역방향 sequence 엣지, 빈 레인·스테이지, 제도 간 통계 이상치. 결과는 `docs/audits/process-audit-<날짜>.json`에 우선순위 큐로 저장됩니다. 조약 인용은 `조약 제N호` 형식을, 확인 불가 자료는 `unverified: true` 플래그를 사용합니다.

### 공식 출처·조문 대조 (LAW_OC 필요)

```bash
cd web
LAW_OC=... npm run sync:sources -- --write
LAW_OC=... npm run verify:articles -- --write
LAW_OC=... npm run check:freshness
```

- `docs/verification-coverage.json`: 제도별 공식 출처 연결 현황
- `docs/article-verification-coverage.json`: 조문 대조 결과와 범위별 미해결 사유
- `web/data/legal-source-registry.json`: 고유 법적 근거별 국가법령정보센터 식별자

법령 원문 변경 여부는 GitHub Actions 주간 점검으로 감시합니다(저장소 secret `LAW_OC` 필요).

현장 검증 큐를 재생성할 때는 `web/` 디렉토리에서 실행해야 합니다.

```bash
cd web && node scripts/generate-field-verification-queue.mjs
```

## 저장소 구조

- `web/src/app/`: 홈, 상세, 검증 현황, 제작 요청 페이지
- `web/src/components/DesktopProcessBoard.tsx`: 데스크톱 업무구조도
- `web/src/components/InstitutionExplorer.tsx`: 제도 검색·분류 UI
- `web/data/institutions/`: 제도별 정규화 JSON (109개)
- `docs/institutions-100-manifest.json`: 우선순위와 대분류 manifest
- `docs/data-contract.md`: 콘텐츠와 화면 데이터 계약
- `docs/field-verification-queue.json`: 현장 검증 작업 큐 (582건)
- `docs/audits/`: 내용 감사 리포트
- `docs/operations.md`: 배포 환경변수, 개인정보 미저장 요청 흐름, 최신성 점검 운영법
- `docs/verification-summary.md`: 출처·조문 검증 결과와 한계
- `docs/product-requirements-v1.md`: 현재 공개 서비스 요구사항

## 데이터 모델

각 제도 JSON은 두 층으로 구성됩니다.

1. `canvas`: 목적, 이해관계자, 법적 근거, 기관 권한, 대표 절차, 돈·문서 흐름, 병목과 개선점
2. `process`: 행위주체 lane, 단계 gate, 업무 node, 순서·정보·회귀 edge, 근거 조문과 확신도

콘텐츠 규칙:

- 법령명+조문 필수. 원문을 확인하지 못한 인용은 조문을 추정하지 말고 `unverified: true`로 표기하고 `fieldVerification`에 항목을 추가한다.
- 법령상 구조와 운영 추정을 구분한다. 내부 처리·실무 관행·시스템 단계는 `fieldVerification` 또는 낮은 `confidence`로 남긴다.
- 오류 정정은 `process.warnings`에 날짜·근거·대조한 법령 식별자(MST)와 함께 기록한다.
- 노드 상태(`current` 등)는 편집 상태이며 제도당 `current`는 정확히 1개.
