---
workflow: general-video
flow: automation
storyboard: no
message: "글로만 존재하던 법령이, 누가·무엇을·언제가 보이는 구조도가 된다"
destination: deck-embed
aspect: 1920x1080
language: ko
audience: 국무총리·정부 고위 인사 (2026-09-02 발표)
length: 58s
angle: transformation
---

## Intent

국무총리 발표 덱(제도100 소개 → 광주 반도체 클러스터 행정절차 조사)의 2장
"제도 모델" 자리에 삽입하는 30초 무음 모션그래픽. 제도100을 만든 취지 그
자체를 영상 한 편으로: 법령은 글로 존재하고, 절차(누가·무엇을·언제)는 문장
속에 숨어 있다 — 제도100은 그것을 구조도로 만든다. 행사장 음향에 의존하지
않도록 완전 무음 + 화면 자막 기반. 마지막에 "이렇게 만든 제도 지도 580여 개"
스케일 아웃으로 닫는다.

## Assets

- ~/korea100/web/data/institutions/environmental-impact-assessment.json —
  실데이터 소스: 스윔레인 레인·게이트·노드(주체/행위/법조문). 영상 속
  구조도는 이 데이터의 실제 구조를 따른다 (지어내기 금지 — korea100 정직성
  원칙).
- 법령 조문 원문: 환경영향평가법 실제 조문 텍스트 (law.go.kr DRF, OC=test로
  빌드 전 취득해 정적 자산으로 굽는다 — 렌더 시 네트워크 접근 금지).

## Customizations

- 도입부(0–8.2s, 2026-08-26 추가): "직제 개정 협의 결과를 시달받았다" 슬램 +
  행정용어 칩 8종 → "AI로, 행정 리터러시 — AI가 행정을 국민의 언어로 번역합니다"
  리빌 → 조문 벽으로 크로스페이드.
- 4단계 변환 아크: ①글(조문 벽) → ②문장 속 주체·행위·기한 하이라이트 →
  ③조각이 카드로 응축돼 레인으로 정렬, 엣지 드로잉 → ④줌아웃: 1장이 수백
  장 그리드가 되며 "580여 개" 카운터.
- 챕터 5(38.4–48.4s, 2026-08-26 추가): "제도끼리 모아보면?" — 반도체
  클러스터 제도 칩 12종 수렴 + 1,281 카운터 + 게이트 8·마일스톤 49·제도 103.
- 챕터 6(48.4–58.2s): "손에 잡히는 AX" — AS-IS 6단계 중 3단계 취소선(개념도
  명시) vs TO-BE 3단계(AI 배지) 전후 비교 → "실전 AX 가이드북으로" 다크 카드
  클로징.
- 마지막 프레임은 덱 다음 슬라이드로 자연스럽게 이어지도록 정적 홀드 1.5초.

## Notes

