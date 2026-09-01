# 광주 용수·도로 수요·공급계획 온톨로지 샘플 데모

샘플 9호. 새로운 케이스 종류다.

| 종류 | 단위 | 답하는 질문 |
|---|---|---|
| `institution` | 제도 하나 | 이 사건이 그 제도의 어느 단계인가 |
| `project` | 사업 하나 | 어느 마일스톤이 열렸나 |
| **`milestone`** | 마일스톤 하나 + 제도 여럿 | **그 제도들 중 어느 조합을 밟을지** |

## 왜 새 종류가 필요했나

N23은 제도 여섯이 걸린 자리다. 그런데 여섯을 다 밟는 자리가 아니다. 오버레이가
`mappingStatus`로 그것을 이미 말하고 있었다.

| 적용 | 제도 | 근거 |
|---|---|---|
| **확정** | 공업용수·취수 허가 (P01·P02) | 어느 조합이든 원수는 확보해야 한다 |
| **확정** | 국가 도로·철도 SOC (전체) | 접근도로는 필요하다 |
| 후보 | 공업용수도 사업인가 | 용수 공급주체가 정해져야 |
| 후보 | 공공폐수처리시설 기본계획 | 폐수처리 방식이 정해져야 |
| 후보 | 지하수 개발·이용허가 | 보조 수원 사용 여부가 정해져야 |
| 후보 | 반도체 기반시설 신속처리 | 특례 적용 여부가 정해져야 (N03 지정 전제) |

제도가 여섯이라 단계 ID가 충돌한다. `step:<제도 slug>:<노드 ID>`로 이름을 붙였다.
P01만 여섯 개가 있다.

## 질문 1 — 조합 결정
> 제도 여섯 중 어느 걸 밟아야 해?

`ap:decide-supply-routes` (`role:gwangju`). 공급주체(수도법 제48조제1항·제49조제1항),
폐수처리 방식(물환경보전법 제48조제1항·제49조제3항), 지하수 사용(지하수법 제7조제1항·제8조제1항),
신속처리 특례(반도체특별법 제14조제1항) 넷을 정하면 조합이 확정된다.

마지막 항목이 경계선이다 — **확정된 조합만 계획에 넣는다. 후보 제도를 요건처럼 적으면
이후 인허가 일정이 부풀려진다.**

## 질문 2 — 지금 할 수 있는 것
> 용수·도로는 뭐부터 해야 해?

`ap:start-confirmed-tracks` (`role:developer`). 조합이 미확정이어도 원수 확보와 접근도로는
지금 착수할 수 있다. 상태도 그렇게 갈라져 있다 — 확정 트랙 단계 13개는 `ready`,
후보 단계 15개는 `applicability_undetermined`.

## 찾은 비대칭

전력 경로는 오버레이에 `gridPath` **파라미터**로 선언되어 있다. 그래서 사업 층이
N19·N20을 `path_undetermined`로 판정한다.

용수 경로는 자유 문구 **note**로만 있다. "용수 공급주체·처리구역·폐수처리 방식이
미확정이므로 기반시설별 후보 절차로 표시". 그래서 사업 층에서 N23은 그냥 `ready`로 보인다.

같은 성격의 미확정인데 한쪽만 기계가 읽는다. 오버레이는 고치지 않고
`rule:water-route-is-not-parameterised`로 남겼다. 사업 데이터 소유자의 판단이 필요하다.

## 아직 정하지 않은 갈림길

MCP `get_pending_decisions`가 사업 전체의 미확정 파라미터를 모은다.

```
파라미터 4개가 마일스톤 5개를 여닫습니다. 어느 값을 택할지는 사업이 정합니다.

▸ gridPath
     formal-assessment    → N19  정식 전력계통영향평가
     exempt-or-expedited  → N20  계통영향평가 면제·신속처리
▸ heritageImpactDiagnosisRequired  → N13
▸ privateLandCompensationRequired  → N16
▸ hazardousFacilityPermitsRequired → N46
▸ powerDemandMw  (게이트 없음 — gridPath 결정의 입력)

배타 분기: gridPath → formal-assessment:N19 | exempt-or-expedited:N20
```

무엇을 고를지는 말하지 않는다. 고를 것이 무엇인지만 말한다.

## 하류

이 계획이 확정되어야 N24(승인·비용분담)와 N50(신규 수원 확보 — 동복댐 증축)이 열린다.
둘 다 `hard finish_to_start`로 물려 있다.

## 실행
```bash
node ontology/scripts/derive-milestone-case.mjs --remerge samples/water-road-supply-plan.case.json
node mcp/scripts/ontology-query-once.mjs --case samples/water-road-supply-plan.case.json \
  "제도 여섯 중 어느 걸 밟아야 해?"
```
