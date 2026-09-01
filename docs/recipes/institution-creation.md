You CREATE new institution model files for the korea100 project (한 장으로 끝내는 대한민국 제도 100).
Repo: /Users/seohoseong/korea100, branch feat/hr-institutions (already checked out — do NOT switch).

## Reference material (read these FIRST)
1. Exemplar (structure to copy exactly): web/data/institutions/school-violence-response.json — top-level keys, canvas 9칸, process 구조, verification 블록 형태를 그대로 따른다.
2. Data contract: docs/data-contract.md
3. Domain-adjacent exemplar for tone: web/data/institutions/civil-service-exam.json

## Law verification (MANDATORY — every article you cite)
law.go.kr DRF API via curl:
- Search: curl -s "https://www.law.go.kr/DRF/lawSearch.do?OC=$LAW_GO_KR_OC&target=law&query=<법령명>&type=XML" → 현행 MST·lawId·공포일·시행일
- Body: curl -s "https://www.law.go.kr/DRF/lawService.do?OC=$LAW_GO_KR_OC&target=law&MST=<MST>&type=XML" → 목차+조문 전문
Read the actual article text for every step. **지어내기 절대 금지** — you may only cite 제N조(현행 제목) you have seen in the XML. 행정규칙(훈령·예규·고시·지침)은 target=admrul로 검색·본문 조회하여 검증한다(lawSearch/lawService.do?target=admrul). admrul에도 없는 내부규정만 "unverified": true + fieldVerification.
부처명은 2026 개편 현행으로: 인사혁신처(존속), 행정안전부(존속), 기획예산처/재정경제부(구 기획재정부 분리). 조문 원문에 나오는 명칭을 그대로 쓴다.

## File requirements (per institution)
- Top-level: slug, name, oneLiner, type, priority, whyFirst, asOfDate:"2026-07-12", status:"full", canvas, related, fieldVerification, process, verification (exemplar와 동일 키 구성)
- canvas: purpose(1문단), stakeholders(1문단), legalBasis(법령별 {law, articles:"제N조(제목), ..." 나열, kind}), authorities([{name, role}]), procedure([단계 문장 8~14개]), moneyFlow(수수료·비용 부담 서술), docsFlow(문서 흐름 →연결 서술), bottlenecks([3~5개]), reformPoints([3~5개])
- process: lanes 4~7개(**당사자(공무원·응시자 등) 레인 필수 — 신청·진술·불복 등 당사자 행위 노드 최소 2개**), stages "G0 ..." 형식 6~8개, nodes 14~20개(id P01.., name, lane, stage, type: task|gateway|system, status: done|current|waiting|risk|loop 중 — **current 정확히 1개**, progress, actor, action, output_documents, deadline(조문 명시분만, 없으면 null), confidence 0.7~0.95, legal_basis[{law, article:"제N조(제목)", text:"원문 확인한 요지"}]), edges(sequence/message/loop — id E../M../L..)
- **불복·이의·소청 노드는 반드시 심사·결정 노드를 거쳐 원처분으로 회귀** (validator 규칙: appeal node가 심사 없이 원처분으로 직접 loop 불가)
- loop 엣지 최소 1개(보완·재심사 등 실제 회귀 경로)
- verification 블록: exemplar 형태로 — status:"article-verified", verifiedAt:"2026-07-12", method:"국가법령정보센터 DRF API 현행 원문 대조", scope 문장(검증 건수 정직하게), **notes: 문자열 배열**(문자열 하나여도 `["..."]`. 확인한 법령의 [시행/공포] 버전 명기 — 2026-09-01 배치에서 6건 전부 문자열로 써서 데이터 검증이 깨졌다), sources([{law, kind, sourceType:"statute", officialName, lawId, mst, promulgatedOn, effectiveOn, officialUrl:"https://law.go.kr/법령/<법령명 공백제거>"}]), articleVerification{checkedAt, method, citationEntries, explicitCitationEntries, articleReferences, verifiedReferences, missingReferences:0, uncheckableReferences:<unverified 수>} — 숫자는 실제 세어서.
- related: 관련 제도 이름 3~5개 (기존 제도명 참고: 공무원 채용, 교원 임용, 행정심판 등)
- fieldVerification: 법령으로 확인 불가한 운영 사항 3~6개

## Do NOT
- docs/institutions-100-manifest.json 수정 금지 (컨트롤러가 일괄 처리)
- validate-data.mjs 전체 실행은 manifest 불일치로 실패하니 하지 말 것. 대신 self-check: python3 -c "import json; d=json.load(open('<file>')); assert d['status']=='full'; assert d.get('category'), 'category 필수'; v=d['verification']; assert isinstance(v.get('notes'), list), 'notes는 배열'; assert isinstance(v.get('sources'), list) and v['sources'], 'sources는 비어있지 않은 배열'; p=d['process']; assert sum(1 for n in p['nodes'] if n['status']=='current')==1; ids={n['id'] for n in p['nodes']}; assert all(e['source'] in ids and e['target'] in ids for e in p['edges']); lanes=set(p['lanes']); assert all(n['lane'] in lanes for n in p['nodes']); stages=set(p['stages']); assert all(n['stage'] in stages for n in p['nodes']); print('ok', len(p['nodes']), len(p['edges']))"
- 다른 제도 파일 수정 금지

## Commit
One commit per institution: git add web/data/institutions/<slug>.json && git commit -m "feat: add <slug> process model"
index.lock 충돌 시 2초 대기 후 재시도(최대 3회). Push 금지.
Commit 메시지 끝에:
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013WXa2uVeD6vUjpK4hHNLZU

## 컨트롤러 마감 (배치가 끝나면 반드시 — 작업 에이전트가 아니라 컨트롤러가 실행)
작업 에이전트는 매니페스트를 건드리지 않는다(동시 편집 충돌). 그 등재를 컨트롤러가 몰아서 한다.
2026-09-01 배치에서 이 단계를 건너뛰어 제도 6건이 미등재로 커밋됐고 데이터 검증이 8건 깨졌다.

```bash
cd web
node scripts/register-institutions.mjs --check   # 미등재·불일치 확인 (종료코드 1이면 밀린 것)
node scripts/register-institutions.mjs           # 매니페스트 등재 + notes 배열화
node scripts/generate-field-verification-queue.mjs
node scripts/validate-data.mjs                   # 전체 통과까지 확인
```

고아 항목·priority 중복·매니페스트↔파일 필드 불일치는 자동 처리하지 않는다. 사람이 판단한다.
카테고리가 어긋나면 화면은 파일 값을 보여주는데 필터 칩은 매니페스트로 만들어져서
그 제도가 어느 칩으로도 안 잡힌다.

## Report (FINAL message = report only)
Per institution: slug | 노드/엣지 수 | 검증 조문 수(unverified 수) | 확인 법령·MST | 법의 침묵/특이점 1-2건 | commit SHA

> OC는 공용 `test` 계정이 아니라 실 계정을 쓴다.
> `export LAW_GO_KR_OC=$(node -e "import('./web/scripts/lib/law-go-kr-oc.mjs').then(m=>console.log(m.resolveLawGoKrOc()))")`
> 또는 `~/.openclaw/secrets/law-go-kr-oc`. test 계정은 호출 한도가 낮고 일부 target이 막힌다.
