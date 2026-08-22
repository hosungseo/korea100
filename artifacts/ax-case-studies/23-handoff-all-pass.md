# Handoff All-Pass 작업 기록 (2026-08-22)

HANDOFF §6 남은 일 중 담당자 회수가 필요한 파랑 검증·인사이트 재계산을 제외하고,
로컬에서 끝낼 수 있는 항목을 일괄 처리한 기록이다. **cases JSON은 수정하지 않았다.**

- 게시 cases: **137**
- 교정 시트 HTML: **137** (`web/public/ax-cases/correct/`)
- 보류함 JSON: **3**
- 루프 소멸: **32** (21-loops.txt 【5】)
- sweep 보류 불릿: **47** (중복·요약 줄 포함 원문 추출)
- 기계 판독 원본: `23-handoff-all-pass.json`

---

## 1. 보류함 3건 재검토

| slug | 기관 | 판정 | 다음 |
|---|---|---|---|
| `gwangju-ai-press-release` | 광주광역시 | **HOLD_KEEP** | 1차 출처 확보 시 cases/ 복귀 + verify-law + render. 출처 교체 전 게시 금지. |
| `rra-work-macro` | 국립전파연구원 | **HOLD_KEEP_OR_RECLASS** | AI 요소 1차 근거 없으면 유지. automation-not-ai 별도 트랙 시에만 이관 검토. |
| `violation-building-ledger` | 기초지방자치단체 건축부서 | **HOLD_KEEP** | README·스크린샷·실사용 증빙 또는 담당자 확인 후 복귀. |

### `gwangju-ai-press-release`

- work: 부서 담당자의 보도자료 초안 작성
- sources: ['https://www.kyeonggi.com/article/20251106580477 (2025-11-06)']
- reason: 근거 URL이 경기도 광주시 GeniusGov·RPA 기사. 기관·서비스 불일치.

### `rra-work-macro`

- work: 연구사의 내부 시스템 자료 입력·조회 반복 작업
- sources: ['https://www.newspim.com/news/view/20260812000335 (2026-08-12)']
- reason: 화면·입력 기록 재현 매크로. AI 추론/생성 요소 미확인.

### `violation-building-ledger`

- work: 위반건축물 적발·시정명령·이행강제금 관리대장 운영
- sources: ['gitlab.aigov.go.kr/ulbo0723/my-project-1']
- reason: 저장소 초기 템플릿·프로젝트명/설명 수준. TO-BE 구체화 시 창작 위험.

**종합**: 3건 모두 **즉시 복귀 불가**. 광주 AI 대변인만 1차 출처가 생기면 최우선 복귀 후보.

---

## 2. 루프 소멸 32건 — 절차 재설계가 함께 있었는가

질문: 루프가 사라진 자리에 제도/절차 재설계가 있었는가, 아니면 도구가 재작업을 흡수했는가.

### 분류 정의

| code | 의미 |
|---|---|
| `A_institutional` / `A_node_removed` | TO-BE에 removed 노드 또는 제도 폐지·단계 소멸 언어+구조 |
| `B_automation_absorb` | 절차는 남고, AI/자동화가 검색·검산·초안·안내를 선제 수행해 되돌림이 불필요해짐 |
| `C_path_collapsed` | 경로 단순화·모델링상 루프 미표현 |
| `D_legal_path_simplified` | 법정 착지 루프인데 removed 없이 단순화 |

### 집계

- A(재설계/노드 소멸 동반): **2**
- B(자동화 흡수): **30**
- C(경로 붕괴/모델링): **0**
- D(법정 경로 단순화): **0**

Counter: `{'B_automation_absorb': 30, 'A_institutional': 2}`

### 해석

소멸 루프 **32건 중 30건(B)** 은 절차 재설계로 고리를 끊었다기보다 **도구가 재작업 원인을 줄이거나 목적지를 선점**한 결과로 읽는 편이 안전하다.
A류는 **2건**뿐이며 모두 `nfs-deepfake-forensics` (removed 노드 동반).
루프 소멸을 제도 성과로 과대 포장하지 말 것. HANDOFF 한 문장과 정합.

