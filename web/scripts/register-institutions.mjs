#!/usr/bin/env node
/**
 * 제도 파일 → 매니페스트 등재 (컨트롤러 일괄 처리 단계).
 *
 * docs/recipes/institution-creation.md는 작업 에이전트에게 매니페스트를 건드리지 말라고
 * 지시한다. 배치 중 여러 에이전트가 같은 파일을 고치면 충돌하기 때문이다. 대신
 * "컨트롤러가 일괄 처리"하기로 했는데 그 컨트롤러가 사람의 기억으로만 존재했다.
 * 2026-09-01 배치에서 제도 6건이 등재 없이 커밋되어 데이터 검증이 8건 깨졌다.
 *
 * 이 스크립트가 그 단계다. 배치가 끝나면 반드시 돌린다.
 *
 *   node scripts/register-institutions.mjs           등재·정규화·큐 재생성
 *   node scripts/register-institutions.mjs --check   확인만 (파일 수정 없음, 종료코드로 보고)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.dirname(SCRIPT_DIR);
const REPO_DIR = path.dirname(WEB_DIR);
const DATA_DIR = path.join(WEB_DIR, "data", "institutions");
const MANIFEST_PATH = path.join(REPO_DIR, "docs", "institutions-100-manifest.json");

const checkOnly = process.argv.includes("--check");

const MANIFEST_FIELDS = ["priority", "slug", "name", "type", "category"];

function readInstitution(slug) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${slug}.json`), "utf8"));
}

function manifestEntryFor(institution, slug) {
  return {
    priority: institution.priority,
    slug,
    name: institution.name,
    type: institution.type,
    category: institution.category,
  };
}

const slugs = fs.readdirSync(DATA_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/u, ""))
  .sort();

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const manifestBySlug = new Map(manifest.map((entry) => [entry.slug, entry]));

const missing = [];
const mismatched = [];
const notesToNormalize = [];
const orphaned = [];

for (const slug of slugs) {
  const institution = readInstitution(slug);

  // verification.notes는 데이터 계약상 배열이다. 레시피가 타입을 명시하지 않아
  // 작업 에이전트가 문자열로 쓰는 일이 반복됐다.
  const notes = institution.verification?.notes;
  if (typeof notes === "string") notesToNormalize.push(slug);

  const entry = manifestBySlug.get(slug);
  if (!entry) {
    missing.push(manifestEntryFor(institution, slug));
    continue;
  }
  const expected = manifestEntryFor(institution, slug);
  // 제도 파일에 값이 없으면 매니페스트가 대신 쓰인다(src/lib/data.ts). 설계된 폴백이므로
  // 어긋남이 아니다. 양쪽에 값이 있는데 다를 때만 문제다 — 화면은 파일 값을 보여주고
  // 필터 칩은 매니페스트로 만들기 때문에, 어긋나면 그 제도는 어느 칩으로도 안 잡힌다.
  const diffs = MANIFEST_FIELDS.filter((field) => (
    institution[field] !== undefined && institution[field] !== null && entry[field] !== expected[field]
  ));
  if (diffs.length > 0) mismatched.push({ slug, diffs, expected, actual: entry });
}

for (const entry of manifest) {
  if (!slugs.includes(entry.slug)) orphaned.push(entry.slug);
}

const duplicates = (() => {
  const seen = new Map();
  for (const entry of manifest) {
    const list = seen.get(entry.priority) ?? [];
    list.push(entry.slug);
    seen.set(entry.priority, list);
  }
  return [...seen.entries()].filter(([, list]) => list.length > 1);
})();

function report() {
  console.log(`제도 파일 ${slugs.length}개 / 매니페스트 ${manifest.length}건`);
  if (missing.length > 0) {
    console.log(`\n미등재 ${missing.length}건:`);
    for (const entry of missing) console.log(`  ${entry.priority} ${entry.slug} (${entry.category})`);
  }
  if (mismatched.length > 0) {
    console.log(`\n매니페스트 불일치 ${mismatched.length}건 (화면은 파일 값, 필터 칩은 매니페스트 값을 쓴다):`);
    for (const item of mismatched) {
      for (const field of item.diffs) {
        console.log(`  ${item.slug}.${field}: 파일=${JSON.stringify(item.expected[field])} 매니페스트=${JSON.stringify(item.actual[field])}`);
      }
    }
  }
  if (notesToNormalize.length > 0) {
    console.log(`\nverification.notes 문자열 ${notesToNormalize.length}건: ${notesToNormalize.join(", ")}`);
  }
  if (orphaned.length > 0) {
    console.log(`\n매니페스트에만 있고 파일이 없는 항목 ${orphaned.length}건: ${orphaned.join(", ")}`);
  }
  if (duplicates.length > 0) {
    console.log(`\npriority 중복 ${duplicates.length}건:`);
    for (const [priority, list] of duplicates) console.log(`  ${priority}: ${list.join(", ")}`);
  }
}

const clean = missing.length === 0
  && mismatched.length === 0
  && notesToNormalize.length === 0
  && orphaned.length === 0
  && duplicates.length === 0;

if (checkOnly) {
  report();
  if (clean) {
    console.log("\n등재 상태 정상.");
  } else {
    console.log("\n등재가 밀렸습니다. --check 없이 실행해 일괄 처리하세요.");
    process.exitCode = 1;
  }
  process.exit();
}

// orphaned·duplicate·mismatch는 사람이 판단할 문제다. 자동으로 지우거나 덮어쓰지 않는다.
if (orphaned.length > 0 || duplicates.length > 0 || mismatched.length > 0) {
  report();
  console.error("\n자동 처리하지 않습니다. 고아 항목·priority 중복·필드 불일치는 사람이 판단해야 합니다.");
  process.exitCode = 1;
  process.exit();
}

let changed = 0;

for (const slug of notesToNormalize) {
  const filePath = path.join(DATA_DIR, `${slug}.json`);
  const institution = JSON.parse(fs.readFileSync(filePath, "utf8"));
  institution.verification.notes = [institution.verification.notes];
  fs.writeFileSync(filePath, `${JSON.stringify(institution, null, 1)}\n`);
  console.log(`notes 배열화: ${slug}`);
  changed += 1;
}

if (missing.length > 0) {
  manifest.push(...missing);
  manifest.sort((a, b) => a.priority - b.priority);
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const entry of missing) console.log(`매니페스트 등재: ${entry.priority} ${entry.slug}`);
  changed += missing.length;
}

if (changed === 0) {
  console.log(`등재 상태 정상. 제도 ${slugs.length}개 / 매니페스트 ${manifest.length}건`);
} else {
  console.log(`\n${changed}건 처리. 이어서 실행하세요:`);
  console.log("  node scripts/generate-field-verification-queue.mjs");
  console.log("  node scripts/validate-data.mjs");
}
