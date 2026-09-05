# 절차 비교대조 엔진 + 복합민원 체계도 4호 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 광주 반도체 워룸의 산단 지정 의제 덩어리(12개 마일스톤 · 절차 222개)를 절차끼리 비교대조해 통합·자동화·축소 후보를 1호 문법 개선 카드로 내고, 비교대조 판(review.html)과 체계도 4호 판(full/improve)을 그린다.

**Architecture:** 5단계 파이프라인(load → extract → match → judge → emit). 각 단계는 JSON 파일 하나를 쓰고 다음 단계는 그것만 읽는다. AI 호출(`claude -p`)은 입력 해시로 캐시한다. 결정적 단계는 순수 함수로 두고 `node --test`로 검증한다. 체계도는 기존 `_lib/gen.mjs`가 그리며, 엔진은 그 입력(`case-data.mjs`)만 생성한다.

**Tech Stack:** Node 22 ESM(`.mjs`), `node:test`, `claude` CLI(`-p`), 전역 playwright(PNG), python3.14 `fetch-laws.py`(법제처 DRF). 외부 npm 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-09-05-procedure-compare-engine-design.md`

---

## 경로·규약 (모든 태스크 공통)

- `ROOT` = 저장소 루트 `~/korea100`. 아래 경로는 전부 ROOT 기준.
- `COMPARE` = `artifacts/complex-minwon/_lib/compare/` (엔진 코드 + 코드표 + 테스트)
- `OUT` = `artifacts/complex-minwon/04-deemed-bundle/` (산출물)
- 테스트 실행: `cd artifacts/complex-minwon/_lib/compare && node --test test/`
- 커밋은 태스크마다 1회. 메시지는 conventional commit, 영어 prefix + 한국어 본문 가능. 끝에 아래 두 줄.
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JJiv8m6BL2aRXVRAug79Xf
  ```
- 현재 브랜치 `chore/lawmorph-video`에는 이 작업과 무관한 미커밋 변경이 있다. **`git add`는 항상 경로를 지정**하고 `git add -A`·`git add .`를 쓰지 않는다.
- AI 호출 실제 실행(`claude -p`)은 Task 12에서만 한다. 그 전 태스크는 전부 가짜 claude 바이너리(Task 2)로 테스트한다.

## 파일 구조

```
artifacts/complex-minwon/_lib/compare/
  package.json            # {"type":"module","scripts":{"test":"node --test test/"}}
  lib/io.mjs              # readJson/writeJson/sha1/cache 경로
  lib/claude.mjs          # callJson(prompt, opts): claude -p 호출 + 캐시 + JSON 파싱 + 1회 재시도
  lib/normalize.mjs       # normalizeOrg(raw, orgs) → {org, role, unknown}
  lib/paths.mjs           # ROOT/COMPARE/OUT 절대경로
  load.mjs                # loadProcedures(opts) + CLI → procedures.json
  extract.mjs             # buildExtractPrompt / validateCard + CLI → cards.json
  match.mjs               # matchSameSubject / matchOrgRoundtrip / scoreCluster + CLI → candidates.json
  judge.mjs               # buildJudgePrompt / applyVerdicts + CLI → verdicts.json
  emit-cards.mjs          # buildCardPrompt / validateCard(targets) + CLI → cards-out.json, improvements.mjs, rejected.json
  emit-review.mjs         # renderReview(...) + CLI → review.html (+ --png)
  emit-casedata.mjs       # buildCaseData(...) + CLI → OUT/case-data.mjs
  check-rediscovery.mjs   # 골든 재발견 검사 CLI
  compare-golden.mjs      # 골든 카드 20개 일치율 CLI
  orgs.json               # 기관 코드표
  subjects.json           # 심사 대상 지표 분류표
  preserve.json           # 보존 목록
  golden/rediscovery.json # 재발견 기대 묶음
  golden/cards.golden.json# 사람이 라벨링한 20개 카드
  test/
    fake-claude.mjs       # 프롬프트 마커별 고정 JSON을 출력하는 가짜 claude
    fixtures/project.json, fixtures/path.json, fixtures/institutions/*.json
    io.test.mjs, claude.test.mjs, load.test.mjs, normalize.test.mjs, extract.test.mjs,
    match.test.mjs, judge.test.mjs, emit-cards.test.mjs, emit-review.test.mjs, emit-casedata.test.mjs
artifacts/complex-minwon/_lib/verify-basis.mjs   # Task 8: loadLaws/checkCitation export (동작 불변)
artifacts/complex-minwon/04-deemed-bundle/
  compare/{procedures,cards,candidates,verdicts,cards-out,rejected,unknown-orgs,other-subjects}.json
  laws/*.json, case-data.mjs, gen.mjs, verify-basis.mjs, verification.json,
  review.html/.png, deemed-bundle-full.html/.png, deemed-bundle-improve.html/.png, README.md
web/data/mega-projects/projects/gwangju-semiconductor-cluster.json  # Task 14: bundleId 4곳
web/tools/gen-warroom.mjs                                            # Task 14: bundleId 통과 1줄
```

### 데이터 형식 (태스크 간 계약)

**절차 레코드** (`procedures.json` = 배열):
```json
{ "pid": "N14:farmland-use-permission-conversion:P03",
  "ms": "N14", "msName": "의제 인허가 실체요건…", "stage": "G3", "gateIndex": 3, "msOrder": 8,
  "institution": "farmland-use-permission-conversion", "institutionName": "농지전용허가·협의",
  "nodeId": "P03", "name": "농지전용협의(지역·시설 지정 시)", "action": "…", "actorRaw": "주무부장관·지방자치단체의 장",
  "type": "task", "outputs": ["농지전용 협의"], "inputs": [], "deadlineRaw": null,
  "legal": [{ "law": "농지법", "article": "제34조제2항", "text": "…" }],
  "onCritical": true }
```
`msOrder` = 시나리오 0의 `eta[ms][0]`(착수일) 오름차순, 같으면 id 순. `gateIndex` = 프로젝트 `stages` 배열의 인덱스.

**추출 카드** (`cards.json` = `{ [pid]: card }`):
```json
{ "pid": "…", "org": "농림축산식품부", "orgRole": "consultee", "act": "consult",
  "subjects": ["farmland"], "deemed": { "is": true, "basis": "농지법 제34조제2항" },
  "clock": { "days": null, "basis": null, "silentEffect": false },
  "evidence": [{ "law": "농지법", "article": "제34조제2항" }], "extractStatus": "ok" }
```
enum: `orgRole` ∈ applicant|authority|consultee|committee, `act` ∈ apply|receive|review|consult|deliberate|resolve|notice|notify|supplement.

**후보 묶음** (`candidates.json` = 배열):
```json
{ "cid": "A-traffic-01", "axis": "same-subject", "key": "traffic", "pids": ["…"],
  "score": { "procs": 4, "laws": 3, "milestones": 2, "critical": 2 } }
```
C축은 `"axis": "org-roundtrip", "key": "기후에너지환경부@N11"`.

**판정** (`verdicts.json` = 배열): `{ "cid", "pairs": [{ "a", "b", "verdict": "same|partial|different", "mergeable": true, "reason", "blockingArticle": null }], "passed": true, "allowedKinds": ["merge","automate","shorten"] }`

**개선 카드** (`cards-out.json` = 배열, `improvements.mjs`는 같은 내용을 `export const improvements = [...]`로):
`{ "id": "I1", "kind": "merge", "nodes": ["<case-data node id>…"], "pids": ["…"], "title", "why", "lever", "targets": ["농림축산식품부 — 농지법 제34조제2항"] }`

**case-data node id** = `${ms}_${instIndex}_${nodeId}` (예 `N14_3_P03`). `instIndex`는 procedures.json에서 institution이 처음 등장한 순서(0부터).

---
### Task 1: 스캐폴드 + io 헬퍼

**Files:**
- Create: `artifacts/complex-minwon/_lib/compare/package.json`
- Create: `artifacts/complex-minwon/_lib/compare/lib/paths.mjs`
- Create: `artifacts/complex-minwon/_lib/compare/lib/io.mjs`
- Test: `artifacts/complex-minwon/_lib/compare/test/io.test.mjs`

- [ ] **Step 1: package.json과 paths.mjs**

`artifacts/complex-minwon/_lib/compare/package.json`:
```json
{ "name": "complex-minwon-compare", "private": true, "type": "module",
  "scripts": { "test": "node --test test/" } }
```

`lib/paths.mjs`:
```js
// 절대경로 한 곳. ROOT = 저장소 루트(이 파일에서 4단계 위).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const COMPARE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ROOT = path.resolve(COMPARE, '..', '..', '..', '..');
export const OUT = path.join(ROOT, 'artifacts', 'complex-minwon', '04-deemed-bundle');
export const OUT_COMPARE = path.join(OUT, 'compare');
export const CACHE = path.join(COMPARE, '.cache');
```

- [ ] **Step 2: 실패하는 테스트**

`test/io.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson, sha1, cachePath } from '../lib/io.mjs';

test('writeJson then readJson round-trips with trailing newline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-'));
  const f = path.join(dir, 'a', 'b.json');
  writeJson(f, { x: 1, y: ['가'] });
  assert.equal(fs.readFileSync(f, 'utf8').endsWith('\n'), true);
  assert.deepEqual(readJson(f), { x: 1, y: ['가'] });
});

test('sha1 is stable for equal objects regardless of key order', () => {
  assert.equal(sha1({ a: 1, b: 2 }), sha1({ b: 2, a: 1 }));
  assert.notEqual(sha1({ a: 1 }), sha1({ a: 2 }));
  assert.match(sha1('x'), /^[0-9a-f]{40}$/);
});

test('cachePath puts stage and hash under CACHE dir', () => {
  const p = cachePath('extract', 'abc');
  assert.match(p, /\.cache\/extract\/abc\.json$/);
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd artifacts/complex-minwon/_lib/compare && node --test test/io.test.mjs`
Expected: FAIL — `Cannot find module '../lib/io.mjs'`

- [ ] **Step 4: 구현**

`lib/io.mjs`:
```js
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CACHE } from './paths.mjs';

export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

export function writeJson(f, data) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
}

// 키 순서에 영향받지 않는 해시. 캐시 키와 "입력이 바뀌었나" 판정에 쓴다.
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export const sha1 = (v) => crypto.createHash('sha1').update(canonical(v)).digest('hex');

export const cachePath = (stage, hash) => path.join(CACHE, stage, `${hash}.json`);
```

- [ ] **Step 5: 통과 확인**

Run: `node --test test/io.test.mjs`
Expected: `# pass 3`

- [ ] **Step 6: .gitignore와 커밋**

`artifacts/complex-minwon/_lib/compare/.gitignore`:
```
.cache/
```

```bash
cd ~/korea100
git add artifacts/complex-minwon/_lib/compare/package.json artifacts/complex-minwon/_lib/compare/.gitignore artifacts/complex-minwon/_lib/compare/lib/paths.mjs artifacts/complex-minwon/_lib/compare/lib/io.mjs artifacts/complex-minwon/_lib/compare/test/io.test.mjs
git commit -m "feat(compare): 비교대조 엔진 스캐폴드 + io 헬퍼"
```

---

### Task 2: 가짜 claude + claude -p 래퍼(캐시·재시도)

**Files:**
- Create: `artifacts/complex-minwon/_lib/compare/test/fake-claude.mjs`
- Create: `artifacts/complex-minwon/_lib/compare/lib/claude.mjs`
- Test: `artifacts/complex-minwon/_lib/compare/test/claude.test.mjs`

배경: 저장소 관례(`web/scripts/discover-institution-candidates.mjs`)는 `execFileSync("claude", ["-p", prompt])`로 부르고 응답에서 첫 `{`부터 마지막 `}`까지를 JSON으로 파싱한다. 여기서는 그 방식을 함수로 감싸고, 환경변수 `COMPARE_CLAUDE_BIN`으로 실행 파일을 바꿀 수 있게 해 테스트에서 가짜를 쓴다.

- [ ] **Step 1: 가짜 claude**

`test/fake-claude.mjs` — 프롬프트 안의 마커 `@@FIXTURE:<name>@@`를 찾아 `test/fixtures/claude/<name>.json`을 stdout에 낸다. 마커가 없으면 프롬프트 안의 `@@ECHO:` 뒤 JSON을 그대로 낸다. `@@FAIL@@`가 있으면 "not json"을 내서 파싱 실패를 흉내낸다. 호출 횟수는 `COMPARE_FAKE_LOG` 파일에 한 줄씩 남긴다.
```js
#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const prompt = process.argv[process.argv.indexOf('-p') + 1] ?? '';
if (process.env.COMPARE_FAKE_LOG) fs.appendFileSync(process.env.COMPARE_FAKE_LOG, prompt.slice(0, 60).replace(/\n/g, ' ') + '\n');
if (prompt.includes('@@FAIL@@')) { process.stdout.write('not json at all'); process.exit(0); }
const m = prompt.match(/@@FIXTURE:([\w-]+)@@/);
if (m) { process.stdout.write('앞말 ' + fs.readFileSync(path.join(here, 'fixtures', 'claude', m[1] + '.json'), 'utf8') + ' 뒷말'); process.exit(0); }
const e = prompt.indexOf('@@ECHO:');
if (e >= 0) { process.stdout.write(prompt.slice(e + 7)); process.exit(0); }
process.stdout.write('{"error":"no fixture marker"}');
```
`chmod +x test/fake-claude.mjs`

- [ ] **Step 2: 실패하는 테스트**

`test/claude.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callJson } from '../lib/claude.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.COMPARE_CLAUDE_BIN = path.join(here, 'fake-claude.mjs');

function withLog(fn) {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cl-')), 'log');
  process.env.COMPARE_FAKE_LOG = log;
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-'));
  return fn({ log, cache, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).length : 0) });
}

test('parses the JSON object embedded in the reply', () => withLog(({ cache }) => {
  const r = callJson('@@ECHO:{"a":1}', { stage: 't', cacheDir: cache });
  assert.deepEqual(r.data, { a: 1 });
  assert.equal(r.cached, false);
}));

test('second identical call is served from cache without invoking claude', () => withLog(({ cache, calls }) => {
  callJson('@@ECHO:{"b":2}', { stage: 't', cacheDir: cache });
  const r = callJson('@@ECHO:{"b":2}', { stage: 't', cacheDir: cache });
  assert.equal(r.cached, true);
  assert.equal(calls(), 1);
}));

test('fresh:true bypasses the cache', () => withLog(({ cache, calls }) => {
  callJson('@@ECHO:{"c":3}', { stage: 't', cacheDir: cache });
  callJson('@@ECHO:{"c":3}', { stage: 't', cacheDir: cache, fresh: true });
  assert.equal(calls(), 2);
}));

test('retries once on parse failure then returns failed:true', () => withLog(({ cache, calls }) => {
  const r = callJson('@@FAIL@@', { stage: 't', cacheDir: cache });
  assert.equal(r.failed, true);
  assert.equal(r.data, null);
  assert.equal(calls(), 2);
}));

test('cache record keeps prompt hash and raw reply', () => withLog(({ cache }) => {
  const r = callJson('@@ECHO:{"d":4}', { stage: 't', cacheDir: cache });
  const rec = JSON.parse(fs.readFileSync(r.cacheFile, 'utf8'));
  assert.equal(rec.promptSha1.length, 40);
  assert.match(rec.raw, /"d":4/);
}));
```

- [ ] **Step 3: 실패 확인**

Run: `node --test test/claude.test.mjs`
Expected: FAIL — `Cannot find module '../lib/claude.mjs'`

- [ ] **Step 4: 구현**

`lib/claude.mjs`:
```js
// claude -p 호출 한 곳. 입력 해시 캐시 · JSON 추출 · 파싱 실패 시 1회 재시도.
// 실패는 예외가 아니라 {failed:true}로 돌려준다. 지어내서 채우는 일은 호출자가 하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha1, cachePath } from './io.mjs';

const BIN = () => process.env.COMPARE_CLAUDE_BIN || 'claude';

function extractJson(raw) {
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(raw.slice(s, e + 1)); } catch { return null; }
}

function invoke(prompt) {
  return execFileSync(BIN(), ['-p', prompt], { encoding: 'utf8', timeout: 240_000, maxBuffer: 16 * 1024 * 1024 });
}

export function callJson(prompt, { stage, cacheDir = null, fresh = false } = {}) {
  const promptSha1 = sha1(prompt);
  const file = cacheDir ? path.join(cacheDir, stage, `${promptSha1}.json`) : cachePath(stage, promptSha1);
  if (!fresh && fs.existsSync(file)) {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!rec.failed) return { data: rec.data, cached: true, failed: false, cacheFile: file };
  }
  let raw = '', data = null, attempts = 0;
  while (attempts < 2 && data === null) {
    attempts++;
    try { raw = invoke(prompt); } catch (e) { raw = `<<exec error: ${e.message}>>`; }
    data = extractJson(raw);
  }
  const rec = { stage, promptSha1, at: new Date().toISOString(), attempts, failed: data === null, raw, data };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec, null, 2) + '\n');
  return { data, cached: false, failed: data === null, cacheFile: file };
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test test/claude.test.mjs`
Expected: `# pass 5`

- [ ] **Step 6: 커밋**

```bash
cd ~/korea100
git add artifacts/complex-minwon/_lib/compare/lib/claude.mjs artifacts/complex-minwon/_lib/compare/test/fake-claude.mjs artifacts/complex-minwon/_lib/compare/test/claude.test.mjs
git commit -m "feat(compare): claude -p 래퍼 — 해시 캐시·JSON 추출·1회 재시도, 테스트용 가짜 claude"
```

---
### Task 3: 픽스처 + 로더 (`load.mjs`)

**Files:**
- Create: `artifacts/complex-minwon/_lib/compare/test/fixtures/project.json`
- Create: `artifacts/complex-minwon/_lib/compare/test/fixtures/path.json`
- Create: `artifacts/complex-minwon/_lib/compare/test/fixtures/institutions/eia-mini.json`
- Create: `artifacts/complex-minwon/_lib/compare/test/fixtures/institutions/traffic-mini.json`
- Create: `artifacts/complex-minwon/_lib/compare/test/fixtures/institutions/airport-mini.json`
- Create: `artifacts/complex-minwon/_lib/compare/load.mjs`
- Test: `artifacts/complex-minwon/_lib/compare/test/load.test.mjs`

배경: 실제 데이터는 `web/data/mega-projects/projects/<id>.json`(마일스톤 `nodes[]`, 각각 `templateRefs[{institution, nodeIds?}]`, `stage`)과 `web/data/institutions/<slug>.json`(`process.nodes[]`: id·name·actor·action·input_documents·output_documents·deadline·legal_basis[{law,article,text}]·type, `process.edges[]`: {id,source,target,type,label})이다. `nodeIds`가 있으면 그 노드만, 없으면 제도 전체를 편입한다(`web/tools/gen-warroom.mjs` 152~211행과 같은 규칙). 크리티컬은 `web/public/warroom/p/<id>/path.json`의 `scenarios[0].critical`, 착수일은 `scenarios[0].eta[ms][0]`.

픽스처는 "같은 지표(교통)를 두 법이 따로 심사"(A축 겹침 1개) + "같은 기관에 협의 2회"(C축 겹침 1개) + 무관한 군공항(음성 대조군)을 담는다.

- [ ] **Step 1: 픽스처 작성**

