# 사례 JSON 스키마 (체계도 생성용)

파일 위치: `~/korea100/artifacts/ax-case-studies/cases/{slug}.json` (slug = 영문 소문자·하이픈)

```jsonc
{
  "id": 42,                          // 마스터 풀 번호
  "slug": "nts-tax-consult",
  "meta": {
    "org": "국세청",
    "work": "국세상담센터 상담사의 세무상담",
    "stage": "정식",                  // 시범 | 정식 | 전면
    "citizen": false,                // true면 시민판 문법(파랑=탐색)
    "sources": ["https://... (2024-05-01)"],
    "sweep": "13-sweep-central.md"
  },
  "lanes": ["민원인", "상담사", "부서장", "시스템"],   // AS-IS 레인 3~5개
  "toolLane": "AI 상담",                              // TO-BE에 추가되는 AI 레인 이름
  "gates": ["G0 접수", "G1 확인", "G2 처리", "G3 통지"], // 4~7개, "G0 이름" 형식 필수
  "basisNote": "근거(국가법령정보센터 DRF 원문 대조): ○○법 제○조(제목) … <b>파란 칸은 규정에 명문이 없어 실무를 추론으로 재구성한 영역</b>입니다. 도구 사실은 …(출처) 기반입니다.",
  "asis": {
    "title": "헤드라인 문장 <b>강조부</b>",
    "subtitle": "2~3문장. 규정(초록)과 추론(파랑)이 무엇인지 설명",
    "headline": "전 단계 N = 규정 a + 추론 b · 루프 c",
    "nodes": [
      // [id, gate(0-base), lane(0-base), kind, name, sub, tag?]
      ["P01", 0, 0, "statute", "민원 신청", "민원처리법 제8조"],
      ["P02", 1, 1, "inferred", "근거 수기 검색", "실무 관행"]
    ],
    "edges": [["P01","P02"], ["P03","P01","loop","보완 제출"]]
  },
  "tobe": {
    "title": "…", "subtitle": "…",
    "headline": "대체 N · 간소화 N · 소멸 N · 자동 N — 사람 단계 A → B",
    "nodes": [
      ["A01", 1, 4, "auto", "AI 자동 검색", "…"],
      ["P02", 1, 1, "replaced", "근거 수기 검색", "자동 검색으로 대체", "A01로 대체"]
    ],
    "edges": [["P01","A01","auto"], ["P02","A01","replace"]]
  }
}
```

## kind 값 (색 문법 — 고정)
| kind | 의미 | 사용 규칙 |
|---|---|---|
| `statute` | 규정(초록) | **반드시 sub에 법령명+조문번호**. 검증 불가하면 inferred로 |
| `inferred` | 추론/탐색(파랑) | 규정에 명문 없는 실무. sub에 "실무 관행" 등 |
| `auto` | AI 행위자(보라) | TO-BE 전용. lane = 마지막 레인(toolLane) |
| `replaced` | 대체(바랜 주황) | TO-BE 전용. 원래 자리·원래 lane 유지, tag="A0n로 대체" |
| `removed` | 소멸(바랜 빨강) | 단계 자체가 없어질 때만 |
| `changed` | 간소화(노랑) | 남되 부담 축소 |

## 필수 규칙 (audit에서 자동 검사)
1. AS-IS 노드는 `statute` 또는 `inferred`만. TO-BE에 `auto` 최소 1개.
2. TO-BE의 `replaced` 노드는 AS-IS에 같은 id가 존재해야 하고, tag가 `A0n로 대체` 형식이며 그 A0n이 TO-BE에 존재해야 함.
3. edge의 from/to는 해당 시트 노드 id에 존재해야 함. edge type ∈ {없음, loop, auto, replace}.
4. `statute` 노드의 sub에는 `제N조` 패턴이 있어야 함.
5. gate 인덱스 < gates.length, lane 인덱스 < lanes.length(TO-BE는 +1).
6. headline의 숫자는 실제 노드 집계와 일치해야 함.
7. 과장 금지: 출처에 없는 수치·기관·단계를 만들지 말 것. 불확실하면 노드를 만들지 말고 subtitle에서 언급만.
