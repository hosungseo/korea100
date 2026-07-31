#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const MANIFEST_PATH = path.join(REPO_DIR, "docs", "institutions-100-manifest.json");
const AS_OF = "2026-08-01";
const OVERWRITE = process.argv.includes("--overwrite");

function statute(law, lawId, mst, date, urlName = law.replaceAll(" ", "")) {
  return {
    law,
    kind: "법률",
    sourceType: "statute",
    officialName: law,
    lawId,
    mst,
    promulgatedOn: date,
    effectiveOn: date,
    officialUrl: `https://law.go.kr/법령/${urlName}`,
  };
}

const S = {
  tradeRemedy: statute(
    "불공정무역행위 조사 및 산업피해구제에 관한 법률",
    "009189",
    "283925",
    "2026-03-10",
    "불공정무역행위조사및산업피해구제에관한법률",
  ),
  industrialStandard: statute("산업표준화법", "001460", "283931", "2026-03-10"),
  productSafety: statute("제품안전기본법", "011150", "280055", "2025-12-02"),
  electricalProductSafety: statute(
    "전기용품 및 생활용품 안전관리법",
    "001459",
    "276591",
    "2025-10-01",
    "전기용품및생활용품안전관리법",
  ),
  industrialConvergence: statute("산업융합 촉진법", "011372", "280047", "2025-12-02"),
};

