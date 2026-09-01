#!/usr/bin/env node
// 인용문이 조문 원문인가, 아니면 조문 제목·스텁인가.
//
// 발견 경위: R2 17종의 단계 결정 위상을 조문 근거로 판정하려 했더니 227단계 중 169개가
// "권한자를 읽을 수 없음"으로 나왔다. 에이전트가 회피한 것이 아니라 legal_basis[].text에
// 조문 원문이 아니라 **조문 제목**("분산에너지사업의 등록")이나 **스텁**("…제13조제1항에
// 따른 절차")이 들어 있었다.
//
// 왜 지금까지 안 걸렸나: 준비도의 법제처 대조는 **조문 번호가 실재하는가**를 본다
// (`article_references: 36, verified_references: 36`). 인용문이 그 조문의 원문인지는
// 보지 않는다. 원칙 8의 한 겹 아래 층이다 —
//   조문이 있다 ≠ 절차가 그 조문의 절차다 ≠ **인용문이 그 조문의 문언이다**
//
//   npm run check:basis-text            # 요약
//   node scripts/check-basis-text.mjs --list        # 제도별
//   node scripts/check-basis-text.mjs --r2          # R2 제도만 (등급 검토용)
//   node scripts/check-basis-text.mjs --json
//
// 이 스크립트는 등급을 내리지 않는다. 세고 드러낼 뿐이다 — 인용문 없이도 조문 번호는
// 검증돼 있어 사람이 원문을 찾아갈 수는 있다. 등급에 반영할지는 사람이 정한다.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSTITUTIONS = join(WEB, "data", "institutions");

// "국가연구개발혁신법 제13조제1항에 따른 절차" — 조문을 가리키기만 하고 문언이 없다.
const STUB = /에 따른 (절차|사항|규정|기준|조치)\s*$/;
// 조문 문언이면 서술어로 끝난다. 제목은 명사구다.
const PREDICATE = /(한다|하여야|할 수 있다|해야|된다|이다|없다|같다|따른다)/;

export function classifyBasis(basis) {
  const text = String(basis?.text ?? "").trim();
  if (!text) return "empty";
  if (STUB.test(text)) return "stub";
  // article "제8조(분산에너지사업의 등록)" 의 괄호 안과 text가 같으면 제목을 복사한 것이다.
  const caption = String(basis?.article ?? "").match(/\(([^)]+)\)/);
  if (caption && text === caption[1]) return "title-only";
  if (text.length < 26 && !PREDICATE.test(text)) return "title-like";
  return "text";
}

export function inspectInstitution(institution) {
  const counts = { text: 0, stub: 0, "title-only": 0, "title-like": 0, empty: 0 };
  const weakNodes = [];
  for (const node of institution.process?.nodes ?? []) {
    const bases = node.legal_basis ?? [];
    let quoted = 0;
    for (const basis of bases) {
      const kind = classifyBasis(basis);
      counts[kind] += 1;
      if (kind === "text") quoted += 1;
    }
    // 인용문이 하나도 원문이 아닌 노드 — 이 노드만 보고는 조문이 뭐라 하는지 알 수 없다.
    if (bases.length > 0 && quoted === 0) weakNodes.push(node.id);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    slug: institution.slug,
    level: institution.process?.agent_readiness?.level ?? null,
    total,
    quoted: counts.text,
    coverage: total ? counts.text / total : 1,
    counts,
    weak_nodes: weakNodes,
    node_count: institution.process?.nodes?.length ?? 0,
  };
}

export function scan() {
  const rows = [];
  for (const file of readdirSync(INSTITUTIONS).filter((f) => f.endsWith(".json"))) {
    let institution;
    try {
      institution = JSON.parse(readFileSync(join(INSTITUTIONS, file), "utf8"));
    } catch {
      continue;
    }
    if (!institution.slug || !institution.process) continue;
    rows.push(inspectInstitution(institution));
  }
  return rows.sort((a, b) => a.coverage - b.coverage);
}

function main() {
  const rows = scan();
  const args = process.argv.slice(2);
  const only = args.includes("--r2") ? rows.filter((r) => r.level === "R2") : rows;

  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ checked_at: null, rows: only }, null, 1)}\n`);
    return;
  }

  const totals = only.reduce((acc, r) => {
    for (const [kind, n] of Object.entries(r.counts)) acc[kind] = (acc[kind] ?? 0) + n;
    return acc;
  }, {});
  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  const quoted = totals.text ?? 0;

  if (args.includes("--list")) {
    for (const row of only) {
      if (row.coverage >= 1) continue;
      const pct = Math.round(row.coverage * 100);
      console.log(`${row.slug.padEnd(50)} ${String(quotedLabel(row)).padStart(9)} ${String(pct).padStart(3)}%  ${row.level ?? "-"}  약한노드 ${row.weak_nodes.length}/${row.node_count}`);
    }
    console.log("");
  }

  console.log(`인용 ${grand}건 중 조문 원문 ${quoted}건 (${Math.round((quoted / grand) * 100)}%)`);
  console.log(`  스텁 ${totals.stub ?? 0} · 제목만 ${totals["title-only"] ?? 0} · 제목형 ${totals["title-like"] ?? 0} · 빈값 ${totals.empty ?? 0}`);
  const weak = only.filter((r) => r.coverage < 0.5);
  console.log(`원문 비율 50% 미만 제도 ${weak.length} / ${only.length}`);
  const r2weak = weak.filter((r) => r.level === "R2");
  if (r2weak.length) {
    console.log(`\n⚠ R2인데 인용문 절반 이상이 원문이 아닌 제도 ${r2weak.length}종 — 준비도의 법제처 대조는`);
    console.log("  조문 번호 실재만 보므로 이 결함을 통과시킨다. 등급 반영 여부는 사람이 정한다.");
    for (const row of r2weak) {
      console.log(`  · ${row.slug.padEnd(48)} 원문 ${row.quoted}/${row.total}  권한자 못 읽는 노드 ${row.weak_nodes.length}/${row.node_count}`);
    }
  }
}

function quotedLabel(row) {
  return `${row.quoted}/${row.total}`;
}

if (process.argv[1] && process.argv[1].endsWith("check-basis-text.mjs")) main();
