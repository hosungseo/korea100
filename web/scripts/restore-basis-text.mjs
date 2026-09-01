#!/usr/bin/env node
// legal_basis[].text를 법령·행정규칙 원문으로 교체한다.
//
// 왜 스크립트인가: 같은 일을 에이전트에게 시켰더니 요약하고, 항을 빠뜨리고,
// "(각 호는 고시 원문 참조)" 같은 편집자 주를 조문 원문 자리에 만들어 넣었다.
// 요약할 수 있는 주체가 하면 요약한다. 스크립트는 API가 준 문자열을 그대로 옮기거나
// 아무것도 안 하거나 둘 중 하나다.
//
//   node scripts/restore-basis-text.mjs <slug>            # 적용
//   node scripts/restore-basis-text.mjs <slug> --dry-run  # 무엇이 바뀌는지만
//
// 규칙
// - 조문을 못 찾거나 항을 못 떼면 **건드리지 않는다.** 원본 유지 + 사유 보고.
// - 이미 원문인 항목(classifyBasis === "text")은 그대로 둔다. 덮어쓰면 사람이
//   손으로 다듬은 인용이 날아간다.
// - 대조일에 시행 중인 판만 쓴다. 시행예정 판이 섞여 오면 버린다(원칙 5).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveLawGoKrOc } from "./lib/law-go-kr-oc.mjs";
import { resolveEffectiveLawVersion, fetchEffectiveLawPayload, parseLawArticles } from "./lib/law-service.mjs";
import { fetchAdmRulByName, findArticle as findAdmRulArticle } from "./lib/admrul-service.mjs";
import { classifyBasis } from "./check-basis-text.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const AS_OF = "2026-09-02";