const specs = [
  {
    priority: 512,
    slug: "trade-remedy-investigation",
    name: "무역구제 조사·판정(반덤핑·상계관세·세이프가드)",
    oneLiner: "덤핑·보조금·수입급증으로 국내산업 피해가 우려될 때 신청부터 조사·판정·구제조치 건의까지 이어지는 무역위원회 절차",
    type: "무역구제 조사·판정형",
    category: "인허가·규제·산업",
    whyFirst: "산업통상부의 통상 방어 기능을 국내산업 신청인, 무역위원회, 조사대상 기업, 관계 부처 사이의 실제 인계로 보여주는 핵심 절차다.",
    sourceKeys: ["tradeRemedy"],
    legalArticles: {
      tradeRemedy: "제15조~제17조(산업피해조사 신청·개시·판정·세이프가드 건의), 제27조~제29조(무역위원회)",
    },
    purpose: "수입으로 인한 국내산업 피해 또는 불공정무역행위가 제기되었을 때 사실관계와 산업피해를 조사하고, 법정 요건에 따라 관세·수입제한 등 구제조치의 근거를 만든다.",
    stakeholders: "국내 생산자·산업단체, 수출자·수입자, 산업통상부 무역위원회, 관계 중앙행정기관, 소비자·수요산업",
    authorities: [
      { name: "국내산업·신청인", role: "산업피해 자료를 제출하고 조사·구제조치를 신청" },
      { name: "산업통상부 무역위원회", role: "조사 개시, 조사·판정과 구제조치 건의를 담당" },
      { name: "조사대상 수출자·수입자", role: "질의응답·자료제출·의견진술로 조사에 참여" },
      { name: "관계 중앙행정기관", role: "무역위원회 건의에 따른 후속 조치를 검토·시행" },
    ],
    procedure: [
      "국내산업이 수입·덤핑·보조금·수입급증과 피해 자료를 정리한다",
      "산업피해조사 또는 무역구제 조사를 신청한다",
      "무역위원회가 요건과 조사 개시 여부를 검토한다",
      "신청인·수출자·수입자에게 자료를 요구하고 산업피해를 조사한다",
      "무역위원회가 산업피해와 인과관계를 심의·판정한다",
      "필요한 구제조치와 기간을 정해 관계 중앙행정기관에 건의한다",
      "후속 조치와 조사자료를 관리하고 유형별 재심·재검토를 확인한다",
    ],
    moneyFlow: "조사 자체의 비용·자료 제출 부담과 함께 관세·수입제한 등 후속 조치의 경제적 효과가 발생한다. 구제조치의 종류·기간·집행기관은 조사 유형별로 달라진다.",
    docsFlow: "조사신청서·피해자료 → 조사개시 통지 → 질의서·답변·현장검증 자료 → 예비·최종 조사결과 → 무역위원회 판정·건의 → 후속 조치·재심 자료",
    bottlenecks: ["산업피해와 수입·덤핑·보조금 사이 인과관계 입증", "수출자·수입자 자료 확보와 영업비밀 보호", "조사 유형별 개시·판정·후속조치 기간 차이", "무역위원회 건의와 관계 부처 집행 사이의 핸드오프"],
    reformPoints: ["신청 단계의 피해자료 체크리스트 표준화", "조사 진행·보완요청·기한을 신청인에게 상태형으로 공개", "구제조치 건의와 집행 결과를 하나의 사건 식별자로 연결"],
    related: ["전략물자 수출허가", "국가핵심기술 수출·해외인수 승인", "외국인투자 신고·등록", "수출입 통관·관세"],
    field: ["반덤핑·상계관세·세이프가드별 신청요건과 처리기간", "무역위원회 조사와 관계 중앙행정기관 후속 조치의 역할 분담", "비공개 자료·영업비밀 제출 및 열람 절차", "재심·불복·사후조치의 현행 서식과 창구"],
    warnings: ["반덤핑·상계관세·세이프가드·불공정무역행위는 조사 유형별로 요건·기간·후속 조치가 다르므로 이 구조도는 공통 골격으로 읽어야 한다."],
    lanes: ["국내산업·신청인", "산업통상부 무역위원회", "조사대상 수출자·수입자", "관계 중앙행정기관"],
    stages: ["G0 피해징후·신청", "G1 조사개시", "G2 조사·검증", "G3 판정", "G4 구제조치", "G5 재심·환류"],
    nodes: [
      node("국내산업 피해·수입동향 정리", "국내산업·신청인", "G0 피해징후·신청", "피해 규모와 수입·덤핑·보조금 또는 수입급증 자료를 정리한다.", "tradeRemedy", ["제15조"], { status: "done", output_documents: ["산업피해 자료", "신청 준비자료"] }),
      node("산업피해조사·구제조치 신청", "국내산업·신청인", "G0 피해징후·신청", "법정 신청서와 증빙을 무역위원회에 제출한다.", "tradeRemedy", ["제15조"], { status: "done", output_documents: ["조사신청서", "피해 증빙"] }),
      node("조사 개시 여부 결정", "산업통상부 무역위원회", "G1 조사개시", "신청의 형식·법정 요건과 조사 필요성을 검토해 조사 개시 여부를 결정한다.", "tradeRemedy", ["제16조"], { status: "current", type: "gateway", output_documents: ["조사개시 또는 기각 통지"] }),
      node("조사자료 제출·의견진술", "조사대상 수출자·수입자", "G2 조사·검증", "질의서에 답변하고 수출가격·원가·거래·피해 관련 자료와 의견을 제출한다.", "tradeRemedy", ["제16조"], { output_documents: ["질의답변서", "의견서", "검증자료"] }),
      node("산업피해·인과관계 조사", "산업통상부 무역위원회", "G2 조사·검증", "제출자료와 현장·시장 자료를 검증해 국내산업 피해와 인과관계를 조사한다.", "tradeRemedy", ["제16조"], { output_documents: ["조사결과 초안", "검증기록"] }),
      node("산업피해·불공정무역행위 판정", "산업통상부 무역위원회", "G3 판정", "조사결과를 심의해 법정 요건 충족 여부와 산업피해를 판정한다.", "tradeRemedy", ["제16조"], { type: "gateway", output_documents: ["무역위원회 판정"] }),
      node("구제조치 건의", "산업통상부 무역위원회", "G4 구제조치", "판정에 따라 관세·수입제한 등 필요한 구제조치와 기간을 관계 기관에 건의한다.", "tradeRemedy", ["제17조"], { output_documents: ["구제조치 건의서"] }),
      node("후속 조치·공고·사후관리", "관계 중앙행정기관", "G4 구제조치", "건의에 따른 후속 조치를 검토·시행하고 조치 결과와 사후자료를 관리한다.", "tradeRemedy", ["제17조"], { output_documents: ["후속 조치", "사후관리 기록"] }),
      node("재심·재검토 자료 제출", "국내산업·신청인", "G5 재심·환류", "조치 이후 시장 변화와 산업피해 자료를 제출해 유형별 재심·재검토 여부를 확인한다.", "tradeRemedy", [], { output_documents: ["재심·재검토 자료"] }),
    ],
    edges: [["P01", "P02"], ["P02", "P03"], ["P03", "P04", "sequence", "개시"], ["P04", "P05"], ["P05", "P06"], ["P06", "P07", "sequence", "판정"], ["P07", "P08"], ["P08", "P09"], ["P03", "P02", "loop", "보완·재신청"], ["P06", "P04", "message", "자료·의견 제출"]],
  },
  {
    priority: 513,
    slug: "ks-certification",
    name: "한국산업표준(KS) 제정·표시인증",
    oneLiner: "산업표준안을 만들고 심의·고시한 뒤 기업의 공장·제품 심사와 사후관리를 거쳐 KS 표시 사용을 허용하는 표준·인증 경로",
    type: "표준 제정·제품인증형",
    category: "인허가·규제·산업",
    whyFirst: "산업통상부·국가기술표준원의 표준 정책과 기업 인증 경험을 하나의 흐름으로 연결해 ‘표준’과 ‘인증’을 구분해 보여준다.",
    sourceKeys: ["industrialStandard"],
    legalArticles: { industrialStandard: "제5조(산업표준의 제정·개정·폐지), 제12조·제15조~제17조(인증·인증심사·사후관리)" },
    purpose: "제품·서비스의 품질과 호환성을 위한 한국산업표준을 제정·고시하고, 지정 품목과 기업이 인증 요건을 충족하는지 심사해 KS 표시 사용과 사후관리로 연결한다.",
    stakeholders: "제조기업·서비스사업자, 소비자·수요기관, 산업통상부·국가기술표준원, 산업표준심의회, KS 인증기관",
    authorities: [
      { name: "산업통상부·국가기술표준원", role: "표준정책, 국가표준 제정·고시와 인증제도 총괄" },
      { name: "산업표준심의회·기술심의회", role: "표준안과 인증 관련 기술사항을 심의" },
      { name: "KS 인증기관", role: "공장심사·제품심사와 인증서 발급 업무를 수행" },
      { name: "기업", role: "표준 적용, 인증 신청, 표시 사용과 사후관리 의무를 이행" },
    ],
    procedure: ["산업·소비자 수요를 표준 제정 또는 개정 과제로 발굴", "표준안을 작성하고 이해관계인 의견을 수렴", "산업표준심의회 심의 후 국가표준을 고시", "KS 인증 대상 품목과 심사기준을 확인", "기업이 인증기관에 신청하고 공장·제품 심사를 받음", "인증서 발급 후 KS 표시를 사용하고 정기·사후심사를 받음"],
    moneyFlow: "표준 제정은 공공 정책 절차이며 인증 신청·시험·심사 비용은 기업이 부담할 수 있다. 인증 대상·심사비용·유효기간은 품목별 고시와 인증기관 운영기준에 따라 달라진다.",
    docsFlow: "표준 제안·초안 → 의견수렴·심의자료 → KS 고시 → 인증신청서·공장·제품 자료 → 심사보고서·인증서 → 표시·사후심사 기록",
    bottlenecks: ["표준안에 대한 산업·소비자 이해관계 조정", "품목별 공장심사·제품시험 기준 차이", "인증기관 심사와 기업의 개선조치 사이의 시간차", "표시 오용과 사후관리 결과의 공개 범위"],
    reformPoints: ["표준 제정부터 인증까지 동일한 품목 식별자 부여", "인증 신청 전 자가진단 체크리스트 제공", "사후심사·시정조치·인증 정지 이력을 소비자 관점으로 공개"],
    related: ["KC 제품안전 인증·신고", "제품안전 안전성조사·리콜명령·이행점검", "산업융합 신제품 적합성 인증", "국가첨단전략산업 특화단지 지정·지원"],
    field: ["KS 인증 대상 품목·심사기준의 최신 고시", "지정 인증기관과 공장·제품심사 처리기간", "표시 사용 범위·정기심사·인증 취소 기준", "표준 제정·개정 의견수렴의 실제 창구"],
    warnings: ["KS 표준 제정·고시와 기업의 KS 표시인증은 서로 다른 게이트다. 모든 KS가 곧바로 의무인증을 뜻하지 않는다."],
    lanes: ["기업·이해관계인", "산업통상부·국가기술표준원", "산업표준심의회·기술심의회", "KS 인증기관"],
    stages: ["G0 표준 수요", "G1 표준안·심의", "G2 고시·인증대상", "G3 신청·심사", "G4 인증·표시", "G5 사후관리"],
    nodes: [
      node("표준 제정·개정 수요 발굴", "기업·이해관계인", "G0 표준 수요", "산업·소비자 수요와 기술 변화를 바탕으로 표준화 과제를 제안한다.", "industrialStandard", ["제5조"], { status: "done", output_documents: ["표준화 제안"] }),
      node("표준안 작성·의견수렴", "산업통상부·국가기술표준원", "G1 표준안·심의", "표준안을 작성하고 관계 기관·업계·소비자의 의견을 수렴한다.", "industrialStandard", ["제5조"], { status: "done", output_documents: ["표준안", "의견수렴 결과"] }),
      node("산업표준심의회 심의", "산업표준심의회·기술심의회", "G1 표준안·심의", "표준안의 기술성·공익성·국제정합성을 심의한다.", "industrialStandard", ["제5조"], { status: "current", type: "gateway", output_documents: ["심의 결과"] }),
      node("KS 제정·개정·폐지 고시", "산업통상부·국가기술표준원", "G2 고시·인증대상", "심의 결과에 따라 한국산업표준을 고시하고 적용 범위를 알린다.", "industrialStandard", ["제5조"], { output_documents: ["KS 고시"] }),
      node("인증 대상·심사기준 확인", "기업·이해관계인", "G2 고시·인증대상", "해당 제품·서비스가 KS 인증 대상인지와 최신 심사기준을 확인한다.", "industrialStandard", ["제15조"], { output_documents: ["인증 대상 확인표"] }),
      node("KS 표시인증 신청", "기업·이해관계인", "G3 신청·심사", "신청서와 공장·제품·품질관리 자료를 인증기관에 제출한다.", "industrialStandard", ["제15조"], { output_documents: ["KS 인증신청서", "품질관리 자료"] }),
      node("공장심사·제품심사", "KS 인증기관", "G3 신청·심사", "품질관리체계와 제품이 KS 기준에 맞는지 심사·시험한다.", "industrialStandard", ["제17조"], { output_documents: ["공장심사보고서", "제품시험성적서"] }),
      node("인증서 발급·KS 표시 사용", "KS 인증기관", "G4 인증·표시", "심사 결과가 기준에 맞으면 인증서를 발급하고 기업이 KS 표시를 사용할 수 있게 한다.", "industrialStandard", ["제15조·제17조"], { type: "notice", output_documents: ["KS 인증서", "표시 사용 기록"] }),
      node("정기·사후심사와 시정조치", "KS 인증기관", "G5 사후관리", "인증제품·품질관리의 지속 적합성을 확인하고 부적합이면 시정·정지·취소를 처리한다.", "industrialStandard", ["제17조"], { output_documents: ["사후심사 기록", "시정조치 또는 처분"] }),
    ],
    edges: [["P01", "P02"], ["P02", "P03"], ["P03", "P04"], ["P04", "P05"], ["P05", "P06"], ["P06", "P07"], ["P07", "P08"], ["P08", "P09"], ["P09", "P07", "loop", "부적합 시 재심사·시정"], ["P03", "P02", "loop", "표준안 보완"]],
  },
  {
    priority: 514,
    slug: "product-safety-kc-certification",
    name: "KC 제품안전 인증·신고",
    oneLiner: "전기용품·생활용품의 제품군을 먼저 분류하고 안전성 확인 방식에 따라 인증·신고·공급자적합성 확인과 KC 표시로 이어지는 시장진입 경로",
    type: "제품안전 인증·신고형",
    category: "인허가·규제·산업",
    whyFirst: "국민이 가장 자주 접하는 산업통상부 소관 규제 중 하나로, ‘KC 인증’이라는 한 단어 안에 제품군별로 다른 세 경로가 있다는 점을 구조화할 수 있다.",
    sourceKeys: ["electricalProductSafety"],
    legalArticles: { electricalProductSafety: "제5조(안전인증), 제15조(안전확인 신고), 제23조(공급자적합성확인), 제9조(표시)" },
    purpose: "전기용품·생활용품을 위해도와 제품군에 따라 안전인증, 안전확인 신고 또는 공급자적합성확인 경로로 분류하고 시장 유통 전 안전요건과 KC 표시를 확인한다.",
    stakeholders: "제조업자·수입업자·판매자, 시험·인증기관, 산업통상부·국가기술표준원, 소비자·온라인 유통망",
    authorities: [
      { name: "제조업자·수입업자", role: "제품 분류·시험·인증·신고·표시와 안전의무를 이행" },
      { name: "시험·인증기관", role: "제품시험·공장심사와 인증·확인 업무를 수행" },
      { name: "산업통상부·국가기술표준원", role: "안전기준·대상 품목과 제도를 고시·관리" },
      { name: "판매자·유통망", role: "적법한 제품의 유통과 표시·정보 제공을 관리" },
    ],
    procedure: ["제품의 품목·용도·전기적 특성과 적용 법률을 분류", "안전인증·안전확인 신고·공급자적합성확인 중 경로를 결정", "시험·공장심사와 기술문서 준비", "인증서를 발급받거나 신고·확인 절차를 완료", "KC 표시와 제품·사업자 정보를 표시·관리", "변경·갱신·시장 유통 중 안전의무와 리콜 연계를 관리"],
    moneyFlow: "시험·인증·신고에 필요한 수수료와 시험비는 신청 사업자가 부담한다. 부적합·판매중지·리콜이 발생하면 재시험·회수·교환 비용도 사업자에게 귀속될 수 있다.",
    docsFlow: "제품분류·안전기준 → 시험신청·기술문서 → 공장심사·시험성적서 → 인증서 또는 신고확인 → KC 표시·제품정보 → 변경·시장관리 기록",
    bottlenecks: ["제품군별 인증·신고·공급자확인 경로 오분류", "해외 제조공장·수입제품의 기술문서와 시험성적서 검증", "모델·부품·구조 변경 시 재시험·변경신고 판단", "KC 표시와 온라인 판매정보의 불일치"],
    reformPoints: ["제품분류 단계의 단일 사전진단 창구", "인증·신고 상태와 유효 제품모델을 소비자에게 공개", "변경관리와 리콜·안전성조사 사건을 제품 식별자로 연결"],
    related: ["한국산업표준(KS) 제정·표시인증", "제품안전 안전성조사·리콜명령·이행점검", "산업융합 신제품 적합성 인증", "규제샌드박스 실증특례"],
    field: ["최신 안전관리 대상 품목·안전기준·제품 분류", "인증·신고·공급자적합성확인의 실제 처리기간과 수수료", "KC 표시·온라인 정보 제공 방식", "제품 변경·갱신·시장감시와 리콜 연계 기준"],
    warnings: ["‘KC 인증’은 모든 제품에 동일한 절차를 뜻하지 않는다. 제품군별로 안전인증·안전확인 신고·공급자적합성확인 중 적용 경로가 달라진다."],
    lanes: ["제조업자·수입업자", "시험·인증기관", "산업통상부·국가기술표준원", "판매자·유통망"],
    stages: ["G0 제품 분류", "G1 경로 선택", "G2 시험·심사", "G3 인증·신고", "G4 KC 표시·유통", "G5 변경·시장관리"],
    nodes: [
      node("제품군·적용 안전기준 분류", "제조업자·수입업자", "G0 제품 분류", "제품의 용도·구조·전기적 특성과 최신 대상 품목을 대조한다.", "electricalProductSafety", [], { status: "done", output_documents: ["제품분류표", "적용 안전기준"] }),
      node("인증·신고 경로 선택", "제조업자·수입업자", "G1 경로 선택", "안전인증, 안전확인 신고, 공급자적합성확인 중 적용 경로를 결정한다.", "electricalProductSafety", ["제5조·제15조·제23조"], { status: "done", type: "gateway", output_documents: ["규제경로 결정"] }),
      node("시험·공장심사 신청", "제조업자·수입업자", "G2 시험·심사", "제품시험·공장심사에 필요한 신청서와 기술문서를 시험·인증기관에 제출한다.", "electricalProductSafety", ["제5조"], { status: "current", output_documents: ["시험신청서", "기술문서"] }),
      node("제품시험·공장심사", "시험·인증기관", "G2 시험·심사", "안전기준 적합성, 제조공정과 품질관리 상태를 시험·심사한다.", "electricalProductSafety", ["제5조·제15조"], { output_documents: ["시험성적서", "공장심사보고서"] }),
      node("인증서 발급 또는 신고확인", "시험·인증기관", "G3 인증·신고", "시험·심사 결과에 따라 인증서를 발급하거나 안전확인·공급자적합성확인 절차를 완료한다.", "electricalProductSafety", ["제5조·제15조·제23조"], { type: "notice", output_documents: ["안전인증서 또는 신고확인", "적합성 확인자료"] }),
      node("KC 표시·제품정보 관리", "제조업자·수입업자", "G4 KC 표시·유통", "적합 제품에 KC 표시와 요구되는 제품·사업자 정보를 표시한 뒤 유통한다.", "electricalProductSafety", ["제9조"], { output_documents: ["KC 표시", "제품정보"] }),
      node("판매·유통 단계 안전의무", "판매자·유통망", "G4 KC 표시·유통", "인증·신고 대상 모델과 표시가 일치하는지 확인하고 소비자에게 정보를 제공한다.", "electricalProductSafety", ["제9조"], { output_documents: ["유통·판매 기록"] }),
      node("변경·갱신·시장감시 대응", "산업통상부·국가기술표준원", "G5 변경·시장관리", "제품 변경·부적합·시장감시 결과에 따라 재시험·개선·판매중지 또는 리콜 절차와 연계한다.", "electricalProductSafety", ["제5조·제15조·제23조"], { output_documents: ["변경·개선 기록", "시장감시 조치"] }),
    ],
    edges: [["P01", "P02"], ["P02", "P03", "sequence", "경로 결정"], ["P03", "P04"], ["P04", "P05"], ["P05", "P06"], ["P06", "P07"], ["P07", "P08"], ["P04", "P03", "loop", "부적합·보완"], ["P08", "P03", "loop", "변경·재시험"]],
  },
  {
    priority: 515,
    slug: "product-safety-recall",
    name: "제품안전 안전성조사·리콜명령·이행점검",
    oneLiner: "사고·위해 신고와 시장감시에서 출발해 안전성조사, 리콜 권고·명령, 공개·회수·이행점검으로 이어지는 제품안전 집행 경로",
    type: "시장감시·리콜 집행형",
    category: "인허가·규제·산업",
    whyFirst: "인증을 받은 뒤에도 작동하는 시장감시·리콜이라는 사후 책임 경로를 별도 맵으로 분리해 제품안전 제도의 실제 집행을 보여준다.",
    sourceKeys: ["productSafety"],
    legalArticles: { productSafety: "제9조(안전성조사), 제10조·제11조(권고·명령), 제13조(사업자의 자발적 리콜)" },
    purpose: "제품 사고·위해정보·시장감시 결과를 조사하고 위해성이 확인되면 사업자의 자발적 리콜 또는 행정기관의 리콜 권고·명령과 이행점검으로 소비자 피해를 줄인다.",
    stakeholders: "소비자·신고자, 제조업자·수입업자·판매자, 산업통상부·국가기술표준원, 시험·사고조사기관, 온라인·오프라인 유통망",
    authorities: [
      { name: "소비자·신고자·관계기관", role: "사고·위해정보를 신고하고 조사 단서를 제공" },
      { name: "산업통상부·국가기술표준원", role: "안전성조사, 위해성 판단, 권고·명령과 이행점검을 담당" },
      { name: "시험·사고조사기관", role: "제품시험·사고원인·위해성 분석을 지원" },
      { name: "사업자·유통망", role: "판매중지·회수·교환·환불과 결과보고를 이행" },
    ],
    procedure: ["사고·위해 신고, 시장감시 또는 관계기관 정보를 접수", "안전성조사 필요성과 조사 범위를 정함", "제품시험·사고원인·유통현황을 조사", "위해성·시급성·대상제품을 판단", "자발적 리콜 권고 또는 리콜·판매중지 명령", "사업자가 회수·교환·환불하고 리콜 사실을 공개", "진행·결과보고와 현장 재점검으로 종결 여부를 확인"],
    moneyFlow: "안전성조사·시험 비용과 회수·교환·환불 비용은 사건 유형과 조치에 따라 달라진다. 리콜 이행 비용은 원칙적으로 사업자 부담이며 공공시험·감독 비용과 구분해 확인해야 한다.",
    docsFlow: "사고·위해 신고 → 조사계획·시험의뢰 → 시험·유통자료·위해성평가 → 권고·명령서 → 리콜계획·공개 → 진행·결과보고 → 이행점검·종결 기록",
    bottlenecks: ["분산된 사고·위해정보를 하나의 제품·모델로 식별", "위해성 판단과 조사·명령의 시간차", "온라인·오프라인 유통망의 판매중지·회수 범위 확인", "자발적 리콜과 행정명령의 이행률 검증"],
    reformPoints: ["제품 식별자·사고 신고·리콜 이력의 연결", "리콜 대상·회수율·미이행 사업자 상태 공개", "인증·시장감시·리콜 데이터를 같은 제품 모델로 연계"],
    related: ["KC 제품안전 인증·신고", "한국산업표준(KS) 제정·표시인증", "규제샌드박스", "소비자분쟁조정"],
    field: ["제품안전기본법과 전기용품·생활용품·어린이제품 개별법의 적용 경계", "안전성조사·위해성평가·권고·명령의 처리기간", "리콜 공개·결과보고 서식과 온라인 유통 차단 방식", "회수율·이행점검·행정처분의 실제 지표"],
    warnings: ["제품군에 따라 제품안전기본법 외에 전기용품·생활용품·어린이제품 등 개별 안전법이 함께 적용될 수 있다."],
    lanes: ["소비자·신고자·관계기관", "산업통상부·국가기술표준원", "시험·사고조사기관", "사업자·유통망"],
    stages: ["G0 위해정보 접수", "G1 조사 결정", "G2 안전성조사", "G3 위해성 판단", "G4 리콜·공개", "G5 이행점검·종결"],
    nodes: [
      node("사고·위해정보 신고·접수", "소비자·신고자·관계기관", "G0 위해정보 접수", "사고·위해 신고, 시장감시 또는 관계기관 정보를 접수해 제품·모델을 식별한다.", "productSafety", ["제9조"], { status: "done", output_documents: ["위해정보 신고", "제품 식별자료"] }),
      node("안전성조사 필요성·범위 결정", "산업통상부·국가기술표준원", "G1 조사 결정", "위해정보의 신뢰성·시급성과 조사 필요성을 검토해 조사 범위를 정한다.", "productSafety", ["제9조"], { status: "done", type: "gateway", output_documents: ["조사계획", "조사대상 결정"] }),
      node("제품시험·사고원인·유통조사", "시험·사고조사기관", "G2 안전성조사", "제품을 시험하고 사고원인·기술문서·유통현황을 조사한다.", "productSafety", ["제9조"], { status: "current", output_documents: ["시험성적서", "조사보고서"] }),
      node("위해성·조치수준 판단", "산업통상부·국가기술표준원", "G3 위해성 판단", "위해성, 대상제품, 피해 가능성과 긴급성을 종합해 권고·명령 필요성을 판단한다.", "productSafety", ["제9조·제10조·제11조"], { type: "gateway", output_documents: ["위해성 판단", "조치안"] }),
      node("리콜 권고 또는 리콜·판매중지 명령", "산업통상부·국가기술표준원", "G4 리콜·공개", "사업자에게 자발적 리콜을 권고하거나 법정 요건에 따라 리콜·판매중지 조치를 명한다.", "productSafety", ["제10조·제11조"], { output_documents: ["리콜 권고서 또는 명령서"] }),
      node("회수·교환·환불 계획 수립", "사업자·유통망", "G4 리콜·공개", "유통망 판매를 중지하고 회수·교환·환불 계획과 소비자 안내를 마련한다.", "productSafety", ["제13조"], { output_documents: ["리콜계획", "소비자 안내문"] }),
      node("리콜 사실 공개·유통망 전파", "사업자·유통망", "G4 리콜·공개", "리콜 대상과 방법을 공개하고 제조·수입·판매 단계에 조치 내용을 전파한다.", "productSafety", ["제13조"], { output_documents: ["리콜 공표", "판매중지·회수 통지"] }),
      node("진행·결과보고 및 이행점검", "산업통상부·국가기술표준원", "G5 이행점검·종결", "회수율과 조치 결과를 보고받고 현장·유통망 점검을 통해 이행 여부를 확인한다.", "productSafety", ["제10조·제11조·제13조"], { output_documents: ["진행·결과보고", "이행점검 기록"] }),
      node("종결·추가조치·재발방지", "산업통상부·국가기술표준원", "G5 이행점검·종결", "조치가 충분하면 사건을 종결하고, 미이행·추가 위해가 있으면 추가 명령·공개·재조사로 회귀한다.", "productSafety", ["제10조·제11조"], { type: "gateway", output_documents: ["종결 또는 추가조치 기록"] }),
    ],
    edges: [["P01", "P02"], ["P02", "P03"], ["P03", "P04"], ["P04", "P05"], ["P05", "P06"], ["P06", "P07"], ["P07", "P08"], ["P08", "P09"], ["P09", "P03", "loop", "추가 조사"], ["P05", "P07", "message", "공개·유통망 전파"]],
  },
  {
    priority: 516,
    slug: "industrial-convergence-conformity-certification",
    name: "산업융합 신제품 적합성 인증",
    oneLiner: "기존 기준이 없는 융합 신제품을 신청해 적합성 기준을 만들고 시험·협의체 심의를 거쳐 기존 인증과 동등한 효력을 확보하는 절차",
    type: "신제품 적합성 인증형",
    category: "인허가·규제·산업",
    whyFirst: "산업통상부의 산업융합·규제개선 기능을 기존 인증이 없는 신제품의 기준 생성, 시험, 인증, 시장진입이라는 상태 변화로 보여준다.",
    sourceKeys: ["industrialConvergence"],
    legalArticles: { industrialConvergence: "제11조~제16조(적합성 인증 신청·기준·시험·인증)" },
    purpose: "둘 이상의 산업 기술이 융합된 신제품이 기존 법령·기준의 공백으로 시장에 나오기 어려울 때 적합성 인증의 필요성을 검토하고, 임시 기준·시험·협의체 심의를 거쳐 인증한다.",
    stakeholders: "융합 신제품 제조자·사업자, 국가산업융합지원센터, 소관 중앙행정기관, 산업통상부, 적합성인증협의체·시험기관",
    authorities: [
      { name: "제조자·사업자", role: "신제품의 기능·안전자료를 제출하고 인증·시장관리 의무를 이행" },
      { name: "국가산업융합지원센터", role: "신청 접수·검토와 관계 기관 협의를 지원" },
      { name: "소관 중앙행정기관·산업통상부", role: "적합성 기준과 인증 여부를 관계 법령에 따라 처리" },
      { name: "적합성인증협의체·시험기관", role: "기준·시험방법을 검토하고 적합성 심의를 지원" },
    ],
    procedure: ["신제품의 융합성·기존 인증 공백과 관계 법령을 진단", "적합성 인증 신청서와 기술·안전자료를 제출", "소관 기관과 관계 법령·기준 적용 가능성을 협의", "적합성 기준·시험방법을 마련하고 협의체가 검토", "시험·검사를 거쳐 신제품 적합성을 확인", "적합성 인증과 기존 인증의 법적 효과를 확인", "시장 출시 후 변경·안전관리와 후속 지원을 연계"],
    moneyFlow: "신청·시험·검사에 필요한 비용과 기준 개발 비용의 부담 주체는 제품·사업과 지원사업에 따라 달라진다. 인증 이후의 시장진입 비용·지원금·기존 인증 면제 효과는 별도 제도와 함께 확인한다.",
    docsFlow: "신제품 설명·규제공백 진단 → 인증신청서·기술·안전자료 → 관계기관 협의 → 적합성 기준·시험방법 → 시험·검사 결과 → 적합성 인증서·시장관리 기록",
    bottlenecks: ["어느 소관 법령과 기존 인증을 먼저 적용할지 판단", "신제품의 안전·성능을 검증할 기준과 시험방법 부재", "여러 부처·시험기관·협의체 사이의 조정", "인증 후 제품 변경과 일반 시장감시의 연결"],
    reformPoints: ["신청 전 규제공백·소관기관 진단을 단일 창구화", "기준 생성·시험·인증의 상태와 책임기관 공개", "적합성 인증 제품의 후속 안전관리와 기존 인증 전환 경로 연결"],
    related: ["규제샌드박스", "규제샌드박스 실증특례", "KC 제품안전 인증·신고", "한국산업표준(KS) 제정·표시인증", "국가첨단전략산업 특화단지 지정·지원"],
    field: ["산업융합 신제품의 신청자격·대상과 기존 인증 우선 적용 기준", "적합성 기준 작성·협의체·시험기관의 실제 처리기간", "인증의 기존 인증 의제·법적 효력과 유효기간", "인증 후 변경·안전관리·시장감시 창구"],
    warnings: ["산업융합 적합성 인증은 모든 규제를 일괄 면제하는 제도가 아니다. 제품별 소관 법령과 안전기준을 확인해야 한다."],
    lanes: ["제조자·사업자", "국가산업융합지원센터", "소관 중앙행정기관·산업통상부", "적합성인증협의체·시험기관"],
    stages: ["G0 규제공백 진단", "G1 신청·협의", "G2 기준 마련", "G3 시험·검사", "G4 적합성 인증", "G5 시장관리"],
    nodes: [
      node("융합 신제품·규제공백 진단", "제조자·사업자", "G0 규제공백 진단", "신제품의 융합기술, 기존 인증 가능 여부와 시장진입 장애를 정리한다.", "industrialConvergence", ["제11조"], { status: "done", output_documents: ["신제품 설명서", "규제공백 진단"] }),
      node("적합성 인증 신청", "제조자·사업자", "G1 신청·협의", "기술·안전자료와 함께 적합성 인증을 국가산업융합지원센터에 신청한다.", "industrialConvergence", ["제11조"], { status: "done", output_documents: ["적합성 인증신청서", "기술·안전자료"] }),
      node("소관기관·기존 기준 적용 협의", "국가산업융합지원센터", "G1 신청·협의", "소관 중앙행정기관과 기존 법령·인증 적용 가능성과 신규 기준 필요성을 협의한다.", "industrialConvergence", ["제12조"], { status: "current", type: "gateway", output_documents: ["소관기관 협의결과", "기준 마련 요청"] }),
      node("적합성 기준·시험방법 마련", "소관 중앙행정기관·산업통상부", "G2 기준 마련", "신제품의 안전·성능을 판단할 임시 또는 제품별 적합성 기준과 시험방법을 마련한다.", "industrialConvergence", ["제13조·제14조"], { output_documents: ["적합성 기준", "시험방법"] }),
      node("적합성인증협의체 검토", "적합성인증협의체·시험기관", "G2 기준 마련", "관계 기관·전문가가 기준의 타당성과 시험 가능성을 검토한다.", "industrialConvergence", ["제14조"], { type: "gateway", output_documents: ["협의체 검토의견"] }),
      node("제품 시험·검사", "적합성인증협의체·시험기관", "G3 시험·검사", "마련된 기준과 시험방법에 따라 제품 시험·검사를 실시한다.", "industrialConvergence", ["제15조"], { output_documents: ["시험·검사성적서"] }),
      node("산업융합 신제품 적합성 인증", "소관 중앙행정기관·산업통상부", "G4 적합성 인증", "시험·검사 결과와 관계기관 의견을 토대로 적합성 인증 여부를 결정한다.", "industrialConvergence", ["제16조"], { type: "notice", output_documents: ["적합성 인증서"] }),
      node("기존 인증·허가와의 효력 확인", "제조자·사업자", "G4 적합성 인증", "인증의 법적 효과와 별도로 필요한 등록·허가·신고를 확인해 시장 출시 계획에 반영한다.", "industrialConvergence", ["제16조"], { output_documents: ["시장진입 확인표", "필요 인허가 목록"] }),
      node("시장 출시·변경·안전관리", "제조자·사업자", "G5 시장관리", "출시 후 제품 변경과 안전·성능 정보를 관리하고 소관 시장감시·리콜 경로와 연결한다.", "industrialConvergence", [], { output_documents: ["출시·변경 기록", "안전관리 자료"] }),
    ],
    edges: [["P01", "P02"], ["P02", "P03"], ["P03", "P04"], ["P04", "P05"], ["P05", "P06"], ["P06", "P07"], ["P07", "P08"], ["P08", "P09"], ["P05", "P04", "loop", "기준 보완"], ["P07", "P03", "message", "추가 허가·기준 확인"]],
  },
];