`test/fixtures/project.json`:
```json
{ "id": "fixture-project", "name": "픽스처 사업",
  "stages": [{ "id": "G0", "label": "계획" }, { "id": "G1", "label": "협의" }, { "id": "G2", "label": "이전" }],
  "nodes": [
    { "id": "M1", "name": "환경영향평가 협의", "stage": "G1", "authority": "기후에너지환경부",
      "requires": [], "produces": ["eia.done"],
      "templateRefs": [{ "institution": "eia-mini" }] },
    { "id": "M2", "name": "교통영향평가 심의", "stage": "G1", "authority": "광주특별시",
      "requires": [{ "artifact": "eia.done", "relation": "finish_to_start", "strength": "hard" }], "produces": ["traffic.done"],
      "templateRefs": [{ "institution": "traffic-mini", "nodeIds": ["P01", "P02", "P03"] }] },
    { "id": "M9", "name": "군공항 이전부지 선정", "stage": "G2", "authority": "국방부",
      "requires": [], "produces": ["airport.site"],
      "templateRefs": [{ "institution": "airport-mini" }] }
  ] }
```

`test/fixtures/path.json`:
```json
{ "scenarios": [{ "totalDays": 300, "end": "M2", "critical": ["M1", "M2"],
  "eta": { "M1": [0, 100], "M2": [100, 300], "M9": [0, 50] } }] }
```

`test/fixtures/institutions/eia-mini.json`:
```json
{ "slug": "eia-mini", "name": "환경영향평가 협의(미니)", "process": { "nodes": [
  { "id": "P01", "name": "평가서 작성·협의 요청", "actor": "사업자", "type": "task", "deadline": null,
    "action": "사업자는 환경영향평가서를 작성해 승인기관을 거쳐 협의를 요청한다. 교통량·대기·수질 항목을 포함한다.",
    "input_documents": [], "output_documents": ["환경영향평가서"],
    "legal_basis": [{ "law": "환경영향평가법", "article": "제27조제1항", "text": "승인기관장등은 협의를 요청하여야 한다." }] },
  { "id": "P02", "name": "협의 검토·의견 통보", "actor": "기후에너지환경부장관", "type": "task", "deadline": "45일",
    "action": "환경부장관은 평가서를 검토해 협의 의견을 통보한다. 교통량 증가에 따른 대기질 영향을 심사한다.",
    "input_documents": [], "output_documents": ["협의 의견"],
    "legal_basis": [{ "law": "환경영향평가법", "article": "제29조제1항", "text": "협의 의견을 통보하여야 한다." }] },
  { "id": "P03", "name": "보완 요구·재협의", "actor": "기후에너지환경부", "type": "task", "deadline": null,
    "action": "미비하면 보완을 요구하고 다시 협의한다.",
    "input_documents": [], "output_documents": ["보완 요구서"],
    "legal_basis": [{ "law": "환경영향평가법", "article": "제30조", "text": "보완을 요구할 수 있다." }] }
 ], "edges": [
  { "id": "E01", "source": "P01", "target": "P02", "type": "sequence", "label": "" },
  { "id": "E02", "source": "P02", "target": "P03", "type": "conditional", "label": "미비" }
 ] } }
```

`test/fixtures/institutions/traffic-mini.json`:
```json
{ "slug": "traffic-mini", "name": "교통영향평가 심의(미니)", "process": { "nodes": [
  { "id": "P01", "name": "교통영향평가서 제출", "actor": "사업시행자", "type": "task", "deadline": null,
    "action": "사업시행자는 교통영향평가서를 작성해 승인관청에 제출한다. 발생 교통량과 주변 도로 용량을 산정한다.",
    "input_documents": [], "output_documents": ["교통영향평가서"],
    "legal_basis": [{ "law": "도시교통정비 촉진법", "article": "제16조제1항", "text": "교통영향평가를 실시하여야 한다." }] },
  { "id": "P02", "name": "교통영향평가 심의", "actor": "교통영향평가심의위원회", "type": "task", "deadline": "30일",
    "action": "위원회가 교통량 산정과 개선대책을 심의한다.",
    "input_documents": [], "output_documents": ["심의 결과"],
    "legal_basis": [{ "law": "도시교통정비 촉진법", "article": "제17조제1항", "text": "심의를 거쳐야 한다." }] },
  { "id": "P03", "name": "환경부 대기 항목 재협의", "actor": "기후에너지환경부장관", "type": "task", "deadline": null,
    "action": "교통 개선대책이 대기질에 미치는 영향을 환경부와 다시 협의한다.",
    "input_documents": [], "output_documents": ["협의 회신"],
    "legal_basis": [{ "law": "도시교통정비 촉진법", "article": "제18조", "text": "관계 기관과 협의한다." }] },
  { "id": "P04", "name": "미편입 노드", "actor": "사업시행자", "type": "notice", "deadline": null,
    "action": "이 노드는 nodeIds에 없어 편입되지 않아야 한다.", "input_documents": [], "output_documents": ["없음"],
    "legal_basis": [{ "law": "도시교통정비 촉진법", "article": "제19조", "text": "…" }] }
 ], "edges": [
  { "id": "E01", "source": "P01", "target": "P02", "type": "sequence", "label": "" },
  { "id": "E02", "source": "P02", "target": "P03", "type": "sequence", "label": "" },
  { "id": "E03", "source": "P03", "target": "P04", "type": "sequence", "label": "" }
 ] } }
```

`test/fixtures/institutions/airport-mini.json`:
```json
{ "slug": "airport-mini", "name": "군공항 이전부지 선정(미니)", "process": { "nodes": [
  { "id": "P01", "name": "주민투표", "actor": "이전부지 지자체", "type": "task", "deadline": null,
    "action": "이전 후보지 주민투표를 실시한다.", "input_documents": [], "output_documents": ["투표 결과"],
    "legal_basis": [{ "law": "군공항 이전 및 지원에 관한 특별법", "article": "제8조제3항", "text": "주민투표를 실시한다." }] },
  { "id": "P02", "name": "이전부지 선정", "actor": "국방부장관", "type": "task", "deadline": null,
    "action": "선정위원회 심의를 거쳐 이전부지를 선정한다.", "input_documents": [], "output_documents": ["선정 고시"],
    "legal_basis": [{ "law": "군공항 이전 및 지원에 관한 특별법", "article": "제8조제4항", "text": "이전부지를 선정한다." }] }
 ], "edges": [{ "id": "E01", "source": "P01", "target": "P02", "type": "sequence", "label": "" }] } }
```

- [ ] **Step 2: 실패하는 테스트**

`test/load.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProcedures } from '../load.mjs';

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const opts = { projectFile: path.join(FX, 'project.json'), pathFile: path.join(FX, 'path.json'), institutionsDir: path.join(FX, 'institutions') };

test('flattens milestones × institutions × nodes, honouring nodeIds', () => {
  const procs = loadProcedures({ ...opts, milestones: ['M1', 'M2', 'M9'] });
  assert.equal(procs.length, 3 + 3 + 2);
  assert.ok(!procs.some((p) => p.nodeId === 'P04'), 'P04 is outside nodeIds and must not be loaded');
});

test('pid, ids and legal are copied verbatim', () => {
  const [p] = loadProcedures({ ...opts, milestones: ['M2'] });
  assert.equal(p.pid, 'M2:traffic-mini:P01');
  assert.equal(p.ms, 'M2'); assert.equal(p.institution, 'traffic-mini'); assert.equal(p.nodeId, 'P01');
  assert.deepEqual(p.legal, [{ law: '도시교통정비 촉진법', article: '제16조제1항', text: '교통영향평가를 실시하여야 한다.' }]);
  assert.equal(p.actorRaw, '사업시행자');
  assert.deepEqual(p.outputs, ['교통영향평가서']);
  assert.equal(p.deadlineRaw, null);
});

test('gateIndex, msOrder and onCritical come from stages and path.json', () => {
  const procs = loadProcedures({ ...opts, milestones: ['M1', 'M2', 'M9'] });
  const by = (ms) => procs.find((p) => p.ms === ms);
  assert.equal(by('M1').gateIndex, 1); assert.equal(by('M9').gateIndex, 2);
  assert.equal(by('M1').onCritical, true); assert.equal(by('M9').onCritical, false);
  // msOrder: eta start asc → M1(0), M9(0) tie → id order M1 < M9; M2(100)
  assert.equal(by('M1').msOrder, 0); assert.equal(by('M9').msOrder, 1); assert.equal(by('M2').msOrder, 2);
});

test('milestones filter defaults to all and unknown ids throw', () => {
  assert.equal(loadProcedures(opts).length, 8);
  assert.throws(() => loadProcedures({ ...opts, milestones: ['NOPE'] }), /unknown milestone NOPE/);
});

test('institutions option loads a standalone institution as pseudo-milestone', () => {
  const procs = loadProcedures({ ...opts, institutions: ['traffic-mini'] });
  assert.equal(procs.length, 4);
  assert.equal(procs[0].ms, 'INST:traffic-mini');
  assert.equal(procs[0].onCritical, false);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test test/load.test.mjs`
Expected: FAIL — `Cannot find module '../load.mjs'`

- [ ] **Step 4: 구현**

`load.mjs`:
```js
// 0단계 로더. 워룸 프로젝트 JSON + 제도 템플릿 → 공용 절차 레코드 배열.
// 편입 규칙은 web/tools/gen-warroom.mjs와 같다: nodeIds가 있으면 그 노드만, 없으면 제도 전체.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { ROOT, OUT_COMPARE } from './lib/paths.mjs';

const DEFAULT_PROJECT = 'gwangju-semiconductor-cluster';
export const BUNDLE = ['N36', 'N09', 'N11', 'N12', 'N38', 'N39', 'N40', 'N13', 'N14', 'N37', 'N10', 'N15'];

function record(ms, gateIndex, msOrder, onCritical, slug, inst, n) {
  return {
    pid: `${ms.id}:${slug}:${n.id}`,
    ms: ms.id, msName: ms.name, stage: ms.stage ?? null, gateIndex, msOrder,
    institution: slug, institutionName: inst.name ?? slug,
    nodeId: n.id, name: n.name, action: n.action ?? '', actorRaw: n.actor ?? n.lane ?? ms.authority ?? '',
    type: n.type ?? 'task', outputs: n.output_documents ?? [], inputs: n.input_documents ?? [],
    deadlineRaw: n.deadline ?? null,
    legal: (n.legal_basis ?? []).map((b) => ({ law: b.law, article: b.article, text: b.text ?? '' })),
    onCritical,
  };
}

export function loadProcedures({
  projectFile = path.join(ROOT, 'web/data/mega-projects/projects', `${DEFAULT_PROJECT}.json`),
  pathFile = path.join(ROOT, 'web/public/warroom/p', DEFAULT_PROJECT, 'path.json'),
  institutionsDir = path.join(ROOT, 'web/data/institutions'),
  milestones = null, institutions = null,
} = {}) {
  const project = readJson(projectFile);
  const pathJson = fs.existsSync(pathFile) ? readJson(pathFile) : { scenarios: [{ critical: [], eta: {} }] };
  const s0 = pathJson.scenarios?.[0] ?? { critical: [], eta: {} };
  const critical = new Set(s0.critical ?? []);
  const stageIdx = new Map((project.stages ?? []).map((s, i) => [s.id, i]));
  const instCache = new Map();
  const inst = (slug) => {
    if (!instCache.has(slug)) {
      const f = path.join(institutionsDir, `${slug}.json`);
      instCache.set(slug, fs.existsSync(f) ? readJson(f) : null);
    }
    return instCache.get(slug);
  };

  const out = [];
  if (institutions) {
    for (const slug of institutions) {
      const t = inst(slug);
      if (!t) throw new Error(`unknown institution ${slug}`);
      const ms = { id: `INST:${slug}`, name: t.name ?? slug, stage: null, authority: '' };
      for (const n of t.process?.nodes ?? []) out.push(record(ms, 0, 0, false, slug, t, n));
    }
    return out;
  }

  const byId = new Map(project.nodes.map((n) => [n.id, n]));
  const wanted = milestones ?? project.nodes.map((n) => n.id);
  for (const id of wanted) if (!byId.has(id)) throw new Error(`unknown milestone ${id}`);
  const ordered = [...wanted].sort((a, b) => {
    const ea = s0.eta?.[a]?.[0] ?? Number.MAX_SAFE_INTEGER, eb = s0.eta?.[b]?.[0] ?? Number.MAX_SAFE_INTEGER;
    return ea - eb || (a < b ? -1 : a > b ? 1 : 0);
  });
  ordered.forEach((id, msOrder) => {
    const ms = byId.get(id);
    const gateIndex = stageIdx.get(ms.stage) ?? 0;
    const onCritical = critical.has(id);
    for (const ref of ms.templateRefs ?? []) {
      const t = inst(ref.institution);
      if (!t) continue; // gen-warroom과 같이 템플릿 없는 참조는 건너뛴다
      const nodes = t.process?.nodes ?? [];
      const sel = ref.nodeIds ? nodes.filter((n) => ref.nodeIds.includes(n.id)) : nodes;
      for (const n of sel) out.push(record(ms, gateIndex, msOrder, onCritical, ref.institution, t, n));
    }
  });
  return out;
}

// CLI: node load.mjs [--project id] [--milestones N36,N09] [--institutions a,b] [--out file]
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
  const project = arg('--project', DEFAULT_PROJECT);
  const opts = {
    projectFile: path.join(ROOT, 'web/data/mega-projects/projects', `${project}.json`),
    pathFile: path.join(ROOT, 'web/public/warroom/p', project, 'path.json'),
  };
  const msArg = arg('--milestones'); const instArg = arg('--institutions');
  if (instArg) opts.institutions = instArg.split(',');
  else opts.milestones = msArg === 'all' ? null : (msArg ? msArg.split(',') : BUNDLE);
  const procs = loadProcedures(opts);
  const outFile = arg('--out', path.join(OUT_COMPARE, 'procedures.json'));
  writeJson(outFile, procs);
  const laws = new Set(procs.flatMap((p) => p.legal.map((l) => l.law)));
  console.log(`procedures ${procs.length} · milestones ${new Set(procs.map((p) => p.ms)).size} · institutions ${new Set(procs.map((p) => p.institution)).size} · laws ${laws.size} → ${outFile}`);
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test test/load.test.mjs`
Expected: `# pass 5`

- [ ] **Step 6: 실데이터 스모크(AI 없음)**

Run: `node load.mjs --out /tmp/claude-smoke-procedures.json`
Expected: `procedures 222 · milestones 12 · institutions 21 · laws <N> → …` (222·12·21은 스펙 2절 수치와 같아야 한다. 다르면 편입 규칙을 gen-warroom.mjs와 다시 대조한다.)

- [ ] **Step 7: 커밋**

```bash
cd ~/korea100
git add artifacts/complex-minwon/_lib/compare/load.mjs artifacts/complex-minwon/_lib/compare/test/load.test.mjs artifacts/complex-minwon/_lib/compare/test/fixtures
git commit -m "feat(compare): 로더 — 워룸 마일스톤×제도 절차를 공용 레코드로, 픽스처 3제도"
```

---

### Task 4: 코드표 3종 + 기관 정규화 (`lib/normalize.mjs`)

**Files:**
- Create: `artifacts/complex-minwon/_lib/compare/orgs.json`
- Create: `artifacts/complex-minwon/_lib/compare/subjects.json`
- Create: `artifacts/complex-minwon/_lib/compare/preserve.json`
- Create: `artifacts/complex-minwon/_lib/compare/lib/normalize.mjs`
- Test: `artifacts/complex-minwon/_lib/compare/test/normalize.test.mjs`

배경: 덩어리 222건의 actor 문자열 65종은 (a) 실제 기관("기후에너지환경부장관"), (b) 역할명("산업단지 지정권자", "관계 행정기관"), (c) 민원인("사업자", "사업시행자"), (d) 복합("기후에너지환경부·광주특별시")으로 나뉜다. 원칙(gen-warroom.mjs actor axis와 동일): **역할명 뒤의 기관을 추측하지 않는다.** 역할은 역할 코드로 둔다. 복합은 `·`로 나눠 첫 항을 org로 삼고 나머지는 `also`에 남긴다.

- [ ] **Step 1: 코드표 작성**

`orgs.json` — `{ "orgs": { code: { label, aliases[] } }, "roles": { code: { label, aliases[] } }, "applicants": [aliases] }`:
```json
{ "orgs": {
  "moef-climate": { "label": "기후에너지환경부", "aliases": ["기후에너지환경부", "기후에너지환경부장관", "환경부", "환경부장관", "영산강유역환경청"] },
  "motie": { "label": "산업통상부", "aliases": ["산업통상부", "산업통상부장관"] },
  "molit": { "label": "국토교통부", "aliases": ["국토교통부", "국토교통부장관"] },
  "mois": { "label": "행정안전부", "aliases": ["행정안전부", "행정안전부장관", "행정안전부·전문검토기관"] },
  "mafra": { "label": "농림축산식품부", "aliases": ["농림축산식품부장관", "농림축산식품부", "농림축산식품부장관·시장 등"] },
  "kfs": { "label": "산림청", "aliases": ["산림청", "산림청·지자체"] },
  "khs": { "label": "국가유산청", "aliases": ["국가유산청", "국가유산청장"] },
  "mof": { "label": "해양수산부", "aliases": ["해양수산부·관리청", "해양수산부"] },
  "mnd": { "label": "국방부", "aliases": ["국방부", "국방부장관"] },
  "pmo": { "label": "국무총리", "aliases": ["국무총리"] },
  "gwangju": { "label": "광주특별시", "aliases": ["광주특별시", "광주특별시·관할 구청", "광주특별시 경관부서", "광주특별시·부과징수기관", "광주특별시·사업시행자", "기후에너지환경부·광주특별시", "시·도지사", "시장·군수·구청장", "지방자치단체", "지방자치단체의 장", "이전부지 지자체"] },
  "cmte-traffic": { "label": "교통영향평가심의위원회", "aliases": ["교통영향평가심의위원회"] },
  "cmte-metro": { "label": "대도시권광역교통위원회", "aliases": ["대도시권광역교통위원회"] },
  "cmte-indcomplex": { "label": "산업단지계획심의위원회", "aliases": ["산업단지계획심의위원회"] },
  "cmte-landscape": { "label": "광주특별시 경관위원회", "aliases": ["광주특별시 경관위원회"] },
  "cmte-urban": { "label": "지방도시계획위원회", "aliases": ["지방도시계획위원회"] },
  "energy-agency": { "label": "에너지전문기관", "aliases": ["에너지전문기관"] },
  "survey-agency": { "label": "조사기관", "aliases": ["조사기관", "타당성조사"] }
 },
 "roles": {
  "designator": { "label": "산업단지 지정권자", "aliases": ["지정권자", "산업단지 지정권자", "주된 인허가 행정청", "사업 인허가기관", "승인기관", "승인기관의 장"] },
  "related-authority": { "label": "관계 행정기관", "aliases": ["관계 행정기관", "관련 인허가 행정청", "관계기관", "환경·관계기관", "관계 중앙행정기관의 장", "중앙행정기관·지자체·공기업의 장", "주무부장관·지방자치단체의 장", "관계 지방자치단체·교통기관", "공공시설 관리청"] },
  "system": { "label": "시스템", "aliases": ["지자체 인허가시스템·토지이음"] }
 },
 "applicants": ["사업자", "사업시행자", "신청인", "신청인(당사자)", "전용하려는 자", "전용한 자", "토지소유자·주민", "토지소유자·개발사업자", "민간기업·개발사업자", "사업시행자·계획수립기관", "사업주관자·사업시행자", "사업시행자·건축주", "사업시행자·납부의무자", "입주기업", "제안자(지자체·민간)", "산주·주민", "어민·권리자", "발견자·소유자·점유자", "경관·건축 설계자"]
}
```
(위 목록은 Task 3 Step 6 스모크의 65개 문자열을 손으로 분류한 것. 실행 후 `unknown-orgs.json`에 남는 것은 여기 추가한다.)

