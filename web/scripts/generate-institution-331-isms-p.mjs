#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const MANIFEST_PATH = path.join(REPO_DIR, "docs", "institutions-100-manifest.json");
const AS_OF = "2026-07-13";
const OVERWRITE = process.argv.includes("--overwrite");

const S = {
  privacy: statute("개인정보 보호법", "법률", "011357", "270351", "2025-04-01", "2025-10-02"),
  privacyDecree: statute("개인정보 보호법 시행령", "대통령령", "011468", "286175", "2026-05-19", "2026-05-19"),
  network: statute("정보통신망 이용촉진 및 정보보호 등에 관한 법률", "법률", "000030", "282481", "2026-01-06", "2026-07-07"),
  networkDecree: statute("정보통신망 이용촉진 및 정보보호 등에 관한 법률 시행령", "대통령령", "004797", "288033", "2026-07-07", "2026-07-07"),
  certificationNotice: adminRule(
    "정보보호 및 개인정보보호 관리체계 인증 등에 관한 고시",
    "행정규칙",
    "23559",
    "2100000244750",
    "2024-07-24",
    "개인정보보호위원회고시 제2024-8호·과학기술정보통신부고시 제2024-30호",
    "개인정보보호위원회·과학기술정보통신부",
  ),
};

const spec = {
  priority: 331,
  slug: "isms-p-certification-audit",
  name: "정보보호 및 개인정보보호 관리체계(ISMS-P) 인증심사",
  type: "관리체계 구축·인증심사·사후관리형",
  category: "디지털·개인정보",
  laws: [
    [S.privacy, "제32조의2"],
    [S.privacyDecree, "제34조의2~제34조의7"],
    [S.network, "제47조·제76조"],
    [S.networkDecree, "제47조·제48조·제51조·제52조"],
    [S.certificationNotice, "제17조~제36조"],
  ],
  lanes: ["신청인(기업·기관)", "심사수행기관", "인증심사팀", "KISA·인증기관", "인증위원회"],
  stages: ["G0 범위·운영 준비", "G1 신청·계약", "G2 인증심사", "G3 보완·인증", "G4 유지·구제"],
  nodes: [
    n(
      "인증유형·의무대상 여부 확인",
      "신청인(기업·기관)",
      "G0 범위·운영 준비",
      [[2, "제47조제1항·제2항"], [4, "제18조·제19조"]],
      "개인정보 처리단계까지 포함하는 ISMS-P와 정보보호 중심 ISMS를 구분하고 의무대상 여부와 취득기한을 확인한다.",
      { type: "gateway", docs: ["인증유형·의무대상 검토표"] },
    ),
    n(
      "인증범위·조직·자산 확정",
      "신청인(기업·기관)",
      "G0 범위·운영 준비",
      [[1, "제34조의2제2항·제3항"], [3, "제47조제1항·제2항"], [4, "제18조제3항·제5항"]],
      "서비스 운영조직, 물리적 위치, 정보자산, 개인정보 처리시스템·취급자와 수집부터 파기까지의 처리단계를 인증범위로 정한다.",
      { type: "gateway", docs: ["인증범위 정의서", "정보자산·개인정보처리시스템 목록", "시스템 구성도", "개인정보 흐름도"] },
    ),
    n(
      "관리체계 구축·최소 2개월 운영",
      "신청인(기업·기관)",
      "G0 범위·운영 준비",
      [[4, "제17조제1항·제23조"]],
      "인증기준에 맞춰 정책·지침·절차와 보호대책을 구축하고 실제 업무에서 최소 2개월 이상 운영한다.",
      { docs: ["정보보호·개인정보보호 정책", "지침·절차서", "2개월 이상 운영증적"], deadline: "신청 전 최소 2개월" },
    ),
    n(
      "심사문서·이행증적 사전점검",
      "신청인(기업·기관)",
      "G0 범위·운영 준비",
      [[4, "제17조제2항·제23조"]],
      "인증기준별 담당자, 정책·절차, 시스템 설정, 점검·교육·훈련 기록과 개인정보 처리단계별 증적을 연결해 누락을 확인한다.",
      { docs: ["인증기준별 증적목록", "내부점검 결과", "위험평가·보호대책 이행자료"] },
    ),
    n(
      "신청공문·신청서·운영현황·명세서 작성",
      "신청인(기업·기관)",
      "G1 신청·계약",
      [[1, "제34조의2제2항"], [3, "제47조제1항"], [4, "제18조제2항"]],
      "대표자 명의 신청공문, 인증신청서, 관리체계 운영현황·명세서와 사업자등록증 또는 고유번호증을 작성하고 해당할 때 생략·감면 증빙을 준비한다.",
      { docs: ["대표자 명의 인증신청 공문", "ISMS-P 인증신청서", "ISMS-P 운영현황", "관리체계 명세서", "사업자등록증·고유번호증", "선택: 심사 일부생략·수수료 감면 증빙"] },
    ),
    n(
      "심사수행기관에 신청서 제출",
      "신청인(기업·기관)",
      "G1 신청·계약",
      [[4, "제18조제2항·제3항"]],
      "선택한 심사수행기관에 신청서를 제출한다. KISA 신청 경로에서는 ISMS-P 누리집에 신청정보·운영현황을 입력하고 파일을 첨부한다.",
      { docs: ["인증신청 제출본", "첨부파일 제출목록", "KISA 경로: 온라인 제출완료 확인"] },
    ),
    n(
      "접수·사전준비 확인",
      "심사수행기관",
      "G1 신청·계약",
      [[4, "제17조제2항·제18조제3항~제5항"]],
      "신청서·명세서, 인증범위, 최소 운영기간, 심사 장소·시설·장비와 필수 첨부를 확인하고 미흡하면 보완을 요구한다.",
      { type: "gateway", inputs: ["인증신청 제출본", "신청서·운영현황·명세서와 첨부자료"], docs: ["접수확인", "사전준비 확인기록", "서류 보완요청서"] },
    ),
    n(
      "예비점검·범위·일정 협의",
      "심사수행기관",
      "G1 신청·계약",
      [[1, "제34조의2제3항"], [3, "제47조제2항"], [4, "제18조제3항~제5항"]],
      "업무·서비스, 인증범위, 운영현황과 기준별 이행증적을 확인해 심사범위와 일정을 협의한다. KISA 경로에서는 심사팀장이 신청인을 방문해 예비점검한다.",
      { type: "gateway", docs: ["예비점검 자료", "인증범위·심사일정 협의서"] },
    ),
    n(
      "수수료 산정·계약·청구",
      "심사수행기관",
      "G1 신청·계약",
      [[1, "제34조의3"], [3, "제48조"], [4, "제20조·제21조"]],
      "인증범위, 심사원 수와 심사일수, 일부 생략·감면 사유를 반영해 수수료를 산정하고 계약한 뒤 청구한다.",
      { inputs: ["인증범위·심사일정 협의서", "일부 생략·감면 증빙"], docs: ["인증수수료 산정내역서", "인증심사 계약서", "수수료 청구서"] },
    ),
    n(
      "수수료 납부",
      "신청인(기업·기관)",
      "G1 신청·계약",
      [[4, "제22조"]],
      "청구받은 최초·사후·갱신심사 수수료를 인증심사 시작일 전까지 심사수행기관에 납부한다. 미납 시 심사가 실시되지 않을 수 있다.",
      { inputs: ["수수료 청구서", "인증심사 계약서"], docs: ["수수료 납부확인서"], deadline: "청구일부터 인증심사 시작일 전까지" },
    ),
    n(
      "심사팀 구성·이해관계 확인",
      "심사수행기관",
      "G1 신청·계약",
      [[4, "제24조"]],
      "심사일정 확정 후 KISA에 심사원 모집을 요청하고 범위·사업·기술 특성을 고려해 팀을 구성하며 컨설팅 참여 등 이해관계자를 배제한다.",
      { docs: ["인증심사원 모집요청·배정내역", "이해관계 소명·확인서", "최종 심사계획서"] },
    ),
    n(
      "서면심사·문서증적 확인",
      "인증심사팀",
      "G2 인증심사",
      [[1, "제34조의2제4항"], [3, "제47조제3항·제4항"], [4, "제23조·제25조제1항·제2항"]],
      "정책·지침·절차와 이행증적을 검토해 관리체계, 보호대책, 개인정보 처리단계별 요구사항이 인증기준에 맞는지 확인한다.",
      { docs: ["서면심사 확인기록", "추가자료 요청목록"] },
    ),
    n(
      "현장심사·면담·시스템 점검",
      "인증심사팀",
      "G2 인증심사",
      [[1, "제34조의2제4항"], [3, "제47조제3항"], [4, "제25조제1항·제3항·제6항"]],
      "신청인을 방문해 담당자 면담, 시스템 확인과 취약점 점검으로 기술적·물리적 보호대책 이행을 확인한다. 불가피한 재난 등에는 원격심사를 병행할 수 있다.",
      { docs: ["현장심사 인터뷰·확인기록", "시스템·취약점 점검기록"] },
    ),
    n(
      "결함 판정·보완 요청",
      "심사수행기관",
      "G2 인증심사",
      [[4, "제23조·제25조제4항"]],
      "심사팀이 확인한 인증기준 미달 사항을 근거·대상·증적과 함께 결함으로 확정하고 신청인에게 보완을 요청한다.",
      { type: "gateway", docs: ["결함보고서", "보완조치 요청"] },
    ),
    n(
      "직접경비 정산·청구",
      "심사수행기관",
      "G2 인증심사",
      [[4, "제21조제1항·별표 6"]],
      "현장심사에 실제 소요된 교통비·숙박비·식대 등 직접경비를 정산한다. 현장 상황에 따라 인증수수료와 별도로 지급하도록 청구할 수 있다.",
      { docs: ["직접경비 정산내역", "직접경비 청구서"] },
    ),
    n(
      "직접경비 납부",
      "신청인(기업·기관)",
      "G2 인증심사",
      [[4, "제21조제1항·별표 6"]],
      "심사수행기관이 인증수수료와 별도로 청구한 경우 직접경비 산정내역을 확인하고 납부한다.",
      { inputs: ["직접경비 정산내역", "직접경비 청구서"], docs: ["직접경비 납부확인서"] },
    ),
    n(
      "보완조치·내역서·증적 제출",
      "신청인(기업·기관)",
      "G3 보완·인증",
      [[4, "제25조제4항"]],
      "결함 원인과 영향범위를 분석해 정책·절차·시스템을 시정하고 항목별 조치내역과 이행증적을 제출한다.",
      { inputs: ["결함보고서", "보완조치 요청"], docs: ["보완조치계획", "보완조치내역서", "항목별 시정 증적"], deadline: "심사 종료 다음 날부터 최대 100일(재조치 요구 60일 포함)" },
    ),
    n(
      "보완확인·재조치·현장점검",
      "인증심사팀",
      "G3 보완·인증",
      [[4, "제25조제4항"]],
      "보완조치내역서와 증적을 확인하고 부족한 항목은 재조치를 요구하며 필요한 경우 현장에서 이행 여부를 점검한다.",
      { type: "gateway", inputs: ["보완조치내역서", "항목별 시정 증적"], docs: ["보완조치 확인결과", "재조치 요구서", "보완조치 현장점검 기록"] },
    ),
    n(
      "심사중단 사유 판단·서면통보",
      "심사수행기관",
      "G3 보완·인증",
      [[4, "제26조제1항·제2항"]],
      "고의적 지연·방해, 심사 준비 미흡, 100일 내 보완 미완료, 재난·경영환경 변화로 진행이 불가능하면 중단 여부를 판단하고 사유를 서면 통보한다.",
      { type: "gateway", docs: ["인증심사 중단 통지서"] },
    ),
    n(
      "중단사유 해소 후 재개·종결",
      "심사수행기관",
      "G3 보완·인증",
      [[4, "제26조제3항·제36조"]],
      "중단사유 해소 여부 또는 이의신청 처리결과를 확인해 인증심사를 재개하거나 종결한다.",
      { type: "gateway", docs: ["중단사유 해소자료", "심사 재개·종결 통지"] },
    ),
    n(
      "심사결과보고서 제출",
      "인증심사팀",
      "G3 보완·인증",
      [[3, "제47조제5항"], [4, "제25조·제29조"]],
      "서면·현장심사와 결함 보완 결과를 종합한 심사결과보고서를 KISA 또는 인증기관에 제출한다.",
      { inputs: ["서면·현장심사 기록", "결함·보완 확인결과"], docs: ["인증심사 결과보고서"] },
    ),
    n(
      "인증위원회 심의·의결",
      "인증위원회",
      "G3 보완·인증",
      [[1, "제34조의2제5항"], [3, "제47조제6항"], [4, "제29조~제31조"]],
      "최초·갱신심사의 인증기준 적합 여부를 심의하고 필요하면 심사원·전문가 의견을 들은 뒤 의결한다. 사후심사는 이 단계를 생략한다.",
      { type: "gateway", inputs: ["인증심사 결과보고서", "인증위원회 심의안건"], docs: ["심의·의결서"] },
    ),
    n(
      "심의·의결 결과 통보",
      "KISA·인증기관",
      "G3 보완·인증",
      [[4, "제30조제3항·제5항"]],
      "위원회로부터 심의·의결 결과를 제출받아 신청인에게 통보하고, 결과가 부적합이면 이의신청 가능 여부를 안내한다.",
      { type: "gateway", inputs: ["심의·의결서"], docs: ["인증심의 결과통보서", "해당 시 추가 보완요구서"] },
    ),
    n(
      "위원회 요구 추가보완 제출",
      "신청인(기업·기관)",
      "G3 보완·인증",
      [[4, "제25조제5항"]],
      "인증위원회 결과에 따른 추가 보완 요구를 받으면 요구사항을 시정하고 조치내역과 증적을 제출한다.",
      { inputs: ["추가 보완요구서"], docs: ["추가 보완조치내역서", "추가 보완증적"], deadline: "위원회 종료 다음 날부터 30일 이내" },
    ),
    n(
      "추가보완 이행 확인",
      "심사수행기관",
      "G3 보완·인증",
      [[4, "제25조제5항"]],
      "위원회가 요구한 추가 보완조치가 기한 안에 이행됐는지 제출자료와 필요한 현장 확인으로 검토한다.",
      { type: "gateway", inputs: ["추가 보완조치내역서", "추가 보완증적"], docs: ["추가 보완 확인결과"] },
    ),
    n(
      "인증서 발급·인증현황 공개",
      "KISA·인증기관",
      "G3 보완·인증",
      [[0, "제32조의2제2항·제6항"], [1, "제34조의7"], [2, "제47조제5항·제9항"], [3, "제47조제7항·제52조"], [4, "제32조~제34조"]],
      "인증적합이면 유효기간 3년의 인증서를 발급하고 인증현황을 공개하며 표시·홍보 시 인증범위와 유효기간을 함께 표시한다.",
      { inputs: ["심의·의결서", "해당 시 추가 보완 확인결과"], docs: ["ISMS-P 인증서", "인증현황 공개정보", "인증표시 사용자료"], deadline: "유효기간 3년" },
    ),
    n(
      "연 1회 이상 사후심사 신청",
      "신청인(기업·기관)",
      "G4 유지·구제",
      [[0, "제32조의2제4항"], [1, "제34조의5"], [2, "제47조제8항"], [3, "제51조"], [4, "제27조제1항"]],
      "인증서 유효기간 중 연 1회 이상 심사수행기관에 사후심사를 신청하고 변경사항과 유지 증적을 제출한다.",
      { docs: ["사후심사 신청서", "변경사항·유지심사 자료"], deadline: "유효기간 중 연 1회 이상" },
    ),
    n(
      "사후심사·보완·결과보고",
      "심사수행기관",
      "G4 유지·구제",
      [[0, "제32조의2제4항"], [1, "제34조의5"], [2, "제47조제8항"], [3, "제51조"], [4, "제27조제2항"]],
      "신청·수수료·서면·현장심사와 보완 절차를 준용해 관리체계 유지 여부를 확인하고 그 결과를 KISA 또는 인증기관에 보고한다. 사후심사는 인증위원회 심의를 생략한다.",
      { type: "gateway", inputs: ["사후심사 신청서", "변경사항·유지심사 자료"], docs: ["사후심사 결과보고서", "보완조치 확인결과"] },
    ),
    n(
      "인증유지 결과 통지",
      "KISA·인증기관",
      "G4 유지·구제",
      [[4, "제27조제2항"]],
      "사후심사 결과를 인증취득자에게 통지한다. KISA 신청 경로에서는 인증서 재발급이나 위원회 의결 대신 인증 유지공문을 발송한다.",
      { type: "gateway", inputs: ["사후심사 결과보고서"], docs: ["사후심사 결과통지", "KISA 경로: 인증 유지공문"] },
    ),
    n(
      "갱신심사 신청",
      "신청인(기업·기관)",
      "G4 유지·구제",
      [[4, "제28조·제32조제3항"]],
      "유효기간 만료 3개월 전에 갱신심사를 신청하고 변경된 운영현황·명세서를 제출한다. 갱신도 신청·심사·보완 절차를 준용한다.",
      { inputs: ["기존 인증서", "변경사항·유지 증적"], docs: ["갱신심사 신청서", "갱신 운영현황·명세서"], deadline: "유효기간 만료 3개월 전" },
    ),
    n(
      "인증취소 심의·의결",
      "인증위원회",
      "G4 유지·구제",
      [[0, "제32조의2제3항"], [1, "제34조의4"], [2, "제47조제10항"], [4, "제29조제1항제2호·제35조제1항"]],
      "부정 취득, 기준 미달, 사후·갱신심사 미이행, 보완 미이행, 거짓 홍보, 사후관리 방해 등 취소사유를 심의·의결한다.",
      { type: "gateway", inputs: ["인증취소 심의안건", "취소사유 확인자료"], docs: ["인증취소 심의·의결서"] },
    ),
    n(
      "취소결과 통지·인증서 회수",
      "KISA·인증기관",
      "G4 유지·구제",
      [[4, "제35조제2항"]],
      "인증위원회 의결에 따라 인증을 취소한 경우 인증취득자에게 결과를 통지하고 발급한 인증서를 회수한다.",
      { inputs: ["인증취소 심의·의결서"], docs: ["인증취소 통지서", "인증서 회수 기록"] },
    ),
    n(
      "15일 내 이의신청서 제출",
      "신청인(기업·기관)",
      "G4 유지·구제",
      [[4, "제36조제1항"]],
      "인증심사 결과 또는 인증취소에 이의가 있으면 결과를 통보받은 날부터 15일 이내 KISA 또는 인증기관에 이의신청서를 제출한다.",
      { inputs: ["인증심사 결과통보서 또는 인증취소 통지서"], docs: ["이의신청서"], deadline: "결과 통보일부터 15일 이내" },
    ),
    n(
      "이의 검토·재심의 요청",
      "KISA·인증기관",
      "G4 유지·구제",
      [[4, "제36조제2항"]],
      "이의신청 이유를 검토하고 이유가 있다고 인정하면 인증위원회에 재심의를 요청한다.",
      { type: "gateway", inputs: ["이의신청서"], docs: ["이의검토서", "재심의 요청서"] },
    ),
    n(
      "이의 재심의·의결",
      "인증위원회",
      "G4 유지·구제",
      [[4, "제29조제1항제3호·제36조제2항"]],
      "KISA 또는 인증기관의 요청을 받아 인증심사 결과나 인증취소에 대한 이의를 재심의·의결한다.",
      { type: "gateway", inputs: ["재심의 요청서", "이의검토서"], docs: ["이의 재심의·의결서"] },
    ),
    n(
      "이의처리 결과 통지",
      "KISA·인증기관",
      "G4 유지·구제",
      [[4, "제36조제3항"]],
      "이의 검토 또는 인증위원회 재심의 결과를 신청인이나 인증취득자에게 통지하고, 심사중단 사건이면 그 결과를 재개·종결 결정에 반영한다.",
      { type: "gateway", inputs: ["이의검토서 또는 이의 재심의·의결서"], docs: ["이의신청 처리결과 통지서"] },
    ),
  ],
  edges: [
    ["P01", "P02"], ["P02", "P03"], ["P03", "P04"], ["P04", "P05"], ["P05", "P06"],
    ["P06", "P07"], ["P07", "P08", "sequence", "접수"], ["P07", "P05", "loop", "신청서류 보완"],
    ["P07", "P19", "sequence", "심사 준비 미흡"], ["P08", "P09", "sequence", "범위·일정 확정"], ["P08", "P02", "loop", "범위 조정"],
    ["P09", "P10"], ["P10", "P11", "sequence", "납부 완료"], ["P11", "P12"], ["P12", "P13"],
    ["P13", "P14"], ["P13", "P19", "sequence", "지연·방해·진행불가"], ["P14", "P15"], ["P15", "P16"],
    ["P16", "P17", "sequence", "결함 있음"], ["P16", "P21", "sequence", "결함 없음"], ["P17", "P18"],
    ["P18", "P17", "loop", "재조치"], ["P18", "P21", "sequence", "보완 확인"], ["P18", "P19", "sequence", "100일 내 미완료"],
    ["P19", "P20"], ["P19", "P33", "sequence", "중단 이의"], ["P20", "P12", "loop", "심사 재개"],
    ["P21", "P22"], ["P22", "P23"], ["P23", "P26", "sequence", "인증 적합"],
    ["P23", "P24", "sequence", "추가 보완"], ["P23", "P33", "sequence", "심사결과 이의"],
    ["P24", "P25"], ["P25", "P26", "sequence", "이행 확인"], ["P26", "P27"],
    ["P27", "P28"], ["P28", "P29"], ["P29", "P27", "loop", "다음 연도"],
    ["P29", "P30", "sequence", "유효기간 만료 전"], ["P29", "P31", "sequence", "취소사유"],
    ["P30", "P07", "loop", "갱신심사"], ["P31", "P32"], ["P32", "P33"], ["P33", "P34"],
    ["P34", "P35", "sequence", "이유 인정·재심의"], ["P34", "P36", "sequence", "재심의 불요"], ["P35", "P36"],
    ["P36", "P20", "loop", "중단처리 반영"], ["P36", "P26", "loop", "인증·유지 회복"],
  ],
  field: [
    "심사수행기관별 계약·수수료·심사일정 실무 차이",
    "결함 등급과 보완증적 수용 여부의 심사팀 판단기준",
  ],
};

