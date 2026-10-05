# 법령 지도 조문 분류 표본 — 건축법(001823)

생성: 2026-10-05 · 방법: rule-based v0.2 · 스크립트: `web/scripts/classify-law-articles.mjs --lawId 001823 --sheet` · 결과: `web/data/law-map/001823.class.json`

모든 값은 **규칙 기반 추론**이다. 단계: 제목 단서(0.8, 장과 일치 0.9) → 제목 단서 충돌은 머리말·본문으로 해소(0.5/0.4) → 본문 단서(0.6) → 약한 제목 단서(특례·범위 등, 0.6) → 장 제목(0.5) 순으로 보고, 어느 단서도 없으면 `unknown`이다. 주체: 첫 항 첫 문장의 주어('…은/는' 0.8, '…이/가' 0.7, 공동 주어 0.5, 주어 생략형 '…에게 신고를 하면' 0.6)에서 읽고, 주어가 사물이면 제목·단계·본문 전체에서 유추한다(0.4~0.6; 하위법령 기술기준은 `none` 0.6). 표의 신뢰도는 두 축 중 낮은 쪽이다. `S:`는 단계 근거, `A:`는 주체 근거, `↔`는 보조 주체.

## 1. 법률 조문 표본 40건 (문서 순서로 4개마다 1건, 전체 166조)