`subjects.json`:
```json
{ "subjects": {
  "traffic": "교통·교통량·도로용량", "drainage": "재해·배수·침수·우수", "air": "대기질", "water": "수질·폐수·하천",
  "noise": "소음·진동", "energy": "에너지 사용·수급·집단에너지", "landform": "토지형질변경·절토·성토",
  "farmland": "농지 전용", "forest": "산지 전용·입목", "publicwater": "공유수면 점용·매립", "heritage": "국가유산·매장유산",
  "landscape": "경관·건축 외관", "ecosystem": "생태·자연환경·보전", "safety": "안전·위험물·재난", "watersupply": "용수·상수",
  "sewage": "하수·오수", "waste": "폐기물", "ghg": "온실가스·기후", "landuse": "입지·용도지역·도시계획", "compensation": "보상·수용·권리"
 } }
```

`preserve.json` — 보존 절차. `match`는 절차 `name`이 패턴에 걸리면 표시하고, `judge`는 해당 절차가 든 쌍에 drop을 절대 허용하지 않으며 카드 kind를 `allowed`로 제한한다:
```json
{ "preserve": [
  { "id": "eia-main", "pattern": "환경영향평가 본안|본안 검토|협의 완료", "law": "환경영향평가법", "allowed": ["shorten", "automate"] },
  { "id": "heritage-scope", "pattern": "영향진단 대상|대상 여부|대상 판정", "law": "국가유산영향진단법", "allowed": ["shorten", "automate"] },
  { "id": "airport-vote", "pattern": "주민투표", "law": "군공항 이전 및 지원에 관한 특별법", "allowed": [] }
 ] }
```

- [ ] **Step 2: 실패하는 테스트**

`test/normalize.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrg, loadOrgs, preserveHit, loadPreserve } from '../lib/normalize.mjs';

const orgs = loadOrgs();

test('alias resolves to org code and label', () => {
  assert.deepEqual(normalizeOrg('기후에너지환경부장관', orgs), { org: 'moef-climate', label: '기후에너지환경부', kind: 'org', also: [], unknown: false });
});

test('role names stay roles, never guessed into a ministry', () => {
  const r = normalizeOrg('산업단지 지정권자', orgs);
  assert.equal(r.kind, 'role'); assert.equal(r.org, 'designator'); assert.equal(r.unknown, false);
});

test('applicants map to applicant kind', () => {
  assert.equal(normalizeOrg('사업시행자', orgs).kind, 'applicant');
  assert.equal(normalizeOrg('사업시행자', orgs).org, 'applicant');
});

test('compound actor takes the first resolvable part and records the rest', () => {
  const r = normalizeOrg('기후에너지환경부·광주특별시', orgs); // exact alias exists → gwangju bucket wins
  assert.equal(r.unknown, false);
  const r2 = normalizeOrg('산림청·전문기관', orgs); // no exact alias; split on ·
  assert.equal(r2.org, 'kfs'); assert.deepEqual(r2.also, ['전문기관']);
});

test('unknown strings are kept verbatim and flagged', () => {
  const r = normalizeOrg('아무기관', orgs);
  assert.deepEqual(r, { org: '아무기관', label: '아무기관', kind: 'unknown', also: [], unknown: true });
});

test('preserveHit matches by name pattern and law', () => {
  const pv = loadPreserve();
  const hit = preserveHit({ name: '환경영향평가 본안 검토·협의 완료', legal: [{ law: '환경영향평가법', article: '제29조' }] }, pv);
  assert.equal(hit?.id, 'eia-main');
  assert.equal(preserveHit({ name: '주민투표', legal: [{ law: '농지법', article: '제1조' }] }, pv), null);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test test/normalize.test.mjs`
Expected: FAIL — `Cannot find module '../lib/normalize.mjs'`

- [ ] **Step 4: 구현**

`lib/normalize.mjs`:
```js
import path from 'node:path';
import { readJson } from './io.mjs';
import { COMPARE } from './paths.mjs';

export const loadOrgs = () => readJson(path.join(COMPARE, 'orgs.json'));
export const loadSubjects = () => readJson(path.join(COMPARE, 'subjects.json')).subjects;
export const loadPreserve = () => readJson(path.join(COMPARE, 'preserve.json')).preserve;

function lookup(raw, orgs) {
  for (const [code, o] of Object.entries(orgs.orgs)) if (o.aliases.includes(raw)) return { org: code, label: o.label, kind: 'org' };
  for (const [code, r] of Object.entries(orgs.roles)) if (r.aliases.includes(raw)) return { org: code, label: r.label, kind: 'role' };
  if (orgs.applicants.includes(raw)) return { org: 'applicant', label: '신청인·사업시행자', kind: 'applicant' };
  return null;
}

// 정확한 별칭 → 그대로. 없으면 '·'로 나눠 첫 해석 가능한 항을 쓰고 나머지는 also에.
// 어느 것도 안 되면 원문 유지 + unknown. 역할명을 기관으로 추측하지 않는다.
export function normalizeOrg(raw, orgs) {
  const s = (raw ?? '').trim();
  const exact = lookup(s, orgs);
  if (exact) return { ...exact, also: [], unknown: false };
  const parts = s.split('·').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    for (let i = 0; i < parts.length; i++) {
      const hit = lookup(parts[i], orgs);
      if (hit) return { ...hit, also: parts.filter((_, j) => j !== i), unknown: false };
    }
  }
  return { org: s, label: s, kind: 'unknown', also: [], unknown: true };
}

export function preserveHit(proc, preserve) {
  for (const p of preserve) {
    const re = new RegExp(p.pattern);
    if (re.test(proc.name ?? '') && (proc.legal ?? []).some((l) => l.law === p.law)) return p;
  }
  return null;
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test test/normalize.test.mjs`
Expected: `# pass 6`

- [ ] **Step 6: 실데이터 커버리지 확인**

Run:
```bash
node -e "
import('./load.mjs').then(async ({loadProcedures})=>{const {normalizeOrg,loadOrgs}=await import('./lib/normalize.mjs');const o=loadOrgs();const u=new Set();for(const p of loadProcedures()){const r=normalizeOrg(p.actorRaw,o);if(r.unknown)u.add(p.actorRaw);}console.log('unknown',[...u]);})"
```
Expected: `unknown []` 또는 극소수. 남는 문자열은 `orgs.json`의 알맞은 자리(기관/역할/민원인)에 추가하고 다시 돌린다. **역할명은 roles에만** 넣는다.

- [ ] **Step 7: 커밋**

```bash
cd ~/korea100
git add artifacts/complex-minwon/_lib/compare/orgs.json artifacts/complex-minwon/_lib/compare/subjects.json artifacts/complex-minwon/_lib/compare/preserve.json artifacts/complex-minwon/_lib/compare/lib/normalize.mjs artifacts/complex-minwon/_lib/compare/test/normalize.test.mjs
git commit -m "feat(compare): 기관·지표·보존 코드표 + 기관 정규화(역할명은 추측하지 않음)"
```

---
### Task 5: 추출 (`extract.mjs`) — 절차당 AI 1회, 조문은 복사만

**Files:**
- Create: `artifacts/complex-minwon/_lib/compare/extract.mjs`
- Create: `artifacts/complex-minwon/_lib/compare/test/fixtures/claude/extract-ok.json`
- Create: `artifacts/complex-minwon/_lib/compare/test/fixtures/claude/extract-bad-evidence.json`
- Test: `artifacts/complex-minwon/_lib/compare/test/extract.test.mjs`

- [ ] **Step 1: 가짜 응답 픽스처**

`test/fixtures/claude/extract-ok.json`:
```json
{ "orgRole": "consultee", "act": "consult", "subjects": ["traffic", "air", "other:도로점용"],
  "deemed": { "is": false, "basis": null }, "clock": { "days": 45, "basis": "환경영향평가법 제29조제1항", "silentEffect": false },
  "evidence": [{ "law": "환경영향평가법", "article": "제29조제1항" }] }
```
`test/fixtures/claude/extract-bad-evidence.json` (절차에 없는 조문을 인용):
```json
{ "orgRole": "consultee", "act": "consult", "subjects": ["air"],
  "deemed": { "is": false, "basis": null }, "clock": { "days": null, "basis": null, "silentEffect": false },
  "evidence": [{ "law": "환경영향평가법", "article": "제99조" }] }
```

- [ ] **Step 2: 실패하는 테스트**

`test/extract.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildExtractPrompt, validateCard, extractAll } from '../extract.mjs';
import { loadOrgs } from '../lib/normalize.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.COMPARE_CLAUDE_BIN = path.join(here, 'fake-claude.mjs');

const proc = { pid: 'M1:eia-mini:P02', name: '협의 검토·의견 통보', action: '환경부장관은 평가서를 검토해 협의 의견을 통보한다.', actorRaw: '기후에너지환경부장관',
  type: 'task', outputs: ['협의 의견'], deadlineRaw: '45일',
  legal: [{ law: '환경영향평가법', article: '제29조제1항', text: '협의 의견을 통보하여야 한다.' }] };
const subjects = { traffic: '교통', air: '대기질' };

test('prompt carries the procedure, the subject taxonomy and the copy-only rule', () => {
  const p = buildExtractPrompt(proc, subjects);
  assert.match(p, /제29조제1항/); assert.match(p, /traffic/); assert.match(p, /새로 만들지|복사/);
  assert.match(p, /JSON만/);
});

test('validateCard accepts a card whose evidence is a subset of legal and normalises enums', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/claude/extract-ok.json'), 'utf8'));
  const { card, errors } = validateCard(raw, proc, subjects, loadOrgs());
  assert.deepEqual(errors, []);
  assert.equal(card.org, 'moef-climate'); assert.equal(card.orgKind, 'org');
  assert.deepEqual(card.subjects, ['traffic', 'air', 'other:도로점용']);
  assert.deepEqual(card.otherSubjects, ['도로점용']);
  assert.equal(card.extractStatus, 'ok');
});

test('validateCard rejects evidence not present in the procedure', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/claude/extract-bad-evidence.json'), 'utf8'));
  const { errors } = validateCard(raw, proc, subjects, loadOrgs());
  assert.ok(errors.some((e) => /evidence/.test(e)));
});

test('validateCard rejects bad enums and unknown subjects', () => {
  const raw = { orgRole: 'boss', act: 'consult', subjects: ['banana'], deemed: { is: false, basis: null }, clock: { days: null, basis: null, silentEffect: false }, evidence: [] };
  const { errors } = validateCard(raw, proc, subjects, loadOrgs());
  assert.ok(errors.some((e) => /orgRole/.test(e)));
  assert.ok(errors.some((e) => /subject banana/.test(e)));
});

test('extractAll writes ok cards, marks failures, and collects unknown orgs / other subjects', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-'));
  const procs = [
    { ...proc, pid: 'A', _fixture: 'extract-ok' },
    { ...proc, pid: 'B', actorRaw: '이상한기관', _fixture: 'extract-ok' },
    { ...proc, pid: 'C', _fixture: 'FAIL' },
  ];
  const res = extractAll(procs, { subjects, orgs: loadOrgs(), cacheDir: cache,
    promptFor: (p) => (p._fixture === 'FAIL' ? '@@FAIL@@' : `@@FIXTURE:${p._fixture}@@ ${p.pid}`) });
  assert.equal(res.cards.A.extractStatus, 'ok');
  assert.equal(res.cards.C.extractStatus, 'failed');
  assert.deepEqual(res.unknownOrgs, ['이상한기관']);
  assert.deepEqual(res.otherSubjects, [{ label: '도로점용', pids: ['A', 'B'] }]);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test test/extract.test.mjs`
Expected: FAIL — `Cannot find module '../extract.mjs'`

- [ ] **Step 4: 구현**

`extract.mjs`:
```js
// 1단계 추출. 절차 하나 → 구조화 카드 하나. AI는 분류만 하고 조문은 절차 레코드에서 복사만 한다.
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { OUT_COMPARE } from './lib/paths.mjs';
import { callJson } from './lib/claude.mjs';
import { normalizeOrg, loadOrgs, loadSubjects } from './lib/normalize.mjs';

export const ORG_ROLES = ['applicant', 'authority', 'consultee', 'committee'];
export const ACTS = ['apply', 'receive', 'review', 'consult', 'deliberate', 'resolve', 'notice', 'notify', 'supplement'];

export function buildExtractPrompt(proc, subjects) {
  const tax = Object.entries(subjects).map(([k, v]) => `${k}=${v}`).join(', ');
  const legal = proc.legal.map((l) => `- ${l.law} ${l.article}: ${l.text}`).join('\n');
  return [
    '너는 한국 행정절차 분석가다. 아래 절차 하나를 읽고 구조화 카드를 JSON으로만 출력한다. 설명 문장 금지.',
    `절차명: ${proc.name}`, `행위 주체(원문): ${proc.actorRaw}`, `행위: ${proc.action}`,
    `산출물: ${(proc.outputs ?? []).join(', ') || '없음'}`, `기한(원문): ${proc.deadlineRaw ?? '없음'}`,
    '근거 조문:', legal,
    '',
    '규칙:',
    `1. orgRole은 ${ORG_ROLES.join('|')} 중 하나. act는 ${ACTS.join('|')} 중 하나.`,
    `2. subjects는 이 절차가 실제로 심사·검토하는 실체 대상. 분류표 코드만 쓴다: ${tax}. 분류표에 없으면 "other:<짧은 라벨>"로.`,
    '   신청·접수·통지처럼 실체 심사가 없는 절차는 빈 배열.',
    '3. deemed.is는 이 절차가 다른 인허가를 의제하거나 의제되는지. basis는 그 조문(위 근거 조문 문자열 그대로).',
    '4. clock.days는 근거 조문에 적힌 처리·협의 기한 일수(없으면 null). silentEffect는 기한 내 미회신 시 협의·동의로 간주하는 규정이 있으면 true.',
    '5. evidence는 위 근거 조문 목록에서 law·article을 그대로 복사한다. 목록에 없는 조문을 새로 만들지 않는다.',
    '출력 JSON만: {"orgRole":"","act":"","subjects":[],"deemed":{"is":false,"basis":null},"clock":{"days":null,"basis":null,"silentEffect":false},"evidence":[{"law":"","article":""}]}',
  ].join('\n');
}

export function validateCard(raw, proc, subjects, orgs) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return { card: null, errors: ['no object'] };
  if (!ORG_ROLES.includes(raw.orgRole)) errors.push(`orgRole ${raw.orgRole}`);
  if (!ACTS.includes(raw.act)) errors.push(`act ${raw.act}`);
  const subs = Array.isArray(raw.subjects) ? raw.subjects : [];
  const otherSubjects = [];
  for (const s of subs) {
    if (typeof s !== 'string') { errors.push(`subject ${s}`); continue; }
    if (s.startsWith('other:')) { if (s.length > 6) otherSubjects.push(s.slice(6)); else errors.push('empty other'); }
    else if (!subjects[s]) errors.push(`subject ${s}`);
  }
  const legalKeys = new Set(proc.legal.map((l) => `${l.law}|${l.article}`));
  const evidence = Array.isArray(raw.evidence) ? raw.evidence : [];
  for (const e of evidence) if (!legalKeys.has(`${e?.law}|${e?.article}`)) errors.push(`evidence not in procedure: ${e?.law} ${e?.article}`);
  const n = normalizeOrg(proc.actorRaw, orgs);
  const card = {
    pid: proc.pid, org: n.org, orgLabel: n.label, orgKind: n.kind, orgAlso: n.also, orgUnknown: n.unknown,
    orgRole: raw.orgRole, act: raw.act, subjects: subs, otherSubjects,
    deemed: { is: !!raw.deemed?.is, basis: raw.deemed?.basis ?? null },
    clock: { days: Number.isFinite(raw.clock?.days) ? raw.clock.days : null, basis: raw.clock?.basis ?? null, silentEffect: !!raw.clock?.silentEffect },
    evidence: evidence.map((e) => ({ law: e.law, article: e.article })),
    extractStatus: errors.length ? 'failed' : 'ok', errors,
  };
  return { card, errors };
}

export function extractAll(procs, { subjects, orgs, cacheDir = null, fresh = false, promptFor = (p) => buildExtractPrompt(p, subjects), log = () => {} } = {}) {
  const cards = {}; const unknown = new Set(); const other = new Map();
  let i = 0;
  for (const p of procs) {
    i++;
    const r = callJson(promptFor(p), { stage: 'extract', cacheDir, fresh });
    const { card, errors } = r.failed ? { card: null, errors: ['claude failed'] } : validateCard(r.data, p, subjects, orgs);
    const n = normalizeOrg(p.actorRaw, orgs);
    if (n.unknown) unknown.add(p.actorRaw);
    cards[p.pid] = card ?? { pid: p.pid, org: n.org, orgLabel: n.label, orgKind: n.kind, orgAlso: n.also, orgUnknown: n.unknown, extractStatus: 'failed', errors, subjects: [], evidence: [] };
    for (const o of card?.otherSubjects ?? []) { if (!other.has(o)) other.set(o, []); other.get(o).push(p.pid); }
    log(`${i}/${procs.length} ${p.pid} ${cards[p.pid].extractStatus}${r.cached ? ' (cache)' : ''}`);
  }
  return { cards, unknownOrgs: [...unknown], otherSubjects: [...other].map(([label, pids]) => ({ label, pids })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const fresh = process.argv.includes('--fresh');
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const res = extractAll(procs, { subjects: loadSubjects(), orgs: loadOrgs(), fresh, log: (s) => process.stderr.write(s + '\n') });
  writeJson(path.join(OUT_COMPARE, 'cards.json'), res.cards);
  writeJson(path.join(OUT_COMPARE, 'unknown-orgs.json'), res.unknownOrgs);
  writeJson(path.join(OUT_COMPARE, 'other-subjects.json'), res.otherSubjects);
  const ok = Object.values(res.cards).filter((c) => c.extractStatus === 'ok').length;
  console.log(`cards ${Object.keys(res.cards).length} · ok ${ok} · failed ${Object.keys(res.cards).length - ok} · unknown orgs ${res.unknownOrgs.length} · other subjects ${res.otherSubjects.length}`);
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test test/extract.test.mjs`
Expected: `# pass 5`

- [ ] **Step 6: 커밋**

```bash
cd ~/korea100
git add artifacts/complex-minwon/_lib/compare/extract.mjs artifacts/complex-minwon/_lib/compare/test/extract.test.mjs artifacts/complex-minwon/_lib/compare/test/fixtures/claude
git commit -m "feat(compare): 추출 단계 — 절차당 카드 1장, 조문은 복사만, 실패는 failed로 기록"
```

---

### Task 6: 결정적 대조 (`match.mjs`) — A축·C축·점수

**Files:**
- Create: `artifacts/complex-minwon/_lib/compare/match.mjs`
- Test: `artifacts/complex-minwon/_lib/compare/test/match.test.mjs`

규칙(스펙 3.3):
- A축 `same-subject`: 같은 subject 코드를 가진 카드들 중 `legal[].law`가 **서로 다른** 절차가 2개 이상 → 묶음. 같은 법끼리만 있으면 묶지 않는다. `other:` 지표는 라벨이 완전히 같을 때만 같은 지표로 본다.
- C축 `org-roundtrip`: `orgKind === 'org'`(실제 기관)이고 `act ∈ {consult, deliberate}`인 카드를 org별로 모아, `msOrder` 차이가 1 이하인 것끼리 이어서 2개 이상이면 묶음. 역할·민원인·unknown은 제외.
- `extractStatus !== 'ok'`인 카드는 두 축 모두 제외.
- 점수 `{procs, laws, milestones, critical}`. 정렬: critical desc → laws desc → procs desc.
- cid: `A-<subject>-<nn>`, `C-<org>-<nn>`.

- [ ] **Step 1: 실패하는 테스트**

