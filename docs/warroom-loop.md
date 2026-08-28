# 워룸 루프 — 기사→관문→제도 순환 아키텍처

기사·정책브리핑에서 시작해 워룸 관문과 korea100 제도를 키우고, 등재된 제도가
다시 워룸의 절차·일정·주체 부하로 되돌아오는 자동 루프. 자동으로 바뀌는 것은
**신호·후보·제안**뿐이고, **상태 변경과 등재는 언제나 사람이 근거 법령을 확인해
확정**한다(워룸 정직성 규칙).

```
[네이버 뉴스 + 정책브리핑]
    │ 매일 08:00 launchd (com.korea100.warroom-signals)
    ▼
① 신호 수집·판별  collect-warroom-signals.mjs
    ├─ 관문별 쿼리 → 기계 필터 → claude 판별(유형 p/r/d/c + 관문 한줄요약)
    ├─ signals.json (지도 📡배지·상세카드·신호 칩)
    ├─ 상태 변경 제안 statusSuggestions (7일 임계치 — 자동 변경 아님)
    └─ 발굴 쿼리 → 기존 관문에 없는 절차 → gate-candidates.json + 이슈 #139
    ▼
② 제도 후보 발굴  discover-institution-candidates.mjs
    ├─ discover-news-candidates(전국 뉴스) → claude 판별(586+ 목록에 없는 제도만)
    └─ docs/institution-candidates/queue.json + 이슈 #145
    ▼
③ 검토·등재 (사람/세션)
    ├─ 관문: DRF 법령 검증 → 프로젝트 JSON에 requires/produces 모델링
    └─ 제도: docs/recipes/institution-creation → web/data/institutions/<slug>.json
             + docs/institutions-100-manifest.json (validate:data 필수 통과)
    ▼
④ 재주입 (역연결)
    ├─ 관문.templateRefs → 제도 slug  (validate-mega-projects가 실재·nodeIds 검증)
    ├─ generate-warroom-map-data.mjs → 지도 data.json (templates·procs 노출,
    │   상세카드 "절차 N개 — 제도명" → /model/<slug>/ 링크)
    └─ tools/gen-warroom.mjs → 보드·데일리·CPM (procs·주체 부하·시간축 재계산)
    ▼
⑤ 관측  /warroom/loop/ 루프 상태판 (generate-loop-status.mjs)
    └─ 파이프라인 카드·상태 제안·큐 현황·누계. 러너가 매일 재생성·커밋
       + (TELEGRAM_BOT_TOKEN이 ~/.config/k-skill/secrets.env에 있으면)
       텔레그램 데일리 다이제스트 발송
```

## 운영 수칙
- 신호는 상태 확정 근거가 아니다. statusSuggestions는 "검토하라"는 알림일 뿐.
- 후보 등재 전 반드시 DRF 원문 대조(지어내기 금지). 미확인은 unverified/FV.
- 역할명 주체(지정권자·승인기관 등)는 계층에 못박지 않는다(mega-tier 규칙).
- 러너는 detached 워크트리(~/korea100-worktrees/warroom-signals)에서
  산출물만 main에 커밋한다. 로그: ~/Library/Logs/korea100-warroom-signals.log
- 지도 procs 합 = gen-warroom procs 합 이어야 한다(교차 검증). 어긋나면
  generate 두 개를 같은 커밋에서 함께 돌렸는지 확인.

## 파일 지도
| 역할 | 경로 |
|---|---|
| 신호·관문후보 수집기 | web/scripts/collect-warroom-signals.mjs |
| 제도 후보 발굴기 | web/scripts/discover-institution-candidates.mjs |
| 루프 상태 집계 | web/scripts/generate-loop-status.mjs |
| 지도 데이터 생성 | web/scripts/generate-warroom-map-data.mjs |
| 보드·CPM 생성 | web/tools/gen-warroom.mjs |
| launchd 러너 | ~/.local/bin/korea100-warroom-signals.sh (레포 외부) |
| launchd 잡 | com.korea100.warroom-signals (매일 08:00) |
| 검토 이슈 | #139(관문) · #145(제도) |