| # | 조문 | 제목 | 단계 | 주체 | 신뢰도 | 근거 |
|---|---|---|---|---|---|---|
| 1 | 제1조 | 목적 | purpose | none | 0.8 | S:title:목적, S:chapter:제1장 총칙, A:subject:법은, A:subject:주체 단서 없음, A:stage:purpose→none |
| 2 | 제4조의2 | 건축위원회의 건축 심의 등 | procedure | citizen ↔ local·committee | 0.5 | S:title:위원회, S:title:심의(머리말), S:text:신청하여야×1, S:text:신청할 수 있다×1, S:text:통보하여야×2, S:text:하여야 한다×3, A:subject:자는, A:cue:하려는 자, A:also:local(시ㆍ도지사), A:also:committee(위원회) |
| 3 | 제4조의6 | 심의를 위한 조사 및 의견 청취 | supervision | committee | 0.4 | S:title:조사, S:title:심의, S:title:청취(머리말), S:text:출입하여×1, S:text:하여야 한다×1, A:subject:건축민원전문위원회는, A:cue:위원회 |
| 4 | 제6조 | 기존의 건축물 등에 관한 특례 | misc | local | 0.6 | S:title:특례(약한 단서), A:subject:허가권자는, A:cue:허가권자 |
| 5 | 제8조 | 리모델링에 대비한 특례 등 | misc | none | 0.5 | S:title:특례(약한 단서), A:text:본문에 주체 단서 없음→none |
| 6 | 제12조 | 건축복합민원 일괄협의회 | procedure | local | 0.8 | S:title:협의, A:subject:허가권자는, A:cue:허가권자 |
| 7 | 제15조 | 건축주와의 계약 등 | standard | citizen | 0.8 | S:title:계약, A:subject:건축관계자는, A:cue:건축관계자, A:title:건축주 |
| 8 | 제17조의3 | 소유자를 확인하기 곤란한 공유지분 등에 대한 처분 | procedure | citizen | 0.6 | S:text:공고하고×1, A:subject:건축주는, A:cue:건축주, A:title:소유자 |
| 9 | 제20조 | 가설건축물 | procedure | citizen ↔ local | 0.4 | S:text:준용한다×1, S:text:허가를 받아야×1, S:text:협의하여야×1, S:text:하여야 한다×4, A:subject:자는, A:cue:하려는 자, A:also:local(특별자치시장) |
| 10 | 제24조 | 건축시공 | standard | citizen | 0.6 | S:text:하여야 한다×5, S:text:아니 된다×1, A:subject:공사시공자는, A:cue:시공자 |
| 11 | 제27조 | 현장조사ㆍ검사 및 확인업무의 대행 | misc | local ↔ citizen | 0.5 | S:title:대행(머리말), S:title:검사, S:title:조사, S:text:수수료×1, S:text:하여야 한다×2, A:subject:허가권자는, A:cue:허가권자, A:also:citizen(건축사) |
| 12 | 제31조 | 건축행정 전산화 | operation | central | 0.8 | S:title:전산, A:subject:국토교통부장관은, A:cue:국토교통부장관 |
| 13 | 제35조 | 삭제 | unknown (삭제) | none | 1 | S:title:삭제, A:title:삭제 |
| 14 | 제38조 | 건축물대장 | operation | local | 0.8 | S:title:대장, A:subject:시장ㆍ군수ㆍ구청장은, A:cue:시장ㆍ군수ㆍ구청장 |
| 15 | 제42조 | 대지의 조경 | standard | citizen ↔ local | 0.8 | S:title:조경, A:subject:건축주는, A:cue:건축주, A:also:local(지방자치단체) |
| 16 | 제46조 | 건축선의 지정 | procedure | local | 0.5 | S:title:지정, A:subject:한다]은, A:subject:주체 단서 없음, A:body:local(특별자치시장) |
| 17 | 제48조의3 | 건축물의 내진능력 공개 | procedure | citizen | 0.8 | S:title:공개, A:subject:자는, A:cue:자는 |
| 18 | 제50조 | 건축물의 내화구조와 방화벽 | standard | citizen | 0.4 | S:title:구조, S:title:방화, A:subject:건축물은, A:subject:주체 단서 없음, A:thing-subject:건축물은, A:stage:standard→citizen(수범자 추정) |
| 19 | 제52조의2 | 실내건축 | standard | citizen | 0.4 | S:text:하여야 한다×2, A:subject:실내건축은, A:subject:주체 단서 없음, A:thing-subject:실내건축은, A:body:citizen(사용자), A:body:local(특별자치시장), A:stage:standard→citizen(수범자 추정) |
| 20 | 제52조의6 | 건축자재등 품질인정기관의 지정ㆍ운영 등 | procedure | central | 0.4 | S:title:운영(머리말), S:title:인정, S:title:지정, S:text:취소할 수 있다×1, S:text:취소하여야×1, S:text:점검×2, S:text:수수료×1, S:text:통보하여야×1, S:text:지정할 수 있다×1, A:subject:국토교통부장관은, A:cue:국토교통부장관, A:also:committee(공공기관) |
| 21 | 제55조 | 건축물의 건폐율 | standard | citizen | 0.4 | S:title:건폐율, A:subject:최대한도는, A:subject:주체 단서 없음, A:thing-subject:최대한도는, A:stage:standard→citizen(수범자 추정) |
| 22 | 제59조 | 맞벽 건축과 연결복도 | standard | citizen | 0.4 | S:text:기준에 따라×1, A:stage:standard→citizen(수범자 추정) |
| 23 | 제63조 | 삭제 | unknown (삭제) | none | 1 | S:title:삭제, A:title:삭제 |
| 24 | 제65조의2 | 지능형건축물의 인증 | procedure | central | 0.8 | S:title:인증, A:subject:국토교통부장관은, A:cue:국토교통부장관 |
| 25 | 제68조 | 기술적 기준 | standard | citizen | 0.4 | S:title:기준, A:subject:기준은, A:subject:주체 단서 없음, A:thing-subject:기준은, A:body:central(국토교통부장관), A:body:committee(전문기관), A:body:citizen(한 자), A:stage:standard→citizen(수범자 추정) |
| 26 | 제70조 | 특별건축구역의 건축물 | unknown | committee | 0 | A:subject:건축물은, A:subject:주체 단서 없음, A:body:central(국가), A:body:local(지방자치단체), A:body:committee(공공기관) |
| 27 | 제74조 | 통합적용계획의 수립 및 시행 | operation | local | 0.4 | S:title:계획의 수립, A:body:local(허가권자) |
| 28 | 제77조의2 | 특별가로구역의 지정 | procedure | local ↔ central | 0.5 | S:title:지정, A:subject:허가권자는, A:cue:허가권자, A:joint:central(국토교통부장관) |
| 29 | 제77조의6 | 건축협정의 인가 | procedure | citizen ↔ committee·local | 0.8 | S:title:인가, A:subject:대표자는, A:cue:자는, A:also:committee(운영회), A:also:local(인가권자) |
| 30 | 제77조의10 | 건축협정의 효력 및 승계 | misc | citizen | 0.8 | S:title:효력, S:title:승계, A:subject:소유자등은, A:cue:소유자 |
| 31 | 제77조의14 | 건축협정 집중구역 지정 등 | procedure | local | 0.8 | S:title:지정, A:subject:건축협정인가권자는, A:cue:인가권자 |
| 32 | 제78조 | 감독 | supervision | central | 0.8 | S:title:감독, A:subject:국토교통부장관은, A:cue:국토교통부장관, A:also:local(시ㆍ도지사) |
| 33 | 제81조 | 삭제 | unknown (삭제) | none | 1 | S:title:삭제, A:title:삭제 |
| 34 | 제83조 | 옹벽 등의 공작물에의 준용 | misc | citizen ↔ local | 0.8 | S:title:준용, S:chapter:제9장 보칙, A:subject:자는, A:cue:하려는 자, A:also:local(특별자치시장) |
| 35 | 제87조 | 보고와 검사 등 | supervision | committee ↔ central·local·citizen | 0.5 | S:title:검사, S:title:보고, A:subject:건축지도원은, A:span:업무대행자 |
| 36 | 제89조 | 분쟁위원회의 구성 | organization | committee | 0.8 | S:title:위원회, S:title:구성, A:subject:분쟁위원회는, A:cue:위원회, A:title:위원회 |
| 37 | 제93조 | 조정등의 신청에 따른 공사중지 | supervision | local | 0.4 | S:title:공사중지(머리말), S:title:신청, S:title:조정, S:text:아니 된다×1, A:body:local(시ㆍ도지사) |
| 38 | 제97조 | 분쟁의 재정 | procedure | citizen | 0.5 | S:title:재정, A:subject:재정은, A:subject:주체 단서 없음, A:body:citizen(당사자), A:body:committee(위원회) |
| 39 | 제101조 | 조정 회부 | procedure | committee | 0.8 | S:title:조정, S:title:회부, A:subject:분쟁위원회는, A:cue:위원회 |
| 40 | 제104조의2 | 건축위원회의 사무의 정보보호 | organization | committee ↔ citizen | 0.5 | S:title:위원회, A:subject:등은, A:span:위원회 |