`test/match.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSameSubject, matchOrgRoundtrip, scoreCluster, matchAll } from '../match.mjs';

const P = (pid, ms, msOrder, law, onCritical = false, name = pid) => ({ pid, ms, msOrder, name, onCritical, legal: [{ law, article: '제1조' }] });
const C = (pid, subjects, org, act, orgKind = 'org', extractStatus = 'ok') => ({ pid, subjects, org, act, orgKind, extractStatus });

const procs = [
  P('M1:eia:P02', 'M1', 0, '환경영향평가법', true), P('M2:tra:P01', 'M2', 1, '도시교통정비 촉진법', true),
  P('M2:tra:P03', 'M2', 1, '도시교통정비 촉진법', true), P('M1:eia:P03', 'M1', 0, '환경영향평가법', true),
  P('M9:air:P01', 'M9', 2, '군공항 이전 및 지원에 관한 특별법'), P('M9:air:P02', 'M9', 2, '군공항 이전 및 지원에 관한 특별법'),
];
const cards = {
  'M1:eia:P02': C('M1:eia:P02', ['traffic', 'air'], 'moef-climate', 'consult'),
  'M2:tra:P01': C('M2:tra:P01', ['traffic'], 'applicant', 'apply', 'applicant'),
  'M2:tra:P03': C('M2:tra:P03', ['air'], 'moef-climate', 'consult'),
  'M1:eia:P03': C('M1:eia:P03', ['air'], 'moef-climate', 'supplement'),
  'M9:air:P01': C('M9:air:P01', ['other:주민투표'], 'gwangju', 'deliberate'),
  'M9:air:P02': C('M9:air:P02', [], 'mnd', 'resolve'),
};

test('same-subject groups a subject examined under different laws, not the same law', () => {
  const cl = matchSameSubject(cards, procs);
  const traffic = cl.find((c) => c.key === 'traffic');
  assert.deepEqual(traffic.pids.sort(), ['M1:eia:P02', 'M2:tra:P01']);
  const air = cl.find((c) => c.key === 'air');
  assert.deepEqual(air.pids.sort(), ['M1:eia:P02', 'M1:eia:P03', 'M2:tra:P03']);
  assert.ok(!cl.find((c) => c.key === 'other:주민투표'), 'single-law subject must not form a cluster');
});

test('org-roundtrip groups consult/deliberate acts of a real org within adjacent milestones', () => {
  const cl = matchOrgRoundtrip(cards, procs);
  assert.equal(cl.length, 1);
  assert.equal(cl[0].key, 'moef-climate@M1');
  assert.deepEqual(cl[0].pids.sort(), ['M1:eia:P02', 'M2:tra:P03']); // P03 supplement is not consult
});

test('failed cards and non-org kinds are excluded', () => {
  const c2 = { ...cards, 'M1:eia:P02': { ...cards['M1:eia:P02'], extractStatus: 'failed' } };
  assert.equal(matchOrgRoundtrip(c2, procs).length, 0);
});

test('scoreCluster counts procs, distinct laws, milestones and critical procs', () => {
  assert.deepEqual(scoreCluster(['M1:eia:P02', 'M2:tra:P01'], procs), { procs: 2, laws: 2, milestones: 2, critical: 2 });
});

test('matchAll assigns cids, sorts by critical/laws/procs and keeps the airport out', () => {
  const all = matchAll(cards, procs);
  assert.ok(all.every((c) => !c.pids.some((p) => p.startsWith('M9:'))));
  assert.match(all[0].cid, /^[AC]-/);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].score.critical >= all[i].score.critical);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/match.test.mjs`
Expected: FAIL — `Cannot find module '../match.mjs'`

- [ ] **Step 3: 구현**

`match.mjs`:
```js
// 2단계 결정적 대조. AI 없음. cards.json + procedures.json → candidates.json
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { OUT_COMPARE } from './lib/paths.mjs';

const ROUNDTRIP_ACTS = new Set(['consult', 'deliberate']);
const byPid = (procs) => new Map(procs.map((p) => [p.pid, p]));
const okCards = (cards) => Object.values(cards).filter((c) => c.extractStatus === 'ok');

export function scoreCluster(pids, procs) {
  const m = byPid(procs);
  const ps = pids.map((id) => m.get(id)).filter(Boolean);
  return {
    procs: ps.length,
    laws: new Set(ps.flatMap((p) => p.legal.map((l) => l.law))).size,
    milestones: new Set(ps.map((p) => p.ms)).size,
    critical: ps.filter((p) => p.onCritical).length,
  };
}

export function matchSameSubject(cards, procs) {
  const m = byPid(procs);
  const bySubject = new Map();
  for (const c of okCards(cards)) for (const s of c.subjects ?? []) {
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s).push(c.pid);
  }
  const out = [];
  for (const [key, pids] of bySubject) {
    const laws = new Set(pids.flatMap((id) => (m.get(id)?.legal ?? []).map((l) => l.law)));
    if (laws.size < 2 || pids.length < 2) continue;
    out.push({ axis: 'same-subject', key, pids: [...new Set(pids)] });
  }
  return out;
}

export function matchOrgRoundtrip(cards, procs) {
  const m = byPid(procs);
  const byOrg = new Map();
  for (const c of okCards(cards)) {
    if (c.orgKind !== 'org' || !ROUNDTRIP_ACTS.has(c.act)) continue;
    if (!byOrg.has(c.org)) byOrg.set(c.org, []);
    byOrg.get(c.org).push(c.pid);
  }
  const out = [];
  for (const [org, pids] of byOrg) {
    // msOrder로 정렬해 인접(차 ≤ 1)한 것끼리 사슬로 묶는다
    const sorted = pids.map((id) => ({ id, o: m.get(id)?.msOrder ?? 0, ms: m.get(id)?.ms })).sort((a, b) => a.o - b.o);
    let chain = [];
    const flush = () => { if (chain.length >= 2) out.push({ axis: 'org-roundtrip', key: `${org}@${chain[0].ms}`, pids: chain.map((x) => x.id) }); chain = []; };
    for (const x of sorted) {
      if (chain.length && x.o - chain[chain.length - 1].o > 1) flush();
      chain.push(x);
    }
    flush();
  }
  return out;
}

export function matchAll(cards, procs) {
  const raw = [...matchSameSubject(cards, procs), ...matchOrgRoundtrip(cards, procs)];
  const counters = new Map();
  const out = raw.map((c) => {
    const base = `${c.axis === 'same-subject' ? 'A' : 'C'}-${c.key.replace(/[^\w가-힣]+/g, '-')}`;
    const n = (counters.get(base) ?? 0) + 1; counters.set(base, n);
    return { cid: `${base}-${String(n).padStart(2, '0')}`, ...c, score: scoreCluster(c.pids, procs) };
  });
  out.sort((a, b) => b.score.critical - a.score.critical || b.score.laws - a.score.laws || b.score.procs - a.score.procs || a.cid.localeCompare(b.cid));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const cards = readJson(path.join(OUT_COMPARE, 'cards.json'));
  const all = matchAll(cards, procs);
  writeJson(path.join(OUT_COMPARE, 'candidates.json'), all);
  const a = all.filter((c) => c.axis === 'same-subject').length;
  console.log(`candidates ${all.length} · same-subject ${a} · org-roundtrip ${all.length - a} · on critical ${all.filter((c) => c.score.critical > 0).length}`);
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/match.test.mjs`
Expected: `# pass 5`

- [ ] **Step 5: 커밋**

```bash
cd ~/korea100
git add artifacts/complex-minwon/_lib/compare/match.mjs artifacts/complex-minwon/_lib/compare/test/match.test.mjs
git commit -m "feat(compare): 결정적 대조 — 같은 지표·다른 법(A축), 같은 기관 인접 왕복(C축), 점수·정렬"
```

---
### Task 7: 판정 (`judge.mjs`) — 묶음 내 쌍대 판정 + 보존 목록

**Files:**
- Create: `artifacts/complex-minwon/_lib/compare/judge.mjs`
- Create: `artifacts/complex-minwon/_lib/compare/test/fixtures/claude/judge-pass.json`
- Create: `artifacts/complex-minwon/_lib/compare/test/fixtures/claude/judge-none.json`
- Test: `artifacts/complex-minwon/_lib/compare/test/judge.test.mjs`

- [ ] **Step 1: 가짜 응답**

`test/fixtures/claude/judge-pass.json`:
```json
{ "pairs": [
  { "a": "M1:eia:P02", "b": "M2:tra:P01", "verdict": "partial", "mergeable": true, "reason": "둘 다 발생 교통량을 산정·심사한다", "blockingArticle": null, "suggest": "drop" },
  { "a": "M1:eia:P02", "b": "M1:eia:P03", "verdict": "different", "mergeable": false, "reason": "보완은 후속 절차", "blockingArticle": null }
] }
```
`test/fixtures/claude/judge-none.json`:
```json
{ "pairs": [ { "a": "X", "b": "Y", "verdict": "different", "mergeable": false, "reason": "무관", "blockingArticle": null } ] }
```

- [ ] **Step 2: 실패하는 테스트**

`test/judge.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildJudgePrompt, applyVerdict, judgeAll } from '../judge.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.COMPARE_CLAUDE_BIN = path.join(here, 'fake-claude.mjs');

const procs = [
  { pid: 'M1:eia:P02', name: '환경영향평가 본안 검토·협의 완료', action: 'a', actorRaw: '환경부', legal: [{ law: '환경영향평가법', article: '제29조제1항', text: 't' }] },
  { pid: 'M2:tra:P01', name: '교통영향평가서 제출', action: 'b', actorRaw: '사업시행자', legal: [{ law: '도시교통정비 촉진법', article: '제16조제1항', text: 't' }] },
  { pid: 'M1:eia:P03', name: '보완 요구', action: 'c', actorRaw: '환경부', legal: [{ law: '환경영향평가법', article: '제30조', text: 't' }] },
];
const cluster = { cid: 'A-traffic-01', axis: 'same-subject', key: 'traffic', pids: procs.map((p) => p.pid), score: {} };
const preserve = [{ id: 'eia-main', pattern: '본안 검토|협의 완료', law: '환경영향평가법', allowed: ['shorten', 'automate'] }];

test('prompt lists every pair once with both procedures and their articles', () => {
  const p = buildJudgePrompt(cluster, procs);
  assert.match(p, /M1:eia:P02.*M2:tra:P01/s); assert.match(p, /제16조제1항/);
  assert.match(p, /삭제|폐지.*제안하지/);
});

test('applyVerdict passes when any pair is mergeable, restricts kinds by preserve, ignores drop suggestions', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/claude/judge-pass.json'), 'utf8'));
  const v = applyVerdict(cluster, raw, procs, preserve);
  assert.equal(v.passed, true);
  assert.deepEqual(v.allowedKinds, ['automate', 'shorten']); // eia-main in cluster → merge removed, DEFAULT_KINDS order kept
  assert.deepEqual(v.preserveHits, ['eia-main']);
  assert.equal(v.pairs.length, 2);
  assert.ok(!('suggest' in v.pairs[0]), 'drop suggestion is not carried into verdicts');
  assert.deepEqual(v.ignored, [{ a: 'M1:eia:P02', b: 'M2:tra:P01', suggest: 'drop' }]);
});

test('applyVerdict fails a cluster with no mergeable pair and drops pairs naming unknown pids', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/claude/judge-none.json'), 'utf8'));
  const v = applyVerdict(cluster, raw, procs, preserve);
  assert.equal(v.passed, false); assert.equal(v.pairs.length, 0);
});

test('allowedKinds default is merge/automate/shorten and empty allowed list fails the cluster', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/claude/judge-pass.json'), 'utf8'));
  const v1 = applyVerdict(cluster, raw, procs, []);
  assert.deepEqual(v1.allowedKinds, ['merge', 'automate', 'shorten']);
  const v2 = applyVerdict(cluster, raw, procs, [{ id: 'vote', pattern: '본안', law: '환경영향평가법', allowed: [] }]);
  assert.equal(v2.passed, false); assert.equal(v2.reason, 'preserve:vote allows no kind');
});

test('judgeAll runs one call per cluster and records failures', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'jd-'));
  const clusters = [{ ...cluster, cid: 'ok' }, { ...cluster, cid: 'bad' }];
  const res = judgeAll(clusters, procs, preserve, { cacheDir: cache, promptFor: (c) => (c.cid === 'bad' ? '@@FAIL@@' : `@@FIXTURE:judge-pass@@ ${c.cid}`) });
  assert.equal(res.find((v) => v.cid === 'ok').passed, true);
  assert.equal(res.find((v) => v.cid === 'bad').judgeStatus, 'failed');
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test test/judge.test.mjs`
Expected: FAIL — `Cannot find module '../judge.mjs'`

- [ ] **Step 4: 구현**

`judge.mjs`:
```js
// 3단계 판정. 묶음당 AI 1회, 묶음 안 모든 쌍을 한 번에 묻는다. 보존 목록이 카드 종류를 제한한다.
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { OUT_COMPARE } from './lib/paths.mjs';
import { callJson } from './lib/claude.mjs';
import { loadPreserve, preserveHit } from './lib/normalize.mjs';

export const DEFAULT_KINDS = ['merge', 'automate', 'shorten'];
const VERDICTS = new Set(['same', 'partial', 'different']);

export function pairsOf(pids) {
  const out = [];
  for (let i = 0; i < pids.length; i++) for (let j = i + 1; j < pids.length; j++) out.push([pids[i], pids[j]]);
  return out;
}

export function buildJudgePrompt(cluster, procs) {
  const m = new Map(procs.map((p) => [p.pid, p]));
  const desc = (id) => { const p = m.get(id); return `[${id}] ${p.name} / 주체 ${p.actorRaw} / ${p.action} / 조문 ${p.legal.map((l) => `${l.law} ${l.article}`).join('; ')}`; };
  const axisNote = cluster.axis === 'same-subject'
    ? `같은 심사 대상(${cluster.key})을 서로 다른 법이 각각 심사하는 것으로 보이는 절차들이다.`
    : `같은 기관(${cluster.key})이 인접 단계에서 협의·심의를 반복하는 절차들이다.`;
  return [
    '너는 한국 행정절차 정비 심사관이다. 아래 절차 묶음에서 쌍마다 "실체요건이 같은가 / 한 시계·한 사건으로 묶을 수 있는가"를 판정한다.',
    axisNote,
    '절차 삭제·폐지·갈음은 제안하지 않는다. 묶기·자동화·기한 부여만 다룬다. 확신 없으면 different.',
    '절차:', ...cluster.pids.map(desc),
    `판정할 쌍: ${pairsOf(cluster.pids).map(([a, b]) => `${a} × ${b}`).join(' | ')}`,
    'JSON만 출력: {"pairs":[{"a":"pid","b":"pid","verdict":"same|partial|different","mergeable":true|false,"reason":"한 줄","blockingArticle":"막는 조문 또는 null"}]}',
  ].join('\n');
}

export function applyVerdict(cluster, raw, procs, preserve) {
  const m = new Map(procs.map((p) => [p.pid, p]));
  const inCluster = new Set(cluster.pids);
  const pairs = []; const ignored = [];
  for (const r of raw?.pairs ?? []) {
    if (!inCluster.has(r?.a) || !inCluster.has(r?.b) || !VERDICTS.has(r?.verdict)) continue;
    if (r.suggest) ignored.push({ a: r.a, b: r.b, suggest: r.suggest });
    pairs.push({ a: r.a, b: r.b, verdict: r.verdict, mergeable: !!r.mergeable && r.verdict !== 'different', reason: r.reason ?? '', blockingArticle: r.blockingArticle ?? null });
  }
  const hits = cluster.pids.map((id) => preserveHit(m.get(id) ?? {}, preserve)).filter(Boolean);
  let allowedKinds = DEFAULT_KINDS;
  for (const h of hits) allowedKinds = allowedKinds.filter((k) => h.allowed.includes(k));
  const anyMergeable = pairs.some((p) => p.mergeable);
  let passed = anyMergeable && allowedKinds.length > 0;
  let reason = null;
  if (!anyMergeable) reason = 'no mergeable pair';
  else if (!allowedKinds.length) reason = `preserve:${hits.find((h) => !h.allowed.length)?.id ?? hits[0].id} allows no kind`;
  return { cid: cluster.cid, axis: cluster.axis, key: cluster.key, pids: cluster.pids, pairs, passed, reason,
    allowedKinds, preserveHits: [...new Set(hits.map((h) => h.id))], ignored, judgeStatus: 'ok' };
}

export function judgeAll(clusters, procs, preserve, { cacheDir = null, fresh = false, promptFor = (c) => buildJudgePrompt(c, procs), log = () => {} } = {}) {
  return clusters.map((c, i) => {
    const r = callJson(promptFor(c), { stage: 'judge', cacheDir, fresh });
    log(`${i + 1}/${clusters.length} ${c.cid} ${r.failed ? 'failed' : 'ok'}${r.cached ? ' (cache)' : ''}`);
    if (r.failed) return { cid: c.cid, axis: c.axis, key: c.key, pids: c.pids, pairs: [], passed: false, reason: 'claude failed', allowedKinds: [], preserveHits: [], ignored: [], judgeStatus: 'failed' };
    return applyVerdict(c, r.data, procs, preserve);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const fresh = process.argv.includes('--fresh');
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const clusters = readJson(path.join(OUT_COMPARE, 'candidates.json'));
  const res = judgeAll(clusters, procs, loadPreserve(), { fresh, log: (s) => process.stderr.write(s + '\n') });
  writeJson(path.join(OUT_COMPARE, 'verdicts.json'), res);
  console.log(`clusters ${res.length} · passed ${res.filter((v) => v.passed).length} · failed calls ${res.filter((v) => v.judgeStatus === 'failed').length} · ignored drop suggestions ${res.reduce((a, v) => a + v.ignored.length, 0)}`);
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test test/judge.test.mjs`
Expected: `# pass 5`

- [ ] **Step 6: 커밋**

```bash
cd ~/korea100
git add artifacts/complex-minwon/_lib/compare/judge.mjs artifacts/complex-minwon/_lib/compare/test/judge.test.mjs artifacts/complex-minwon/_lib/compare/test/fixtures/claude/judge-pass.json artifacts/complex-minwon/_lib/compare/test/fixtures/claude/judge-none.json
git commit -m "feat(compare): 판정 단계 — 묶음 내 쌍대 판정, 보존 목록으로 카드 종류 제한, drop 제안 무시"
```

---

### Task 8: `verify-basis.mjs` 함수 노출 + 개선 카드 (`emit-cards.mjs`)

**Files:**
- Modify: `artifacts/complex-minwon/_lib/verify-basis.mjs` (전체 — 내부 함수를 모듈 스코프로 올려 export. 동작 불변)
- Create: `artifacts/complex-minwon/_lib/compare/emit-cards.mjs`
- Create: `artifacts/complex-minwon/_lib/compare/test/fixtures/claude/card-ok.json`
- Create: `artifacts/complex-minwon/_lib/compare/test/fixtures/laws/환경영향평가법.json`
- Test: `artifacts/complex-minwon/_lib/compare/test/emit-cards.test.mjs`

배경: 카드 `targets`("부처 — 법 제N조제N항")의 조문은 (a) 묶음 절차의 `legal`에 law+article 문자열이 그대로 있거나 (b) `laws/*.json` DRF 스냅샷에 항·호 단위로 존재해야 한다. (b)의 검사기가 `verify-basis.mjs` 안에 `checkCitation`으로 이미 있는데 `verify(caseUrl)` 안에 갇혀 있다. 함수를 모듈 스코프로 꺼내 export한다. 기존 호출(`verify(import.meta.url)`)과 출력은 그대로.

- [ ] **Step 1: verify-basis.mjs 리팩터 전 기준선**

Run: `cd ~/korea100/artifacts/complex-minwon/03-semiconductor-cluster-designation && node verify-basis.mjs`
Expected: `citations 101, passed 101, failed 0, negative control OK` — 이 줄을 기록해 둔다.

- [ ] **Step 2: 리팩터**

