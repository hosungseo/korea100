# 절차 비교대조 엔진 + 복합민원 체계도 4호 — 설계

asOf: 2026-09-05
상태: 설계 승인 대기 → 구현 계획(writing-plans)으로 이어짐
관련: `artifacts/complex-minwon/PLAN-semiconductor-warroom.md`, `ANALYZE-kipa-lump-semiconductor.md`, `CONCEPT-structure-analysis.md`

## 1. 목적과 결정

행정효율 관점에서 반도체클러스터 인허가 덩어리(산단 지정 의제 패키지)를 **절차끼리 비교대조**해 통합·자동화·축소할 수 있는 지점을 찾고, 1호·2호 문법의 개선 카드(조문 1개 · 소관 1개)로 내놓는다. 절차 삭제는 하지 않는다. 시간 단축은 결과이지 비교의 축이 아니다.

브레인스토밍에서 확정한 결정:

| 결정 | 선택 |
|---|---|
| AI의 자리 | 분석가. 근거·후보·카드를 만들고, 제도는 사람이 바꾼다 |
| 범위 | 반도체 한 건으로 만들되 절차 레코드 스키마는 공용. 로더는 워룸 스키마만 구현 |
| 비교 축 | A 실체요건(심사 대상 지표) + C 기관 왕복. B 서류 축은 다음 판 |
| 방법 | 추출 → 결정적 대조 → 묶음 내 쌍대 판정 → 카드. 임베딩 군집은 쓰지 않음 |
| 시각화 | ① 비교대조 판(새 형식) + ② 체계도 4호 판(기존 문법, 덩어리 222개 전체 한 장) |
| 하지 않는 것 | 일수 시뮬레이션, 서류 축, drop 카드, 워룸 상태 머신 변경, 사업 전체 1,317개 한 장 |

## 2. 대상

워룸 `gwangju-semiconductor-cluster`의 KIPA 덩어리 합격 구간 12개 마일스톤:
`N36, N09, N11, N12, N38, N39, N40, N13, N14, N37, N10, N15`

| 마일스톤 | 절차 | 참조 제도 |
|---|---|---|
| N36 산단계획 승인신청 | 1 | industrial-complex-fast-track-plan-approval |
| N09 전략환평 | 12 | environmental-impact-assessment-consultation |
| N11 환평 초안·공람 | 13 | industrial-complex-development, environmental-impact-assessment-consultation |
| N12 환평 본안·협의 완료 | 14 | 위와 같음 |
| N38 재해영향평가 | 17 | disaster-impact-assessment-consultation, national-disaster-safety-management-plan |
| N39 교통영향평가·광역교통 | 15 | traffic-impact-assessment-review, metropolitan-transport-improvement-measures |
| N40 에너지사용계획 | 15 | energy-use-plan-consultation, district-energy-business-permit |
| N13 국가유산 진단·매장유산 | 30 | cultural-heritage-survey, buried-cultural-heritage-excavation-permit, national-heritage-basic-plan |
| N14 의제 실체요건 취합 | 73 | development-permit, one-stop-permit-consultation, industrial-complex-development, farmland-use-permission-conversion, forestland-conversion, public-waters-occupation |
| N37 통합심의 | 12 | industrial-complex-fast-track-plan-approval, development-building-landscape-review |
| N10 산단계획 승인·지정 고시 | 4 | industrial-complex-development, industrial-complex-fast-track-plan-approval |
| N15 실시계획·승인조건 | 16 | industrial-complex-development, one-stop-permit-consultation, development-charge-assessment, nonpoint-pollution-source-installation-management, ecosystem-conservation-charge-assessment |

합계 절차 222 · 제도 21 · 행위 주체 원문 문자열 65. 군공항(N32) 절차는 음성 대조군으로만 넣는다.

데이터 출처: `web/data/mega-projects/projects/gwangju-semiconductor-cluster.json`(마일스톤·templateRefs), `web/data/institutions/<slug>.json`(process.nodes: name, actor, action, input_documents, output_documents, deadline, legal_basis[{law, article, text}], type), `web/public/warroom/p/gwangju-semiconductor-cluster/path.json`(크리티컬).

현재 채움률(1,317건 기준): 조문·행위·출력서류 100%, 기한 167, 입력서류 16. 입력서류가 비어 있어 서류 축(B)은 이번 판에서 제외한다.

## 3. 구조

위치 `artifacts/complex-minwon/_lib/compare/`. 산출물은 `artifacts/complex-minwon/04-deemed-bundle/`.

5단계 파이프라인. 각 단계는 JSON 하나를 쓰고 다음 단계는 그것만 읽는다. 단계별 독립 실행. AI 호출은 입력 해시로 캐시(`compare/.cache/`)해 재실행 시 같은 입력을 다시 묻지 않는다.

