import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const MANIFEST_PATH = path.join(REPO_DIR, "docs", "institutions-100-manifest.json");
const INSTITUTIONS_DIR = path.join(WEB_DIR, "data", "institutions");
const OUT_DIR = path.join(REPO_DIR, "docs", "comparative-law-pilot");
const JSON_PATH = path.join(OUT_DIR, "latest.json");
const MD_PATH = path.join(OUT_DIR, "latest.md");

const SOURCE = {
  name: "법제처_세계법제정보센터_부처 부서 및 법령_20240801",
  pageUrl: "https://www.data.go.kr/data/15092920/fileData.do?recommendDataYn=Y",
  downloadUrl:
    "https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000002971688&fileDetailSn=1&insertDataPrcus=N",
  modifiedAt: "2026-02-04",
  encoding: "euc-kr",
  expectedRows: 4010,
};

const KEYWORDS = {
  "environmental-impact-assessment": [
    "환경영향평가",
    "영향평가",
    "환경평가",
    "환경",
    "개발사업",
  ],
  "preliminary-feasibility-study": [
    "예비타당성",
    "타당성",
    "공공투자",
    "사업평가",
    "재정",
    "국가재정",
  ],
  "urban-redevelopment": [
    "재건축",
    "재개발",
    "정비사업",
    "도시정비",
    "도시재생",
    "주택",
    "부동산",
    "건설",
    "국토개발",
  ],
  "local-extinction-response-fund": [
    "지방소멸",
    "지역균형",
    "지역발전",
    "지방재정",
    "보조금",
    "기금",
    "인구",
  ],
  "information-disclosure": [
    "정보공개",
    "공공정보",
    "행정정보",
    "투명성",
    "공공데이터",
  ],
  "administrative-appeals": [
    "행정심판",
    "행정소송",
    "불복",
    "권리구제",
    "행정절차",
    "처분",
  ],
  "basic-livelihood-security": [
    "기초생활",
    "사회보장",
    "사회복지",
    "공공부조",
    "생활보호",
    "빈곤",
    "복지급여",
  ],
  "public-procurement": [
    "공공조달",
    "정부조달",
    "국가계약",
    "계약",
    "입찰",
    "조달",
    "공공구매",
  ],
  "national-health-insurance": [
    "건강보험",
    "의료보험",
    "사회보험",
    "보건",
    "의료",
    "건강",
  ],
  "privacy-impact-assessment": [
    "개인정보",
    "정보보호",
    "데이터보호",
    "프라이버시",
    "영향평가",
  ],
  "local-government-merger": [
    "지방자치",
    "지방정부",
    "행정구역",
    "시군구",
    "지방행정",
    "지방분권",
  ],
  "jeonse-fraud-relief": [
    "주택임대차",
    "임대차",
    "전세",
    "주거",
    "부동산",
    "피해구제",
    "보증",
  ],
  "ai-basic-act": [
    "인공지능",
    "자동화",
    "데이터",
    "디지털",
    "알고리즘",
    "정보통신",
  ],
  "emissions-trading": [
    "온실가스",
    "배출권",
    "탄소",
    "기후",
    "환경",
    "에너지",
  ],
  "government-organization": [
    "정부조직",
    "행정조직",
    "국가행정",
    "중앙행정",
    "공무원",
    "행정",
  ],
  "cabinet-meetings": [
    "국무회의",
    "차관회의",
    "내각",
    "각료회의",
    "정부회의",
    "행정",
  ],
  "legislation-procedure": [
    "입법절차",
    "법령",
    "법률",
    "법제",
    "규제",
    "행정절차",
  ],
  "legislative-notice": [
    "입법예고",
    "행정예고",
    "공청회",
    "의견수렴",
    "행정절차",
    "공공참여",
  ],
  "assembly-lawmaking": [
    "국회",
    "의회",
    "입법",
    "법률안",
    "의원",
    "의회절차",
  ],
  "parliamentary-audit": [
    "국정감사",
    "국정조사",
    "의회감사",
    "감찰활동",
    "감사",
    "조사",
    "의회",
  ],
};

const WEAK_TERMS = new Set([
  "감사",
  "건강",
  "건설",
  "계약",
  "규제",
  "기금",
  "데이터",
  "디지털",
  "법령",
  "법률",
  "보건",
  "부동산",
  "에너지",
  "의료",
  "의회",
  "입법",
  "재정",
  "조사",
  "주거",
  "주택",
  "처분",
  "행정",
  "환경",
]);

const CATEGORY_HINTS = {
  "국토·환경·안전": ["환경", "부동산", "건설", "국토개발", "교통", "국방", "치안"],
  "재정과 예산": ["금융", "세제", "행정", "정부조직"],
  "민원·권리구제·참여": ["행정", "정부조직", "소송(민", "형사)", "복지", "인권"],
  "국가 운영과 권력 통제": ["행정", "정부조직", "소송(민", "형사)", "헌법"],
  "복지와 사회보험": ["복지", "인권", "보건", "의약품", "노동", "근로"],
  "데이터·디지털·공공서비스": ["방송", "정보통신", "지식재산권", "행정"],
  "지방자치와 지역": ["행정", "정부조직", "부동산", "건설", "국토개발"],
};