`_lib/verify-basis.mjs`를 아래로 교체한다. 로직은 원본과 같고, `laws`를 인자로 받는 형태로만 바꾼다.
```js
// Verify every `basis` citation in case-data.mjs against law.go.kr DRF snapshots in ./laws/*.json.
// Citation grammar handled: "<법령명> 제N조(의M)?(제N항)?(제N호(의M)?)?(X목)?" joined by "·", ranges "제A호~제B호",
// trailing qualifiers (단서·전단·후단) are ignored for existence checks.
// Includes a negative control: fabricated citations must FAIL, otherwise the checker is blind.
// 사용: 사례 폴더의 verify-basis.mjs가 verify(import.meta.url) 호출. loadLaws/checkCitation은 compare 엔진도 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circledToInt = (s) => { const i = CIRCLED.indexOf((s || '').trim()[0]); return i >= 0 ? i + 1 : null; };
const artKey = (a) => a.no + (a.branch && a.branch !== '0' ? '의' + a.branch : '');
const findArticle = (law, key) => law.articles.find((a) => artKey(a) === key);
const hoKey = (s) => (s || '').replace(/\.$/, '').trim();

export function loadLaws(lawDir) {
  const laws = new Map();
  if (!fs.existsSync(lawDir)) return laws;
  for (const f of fs.readdirSync(lawDir)) {
    if (!f.endsWith('.json')) continue;
    const d = JSON.parse(fs.readFileSync(path.join(lawDir, f), 'utf8'));
    laws.set(d.meta.name, d);
  }
  return laws;
}

function tokenize(rest) {
  const re = /제(\d+)조(?:의(\d+))?|제(\d+)항|제(\d+)호(?:의(\d+))?|([가-힣])목|(~)|(·)|(단서|전단|후단|각 호 외의 부분|본문)/g;
  const out = []; let m;
  while ((m = re.exec(rest))) {
    if (m[1]) out.push({ t: 'jo', v: m[1] + (m[2] ? '의' + m[2] : '') });
    else if (m[3]) out.push({ t: 'hang', v: Number(m[3]) });
    else if (m[4]) out.push({ t: 'ho', v: m[4] + (m[5] ? '의' + m[5] : '') });
    else if (m[6]) out.push({ t: 'mok', v: m[6] });
    else if (m[7]) out.push({ t: 'range' });
    else if (m[8]) out.push({ t: 'sep' });
  }
  return out;
}

export function checkCitation(laws, cit) {
  const m = cit.match(/^(.+?)\s+(제\d+조.*)$/);
  if (!m) return [{ cit, ok: false, why: '형식 불일치' }];
  const lawName = m[1].trim();
  const law = laws.get(lawName);
  if (!law) return [{ cit, ok: false, why: `법령 스냅샷 없음: ${lawName}` }];
  const toks = tokenize(m[2]);
  const results = [];
  let jo = null, hang = null, ho = null, art = null, pendingRange = false, lastHo = null;
  const rec = (label, ok, why) => results.push({ cit, label: `${lawName} ${label}`, ok, why });
  for (const tk of toks) {
    if (tk.t === 'jo') {
      jo = tk.v; hang = null; ho = null; lastHo = null;
      art = findArticle(law, jo);
      rec(`제${jo}조`, !!art, art ? art.title : '조문 없음');
    } else if (tk.t === 'hang') {
      if (!art) continue;
      hang = tk.v; ho = null; lastHo = null;
      const p = art.paras.find((q) => circledToInt(q.no) === hang);
      const ok = !!p || (hang === 1 && art.paras.length === 0 && !!art.body);
      rec(`제${jo}조제${hang}항`, ok, ok ? '' : `항 없음 (항 수 ${art.paras.length})`);
    } else if (tk.t === 'ho') {
      if (!art) continue;
      const scope = hang ? art.paras.filter((q) => circledToInt(q.no) === hang) : art.paras;
      const has = (k) => scope.some((q) => q.hos.some((h) => hoKey(h.no) === k));
      if (pendingRange && lastHo && /^\d+$/.test(lastHo) && /^\d+$/.test(tk.v)) {
        for (let i = Number(lastHo) + 1; i <= Number(tk.v); i++) rec(`제${jo}조제${hang ?? '?'}항제${i}호`, has(String(i)), has(String(i)) ? '' : '호 없음');
        pendingRange = false;
      } else {
        rec(`제${jo}조제${hang ?? '?'}항제${tk.v}호`, has(tk.v), has(tk.v) ? '' : '호 없음');
      }
      ho = tk.v; lastHo = tk.v;
    } else if (tk.t === 'mok') {
      if (!art || !ho) continue;
      const scope = hang ? art.paras.filter((q) => circledToInt(q.no) === hang) : art.paras;
      const hoObj = scope.flatMap((q) => q.hos).find((h) => hoKey(h.no) === ho);
      const ok = !!hoObj && hoObj.mok.some((mm) => mm.trim().startsWith(tk.v + '.'));
      rec(`제${jo}조제${hang ?? '?'}항제${ho}호${tk.v}목`, ok, ok ? '' : '목 없음');
    } else if (tk.t === 'range') {
      pendingRange = true;
    }
  }
  if (results.length === 0) results.push({ cit, ok: false, why: '토큰 없음' });
  return results;
}

export async function verify(caseUrl) {
  const here = path.dirname(fileURLToPath(caseUrl));
  const { nodes, meta } = await import(pathToFileURL(path.join(here, 'case-data.mjs')).href);
  const laws = loadLaws(path.join(here, 'laws'));

  const all = [];
  for (const n of nodes) for (const b of n.basis || []) all.push(...checkCitation(laws, b).map((r) => ({ node: n.id, ...r })));
  const fails = all.filter((r) => !r.ok);

  const L0 = meta.probeLaw || [...laws.keys()][0];
  const controls = [`${L0} 제9999조`, `${L0} 제1조제99항`, `${L0} 제1조제1항제99호`, '없는법 제1조', `${L0} 제2조제99항제1호`];
  const ctrlFails = controls.map((c) => checkCitation(laws, c).some((r) => !r.ok));
  const controlOk = ctrlFails.every(Boolean);

  const laws_used = [...laws.values()].map((l) => ({ name: l.meta.name, mst: l.meta.mst, effective: l.meta.eff, status: l.meta.status, pending: l.meta.pending.map((p) => p.eff) }));
  const report = { checked_at: meta.checkedAt, citations: all.length, passed: all.length - fails.length, failed: fails, negative_control: { probes: controls, all_detected: controlOk }, laws: laws_used };
  fs.writeFileSync(path.join(here, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(`citations ${all.length}, passed ${all.length - fails.length}, failed ${fails.length}, negative control ${controlOk ? 'OK' : 'BLIND!'}`);
  for (const f of fails) console.log('  FAIL', f.node, f.label ?? f.cit, '-', f.why);
  if (!controlOk) { console.error('negative control failed — checker is blind'); process.exit(2); }
  if (fails.length) process.exit(1);
}
```

- [ ] **Step 3: 회귀 확인 (세 사례 전부)**

Run:
```bash
cd ~/korea100/artifacts/complex-minwon
for d in 01-building-permit 02-startup-factory-plan 03-semiconductor-cluster-designation; do (cd $d && node verify-basis.mjs | head -1); done
git diff --stat -- */verification.json
```
Expected: 세 줄 모두 `failed 0, negative control OK`, 3호는 `citations 101, passed 101`. `verification.json` diff는 없음(있으면 `checked_at`만이어야 하고, 그 경우 `git checkout -- */verification.json`으로 되돌린다).

- [ ] **Step 4: 카드 픽스처와 미니 법령 스냅샷**

`test/fixtures/claude/card-ok.json`:
```json
{ "kind": "merge", "title": "교통량 산정을 한 산출물로", "why": "환평과 교통영향평가가 같은 발생 교통량을 각각 산정한다.",
  "lever": "환경영향평가서 교통 항목에 교통영향평가서 산정치를 인용하게 하고, 협의 시계를 환평 협의에 맞춘다.",
  "targets": ["기후에너지환경부 — 환경영향평가법 제29조제1항", "국토교통부 — 도시교통정비 촉진법 제16조제1항", "국토교통부 — 도시교통정비 촉진법 제99조"] }
```
`test/fixtures/laws/환경영향평가법.json` (DRF 스냅샷 형식 최소본):
```json
{ "meta": { "name": "환경영향평가법", "mst": "0", "eff": "20260101", "pub": "20250101", "status": "현행", "pending": [] },
  "articles": [
    { "no": "29", "branch": "0", "title": "협의 의견의 통보", "body": "", "eff": "20260101",
      "paras": [{ "no": "①", "text": "협의 의견을 통보하여야 한다.", "hos": [] }, { "no": "②", "text": "…", "hos": [] }] },
    { "no": "30", "branch": "0", "title": "보완", "body": "보완을 요구할 수 있다.", "eff": "20260101", "paras": [] }
  ] }
```

- [ ] **Step 5: 실패하는 테스트**

`test/emit-cards.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCardPrompt, validateTargets, emitCards, renderImprovementsModule } from '../emit-cards.mjs';
import { loadLaws } from '../../verify-basis.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.COMPARE_CLAUDE_BIN = path.join(here, 'fake-claude.mjs');
const laws = loadLaws(path.join(here, 'fixtures/laws'));

const procs = [
  { pid: 'M1:eia:P02', ms: 'M1', institution: 'eia', nodeId: 'P02', name: '협의 검토', action: 'a', actorRaw: '환경부', legal: [{ law: '환경영향평가법', article: '제29조제1항', text: 't' }] },
  { pid: 'M2:tra:P01', ms: 'M2', institution: 'tra', nodeId: 'P01', name: '교통영향평가서 제출', action: 'b', actorRaw: '사업시행자', legal: [{ law: '도시교통정비 촉진법', article: '제16조제1항', text: 't' }] },
];
const nodeIdOf = (pid) => pid.replace(/:/g, '_');
const verdict = { cid: 'A-traffic-01', axis: 'same-subject', key: 'traffic', pids: procs.map((p) => p.pid), passed: true, allowedKinds: ['merge', 'automate', 'shorten'],
  pairs: [{ a: 'M1:eia:P02', b: 'M2:tra:P01', verdict: 'partial', mergeable: true, reason: '같은 교통량', blockingArticle: null }], preserveHits: [] };

test('prompt states allowed kinds, the pair reasons and the "소관 ≠ 수행기관" rule', () => {
  const p = buildCardPrompt(verdict, procs);
  assert.match(p, /merge\|automate\|shorten/); assert.match(p, /같은 교통량/); assert.match(p, /소관/);
});

test('validateTargets keeps targets found in cluster legal or in law snapshots, rejects the rest', () => {
  const t = ['기후에너지환경부 — 환경영향평가법 제29조제1항', '국토교통부 — 도시교통정비 촉진법 제16조제1항', '국토교통부 — 도시교통정비 촉진법 제99조', '형식이 이상함'];
  const r = validateTargets(t, procs, laws);
  assert.deepEqual(r.ok, t.slice(0, 2));
  assert.equal(r.rejected.length, 2);
  assert.match(r.rejected[0].why, /스냅샷 없음|없음/);
});

test('emitCards builds improvements with sequential ids and case-data node ids, drops cards with no valid target or disallowed kind', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'ec-'));
  const v2 = { ...verdict, cid: 'C-x-01', allowedKinds: ['shorten'] }; // card-ok.json says merge → disallowed
  const res = emitCards([verdict, v2], procs, laws, { cacheDir: cache, nodeIdOf, promptFor: (v) => `@@FIXTURE:card-ok@@ ${v.cid}` });
  assert.equal(res.improvements.length, 1);
  const c = res.improvements[0];
  assert.equal(c.id, 'I1'); assert.equal(c.kind, 'merge');
  assert.deepEqual(c.nodes, ['M1_eia_P02', 'M2_tra_P01']);
  assert.deepEqual(c.targets, ['기후에너지환경부 — 환경영향평가법 제29조제1항', '국토교통부 — 도시교통정비 촉진법 제16조제1항']);
  assert.equal(res.rejected.length, 1); assert.match(res.rejected[0].why, /kind merge not allowed/);
});

test('renderImprovementsModule emits a valid ESM module', async () => {
  const src = renderImprovementsModule([{ id: 'I1', kind: 'merge', nodes: ['A'], pids: ['a'], title: 't', why: 'w', lever: 'l', targets: ['x — y 제1조'] }]);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'im-')), 'improvements.mjs');
  fs.writeFileSync(f, src);
  const mod = await import('file://' + f);
  assert.equal(mod.improvements[0].id, 'I1');
});
```

- [ ] **Step 6: 실패 확인**

Run: `node --test test/emit-cards.test.mjs`
Expected: FAIL — `Cannot find module '../emit-cards.mjs'`

- [ ] **Step 7: 구현**

`emit-cards.mjs`:
```js
// 4단계(카드). 통과한 묶음 → 1호 문법 개선 카드. targets 조문은 절차 legal 또는 laws/ 스냅샷에 있어야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { OUT, OUT_COMPARE } from './lib/paths.mjs';
import { callJson } from './lib/claude.mjs';
import { loadLaws, checkCitation } from '../verify-basis.mjs';

const KINDS = new Set(['merge', 'automate', 'shorten']);

export function buildCardPrompt(v, procs) {
  const m = new Map(procs.map((p) => [p.pid, p]));
  const lines = v.pids.map((id) => { const p = m.get(id); return `[${id}] ${p.name} / 수행 ${p.actorRaw} / ${p.action} / 조문 ${p.legal.map((l) => `${l.law} ${l.article}`).join('; ')}`; });
  const reasons = v.pairs.filter((p) => p.mergeable).map((p) => `${p.a} × ${p.b}: ${p.reason}`);
  return [
    '너는 행정안전부 혁신기획과의 복합민원 정비 담당자다. 아래 절차 묶음에 대해 개선 카드 1장을 JSON으로만 쓴다.',
    `허용 종류: ${v.allowedKinds.join('|')} (merge=통합·한 시계, automate=법이 방법까지 정한 구간의 자동화, shorten=기한 부여·후제출). 삭제·폐지는 없다.`,
    '절차:', ...lines,
    '판정에서 묶을 수 있다고 본 이유:', ...reasons,
    '규칙: title 20자 내. why는 왜 지금 두 번인지(조문 근거). lever는 바꿀 조문 1개와 바꾸는 방식 한 줄.',
    'targets는 "소관부처 — 법령명 제N조제N항" 형식으로 1~3개. 소관은 조문의 주무부처이지 수행 기관이 아니다. 위 조문 목록에 있는 조문만 쓴다.',
    `JSON만 출력: {"kind":"${v.allowedKinds[0]}","title":"","why":"","lever":"","targets":["부처 — 법령명 제N조"]}`,
  ].join('\n');
}

export function validateTargets(targets, procs, laws) {
  const legal = new Set(procs.flatMap((p) => p.legal.map((l) => `${l.law} ${l.article}`)));
  const ok = [], rejected = [];
  for (const t of Array.isArray(targets) ? targets : []) {
    const m = String(t).match(/^(.+?)\s+—\s+(.+)$/);
    if (!m) { rejected.push({ target: t, why: '형식 불일치 (부처 — 조문)' }); continue; }
    const cit = m[2].trim();
    if (legal.has(cit)) { ok.push(t); continue; }
    const res = checkCitation(laws, cit);
    if (res.every((r) => r.ok)) ok.push(t); else rejected.push({ target: t, why: res.filter((r) => !r.ok).map((r) => r.why).join('; ') });
  }
  return { ok, rejected };
}

export function emitCards(verdicts, procs, laws, { cacheDir = null, fresh = false, nodeIdOf, promptFor = (v) => buildCardPrompt(v, procs), log = () => {} } = {}) {
  const m = new Map(procs.map((p) => [p.pid, p]));
  const improvements = [], rejected = [];
  let n = 0;
  for (const v of verdicts.filter((x) => x.passed)) {
    const r = callJson(promptFor(v), { stage: 'cards', cacheDir, fresh });
    if (r.failed) { rejected.push({ cid: v.cid, why: 'claude failed' }); continue; }
    const c = r.data;
    if (!KINDS.has(c.kind) || !v.allowedKinds.includes(c.kind)) { rejected.push({ cid: v.cid, why: `kind ${c.kind} not allowed (${v.allowedKinds.join('|')})`, raw: c }); continue; }
    const clusterProcs = v.pids.map((id) => m.get(id)).filter(Boolean);
    const t = validateTargets(c.targets, clusterProcs, laws);
    if (!t.ok.length) { rejected.push({ cid: v.cid, why: 'no valid target', rejectedTargets: t.rejected, raw: c }); continue; }
    n++;
    improvements.push({ id: `I${n}`, cid: v.cid, kind: c.kind, nodes: v.pids.map(nodeIdOf), pids: v.pids,
      title: String(c.title ?? '').trim(), why: String(c.why ?? '').trim(), lever: String(c.lever ?? '').trim(), targets: t.ok, droppedTargets: t.rejected });
    log(`${v.cid} → I${n} ${c.kind}`);
  }
  return { improvements, rejected };
}

export const renderImprovementsModule = (improvements) =>
  `// 생성 파일 — compare 엔진 emit-cards.mjs. 손으로 고치지 말고 verdicts를 고친 뒤 다시 생성.\nexport const improvements = ${JSON.stringify(improvements, null, 2)};\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const fresh = process.argv.includes('--fresh');
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const verdicts = readJson(path.join(OUT_COMPARE, 'verdicts.json'));
  const laws = loadLaws(path.join(OUT, 'laws'));
  const instIndex = new Map(); for (const p of procs) if (!instIndex.has(p.institution)) instIndex.set(p.institution, instIndex.size);
  const nodeIdOf = (pid) => { const p = procs.find((x) => x.pid === pid); return `${p.ms}_${instIndex.get(p.institution)}_${p.nodeId}`; };
  const res = emitCards(verdicts, procs, laws, { fresh, nodeIdOf, log: (s) => process.stderr.write(s + '\n') });
  writeJson(path.join(OUT_COMPARE, 'cards-out.json'), res.improvements);
  writeJson(path.join(OUT_COMPARE, 'rejected.json'), res.rejected);
  fs.writeFileSync(path.join(OUT, 'improvements.mjs'), renderImprovementsModule(res.improvements));
  console.log(`improvements ${res.improvements.length} · rejected ${res.rejected.length}`);
}
```

- [ ] **Step 8: 통과 확인**

Run: `node --test test/emit-cards.test.mjs`
Expected: `# pass 4`

- [ ] **Step 9: 커밋**

```bash
cd ~/korea100
git add artifacts/complex-minwon/_lib/verify-basis.mjs artifacts/complex-minwon/_lib/compare/emit-cards.mjs artifacts/complex-minwon/_lib/compare/test/emit-cards.test.mjs artifacts/complex-minwon/_lib/compare/test/fixtures/claude/card-ok.json artifacts/complex-minwon/_lib/compare/test/fixtures/laws
git commit -m "feat(compare): 개선 카드 생성 — 조문 검증(verify-basis checkCitation 노출), 허용 종류·targets 없는 카드 거부"
```

---
### Task 9: 비교대조 판 (`emit-review.mjs`) — 지표×법률, 기관×마일스톤

**Files:**
- Create: `artifacts/complex-minwon/_lib/compare/emit-review.mjs`
- Test: `artifacts/complex-minwon/_lib/compare/test/emit-review.test.mjs`

형식은 `03-semiconductor-cluster-designation/n03-contact-map.html`의 헤더·범례·표 스타일을 따른다(배경 `#f4f7f5`, 헤더 `#0b1a13`, 초록 `#eef8f2/#1f8962`, 노랑 `#fdf8e3/#d9a821`, 파랑 `#e9f0ff/#2456d6`). 한 파일에 A축 표와 C축 표를 위아래로 두고, 아래에 묶음 목록(판정 사유·카드 id)을 둔다. 칸 클릭 시 오른쪽 고정 패널에 절차 목록·조문을 띄운다(인라인 JS, 외부 의존 없음).

- [ ] **Step 1: 실패하는 테스트**

