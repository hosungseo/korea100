import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrichInstitutionForAgent } from "./lib/agent-readiness.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const WEB_DIR = path.dirname(path.dirname(SCRIPT_PATH));
const REPO_DIR = path.dirname(WEB_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
export const ASSESSED_AT = process.env.AGENT_VERIFY_DATE ?? "2026-07-16";
const REPORT_PATH = path.join(REPO_DIR, "docs", `agent-readiness-showcase-${ASSESSED_AT}.md`);

export const SHOWCASE_INSTITUTIONS = [
  { slug: "administrative-fine-pre-notice-opinion", transitionReviewed: true },
  { slug: "administrative-fine-objection-court", transitionReviewed: true },
  { slug: "national-rd-fund-use-settlement", transitionReviewed: true },
  // 온톨로지 케이스(IDC-2026-0901-001)가 참조하는 제도.
  // 2026-09-01 연결선 26개 전이 조건·인계를 법제처 현행 원문에 수동 대조했다.
  { slug: "information-disclosure", transitionReviewed: true },
  // 광주 반도체 클러스터(GSC-2026-0901-001)의 열린 전선이 끌어 쓰는 제도.
  // 2026-09-01 연결선 48개를 반도체특별법·국가첨단전략산업법·행정기본법 현행 원문에 수동 대조했다.
  { slug: "semiconductor-cluster-designation-coordination", transitionReviewed: true },
  { slug: "semiconductor-infrastructure-support-fast-track", transitionReviewed: true },
  { slug: "national-strategic-industry-complex", transitionReviewed: true },
  { slug: "one-stop-permit-consultation", transitionReviewed: true },
  // N02(통합 추진체계·재정심사·예타)가 끌어 쓰는 예타 계열.
  // 2026-09-01 연결선 55개를 국가재정법·예비타당성조사 운용지침·지방재정법 현행 원문에 수동 대조했다.
  { slug: "preliminary-feasibility-study", transitionReviewed: true },
  { slug: "pfs-exemption-fast-track", transitionReviewed: true },
  { slug: "local-finance-investment-review-feasibility", transitionReviewed: true },
  // N20 전력계통 경로(면제·신속처리)의 마지막 미평가 제도.
  // 2026-09-01 연결선 21개를 분산에너지 활성화 특별법·시행령 현행 원문에 수동 대조했다.
  { slug: "distributed-energy-special", transitionReviewed: true },
];

const SELECTION_REASONS = {
  "administrative-fine-pre-notice-opinion": "짧은 기본 절차와 조건 분기를 보여주는 사례",
  "administrative-fine-objection-court": "행정청에서 법원으로 넘어가는 기관 간 인계 사례",
  "national-rd-fund-use-settlement": "법률·시행령·행정규칙을 함께 사용하는 복합 사례",
  "information-disclosure": "온톨로지 케이스 계층과 맞물리는 사례. 기한 성격과 전이를 재대조해 R2로 승격",
  "semiconductor-cluster-designation-coordination": "광주 반도체 클러스터의 지정 게이트. 열려야 신속처리 경로가 열린다",
  "semiconductor-infrastructure-support-fast-track": "전력·용수·도로 기반시설과 예타·인허가 신속처리 특례",
  "national-strategic-industry-complex": "특화단지 지정과 인허가 신속처리. 반도체클러스터와 중복 지정 가능",
  "one-stop-permit-consultation": "행정기본법 인허가의제 일반 절차. 여러 마일스톤이 공통으로 끌어 쓴다",
  "preliminary-feasibility-study": "N02 재정심사 경로. 지자체 건의 노드가 법정 절차가 아니어서 R2에 못 미친다",
  "pfs-exemption-fast-track": "예타 면제·신속인허가 특례. N02와 N20 양쪽에 걸린다",
  "local-finance-investment-review-feasibility": "지방재정 투자심사. 지방비 분담이 확정되면 이 경로가 열린다",
  "distributed-energy-special": "전력계통영향평가와 특화지역. N20 전력 경로의 마지막 조각",
};

function institutionCount() {
  return fs.readdirSync(DATA_DIR).filter((file) => file.endsWith(".json")).length;
}

function countLevel(results, level) {
  return results.filter((item) => item.process.agent_readiness.level === level).length;
}

function liveCheckLabel(readiness) {
  const check = readiness.last_live_check;
  return check ? `${check.status} (${check.verified_references}/${check.article_references})` : "미실시";
}

export function writeShowcaseReport(results) {
  const lines = [
    "# 행정절차 에이전트 대표 샘플",
    "",
    `- 평가일: ${ASSESSED_AT}`,
    `- 대상: 전체 ${institutionCount()}개 중 대표 ${results.length}개`,
    `- R2(next-action): ${countLevel(results, "R2")}개`,
    `- R1(reference-only): ${countLevel(results, "R1")}개`,
    "- 범위 원칙: 전 제도 일괄 변환이 아니라 법적 근거·문서·전이가 완결된 소수 사례만 공개",
    "- 검증 원칙: 법제처 DRF API 직접 조회(ID/LID), 모든 후속 행위는 사람 확인 필수",
    "",
    "## 선정 이유",
    "",
    ...results.map((institution) => (
      `- ${institution.name}: ${SELECTION_REASONS[institution.slug] ?? "대표 사례"}`
    )),
    "",
    "## 결과",
    "",
    "| 제도 | 등급 | 법제처 직접 대조 | 노드 | 전이 | 차단 사유 |",
    "|---|---:|---|---:|---:|---|",
  ];
  for (const institution of results) {
    const readiness = institution.process.agent_readiness;
    lines.push(
      `| ${institution.name} | ${readiness.level} | ${liveCheckLabel(readiness)} | ${readiness.metrics.nodes} | ${readiness.metrics.edges} | ${readiness.blockers.join("; ") || "없음"} |`,
    );
  }
  lines.push(
    "",
    "## 활용 경계",
    "",
    "- R2는 다음 행동 후보를 구조화해 반환할 수 있다는 뜻이며 자동 접수·발송·결재 허용을 뜻하지 않는다.",
    "- 조문 번호 존재 확인은 행위 설명의 법적 해석이나 개별 사건 적용 타당성을 보증하지 않는다.",
    "- 저장된 API 대조 지문과 현재 근거 데이터가 다르면 기존 통과 판정은 자동으로 무효화된다.",
    "",
  );
  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
}

export function generateShowcase() {
  const results = SHOWCASE_INSTITUTIONS.map((entry) => {
    const filePath = path.join(DATA_DIR, `${entry.slug}.json`);
    const institution = JSON.parse(fs.readFileSync(filePath, "utf8"));
    enrichInstitutionForAgent(institution, {
      transitionReviewed: entry.transitionReviewed,
      assessedAt: ASSESSED_AT,
    });
    fs.writeFileSync(filePath, `${JSON.stringify(institution, null, 1)}\n`);
    return institution;
  });
  writeShowcaseReport(results);
  console.log(`행정절차 대표 샘플 생성: ${results.length}개(R2 ${countLevel(results, "R2")}개)`);
  return results;
}

if (path.resolve(process.argv[1] ?? "") === SCRIPT_PATH) generateShowcase();