## 2. 단계 × 주체 행렬 (삭제 조문 제외, 주 주체 기준)

### 법률 (건축법) — 166조 중 삭제 13, 분류 대상 153

| 단계 \ 주체 | 국민·사업자<br>`citizen` | 중앙<br>`central` | 지방<br>`local` | 위원회·기관<br>`committee` | 법원<br>`court` | undefined<br>`constitutional` | 없음<br>`none` | 미상<br>`unknown` | 계 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 목적·정의 `purpose` | 1 | · | · | · | · | · | 3 | · | 4 |
| 기준·의무 `standard` | 32 | 3 | 5 | 1 | · | · | 2 | · | 43 |
| 인허가·절차 `procedure` | 22 | 3 | 13 | 2 | · | · | 1 | · | 41 |
| 행정 운영 `operation` | · | 1 | 5 | · | · | · | · | · | 6 |
| 조직 `organization` | 1 | · | 4 | 6 | · | · | · | · | 11 |
| 감독·시정 `supervision` | 1 | 1 | 9 | 4 | · | · | · | · | 15 |
| 벌칙 `penalty` | 8 | · | · | · | · | · | · | · | 8 |
| 보칙 `misc` | 10 | 2 | 5 | 2 | · | · | 4 | · | 23 |
| 미상 `unknown` | · | · | 1 | 1 | · | · | · | · | 2 |
| **계** | **75** | **10** | **42** | **16** | **0** | **0** | **10** | **0** | **153** |

### 대통령령 (건축법 시행령) — 198조 중 삭제 59, 분류 대상 139

