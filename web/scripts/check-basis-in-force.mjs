#!/usr/bin/env node
// 제도가 인용한 조문이 "지금 시행 중인가"를 본다.
//
//   node web/scripts/check-basis-in-force.mjs <slug> [<slug> …]
//   node web/scripts/check-basis-in-force.mjs --r2          # R2 제도 전부
//   node web/scripts/check-basis-in-force.mjs --project <id> # 사업이 참조하는 제도 전부
//
// 조문 번호가 법에 존재하는지는 기존 검증이 이미 본다. 이 스크립트가 보는 것은
// 다른 질문이다. 존재하기는 하는데 아직 시행되지 않았는가.
//
// 둘은 다른 사고다. 없는 조문을 인용한 것은 오기지만, 시행예정 조문을 인용한 것은
// 대개 맞는 모델이고 다만 아직 이르다. 그런데 결과는 더 나쁠 수 있다 — 오기는
// 대조하면 걸리지만, 시행예정은 문언이 실제로 존재하므로 조문 존재 검증을 통과한다.
// 그 상태로 R2에 올리면 시행되지도 않은 법으로 "다음 행동"을 계산하게 된다.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INSTITUTION_DIR = path.join(ROOT, "data", "institutions");
const OC = process.env.LAW_API_OC ?? "test";
const ASOF = process.env.CHECK_ASOF ?? new Date().toISOString().slice(0, 10);

