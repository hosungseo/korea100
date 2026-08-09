# Threads 체인 연재 게시 플레이북

기준일: 2026-07-19  
계정: `@gongpenclaw`  
사례: 저작권법 제도 506–509 (동일성유지권 등) 7칸 연재

이 문서는 **한 줄로 이어지는 체인 연재**  
`1 → 2 → 3 → 4 → 5 → 6 → 7`  
를 Threads API로 올리는 방식을 정리한다.

---

## 1. 목표 구조

### 올바른 체인 (이번 최종본)

```text
[1 원글 · 캐러셀 4장]
    ↓ reply_to_id = 1의 id
[2 이미지+본문]
    ↓ reply_to_id = 2의 id
[3]
    ↓
[4]
    ↓
[5]
    ↓
[6]
    ↓
[7]
```

- 각 칸은 **직전 칸의 media id**에 답글한다.
- 앱에서 “스레드 계속 보기”로 **한 줄**로 읽힌다.

### 잘못된 구조 (첫 시도 · 하지 말 것)

```text
[1 원글]
  ├─ 2 (reply_to = 1)
  ├─ 3 (reply_to = 1)
  ├─ 4 (reply_to = 1)
  └─ …
```

- 2~7이 **모두 1번의 답글**로 나란히 달린다.
- 피드에는 1번만 크게 보이고, 나머지는 답글 목록처럼 느껴진다.
- API상으로는 연결되어 있어도 **연재 체인 UX가 아니다**.

| 구분 | `reply_to_id` | 사용자 체감 |
| --- | --- | --- |
| 체인 연재 | **직전 글 id** | 1→2→3… 한 줄 |
| 원글 답글 묶음 | **항상 1번 id** | 1번 아래 댓글 나열 |

---

## 2. 사전 준비

### 2.1 환경 변수 (`web/.env.local`)

```bash
THREADS_APP_ID=
THREADS_APP_SECRET=
THREADS_ACCESS_TOKEN=
THREADS_USER_ID=          # 생략 시 me 로 조회
```

확인:

```bash
cd web
npm run threads:check
```

필요 스코프 (현재 사용):

- `threads_basic`
- `threads_content_publish`
- `threads_manage_replies` (답글 연재에 유리)
- `threads_read_replies`
- `threads_manage_insights` (선택)

**삭제 API**는 별도 권한이 없으면 실패한다.  
현재 토큰에는 delete 권한이 없어 `DELETE /{media-id}` 가  
`Application does not have permission for this action` 으로 거부된다.  
기존 글 정리는 **앱에서 수동 삭제**하거나, Meta 앱에 삭제 권한을 추가한 뒤 재인증한다.

### 2.2 이미지

Threads 이미지 컨테이너는 **공개 URL**이 필요하다. 로컬 경로는 불가.

이번 사례:

| 용도 | 공개 URL (GitHub Release) |
| --- | --- |
| 동일성유지권 | `…/threads-copyright-2026-07-19/img01.jpg` |
| 위원회 조정 | `…/img02.jpg` |
| 온라인 전송 중단 | `…/img03.jpg` |
| 저작권 등록 | `…/img04.jpg` |

베이스:

```text
https://github.com/hosungseo/korea100/releases/download/threads-copyright-2026-07-19/
```

로컬 원본 (업로드용):

```text
쓰레드 초안/저작권법-506-509-이미지/
  01-동일성유지권.jpg   → img01.jpg
  02-위원회조정.jpg     → img02.jpg
  03-온라인전송중단.jpg → img03.jpg
  04-저작권등록.jpg     → img04.jpg
```

권장 스펙:

- JPEG, 대략 **1080×1440 (3:4)**
- 장당 ~100KB 전후
- 파일명은 ASCII (`img01.jpg`) 권장 — 한글 파일명은 릴리스 URL이 깨질 수 있음

릴리스로 올리기 예:

```bash
gh release create threads-copyright-YYYY-MM-DD \
  path/to/img01.jpg path/to/img02.jpg path/to/img03.jpg path/to/img04.jpg \
  --title "Threads assets" \
  --notes "Temporary public assets for Threads. Safe to delete after publish." \
  --latest=false
```

게시 후 릴리스 에셋은 삭제해도 된다 (이미 캐시·CDN에 잡힌 뒤면 무관할 수 있음).

### 2.3 본문 길이