```
load.mjs     워룸 JSON + 제도 108      → 04/compare/procedures.json
extract.mjs  procedures.json  (AI ×222) → 04/compare/cards.json
match.mjs    cards.json       (코드)    → 04/compare/candidates.json
judge.mjs    candidates.json  (AI ×묶음) → 04/compare/verdicts.json
emit.mjs     verdicts.json    (AI+코드) → 04/improvements.mjs, 04/review.html
```

AI 호출은 저장소 관례대로 `claude -p`(`web/scripts/discover-institution-candidates.mjs`와 같은 방식). 응답은 JSON만 받고, 프롬프트·모델·입력 해시를 캐시 키와 함께 기록한다.

### 3.1 load — 공용 절차 레코드

```
{ pid: "N14:farmland-use-permission-conversion:P03",
  ms: "N14", msName, stage: "G3", gateIndex,
  institution: "farmland-use-permission-conversion", institutionName,
  name, action, actorRaw, type: "task|gateway|notice|system",
  outputs: [...], inputs: [...], deadlineRaw,
  legal: [{ law, article, text }],
  onCritical: true|false }
```

옵션 `--project <id> --milestones N36,N09,...`. 체계도 `case-data.mjs`(lanes/gates/nodes/edges)도 같은 레코드로 올릴 수 있게 필드를 잡아 두되, 그 로더는 이번에 만들지 않는다. `nodeIds`가 있는 templateRef는 그 노드만, 없으면 제도 전체를 편입한다(gen-warroom.mjs와 같은 규칙).

### 3.2 extract — 구조화 카드 (AI, 절차당 1회)

```
{ pid,
  org: "기후에너지환경부",           // 코드표 정규화. 없으면 원문 유지 + orgUnknown: true
  orgRole: "applicant|authority|consultee|committee",
  act: "apply|receive|review|consult|deliberate|resolve|notice|notify|supplement",
  subjects: ["traffic", "drainage", ...],   // 고정 분류표. 밖이면 "other:<라벨>"
  deemed: { is: bool, basis: "법 제N조제N항" | null },
  clock: { days: number|null, basis: "..."|null, silentEffect: bool },
  evidence: [{ law, article }],     // 절차 레코드 legal에서 복사만. 새 조문 금지
  extractStatus: "ok|failed" }
```

심사 대상 지표 분류표(`compare/subjects.json`, 초기 약 20종): 교통, 재해·배수, 대기, 수질, 소음·진동, 에너지, 토지형질, 농지, 산지, 공유수면, 유산, 경관, 생태, 안전·위험물, 용수, 하수, 폐기물, 온실가스, 입지·용도, 보상·권리. 파일로 두고 `other:` 수집 결과를 보고 확장한다.

기관 코드표(`compare/orgs.json`): 원문 문자열 → 정규화 기관. "기후에너지환경부장관"과 "기후에너지환경부"는 같은 코드. 역할 명칭("산업단지 지정권자", "관계 행정기관")은 기관을 추측하지 않고 역할 코드로 둔다(gen-warroom.mjs의 actor axis 원칙과 같음).

### 3.3 match — 결정적 대조

- **A축 `same-subject`**: 같은 subject를 가진 절차 중 `legal[].law`가 서로 다른 것이 2개 이상이면 한 묶음. 같은 법 안의 반복은 묶지 않는다(그건 절차 흐름이지 중복이 아님).
- **C축 `org-roundtrip`**: 같은 정규화 org, 같은 마일스톤 또는 인접 마일스톤(gateIndex 차 ≤ 1)에서 act ∈ {consult, deliberate}가 2회 이상이면 한 묶음.
- 묶음 점수: 절차 수, 법률 수, 마일스톤 수, onCritical 절차 수. 점수 순 정렬.
- `extractStatus: failed`·`orgUnknown`은 대조에서 제외하고 목록에 남긴다.

### 3.4 judge — 묶음 내 쌍대 판정 (AI, 묶음당 1회)

묶음 안 모든 쌍에 대해 `{ a, b, verdict: "same|partial|different", mergeable: bool, reason, blockingArticle }`. 통과 쌍(same 또는 partial이면서 mergeable)이 하나도 없는 묶음은 탈락. 판정 결과에 삭제·갈음 제안이 나오면 무시하고 기록만 한다.

보존 목록(`compare/preserve.json`): 환경영향평가 본안 협의, 국가유산 대상 판정, 군공항 이전 주민투표. 이 절차가 든 쌍은 `mergeable`이 true여도 카드 종류를 shorten·automate로만 허용한다.

### 3.5 emit — 카드와 판

