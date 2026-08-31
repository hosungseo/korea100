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
  // 온톨로지 케이스(IDC-2026-0901-001)가 참조하는 제도. 전이 수동 대조 미완료이므로 R2를 주장하지 않는다.
  { slug: "information-disclosure", transitionReviewed: false },
];

const SELECTION_REASONS = {
  "administrative-fine-pre-notice-opinion": "짧은 기본 절차와 조건 분기를 보여주는 사례",
  "administrative-fine-objection-court": "행정청에서 법원으로 넘어가는 기관 간 인계 사례",
  "national-rd-fund-use-settlement": "법률·시행령·행정규칙을 함께 사용하는 복합 사례",
  "information-disclosure": "온톨로지 케이스 계층과 맞물리는 사례. R2 미달 사유를 그대로 남긴다",
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