| 단계 \ 주체 | 국민·사업자<br>`citizen` | 중앙<br>`central` | 지방<br>`local` | 위원회·기관<br>`committee` | 법원<br>`court` | undefined<br>`constitutional` | 없음<br>`none` | 미상<br>`unknown` | 계 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 목적·정의 `purpose` | · | · | · | · | · | · | 7 | · | 7 |
| 기준·의무 `standard` | 22 | 2 | 7 | · | · | · | 17 | · | 48 |
| 인허가·절차 `procedure` | 12 | 2 | 11 | 8 | · | · | 3 | · | 36 |
| 행정 운영 `operation` | 1 | · | 1 | · | · | · | · | · | 2 |
| 조직 `organization` | 2 | 3 | 4 | 3 | · | · | 1 | · | 13 |
| 감독·시정 `supervision` | 2 | 2 | 3 | 2 | · | · | 4 | · | 13 |
| 벌칙 `penalty` | 1 | · | · | · | · | · | · | · | 1 |
| 보칙 `misc` | 2 | 2 | 4 | 2 | · | · | 1 | · | 11 |
| 미상 `unknown` | 1 | · | 2 | 1 | · | · | 4 | · | 8 |
| **계** | **43** | **11** | **32** | **16** | **0** | **0** | **37** | **0** | **139** |

### 부령 7건 — 294조 중 삭제 42, 분류 대상 252
건축물대장의 기재 및 관리 등에 관한 규칙 · 건축물의 구조기준 등에 관한 규칙 · 건축물의 설비기준 등에 관한 규칙 · 건축물의 피난ㆍ방화구조 등의 기준에 관한 규칙 · 건축법 시행규칙 · 지능형건축물의 인증에 관한 규칙 · 표준설계도서 등의 운영에 관한 규칙

| 단계 \ 주체 | 국민·사업자<br>`citizen` | 중앙<br>`central` | 지방<br>`local` | 위원회·기관<br>`committee` | 법원<br>`court` | undefined<br>`constitutional` | 없음<br>`none` | 미상<br>`unknown` | 계 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 목적·정의 `purpose` | · | · | · | · | · | · | 21 | · | 21 |
| 기준·의무 `standard` | 34 | 12 | 8 | 2 | · | · | 57 | · | 113 |
| 인허가·절차 `procedure` | 32 | 7 | 8 | 4 | · | · | 5 | · | 56 |
| 행정 운영 `operation` | 7 | · | 9 | · | · | · | 7 | · | 23 |
| 조직 `organization` | · | 1 | 1 | 3 | · | · | · | · | 5 |
| 감독·시정 `supervision` | 2 | 3 | 3 | 1 | · | · | 2 | · | 11 |
| 보칙 `misc` | 5 | 1 | 2 | · | · | · | 3 | · | 11 |
| 미상 `unknown` | 3 | · | 1 | · | · | · | 7 | 1 | 12 |
| **계** | **83** | **24** | **32** | **10** | **0** | **0** | **102** | **1** | **252** |

## 3. 미상·저신뢰 비율 (삭제 조문 제외)

| 층위 | 분류 대상 | 단계 unknown | 주체 unknown | 신뢰도 < 0.5 | 보조 주체 있음 | 평균 신뢰도 |
|---|---:|---:|---:|---:|---:|---:|
| 법률 | 153 | 2 (1%) | 0 (0%) | 36 (24%) | 42 (27%) | 0.60 |
| 대통령령 | 139 | 8 (6%) | 0 (0%) | 62 (45%) | 22 (16%) | 0.49 |
| 부령 | 252 | 12 (5%) | 1 (0%) | 68 (27%) | 45 (18%) | 0.55 |
| **전체** | 544 | 22 (4%) | 1 (0%) | 166 (31%) | 109 (20%) | 0.55 |

삭제 조문 114건(법률 13·대통령령 59·부령 42)은 `stage: unknown, actor: none, deleted: true`로 따로 센다. 본문 출처: 원본 658, 미리보기 0, 없음 0.

## 4. 신뢰도가 가장 낮은 10건

