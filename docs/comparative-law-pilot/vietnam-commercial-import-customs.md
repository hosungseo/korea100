# 베트남 상업 수입통관 업무구조도 파일럿

이 파일럿은 베트남과의 일반 무역에서 가장 자주 마주치는 `상업 수입화물 VNACCS 통관 절차`를 Korea100 비교법 구조도 형식으로 옮긴 초안이다.

## 산출물

- `vietnam-commercial-import-customs.process.json`: ProcessModel 형태의 원본 데이터
- `vietnam-commercial-import-customs.svg`: SVG 구조도
- `vietnam-commercial-import-customs.png`: PNG 구조도

## 왜 이 제도를 골랐나

베트남과 거래할 때 실무상 가장 반복되는 문제는 “물건이 베트남 세관에서 어떤 경로로 통관되느냐”다. 수입통관은 판매계약, 운송, 원산지, 전문검사, 관세·부가세, 반출이 한 번에 연결되므로 무역·세관 법령을 보는 첫 샘플로 적합하다.

특히 공식 Vietnam Trade Information Portal에는 `Thủ tục hải quan đối với hàng hoá nhập khẩu thương mại (Hệ thống VNACCS)` 절차가 공개되어 있고, IDA/IDB/IDC 신고, Green/Yellow/Red 분류, 필요서류, 처리시간, 수수료, 통관 단계가 비교적 선명하다.

## 기준 자료

- Vietnam Trade Information Portal, 상업 수입화물 VNACCS 통관 절차: <https://www.vietnamtradeportal.gov.vn/index.php?id=3&r=searchProcedure%2Fview1>
- Vietnam Trade Information Portal, Customs Law 54/2014/QH13: <https://www.vietnamtradeportal.gov.vn/index.php?id=40&r=site%2Fdisplay>
- Vietnam Trade Information Portal, Decree 08/2015/ND-CP: <https://www.vietnamtradeportal.gov.vn/index.php?id=68&r=site%2Fdisplay>
- Vietnam Trade Information Portal, Circular 38/2015/TT-BTC: <https://www.vietnamtradeportal.gov.vn/index.php?id=74&r=site%2Fdisplay>

## 핵심 흐름

1. HS 코드, 수입요건, 전문검사·허가 필요 여부를 확인한다.
2. 송장, 운송서류, 포장명세서, 원산지증명, 허가·검사 자료를 준비한다.
3. VNACCS에서 `IDA`로 사전신고하고, 필요한 경우 `IDB`로 수정한다.
4. `IDC`로 공식 수입신고를 전송하고 세관 시스템이 신고를 등록한다.
5. 시스템이 위험관리 기준에 따라 Green, Yellow, Red 경로를 분류한다.
6. Green은 세금·수수료 납부 후 통관으로 간다.
7. Yellow는 서류검사, Red는 서류검사와 실물검사를 거친다.
8. 전문검사 대상이면 결과 또는 면제 통지가 통관 판단에 반영된다.
9. 세금·수수료를 납부하거나 보증을 제공하면 세관이 통관을 결정한다.
10. 통관 후 화물을 반출하고, 통관서류는 5년 보관하며 사후검사·정정에 대비한다.

## 읽을 때 주의할 점

- 이 구조도는 일반 상업 수입화물의 VNACCS 통관 흐름이다.
- 식품, 화장품, 의료기기, 전기전자, 화학물질, 중고기계, 농수산물 등 품목별 전문검사는 별도 제도로 따로 봐야 한다.
- 실제 거래 전에는 베트남 통관사, 수입자, 세관 또는 전문검사기관의 최신 안내로 확인해야 한다.
