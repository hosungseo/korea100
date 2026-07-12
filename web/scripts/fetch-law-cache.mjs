// 국가법령정보센터 Open API로 법령·행정규칙 전문을 받아 sources/law-cache/에 저장한다.
// law.go.kr egress가 차단된 원격 개발 환경 대신 GitHub Actions 러너에서 실행하는 용도.
// 사용: LAW_OC=... node scripts/fetch-law-cache.mjs
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.dirname(path.dirname(SCRIPT_DIR));
const CACHE_DIR = path.join(REPO_DIR, "sources", "law-cache");
const LIST_PATH = path.join(CACHE_DIR, "law-list.json");
const CLI = process.env.KOREAN_LAW_CLI ?? "korean-law";
const CLI_IS_SCRIPT = /\.(?:mjs|cjs|js)$/i.test(CLI);

if (!process.env.LAW_OC?.trim()) {
  throw new Error("LAW_OC 환경변수가 없어 원문 캐시를 중단합니다.");
}

const list = JSON.parse(fs.readFileSync(LIST_PATH, "utf8"));
const today = new Date().toISOString().slice(0, 10);
const failures = [];

function compact(value) {
  return (value ?? "").replace(/\s+/g, "").replace(/[「」『』()·ㆍ]/g, "");
}

async function runCli(args) {
  try {
    const { stdout } = await execFileAsync(
      CLI_IS_SCRIPT ? process.execPath : CLI,
      CLI_IS_SCRIPT ? [CLI, ...args] : args,
      { env: process.env, maxBuffer: 48 * 1024 * 1024, timeout: 120_000 },
    );
    return { ok: true, output: stdout };
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter((value) => typeof value === "string")
      .join("\n");
    return { ok: false, output };
  }
}

function looksFailed(result) {
  return (
    !result.ok ||
    result.output.trim().length < 200 ||
    /^\[(?:ERROR|NOT_FOUND)\]/m.test(result.output) ||
    /전문을 조회할 수 없습니다|데이터를 찾을 수 없습니다|조회 실패/.test(result.output)
  );
}

// search_law 출력에서 `N. 법령명 [현행]` 블록을 파싱해 원하는 법령의 MST를 찾는다.
function parseSearchEntries(output, idLabelPattern) {
  const entries = [];
  const blocks = output.split(/^\s*\d+\.\s+/m).slice(1);
  for (const block of blocks) {
    const name = block.split("\n", 1)[0].replace(/\[[^\]]*\]/g, "").trim();
    const idMatch = block.match(idLabelPattern);
    if (idMatch) entries.push({ name, id: idMatch[1], isCurrent: /\[현행\]/.test(block.split("\n", 1)[0]) || !/연혁/.test(block) });
  }
  return entries;
}

function pickEntry(entries, wanted) {
  const target = compact(wanted);
  return (
    entries.find((entry) => compact(entry.name) === target && entry.isCurrent) ??
    entries.find((entry) => compact(entry.name) === target) ??
    entries.find((entry) => compact(entry.name).includes(target) && entry.isCurrent) ??
    entries.find((entry) => compact(entry.name).includes(target)) ??
    null
  );
}

function safeName(name) {
  return name.replace(/[\s/\\:*?"<>|·()]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function save(kind, name, meta, body) {
  const file = path.join(CACHE_DIR, `${safeName(name)}.md`);
  const header = [
    `# ${name} — 원문 캐시`,
    "",
    `- 종류: ${kind}`,
    `- 조회일: ${today} (국가법령정보센터 Open API)`,
    `- 조회 명령: ${meta}`,
    "- 주의: 이 파일은 조회 시점의 사본이다. 공개 전 verify:articles 기계 대조를 별도로 수행한다.",
    "",
    "---",
    "",
  ].join("\n");
  fs.writeFileSync(file, header + body.trimEnd() + "\n");
  console.log(`저장: ${path.relative(REPO_DIR, file)} (${body.length.toLocaleString()}자)`);
}

for (const name of list.statutes ?? []) {
  const search = await runCli(["search_law", "--query", name, "--display", "10"]);
  const entry = pickEntry(parseSearchEntries(search.output, /MST[:=\s]*(\d+)/i), name);
  if (!entry) {
    failures.push({ kind: "법령", name, note: `search_law에서 MST 미확인: ${search.output.slice(0, 400)}` });
    console.error(`실패: 법령 ${name} (MST 미확인)`);
    continue;
  }
  const result = await runCli(["get_law_text", "--mst", entry.id]);
  if (looksFailed(result)) {
    failures.push({ kind: "법령", name, note: result.output.slice(0, 400) });
    console.error(`실패: 법령 ${name} (전문 조회 실패, mst=${entry.id})`);
    continue;
  }
  save("법령", name, `get_law_text --mst ${entry.id} (검색명: ${entry.name})`, result.output);
}

for (const name of list.adminRules ?? []) {
  const search = await runCli(["search_admin_rule", "--query", name, "--display", "10"]);
  const entries = parseSearchEntries(search.output, /행정규칙일련번호[:=\s]*(\d+)/);
  const entry = pickEntry(entries, name) ?? entries[0] ?? null;
  if (!entry) {
    failures.push({ kind: "행정규칙", name, note: `search_admin_rule에서 일련번호 미확인: ${search.output.slice(0, 400)}` });
    console.error(`실패: 행정규칙 ${name} (일련번호 미확인)`);
    continue;
  }
  const result = await runCli(["get_admin_rule", "--id", entry.id]);
  if (looksFailed(result)) {
    failures.push({ kind: "행정규칙", name, note: result.output.slice(0, 400) });
    console.error(`실패: 행정규칙 ${name} (전문 조회 실패, id=${entry.id})`);
    continue;
  }
  save("행정규칙", name, `get_admin_rule --id ${entry.id} (검색명: ${entry.name})`, result.output);
}

fs.writeFileSync(
  path.join(CACHE_DIR, "fetch-report.json"),
  JSON.stringify({ fetchedAt: today, failures }, null, 2) + "\n",
);
console.log(`완료: 실패 ${failures.length}건 (fetch-report.json 참조)`);
if (failures.length > 0) process.exitCode = 0; // 부분 실패는 리포트로 남기고 커밋은 진행한다.