| 조문 | 제목 | 단계 | 주체 | 신뢰도 | 근거 |
|---|---|---|---|---|---|
| 건축법 제54조 | 건축물의 대지가 지역ㆍ지구 또는 구역에 걸치는 경우의 조치 | unknown | local | 0 | A:subject:방화지구는, A:subject:주체 단서 없음, A:body:local(지방자치단체) |
| 건축법 제70조 | 특별건축구역의 건축물 | unknown | committee | 0 | A:subject:건축물은, A:subject:주체 단서 없음, A:body:central(국가), A:body:local(지방자치단체), A:body:committee(공공기관) |
| 건축법 시행령 제18조 | 설계도서의 작성 | unknown | local | 0 | A:body:local(군수) |
| 건축법 시행령 제21조 | 공사현장의 위해 방지 | unknown | none | 0 | A:subject:사항은, A:subject:주체 단서 없음, A:text:본문에 주체 단서 없음→none |
| 건축법 시행령 제61조의2 | 실내건축 | unknown | none | 0 | A:text:본문에 주체 단서 없음→none |
| 건축법 시행령 제62조 | 건축자재의 품질관리 등 | unknown | citizen | 0 | A:body:citizen(제조업자), A:body:local(허가권자) |
| 건축법 시행령 제63조의7 | 건축물의 범죄예방 | unknown | none | 0 | A:text:본문에 주체 단서 없음→none |
| 건축법 시행령 제106조 | 특별건축구역의 건축물 | unknown | committee | 0 | A:body:committee(공공기관) |
| 건축법 시행령 제110조의5 | 건축협정에 따라야 하는 행위 | unknown | none | 0 | A:text:본문에 주체 단서 없음→none |
| 건축법 시행령 제110조의6 | 건축협정에 관한 지원 | unknown | local | 0 | A:subject:건축협정인가권자가, A:cue:인가권자, A:also:citizen(한 자), A:also:committee(운영회) |

## 5. 규칙이 가르지 못하는 것 (정직하게)

- **주어가 생략된 조문**: 「건축신고」(법 제14조)처럼 "…에게 신고를 하면 허가를 받은 것으로 본다"는 문장에는 주어가 없다. v0.1은 '…에게 (신고|신청|제출)를 하면/하여야' 문형을 수범자(`citizen` 0.6, `implicit-subject:신고`)로 읽지만, 그 밖의 주어 생략 문형은 본문 기관명 빈도(0.4)에 기댄다.
- **사물 주어의 기술기준**: 「설계하중」「콘크리트의 배합」 같은 하위법령 조문은 주어가 사물(압축강도는, 주근은)이다. v0.1은 시행령·부령에서 이 유형을 `none` 0.6(`thing-subject`)으로 둔다 — 수범자를 지어내지 않는다. 법률의 사물 주어 기준 조문(「대지의 안전」「건폐율」)은 여전히 `standard→citizen` 0.4 추정이다.
- **제목 단서 충돌**: 「건축허가 제한 등」(허가=절차, 제한=기준)은 머리말 규칙과 본문 단서가 서로 다른 쪽을 가리켜 0.4다. 「건축자재등 품질인정기관의 지정ㆍ운영 등」(지정·인정=절차, 운영=조직)도 같다. 한 조문이 두 단계를 동시에 담는 경우라 단일 라벨 자체가 무리일 수 있다.
- **공동 주어**: 「건축위원회」(법 제4조) "국토교통부장관, 시ㆍ도지사 및 시장ㆍ군수ㆍ구청장은"처럼 세 층위가 함께 주어이면 먼저 적힌 쪽을 `primary`, 나머지를 `actors[].role=secondary`로 둔다(0.5). 격자에는 primary 레인에만 놓이고 ↔ 표시로 보조 주체를 알린다.
- **장 제목 폴백**: 총칙 장의 조문은 제목·본문 단서가 없을 때 `purpose` 0.5로 떨어진다. 특례·배제는 약한 단서(`misc` 0.6)로 잡았지만, 「통일성을 유지하기 위한 도의 조례」(제7조) 같은 것은 어느 단계에도 잘 안 맞는다.
- **'공개'·'조정'·'재정'의 다의성**: 「공개 공지 등의 확보」의 공개(公開 아님), 「조정위원회와 재정위원회」의 조정·재정(분쟁조정, 財政 아님)은 절차 단서로 잡힌다. 머리말 규칙으로 대부분 걸러졌지만 근거에 흔적이 남는다.
- **일반 의무 문형의 과대 대표**: 본문 단서 중 "하여야 한다"는 거의 모든 조문에 나와 가중치를 0.5로 낮췄는데도 제목 단서가 없는 조문은 `standard`로 쏠린다. 행정기관의 기록·통계 의무는 v0.1에서 `operation`(대장·통계·전산·계획 수립·실태조사·고시) 단계로 분리했지만, 제목에 단서가 없으면 여전히 `standard × local`로 들어간다.
- **시행령·규칙의 조문 제목**: 「건축신고」「건축물대장」처럼 법률과 같은 제목을 쓰는 하위 조문은 법률과 같은 단계로 분류되지만, 실제 내용은 '그 절차의 세부 서식·기한'이다. 층위를 함께 보면 맞지만 단독 라벨로는 법률 조문과 구분되지 않는다.
- **각 호만 있는 조문**: DRF 본문 파서(`lawArticleText`)가 각 호만 있는 조문의 머리 문장("다음 각 호의 어느 하나에 해당하는 자는 … 처한다")을 떨어뜨린다. 이 CLI에서 원본 `조문내용`의 머리 문장을 다시 붙여 벌칙 조문의 주어를 살렸다. 파서 자체는 고치지 않았다(공유 코드).
- **법원 레인**: 건축법에는 법원이 주어인 조문이 없어 `court`는 0건이다. 단서(법원·검찰·판사·검사의/검사가·사법경찰관·법관)는 들어 있지만 이 법에서는 검증되지 않았다.
- **공무원은 수범자로 센다**: 「국가공무원법」류에서 '공무원은 …하여야 한다'의 공무원은 `citizen`(국민·사업자) 레인에 들어간다. 레인 이름이 어색하지만 '규율을 받는 쪽'이라는 뜻은 같다. 국회사무총장·법원행정처장·헌법재판소사무처장·중앙선거관리위원회사무총장 같은 헌법기관 사무기구는 v0.2부터 `constitutional` 레인.

