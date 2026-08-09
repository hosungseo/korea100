# PROJECT_SOUL.md — Korea100

> Agent source of truth. Dense context beats clever prompts.
> Companion files: `DESIGN.md`, `web/public/llms.txt`, `README.md`, `docs/*`

## 1. One-liner
- What this is: 대한민국 주요 제도를 법령·기관·문서·기한·병목으로 분해해 **한 장 요약 + 업무구조도**로 읽게 하는 공개 제도 모델 서비스
- Who it is for: 공무원, 보좌진, 연구자, 기자, 정책 관심 시민; 2차로 공공 AX/디지털 담당
- What success looks like: 줄글을 **검증 가능한 구조 지도**로 바꿔 행정 리터러시를 높임. 팔로워 수가 아니라 **권위 있는 제도 인프라 자산**

## 2. Feel / brand grain
- Desired feel: quiet public-policy command desk. 캠페인 사이트가 아니라 신뢰할 수 있는 레퍼런스 제품. 차분·구조적·반복 사용 가능
- Signature: `제도 모델 패널` — 법적 근거, 행위자, 상태, 병목을 한 뷰
- Words to keep using:
  - 한 장 구조도 / 제도 모델 / 업무구조도 / 행위주체 레인
  - 병목·게이트·핸드오프·회귀 경로·책임 주체
  - 검증 대장 / unverified / 법령 기준일(asOfDate)
  - AI-enabled administrative literacy
  - 승인 가능한 판단 패키지 (공공 AX 연결 시)
- Words / looks to avoid:
  - “AI가 알아서 다 해줌”, 법률 자문/공식 유권해석 톤
  - 장식용 보라/파란 그라데이션, heavy shadow, 소셜 영상식 bounce
  - 법령 미확인 조문 번호 추정, 현장 운영을 확정처럼 서술
  - 단순 예시 갤러리/예쁘기만 한 인포그래픽으로 축소
- Reference artifacts:
  - `DESIGN.md` (palette/type/layout/motion)
  - live: https://hosungseo.github.io/korea100/
  - process map exports under `web/public/exports/process-maps/`
  - HyperFrames Korea100 motion grammar (dark green header / white field / lanes / orthogonal connectors)

## 3. Constraints
- Hard:
  - 원문 대조(국가법령정보센터); 확인 못 하면 `unverified` + 사유 공개
  - 조문 추정 금지; warnings에 정정 이력
  - 법률 자문/공식 해석 아님 고지
  - 접근성: real links, labels, focus trap drawers, reduced-motion/transparency
  - 국내 카탈로그와 비교법 파일럿 카운트 분리 (2026-07-23 기준 국내 509)
- Soft:
  - accent green은 functional only; warning amber는 병목/위험만
  - animate only opacity/transform; no decorative pulse
  - one-page PNG 규칙(카드/맵): 1800×2400 단일 페이지 선호 시 준수
- Agent safety:
  - 개인정보·비공개 내부자료 링크 금지
  - mailto 요청 폼: 서버 저장 없이 로컬 draft
  - 공개 채널/푸시 전 사용자 확인 (특히 X)

## 4. Real content anchors
- Must appear on institution pages:
  - 목적, 이해관계자, 법적 근거, 기관 권한
  - 절차 단계 / 상태 인식형 업무구조도
  - 돈·문서·데이터 흐름, 병목·쟁점·개혁 포인트, asOfDate
- Sample JTBD:
  - “이 제도에서 나는 누구 창구로 가나?”
  - “막히면 어디로 돌아가나 / 누가 결정하나?”
  - “법령으로 확정된 것과 현장 확인 필요 항목은?”
- Misconceptions to correct:
  - 제도 = 조문 나열 (×) → 작동 경로 지도 (○)
  - 구조도 “진행 중” = 실시간 행정 데이터 (×)
  - AI 요약만으로 충분 (×) → 근거·검증·책임 경로 필요

## 5. System assets
- Design tokens: see `DESIGN.md`  
  canvas `#fcfcfb`, accent `#0f9f72`, warning `#c78116`, ink `#0b1410`, 4px spacing base, max width 1200px
- Layout grammar:
  - home: hero → featured process → searchable catalog
  - detail: summary + full swimlane process first; mobile timeline alt
  - comparison: 2–3 institutions, shared rows
- Generators / tools:
  - law-to-process pipeline, MCP v0.2 (`korea100-administrative-procedure-mcp`)
  - Chrome sidepanel draft editor, verification queue
  - Korea100Studio / orgchart grammar for decision maps
  - HyperFrames for vertical motion pieces (map fidelity > simplified social board)
- Agent-readable:
  - `web/public/llms.txt`
  - institution JSON schema / exports
  - this `PROJECT_SOUL.md`

## 6. Decision log (append-only)
- 2026-07-26: Career role = core proof asset for public AX expert; channels are marketing only
- 2026-07-26: Message = AI-enabled administrative literacy, not gallery
- 2026-07-23: Domestic catalog recount = 509; keep comparative pilots separate
- 2026-07-27: Motion must preserve original map nodes/lanes/branches; reject oversimplified 6-node boards
- 2026-07-30: Adopt AI-first design loop — project soul + dual human/machine pages + mini-tool/params over one-shot finals

## 7. Meeting / transcript distill
- Non-negotiables: 검증 가능성, 한 장 가독성, 책임/회귀 경로 가시화
- Open questions: studio vs orgchart package convergence; MCP global registration timing

## 8. Current exploration queue
- Variants: agent-facing machine pages per institution family; dual human/machine landing blocks
- Mini-tools: process-map param tweakers; verification queue filters; map→motion fidelity checker
- Win this week: filled project souls across Korea100 + Gongpenclaw + HyperFrames + runnable first-practice workflow

- 2026-07-30: First practice slice = 지역사랑상품권 (not yet in Korea100 JSON). 8 explorations + P1/P2/P3 drafts in gongpenclaw-cards/local-love-gift-certificate/. Top pick: 오해(사용자 환전) vs 창구(가맹 사용/가맹 환전).
