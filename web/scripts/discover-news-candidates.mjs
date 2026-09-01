import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  apiDateWindow,
  markdownReport,
  parseNaverResponse,
  parsePolicyBriefingXml,
  rankCandidates,
} from "./lib/news-candidates.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const CONFIG_PATH = path.join(WEB_DIR, "config", "news-candidate-queries.json");
const MANIFEST_PATH = path.join(REPO_DIR, "docs", "institutions-100-manifest.json");
const OUT_DIR = path.join(REPO_DIR, "docs", "news-candidates");
const ARCHIVE_DIR = path.join(OUT_DIR, "archive");
const JSON_PATH = path.join(OUT_DIR, "latest.json");
const MD_PATH = path.join(OUT_DIR, "latest.md");


function stampKst(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const v = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${v.year}-${v.month}-${v.day}`,
    time: `${v.hour}${v.minute}${v.second}`,
    isoLocal: `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}:${v.second}+09:00`,
  };
}

function writeArchiveIndex(archiveRoot) {
  if (!fs.existsSync(archiveRoot)) return;
  const days = fs.readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const lines = [
    "# Korea100 news-candidates archive",
    "",
    `updatedAt: ${new Date().toISOString()}`,
    "",
    `| date | runs | day-latest |`,
    `|---|---:|---|`,
  ];
  for (const day of days) {
    const dayDir = path.join(archiveRoot, day);
    const runs = fs.readdirSync(dayDir)
      .filter((name) => /^\d{6}\.json$/.test(name))
      .sort();
    const hasDayLatest = fs.existsSync(path.join(dayDir, "day-latest.json"));
    lines.push(`| ${day} | ${runs.length} | ${hasDayLatest ? "yes" : "no"} |`);
  }
  lines.push("");
  fs.writeFileSync(path.join(archiveRoot, "INDEX.md"), `${lines.join("\n")}\n`);
}

function localDate(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function argumentValue(name, fallback) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchText(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function fetchNaver(config) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET required");

  const items = [];
  for (const query of config.naver.queries) {
    const url = new URL("https://openapi.naver.com/v1/search/news.json");
    url.search = new URLSearchParams({
      query,
      display: String(config.naver.display),
      sort: config.naver.sort,
    }).toString();
    const payload = await fetchJson(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });
    items.push(...parseNaverResponse(payload, query));
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return items;
}

async function fetchPolicyBriefing(runDate) {
  const serviceKey = process.env.POLICY_BRIEFING_SERVICE_KEY ?? process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) throw new Error("POLICY_BRIEFING_SERVICE_KEY required");

  const items = [];
  for (let offset = 0; offset < 12; offset += 3) {
    const end = new Date(`${runDate}T12:00:00+09:00`);
    end.setDate(end.getDate() - offset);
    const [startDate, endDate] = apiDateWindow(localDate("Asia/Seoul", end));
    const url = new URL("https://apis.data.go.kr/1371000/policyNewsService/policyNewsList");
    url.search = new URLSearchParams({
      serviceKey,
      startDate,
      endDate,
      numOfRows: "100",
      pageNo: "1",
    }).toString();
    const xml = await fetchText(url);
    items.push(...parsePolicyBriefingXml(xml, `${startDate}-${endDate}`));
  }
  return items;
}

async function run() {
  loadEnvFile(path.join(WEB_DIR, ".env.local"));
  loadEnvFile(path.join(REPO_DIR, ".env"));
  const config = readJson(CONFIG_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const runDate = argumentValue("--date", localDate("Asia/Seoul"));
  const limit = Number(argumentValue("--limit", "30"));
  const fetched = [];
  const sourceErrors = [];

  for (const [source, fetcher] of [
    ["naver_news", () => fetchNaver(config)],
    ["policy_briefing", () => fetchPolicyBriefing(runDate)],
  ]) {
    try {
      fetched.push(...await fetcher());
    } catch (error) {
      sourceErrors.push({ source, message: error.message });
    }
  }

  const candidates = rankCandidates(fetched, config, manifest, limit);
  const sourceTypes = [...new Set(fetched.map((item) => item.sourceType))];
  const sourceCounts = Object.fromEntries(
    sourceTypes.map((sourceType) => [
      sourceType,
      fetched.filter((item) => item.sourceType === sourceType).length,
    ]),
  );
  const result = {
    generatedAt: new Date().toISOString(),
    runDate,
    sourceCounts,
    sourceErrors,
    candidates,
  };

  if (!process.argv.includes("--dry-run")) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(JSON_PATH, `${JSON.stringify(result, null, 2)}\n`);
    fs.writeFileSync(MD_PATH, markdownReport(result));

    // Date-based archive (KST): every run under archive/YYYY-MM-DD/HHMMSS.*
    // plus archive/YYYY-MM-DD/day-latest.* for that calendar day.
    const stamp = stampKst(new Date(result.generatedAt ?? Date.now()));
    const day = result.runDate || stamp.date;
    const dayDir = path.join(ARCHIVE_DIR, day);
    fs.mkdirSync(dayDir, { recursive: true });
    const runBase = path.join(dayDir, stamp.time);
    const archivePayload = {
      ...result,
      archive: {
        day,
        runStamp: stamp.time,
        runAtKst: stamp.isoLocal,
      },
    };
    fs.writeFileSync(`${runBase}.json`, `${JSON.stringify(archivePayload, null, 2)}\n`);
    fs.writeFileSync(`${runBase}.md`, markdownReport(archivePayload));
    fs.writeFileSync(path.join(dayDir, "day-latest.json"), `${JSON.stringify(archivePayload, null, 2)}\n`);
    fs.writeFileSync(path.join(dayDir, "day-latest.md"), markdownReport(archivePayload));
    writeArchiveIndex(ARCHIVE_DIR);
  }
  if (!process.argv.includes("--quiet")) {
    console.log(`candidates ${candidates.length} naver=${sourceCounts.naver_news ?? 0} policy=${sourceCounts.policy_briefing ?? 0}`);
    if (sourceErrors.length) console.log(`source_errors ${sourceErrors.map((entry) => entry.source).join(",")}`);
    console.log(path.relative(REPO_DIR, JSON_PATH));
    if (!process.argv.includes("--dry-run")) {
      const stamp = stampKst(new Date(result.generatedAt ?? Date.now()));
      const day = result.runDate || stamp.date;
      console.log(path.relative(REPO_DIR, path.join(ARCHIVE_DIR, day, `${stamp.time}.json`)));
    }
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