`test/emit-review.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrices, renderReview } from '../emit-review.mjs';

const procs = [
  { pid: 'M1:eia:P02', ms: 'M1', msName: '환평', msOrder: 0, onCritical: true, name: '협의 검토', legal: [{ law: '환경영향평가법', article: '제29조제1항' }], institution: 'eia' },
  { pid: 'M2:tra:P01', ms: 'M2', msName: '교통', msOrder: 1, onCritical: true, name: '평가서 제출', legal: [{ law: '도시교통정비 촉진법', article: '제16조제1항' }], institution: 'tra' },
  { pid: 'M2:tra:P03', ms: 'M2', msName: '교통', msOrder: 1, onCritical: true, name: '대기 재협의', legal: [{ law: '도시교통정비 촉진법', article: '제18조' }], institution: 'tra' },
];
const cards = {
  'M1:eia:P02': { pid: 'M1:eia:P02', subjects: ['traffic', 'air'], org: 'moef-climate', orgLabel: '기후에너지환경부', orgKind: 'org', act: 'consult', clock: { days: 45 }, extractStatus: 'ok' },
  'M2:tra:P01': { pid: 'M2:tra:P01', subjects: ['traffic'], org: 'applicant', orgLabel: '신청인', orgKind: 'applicant', act: 'apply', clock: { days: null }, extractStatus: 'ok' },
  'M2:tra:P03': { pid: 'M2:tra:P03', subjects: ['air'], org: 'moef-climate', orgLabel: '기후에너지환경부', orgKind: 'org', act: 'consult', clock: { days: null }, extractStatus: 'ok' },
};
const verdicts = [{ cid: 'A-traffic-01', axis: 'same-subject', key: 'traffic', pids: ['M1:eia:P02', 'M2:tra:P01'], passed: true, pairs: [{ a: 'M1:eia:P02', b: 'M2:tra:P01', verdict: 'partial', mergeable: true, reason: '같은 교통량' }] }];
const improvements = [{ id: 'I1', cid: 'A-traffic-01', kind: 'merge', title: '교통량 한 번', pids: ['M1:eia:P02', 'M2:tra:P01'] }];
const subjects = { traffic: '교통', air: '대기질' };

test('A matrix: rows = subjects, cols = laws, cell lists pids; passed cluster is flagged', () => {
  const { A } = buildMatrices({ procs, cards, verdicts, subjects });
  assert.deepEqual(A.cols, ['환경영향평가법', '도시교통정비 촉진법']);
  const row = A.rows.find((r) => r.key === 'traffic');
  assert.deepEqual(row.cells['환경영향평가법'].pids, ['M1:eia:P02']);
  assert.equal(row.cells['도시교통정비 촉진법'].pids.length, 1);
  assert.equal(row.passedCid, 'A-traffic-01');
});

test('C matrix: rows = real orgs only, cols = milestones in msOrder, cell = consult/deliberate count', () => {
  const { C } = buildMatrices({ procs, cards, verdicts, subjects });
  assert.deepEqual(C.cols.map((c) => c.ms), ['M1', 'M2']);
  assert.deepEqual(C.rows.map((r) => r.org), ['moef-climate']);
  assert.equal(C.rows[0].cells.M1.count, 1); assert.equal(C.rows[0].cells.M2.count, 1);
  assert.equal(C.cols[0].critical, true);
});

test('renderReview produces a self-contained page with both tables, cluster list and the click panel data', () => {
  const html = renderReview({ procs, cards, verdicts, improvements, subjects, meta: { title: '테스트', asOf: '2026-09-05' } });
  assert.match(html, /<table id="matA"/); assert.match(html, /<table id="matB"/);
  assert.match(html, /A-traffic-01/); assert.match(html, /I1/);
  assert.match(html, /const DATA = \{/); assert.match(html, /제29조제1항/);
  assert.ok(!/<script src=/.test(html), 'no external scripts');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/emit-review.test.mjs`
Expected: FAIL — `Cannot find module '../emit-review.mjs'`

- [ ] **Step 3: 구현**

`emit-review.mjs`:
```js
// 4단계(판). 엔진 결과를 사람이 보는 비교대조 판. A = 지표×법률, C = 기관×마일스톤.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readJson } from './lib/io.mjs';
import { OUT, OUT_COMPARE } from './lib/paths.mjs';
import { loadSubjects } from './lib/normalize.mjs';

const ROUNDTRIP = new Set(['consult', 'deliberate']);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildMatrices({ procs, cards, verdicts, subjects }) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const ok = Object.values(cards).filter((c) => c.extractStatus === 'ok');
  const passedBy = new Map(); for (const v of verdicts) if (v.passed) passedBy.set(`${v.axis}|${v.key}`, v.cid);

  // A: rows subjects (taxonomy order, then other:* seen), cols laws in first-seen order
  const laws = []; for (const p of procs) for (const l of p.legal) if (!laws.includes(l.law)) laws.push(l.law);
  const subjectKeys = [...Object.keys(subjects), ...new Set(ok.flatMap((c) => c.subjects).filter((s) => s.startsWith('other:')))];
  const rowsA = subjectKeys.map((key) => {
    const cells = {}; for (const law of laws) cells[law] = { pids: [] };
    for (const c of ok) if (c.subjects.includes(key)) for (const l of byPid.get(c.pid)?.legal ?? []) if (!cells[l.law].pids.includes(c.pid)) cells[l.law].pids.push(c.pid);
    const lawsHit = laws.filter((l) => cells[l].pids.length);
    return { key, label: subjects[key] ?? key.slice(6), cells, lawsHit: lawsHit.length, candidate: lawsHit.length >= 2, passedCid: passedBy.get(`same-subject|${key}`) ?? null };
  }).filter((r) => r.lawsHit > 0);

  // C: rows real orgs, cols milestones by msOrder
  const msList = [...new Map(procs.map((p) => [p.ms, p])).values()].sort((a, b) => a.msOrder - b.msOrder)
    .map((p) => ({ ms: p.ms, name: p.msName, critical: !!p.onCritical }));
  const orgRows = new Map();
  for (const c of ok) {
    if (c.orgKind !== 'org') continue;
    if (!orgRows.has(c.org)) orgRows.set(c.org, { org: c.org, label: c.orgLabel, cells: Object.fromEntries(msList.map((m) => [m.ms, { count: 0, pids: [] }])) });
    const p = byPid.get(c.pid); if (!p) continue;
    const cell = orgRows.get(c.org).cells[p.ms]; cell.pids.push(c.pid); if (ROUNDTRIP.has(c.act)) cell.count++;
  }
  const rowsC = [...orgRows.values()].map((r) => ({ ...r, passedCids: verdicts.filter((v) => v.passed && v.axis === 'org-roundtrip' && v.key.startsWith(r.org + '@')).map((v) => v.cid) }))
    .sort((a, b) => Object.values(b.cells).reduce((s, c) => s + c.count, 0) - Object.values(a.cells).reduce((s, c) => s + c.count, 0));
  return { A: { cols: laws, rows: rowsA }, C: { cols: msList, rows: rowsC } };
}

export function renderReview({ procs, cards, verdicts, improvements = [], subjects, meta }) {
  const { A, C } = buildMatrices({ procs, cards, verdicts, subjects });
  const impByCid = new Map(improvements.map((i) => [i.cid, i]));
  const cellA = (r, law) => { const c = r.cells[law]; if (!c.pids.length) return '<td></td>';
    const cls = r.passedCid ? 'pass' : r.candidate ? 'cand' : 'one';
    return `<td class="${cls} click" data-pids="${esc(c.pids.join(','))}">${c.pids.length}</td>`; };
  const tableA = `<table id="matA"><thead><tr><th>심사 지표</th>${A.cols.map((l) => `<th>${esc(l)}</th>`).join('')}<th>법률 수</th><th>묶음</th></tr></thead><tbody>${
    A.rows.map((r) => `<tr><td class="fold">${esc(r.label)}<small>${esc(r.key)}</small></td>${A.cols.map((l) => cellA(r, l)).join('')}<td>${r.lawsHit}</td><td>${r.passedCid ? `<b>${esc(r.passedCid)}</b>${impByCid.get(r.passedCid) ? ' · ' + esc(impByCid.get(r.passedCid).id) : ''}` : (r.candidate ? '후보' : '')}</td></tr>`).join('')}</tbody></table>`;
  const cellC = (r, m) => { const c = r.cells[m.ms]; if (!c.pids.length) return `<td class="${m.critical ? 'crit' : ''}"></td>`;
    const cls = c.count >= 2 ? 'cand' : c.count === 1 ? 'one' : 'zero';
    return `<td class="${cls} click ${m.critical ? 'crit' : ''}" data-pids="${esc(c.pids.join(','))}">${c.count}<small>/${c.pids.length}</small></td>`; };
  const tableC = `<table id="matB"><thead><tr><th>기관</th>${C.cols.map((m) => `<th class="${m.critical ? 'crit' : ''}">${esc(m.ms)}<small>${esc(m.name)}</small></th>`).join('')}<th>묶음</th></tr></thead><tbody>${
    C.rows.map((r) => `<tr><td class="fold">${esc(r.label)}</td>${C.cols.map((m) => cellC(r, m)).join('')}<td>${r.passedCids.map(esc).join(', ')}</td></tr>`).join('')}</tbody></table>`;
  const clusters = verdicts.map((v) => `<div class="cl ${v.passed ? 'pass' : ''}"><b>${esc(v.cid)}</b> ${v.axis === 'same-subject' ? '같은 지표' : '기관 왕복'} · ${esc(v.key)} · 절차 ${v.pids.length}${v.passed ? ` · <span class="ok">통과</span>${impByCid.get(v.cid) ? ' · ' + esc(impByCid.get(v.cid).id) + ' ' + esc(impByCid.get(v.cid).title) : ''}` : ` · <span class="no">${esc(v.reason ?? '탈락')}</span>`}
    <ul>${v.pairs.filter((p) => p.mergeable).map((p) => `<li>${esc(p.a)} × ${esc(p.b)} — ${esc(p.reason)}</li>`).join('')}</ul></div>`).join('');
  const data = { procs: Object.fromEntries(procs.map((p) => [p.pid, { name: p.name, ms: p.ms, actor: p.actorRaw, legal: p.legal.map((l) => `${l.law} ${l.article}`), card: cards[p.pid] ? { act: cards[p.pid].act, subjects: cards[p.pid].subjects, clock: cards[p.pid].clock } : null }])) };
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f4f7f5;color:#12241c;font-family:"Apple SD Gothic Neo","Pretendard",sans-serif;padding-right:380px}
header{background:#0b1a13;color:#f4faf7;padding:26px 36px 18px}
.kick{color:#65d7ad;font-family:ui-monospace,monospace;font-size:13px;font-weight:700;letter-spacing:.08em;margin-bottom:8px}
h1{font-size:26px;font-weight:800} h2{font-size:16px;margin:26px 36px 8px}
.sub{margin-top:8px;color:#a8bcb2;font-size:13px;line-height:1.5;word-break:keep-all}
.legend{display:flex;gap:16px;flex-wrap:wrap;padding:10px 36px;background:#fff;border-bottom:1px solid #e2e8e4;font-size:12px}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-1px;border:1px solid}
table{margin:0 36px;border-collapse:collapse;background:#fff;font-size:12px}
th,td{border:1px solid #d7e0db;padding:5px 7px;vertical-align:top;text-align:center;min-width:34px}
th{background:#0b1a13;color:#e8f6ef;font-size:10.5px;font-weight:800;max-width:110px;word-break:keep-all}
th small,td small{display:block;font-weight:400;color:#9fb5aa;font-size:9.5px}
td.fold{text-align:left;font-weight:800;white-space:nowrap} td.fold small{color:#7d938a}
td.one{background:#eef8f2} td.cand{background:#fdf8e3;font-weight:800} td.pass{background:#fdf8e3;outline:2px solid #d9a821;outline-offset:-2px;font-weight:800}
td.zero{background:#f6f6f6;color:#9aa} th.crit{background:#163325} td.crit{box-shadow:inset 0 0 0 999px rgba(31,137,98,.06)}
td.click{cursor:pointer} td.click:hover{filter:brightness(.95)}
.cl{margin:8px 36px;padding:8px 12px;background:#fff;border:1px solid #d7e0db;border-radius:6px;font-size:12.5px} .cl.pass{border-color:#d9a821}
.cl ul{margin:4px 0 0 16px;color:#45564d} .ok{color:#1f8962;font-weight:800} .no{color:#a55}
#panel{position:fixed;top:0;right:0;width:370px;height:100vh;overflow:auto;background:#fff;border-left:1px solid #d7e0db;padding:16px;font-size:12.5px}
#panel h3{font-size:13px;margin-bottom:8px} #panel .p{border-bottom:1px solid #eee;padding:6px 0} #panel .p b{display:block} #panel .cite{color:#17573f;font-family:ui-monospace,monospace;font-size:11px}
</style></head><body>
<header><div class="kick">복합민원 비교대조 판 · ${esc(meta.asOf)} · 엔진 산출</div><h1>${esc(meta.title)}</h1>
<p class="sub">위 표: 행 = 심사 지표, 열 = 법률. 한 행에 서로 다른 법 칸이 2개 이상이면 통합 후보(노랑), 판정 통과는 테두리. 아래 표: 행 = 기관, 열 = 마일스톤(착수 순). 칸 = 협의·심의 횟수/절차 수. 진한 열 = 크리티컬. 칸을 누르면 오른쪽에 절차·조문.</p></header>
<div class="legend"><span><i style="background:#eef8f2;border-color:#1f8962"></i>1개 법</span><span><i style="background:#fdf8e3;border-color:#d9a821"></i>후보</span><span><i style="background:#fdf8e3;border-color:#d9a821;outline:2px solid #d9a821"></i>판정 통과</span></div>
<h2>A. 같은 지표를 다른 법이 심사한다 (${A.rows.filter((r) => r.candidate).length} 후보 / ${A.rows.filter((r) => r.passedCid).length} 통과)</h2>
<div style="overflow-x:auto">${tableA}</div>
<h2>C. 같은 기관에 몇 번 가나 (${C.rows.length} 기관)</h2>
<div style="overflow-x:auto">${tableC}</div>
<h2>묶음 ${verdicts.length} · 통과 ${verdicts.filter((v) => v.passed).length} · 카드 ${improvements.length}</h2>
${clusters}
<aside id="panel"><h3>칸을 누르면 절차가 여기 뜹니다</h3></aside>
<script>
const DATA = ${JSON.stringify(data)};
document.querySelectorAll('td.click').forEach((td) => td.addEventListener('click', () => {
  const pids = td.dataset.pids.split(',');
  document.getElementById('panel').innerHTML = '<h3>절차 ' + pids.length + '</h3>' + pids.map((id) => { const p = DATA.procs[id]; if (!p) return '';
    return '<div class="p"><b>' + id + '</b>' + p.ms + ' · ' + p.name + ' · ' + p.actor + (p.card ? ' · ' + p.card.act + ' · [' + p.card.subjects.join(', ') + ']' + (p.card.clock && p.card.clock.days ? ' · ' + p.card.clock.days + '일' : '') : '') + '<div class="cite">' + p.legal.join('<br>') + '</div></div>'; }).join('');
}));
</script></body></html>`;
}

export async function writeReview({ png = false } = {}) {
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const cards = readJson(path.join(OUT_COMPARE, 'cards.json'));
  const verdicts = readJson(path.join(OUT_COMPARE, 'verdicts.json'));
  const impFile = path.join(OUT_COMPARE, 'cards-out.json');
  const improvements = fs.existsSync(impFile) ? readJson(impFile) : [];
  const html = renderReview({ procs, cards, verdicts, improvements, subjects: loadSubjects(), meta: { title: '산단 지정 의제 덩어리 — 절차 비교대조 판', asOf: new Date().toISOString().slice(0, 10) } });
  const out = path.join(OUT, 'review.html');
  fs.writeFileSync(out, html);
  console.log('html written:', out);
  if (png) {
    const { chromium } = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x.js'))('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 2400, height: 900 }, deviceScaleFactor: 2 });
    await page.goto('file://' + out); await page.waitForTimeout(300);
    await page.screenshot({ path: out.replace(/\.html$/, '.png'), fullPage: true });
    await browser.close();
    console.log('png written');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  await writeReview({ png: process.argv.includes('--png') });
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/emit-review.test.mjs`
Expected: `# pass 3`

- [ ] **Step 5: 커밋**

```bash
cd ~/korea100
git add artifacts/complex-minwon/_lib/compare/emit-review.mjs artifacts/complex-minwon/_lib/compare/test/emit-review.test.mjs
git commit -m "feat(compare): 비교대조 판 — 지표×법률·기관×마일스톤 매트릭스, 칸 클릭 패널, PNG"
```

---

### Task 10: 체계도 입력 생성 (`emit-casedata.mjs`)

**Files:**
- Create: `artifacts/complex-minwon/_lib/compare/emit-casedata.mjs`
- Test: `artifacts/complex-minwon/_lib/compare/test/emit-casedata.test.mjs`

`_lib/gen.mjs`가 요구하는 `case-data.mjs` export: `meta{slug,kick,shortName,checkedAt,probeLaw,title,titleFull,titleImprove,subtitle,source,volume,stats[],leverNote,notes[]}`, `lanes[{id,name,sub,width}]`, `gates[{id,name,sub}]`, `nodes[{id,lane,gate,kind:'rule'|'inferred',org,title,desc,basis[]}]`, `edges[[from,to,'seq'|'par'|'opt']]`, `groups{}`, `orgOrder[]`, `improvements[]`. gen은 edge 양끝·lane·gate·org 존재를 검사하고 없으면 throw한다.

매핑:
- **lanes** = 정규화 기관 라벨. 순서: 신청인(민원인) 레인이 맨 앞(gen이 `lanes[0]`을 👤로 표시), 다음 역할, 다음 실제 기관은 절차 수 내림차순, 위원회는 맨 뒤. 폭: 절차 수 ≤ 8이면 320, ≤ 20이면 400, 그 이상 480.
- **gates** = 마일스톤 12개, `msOrder` 순. `id` = 마일스톤 id(`N36`…), name = msName 앞 18자, sub = `절차 N · 크리티컬` 여부.
- **nodes** = 절차 222개. id = `${ms}_${instIndex}_${nodeId}`, lane = 그 절차 카드의 org 레인, gate = ms, kind = legal이 있으면 `rule` 아니면 `inferred`, org = actorRaw, title = name, desc = action 앞 110자, basis = legal.map(`${law} ${article}`).
- **edges** = (1) 제도 `process.edges` 중 양끝이 편입된 절차인 것: type `sequence`→`seq`, `conditional`·`optional`→`opt`, 그 외→`par`. (2) 마일스톤 간: 프로젝트 `requires`(strength hard)로 producer→consumer 마일스톤 쌍마다 producer의 **마지막 절차**→consumer의 **첫 절차** `seq` 1개. 편입 밖 마일스톤은 무시.
- **improvements** = `cards-out.json` 그대로(`nodes`는 이미 case-data id).

- [ ] **Step 1: 실패하는 테스트**