- Threads 한 칸은 대략 **500자 전후** 제한.
- 긴 글은 **연재로 쪼갠다** (이번 사례 7칸).
- 문안 원본: `쓰레드 초안/저작권법-506-509-게시문안.md`

---

## 3. API 흐름 (Meta Threads Graph)

베이스: `https://graph.threads.net/v1.0`  
저장소 래퍼: `web/scripts/lib/threads-api.mjs`  
(`threadsRequest`, `getThreadsProfile` 등)

### 3.1 공통: 컨테이너 생성 → 상태 대기 → 발행

1. `POST /{user-id}/threads` … 컨테이너 생성 → `{ id: creationId }`
2. `GET /{creationId}?fields=status,error_message`  
   - `FINISHED` 될 때까지 폴링 (2~3초 간격, 타임아웃 ~2분)
   - `ERROR` / `EXPIRED` 면 중단
3. `POST /{user-id}/threads_publish`  
   - body: `creation_id={creationId}`  
   - 응답 media id 가 **다음 칸의 `reply_to_id`** 로 쓰인다

`FINISHED` 직후 바로 publish 하면 간헐적으로 400이 날 수 있어 **1~2초 여유**를 둔다.  
실패 시 같은 칸을 **최대 3회 재시도**, 칸 사이 **3초 이상** 간격을 둔다.

### 3.2 1번 칸: 캐러셀 (이미지 여러 장 + 텍스트)

```text
for each image_url:
  POST /{user-id}/threads
    media_type=IMAGE
    image_url=<public https url>
    is_carousel_item=true
  wait FINISHED
  collect child ids

POST /{user-id}/threads
  media_type=CAROUSEL
  children=<id1,id2,id3,id4>   # 쉼표 구분
  text=<1번 본문>
wait FINISHED

POST /{user-id}/threads_publish
  creation_id=<carousel container id>

→ rootId = 발행된 media id
```

- 캐러셀은 **포스트 1개**로 카운트된다.
- 이미지 순서 = 스와이프 순서.

### 3.3 2~N번 칸: 체인 답글 (핵심)

```text
prevId = rootId

for post in posts[2..N]:
  POST /{user-id}/threads
    media_type=IMAGE          # 또는 TEXT
    image_url=<optional>
    text=<본문>
    reply_to_id=prevId        # ★ 직전 칸 id (원글 고정 금지)
  wait FINISHED
  publish → currentId
  prevId = currentId
```

이미지 답글이 실패하면 같은 본문으로 `media_type=TEXT` + `reply_to_id` 폴백.

### 3.4 검증

발행 후 각 media:

```text
GET /{media-id}?fields=id,permalink,has_replies,media_type,text
```

체인 성공 시:

- 1~(N-1): `has_replies: true`
- N: `has_replies: false`
- `reply_to` 관계가 1→2→3… 로 이어짐

대화 조회 (참고):

```text
GET /{root-id}/replies
GET /{root-id}/conversation
```

---

## 4. 의사코드 (전체)

```js
const userId = (await getThreadsProfile(config)).id;
const accessToken = config.accessToken;

// --- 1) 캐러셀 원글 ---
const childIds = [];
for (const url of imageUrls) {
  const c = await create({ media_type: "IMAGE", image_url: url, is_carousel_item: true });
  await waitFinished(c.id);
  childIds.push(c.id);
}
const carousel = await create({
  media_type: "CAROUSEL",
  children: childIds.join(","),
  text: posts[0].text,
});
await waitFinished(carousel.id);
const root = await publish(carousel.id);
let prev = root.id;

// --- 2) 체인 답글 ---
for (let i = 1; i < posts.length; i++) {
  await sleep(3000);
  const c = await create({
    media_type: "IMAGE",
    image_url: posts[i].image,
    text: posts[i].text,
    reply_to_id: prev, // 직전 id
  });
  await waitFinished(c.id);
  const pub = await publish(c.id);
  prev = pub.id;
}
```

구현 위치 참고: 일회성 스크립트로 실행했음 (`web` 디렉터리에서 `node --input-type=module`).  
재사용 시 `web/scripts/threads-publish-chain.mjs` 로 옮기는 것을 권장.

---

## 5. 이번 사례 매핑 (저작권법 7칸)