개선 카드는 기존 `improvements` 형식 그대로:
```
{ id, kind: "merge|automate|shorten", nodes: [pid...],
  title, why, lever, targets: ["부처 — 법 제N조제N항"] }
```
`targets`의 조문은 묶음 절차의 `legal`에 있거나 `04-deemed-bundle/laws/*.json`(fetch-laws 스냅샷)에 있어야 한다. 없으면 카드를 떨어뜨리고 `rejected.json`에 이유를 남긴다. drop은 스키마에서 거부.

## 4. 시각화

### 4.1 비교대조 판 `04-deemed-bundle/review.html` (먼저)

엔진이 맞게 묶었는지 사람이 보는 판. 3호 contact map(`n03-contact-map.html`)을 키운 형식.
- A축 매트릭스: 행 = subject 20종, 열 = 법률·제도 21개. 칸 = 그 법이 그 지표를 다루는 절차(수·act·기한 유무를 색으로). 한 행에 서로 다른 법 칸이 2개 이상이면 후보, 판정 통과 묶음은 노랑 테두리.
- C축 매트릭스: 행 = 정규화 기관, 열 = 마일스톤 순서(N36→…→N15). 칸 = consult·deliberate 횟수. 크리티컬 열은 배경 진하게.
- 칸 클릭 → 절차 목록·조문·판정 사유 패널. 4.2 판이 있으면 같은 pid 칸으로 링크.
- PNG @2x도 낸다(gen과 같은 playwright 경로).

### 4.2 체계도 4호 판 (카드 확정 후)

기존 문법(가로 = 기관 레인, 세로 = 관문, 초록 규정 / 파랑 추론, 표시판 노랑·보라·주황)으로 **덩어리 222개 전체를 한 장**에. full·improve 두 장 + PNG @2x. 규모는 1호(66)의 약 3.4배.
- `04-deemed-bundle/case-data.mjs`는 emit이 절차 레코드에서 뼈대(lanes = 정규화 기관, gates = 마일스톤 순서, nodes = 절차, edges = 제도 process.edges + 워룸 hard requires)를 생성하고, improvements는 3.5 산출을 붙인다.
- 배선은 `_lib/gen.mjs`의 기존 알고리즘. `check-overlap.mjs`로 관통 0·겹침 0을 통과해야 완성으로 친다. 222개에서 통과가 안 되면 레인 폭·거터를 키우는 파라미터로 대응하고, 알고리즘은 바꾸지 않는다.
- 워룸 연결: `data.json`의 N14·N37·N11·N12에 `bundleId: "04-deemed-bundle"`만 추가(PLAN 결정, 상태 머신 변경 없음).

## 5. 오류 처리

- AI 응답 파싱 실패: 1회 재시도, 다시 실패하면 `extractStatus: failed`. 지어내서 채우지 않는다.
- 조문 검증: `evidence`·`targets`의 law+article이 원본에 없으면 그 카드·판정을 거부하고 기록.
- 기관·지표가 코드표 밖: 원문 유지 + 플래그. 실행 끝에 `unknown-orgs.json`, `other-subjects.json`을 내서 코드표 확장 후보로 삼는다.
- 캐시: 입력 해시가 같으면 AI를 부르지 않는다. `--fresh`로 무시 가능.
- 워룸 데이터가 바뀌면 load부터 다시 돌리고, 바뀐 절차만 추출이 다시 일어난다.

## 6. 검증과 성공 기준

- 결정적 단계(load, match, emit의 case-data 생성)는 픽스처(마일스톤 3 · 절차 10 · 알려진 겹침 2묶음)로 `node --test`.
- **재발견 검사**: 3호가 손으로 찾은 I2(작성 단계 사전협의 + 지정 전 협의의 시계 2회)·I5(§26 의제 협의를 심의와 한 사건으로)와 1호 건축허가의 협의 시계 5개가 후보 묶음으로 다시 나와야 한다. 못 찾으면 분류표·대조 규칙을 고친다.
- 골든 카드: 절차 20개를 사람이 라벨링해 org·act·subjects 일치율을 잰다. 기준 80% 이상.
- 음성 대조군: 군공항 N32 절차를 섞어 넣고 덩어리 묶음에 들어오지 않아야 한다.
- 첫 판 성공 지표: 후보 묶음 수, 판정 통과 수, 카드마다 소관 1개·조문 1개, review.html 1장, 4호 판 full·improve 관통 0·겹침 0.
- 소요일 단축 주장은 하지 않는다(PLAN 원칙 유지).

## 7. 예상 규모

AI 호출 약 222(추출) + 묶음 수십(판정) + 카드 수십. 코드는 `_lib/compare/` 5파일 + 코드표 3파일 + 테스트. 기존 `gen.mjs`·`verify-basis.mjs`·`check-overlap.mjs`·`fetch-laws.py`는 수정 없이 재사용.