### 사례별

| class | kind | slug | label | legal | rem | org |
|---|---|---|---|---|---|---|
| B_automation_absorb | 보완·반려 | `yebimon-travel-expense` | 보완 요구 |  | 1 | 전남광주통합특별시 |
| B_automation_absorb | 재작성·수정 | `yebimon-travel-expense` | 재작성 | Y | 1 | 전남광주통합특별시 |
| B_automation_absorb | 보완·반려 | `yebimon-travel-expense` | 반려 | Y | 1 | 전남광주통합특별시 |
| B_automation_absorb | 기타 | `sejong-siren-disaster` | 상황 변화 시 재판단 | Y | 0 | 세종특별자치시 재난안전상황실 |
| B_automation_absorb | 재작성·수정 | `acrc-minwon-answer-ai` | 이의 시 재검토 |  | 0 | 국민권익위원회 국민신문고과 |
| B_automation_absorb | 재작성·수정 | `gunpo-application-helper` | 재작성 | Y | 0 | 경기 군포시 민원봉사과 |
| B_automation_absorb | 재탐색·재조회 | `minwoncall-citizen` | 다시 탐색 |  | 0 | 행정안전부 |
| B_automation_absorb | 기타 | `seoul-edu-travel-route-map` | 사례 확인 후 재판단 | Y | 0 | 서울특별시교육청 소속기관·학교 |
| B_automation_absorb | 기타 | `library-shift-schedule-board` | 미배정·중복 재배정 |  | 0 | 공공도서관(가양관) |
| B_automation_absorb | 기타 | `hwaseong-newcomer-kb` | 선임 대기 |  | 0 | 화성특례시(AI스마트전략실 빅데이터팀) |
| B_automation_absorb | 기타 | `incheon-complan-ai` | 자료 재수집 | Y | 0 | 인천광역시 |
| B_automation_absorb | 기타 | `jeonnam-gwangju-negotiated-contract` | 검산·재계산 |  | 0 | 전남광주통합특별시 |
| B_automation_absorb | 기타 | `gyeonggi-bus-congestion-analysis` | 검산·재계산 |  | 0 | 경기도 |
| B_automation_absorb | 기타 | `seoul-smart-wellness-call` | 미수신 재통화 |  | 0 | 서울특별시 |
| B_automation_absorb | 기타 | `gimhae-ai-duty-assistant` | 매뉴얼에 없는 상황 |  | 0 | 경남 김해시 |
| B_automation_absorb | 재탐색·재조회 | `jeju-wildfire-cctv-ai` | 화면 재확인 |  | 0 | 제주 제주시 |
| B_automation_absorb | 독려·재요청 | `seongnam-doc-automation` | 자료 재요청 |  | 0 | 경기 성남시 |
| B_automation_absorb | 독려·재요청 | `seoul-police-cctv-missing-person` | 인접 구역 영상 재요청 | Y | 0 | 서울특별시·경찰(실종수사 연계) |
| B_automation_absorb | 재작성·수정 | `correction-smart-surveillance` | 배정 재검토 |  | 0 | 법무부 교정본부 |
| B_automation_absorb | 기타 | `mnd-military-radiology-ai` | 영상 불량 시 재촬영 |  | 0 | 국군의무사령부·군병원 |
| B_automation_absorb | 기타 | `seoul-fire-119-ai-callbot` | 위치 불명 재청취 | Y | 0 | 서울소방재난본부 |
| B_automation_absorb | 기타 | `korail-auto-inspection` | 미점검 구간 다음 야간으로 이월 | Y | 0 | 한국철도공사(코레일) |
| B_automation_absorb | 기타 | `incheon-airport-pax-flow` | 혼잡 재발 시 재취합·재분석 |  | 0 | 인천국제공항공사 |
| B_automation_absorb | 기타 | `kwater-smart-water-plant` | 고장 발생 후 점검계획 재수립 |  | 0 | 한국수자원공사(기후에너지환경부) |
| B_automation_absorb | 보완·반려 | `moel-labor-inspector-ai` | 진정 내용 보완 요청 | Y | 0 | 고용노동부 |
| B_automation_absorb | 기타 | `mohw-welfare-crisis-ai-intake` | 미수신 재발신 |  | 0 | 보건복지부·한국사회보장정보원 |
| B_automation_absorb | 기타 | `gyeonggi-360-ai-care` | 미수신 재시도 | Y | 0 | 경기도·경기도사회서비스원 |
| A_institutional | 기타 | `nfs-deepfake-forensics` | 분석 기준 재적용 |  | 1 | 행정안전부 국립과학수사연구원 |
| A_institutional | 기타 | `nfs-deepfake-forensics` | 대조 파일 재확보 요청 |  | 1 | 행정안전부 국립과학수사연구원 |
| B_automation_absorb | 보완·반려 | `yongsan-multilingual-ai-interpretation` | 서류 보완 재방문 | Y | 0 | 서울특별시 용산구 |
| B_automation_absorb | 기타 | `gangnam-resident-parking-ai` | 공유 이용 실패 재신고 |  | 0 | 서울특별시 강남구 |
| B_automation_absorb | 기타 | `yangsan-odor-forecast-ai` | 소산 후 재출동 |  | 0 | 경상남도 양산시 |

