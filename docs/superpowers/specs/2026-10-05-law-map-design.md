# 법령 지도(Law Map) 설계

- 날짜: 2026-10-05
- 상태: 설계 확정 대기
- 참고: [tt-a1i/archify](https://github.com/tt-a1i/archify) — 호버 연결·클릭 원문·경로 추적·단일 산출물이라는 상호작용 문법을 참고한다. 렌더러와 스키마는 재사용하지 않는다(좌표 수작업 IR, 조문 수백 개 그래프에 부적합, 한국 법령 의미 타입 부재).

## 1. 목표

korea100은 지금까지 "제도"를 단위로 법령을 읽어 왔다. 이 기능은 **법률 한 건의 전체 구조**(법률 → 시행령 → 시행규칙 → 행정규칙 → 자치법규)와 **조문 단위 위임 관계**를 클릭해 따라가는 인터랙티브 지도로 보여 준다. 제도 페이지와 양방향으로 연결해, "이 조문을 쓰는 제도"와 "이 제도가 선 법령의 전체 구조"를 오간다.

성공 기준:
- 건축법 페이지에서 법률 제11조를 클릭하면 원문·위임선·연결 제도가 패널에 뜨고, 시행령 조문을 두 번째로 클릭하면 두 조문 사이 경로가 강조된다.
- korea100이 인용하는 법률 278건이 모두 생성되고 `validate:data`를 통과한다.
- 지어내지 않는다: API로 확인되지 않는 도착 조문은 `unresolved`로 표시한다.

## 2. 범위

| 포함 (v1) | 제외 (후속) |
| --- | --- |
| 법률 278건(`legal-source-registry.json`의 kind=법률, lawId 보유) | 레지스트리 밖 법률, 미해결 24건 |
| 레인: 법률·시행령·시행규칙(조문 전개), 행정규칙(제목 박스), 자치법규(묶음 1박스) | 행정규칙 조문 전개, 조례 지자체 필터 |
| 위임선 5종: 시행령·시행규칙·위임행정규칙·위임자치법규·인용법령 | 신구법 비교, 연혁 |
| 경로 추적(하향), 조문 검색, 엣지 종류 필터, URL 해시 공유 | 단일 HTML 내보내기, PNG 공유 카드 |
| 제도 ↔ 법령 양방향 링크 | 조문 → 판례·해석례 |

파일럿: 건축법(법령ID 001823, 조문 140, 위임 337).

## 3. 데이터 출처 (법제처 DRF, 2026-10-05 실측)

| target | 용도 | 비고 |
| --- | --- | --- |
| `lsStmd` (`ID=<법령ID>`) | 상하위법 트리: 법률·시행령·시행규칙·행정규칙(고시·훈령)·자치법규(조례·규칙) | 응답의 `본문상세링크`에 **OC가 박혀 온다 → 저장 전 반드시 제거**, MST만 보관 |
| `lsDelegated` (`MST=`) | 조문 단위 위임: `조정보`(출발 조문) → `위임정보`(위임구분, 위임법령일련번호, 도착 조문번호·가지번호·제목, 링크텍스트, 라인텍스트, 조항호목) | 법률·시행령 모두 동작(시행령 MST로 호출하면 시행규칙 위임이 나온다). 시행규칙에도 호출한다 |
| `eflaw` (`resolveEffectiveLawVersion` + `fetchEffectiveLawPayload`) | 현행 조문 목록·본문 | 기존 `web/scripts/lib/law-service.mjs` 재사용. `target=law`는 시행 전 개정본을 주므로 쓰지 않는다 |

위임구분별 처리:
- `시행령`·`시행규칙`: 도착 조문이 해당 레인의 조문 목록에 있으면 `to`를 채운다. 없으면(개정 시차·삭제 조문) `to=null`, `unresolved=true`.
- `위임행정규칙`: 도착은 행정규칙 제목 박스(일련번호로 매칭). 트리에 없는 행정규칙이면 박스를 추가한다(출처 `lsDelegated`).
- `위임자치법규`: 도착은 자치법규 묶음 박스. 개별 조례 목록은 묶음 박스의 `collapsed.items`에 이름·일련번호만 둔다(최대 전체, 화면엔 개수).
- `인용법령`: 박스를 만들지 않는다. 출발 조문 패널의 "인용 법령" 목록에만 보인다(`targetName`, `phrase`).
- 머리글(`위임구분`) 없는 위임 항목은 링크텍스트로 종류를 추론한다: `대통령령`·`…시행령` → 시행령, `…부령`·`총리령` → 시행규칙, `「법령명」` → 인용법령. 그 밖(`제N항`·`제N조` 같은 내부 상호참조, `명령`·`법령` 같은 일반 명사)은 선을 만들지 않고 `dropped`로 집계한다.
- 도착 법령명·일련번호가 없는 시행령·시행규칙 위임은 (a) 법종구분이 링크텍스트와 같은 레인이 하나뿐이면 그 레인, (c) 아니면 도착 조문번호(도착 조문제목이 있으면 제목까지)가 같은 조문을 가진 그 층의 레인이 하나뿐이면 그 레인, (b) 아니면 그 층의 레인이 하나뿐일 때 그 레인으로 귀속한다(순서 a→c→b). 모두 아니면 `unresolved`(lane-missing).
- 같은 법 자기 인용(인용 법령명이 뿌리 법률 이름 또는 그 레인 자신의 이름과 같음)은 `cites` 선을 만들지 않고 `selfReferences`로 집계한다. 형제 인용(시행규칙 → 「건축법 시행령」)은 박스 없는 `cites` 선으로 남긴다. `selfReferences`는 중복 제거 전 원시 집계이므로 엣지 수와 비교할 수 없다.
- 조례 위임(`위임자치법규`)의 출발 조문: 조항호목이 비고 조문번호에 가지번호가 없어 기본 조문(제4조)으로만 온다. 레인에 가지 조문(제4조의2…)이 있으면 라인텍스트(원문 문장)를 조문 원문과 대조해 가지 조문을 고르고, 하나로 못 고르면 기본 조문에 두고 `ambiguousSources`로 보고한다. 대조 전에 공백을 지우고 가운뎃점(`·`/`ㆍ`)과 따옴표(둥근 `“”‘’`/곧은 `"'`)를 하나로 맞춘다.
- lsDelegated에서만 보이는 행정규칙 레인은 kind `"행정규칙"`·`effectiveOn: null`로 추가한다. lsStmd와 lsDelegated가 같은 고시에 다른 일련번호를 달 수 있으므로 이름이 같은 행정규칙은 한 박스로 합친다(일련번호는 별칭으로 등록).
- 하위 레인(시행령·시행규칙)의 lsDelegated 호출 실패(HTTP 500 등)는 법률 전체를 버리지 않고 그 레인의 조문만 싣고 위임선 없이 진행하며 `delegationUnavailable`로 보고한다. 법률 레인의 실패는 그 법률을 건너뛴다.
- `report.unresolved` 항목 수는 `stats.unresolved`(미해결 선 수)와 같다. 같은 선이 되풀이 나와도 한 번만 세고 한 번만 보고한다. 보고 항목은 선의 중복 제거 키와 같은 필드(`from`·`fromClause`·`kind`·`targetName`·`targetLabel`)를 모두 담는다. `unresolved`·`ambiguousSources` 항목에는 `rootLawId`(뿌리 법률)와 `lawId`(그 레인의 법령)를 함께 둔다.
- lsStmd가 시행 전 판만 주고(`시행일자`가 미래) `resolveEffectiveLawVersion`으로 현행판을 못 찾으면: 법률은 그 법률을 건너뛴다(이유 "현행 시행판 미확인"). 하위 레인(시행령·시행규칙)은 lsStmd가 준 판으로 진행하되 `futureVersions`로 보고한다(레인 `effectiveOn`에 미래 날짜가 그대로 보인다).
- 하위 레인의 lsDelegated는 재시도를 1회로 줄인다(일부 시행규칙은 체계적으로 500을 주므로 기본 3회 백오프는 시간만 쓴다). 법률 레인은 기본 재시도를 따른다.
- 제도 역참조: 제도 JSON의 `process.nodes[].legal_basis[]` 가운데 `wrong_basis` 플래그가 붙은 항목(검증에서 근거 오인용으로 판정)은 제외한다. `unverified` 항목은 포함한다.

호출 예산: 법률당 lsStmd 1 + lsDelegated 3(법률·시행령·시행규칙 각 1, 시행령·시행규칙이 여러 개면 그 수만큼) + eflaw 2×(법령 수). 278건 ≈ 3,000회. 단일 프로세스, 호출 간 300ms, 실패 시 지수 백오프 3회, 그래도 실패하면 그 법률은 건너뛰고 보고서에 남긴다. 원본 XML은 `web/data/law-map/raw/`에 캐시한다(gitignore).

## 4. 데이터 모델 (IR)

`web/src/lib/law-map-types.ts`에 타입, `web/scripts/validate-law-map.mjs`에 검증. 파일은 법률당 두 개:

- `web/data/law-map/<lawId>.json` — 구조(레인·조문 메타·엣지·제도 역참조). 페이지에 정적으로 포함.
- `web/public/law-map/<lawId>.text.json` — 조문 본문 미리보기(조문당 최대 300자). 패널을 열 때 클라이언트가 지연 로드.
- `web/data/law-map/index.json` — 목록 페이지용 요약(법령명·소관부처·조문 수·위임 수·연결 제도 수·생성일).

```ts
interface LawMap {
  schemaVersion: 1;
  lawId: string;            // "001823" — URL 경로이기도 하다
  mst: string;
  name: string;             // "건축법"
  ministry: string | null;  // lsDelegated 소관부처
  effectiveOn: string;      // YYYY-MM-DD
  promulgatedOn: string;
  generatedAt: string;
  lanes: Lane[];
  articles: Article[];
  edges: Edge[];
  institutions: InstitutionRef[];
  stats: { articlesByTier: Record<Tier, number>; edgesByKind: Record<EdgeKind, number>; unresolved: number };
}

type Tier = "statute" | "decree" | "rule" | "adminRule" | "ordinance";

interface Lane {
  id: string;               // "L1" | "D1".."Dn" | "R1".."Rn" | "A1".."An" | "O1" (시행령이 여럿이면 Dn)
  tier: Tier;
  name: string;
  kind: string;             // 법종구분 (법률·대통령령·국토교통부령·고시·훈령·조례)
  lawId?: string; mst?: string; serial?: string;   // 행정규칙은 serial(행정규칙일련번호)
  effectiveOn?: string;
  officialUrl: string;      // law.go.kr 공개 URL (OC 없음)
  articleCount: number;     // adminRule·ordinance는 0
  collapsed?: { count: number; items: { name: string; serial: string }[] };  // ordinance 묶음
}

interface Article {
  id: string;               // `${laneId}:제11조` / `${laneId}:제3조의3`
  laneId: string;
  no: number; branch: number | null;
  label: string;            // "제11조"
  title: string;            // "건축허가"
  chapter: string | null;   // "제2장 건축물의 건축"
  officialUrl: string;      // law.go.kr 조문 링크
}

type EdgeKind = "decree" | "rule" | "adminRule" | "ordinance" | "cites";

interface Edge {
  id: string;
  from: string;             // Article.id
  fromClause: string | null;  // "제2조제1항제11호"
  to: string | null;        // Article.id (decree·rule) | Lane.id (adminRule·ordinance) | null (cites·unresolved)
  kind: EdgeKind;
  phrase: string;           // 라인텍스트 "대통령령으로 정하는"
  targetName: string;       // 도착 법령·규칙·조례명 (인용법령은 「도로법」)
  targetLabel?: string;     // 도착 조문 "제3조의3(지형적 조건…)"
  unresolved?: true;
}

interface InstitutionRef { slug: string; name: string; articles: string[] }  // Article.id[]
```

제도 역참조 생성 규칙: 제도 JSON의 `process.nodes[].legal_basis[]`와 `canvas.legalBasis[]`의 `law`를 레지스트리로 lawId에 매칭하고, `article`을 `제N조(의M)` 정규식으로 정규화해 `Article.id`를 만든다. 매칭 실패(조문이 현행에 없음)는 `institutions[].articles`에 넣지 않고 생성 보고서에 센다.

검증(`validate-law-map.mjs`, `validate:data`에서 호출):
- `edge.from`은 articles에 존재, `edge.to`는 articles 또는 lanes에 존재(또는 null+unresolved/cites).
- `articles[].laneId`가 lanes에 존재, 레인 tier와 edge kind 일치(decree→decree 레인 등).
- `stats`가 실제 개수와 일치. `index.json`과 파일 목록 일치.
- **모든 문자열에 `OC=` 패턴이 없다.**
- text.json의 키 집합 ⊆ articles id 집합.

## 5. 파이프라인 (`web/scripts/`)

- `lib/law-map-parsers.mjs` — 순수 함수. `parseLsStmd(xml)`, `parseLsDelegated(xml)`, `parseClause("제2조제1항제11호")`, `stripOc(text)`. 테스트 대상.
- `lib/law-map-build.mjs` — 순수 함수 `buildLawMap({stmd, delegated[], articles{}, institutions, registry})` → `LawMap` + text + 보고 항목.
- `fetch-law-map.mjs --lawId 001823 | --all [--limit N] [--force]` — DRF 호출(캐시 우선), 두 모듈로 IR 생성, 파일 기록, `docs/audits/law-map-build-<date>.json` 보고서(건너뜀·unresolved·제도 매칭 실패).
- `generate-law-map-index.mjs` — `index.json` 생성(fetch 끝에 자동 호출).

## 6. 화면

### 6.1 목록 `/law/`
278건 카드. 법령명·소관부처·조문 수·위임선 수·연결 제도 수. 법령명·부처 검색. 홈 네비게이션(`layout.tsx`)에 "법령 지도" 추가, `sitemap.ts`에 `/law/`와 `/law/<lawId>/` 추가.

### 6.2 상세 `/law/<lawId>/`
`src/app/law/[lawId]/page.tsx` 정적 생성(`generateStaticParams`, `dynamicParams=false`, canonical·OG는 모델 페이지와 동일 패턴). 상단에 법령명·소관부처·시행일·통계·law.go.kr 링크. 본문은 `LawMapBoard`.

### 6.3 `LawMapBoard.tsx` ("use client")
- **배치**: 가로로 레인 열(법률 | 시행령 | 시행규칙… | 행정규칙 | 자치법규). 조문 박스는 열 안에서 조문 순서대로 세로 배치, 장(章) 헤더로 구분. 좌표는 DOM 측정(`useLayoutEffect`)으로 얻어 SVG 오버레이에 베지어 선을 그린다(SwimlaneBoard와 같은 방식, 코드는 공유하지 않음). 행정규칙 레인은 제목 박스 목록, 자치법규 레인은 묶음 박스 하나("조례·규칙 1,094건").
- **기본 상태**: 선을 전부 그리지 않는다. 위임이 있는 조문 박스에 종류별 색 점과 건수를 표시한다. 호버 또는 선택한 조문의 선만 그린다.
- **클릭 → 패널**(데스크톱 우측 고정, 모바일 하단 시트): 조문 제목·본문 미리보기(text.json 지연 로드, 실패 시 "원문은 law.go.kr에서")·위임선 종류별 목록(클릭하면 도착 조문으로 포커스 이동)·인용 법령·이 조문을 쓰는 제도(모델 페이지 링크)·law.go.kr 조문 링크.
- **경로 추적**: "경로" 토글 뒤 조문 두 개를 고르면 `src/lib/law-map-route.ts`의 BFS(하향 엣지만, cites 제외)로 최단 경로를 찾아 선과 박스를 강조하고 패널에 단계 목록을 쓴다. 경로가 없으면 "직접 위임 경로 없음"을 표시한다.
- **필터·검색**: 엣지 종류 토글 5개, 조문 번호·제목 검색(일치 박스로 스크롤·강조).
- **URL 해시**: `#a=L1:제11조`(포커스), `#route=L1:제11조..R1:제6조`. 로드 시 복원.
- **모바일**: 레인 가로 스크롤, 패널은 하단 시트. 박스 최소 터치 높이 유지.
- 색 문법은 사이트 기존 토큰(`globals.css`)을 따른다. 엣지 종류별 색은 5개 고정.

### 6.4 제도 페이지 연결
`InstitutionDetailView`의 법적 근거 블록에서 법령 지도 index의 레인 이름(법률·시행령·시행규칙)과 공백 제거 후 일치하는 법령에 "법령 지도 →" 링크(`/law/<lawId>/`)를 붙인다. 매칭이 없으면 링크를 만들지 않는다. 같은 부령이 두 법률 지도에 나오면 index 순서상 먼저 나온 법률로 간다.

조문 앵커(`#a=L1:제N조`)는 v1에서 보류한다. 제도의 `legalBasis.articles`는 "제11조·제14조" 같은 자유 문자열이고, 어느 레인(L1/D1/R1…)의 조문인지 정하려면 모델 페이지마다 법령 지도 전체를 읽어야 하기 때문이다. 조문 단위 역참조는 반대 방향(법령 지도 패널의 "이 조문을 쓰는 제도")으로 제공한다.

## 7. 오류 처리

- DRF가 HTML 오류 페이지나 빈 응답을 주면 그 호출을 실패로 치고 백오프 재시도, 최종 실패 시 해당 법률 건너뜀 + 보고서. 부분 데이터로 파일을 쓰지 않는다.
- 도착 조문 미해결은 `unresolved`로 남기고 패널에 "현행 조문에서 미확인"으로 보인다.
- OC는 `law-go-kr-oc.mjs`로만 해석하고 로그·파일·URL에 남기지 않는다. 검증이 이를 기계로 확인한다.
- text.json 로드 실패는 패널 본문만 비우고 나머지는 동작한다.

## 8. 테스트

- `scripts/law-map-parsers.test.mjs`: 건축법 축약 XML 고정 샘플로 레인 추출, 위임 5종 파싱, 조항호목 파싱, OC 제거.
- `scripts/law-map-build.test.mjs`: 소형 입력으로 edge 해석(resolved·unresolved·adminRule 추가 박스·ordinance 묶음), 제도 역참조 매칭, stats.
- `scripts/law-map-route.test.mjs`: BFS 최단 경로, 경로 없음, cites 제외.
- `validate-law-map.mjs`를 `validate:data`에 연결. 기존 테스트 명령(`npm run test:*`) 패턴을 따라 `test:law-map` 추가.
- 수동 확인: 건축법 페이지를 로컬 빌드로 열어 클릭·경로·해시 복원·모바일 폭을 확인하고 스크린샷을 남긴다.

## 9. 단계

- **M1 파일럿**: 파서·빌더·fetch 스크립트(건축법 1건) → IR·검증 → 상세 페이지·보드·패널·경로 → 제도 링크. 이 시점에 text.json 크기를 재서 278건 환산 총량을 확인한다(예산: `public/law-map/` 합계 80MB 이하. 초과하면 미리보기 글자 수를 줄인다).
- **M2 확장**: `--all` 실행(캐시·보고서), 목록 페이지, 네비·사이트맵, 검증 통과, 빌드, 배포.
- 커밋은 단계별로 나눠 올린다(대량 커밋 몰아치기 금지).

## 10. 열어 둔 결정 없음

URL 세그먼트는 법령ID(안정적이고 law.go.kr과 동일)로 한다. 한글 slug는 만들지 않는다.