- 무음(오디오 트랙 없음). 자막은 화면 타이포로 직접.
- 팔레트는 korea100 DESIGN.md 그린 톤(#0f9f72 계열, 조용한 정책 데스크)과
  일치시킬 것 — 덱과 사이트와 같은 세계관으로 보여야 함.
- 한국어 폰트는 로컬 자산으로 임베드(렌더 환경 폰트 의존 금지).
- 총리 청중: 화려함보다 정확·절제. 과장 수치·가짜 진척 표시 금지.

## Render note (2026-08-27)

- hyperframes 0.8.15 렌더러가 약 46초 이후 클립을 캡처하지 못한다(스냅샷·프리뷰·
  Studio는 정상, 워커 수 무관). 그래서 **챕터 분할 렌더 + concat** 구조로 만든다.
- `index.html` 이 유일한 원본. 타임라인 맨 위 `const T = {...}` 가 챕터 기준 시각이고,
  모든 트윈은 `T.<챕터> + 오프셋` 으로만 위치를 잡는다.
- `python3 tools/split-chapters.py` → `/private/tmp/lawmorph-chapters/<챕터>.html` 12개 생성
  (대상 챕터를 t=0 으로, 나머지 클립·챕터 상수는 900초로 보냄). 각 챕터는 46초 미만이어야 한다.
- `bash tools/render-all.sh` → 챕터 파일을 index.html 자리에 잠시 복사해 렌더한 뒤
  `renders/lawmorph-final.mp4` 로 이어붙임(원본은 trap 으로 항상 복구).

### 이 구조가 이렇게 된 이유(다시 밟지 말 것)
- `render -c compositions/x.html` 은 **화면이 통째로 빈다**: 페이지 URL 이 /compositions/ 라
  `assets/*.js` 가 404 → 데이터 미로드 → 빌더가 throw → 타임라인 미등록 → 전 클립 숨김.
  compositions/ 안에 assets 를 복사해도 동일. 그래서 index.html 자리 교체 방식을 쓴다.
- 프로젝트 안에 루트 컴포지션이 둘 이상이면 `lint: multiple_root_compositions` 로 막힌다.
  그래서 챕터 파일은 프로젝트 밖에 쓴다.
- 스플리터 정규식은 `id=` 를 `(?<![-\w])id=` 로 잡아야 한다. 안 그러면
  `data-composition-id="main"` 이 걸려서 **루트 자체가 900초로 파킹**돼 빈 영상이 나온다.
- 데이터는 전부 `python3 tools/gen-assets.py` 가 korea100 원본에서 생성한다
  (assets/data.js · cases.js · montage.js · megadetail.js). 숫자를 손으로 쓰지 않는다.
- Studio 프리뷰를 열면 index.html DOM 에 data-hf-id 가 스탬프된다 — 이후 스크립트
  편집은 리터럴 문자열 매칭 대신 id 기반 정규식으로.

## 구성 (190초 · 6부 12챕터)

| 챕터 | 길이 | 내용 |
| --- | --- | --- |
| intro | 32.2s | 허가/신고/수리 3카드 → "시달·고시" 문장 → 업무편람·전임자 머릿속 → AI로 행정 리터러시 |
| doc | 14.2s | 환경영향평가법 현행 조문 + 주체·행위·기한 하이라이트 |
| map | 16.0s | 조각이 카드로 → 스윔레인 조립(9주체×8게이트, 절차 18) |
| mont | 8.4s | 같은 방법으로 — 국민기초생활보장·건축허가 2판 |
| reg | 9.0s | 제도 타일 그리드 + 586 카운터 |
| track | 9.0s | 왜 복잡한가 — 군공항 이전 × 반도체 두 트랙이 종전부지에서 만남 |
| mega | 16.0s | 제도 칩 수렴 + 1,281 + 8게이트 체인 + 완료2·착수6 상태 |
| zoom | 11.0s | 1,281이 어떻게 세어졌나 — N37 통합심의 12개 하위절차 |
| ax1 | 22.6s | 여비몬 — 블록 5개가 콜아웃과 함께 AI 레인으로 (20→14) |
| ax2 | 25.0s | 세종사이렌(19→14) · 눈치코치 인수인계(14→7) |
| ax3 | 14.0s | 왜 우수사례 심층분석인가 — 어디서·무엇부터의 실마리 3단계 |
| close | 12.6s | 실전 AX 가이드라인으로 — 현재 연구 중 |

## 오디오 (2026-08-27 추가)

- HeyGen 미로그인 → 오프라인 경로. **내레이션 = Supertonic 3 (로컬 ONNX, 31개 언어·한국어 지원)**,
  **BGM = MusicGen 로컬 생성**(30초 시드). 현재는 **현악 없는 피아노·마림바·첼레스타 계열**(104bpm 장조).
  후보들을 음향 지표로 비교해 고름 — 중심주파수/온셋:
  ① track-solemn 782Hz·3.1/s(너무 진중) · ② track-baroque 2303Hz·6.4/s(너무 밝음) ·
  ③ track-piano-dark 543Hz·2.0/s(더 어두움) · **④ track 964Hz·4.9/s(채택)**.
  후보는 assets/bgm/ 에 모두 남겨둠. 믹스는 베드 0.12 + 2.2kHz -2.5dB 딥(남성 보이스 대역 회피). 로그인하면 HeyGen 카탈로그 음악·고품질
  TTS 로 교체 가능(`npx hyperframes auth login` 후 audio 단계만 다시).
- TTS 는 `.venv-tts`(python3.13 + `pip install supertonic`), 모델은 `~/.cache/supertonic3`.
  보이스 F1~F5·M1~M5 — 현재 **M1(남성)**, `NARRATION_VOICE` 로 교체. 속도는 엔진 파라미터
  `NARRATION_SPEED`(현재 1.12) 를 먼저 쓰고, 그래도 넘치면 ffmpeg atempo 로 보정한다.
  `audio/samples/` 에 10개 보이스 한국어 샘플이 있다.
- 원고는 `audio/narration.json` (id·at(초)·text 22문장). `.venv-tts/bin/python tools/make-narration.py`
  가 문장별 WAV 를 만들고 at 시각에 배치해 `audio/narration.wav`(190초) 를 만든다.
  슬롯을 넘치면 1.12배 이내로 자동 속도 보정하고, 그래도 넘치면 실패로 알린다.
- `bash tools/mix-audio.sh` → 30초 BGM 을 4초 크로스페이드로 이어 붙여 190초 루프를
  만들고, 내레이션을 asplit 해 한 갈래는 사이드체인 키로 써서 말할 때 BGM 을 누른다.
  마지막에 loudnorm(-16 LUFS) + 리미터. 산출물 `renders/lawmorph-final-audio.mp4`.
- 오디오를 컴포지션이 아니라 이 단계에서 합치는 이유: 챕터 분할 렌더라 컴포지션에
  넣으면 BGM 이 챕터마다 끊긴다.
- 실측 레벨: 내레이션 구간 -18 dB / BGM 단독 구간 -26 dB / 피크 -1.5 dB.