/** "제13조제1항·제2항" → { articles: ["제13조"], paragraphs: [1, 2] } */
export function parseReference(reference) {
  const text = String(reference ?? "");
  const articles = [...text.matchAll(/제\d+조(?:의\d+)?/gu)].map((m) => m[0]);
  const paragraphs = [...text.matchAll(/제(\d+)항/gu)].map((m) => Number(m[1]));
  return { articles: [...new Set(articles)], paragraphs: [...new Set(paragraphs)] };
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";

/**
 * 조문 본문에서 지정한 항만 떼어 낸다.
 * 항 기호를 못 찾으면 null을 돌려준다 — 통째로 넣어 "제1항"이라 적고 조 전체를
 * 인용하는 일이 없게 하려는 것이다.
 */
export function extractParagraphs(content, paragraphs) {
  if (!paragraphs.length) return content;
  const marks = paragraphs.map((n) => CIRCLED[n - 1]).filter(Boolean);
  if (marks.length !== paragraphs.length) return null;
  const out = [];
  for (const mark of marks) {
    const start = content.indexOf(mark);
    if (start === -1) return null;
    // 다음 항 기호까지. 없으면 끝까지.
    let end = content.length;
    for (const next of CIRCLED) {
      const at = content.indexOf(next, start + 1);
      if (at > start && at < end) end = at;
    }
    out.push(content.slice(start, end).trim());
  }
  return out.join(" ");
}

async function loadSources(institution) {
  const oc = resolveLawGoKrOc();
  const byLaw = new Map();
  const problems = [];
  for (const source of institution.verification?.sources ?? []) {
    if (source.sourceType === "admin-rule" || /고시|훈령|예규/u.test(source.kind ?? "")) {
      const snapshot = await fetchAdmRulByName(source.officialName ?? source.law, { asOf: AS_OF, oc });
      if (!snapshot) {
        problems.push(`${source.law}: 행정규칙 본문을 못 받았습니다`);
        continue;
      }
      byLaw.set(source.law, { kind: "admrul", effectiveOn: snapshot.effectiveOn, articles: snapshot.articles });
      continue;
    }
    if (!source.lawId) {
      problems.push(`${source.law}: lawId가 없어 조회할 수 없습니다`);
      continue;
    }
    const version = await resolveEffectiveLawVersion(source.lawId, {
      oc, asOf: AS_OF, officialName: source.officialName ?? source.law,
    });
    if (!version) {
      problems.push(`${source.law}: ${AS_OF} 기준 시행본을 못 찾았습니다`);
      continue;
    }
    // fetchLawArticles는 target=law라 최신 공포본을 준다. 시행본은 이 경로다.
    const payload = await fetchEffectiveLawPayload(version.mst, version.effectiveOn, { oc });
    // parseLawArticles는 Map<label, {article,title,text}>를 돌려준다(행정규칙 파서와 모양이 다르다).
    // 여기서 한 모양으로 맞춰 둔다 — 아래 조회 코드가 두 경로를 구분하지 않도록.
    byLaw.set(source.law, {
      kind: "law",
      effectiveOn: version.effectiveOn,
      articles: [...parseLawArticles(payload).values()].map((a) => ({
        article: String(a.article).startsWith("제") ? String(a.article) : `제${a.article}조`,
        title: a.title ?? null,
        content: String(a.text ?? ""),
      })),
    });
  }
  return { byLaw, problems };
}

function findArticleIn(source, reference) {
  if (source.kind === "admrul") return findAdmRulArticle(source.articles, reference);
  const match = String(reference).match(/제\d+조(의\d+)?/u);
  if (!match) return null;
  return source.articles.find((a) => a.article === match[0]) ?? null;
}

/**
 * 저장된 인용문이 지금 API가 주는 원문과 **글자까지 같은지** 되대조한다.
 *
 * 앞 라운드에서 에이전트가 요약·절단·편집자 주를 넣었고 그것을 다른 에이전트가
 * 읽어 잡아냈다. 그 일을 사람도 에이전트도 아닌 대조가 하게 만든다.
 * 공백만 정규화하고 나머지는 완전 일치를 요구한다.
 */
export async function verify(institution) {
  const { byLaw, problems } = await loadSources(institution);
  const errors = [];
  const warnings = [];
  let checked = 0;

  // 개정 표기는 조문 본문이 아니라 이력 주석이다. 인용에서 빼는 것이 정상이라
  // 대조에서도 양쪽을 지운다. 공백·중점만 정규화하고 나머지는 건드리지 않는다.
  const norm = (value) => String(value ?? "")
    .replace(/<(개정|신설|삭제|전문개정|본조신설|제목개정)[^>]*>/gu, " ")
    .replace(/[ㆍ·]/gu, "·")
    .replace(/\s+/gu, " ")
    .trim();

  for (const node of institution.process?.nodes ?? []) {
    for (const basis of node.legal_basis ?? []) {
      const source = byLaw.get(basis.law);
      if (!source) continue;
      const { articles, paragraphs } = parseReference(basis.article);
      if (!articles.length) continue;

      // 라벨이 가리키는 조문 전체를 후보 본문으로 삼는다. 항 지정이 있으면 그 항도
      // 후보에 넣는다 — 어느 쪽으로 인용했든 원문에서 온 것이면 통과해야 한다.
      const pool = [];
      let missing = null;
      for (const reference of articles) {
        const found = findArticleIn(source, reference);
        if (!found) { missing = reference; break; }
        pool.push(norm(found.content));
        if (articles.length === 1 && paragraphs.length) {
          const piece = extractParagraphs(found.content, paragraphs);
          if (piece) pool.push(norm(piece));
        }
      }
      if (missing) {
        errors.push({ node: node.id, article: basis.article, reason: `${missing}을 시행본에서 못 찾음` });
        continue;
      }
      checked += 1;
      const stored = norm(basis.text);
      if (!stored) continue;

      const haystack = pool.join(" ");
      // 핵심 보증: 저장된 인용문은 원문 안에 **그대로** 있어야 한다.
      // 요약·의역·편집자 주는 여기서 걸린다. 부분 인용은 통과한다(그건 별개 문제다).
      if (!haystack.includes(stored)) {
        errors.push({
          node: node.id, article: basis.article,
          reason: "원문에 없는 문장 — 요약·의역·창작 의심",
          stored: stored.slice(0, 130),
          source: haystack.slice(0, 130),
        });
        continue;
      }
      // 라벨은 조문 전체인데 일부만 인용한 경우. 틀린 인용은 아니지만 라벨이 과장이다.
      const whole = norm(pool[0]);
      if (!paragraphs.length && articles.length === 1 && stored.length < whole.length * 0.6) {
        warnings.push({
          node: node.id, article: basis.article,
          reason: `라벨은 조문 전체인데 인용은 ${Math.round((stored.length / whole.length) * 100)}%만 담음`,
        });
      }
    }
  }
  return { checked, errors, warnings, problems };
}

export async function restore(institution, { dryRun = false } = {}) {
  const { byLaw, problems } = await loadSources(institution);
  const changes = [];
  const skipped = [];

  const norm = (value) => String(value ?? "")
    .replace(/<(개정|신설|삭제|전문개정|본조신설|제목개정)[^>]*>/gu, " ")
    .replace(/[ㆍ·]/gu, "·").replace(/\s+/gu, " ").trim();

  for (const node of institution.process?.nodes ?? []) {
    for (const basis of node.legal_basis ?? []) {
      const source = byLaw.get(basis.law);
      if (!source) {
        skipped.push(`${node.id} ${basis.law} ${basis.article}: 출처를 못 받음`);
        continue;
      }
      const { articles, paragraphs } = parseReference(basis.article);
      if (!articles.length) {
        skipped.push(`${node.id} ${basis.article}: 조문 번호를 읽을 수 없음`);
        continue;
      }
      const parts = [];
      let failed = null;
      for (const reference of articles) {
        const found = findArticleIn(source, reference);
        if (!found) { failed = `${reference} 없음`; break; }
        // 항 지정은 조문이 하나일 때만 적용한다. "제18조·제21조제3항"처럼 섞이면
        // 어느 조의 항인지 알 수 없으므로 손대지 않는다.
        const piece = articles.length === 1 && paragraphs.length
          ? extractParagraphs(found.content, paragraphs)
          : found.content;
        if (piece == null) { failed = `${reference} 항(${paragraphs.join(",")}) 분리 실패`; break; }
        parts.push(piece.trim());
      }
      if (failed) {
        skipped.push(`${node.id} ${basis.article}: ${failed}`);
        continue;
      }
      const next = parts.join("\n").replace(/\s+$/u, "");
      if (!next || next === basis.text) continue;
      // 이미 원문인 항목은 건드리지 않는다 — 사람이 손으로 다듬은 인용을 지우지 않기 위해서다.
      // 단 "원문처럼 보이지만 원문 안에 없는" 것은 예외다. 괄호 한정구가 빠졌거나
      // 각 호가 통째로 잘린 인용이 여기 해당하고, 그건 원문이 아니라 절단본이다.
      const wholeSource = norm(parts.join("\n"));
      if (classifyBasis(basis) === "text" && wholeSource.includes(norm(basis.text))) continue;
      changes.push({ node: node.id, law: basis.law, article: basis.article, before: basis.text, after: next });
      if (!dryRun) basis.text = next;
    }
  }
  return { changes, skipped, problems, sources: [...byLaw.entries()].map(([law, s]) => ({ law, kind: s.kind, effectiveOn: s.effectiveOn, articles: s.articles.length })) };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const verifyOnly = args.includes("--verify");
  const slugs = args.filter((a) => !a.startsWith("--"));
  if (!slugs.length) {
    console.error("사용법: node scripts/restore-basis-text.mjs <slug>… [--dry-run]");
    process.exit(1);
  }
  for (const slug of slugs) {
    const path = join(WEB, "data", "institutions", `${slug}.json`);
    const raw = readFileSync(path, "utf8");
    const indent = (raw.match(/\n(\s+)"/) ?? [null, "  "])[1].length;
    const institution = JSON.parse(raw);

    if (verifyOnly) {
      const result = await verify(institution);
      console.log(`\n## ${slug} — 되대조 ${result.checked}건 · 오류 ${result.errors.length} · 경고 ${result.warnings.length}`);
      for (const problem of result.problems) console.error(`   ✖ ${problem}`);
      for (const bad of result.errors) {
        console.error(`   ✖ [${bad.node}] ${bad.article}: ${bad.reason}`);
        if (bad.stored) console.error(`      저장: ${bad.stored}\n      원문: ${bad.source}`);
      }
      for (const warn of result.warnings) console.log(`   · [${warn.node}] ${warn.article}: ${warn.reason}`);
      if (result.errors.length) process.exitCode = 1;
      else console.log("   인용문 전건이 원문 안에 그대로 있습니다");
      continue;
    }

    const report = await restore(institution, { dryRun });

    console.log(`\n## ${slug}`);
    for (const source of report.sources) console.log(`   출처 ${source.law} (${source.kind}) 시행 ${source.effectiveOn} · 조문 ${source.articles}`);
    for (const problem of report.problems) console.error(`   ✖ ${problem}`);
    console.log(`   교체 ${report.changes.length}건 · 건드리지 않음 ${report.skipped.length}건`);
    for (const skip of report.skipped) console.error(`     · ${skip}`);
    if (!dryRun && report.changes.length) {
      writeFileSync(path, `${JSON.stringify(institution, null, indent)}\n`);
    }
  }
  if (dryRun) console.log("\n(dry-run — 저장하지 않았습니다)");
}

if (process.argv[1] && process.argv[1].endsWith("restore-basis-text.mjs")) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