## 6. 다음 손볼 곳

- 단서표(`web/scripts/lib/law-map-classify.mjs` 상단)는 데이터다. 이 표본에서 틀린 줄을 고치면 단서를 더하거나 빼는 것으로 대부분 대응된다.
- 주체 축은 '첫 항 첫 문장 주어' 하나에 기대고 있다. 항마다 주어가 다른 조문(허가권자가 ①, 건축주가 ②)은 항 단위 분류로 내려가야 정확해진다.
- 두 단계를 함께 담는 조문(허가+제한, 지정+운영)은 다중 라벨을 허용할지 결정이 필요하다.

## 7. rule-based v0.1 → rule-based v0.2 달라진 조문 (63건: 단계만 6, 주체만 47, 둘 다 10) — 앞 10건

기준: `001823.class.v0.1.json` (2026-10-05, rule-based v0.1)

| 조문 | 제목 | 이전 | 이후 | 신뢰도 | 바뀐 이유(근거) |
|---|---|---|---|---|---|
| 건축법 제4조 | 건축위원회 | organization × central (0.5) | organization × local | 0.5 | A:joint:central(국토교통부장관) |
| 건축법 제29조 | 공용건축물에 대한 특례 | misc × central (0.5) | misc × local | 0.5 | A:joint:central(국가) |
| 건축법 제33조 | 전산자료의 이용자에 대한 지도ㆍ감독 | supervision × central (0.5) | supervision × local | 0.5 | S:title:전산, A:joint:central(국토교통부장관) |
| 건축법 제43조 | 공개 공지 등의 확보 | standard × local (0.5) | standard × citizen | 0.4 | A:thing-subject:건축물은 |
| 건축법 제48조 | 구조내력 등 | standard × local (0.5) | standard × citizen | 0.4 | A:thing-subject:건축물은 |
| 건축법 제49조 | 건축물의 피난시설 및 용도제한 등 | standard × central (0.4) | standard × committee | 0.4 | S:title:제한, S:title:시설, S:title:피난, A:body:central(국가), A:body:local(지방자치단체), A: |
| 건축법 제49조의2 | 피난시설 등의 유지ㆍ관리에 대한 기술지원 | standard × central (0.5) | standard × local | 0.5 | A:joint:central(국가) |
| 건축법 제52조 | 건축물의 마감재료 등 | standard × central (0.5) | standard × citizen | 0.4 | A:thing-subject:포함한다]는 |
| 건축법 제52조의2 | 실내건축 | standard × local (0.5) | standard × citizen | 0.4 | A:thing-subject:실내건축은 |
| 건축법 제53조 | 지하층 | standard × local (0.5) | standard × citizen | 0.4 | A:thing-subject:설비는 |