const norm = (value) => {
  const digits = String(value ?? "").replace(/\D/gu, "");
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}` : null;
};
const artKey = (no, branch) => (branch && branch !== "0" ? `${no}의${branch}` : String(no));

/** "제31조의2제1항" 같은 표기에서 조 단위 열쇠만 뽑는다. 항·호는 이 검사의 관심이 아니다. */
function citedArticles(text) {
  const out = new Set();
  for (const match of String(text ?? "").matchAll(/제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/gu)) {
    out.add(artKey(match[1], match[2]));
  }
  return out;
}

/** "법령명(약칭)" 표기에서 공식 명칭만. 데이터는 약칭을 붙여 쓰는 관례가 있다. */
function officialNameOf(law) {
  return String(law ?? "").replace(/\((?:[^()]*)\)\s*$/u, "").trim();
}

async function versionsOf(officialName) {
  const url = new URL("https://www.law.go.kr/DRF/lawSearch.do");
  url.searchParams.set("OC", OC);
  url.searchParams.set("target", "eflaw");
  url.searchParams.set("query", officialName);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("display", "100");
  const response = await fetch(url);
  if (!response.ok) return [];
  const payload = await response.json();
  return [].concat(payload?.LawSearch?.law ?? [])
    // 동명이법을 섞지 않는다. 법제처 검색은 부분일치라 "…특별법"에 다른 법이 딸려 온다.
    .filter((row) => String(row["법령명한글"] ?? "").trim() === officialName)
    .map((row) => ({
      mst: String(row["법령일련번호"] ?? ""),
      effectiveOn: norm(row["시행일자"]),
      code: row["현행연혁코드"] ?? null,
    }))
    .filter((row) => row.mst && row.effectiveOn);
}

/** 법률에서 못 찾으면 행정규칙인지 본다. 훈령·지침은 eflaw에 없다. */
async function isAdministrativeRule(name) {
  const url = new URL("https://www.law.go.kr/DRF/lawSearch.do");
  url.searchParams.set("OC", OC);
  url.searchParams.set("target", "admrul");
  url.searchParams.set("query", name);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("display", "20");
  const response = await fetch(url);
  if (!response.ok) return null;
  let payload;
  try { payload = await response.json(); } catch { return null; }
  const rows = [].concat(payload?.AdmRulSearch?.admrul ?? []);
  const exact = rows.find((row) => String(row["행정규칙명"] ?? "").trim() === name);
  return exact ? { name, effectiveOn: norm(exact["시행일자"]) } : null;
}

async function articleKeysAt(mst, effectiveOn) {
  const url = new URL("https://www.law.go.kr/DRF/lawService.do");
  url.searchParams.set("OC", OC);
  url.searchParams.set("target", "eflaw");
  url.searchParams.set("MST", mst);
  url.searchParams.set("efYd", effectiveOn.replace(/-/gu, ""));
  url.searchParams.set("type", "JSON");
  const response = await fetch(url);
  if (!response.ok) return null;
  let payload;
  try { payload = await response.json(); } catch { return null; }
  let units = payload?.["법령"]?.["조문"]?.["조문단위"] ?? [];
  if (!Array.isArray(units)) units = [units];
  const keys = new Set();
  for (const unit of units) {
    const no = String(unit?.["조문번호"] ?? "");
    if (!/^\d+$/u.test(no)) continue;
    const branch = String(unit?.["조문가지번호"] ?? "");
    keys.add(artKey(no, /^\d+$/u.test(branch) ? branch : null));
  }
  return keys.size ? keys : null;
}

async function checkInstitution(slug) {
  const raw = await readFile(path.join(INSTITUTION_DIR, `${slug}.json`), "utf8");
  const data = JSON.parse(raw);

  // 법령별로 어느 조문이 인용됐는지 모은다.
  const byLaw = new Map();
  for (const node of data.process?.nodes ?? []) {
    for (const basis of node.legal_basis ?? []) {
      const law = String(basis.law ?? "").trim();
      if (!law) continue;
      const entry = byLaw.get(law) ?? new Map();
      for (const key of citedArticles(basis.article)) {
        if (!entry.has(key)) entry.set(key, []);
        entry.get(key).push(node.id);
      }
      byLaw.set(law, entry);
    }
  }

  const findings = [];
  for (const [law, cited] of byLaw) {
    const versions = await versionsOf(officialNameOf(law));
    if (!versions.length) {
      // 행정규칙은 조문 단위 시행일 대조 대상이 아니다. 모른다고 하지 말고 무엇인지 말한다.
      const rule = await isAdministrativeRule(officialNameOf(law));
      findings.push(rule
        ? { law, status: "administrative_rule", effectiveOn: rule.effectiveOn, cited: [...cited.keys()] }
        : { law, status: "law_not_found", cited: [...cited.keys()] });
      continue;
    }
    const inForce = versions
      .filter((v) => v.effectiveOn <= ASOF)
      .sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn))[0];
    if (!inForce) {
      findings.push({ law, status: "no_in_force_version", cited: [...cited.keys()] });
      continue;
    }
    const present = await articleKeysAt(inForce.mst, inForce.effectiveOn);
    if (!present) {
      findings.push({ law, status: "text_unavailable", effectiveOn: inForce.effectiveOn });
      continue;
    }

    const missing = [...cited.keys()].filter((key) => !present.has(key));
    if (!missing.length) {
      findings.push({ law, status: "all_in_force", effectiveOn: inForce.effectiveOn, count: cited.size });
      continue;
    }

    // 언제부터 시행되는지까지 말해 준다. "없다"만으로는 오기인지 이른지 못 가른다.
    const future = versions
      .filter((v) => v.effectiveOn > ASOF)
      .sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn));
    const arrivesOn = {};
    for (const version of future) {
      const remaining = missing.filter((key) => !(key in arrivesOn));
      if (!remaining.length) break;
      const keys = await articleKeysAt(version.mst, version.effectiveOn);
      if (!keys) continue;
      for (const key of remaining) if (keys.has(key)) arrivesOn[key] = version.effectiveOn;
    }

    findings.push({
      law,
      status: "not_yet_in_force",
      effectiveOn: inForce.effectiveOn,
      missing: missing.map((key) => ({
        article: key.includes("의") ? `제${key.replace("의", "조의")}` : `제${key}조`,
        nodes: cited.get(key),
        // 미래 판에도 없으면 시행예정이 아니라 오기다. 둘을 갈라야 조치가 갈린다.
        effective_from: arrivesOn[key] ?? null,
        verdict: arrivesOn[key] ? "pending_enforcement" : "not_found_anywhere",
      })),
    });
  }
  return { slug, name: data.name, readiness: data.process?.agent_readiness?.level ?? "미평가", findings };
}

async function targets() {
  const args = process.argv.slice(2);
  if (args.includes("--r2")) {
    const files = await readdir(INSTITUTION_DIR);
    const out = [];
    for (const file of files.filter((f) => /^[a-z0-9-]+\.json$/u.test(f))) {
      const data = JSON.parse(await readFile(path.join(INSTITUTION_DIR, file), "utf8"));
      if (data.process?.agent_readiness?.level === "R2") out.push(file.replace(/\.json$/u, ""));
    }
    return out;
  }
  const projectIndex = args.indexOf("--project");
  if (projectIndex >= 0) {
    const id = args[projectIndex + 1];
    const project = JSON.parse(await readFile(path.join(ROOT, "data", "mega-projects", "projects", `${id}.json`), "utf8"));
    return [...new Set((project.nodes ?? []).flatMap((n) => (n.templateRefs ?? []).map((r) => r.institution)))];
  }
  return args.filter((a) => !a.startsWith("--"));
}

async function main() {
  const slugs = await targets();
  if (!slugs.length) {
    console.error("사용: check-basis-in-force.mjs <slug>… | --r2 | --project <id>");
    process.exit(2);
  }
  console.log(`대조일 ${ASOF} · 제도 ${slugs.length}개\n`);

  let pending = 0;
  let wrong = 0;
  for (const slug of slugs) {
    let result;
    try { result = await checkInstitution(slug); }
    catch (error) { console.log(`✗ ${slug}: ${error.message}`); continue; }

    const quiet = new Set(["all_in_force", ...(process.argv.includes("--strict") ? [] : ["administrative_rule"])]);
    const bad = result.findings.filter((f) => !quiet.has(f.status));
    if (!bad.length) continue;

    console.log(`${result.slug} (${result.readiness}) — ${result.name}`);
    for (const finding of bad) {
      if (finding.status === "administrative_rule") {
        console.log(`  · ${finding.law} — 행정규칙(시행 ${finding.effectiveOn ?? "?"}), 조문 시행일 대조 대상 아님`);
        continue;
      }
      if (finding.status !== "not_yet_in_force") {
        console.log(`  ? ${finding.law}: ${finding.status}`);
        continue;
      }
      console.log(`  ${finding.law} — 현행 시행 ${finding.effectiveOn}`);
      for (const item of finding.missing) {
        if (item.verdict === "pending_enforcement") {
          pending += 1;
          console.log(`    ⏳ ${item.article} — ${item.effective_from} 시행예정 (노드 ${item.nodes.join(", ")})`);
        } else {
          wrong += 1;
          console.log(`    ✗ ${item.article} — 어느 판에도 없음 (노드 ${item.nodes.join(", ")})`);
        }
      }
    }
    console.log("");
  }

  console.log(`시행예정 인용 ${pending}건 · 어느 판에도 없는 인용 ${wrong}건`);
  // 시행예정은 오류가 아니다. 다만 그 상태로 R2에 올려선 안 된다는 사실을 남긴다.
  if (wrong > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
