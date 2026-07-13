#!/usr/bin/env node
/**
 * L0 process audit — mechanical checks beyond validate-data.mjs.
 *
 * validate-data.mjs guards schema/reference integrity; this script hunts
 * CONTENT-error candidates that are still machine-detectable:
 *   1. legal_basis article format (제N조 패턴이 아닌 인용)
 *   2. graph reachability (도달 불가·고아·종결 없음)
 *   3. backward sequence edges (loop가 아닌데 stage를 거슬러 오름)
 *   4. empty lanes/stages, nodes without legal_basis
 *   5. statistical outliers across all institutions (z-score + heuristics)
 *
 * Output: console summary + docs/audits/process-audit-<date>.json
 * (prioritized queue for L1 semantic verification).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(SCRIPT_DIR, "..", "..");
const DATA_DIR = path.join(REPO_DIR, "web", "data", "institutions");
const AUDIT_DIR = path.join(REPO_DIR, "docs", "audits");

// 제12조 / 제12조의3 / 제12조제2항 / 부칙 / 별표1 / 조약 제2082호 — anything else is suspect.
// 조약(서한교환·의정서 등)은 조문 체계가 없어 조약번호 인용이 정식 형식이다.
const ARTICLE_OK = /(제\d+조(의\d+)?|부칙|별표\s*\d*|조약\s*제\d+호|일련번호\s*\d+|(예규|고시|훈령|지침|공고)\s*제[\d-]+호)/;

const files = fs
  .readdirSync(DATA_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

const results = [];
const profiles = [];

for (const file of files) {
  const slug = file.replace(/\.json$/, "");
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  const proc = data.process ?? {};
  const nodes = proc.nodes ?? [];
  const edges = proc.edges ?? [];
  const findings = [];

  // --- 1. legal_basis article format -------------------------------------
  let citationCount = 0;
  let sublawCitations = 0;
  for (const node of nodes) {
    const basis = node.legal_basis ?? [];
    if (basis.length === 0) {
      findings.push({ rule: "no-legal-basis", node: node.id, detail: node.name });
    }
    for (const ref of basis) {
      citationCount += 1;
      if (/시행령|시행규칙|[^법]령$|령\s*\(|규칙$|규정$|규정\s*\(/.test((ref.law ?? "").trim()) || /(임용령|징계령|인사규정)/.test(ref.law ?? "")) sublawCitations += 1;
      const article = ref.article ?? "";
      // unverified: 조문 확정 불가로 fieldVerification에 이관 문서화된 인용 — 감사 제외
      if (ref.unverified === true) continue;
      if (!ARTICLE_OK.test(article)) {
        // 묶음 표기(제2·3조, 제17~19조)는 조문을 인용하되 도구가 못 읽는 형식,
        // 서술형("~ 관련 조문")은 조문 번호 자체가 없는 실질 위반 — 심각도 분리.
        const hasNumber = /제\d+/.test(article);
        findings.push({
          rule: hasNumber ? "article-compound" : "article-descriptive",
          node: node.id,
          detail: `${ref.law} → "${article}"`,
        });
      }
    }
  }

  // --- 2. graph reachability ----------------------------------------------
  const nodeIds = new Set(nodes.map((n) => n.id));
  const adjacency = new Map([...nodeIds].map((id) => [id, []]));
  const incomingSeq = new Map([...nodeIds].map((id) => [id, 0]));
  const outgoingSeq = new Map([...nodeIds].map((id) => [id, 0]));
  const touched = new Set();
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    adjacency.get(edge.source).push(edge.target);
    touched.add(edge.source);
    touched.add(edge.target);
    if (edge.type === "sequence") {
      incomingSeq.set(edge.target, incomingSeq.get(edge.target) + 1);
      outgoingSeq.set(edge.source, outgoingSeq.get(edge.source) + 1);
    }
  }

  for (const id of nodeIds) {
    if (!touched.has(id)) {
      findings.push({ rule: "orphan-node", node: id, detail: "엣지가 하나도 없음" });
    }
  }

  const starts = [...nodeIds].filter((id) => incomingSeq.get(id) === 0);
  const terminals = [...nodeIds].filter((id) => outgoingSeq.get(id) === 0);
  if (terminals.length === 0) {
    findings.push({ rule: "no-terminal", detail: "종결 노드 없음 (모든 노드에 후속 sequence)" });
  }
  const reachable = new Set();
  const queue = [...starts];
  while (queue.length > 0) {
    const id = queue.shift();
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const next of adjacency.get(id) ?? []) queue.push(next);
  }
  for (const id of nodeIds) {
    if (!reachable.has(id) && touched.has(id)) {
      findings.push({ rule: "unreachable-node", node: id, detail: "시작점에서 도달 불가" });
    }
  }

  // --- 3. backward sequence edges ------------------------------------------
  const stageIndex = new Map((proc.stages ?? []).map((s, i) => [s, i]));
  const nodeStage = new Map(nodes.map((n) => [n.id, stageIndex.get(n.stage) ?? -1]));
  for (const edge of edges) {
    if (edge.type !== "sequence") continue;
    const from = nodeStage.get(edge.source);
    const to = nodeStage.get(edge.target);
    if (from !== undefined && to !== undefined && to < from) {
      findings.push({
        rule: "backward-sequence",
        edge: edge.id,
        detail: `${edge.source}(${from}) → ${edge.target}(${to}) — loop 타입이어야 할 후보`,
      });
    }
  }

  // --- 4. empty lanes/stages ------------------------------------------------
  const usedLanes = new Set(nodes.map((n) => n.lane));
  const usedStages = new Set(nodes.map((n) => n.stage));
  for (const lane of proc.lanes ?? []) {
    if (!usedLanes.has(lane)) findings.push({ rule: "empty-lane", detail: lane });
  }
  for (const stage of proc.stages ?? []) {
    if (!usedStages.has(stage)) findings.push({ rule: "empty-stage", detail: stage });
  }

  // --- profile for outlier detection ----------------------------------------
  const loopEdges = edges.filter((e) => e.type === "loop").length;
  const deadlineNodes = nodes.filter((n) => n.deadline).length;
  const confidences = nodes.map((n) => n.confidence).filter((c) => typeof c === "number");
  profiles.push({
    slug,
    nodes: nodes.length,
    edgeRatio: nodes.length ? edges.length / nodes.length : 0,
    deadlineDensity: nodes.length ? deadlineNodes / nodes.length : 0,
    sublawCitations,
    citationCount,
    loopEdges,
    meanConfidence: confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null,
  });

  results.push({
    slug,
    verificationStatus: data.verification?.status ?? "unknown",
    processWarnings: (proc.warnings ?? []).length,
    findings,
  });
}

// --- 5. cross-institution outliers ------------------------------------------
function stats(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return { mean, sd };
}

const metrics = ["nodes", "edgeRatio", "deadlineDensity", "meanConfidence"];
const metricStats = Object.fromEntries(
  metrics.map((m) => [m, stats(profiles.map((p) => p[m]).filter((v) => v !== null))]),
);

for (const profile of profiles) {
  const result = results.find((r) => r.slug === profile.slug);
  for (const metric of metrics) {
    const value = profile[metric];
    if (value === null) continue;
    const { mean, sd } = metricStats[metric];
    if (sd > 0 && Math.abs(value - mean) / sd > 2) {
      result.findings.push({
        rule: "outlier",
        detail: `${metric}=${value.toFixed(2)} (전체 평균 ${mean.toFixed(2)}±${sd.toFixed(2)})`,
      });
    }
  }
  if (profile.loopEdges === 0) {
    result.findings.push({
      rule: "no-loop",
      detail: "loop 엣지 0 — 심사·보완 반려 경로가 정말 없는 제도인지 확인",
    });
  }
  if (profile.sublawCitations === 0) {
    result.findings.push({
      rule: "no-sublaw",
      detail: "시행령·시행규칙 인용 0 — 직접규정형 제도인지 확인 (위임형이면 누락)",
    });
  }
}

// --- prioritized queue --------------------------------------------------------
const LOW_SEVERITY = new Set(["no-sublaw", "no-loop", "article-compound"]);
for (const result of results) {
  result.score =
    (result.verificationStatus === "needs-review" ? 3 : 0) +
    Math.min(result.processWarnings, 3) +
    result.findings.filter((f) => !LOW_SEVERITY.has(f.rule)).length * 2 +
    result.findings.filter((f) => LOW_SEVERITY.has(f.rule)).length;
}
results.sort((a, b) => b.score - a.score);

const dateArg = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const stamp = dateArg ?? new Date().toISOString().slice(0, 10);
fs.mkdirSync(AUDIT_DIR, { recursive: true });
const outPath = path.join(AUDIT_DIR, `process-audit-${stamp}.json`);
fs.writeFileSync(
  outPath,
  JSON.stringify({ generatedAt: stamp, metricStats, results }, null, 2) + "\n",
);

const withFindings = results.filter((r) => r.findings.length > 0);
const ruleCounts = {};
for (const r of results) {
  for (const f of r.findings) ruleCounts[f.rule] = (ruleCounts[f.rule] ?? 0) + 1;
}
console.log(`audit: ${results.length}개 제도, 발견 ${withFindings.length}개 제도 / 규칙별:`);
for (const [rule, count] of Object.entries(ruleCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${rule}: ${count}`);
}
console.log("\n우선순위 상위 15:");
for (const r of results.slice(0, 15)) {
  console.log(
    `  [${String(r.score).padStart(2)}] ${r.slug} (${r.verificationStatus}, warnings ${r.processWarnings}, findings ${r.findings.length})`,
  );
}
console.log(`\nreport -> ${path.relative(REPO_DIR, outPath)}`);