`test/emit-casedata.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCaseData, renderCaseDataModule } from '../emit-casedata.mjs';
import { loadProcedures } from '../load.mjs';
import { loadOrgs } from '../lib/normalize.mjs';

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const opts = { projectFile: path.join(FX, 'project.json'), pathFile: path.join(FX, 'path.json'), institutionsDir: path.join(FX, 'institutions') };
const procs = loadProcedures({ ...opts, milestones: ['M1', 'M2'] });
const card = (pid, org, orgLabel, orgKind) => ({ pid, org, orgLabel, orgKind, act: 'consult', subjects: [], extractStatus: 'ok' });
const cards = Object.fromEntries(procs.map((p) => [p.pid, /환경부/.test(p.actorRaw) ? card(p.pid, 'moef-climate', '기후에너지환경부', 'org') : /위원회/.test(p.actorRaw) ? card(p.pid, 'cmte-traffic', '교통영향평가심의위원회', 'org') : card(p.pid, 'applicant', '신청인·사업시행자', 'applicant')]));
const improvements = [{ id: 'I1', kind: 'merge', nodes: ['M1_0_P02', 'M2_1_P01'], pids: ['M1:eia-mini:P02', 'M2:traffic-mini:P01'], title: 't', why: 'w', lever: 'l', targets: ['x — 환경영향평가법 제29조제1항'] }];

const cd = buildCaseData({ procs, cards, improvements, project: JSON.parse(fs.readFileSync(path.join(FX, 'project.json'), 'utf8')), orgs: loadOrgs(), meta: { slug: 'fx', checkedAt: '2026-09-05' }, institutionsDir: path.join(FX, 'institutions') });

test('lanes: applicant first, committees last, every node lane/gate exists', () => {
  assert.equal(cd.lanes[0].name, '신청인·사업시행자');
  assert.equal(cd.lanes[cd.lanes.length - 1].name, '교통영향평가심의위원회');
  for (const n of cd.nodes) { assert.ok(cd.lanes.find((l) => l.id === n.lane), n.id); assert.ok(cd.gates.find((g) => g.id === n.gate), n.id); assert.ok(n.org); }
});

test('gates follow msOrder and node ids use ms_instIndex_nodeId', () => {
  assert.deepEqual(cd.gates.map((g) => g.id), ['M1', 'M2']);
  assert.ok(cd.nodes.find((n) => n.id === 'M1_0_P02'));
  assert.ok(cd.nodes.find((n) => n.id === 'M2_1_P01'));
  assert.equal(cd.nodes.find((n) => n.id === 'M1_0_P02').kind, 'rule');
  assert.deepEqual(cd.nodes.find((n) => n.id === 'M1_0_P02').basis, ['환경영향평가법 제29조제1항']);
});

test('edges: institution edges mapped by type, plus one seq edge per hard milestone dependency; all endpoints exist', () => {
  const ids = new Set(cd.nodes.map((n) => n.id));
  for (const [a, b] of cd.edges) { assert.ok(ids.has(a), a); assert.ok(ids.has(b), b); }
  assert.ok(cd.edges.some(([a, b, k]) => a === 'M1_0_P01' && b === 'M1_0_P02' && k === 'seq'));
  assert.ok(cd.edges.some(([a, b, k]) => a === 'M1_0_P02' && b === 'M1_0_P03' && k === 'opt'));
  assert.ok(cd.edges.some(([a, b, k]) => a === 'M1_0_P03' && b === 'M2_1_P01' && k === 'seq'), 'M1 last → M2 first');
  assert.ok(!cd.edges.some(([, b]) => b.endsWith('_P04')), 'edge to unloaded P04 dropped');
});

test('improvements pass through and reference existing nodes; module renders and imports', async () => {
  assert.equal(cd.improvements[0].id, 'I1');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cd-')), 'case-data.mjs');
  fs.writeFileSync(f, renderCaseDataModule(cd));
  const mod = await import('file://' + f);
  assert.equal(mod.nodes.length, cd.nodes.length); assert.equal(mod.meta.slug, 'fx'); assert.deepEqual(mod.groups, {});
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/emit-casedata.test.mjs`
Expected: FAIL — `Cannot find module '../emit-casedata.mjs'`

- [ ] **Step 3: 구현**

`emit-casedata.mjs`:
```js
// 4단계(체계도 입력). 절차 레코드 + 카드 + 개선 카드 → _lib/gen.mjs가 읽는 case-data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './lib/io.mjs';
import { ROOT, OUT, OUT_COMPARE } from './lib/paths.mjs';
import { loadOrgs, normalizeOrg } from './lib/normalize.mjs';

const EDGE_KIND = { sequence: 'seq', conditional: 'opt', optional: 'opt' };
const laneWidth = (n) => (n <= 8 ? 320 : n <= 20 ? 400 : 480);

export function buildCaseData({ procs, cards, improvements, project, orgs, meta, institutionsDir = path.join(ROOT, 'web/data/institutions') }) {
  const instIndex = new Map(); for (const p of procs) if (!instIndex.has(p.institution)) instIndex.set(p.institution, instIndex.size);
  const nodeIdOf = (p) => `${p.ms}_${instIndex.get(p.institution)}_${p.nodeId}`;

  // lane key per procedure: card org if extracted, else normalize actorRaw directly
  const laneKeyOf = (p) => { const c = cards[p.pid]; if (c && c.org) return { key: c.org, label: c.orgLabel, kind: c.orgKind }; const n = normalizeOrg(p.actorRaw, orgs); return { key: n.org, label: n.label, kind: n.kind }; };
  const laneStats = new Map();
  for (const p of procs) { const k = laneKeyOf(p); if (!laneStats.has(k.key)) laneStats.set(k.key, { ...k, n: 0 }); laneStats.get(k.key).n++; }
  const rank = (l) => (l.kind === 'applicant' ? 0 : l.kind === 'role' ? 1 : l.key.startsWith('cmte-') ? 3 : 2);
  const laneList = [...laneStats.values()].sort((a, b) => rank(a) - rank(b) || b.n - a.n || a.label.localeCompare(b.label));
  const laneId = new Map(laneList.map((l, i) => [l.key, `L${i + 1}`]));
  const lanes = laneList.map((l) => ({ id: laneId.get(l.key), name: l.label, sub: `${l.kind === 'applicant' ? '민원인' : l.kind === 'role' ? '역할' : l.kind === 'unknown' ? '미분류' : '기관'} · 절차 ${l.n}`, width: laneWidth(l.n) }));

  const msList = [...new Map(procs.map((p) => [p.ms, p])).values()].sort((a, b) => a.msOrder - b.msOrder);
  const gates = msList.map((p) => ({ id: p.ms, name: p.msName.length > 18 ? p.msName.slice(0, 18) + '…' : p.msName, sub: `절차 ${procs.filter((q) => q.ms === p.ms).length}${p.onCritical ? ' · 크리티컬' : ''}` }));

  const nodes = procs.map((p) => ({ id: nodeIdOf(p), lane: laneId.get(laneKeyOf(p).key), gate: p.ms, kind: p.legal.length ? 'rule' : 'inferred', org: p.actorRaw || '미상',
    title: p.name, desc: p.action.length > 110 ? p.action.slice(0, 110) + '…' : p.action, basis: p.legal.length ? p.legal.map((l) => `${l.law} ${l.article}`) : undefined }));
  const ids = new Set(nodes.map((n) => n.id));

  const edges = [];
  const seen = new Set(); const push = (a, b, k) => { const key = `${a}>${b}`; if (ids.has(a) && ids.has(b) && a !== b && !seen.has(key)) { seen.add(key); edges.push([a, b, k]); } };
  for (const [slug, i] of instIndex) {
    const f = path.join(institutionsDir, `${slug}.json`); if (!fs.existsSync(f)) continue;
    const t = readJson(f);
    for (const e of t.process?.edges ?? []) for (const ms of new Set(procs.filter((p) => p.institution === slug).map((p) => p.ms))) push(`${ms}_${i}_${e.source}`, `${ms}_${i}_${e.target}`, EDGE_KIND[e.type] ?? 'par');
  }
  const producers = new Map(); for (const n of project.nodes ?? []) for (const a of n.produces ?? []) { if (!producers.has(a)) producers.set(a, []); producers.get(a).push(n.id); }
  const firstOf = (ms) => procs.find((p) => p.ms === ms), lastOf = (ms) => [...procs].reverse().find((p) => p.ms === ms);
  for (const n of project.nodes ?? []) for (const q of n.requires ?? []) if (q.strength === 'hard') for (const src of producers.get(q.artifact) ?? []) {
    const a = lastOf(src), b = firstOf(n.id); if (a && b) push(nodeIdOf(a), nodeIdOf(b), 'seq');
  }

  const orgOrder = [...new Set(improvements.flatMap((i) => i.targets.map((t) => t.split(' — ')[0])))];
  const rule = nodes.filter((n) => n.kind === 'rule').length;
  const fullMeta = {
    slug: meta.slug, kick: meta.kick ?? '복합민원 체계도 4호', shortName: meta.shortName ?? '산단 지정 의제 덩어리', checkedAt: meta.checkedAt,
    probeLaw: meta.probeLaw ?? procs[0]?.legal[0]?.law ?? null,
    title: meta.title ?? '복합민원 체계도 4호 — 산단 지정 의제 덩어리 (N36→N15)',
    titleFull: meta.titleFull ?? `산단 지정 의제 덩어리 — <b>마일스톤 ${gates.length} · 절차 ${nodes.length}</b>`,
    titleImprove: meta.titleImprove ?? '산단 지정 의제 덩어리 — 비교대조 엔진이 찾은 후보',
    subtitle: meta.subtitle ?? `워룸 gwangju-semiconductor-cluster의 KIPA 덩어리 합격 구간. 규정 ${rule} · 추론 ${nodes.length - rule}. 개선 카드는 _lib/compare 엔진 산출(추출→대조→판정→카드).`,
    source: meta.source ?? 'Korea100 워룸 gwangju-semiconductor-cluster · web/data/institutions 제도 템플릿 · 법제처 DRF 현행본',
    volume: null, stats: meta.stats ?? [{ label: '마일스톤', value: gates.length, unit: '개' }, { label: '절차', value: nodes.length, unit: '개' }, { label: '기관 레인', value: lanes.length, unit: '개' }, { label: '개선 카드', value: improvements.length, unit: '건' }],
    leverNote: meta.leverNote ?? '카드의 소관은 조문 소관이지 수행 기관이 아니다(1호 문법). 삭제·갈음 카드는 엔진이 내지 않는다.',
    notes: meta.notes ?? ['<b>생성 파일.</b> 엔진(artifacts/complex-minwon/_lib/compare)이 만든다. 손으로 고치지 말고 코드표·판정을 고친 뒤 다시 생성.'],
  };
  return { meta: fullMeta, lanes, gates, nodes, edges, groups: {}, orgOrder, improvements };
}

export const renderCaseDataModule = (cd) => [
  '// 생성 파일 — artifacts/complex-minwon/_lib/compare/emit-casedata.mjs. 손으로 고치지 말 것.',
  `export const meta = ${JSON.stringify(cd.meta, null, 2)};`,
  `export const lanes = ${JSON.stringify(cd.lanes, null, 2)};`,
  `export const gates = ${JSON.stringify(cd.gates, null, 2)};`,
  `export const nodes = ${JSON.stringify(cd.nodes, null, 2)};`,
  `export const edges = ${JSON.stringify(cd.edges)};`,
  `export const groups = ${JSON.stringify(cd.groups)};`,
  `export const orgOrder = ${JSON.stringify(cd.orgOrder)};`,
  `export const improvements = ${JSON.stringify(cd.improvements, null, 2)};`, '',
].join('\n');

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const procs = readJson(path.join(OUT_COMPARE, 'procedures.json'));
  const cards = readJson(path.join(OUT_COMPARE, 'cards.json'));
  const impFile = path.join(OUT_COMPARE, 'cards-out.json');
  const improvements = fs.existsSync(impFile) ? readJson(impFile) : [];
  const project = readJson(path.join(ROOT, 'web/data/mega-projects/projects/gwangju-semiconductor-cluster.json'));
  const cd = buildCaseData({ procs, cards, improvements, project, orgs: loadOrgs(), meta: { slug: 'deemed-bundle', checkedAt: new Date().toISOString().slice(0, 10) } });
  fs.writeFileSync(path.join(OUT, 'case-data.mjs'), renderCaseDataModule(cd));
  console.log(`case-data: lanes ${cd.lanes.length} · gates ${cd.gates.length} · nodes ${cd.nodes.length} · edges ${cd.edges.length} · improvements ${cd.improvements.length}`);
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/emit-casedata.test.mjs`
Expected: `# pass 4`

- [ ] **Step 5: 전체 테스트 + 커밋**

Run: `node --test test/`
Expected: 모든 파일 pass, fail 0.

```bash
cd ~/korea100
git add artifacts/complex-minwon/_lib/compare/emit-casedata.mjs artifacts/complex-minwon/_lib/compare/test/emit-casedata.test.mjs
git commit -m "feat(compare): 체계도 4호 입력 생성 — 레인=정규화 기관, 관문=마일스톤, 제도 흐름+hard 의존 배선"
```

---
### Task 11: 실행 1 — 로드 · 법령 스냅샷 · 추출 · 대조 · 판정 · 카드 (실제 AI 호출)

**Files:**
- Create: `artifacts/complex-minwon/04-deemed-bundle/compare/*.json` (procedures, cards, unknown-orgs, other-subjects, candidates, verdicts, cards-out, rejected)
- Create: `artifacts/complex-minwon/04-deemed-bundle/laws/*.json`
- Create: `artifacts/complex-minwon/04-deemed-bundle/improvements.mjs`

여기서부터 `claude -p`를 실제로 부른다. 절차 222회 + 묶음 수십 회. 캐시가 있으니 중단 후 재실행해도 이어진다. `claude` CLI가 PATH에 있어야 한다(`which claude`).

- [ ] **Step 1: 로드**

Run: `cd ~/korea100/artifacts/complex-minwon/_lib/compare && node load.mjs`
Expected: `procedures 222 · milestones 12 · institutions 21 · laws <N> → …/04-deemed-bundle/compare/procedures.json`

- [ ] **Step 2: 법령 스냅샷**

절차에 나오는 법령명 전부를 DRF에서 받는다. `fetch-laws.py`는 **현재 폴더의 `laws/`** 에 저장하므로 04 폴더에서 실행한다.
```bash
cd ~/korea100/artifacts/complex-minwon/04-deemed-bundle
node -e "const p=require('./compare/procedures.json');console.log([...new Set(p.flatMap(x=>x.legal.map(l=>l.law)))].join('\n'))" > /tmp/claude-laws.txt
while read -r law; do [ -n "$law" ] && python3 ../_lib/fetch-laws.py fetch "$law" || echo "FETCH FAIL: $law"; done < /tmp/claude-laws.txt
ls laws | wc -l
```
Expected: 법령 수만큼 `laws/<법령명>.json`. `FETCH FAIL`이 난 법령(약칭·시행규칙·고시 등)은 `python3 ../_lib/fetch-laws.py search "<이름 일부>"`로 정확한 이름을 찾아 다시 받고, 끝내 없는 것은 `README.md`의 "스냅샷 없는 법령" 목록에 적는다. 그 법령의 조문은 카드 targets에서 (a) 절차 legal 정확 일치로만 통과한다.

- [ ] **Step 3: 추출 (AI 222회)**

Run: `cd ~/korea100/artifacts/complex-minwon/_lib/compare && node extract.mjs 2>extract.log`
Expected: `cards 222 · ok ≥ 200 · failed ≤ 22 · unknown orgs 0~3 · other subjects <M>`.
- `failed`가 22를 넘으면 `extract.log`와 `.cache/extract/*.json`의 `raw`를 열어 프롬프트 문제인지(형식 위반이면 `buildExtractPrompt` 문구 수정 후 `--fresh`) 조문 문제인지(evidence 불일치가 많으면 규칙 5 문구 강화) 본다.
- `unknown-orgs.json`이 비어 있지 않으면 Task 4 코드표에 추가하고 `node extract.mjs`를 다시 돌린다(캐시 덕에 AI는 다시 안 부른다. 카드의 org만 재계산된다).
- `other-subjects.json`에서 3회 이상 나온 라벨은 `subjects.json`에 코드로 추가하고 **그 절차만** 다시 추출한다: `node extract.mjs --fresh`는 전체 재호출이므로 쓰지 말고, 해당 pid의 캐시 파일을 지운 뒤 `node extract.mjs`.

- [ ] **Step 4: 대조**

Run: `node match.mjs`
Expected: `candidates <K> · same-subject <a> · org-roundtrip <c> · on critical <k>`. K가 0이면 cards.json의 subjects가 비어 있는지 확인(추출 규칙 2가 너무 보수적이면 "실체 심사가 없는 절차는 빈 배열" 문구를 유지한 채 예시를 추가).

- [ ] **Step 5: 판정 (AI 묶음 수만큼)**

Run: `node judge.mjs 2>judge.log`
Expected: `clusters K · passed <p> · failed calls 0~2 · ignored drop suggestions <d>`

- [ ] **Step 6: 카드 (AI 통과 묶음 수만큼)**

Run: `node emit-cards.mjs 2>cards.log`
Expected: `improvements <p'> · rejected <r>`. `rejected.json`의 이유가 `no valid target`이면 Step 2 스냅샷 누락인지 확인.

- [ ] **Step 7: 커밋**

```bash
cd ~/korea100
git add artifacts/complex-minwon/04-deemed-bundle/compare artifacts/complex-minwon/04-deemed-bundle/laws artifacts/complex-minwon/04-deemed-bundle/improvements.mjs artifacts/complex-minwon/_lib/compare/orgs.json artifacts/complex-minwon/_lib/compare/subjects.json
git commit -m "feat(04): 산단 지정 의제 덩어리 222건 추출·대조·판정·카드 1차 실행 결과"
```
(`extract.log` 등 로그는 커밋하지 않는다. `.gitignore`에 `*.log` 추가.)

---

### Task 12: 실행 2 — 비교대조 판 · 체계도 4호 판 · 검증 · README

**Files:**
- Create: `artifacts/complex-minwon/04-deemed-bundle/review.html`, `review.png`
- Create: `artifacts/complex-minwon/04-deemed-bundle/case-data.mjs`, `gen.mjs`, `verify-basis.mjs`, `verification.json`
- Create: `artifacts/complex-minwon/04-deemed-bundle/deemed-bundle-full.html/.png`, `deemed-bundle-improve.html/.png`
- Create: `artifacts/complex-minwon/04-deemed-bundle/README.md`
- Modify: `artifacts/complex-minwon/README.md` (표에 4호 행 추가)

- [ ] **Step 1: 비교대조 판**

Run: `cd ~/korea100/artifacts/complex-minwon/_lib/compare && node emit-review.mjs --png`
Expected: `html written … / png written`. 브라우저로 `review.html`을 열어 A표에 노랑 칸이 있고 칸 클릭 시 오른쪽 패널에 절차·조문이 뜨는지 본다.

- [ ] **Step 2: case-data 생성과 래퍼 2줄**

Run: `node emit-casedata.mjs`
Expected: `case-data: lanes <L> · gates 12 · nodes 222 · edges <E> · improvements <p'>`

`04-deemed-bundle/gen.mjs`:
```js
import { build } from "../_lib/gen.mjs";
await build(import.meta.url, { png: process.argv.includes("--png") });
```
`04-deemed-bundle/verify-basis.mjs`:
```js
import { verify } from "../_lib/verify-basis.mjs";
await verify(import.meta.url);
```

- [ ] **Step 3: 조문 대조**

Run: `cd ~/korea100/artifacts/complex-minwon/04-deemed-bundle && node verify-basis.mjs`
Expected: `citations <N>, passed <N>, failed 0, negative control OK`. 실패가 있으면 (a) 스냅샷 없는 법령이면 Task 11 Step 2로 돌아가 받거나 README에 기록하고 그 절차의 basis는 그대로 둔다(기록된 미대조 조문은 `verification.json`에 남는다), (b) 항·호 번호가 제도 템플릿에서 틀린 것이면 `web/data/institutions/<slug>.json`을 고치지 말고 README "템플릿 오류 후보"에 적는다. 이 판은 템플릿을 수정하지 않는다. `failed`가 남아도 다음 단계로 간다(exit 1은 무시).

- [ ] **Step 4: 체계도 두 장 + 배선 검사**