### A류 상세

- `nfs-deepfake-forensics` / 분석 기준 재적용: removed=['대조 원본 파일 확보 시도'] ev=['removed:대조 원본 파일 확보 시도', 'institutional+removed']
- `nfs-deepfake-forensics` / 대조 파일 재확보 요청: removed=['대조 원본 파일 확보 시도'] ev=['removed:대조 원본 파일 확보 시도', 'institutional+removed']

---

## 3. 파랑 검증 — 교정 워크플로

담당자 회수는 이 환경에서 불가. 파이프라인 상태만 고정.

1. `node gen-correction-sheets.mjs` → `web/public/ax-cases/correct/{slug}.html`
2. 현재 시트 수: **137** = cases 137 (일치)
3. 질문 구조: 맞음/다름/없음 + 실제 모습 + 빈도 + 회당 분
4. 반영: 노드 8번째 `{freq, per, min}` (CASE-SCHEMA 부록 A)
5. `node audit-cases.mjs` ERROR 0 → 필요 시 `verify-law.mjs --only <slug>`
6. `analyze.mjs` / `insights.mjs` / `loops.mjs` → `18-insights.md`
7. `web/` build → PR → 스쿼시 머지. `git add` 후 `git status --short`

**차단 요인**: 담당자 접촉·회수.

---

## 4. 신규 편입 후보 풀 (sweep 보류 섹션)

불릿 **47줄** (요약·중복 포함). 실사용 전환 증거 전 등재 금지.

### 13-sweep-awards.md (7)