function usage() {
  return [
    "Usage: node scripts/pilot-comparative-law.mjs [--limit=N] [--matches=N] [--dry-run] [--quiet]",
    "",
    "Downloads the public World Laws ministry/law CSV, scores comparative-law matches",
    "against the first N Korea100 manifest entries, and writes:",
    `  ${path.relative(WEB_DIR, JSON_PATH)}`,
    `  ${path.relative(WEB_DIR, MD_PATH)}`,
    "",
    "Options:",
    "  --limit=N    Number of Korea100 manifest entries to evaluate. Default: 20.",
    "  --matches=N  Max matches per institution. Default: 5.",
    "  --dry-run    Print summary without writing files.",
    "  --quiet      Suppress summary output.",
    "  --help       Show this help.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    limit: 20,
    matches: 5,
    dryRun: false,
    quiet: false,
  };

  for (const arg of argv) {
    if (arg === "--help") {
      args.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--quiet") {
      args.quiet = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      args.limit = positiveInteger(arg, "--limit");
      continue;
    }
    if (arg.startsWith("--matches=")) {
      args.matches = positiveInteger(arg, "--matches");
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function positiveInteger(arg, name) {
  const value = Number(arg.slice(arg.indexOf("=") + 1));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function fetchSourceText() {
  const response = await fetch(SOURCE.downloadUrl);
  if (!response.ok) {
    throw new Error(`World Laws CSV download failed: HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return new TextDecoder(SOURCE.encoding).decode(buffer);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  const [header, ...body] = rows.filter((candidate) => candidate.some((cellValue) => cellValue.trim()));
  if (!header) throw new Error("CSV header missing");
  return body.map((cells, index) => {
    const entry = Object.fromEntries(header.map((key, cellIndex) => [key, cells[cellIndex] ?? ""]));
    entry._rowNumber = index + 2;
    return entry;
  });
}

function normalizeRows(rows) {
  return rows.map((row) => ({
    lawSerial: row["법령일련번호"],
    departmentSerial: row["부서일련번호"],
    country: row["국가명"],
    parentLawSerial: row["상위법령일련번호"] === "(NULL)" ? null : row["상위법령일련번호"],
    topic: row["주제분류명"],
    lawCategory: row["법령분류명"],
    lawName: row["법령명"],
    lawUrl: row["법령URL"],
    rowNumber: row._rowNumber,
  }));
}

function scoreRow(row, institution) {
  const keywords = [...new Set([
    ...(KEYWORDS[institution.slug] ?? []),
    institution.name,
    institution.type,
  ].filter(Boolean))];
  const categoryHints = CATEGORY_HINTS[institution.category] ?? [];
  const fields = {
    lawName: row.lawName ?? "",
    topic: row.topic ?? "",
    lawCategory: row.lawCategory ?? "",
    country: row.country ?? "",
    urlSearchText: searchTextFromUrl(row.lawUrl ?? ""),
  };
  let score = 0;
  const reasons = [];
  const strongSignals = [];

  for (const keyword of keywords) {
    const matched = [];
    if (contains(fields.lawName, keyword)) {
      score += keyword.length >= 4 ? 14 : 8;
      matched.push("법령명");
      if (isStrongTerm(keyword)) strongSignals.push(`${keyword}:법령명`);
    }
    if (contains(fields.topic, keyword)) {
      score += keyword.length >= 4 ? 9 : 5;
      matched.push("주제분류");
    }
    if (contains(fields.lawCategory, keyword)) {
      score += 3;
      matched.push("법령분류");
    }
    if (contains(fields.urlSearchText, keyword)) {
      score += 2;
      matched.push("검색어");
      if (isStrongTerm(keyword)) strongSignals.push(`${keyword}:검색어`);
    }
    if (matched.length) reasons.push(`${keyword}:${matched.join("/")}`);
  }

  for (const hint of categoryHints) {
    if (contains(fields.topic, hint)) {
      score += 2;
      reasons.push(`분야:${hint}`);
    }
  }

  if (row.lawCategory === "일반법령") score += 1;
  if (!row.lawUrl?.startsWith("http")) score -= 5;

  return { score, reasons, strongSignals };
}

function contains(source, needle) {
  if (!needle) return false;
  return source.toLocaleLowerCase("ko-KR").includes(needle.toLocaleLowerCase("ko-KR"));
}

function isStrongTerm(term) {
  return term.length >= 3 && !WEAK_TERMS.has(term);
}

function searchTextFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("searchText") ?? "";
  } catch {
    return "";
  }
}

function selectMatches(rows, institution, limit) {
  const seen = new Set();
  const scored = rows
    .map((row) => {
      const scored = scoreRow(row, institution);
      return { row, ...scored };
    })
    .filter(({ score, strongSignals }) => score >= 8 && strongSignals.length > 0)
    .sort((a, b) => b.score - a.score || a.row.country.localeCompare(b.row.country, "ko-KR"));

  const selected = [];
  for (const item of scored) {
    const key = `${item.row.country}:${item.row.lawName}`;
    const countryCount = selected.filter((match) => match.country === item.row.country).length;
    if (seen.has(key) || countryCount >= 2) continue;
    seen.add(key);
    selected.push({
      country: item.row.country,
      lawName: item.row.lawName,
      topic: item.row.topic,
      lawCategory: item.row.lawCategory,
      lawUrl: item.row.lawUrl,
      score: item.score,
      confidence: item.score >= 30 ? "direct" : item.score >= 18 ? "adjacent" : "weak",
      reasons: item.reasons.slice(0, 6),
      strongSignals: item.strongSignals.slice(0, 4),
    });
    if (selected.length >= limit) break;
  }

  return selected;
}

function markdownReport(result) {
  const lines = [
    "# Korea100 comparative-law pilot",
    "",
    `- Generated at: ${result.generatedAt}`,
    `- Source: [${result.source.name}](${result.source.pageUrl})`,
    `- Source modified: ${result.source.modifiedAt}`,
    `- Raw rows decoded: ${result.source.rowsDecoded}`,
    `- Institutions evaluated: ${result.summary.institutionsEvaluated}`,
    `- Institutions with at least one match: ${result.summary.institutionsWithMatches}`,
    `- Institutions with direct/adjacent matches: ${result.summary.institutionsWithUsableMatches}`,
    `- Match confidence counts: direct ${result.summary.confidenceCounts.direct}, adjacent ${result.summary.confidenceCounts.adjacent}, weak ${result.summary.confidenceCounts.weak}`,
    `- Matching mode: keyword/topic/title scoring for triage, not legal equivalence`,
    "",
    "## Read first",
    "",
    "This pilot is a triage layer for Korea100 comparative notes. A match means the World Laws dataset has a foreign law entry with overlapping Korean title/topic signals. It does not prove the foreign law is an equivalent institution.",
    "",
    "Recommended use: take the high-scoring rows, open the World Laws URL, and manually write one `해외에서는?` paragraph only after checking the actual page.",
    "",
  ];

  for (const item of result.items) {
    lines.push(`## ${item.priority}. ${item.name}`);
    lines.push("");
    lines.push(`- Slug: \`${item.slug}\``);
    lines.push(`- Category: ${item.category}`);
    lines.push(`- Seed terms: ${item.seedTerms.join(", ")}`);
    if (item.matches.length === 0) {
      lines.push("- Matches: none above threshold");
      lines.push("");
      continue;
    }
    lines.push("");
    lines.push("| Country | Law | Topic | Score | Why |");
    lines.push("| --- | --- | --- | ---: | --- |");
    for (const match of item.matches) {
      lines.push(
        `| ${escapeCell(match.country)} | [${escapeCell(match.lawName)}](${match.lawUrl}) | ${escapeCell(match.topic)} | ${match.score} (${match.confidence}) | ${escapeCell(match.reasons.join("; "))} |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const manifest = readJson(MANIFEST_PATH).slice(0, args.limit);
  const institutions = manifest.map((entry) => {
    const filePath = path.join(INSTITUTIONS_DIR, `${entry.slug}.json`);
    const detail = fs.existsSync(filePath) ? readJson(filePath) : {};
    return { ...entry, ...detail };
  });

  const csvText = await fetchSourceText();
  const rows = normalizeRows(parseCsv(csvText));
  const items = institutions.map((institution) => ({
    priority: institution.priority,
    slug: institution.slug,
    name: institution.name,
    category: institution.category,
    type: institution.type,
    seedTerms: [...new Set([...(KEYWORDS[institution.slug] ?? []), institution.name, institution.type])],
    matches: selectMatches(rows, institution, args.matches),
  }));
  const institutionsWithMatches = items.filter((item) => item.matches.length > 0).length;
  const confidenceCounts = countConfidence(items);
  const institutionsWithUsableMatches = items.filter((item) =>
    item.matches.some((match) => match.confidence === "direct" || match.confidence === "adjacent"),
  ).length;
  const result = {
    generatedAt: new Date().toISOString(),
    source: {
      ...SOURCE,
      rowsDecoded: rows.length,
    },
    summary: {
      institutionsEvaluated: items.length,
      institutionsWithMatches,
      institutionsWithUsableMatches,
      totalMatches: items.reduce((sum, item) => sum + item.matches.length, 0),
      confidenceCounts,
    },
    items,
  };

  if (!args.dryRun) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(JSON_PATH, `${JSON.stringify(result, null, 2)}\n`);
    fs.writeFileSync(MD_PATH, markdownReport(result));
  }

  if (!args.quiet) {
    console.log(
      `comparative-law matches=${result.summary.totalMatches} institutions=${result.summary.institutionsWithMatches}/${result.summary.institutionsEvaluated} rows=${rows.length}`,
    );
    if (!args.dryRun) {
      console.log(path.relative(REPO_DIR, JSON_PATH));
      console.log(path.relative(REPO_DIR, MD_PATH));
    }
  }
}

function countConfidence(items) {
  const counts = { direct: 0, adjacent: 0, weak: 0 };
  for (const item of items) {
    for (const match of item.matches) {
      counts[match.confidence] += 1;
    }
  }
  return counts;
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