Run:
```bash
cd ~/korea100/artifacts/complex-minwon/04-deemed-bundle && node gen.mjs --png
cd .. && node _lib/check-overlap.mjs 04-deemed-bundle/deemed-bundle-full.html 04-deemed-bundle/deemed-bundle-improve.html
```
Expected: `html written: deemed-bundle-full.html, deemed-bundle-improve.html`, PNG 2장, check-overlap 종료코드 0(관통 0 · 겹침 0).
관통·겹침이 남으면 **알고리즘을 바꾸지 않고** `emit-casedata.mjs`의 `laneWidth`를 키운다(320/400/480 → 400/480/560). 그래도 남으면 절차 수가 많은 레인부터 폭을 +80씩. 세 번 안에 0이 안 되면 남은 수를 README에 적고 멈춘다(사용자 판단).

- [ ] **Step 5: README**

`04-deemed-bundle/README.md`:
```markdown
# 복합민원 체계도 4호 — 산단 지정 의제 덩어리 (N36→N15)

asOf: <실행일>
엔진: `../_lib/compare/` (load → extract → match → judge → emit). 이 폴더의 `case-data.mjs`·`improvements.mjs`·`compare/*.json`은 생성 파일이다.

## 숫자
| 항목 | 값 |
|---|---|
| 마일스톤 / 절차 / 제도 | 12 / 222 / 21 |
| 추출 ok / failed | <n> / <n> |
| 후보 묶음 (A 같은 지표 / C 기관 왕복) | <n> (<a> / <c>) |
| 판정 통과 | <n> |
| 개선 카드 (merge / automate / shorten) | <n> (<m>/<a>/<s>) |
| 조문 대조 | <passed>/<citations>, 음성 대조군 OK |
| 배선 | 관통 0 · 겹침 0 |

## 판
- `review.html` / `.png` — 비교대조 판 (지표×법률, 기관×마일스톤)
- `deemed-bundle-full.html` / `-improve.html` / `.png` — 체계도 4호 (기관 레인 × 관문)

## 스냅샷 없는 법령
<목록 또는 "없음">

## 템플릿 오류 후보 (verify-basis 실패)
<목록 또는 "없음">

## 재실행
```
cd ../_lib/compare && node load.mjs && node extract.mjs && node match.mjs && node judge.mjs && node emit-cards.mjs && node emit-review.mjs --png && node emit-casedata.mjs
cd ../../04-deemed-bundle && node verify-basis.mjs; node gen.mjs --png && node ../_lib/check-overlap.mjs deemed-bundle-*.html
```
```
`<…>` 자리는 실제 실행 결과 숫자로 채운다.

`artifacts/complex-minwon/README.md` 표에 행 추가:
```
| 4 | 산단 지정 의제 덩어리 (N36→N15, 산집법·환평법·특별법 등 <N>개 법령) | — | 222 = 규정 <r> + 추론 <i> | <n> (엔진 산출) | `04-deemed-bundle/` |
```
그리고 "도구" 절 끝에 한 줄: `- `compare/` — 절차 비교대조 엔진(추출→대조→판정→카드). `04-deemed-bundle/README.md` 참조.`

- [ ] **Step 6: 커밋**

```bash
cd ~/korea100
git add artifacts/complex-minwon/04-deemed-bundle artifacts/complex-minwon/README.md
git commit -m "feat(04): 비교대조 판 + 체계도 4호 full/improve (222절차·관통 0·겹침 0) + README"
```

---

### Task 13: 재발견 검사 + 골든 카드 20개

**Files:**
- Create: `artifacts/complex-minwon/_lib/compare/golden/rediscovery.json`
- Create: `artifacts/complex-minwon/_lib/compare/check-rediscovery.mjs`
- Create: `artifacts/complex-minwon/_lib/compare/golden/cards.golden.json`
- Create: `artifacts/complex-minwon/_lib/compare/compare-golden.mjs`
- Test: `artifacts/complex-minwon/_lib/compare/test/rediscovery.test.mjs`

배경: 스펙 6절의 재발견 대상(3호 I2·I5, 1호 협의 시계 5개)은 덩어리 12개 마일스톤 밖에 있다. 3호는 워룸 N03(제도 `semiconductor-cluster-designation-coordination`, 7절차), 1호는 제도 `building-permit-use-approval`(28절차)이다. 그래서 재발견은 **별도 입력으로 엔진을 한 번 더 돌려** 확인한다. 로더의 `--milestones N03` / `--institutions building-permit-use-approval` 옵션이 그 용도다. 산출은 `OUT/compare/rediscovery-<name>/`에 따로 둔다.

기대는 "이 조문들을 담은 절차가 2개 이상 한 묶음에 들어 있는가"로 정의한다. 조문 문자열은 `article` 접두 일치(예 `제26조`는 `제26조제1항`에 맞음).

음성 대조군(스펙 6절): 덩어리 12개 + 군공항 N32를 함께 넣어 돌린 뒤, N32 절차와 덩어리 절차가 **같은 묶음**에 들어가면 실패. 덩어리 222건은 Task 11 캐시로 재호출 없이 처리되고 N32의 6건만 새로 추출된다.

- [ ] **Step 1: 기대 묶음**

`golden/rediscovery.json`:
```json
{ "targets": [
  { "name": "3호 I5 — 특별법 §26 의제 협의를 지정 심의와 한 사건으로", "run": "n03",
    "must": [{ "law": "반도체산업 경쟁력 강화 및 지원에 관한 특별법", "article": "제26조" }, { "law": "반도체산업 경쟁력 강화 및 지원에 관한 특별법", "article": "제11조" }], "minMatch": 2 },
  { "name": "3호 I2 — 작성 단계 사전협의 + 지정 전 협의 시계 2회", "run": "n03",
    "must": [{ "law": "반도체산업 경쟁력 강화 및 지원에 관한 특별법 시행령", "article": "제17조제2항" }, { "law": "반도체산업 경쟁력 강화 및 지원에 관한 특별법", "article": "제11조제1항" }], "minMatch": 2 },
  { "name": "1호 I2 — 건축허가 협의 기한 4종을 하나로", "run": "building",
    "must": [{ "law": "건축법", "article": "제11조제6항" }, { "law": "국토의 계획 및 이용에 관한 법률", "article": "제61조" }, { "law": "소방시설 설치 및 관리에 관한 법률", "article": "제6조" }], "minMatch": 2 }
 ],
 "negatives": [ { "name": "군공항 N32는 덩어리와 묶이지 않는다", "run": "neg", "isolate": "N32" } ],
 "runs": { "n03": { "milestones": ["N03"] }, "building": { "institutions": ["building-permit-use-approval"] },
           "neg": { "milestones": ["N36","N09","N11","N12","N38","N39","N40","N13","N14","N37","N10","N15","N32"] } } }
```
(1호 must의 법령명은 `web/data/institutions/building-permit-use-approval.json`의 `legal_basis[].law` 표기로 맞춘다. 다르면 그 표기로 고친다.)

- [ ] **Step 2: 실패하는 테스트 (판정 함수만)**

`test/rediscovery.test.mjs`:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { rediscovered, isolated } from '../check-rediscovery.mjs';

const procs = [
  { pid: 'a', legal: [{ law: 'X법', article: '제26조제1항' }] },
  { pid: 'b', legal: [{ law: 'X법', article: '제11조제5항' }] },
  { pid: 'c', legal: [{ law: 'Y법', article: '제1조' }] },
];
const target = { name: 't', must: [{ law: 'X법', article: '제26조' }, { law: 'X법', article: '제11조' }], minMatch: 2 };

test('a cluster containing procedures for at least minMatch must-articles counts as rediscovered', () => {
  assert.equal(rediscovered(target, [{ cid: 'k', pids: ['a', 'b'] }], procs).found, 'k');
  assert.equal(rediscovered(target, [{ cid: 'k', pids: ['a', 'c'] }], procs).found, null);
});

test('isolated reports a cluster mixing the isolated milestone with others', () => {
  assert.equal(isolated('N32', [{ cid: 'k', pids: ['N32:a:P01', 'N14:b:P02'] }]), 'k');
  assert.equal(isolated('N32', [{ cid: 'k', pids: ['N32:a:P01', 'N32:a:P02'] }, { cid: 'j', pids: ['N14:b:P01', 'N11:c:P01'] }]), null);
});

test('article match is prefix-based on the same law', () => {
  assert.equal(rediscovered({ ...target, must: [{ law: 'X법', article: '제26조' }], minMatch: 1 }, [{ cid: 'k', pids: ['a'] }], procs).found, 'k');
  assert.equal(rediscovered({ ...target, must: [{ law: 'Z법', article: '제26조' }], minMatch: 1 }, [{ cid: 'k', pids: ['a'] }], procs).found, null);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test test/rediscovery.test.mjs`
Expected: FAIL — `Cannot find module '../check-rediscovery.mjs'`

- [ ] **Step 4: 구현**

`check-rediscovery.mjs`:
```js
// 골든 재발견 검사. rediscovery.json의 run마다 엔진(load→extract→match)을 별도 폴더에 돌리고, 기대 묶음이 candidates에 있는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './lib/io.mjs';
import { COMPARE, OUT_COMPARE } from './lib/paths.mjs';
import { loadProcedures } from './load.mjs';
import { extractAll } from './extract.mjs';
import { matchAll } from './match.mjs';
import { loadOrgs, loadSubjects } from './lib/normalize.mjs';

export function isolated(ms, clusters) {
  // ms의 절차가 다른 마일스톤 절차와 한 묶음에 있으면 그 cid를 돌려준다(위반). 없으면 null.
  for (const c of clusters) {
    const mine = c.pids.filter((p) => p.startsWith(ms + ':')), others = c.pids.filter((p) => !p.startsWith(ms + ':'));
    if (mine.length && others.length) return c.cid;
  }
  return null;
}

export function rediscovered(target, clusters, procs) {
  const m = new Map(procs.map((p) => [p.pid, p]));
  const hit = (pid, must) => (m.get(pid)?.legal ?? []).some((l) => l.law === must.law && l.article.startsWith(must.article));
  for (const c of clusters) {
    const matched = target.must.filter((must) => c.pids.some((pid) => hit(pid, must))).length;
    if (matched >= target.minMatch) return { found: c.cid, matched };
  }
  return { found: null, matched: 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const spec = readJson(path.join(COMPARE, 'golden', 'rediscovery.json'));
  const subjects = loadSubjects(), orgs = loadOrgs();
  const results = [];
  for (const [name, run] of Object.entries(spec.runs)) {
    const dir = path.join(OUT_COMPARE, `rediscovery-${name}`);
    const procs = loadProcedures(run.institutions ? { institutions: run.institutions } : { milestones: run.milestones });
    const { cards } = extractAll(procs, { subjects, orgs, log: (s) => process.stderr.write(s + '\n') });
    const clusters = matchAll(cards, procs);
    writeJson(path.join(dir, 'procedures.json'), procs); writeJson(path.join(dir, 'cards.json'), cards); writeJson(path.join(dir, 'candidates.json'), clusters);
    for (const t of spec.targets.filter((x) => x.run === name)) results.push({ name: t.name, ...rediscovered(t, clusters, procs) });
    for (const t of (spec.negatives ?? []).filter((x) => x.run === name)) { const bad = isolated(t.isolate, clusters); results.push({ name: t.name, found: bad ? null : 'isolated', matched: 0, violation: bad }); }
  }
  writeJson(path.join(OUT_COMPARE, 'rediscovery-report.json'), results);
  for (const r of results) console.log(r.found ? 'FOUND' : 'MISS ', r.name, r.found ? `→ ${r.found}` : `(matched ${r.matched})`);
  if (results.some((r) => !r.found)) process.exit(1);
}
```

- [ ] **Step 5: 통과 확인 + 실제 실행**

Run: `node --test test/rediscovery.test.mjs` → `# pass 3`
Run: `node check-rediscovery.mjs`
Expected: `FOUND` 4줄(재발견 3 + 음성 대조군 `isolated`). 음성 대조군이 `MISS`면 `violation`의 cid를 열어 N32 절차가 어느 지표로 묶였는지 보고, 그 지표가 `subjects.json`에서 지나치게 넓으면(예 `landuse`) 쪼갠다. 재발견 `MISS`가 있으면: (a) 해당 run의 `cards.json`에서 그 조문 절차들의 `subjects`·`act`를 본다. 지표가 비었으면 `subjects.json`에 코드가 없는 것이므로 추가(예 `deemed-consult: 의제 협의`)하고 캐시 삭제 후 재실행. (b) 지표는 있는데 묶이지 않았으면 두 절차의 법이 같아서 A축에서 걸러진 것 — C축이 잡아야 하는데 `act`가 consult가 아니면 추출 규칙 1의 설명에 "협의 요청·협의 회신·사전협의는 consult"를 추가. 두 번 고쳐도 MISS면 README에 기록하고 진행.

- [ ] **Step 6: 골든 카드 20개 라벨링 + 일치율**

`compare-golden.mjs`:
```js
// 사람이 라벨링한 20개 카드와 엔진 카드의 org·act·subjects 일치율.
import path from 'node:path';
import { readJson } from './lib/io.mjs';
import { COMPARE, OUT_COMPARE } from './lib/paths.mjs';

export function agreement(golden, cards) {
  let org = 0, act = 0, subj = 0, n = 0;
  for (const g of golden) {
    const c = cards[g.pid]; if (!c) continue; n++;
    if (c.org === g.org) org++;
    if (c.act === g.act) act++;
    const A = new Set(g.subjects), B = new Set(c.subjects ?? []);
    const inter = [...A].filter((x) => B.has(x)).length, union = new Set([...A, ...B]).size;
    subj += union === 0 ? 1 : inter / union;
  }
  return { n, org: org / n, act: act / n, subjects: subj / n };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const golden = readJson(path.join(COMPARE, 'golden', 'cards.golden.json'));
  const cards = readJson(path.join(OUT_COMPARE, 'cards.json'));
  const r = agreement(golden, cards);
  console.log(`golden ${r.n} · org ${(r.org * 100).toFixed(0)}% · act ${(r.act * 100).toFixed(0)}% · subjects(Jaccard) ${(r.subjects * 100).toFixed(0)}%`);
  if (r.org < 0.8 || r.act < 0.8 || r.subjects < 0.8) process.exit(1);
}
```

`golden/cards.golden.json` 작성 규칙: `procedures.json`에서 **N14 절차를 pid 정렬 순으로 앞 12개 + N11·N12·N39·N40에서 각 2개(앞 2개)** = 20개. 각 항목은 절차의 `name`·`action`·`legal`을 **직접 읽고** `org`(코드), `act`, `subjects`를 적는다. 엔진 카드를 보고 베끼지 않는다(그러면 검사가 아니다). 형식:
```json
[ { "pid": "N14:development-permit:P01", "org": "applicant", "act": "apply", "subjects": ["landform"] } ]
```

Run: `node compare-golden.mjs`
Expected: `golden 20 · org ≥80% · act ≥80% · subjects ≥80%`. 미달 항목이 있으면 불일치 pid를 골라 보고, 라벨이 틀렸으면 골든을, 엔진이 틀렸으면 프롬프트를 고친다. 프롬프트를 고쳤으면 Task 11 Step 3부터 다시(캐시는 프롬프트 해시가 바뀌므로 자동 무효).

- [ ] **Step 7: 커밋**

```bash
cd ~/korea100
git add artifacts/complex-minwon/_lib/compare/golden artifacts/complex-minwon/_lib/compare/check-rediscovery.mjs artifacts/complex-minwon/_lib/compare/compare-golden.mjs artifacts/complex-minwon/_lib/compare/test/rediscovery.test.mjs artifacts/complex-minwon/04-deemed-bundle/compare/rediscovery-report.json
git commit -m "test(compare): 재발견 검사(3호 I2·I5, 1호 협의 시계) + 골든 카드 20개 일치율"
```

---

### Task 14: 워룸 연결 — `bundleId`

**Files:**
- Modify: `web/data/mega-projects/projects/gwangju-semiconductor-cluster.json` (N11·N12·N14·N37 노드에 필드 1개)
- Modify: `web/tools/gen-warroom.mjs:263-271` (gates.milestones map에 `bundleId` 통과)

- [ ] **Step 1: 소스 JSON에 필드 추가**

`web/data/mega-projects/projects/gwangju-semiconductor-cluster.json`의 `nodes[]`에서 id가 `N11`, `N12`, `N14`, `N37`인 객체에 `"bundleId": "04-deemed-bundle"`를 추가한다(다른 필드 변경 없음).
```bash
cd ~/korea100/web && node -e "
const fs=require('fs');const f='data/mega-projects/projects/gwangju-semiconductor-cluster.json';const d=JSON.parse(fs.readFileSync(f,'utf8'));
for(const n of d.nodes) if(['N11','N12','N14','N37'].includes(n.id)) n.bundleId='04-deemed-bundle';
fs.writeFileSync(f, JSON.stringify(d,null,2)+'\n');"
git diff --stat data/mega-projects/projects/gwangju-semiconductor-cluster.json
```
Expected: 4줄 추가. (파일의 기존 들여쓰기가 2칸이 아니면 `JSON.stringify(d,null,<기존 칸>)`으로 맞춰 diff가 4줄만 나오게 한다.)

- [ ] **Step 2: gen-warroom.mjs 통과**

`web/tools/gen-warroom.mjs` 263~271행의 `milestones:` map 안 객체에 한 필드:
```js
      .map((n) => ({
        id: n.id, name: n.name,
        procs: procs.filter((p) => p.ms === n.id).length,
        st: stOf.get(n.id),
        ...(n.bundleId ? { bundleId: n.bundleId } : {}),
      })),
```

- [ ] **Step 3: 재생성과 확인**

Run:
```bash
cd ~/korea100/web && node tools/gen-warroom.mjs && grep -c '"bundleId": "04-deemed-bundle"' public/warroom/p/gwangju-semiconductor-cluster/data.json
```
Expected: `4`. `path.json`의 `totalDays`·`critical`은 변하지 않아야 한다: `git diff --stat public/warroom/p/gwangju-semiconductor-cluster/path.json` → 변경 없음(있다면 `asOf`만).

- [ ] **Step 4: 커밋**

```bash
cd ~/korea100
git add web/data/mega-projects/projects/gwangju-semiconductor-cluster.json web/tools/gen-warroom.mjs web/public/warroom/p/gwangju-semiconductor-cluster/data.json
git commit -m "feat(warroom): N11·N12·N14·N37에 bundleId — 복합민원 4호 판 연결 키 (상태 머신 변경 없음)"
```

---

## 완료 기준 (스펙 6절) — 2026-09-05 최종 검증

- [x] `node --test test/` 전부 통과 (48/48)
- [x] `04-deemed-bundle/compare/procedures.json` 222건, `cards.json` ok 222/222
- [x] `candidates.json` 16, `verdicts.json` 통과 16/16, `cards-out.json` 카드 16개 전부 `targets` ≥ 1 · kind ∈ merge(14)|automate(1)|shorten(1)
- [x] `review.html`·`.png`, `deemed-bundle-full/improve.html`·`.png` 존재. `check-overlap` 관통 0. 선 겹침은 laneWidth 3회 증대(480/560/640) 후에도 21–23 잔여 — 계획이 명시한 이탈 조건(세 번 안에 0이 안 되면 기록 후 멈춤)에 따라 README에 기록하고 받아들임
- [x] `verify-basis` 음성 대조군 OK, citations 435/435 failed 0
- [x] `check-rediscovery` FOUND 3/3(법제처 원문 대조 후 2차 재실행으로 3호 I5·1호 I2 FOUND) + 음성 대조군 isolated. 3호 I2는 절차 단위 구조적 한계로 MISS 유지(README 기록). `compare-golden` org 100%·act 100%·subjects 84% — 세 지표 ≥ 80% 충족
- [x] 워룸 `data.json`에 bundleId 4곳(N11·N12·N14·N37), `path.json` 일수 불변 확인
- [x] 소요일 단축 주장 없음 — README·판 문구에 소요일·단축·단축률 언급 없음, 카드는 kind/targets/why/lever만 담당
