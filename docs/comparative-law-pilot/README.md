# Korea100 해외 비교법 파일럿

국내 341개 제도 카탈로그와 별도로, 해외 법령의 절차를 Korea100 업무구조도 형식으로 표현하는 실험 공간이다. 아래 2개 파일럿은 국내 제도 수에 포함하지 않는다.

## 공개 구조도

- 일본 환경영향평가: [설명](japan-environmental-impact-assessment.md) · [PNG](japan-environmental-impact-assessment.png) · [SVG](japan-environmental-impact-assessment.svg) · [ProcessModel](japan-environmental-impact-assessment.process.json)
- 베트남 상업 수입통관: [설명](vietnam-commercial-import-customs.md) · [PNG](vietnam-commercial-import-customs.png) · [SVG](vietnam-commercial-import-customs.svg) · [ProcessModel](vietnam-commercial-import-customs.process.json)

두 구조도는 각 설명 문서에 적은 현지 공식 법령·절차 원문을 기준으로 작성했다. 개별 사업·품목의 실무 적용에는 별도 법령, 하위 규정, 행정기관의 최신 안내가 추가로 필요할 수 있다.

## 후보 탐색기

세계법제정보센터의 공개 데이터를 국내 제도 키워드와 대조해 다음 비교 후보를 찾는 보조 스크립트도 포함한다.

기준 데이터:

- Data: `법제처_세계법제정보센터_부처 부서 및 법령_20240801`
- Portal page: <https://www.data.go.kr/data/15092920/fileData.do?recommendDataYn=Y>
- Format: CP949/EUC-KR CSV, 4,010 rows
- Portal modified date: 2026-02-04
- License note on portal: 이용허락범위 제한 없음

실행:

```bash
cd /Users/seohoseong/korea100/web
node scripts/pilot-comparative-law.mjs
```

산출물:

- `docs/comparative-law-pilot/latest.json`
- `docs/comparative-law-pilot/latest.md`

해석 원칙:

이 결과는 검토 대상을 좁히기 위한 후보 목록일 뿐, 제도 간 동등성이나 실제 절차를 입증하지 않는다. 공개 구조도나 게시글에 반영하기 전에는 반드시 원문 링크를 열어 비교 가능성과 최신성을 별도로 확인한다.