- L123: - **전북형 생성형 AI 직접 구축** (전북자치도 행정정보과, 2026 상반기 전북 적극행정 최우수) — 3억 원 자체 구축, 3개월 만에 본청 직원 92.4% 활용. 실사용 증거는 강력하나 범용 플랫폼 성격(특정 업무 지목 불가) → 제외 기준 저촉 가능. [무진장뉴스](https://www.mjjnews.net/news/article.html?no=56599)(2026.7)
- L124: - **완주소방서 119구조대 생성형 AI 기반 업무관리** (전북 적극행정 장려상) — 특정 부서 사례이나 AS-IS·변화 상세 미확보. 위 출처 동일
- L125: - **부천시 온마음 AI복지콜** (복지정책과, 2026 적극행정 으뜸상 최우수) — AI 복지전달 혁신으로 수상했으나 도입 전 절차·성과 수치 미확인. [그린뉴스](https://gecpo.org/581846)(2026)
- L126: - **한국전기안전공사 E-on** (2025 적극행정 우수사례 경진대회 대상) — 세계 최초 AI ESS 안전 플랫폼. 검사원 업무의 AS-IS 재구성 자료 부족. [법률저널](https://www.lec.co.kr/news/articleView.html?idxno=751110)(2025.11)
- L127: - **안양시 과세자료 15만 건 자동 검증 / 국민신문고 민원 자동 분류** (안양 AI 경진 수상) — 사례명만 확인, 상세·실사용 증거 미확보. 여성신문 동일 기사
- L128: - **평택시 AI 포트홀 탐지 등** (평택 AI 혁신 행정 경진대회) — 기대효과 중심 서술로 아이디어 단계 가능성. [오산일보](https://www.osanilbo.com/42135)
- L129: - **AI 운전자격확인시스템 RIMS·법제처 생성형 AI 법령정보·경기데이터 찾아드림** (사례집 수록) — 대국민/사업자 대상 성격이 강해 '공무원 특정 업무 전환' 기준에서 보류

### 13-sweep-basic.md (6)

- L47: - **마포구 'AI 메모장' (전지열 주무관, 스마트정책과)**: 행정망 PC에서 단축키로 문서 초안·교정·PPT 생성 — 2026-08-07부터 전 직원 실사용이나 특정 업무보다 범용 비서 성격. https://biz.heraldcorp.com/article/10836560 (2026-08-10)
- L48: - **인천 계양구 AI 인허가 사전진단**: 국토부 시범 5곳(계양·아산·경산·영천·음성) 선정, 인허가 사전검토 업무 대체 예정이나 2026-12까지 실증 단계로 실사용 전. https://www.m-i.kr/news/articleView.html?idxno=1389439 (2026-07-08)
- L49: - **김해시 행정·법률 특화 AI 검색모델(허깅페이스 무상 공개)**: 공무원 직접 개발이나 특정 업무보다 기반 모델 성격. https://news.nate.com/view/20260630n11643 (2026-06-30)
- L50: - **성남시 AI·드론 포트홀 탐지**: "구축에 나선다" 착수 단계. https://www.khan.co.kr/article/202608111057001/ (2026-08-11)
- L51: - **클로바 케어콜(부산 해운대구 등 128개 시군구)**: 공무원 안부전화 업무를 대체하나 범용 민간 플랫폼·대국민 서비스 성격. https://www.hankyung.com/article/202409059989i (2024-09-05)
- L52: - **광주 'AI 여비몬'(7급 전산 주무관, 월 100시간→2시간)**: 여비몬 테스트의 기준 사례로 이미 확보된 것으로 판단, 참고 URL만 기록. https://www.gdtimes.kr/1180197

### 13-sweep-central.md (10)

- L114: - **금융정보분석원(FIU) 머신러닝 의심거래(STR) 심사분석 (금융위)** — 심사분석관의 STR 분석에 머신러닝 탐지 접목, 연 130만 건 처리 보도. 다만 도입 시점이 2024년 이전으로 보이고 최근 실사용 수치의 출처 신뢰도가 낮음. [한국세정신문](https://www.taxtimes.co.kr/news/article.html?no=247668)
- L115: - **입찰담합징후분석시스템 '입찰상황판' (공정거래위원회)** — 조사관의 담합 감시 업무 변화는 분명하나 'AI' 기반인지(통계 알고리즘인지) 불확실. [정책브리핑](https://www.korea.kr/briefing/pressReleaseView.do?newsId=140069635)
- L116: - **AI 자체입찰 전수점검 (조달청)** — 4명이 표본 점검하던 하루 2,500건 입찰공고를 AI가 전수 스크리닝 후 담당자가 재확인하는 방식. AS-IS/변화는 매우 구체적이나 "2026 하반기 적용 계획" 단계로 실사용 증거 미충족. [전자신문 2026-07-03](https://www.etnews.com/20260703000307)
- L117: - **우편물 손글씨 AI-OCR 접수 입력 (과기정통부 우정사업본부)** — 창구 직원의 수·발신인 수기 입력을 AI-OCR로 대체하는 기능 "개발 중" 단계. [디지털데일리 2024-04](https://m.ddaily.co.kr/page/view/2024041117534147322)
- L118: - **차세대 119 AI 신고접수 (소방청)** — 전국 시스템은 ISMP 수립·예산 단계(실사용은 서울시 등 지자체 시범). [이데일리](https://edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02095926645446624)
- L119: - **딥블루 아이 항공영상 AI 분석 (해양경찰청)** — 2027년 현장 적용 예정, 아직 개발 단계. [아시아투데이 2026-05-26](https://www.asiatoday.co.kr/kn/view.php?key=20260526010007420)
- L120: - **AI 검역·역학조사 (질병관리청)** — 밀접접촉자 자동선별, AIoT 검역심사대 등은 업무보고·추진 발표 중심으로 실사용 증거 불충분. [MBC 2025](https://imnews.imbc.com/news/2025/society/article/6754003_36718.html)
- L121: - **병무청 AI 업무비서·모집 추천** — 2026년 업무보고상 계획 단계. [뉴스핌 2025-12-18](https://www.newspim.com/news/view/20251218001169)
- L125: ---SEG---
- L129: **본문 15건 (기관별)**:

### 13-sweep-community.md (5)

- L137: - **온AI Work (행안부 공공인공지능혁신과 정준우 과장)** — 자연어 입력→보고서 초안 한글 생성. 범용 보고서 도구 성격. https://www.newspim.com/news/view/20260812000335 (2026-08-12)
- L138: - **한국어 규범 조언 도구 (국립국어원 김소희 연구사)** — 공문서 문장 규범 점검. AS-IS 재구성 자료 부족. 같은 출처
- L139: - **SEMAS AI 캠퍼스 (소상공인시장진흥공단)** — 지원금 집행 폭증(1인당 집행액 11배) 대응, 직원 아이디어를 공문서 작성 등 6대 실무 자동화로 구현. 개인·단계 특정 약함. https://blog.naver.com/mirae_saram/224355377582 (2026-07-23)
- L140: - **불법주정차 민원 자동 분류 (안양시)** — 연 3만 건 자동 분류. 담당 부서 정보 불명확. https://weekly.hankooki.com/news/articleView.html?idxno=7180012
- L141: - **정순주 주무관 (강원도립대 사무국)** — 스마트경로당·AI 당직원 구축, 적극행정 최우수상. AS-IS 미확인. https://www.ndnnews.co.kr/news/articleView.html?idxno=1058954

### 13-sweep-metro.md (7)

- L55: - **부산시 AI 감사 시스템**: 감사보고서 초안·표준양정 추천, 전국 감사위 최초이나 2026-07-15 착수보고회 단계 — https://www.sedaily.com/article/20068345
- L56: - **경남도 재난 CCTV 문장형 AI 관제**: 육안 관제→AI 문장 전파, 2026년 말 구축 완료 예정 — http://www.knnews.co.kr/news/articleView.php?idxno=1547416 (2026-07-28)
- L57: - **충남도 AI 공유재산 무단점유 검출**: 항공영상 딥러닝, 구축 계획 단계 — https://www.chungnam.go.kr/cnportal/cnapcPressList/cnapcPress/view.do?nttId=2170131&menuNo=500498
- L58: - **세종시 수기 고지서 AI 자동화**: 2026-05-18 협약 체결 단계 — https://www.sidaeilbo.co.kr/1241429 (2026-05-20)
- L59: - **부산시 민원대응 AI 에이전트**: 과기정통부 실증사업 단계 — https://www.busan.go.kr/nbtnewsBU/1696039 (2025-09-08)
- L60: - **서울시 AI 침수예측**: 15개소 시범, 담당자 보조 수준 — https://www.insight.co.kr/news/553572
- L61: - **경기도 AI 체납 분석 서비스**: 시범 언급만 확인, 세부 미확인(체납차량 출현지도는 용인시=기초) — https://biz.heraldcorp.com/article/10784587

### 13-sweep-special.md (12)

- L54: - **교육행정 업무지원 AI '충실이' (대구시교육청)**: 감사 위반 사례·규정 질의응답으로 신규 공무원 지원. 2026-09-01 운영 개시 예정이라 실사용 전. [매일신문](https://www.imaeil.com/page/view/2026081316360557578)(2026-08-13)
- L55: - **GneGPT·Gne전용 비서 (경남교육청)**: 공문·보고서 초안·법령 검색 지원, 2026년 유·초 시행 예정. [경남일보](https://www.gnnews.co.kr/news/articleView.html?idxno=633435)
- L56: - **해군 함정 운항·기관일지 자동작성**: 30여 종 수기 일지의 AI 자동작성 — 사업 수주·개발 착수 단계. [청년개발자신문](https://www.devtimes.co.kr/news/511799)
- L57: - **AI 신체등급 판정지원 플랫폼 (국군의무사령부)**: 척추관협착증 등 영상 분석으로 신체등급 판정 지원, 서울지구병원 시범 예정. [전자신문](https://www.etnews.com/20241222000034)(2024-12)
- L58: - **조난 음성 자동식별 AI (해양경찰청 상황실)**: 무선 조난음성 STT·긴급상황 자동 인지 — 2026~2028 R&D, 2029년 전국 상황실 적용 목표. [아시아투데이](https://www.asiatoday.co.kr/kn/view.php?key=20260526010007420)
- L59: - **AI 기반 차세대 112시스템 (경찰청)**: 신고 즉시 기존 신고이력·유력 가해자 파악 — 연구용역 발주 단계. [서울경제](https://www.sedaily.com/article/14147254)
- L60: - **AI 양형지원 플랫폼 (대법원)**: 양형인자 추출·양형기준 기재 지원, 103억 구축 추진 중. [디지털데일리](https://www.ddaily.co.kr/page/view/2026080811170834748)(2026-08)
- L61: - **화재원인 판별 AI (국과수·국립소방연구원)**: 현장사진 기반 발화지점·연소패턴 자동 추정 — 연구·검증 단계(전남 화재조사관 100명 설문에서 실용성 긍정 평가). [세이프타임즈](https://www.safetimes.co.kr/news/articleView.html?idxno=233286), [KCI 논문](https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART003274057)
- L62: - **AI 불법어업 예측·표적화 분석 (서귀포해양경찰서)**: 2026년 해경청 AI 경진대회 최우수 — 현업 상시 운용 증거 미확인. [전국매일신문](https://www.jeonmae.co.kr/news/articleView.html?idxno=1273791)
- L63: - **AI 활용 재무행정 콘텐츠 (안산교육지원청)**: 예산·계약·관재 교육 콘텐츠를 AI로 제작 — AI가 업무 자체를 대체한 것이 아니라 교육자료 제작에 활용된 사례. [다음뉴스](https://v.daum.net/v/20260727131847196)(2026-07-27)
- L64: - **AI 면접 간부 선발 (육군)**: 시범 적용 후 2022년 도입 추진 — 2024~2026년 기준 최신 운용 근거 미확인. [세계일보](https://m.segye.com/view/20190618511832)
- L66: **요약**: 확정 16건 + 보류 11건. 직역별 분포 — 경찰 3, 검찰 2, 법원 1, 교정·보호 2, 군 3, 소방 3, 해경 1, 교육행정 1. 교육행정은 교사 지원(제주) 외 행정실·나이스 직접 사례가 약해 보류(대구·경남)가 실사용 전환 시 보강 후보입니다. 검색 세션 한도(200회)에 도달해 추가 탐색은 종료했습니다.

---

## 5. 하지 않은 것

- cases JSON·HTML 내용 변경 없음
- 법령 API 전수 재검증 없음
- 동료심사 문헌 미착수
- 파랑 검증 실접촉 미착수
- 웹 검색 비활성으로 광주 AI 대변인 1차 출처 재검색 못 함

## 6. 한 줄 상태

137건 게시본은 구조·법령 검증 완료·파랑 미검증. 보류 3건 유지. 루프 소멸 32건 중 30건은 자동화 흡수, 제도 재설계 동반은 2건. 다음 병목은 교정 시트 회수.