| 칸 | 주제 | 미디어 |
| --- | --- | --- |
| 1 | 훅 · 강의안 무단 단축 사례 | 캐러셀 img01~04 |
| 2 | 동일성유지권 · 일신전속 | img01 |
| 3 | 부득이 변경 vs 본질적 변경 | img01 |
| 4 | 시정 요구 순서 | img01 |
| 5 | 위원회 알선·조정 | img02 |
| 6 | 온라인 복제·전송 중단 | img03 |
| 7 | 등록 · 면책 · 사이트 링크 | img04 |

최종 체인 원글 (2026-07-19):

- https://www.threads.com/@gongpenclaw/post/Da-bCJIicYu

(과거 실패본 — 원글에 답글만 나란히 달린 구조 — 는 앱에서 수동 삭제 대상)

---

## 6. 체크리스트

게시 전

- [ ] `npm run threads:check` 성공
- [ ] 이미지 URL이 **HTTPS 공개**이며 브라우저에서 열림
- [ ] 각 칸 본문 ≤ ~500자
- [ ] 면책(법률 자문 아님) · 출처/사이트 링크 (마지막 칸 권장)
- [ ] `reply_to_id` 가 **직전 id** 인지 코드 리뷰

게시 중

- [ ] 캐러셀 child 전부 `FINISHED`
- [ ] publish 전 짧은 delay
- [ ] 칸 사이 delay · 실패 재시도

게시 후

- [ ] 앱에서 1번 → 스레드 연속 스크롤 확인
- [ ] 1~(N-1) `has_replies: true`
- [ ] 잘못된 구버전 글 앱에서 삭제

---

## 7. 실패 패턴과 대응

| 증상 | 원인 | 대응 |
| --- | --- | --- |
| 1번만 피드에 크게, 나머지가 댓글 느낌 | 모두 `reply_to_id=원글` | 직전 id 체인으로 재게시 |
| `publish` 400 resource does not exist | 컨테이너 미완성·만료 | `FINISHED` 대기 강화, delay, 재생성 |
| 이미지 컨테이너 실패 | URL 비공개·리다이렉트·MIME | 공개 직링크 JPEG, ASCII 파일명 |
| 삭제 API 거부 code 10 | delete 권한 없음 | 앱 수동 삭제 또는 스코프 재인증 |
| 한글 릴리스 파일명 404 | URL 인코딩/잘림 | `img01.jpg` 등 ASCII |

---

## 8. Mac launchd + 예약 큐로 여러 스레드 미리 쌓기

수동 API 게시(§3)와 별도로, Mac에서 **예약 큐**로 같은 체인 연재를 여러 건 준비해 둘 수 있다.  
실제 도구는 홈 디렉터리의 **`~/threads-tool`** 이고, 스케줄러는 macOS **`launchd`** 다.

### 8.1 구성 한눈에

| 역할 | 경로 |
| --- | --- |
| 도구 루트 | `~/threads-tool/` |
| 예약 목록 | `~/threads-tool/queue.json` |
| 본문(스레드별) | `~/threads-tool/threads-YYYY-MM-DD/*.txt` 등 |
| 큐 러너 | `~/threads-tool/run-queue.mjs` |
| 즉시 게시 CLI | `~/threads-tool/post.mjs` |
| launchd 에이전트 | `~/Library/LaunchAgents/com.gongpenclaw.threads-queue.plist` |
| 실행 로그 | `~/threads-tool/run-queue.log`, `launchd.out.log` |

러너 동작 요약 (`run-queue.mjs`):

1. `queue.json`에서 `posted != true` 이고 `when <= now` 인 항목을 고른다.
2. **예약일(KST 날짜)이 오늘이 아니면** 건너뛰고 `skipped` 처리 (놓친 예약 재게시 방지).
3. `file`(또는 `text` 경로) 본문을 읽어 `@@@PART@@@` 로 분할한다.
4. **파트 1** = 원글(+ 선택 이미지 1장), **파트 2~** = `reply_to_id = 직전 발행 id` 체인.
5. 파트마다 `postedIds`에 저장 → 중간 실패 시 다음 launchd 실행에서 **이어서** 게시.
6. 전부 성공 시 `posted: true`, `posted_at` 기록.

이미 검증된 사용 예: 2026-07-15 임금·해고·실업급여 등 여러 스레드를 시간대별로 자동 발행.

### 8.2 본문 파일 형식 (체인)

한 예약 항목 = **스레드 1개**. 파트로 나누면 체인이다.