function node(name, lane, stage, action, sourceKey, articles, extra = {}) {
  return { name, lane, stage, action, sourceKey, articles, ...extra };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function buildNode(spec, raw, index) {
  const id = `P${pad(index + 1)}`;
  const source = S[raw.sourceKey];
  const legalBasis = (raw.articles ?? []).map((article) => ({
    law: source.law,
    article,
    text: `${source.law} ${article}에 따른 절차 근거. 구체적인 적용범위와 운영기준은 하위 법령·고시를 함께 확인한다.`,
  }));
  const defaultStatus = index < 2 ? "done" : index === 2 ? "current" : "waiting";
  const defaultProgress = defaultStatus === "done" ? 100 : defaultStatus === "current" ? 40 : 0;
  return {
    id,
    name: raw.name,
    lane: raw.lane,
    stage: raw.stage,
    type: raw.type ?? "task",
    status: raw.status ?? defaultStatus,
    progress: raw.progress ?? defaultProgress,
    actor: raw.actor ?? raw.lane,
    ...(raw.receiver ? { receiver: raw.receiver } : {}),
    action: raw.action,
    ...(raw.condition ? { condition: raw.condition } : {}),
    ...(raw.input_documents ? { input_documents: raw.input_documents } : {}),
    output_documents: raw.output_documents ?? [`${raw.name} 기록`],
    ...(raw.deadline ? { deadline: raw.deadline } : {}),
    ...(raw.blocker ? { blocker: raw.blocker } : {}),
    confidence: raw.confidence ?? (legalBasis.length ? 0.82 : 0.72),
    legal_basis: legalBasis,
  };
}

function buildEdges(edges) {
  return edges.map(([source, target, type = "sequence", label = null], index) => ({
    id: type === "loop" ? `L${pad(index + 1)}` : type === "message" ? `M${pad(index + 1)}` : `E${pad(index + 1)}`,
    source,
    target,
    type,
    label,
  }));
}

function buildInstitution(spec) {
  const legalBasis = spec.sourceKeys.map((key) => ({
    law: S[key].law,
    articles: spec.legalArticles[key],
    kind: S[key].kind,
  }));
  const nodes = spec.nodes.map((raw, index) => buildNode(spec, raw, index));
  const sources = spec.sourceKeys.map((key) => S[key]);
  return {
    slug: spec.slug,
    name: spec.name,
    oneLiner: spec.oneLiner,
    type: spec.type,
    priority: spec.priority,
    category: spec.category,
    whyFirst: spec.whyFirst,
    asOfDate: AS_OF,
    status: "full",
    canvas: {
      purpose: spec.purpose,
      stakeholders: spec.stakeholders,
      legalBasis,
      authorities: spec.authorities,
      procedure: spec.procedure,
      moneyFlow: spec.moneyFlow,
      docsFlow: spec.docsFlow,
      bottlenecks: spec.bottlenecks,
      reformPoints: spec.reformPoints,
    },
    related: spec.related,
    fieldVerification: spec.field,
    process: {
      institution_name: spec.name,
      law_name: sources.map((source) => source.law).join(" · "),
      lanes: spec.lanes,
      stages: spec.stages,
      nodes,
      edges: buildEdges(spec.edges),
      warnings: [
        ...spec.warnings,
        "이번 추가분은 국가법령정보센터 공식 법령 식별자와 소관기관 절차 안내를 연결한 source-linked 단계다. 시행령·시행규칙·고시·서식·현장 처리기간은 fieldVerification으로 분리했다.",
      ],
    },
    verification: {
      status: "source-linked",
      verifiedAt: AS_OF,
      method: "국가법령정보센터 현행 법령 식별자와 산업통상부·국가기술표준원·무역위원회 공식 절차 안내 연결",
      scope: "법적 근거의 공식 원문 식별자와 핵심 조문 범위를 연결했다. 개별 노드의 조문번호 존재·인용문구 타당성은 후속 법령 API 대조 대상으로 남겼다.",
      notes: ["산업통상부 조직 개편 이후의 기관 명칭을 사용했다.", "제품·품목별 하위 법령과 고시는 제도별로 달라 별도 확인이 필요하다."],
      sources,
      articleVerification: {
        checkedAt: AS_OF,
        method: "공식 법령 식별자 연결; 조문 자동 대조 미실행",
        citationEntries: 0,
        explicitCitationEntries: 0,
        articleReferences: 0,
        verifiedReferences: 0,
        missingReferences: 0,
        uncheckableReferences: 0,
      },
    },
  };
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const existingSlugs = new Set(manifest.map((entry) => entry.slug));
  const existingPriorities = new Set(manifest.map((entry) => entry.priority));

  for (const spec of specs) {
    const outputPath = path.join(DATA_DIR, `${spec.slug}.json`);
    if (!OVERWRITE && fs.existsSync(outputPath)) {
      throw new Error(`${spec.slug}.json already exists; use --overwrite only when intentional`);
    }
    if (existingSlugs.has(spec.slug)) throw new Error(`manifest already contains ${spec.slug}`);
    if (existingPriorities.has(spec.priority)) throw new Error(`manifest already contains priority ${spec.priority}`);
    fs.writeFileSync(outputPath, `${JSON.stringify(buildInstitution(spec), null, 2)}\n`);
    manifest.push({ priority: spec.priority, slug: spec.slug, name: spec.name, type: spec.type, category: spec.category });
  }

  manifest.sort((a, b) => a.priority - b.priority);
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`generated ${specs.length} industry/trade institutions; manifest=${manifest.length}`);
  for (const spec of specs) console.log(`${spec.priority}\t${spec.slug}\t${spec.name}`);
}

main();
