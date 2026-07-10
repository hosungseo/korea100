import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPO_ROOT = path.dirname(ROOT);
const DATA_DIR = path.join(ROOT, "data", "institutions");
const MANIFEST_PATH = path.join(REPO_ROOT, "docs", "institutions-100-manifest.json");
const JSON_PATH = path.join(REPO_ROOT, "docs", "field-verification-queue.json");
const MARKDOWN_PATH = path.join(REPO_ROOT, "docs", "field-verification-queue.md");

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const categoryBySlug = new Map(
  manifest.map((entry) => [entry.slug, entry.category])
);
const entries = [];
const asOfDates = [];

for (const file of fs.readdirSync(DATA_DIR).filter((name) => name.endsWith(".json"))) {
  const institution = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, file), "utf8")
  );
  asOfDates.push(institution.asOfDate);
  institution.fieldVerification.forEach((item, index) => {
    const domain = classifyDomain(item);
    entries.push({
      id: `${institution.slug}-FV${String(index + 1).padStart(2, "0")}`,
      priority: institution.priority,
      slug: institution.slug,
      institutionName: institution.name,
      category: institution.category ?? categoryBySlug.get(institution.slug) ?? "기타",
      item,
      domain,
      suggestedEvidence: suggestedEvidence(domain),
      status: "open",
    });
  });
}

entries.sort(
  (a, b) => a.priority - b.priority || a.id.localeCompare(b.id)
);
const byDomain = Object.fromEntries(
  [...new Set(entries.map((entry) => entry.domain))]
    .sort((a, b) => a.localeCompare(b, "ko"))
    .map((domain) => [
      domain,
      entries.filter((entry) => entry.domain === domain).length,
    ])
);
const report = {
  sourceAsOfDate: asOfDates.sort().at(-1),
  total: entries.length,
  institutions: new Set(entries.map((entry) => entry.slug)).size,
  byDomain,
  entries,
};

fs.writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(
  MARKDOWN_PATH,
  [
    "# 현장 검증 큐",
    "",
    `데이터 기준일: ${report.sourceAsOfDate}`,
    `검증 항목: ${report.total}건 / ${report.institutions}개 제도`,
    "",
    "## 영역별 현황",
    "",
    ...Object.entries(byDomain).map(([domain, count]) => `- ${domain}: ${count}건`),
    "",
    "## 운영 원칙",
    "",
    "- 법령 원문만으로 확인하기 어려운 실제 처리, 내부 절차, 시스템 운용 항목을 관리한다.",
    "- 검증 완료 시 공식 문서 URL, 확인 기관·역할, 확인일을 함께 기록한다.",
    "- 개인 사건 정보나 비공개 내부자료는 저장하지 않는다.",
    "",
  ].join("\n")
);

console.log(
  `현장 검증 큐 생성: ${report.total}건 / ${report.institutions}개 제도`
);

function classifyDomain(item) {
  if (/시스템|전산|온라인|데이터|DB|연계/.test(item)) return "정보시스템";
  if (/기한|기간|소요|처리일|지연/.test(item)) return "처리기간";
  if (/서식|문서|자료|증빙|보고서/.test(item)) return "문서·증빙";
  if (/예산|비용|수수료|금액|재원/.test(item)) return "재정·비용";
  if (/관행|실무|내부|현장|운영/.test(item)) return "실무 관행";
  if (/기관|부처|지자체|담당|권한/.test(item)) return "기관·권한";
  return "운영 사실";
}

function suggestedEvidence(domain) {
  const evidence = {
    정보시스템: "공식 시스템 매뉴얼 또는 운영기관 확인",
    처리기간: "처리대장·통계 또는 담당자 인터뷰",
    "문서·증빙": "현행 서식·업무편람 또는 공식 안내",
    "재정·비용": "예산서·수수료 고시 또는 결산자료",
    "실무 관행": "복수 실무자 인터뷰와 공개 업무편람",
    "기관·권한": "직제·사무분장 또는 담당기관 확인",
    "운영 사실": "소관기관 공식 문서 또는 담당자 확인",
  };
  return evidence[domain];
}
