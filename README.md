# 그 많던 조달은 어떻게 했을까 — 한 장으로 끝내는 조달제도 100

**🔗 라이브 사이트: <https://milkbuttercheese2.github.io/How-Did-They-Do-All-That-Procurement-/>**

대한민국 공공조달·계약 제도를 법령, 조직, 절차, 돈, 문서, 병목 관계로 나누어 한 장의 구조도로 읽는 공개 웹서비스입니다. `한 장으로 끝내는 대한민국 제도 100`(korea100)의 조달청 버전으로, korea100의 데이터 계약·검증 파이프라인·웹앱 인프라를 승계해 콘텐츠를 조달 도메인으로 새로 만듭니다.

> 조문 속에 흩어진 조달 절차를, 담당자와 서류와 돈이 보이는 한 장의 업무 흐름도로.

## 핵심 이용자

- 조달시장에 처음 진입하는 **조달업체**
- 조달요청을 해야 하는 **수요기관 담당자**
- 계약업무를 처음 맡은 **계약담당 공무원**

## 현재 상태

- 전환 초기 단계입니다. 파일럿 1호 `조달업체 등록(입찰참가자격 등록)`이 캔버스와 상태 인식형 업무구조도로 제작되어 있습니다.
- 파일럿 1호의 조문 인용은 2026-07-12 국가법령정보센터 공개 웹 원문 열람으로 수동 대조했고, Open API 기계 대조(`LAW_OC` 필요)가 남아 있어 검증 상태는 `needs-review`입니다. 열람 원문 사본은 `sources/pilot-bidder-registration-2026-07-12/`에 있습니다.
- korea100의 제도 101개 콘텐츠는 `legacy-korea100` 브랜치에 보존되어 있습니다. main은 조달 콘텐츠 전용입니다.
- 계획 문서: `docs/procurement-master-plan-v0.md`(로드맵), `docs/procurement-topic-map-v0.md`(제도 후보 100 + 파일럿 10), `docs/procurement-one-page-template-v0.md`(한 장 템플릿), `docs/procurement-verification-plan-v0.md`(법령 검증 계획).

이 콘텐츠는 공공조달 제도 이해를 위한 참고 자료이며, 개별 입찰·계약 사건에 대한 법률 자문이나 조달청·기획재정부·행정안전부의 공식 해석을 대신하지 않습니다. 실제 입찰·계약 전에는 반드시 해당 공고문과 현행 법령 원문을 확인하십시오.

## 검증 원칙

1. 원문 우선 작성: 근거 법령·행정규칙 원문을 먼저 확보하고 원문에서 초안을 쓴다.
2. 조문 번호는 국가법령정보센터 현행 원문 대조를 통과한 것만 공개한다. 검증 전 내용은 검증 전임을 표시한다.
3. 금액·비율·기한 수치는 값·근거 조문·기준일을 한 세트로 기록한다.
4. 법령상 절차와 실무 관행 추정은 `fieldVerification`과 `confidence`로 구분한다.
5. 계약예규·고시처럼 개정이 잦은 규범은 주간 변경 감시 대상에 포함한다.

## 실행

```bash
cd web
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 검증과 빌드

```bash
cd web
npm run validate:data
npm run test:article-parser
npm run test:process-layout
npm run lint
npm run build
```

공식 출처 연결과 조문 대조에는 국가법령정보센터 Open API 인증값 `LAW_OC`가 필요합니다.

```bash
cd web
LAW_OC=... npm run sync:sources -- --write
LAW_OC=... npm run verify:articles -- --write
LAW_OC=... npm run check:freshness
```

정적 산출물은 `web/out/`에 생성됩니다.

## 배포

GitHub Pages로 서비스합니다. `main` 브랜치에 push되면 [`.github/workflows/pages.yml`](.github/workflows/pages.yml) 워크플로가 정적 빌드(`next build`, `output: "export"`) 후 자동 배포합니다.

- 접속 주소: <https://milkbuttercheese2.github.io/How-Did-They-Do-All-That-Procurement-/>
- 수동 배포: GitHub Actions에서 `Deploy to GitHub Pages` 워크플로를 `workflow_dispatch`로 실행

## 주요 경로

- `/`: 제도 검색·필터·비교
- `/model/{slug}/`: 제도 한 장 요약과 업무구조도
- `/verification/`: 현장 검증 공개 대장
- `/request/`: 메일 앱 기반 제도 제작 요청
- `web/data/institutions/`: 제도별 정규화 JSON
- `docs/institutions-100-manifest.json`: 우선순위와 분류 manifest
- `docs/data-contract.md`: 콘텐츠와 화면 데이터 계약 (korea100 승계)
- `docs/operations.md`: 배포·운영 (korea100 승계)
- `sources/pilot-bidder-registration-2026-07-12/`: 파일럿 1호 원문 워크시트

## 데이터 모델

각 제도 JSON은 두 층으로 구성됩니다.

1. `canvas`: 목적, 이해관계자, 법적 근거, 기관 권한, 대표 절차, 돈·문서 흐름, 병목과 개선점
2. `process`: 행위주체 lane, 단계 gate, 업무 node, 순서·정보·회귀 edge, 근거 조문과 확신도

법령만으로 확인하기 어려운 내부 처리, 실무 관행, 시스템 단계는 `fieldVerification` 또는 낮은 `confidence`로 구분합니다.
