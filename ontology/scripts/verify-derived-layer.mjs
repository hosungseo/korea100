#!/usr/bin/env node
// 구조 층이 원본과 어긋나지 않았는지 검사한다. PRD 리스크 "재파생이 수동".
//
//   node ontology/scripts/verify-derived-layer.mjs         # 검사만, 어긋나면 exit 1
//   node ontology/scripts/verify-derived-layer.mjs --fix    # 어긋난 케이스를 재파생해 쓴다
//
// 원칙 3(구조 층은 파생물이다)은 지금까지 사람이 --remerge를 기억해야만 지켜졌다.
// 제도 JSON이나 오버레이가 바뀌어도 케이스는 옛 그림을 든 채로 남았고, 아무도
// 알려주지 않았다. 이 스크립트가 그 침묵을 깬다.
//
// 대조 대상은 파생 층뿐이다. 저작 층(State·Rule·ActionPacket·demo_queries)은
// 사람 것이라 건드리지도 비교하지도 않는다.
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { remergeFromSource as remergeInstitution } from "./derive-case.mjs";
import { remergeFromSource as remergeProject } from "./derive-project-case.mjs";
import { remergeFromSource as remergeMilestone } from "./derive-milestone-case.mjs";

const ONTOLOGY_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES_DIR = path.join(ONTOLOGY_DIR, "samples");

// case_kind가 없는 초기 케이스는 제도 케이스다(1·2호).
const REMERGE_BY_KIND = {
  institution: remergeInstitution,
  project: remergeProject,
  milestone: remergeMilestone,
};

/** 파생 층만 뽑는다. 저작 층은 비교 대상이 아니다. */
function derivedView(caseData) {
  return {
    entities: caseData.entities ?? [],
    relations: caseData.relations ?? [],
    derivation: caseData.derivation ?? null,
  };
}

const stable = (value) => JSON.stringify(value);

/** 어긋난 자리를 ID 단위로 짚는다. "다르다"만 말하면 사람이 손으로 diff를 떠야 한다. */
function diffById(before, after, label) {
  const beforeMap = new Map(before.map((item) => [item.id, item]));
  const afterMap = new Map(after.map((item) => [item.id, item]));
  const added = [...afterMap.keys()].filter((id) => !beforeMap.has(id));
  const removed = [...beforeMap.keys()].filter((id) => !afterMap.has(id));
  const changed = [...afterMap.keys()].filter(
    (id) => beforeMap.has(id) && stable(beforeMap.get(id)) !== stable(afterMap.get(id)),
  );
  if (!added.length && !removed.length && !changed.length) return null;
  return { label, added, removed, changed };
}

export async function checkOne(file, { fix = false } = {}) {
  const casePath = path.join(SAMPLES_DIR, file);
  const existing = JSON.parse(await readFile(casePath, "utf8"));
  const kind = existing.case_kind ?? "institution";
  const remerge = REMERGE_BY_KIND[kind];
  if (!remerge) {
    return { file, status: "unknown_kind", kind };
  }

  const { merged } = await remerge(existing);
  const before = derivedView(existing);
  const after = derivedView(merged);

  const diffs = [
    diffById(before.entities, after.entities, "엔티티"),
    diffById(before.relations, after.relations, "관계"),
  ].filter(Boolean);
  if (stable(before.derivation) !== stable(after.derivation)) {
    diffs.push({ label: "파생 메타", added: [], removed: [], changed: ["derivation"] });
  }

  if (!diffs.length) return { file, status: "current", kind };

  if (fix) {
    // 저작 층은 merged가 이미 보존한다(remerge의 계약). 통째로 쓴다.
    await writeFile(casePath, `${JSON.stringify(merged, null, 1)}\n`);
    return { file, status: "fixed", kind, diffs };
  }
  return { file, status: "stale", kind, diffs };
}

/** 케이스 전부를 검사한다. 테스트가 이걸 불러 같은 판정을 쓴다. */
export async function checkAllCases({ fix = false } = {}) {
  const files = (await readdir(SAMPLES_DIR)).filter((name) => name.endsWith(".case.json")).sort();
  const results = [];
  for (const file of files) {
    try {
      results.push(await checkOne(file, { fix }));
    } catch (error) {
      results.push({ file, status: "error", message: error.message });
    }
  }
  return results;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const results = await checkAllCases({ fix });

  const stale = results.filter((result) => result.status === "stale");
  const fixed = results.filter((result) => result.status === "fixed");
  const errors = results.filter((result) => result.status === "error" || result.status === "unknown_kind");

  for (const result of [...stale, ...fixed]) {
    console.log(`${result.status === "fixed" ? "재파생" : "어긋남"}: ${result.file} (${result.kind})`);
    for (const diff of result.diffs) {
      if (diff.added.length) console.log(`  + ${diff.label} 추가 ${diff.added.length}: ${diff.added.slice(0, 6).join(", ")}${diff.added.length > 6 ? " …" : ""}`);
      if (diff.removed.length) console.log(`  - ${diff.label} 삭제 ${diff.removed.length}: ${diff.removed.slice(0, 6).join(", ")}${diff.removed.length > 6 ? " …" : ""}`);
      if (diff.changed.length) console.log(`  ~ ${diff.label} 변경 ${diff.changed.length}: ${diff.changed.slice(0, 6).join(", ")}${diff.changed.length > 6 ? " …" : ""}`);
    }
  }
  for (const result of errors) {
    console.error(`오류: ${result.file} — ${result.message ?? `알 수 없는 case_kind ${result.kind}`}`);
  }

  console.log(
    `케이스 ${results.length}건 — 최신 ${results.filter((r) => r.status === "current").length}`
    + `${fixed.length ? ` / 재파생 ${fixed.length}` : ""}`
    + `${stale.length ? ` / 어긋남 ${stale.length}` : ""}`
    + `${errors.length ? ` / 오류 ${errors.length}` : ""}`,
  );

  if (errors.length || stale.length) {
    if (stale.length) {
      console.error("구조 층이 원본과 어긋났습니다. --fix 로 재파생하거나 derive-*.mjs --remerge 를 돌리세요.");
    }
    process.exit(1);
  }
}

// 직접 실행할 때만 돈다 — 테스트가 import 해도 process.exit이 터지지 않아야 한다.
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exit(1);
  });
}