```text
# 예: threads-2026-07-20/copyright-integrity.txt

강의안을 합의 없이 줄여 배포했다면? …
(1번 칸, ≤500자)

@@@PART@@@

동일성유지권은 한 줄로 …
(2번 칸)

@@@PART@@@

마지막으로 등록입니다. …
(마지막 칸 · 링크·면책)
```

- 구분자: 정확히 `@@@PART@@@` (앞뒤 공백/빈 파트는 trim 후 제거).
- 각 파트는 Threads **약 500자** 제한을 넘기지 말 것.
- 단일 글이면 구분자 없이 파일 하나 = 파트 1개.

### 8.3 `queue.json` 항목

```json
[
  {
    "id": "copyright-integrity",
    "when": "2026-07-20T10:00:00+09:00",
    "file": "threads-2026-07-20/copyright-integrity.txt",
    "image": "https://hosungseo.github.io/korea100/exports/process-maps/….png",
    "posted": false
  },
  {
    "id": "another-topic",
    "when": "2026-07-20T14:30:00+09:00",
    "file": "threads-2026-07-20/another-topic.txt",
    "image": "https://…/map.jpg",
    "posted": false
  }
]
```

| 필드 | 의미 |
| --- | --- |
| `id` | 로그·추적용 고유 키 |
| `when` | 예약 시각 (ISO 8601, `+09:00` 권장) |
| `file` | 본문 경로 (`threads-tool` 기준 상대경로) |
| `image` | **첫 칸에만** 붙는 공개 이미지 URL (선택) |
| `posted` | 완료 여부 (러너가 갱신) |
| `postedIds` | 파트별 발행 media id (러너가 갱신) |
| `posted_at` / `skipped` | 완료·스킵 메타 |

여러 스레드를 미리 쌓을 때: **초안 txt N개 + queue.json에 N줄** 이면 된다.

### 8.4 launchd 스케줄

에이전트 라벨: `com.gongpenclaw.threads-queue`

현재 plist는 대략 아래 시각(로컬)에 `run-queue.mjs`를 호출한다.

- 10:00, 11:30, 13:00, 14:30, 16:00, 17:30

즉 **예약 `when`이 지난 뒤, 그 다음 launchd 틱**에 게시된다.  
예: `when` 10:05 → 같은 날 11:30 틱에서 처리 (당일 제한 규칙을 통과하는 경우).

유용한 명령:

```bash
# 로드 상태
launchctl print gui/$(id -u)/com.gongpenclaw.threads-queue

# 수동 1회 실행(테스트)
cd ~/threads-tool && node run-queue.mjs

# 에이전트 재로드
launchctl bootout gui/$(id -u)/com.gongpenclaw.threads-queue 2>/dev/null
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.gongpenclaw.threads-queue.plist

# 끄기
launchctl bootout gui/$(id -u)/com.gongpenclaw.threads-queue
```

### 8.5 준비 워크플로 (여러 게시글)

1. 주제별 체인 문안 작성 → `@@@PART@@@` 로 분할한 `.txt` 저장.
2. 구조도 등 이미지를 **공개 URL**로 호스팅 (GitHub Pages export, Release 등).
3. `queue.json`에 `id` / `when` / `file` / `image` 추가, `posted: false`.
4. (선택) `node run-queue.mjs` 로 dry 확인 — 미래 `when`이면 아무 것도 안 올라감.
5. launchd가 시각에 맞춰 발행 → `run-queue.log` 에서 `DONE …` 확인.
6. 앱에서 체인 스크롤 확인.

토큰은 `~/threads-tool/token.json` (60일). 만료 전 `node auth.mjs refresh`.

### 8.6 큐 러너 vs 수동 플레이북(§3) 차이

| 항목 | `run-queue.mjs` (launchd) | 수동 §3 (캐러셀 플레이북) |
| --- | --- | --- |
| 체인 `1→2→3…` | 지원 (`@@@PART@@@` + 직전 id) | 지원 |
| 여러 스레드 예약 | **지원** (`queue.json` 배열) | 수동 반복 |
| 1번 칸 이미지 | **1장** (`image` 필드) | 캐러셀 2~20장 가능 |
| 2~N칸 이미지 | **없음** (텍스트만) | 칸마다 이미지 가능 |
| 스케줄 | launchd 캘린더 | 즉시 |