const file = path.join(DATA_DIR, `${spec.slug}.json`);
if (fs.existsSync(file) && !OVERWRITE) throw new Error(`이미 존재하는 파일: ${file}`);
fs.writeFileSync(file, `${JSON.stringify(build(spec), null, 1)}\n`);

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const existing = manifest.find((item) => item.priority === spec.priority || item.slug === spec.slug);
if (existing && !OVERWRITE) throw new Error(`manifest 중복: ${spec.priority} ${spec.slug}`);
if (existing && (existing.priority !== spec.priority || existing.slug !== spec.slug)) {
  throw new Error(`manifest 충돌: ${spec.priority} ${spec.slug}`);
}
const manifestEntry = {
  priority: spec.priority,
  slug: spec.slug,
  name: spec.name,
  type: spec.type,
  category: spec.category,
};
if (existing) Object.assign(existing, manifestEntry);
else manifest.push(manifestEntry);
manifest.sort((a, b) => a.priority - b.priority);
fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`제도 생성: ${spec.priority} ${spec.name}`);

function build(current) {
  const legalBasis = current.laws.map(([source, articles]) => ({ law: source.law, articles, kind: source.kind }));
  const nodes = current.nodes.map((raw, index) => buildNode(current, raw, index));
  const edges = current.edges.map(([source, target, type = "sequence", label = null], index) => ({
    id: type === "loop" ? `L${pad(index + 1)}` : `E${pad(index + 1)}`,
    source,
    target,
    type,
    label,
  }));
  const procedure = nodes.map((item) => item.name);
  const verificationSources = [...new Map(current.laws.map(([source]) => [`${source.sourceType}:${source.law}`, source])).values()];

  return {
    slug: current.slug,
    name: current.name,
    oneLiner: procedure.join(" → "),
    type: current.type,
    priority: current.priority,
    whyFirst: "담당자가 혼자 준비하더라도 인증범위·운영증적·신청서류·결함보완·사후심사까지 다음 의사결정과 전달문서를 놓치지 않게 한다.",
    asOfDate: AS_OF,
    status: "full",
    canvas: {
      purpose: `${current.name} 절차는 ${procedure.join(" → ")}로 이어진다.`,
      stakeholders: current.lanes.join(", "),
      legalBasis,
      authorities: [
        { name: "심사수행기관", role: "신청 접수, 범위·일정 협의, 계약·수수료, 심사 운영과 보완 요구" },
        { name: "인증심사팀", role: "서면·현장심사, 결함·보완 확인, 심사결과보고" },
        { name: "KISA·인증기관", role: "위원회 안건·결과 통지, 인증서 발급, 취소 집행과 이의처리" },
        { name: "인증위원회", role: "최초·갱신 적합 여부, 인증취소와 이의신청 심의·의결" },
      ],
      procedure,
      moneyFlow: "인증범위, 심사원 수와 심사일수에 따라 수수료를 산정해 심사 시작 전 납부하고, 현장 상황에 따라 교통비·숙박비·식대 등 직접경비를 별도로 정산·지급할 수 있다.",
      docsFlow: "인증범위 정의서·운영증적 → 신청공문·신청서·운영현황·명세서 → 수수료 산정내역서·계약서·납부확인 → 서면·현장심사 기록 → 결함보고서·직접경비 정산 → 보완조치내역서·증적 → 심사결과보고서·의결서 → 결과통보·추가보완 → 인증서·사후심사 유지공문·갱신 또는 이의신청 문서로 이어진다.",
      bottlenecks: current.field,
      reformPoints: [
        "신청 단계별 필수·선택 서류와 최신 서식을 한 화면에서 고정 안내",
        "결함별 담당자·기한·제출증적과 심사팀 확인상태를 추적",
        "최초·사후·갱신심사 사이 재사용 가능한 증적과 변경분을 구분",
      ],
    },
    related: ["privacy-impact-assessment", "cloud-idc-security-entry"],
    fieldVerification: current.field,
    process: {
      institution_name: current.name,
      law_name: legalBasis.map((basis) => basis.law).join("·"),
      lanes: current.lanes,
      stages: current.stages,
      nodes,
      edges,
      warnings: [
        "ISMS 의무대상 여부와 ISMS-P 선택 여부는 별개다. ISMS-P를 취득하면 ISMS 인증의무를 이행한 것으로 보지만 모든 신청기관이 ISMS-P 의무대상인 것은 아니다.",
        "고시의 '심사수행기관'은 KISA·인증기관·심사기관 중 실제 심사를 수행하는 기관을 아우르는 역할명이다. KISA가 심사와 인증을 함께 맡으면 구조도의 '심사수행기관'과 'KISA·인증기관'이 같은 조직일 수 있다.",
        "온라인 제출·예비점검·직접경비 청구·유지공문은 2026-07-13 KISA 신청 경로의 공개 절차다. 다른 지정기관 경로에서는 접수 채널과 계약·문서 명칭이 달라질 수 있다.",
        "위원회 종료 후 30일은 위원회 결과에 따라 추가 보완을 요구받은 경우의 기한이며 모든 인증심사에 자동으로 붙는 단계는 아니다.",
        "심사수행기관별 계약·일정과 결함별 증적 수용 여부는 신청 범위와 사실관계에 따라 달라질 수 있다.",
      ],
    },
    verification: {
      status: "source-linked",
      verifiedAt: AS_OF,
      method: "국가법령정보센터 Open API 법령·행정규칙 원문, KISA ISMS-P 인증체계·절차·2026 인증신청 화면 교차 대조",
      scope: "공식 법령 4건과 공동고시 1건의 조문·별표를 연결했다. 행위자·문서·기한·예외 분기는 KISA ISMS-P 누리집의 2026-07-13 공개 절차와 대조했다.",
      notes: [
        "KISA 인증신청: https://www.isms-p.or.kr/cert/aply/selectCertAplyRegistForm.do",
        "KISA 인증절차: https://www.isms-p.or.kr/cert/aply/selectCertPrcdDetail.do",
        "KISA 인증체계: https://www.isms-p.or.kr/sysm/intro/selectSysmCertDetail.do",
        "KISA 2026 플랫폼 인증신청 매뉴얼 공지: https://www.isms-p.or.kr/ntcn/ntc/selectGnrlNtcList.do?pageIndex=3",
      ],
      sources: verificationSources,
      articleVerification: {
        checkedAt: AS_OF,
        method: "현행 법령 및 행정규칙 조문 일괄조회 예정",
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

function buildNode(current, raw, index) {
  const legal_basis = raw.bases.map(([lawIndex, article]) => {
    const law = current.laws[lawIndex][0].law;
    return { law, article, text: `${law} ${article}에 따라 ${raw.action}` };
  });
  return {
    id: `P${pad(index + 1)}`,
    name: raw.name,
    lane: raw.lane,
    stage: raw.stage,
    type: raw.type ?? (/확인|검토|심사|판정|결정|점검/.test(raw.name) ? "gateway" : "task"),
    status: index < 2 ? "done" : index === 2 ? "current" : raw.type === "gateway" ? "risk" : raw.type === "loop" ? "loop" : "waiting",
    progress: index < 2 ? 100 : index === 2 ? 55 : 0,
    actor: raw.lane,
    action: raw.action,
    input_documents: raw.inputs,
    output_documents: raw.docs,
    deadline: raw.deadline ?? null,
    confidence: raw.confidence ?? 0.94,
    legal_basis,
  };
}

function n(name, lane, stage, bases, action, options = {}) {
  return { name, lane, stage, bases, action, ...options };
}

function statute(law, kind, lawId, mst, promulgatedOn, effectiveOn) {
  return {
    law,
    kind,
    sourceType: "statute",
    officialName: law,
    lawId,
    mst,
    promulgatedOn,
    effectiveOn,
    officialUrl: `https://law.go.kr/법령/${law.replace(/\s+/g, "")}`,
  };
}

function adminRule(law, kind, adminRuleId, adminRuleSerial, promulgatedOn, issueNo, org) {
  return {
    law,
    kind,
    sourceType: "admin-rule",
    officialName: law,
    adminRuleId,
    adminRuleSerial,
    promulgatedOn,
    officialUrl: `https://law.go.kr/행정규칙/${law.replace(/\s+/g, "")}`,
    issueNo,
    org,
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}