**여러 주제 스레드를 날짜·시간에 나눠 쌓기** → launchd 큐가 맞다.  
**1번에 구조도 4장 캐러셀 + 칸마다 다른 이미지** → 지금은 §3 수동(또는 러너 확장)이 필요하다.

### 8.7 저작권 7칸을 큐에 넣을 때 (예시)

현재 러너는 1번 캐러셀·중간 칸 이미지를 못 넣으므로, 큐용으로 줄인 형태 예:

```text
# threads-2026-07-21/copyright-7.txt
(1번: 훅 + 구조도 1장 URL을 queue.image 로)
@@@PART@@@
(2번: 동일성유지권)
@@@PART@@@
…
@@@PART@@@
(7번: 등록 + 링크)
```

```json
{
  "id": "copyright-7-chain",
  "when": "2026-07-21T10:00:00+09:00",
  "file": "threads-2026-07-21/copyright-7.txt",
  "image": "https://github.com/hosungseo/korea100/releases/download/threads-copyright-2026-07-19/img01.jpg",
  "posted": false
}
```

풀 캐러셀·칸별 이미지가 필요하면 §3 스크립트를 쓰거나, 러너에 `images: string[]` / 파트별 이미지 맵을 추가한다.

### 8.8 큐 체크리스트

- [ ] `token.json` 유효 (`node auth.mjs` / refresh)
- [ ] 각 파트 ≤ ~500자, 구분자 `@@@PART@@@` 정확
- [ ] `image` 가 공개 HTTPS 로 열림
- [ ] `when` 타임존 `+09:00` 명시
- [ ] launchd 에이전트 로드됨
- [ ] 발행 후 `run-queue.log` 와 앱 체인 UX 확인
- [ ] 완료 항목 `posted: true` 인지 확인 (재실행 중복 방지)

---

## 9. 관련 파일

| 경로 | 설명 |
| --- | --- |
| `docs/threads-api.md` | korea100 쪽 자격 증명 · 텍스트 dry-run |
| `docs/threads-chain-publish-playbook.md` | 이 문서 (체인 연재 · launchd 큐) |
| `web/scripts/lib/threads-api.mjs` | korea100 Graph 요청 래퍼 |
| `web/scripts/threads-check.mjs` | 연결 확인 |
| `web/scripts/threads-publish-text.mjs` | 텍스트 단건 (체인 아님) |
| `쓰레드 초안/저작권법-506-509-게시문안.md` | 장문 문안 |
| `쓰레드 초안/저작권법-506-509-이미지/` | 로컬 이미지 |
| `~/threads-tool/README.md` | 토큰·즉시 게시 CLI |
| `~/threads-tool/run-queue.mjs` | launchd 예약 체인 러너 |
| `~/threads-tool/queue.json` | 예약 큐 |
| `~/Library/LaunchAgents/com.gongpenclaw.threads-queue.plist` | Mac 스케줄 |

---

## 10. 한 줄 요약

> **캐러셀로 1번을 올리고, 2번부터는 매번 `reply_to_id = 직전 발행 id`로 이어서 publish 한다.**  
> 원글 id에만 답글을 달면 연재가 아니라 답글 묶음이 된다.  
> **여러 스레드를 미리 준비·예약하려면** `~/threads-tool` 의 `queue.json` + Mac `launchd` 를 쓰면 된다 (`@@@PART@@@` 체인, 첫 칸 이미지 1장).

---

## 11. 조회 성과에서 뽑은 작성 기법 (2026-07-21)

장기 기억에도 동일 요약을 저장함 (`MEMORY.md` Curated Update 2026-07-21).

1. **훅:** “N번째 구조도 / 추가·보완했습니다” 산출물 공지가 설명형·질문형보다 강했음.
2. **한 문장 경계:** 사용자 vs 노동청, 창구 A vs B 등 역할 오해 교정.
3. **포맷:** 구조도 **1장 이미지** 우선; 캐러셀은 묶음 시리즈용.
4. **시간:** 플래그십은 **09:00 또는 19:00 KST** 비중 확대.
5. **체인:** 3칸이어도 **1칸이 단독 성립**해야 함. `reply_to`는 직전 id.
6. **X에서 빌릴 것:** 체크리스트·유형 분류·이슈 이해관계 한 줄. 정파 싸움은 안 함.
7. **스케줄 전:** 최근 `@gongpenclaw` 게시·`queue.json` 히스토리로 중복 주제 제외.

