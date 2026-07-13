#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(SCRIPT_DIR, "..", "..");
const DATA_DIR = path.join(REPO_DIR, "web", "data", "institutions");
const AUDIT_DIR = path.join(REPO_DIR, "docs", "audits");
const FROM = numericArg("from", 124);
const TO = numericArg("to", 300);
const DATE = valueArg("date") ?? new Date().toISOString().slice(0, 10);

const PERSONA_PATTERN = /(신청인|청구인|신고자|제보자|민원인|당사자|근로자|사업자|사업주|시행자|주민|시민|국민|환자|소비자|이용자|납세|취득자|양도자|임차|임대인|보호자|학생|교원|수급자|수분양자|입주자|피해자|피신고|피청구|채무자|채권자|외국인투자자|난민신청자|운전자|소유자|후보자|응시자|차주|세대|연구개발기관|대상기관)/u;
const AUTHORITY_ONLY_PATTERN = /(위원회|심의회|법원|재판부|검찰|경찰|국토부|행정청|장관|지자체|공단|공사|기관|센터|관세청|국세청|세무서|시·군·구|시도지사)/u;
const ACTIVE_PERSONA_PATTERN = /(신청인|청구인|신고자|민원인|당사자|납세|취득자|양도자|수분양자|입주 신청자|피해자|채무자|채권자|난민신청자|후보자|응시자|차주)/u;
const ENTRY_PATTERN = /(신청|청구|신고|제출|등록|요청|접수|참여|동의|제안)/u;
const RECEIPT_PATTERN = /(수령|통지|열람|확인|교부|결과|결정서|허가증|등록증|증명)/u;
const CORRECTION_PATTERN = /(보완|보정|재신청|재제출|수정)/u;
const ADVERSE_PATTERN = /(반려|거부|불허|취소|(?<!재)정지|철회|탈락|불합격|제재처분|회수명령|환수결정)/u;
const REMEDY_PATTERN = /(이의|심사청구|심판청구|소송|불복|재심|의견제출|의견청취|청문|열람|진술|항변|소명)/u;

const institutions = fs
  .readdirSync(DATA_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")))
  .filter((item) => item.priority >= FROM && item.priority <= TO)
  .sort((left, right) => left.priority - right.priority);

const results = institutions.map(walkInstitution);
const summary = {
  institutions: results.length,
  passed: results.filter((item) => item.findings.length === 0).length,
  review: results.filter((item) => item.findings.length > 0).length,
  high: results.flatMap((item) => item.findings).filter((item) => item.severity === "high").length,
  medium: results.flatMap((item) => item.findings).filter((item) => item.severity === "medium").length,
  byRule: countBy(results.flatMap((item) => item.findings), (finding) => finding.rule),
};

fs.mkdirSync(AUDIT_DIR, { recursive: true });
const outputPath = path.join(AUDIT_DIR, `persona-walkthrough-${FROM}-${TO}-${DATE}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify({ generatedAt: DATE, range: { from: FROM, to: TO }, summary, results }, null, 2)}\n`);

console.log(`L3 persona walkthrough: ${summary.institutions}개, 통과 ${summary.passed}, 검토 ${summary.review}`);
for (const [rule, count] of Object.entries(summary.byRule).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${rule}: ${count}`);
}
console.log("\n고위험 상위 20:");
for (const item of results
  .filter((result) => result.findings.some((finding) => finding.severity === "high"))
  .sort((left, right) => score(right) - score(left))
  .slice(0, 20)) {
  console.log(`  ${item.priority} ${item.slug}: ${item.findings.map((finding) => finding.rule).join(", ")}`);
}
console.log(`\nreport -> ${path.relative(REPO_DIR, outputPath)}`);

function walkInstitution(institution) {
  const process = institution.process;
  const nodesById = new Map(process.nodes.map((node) => [node.id, node]));
  const stageIndex = new Map(process.stages.map((stage, index) => [stage, index]));
  const outgoing = groupBy(process.edges, (edge) => edge.source);
  const incoming = groupBy(process.edges, (edge) => edge.target);
  const personaLanes = process.lanes.filter(isPersonaLane);
  const personaNodeIds = new Set(
    process.nodes.filter((node) => personaLanes.includes(node.lane)).map((node) => node.id),
  );
  // Generic stakeholder names such as 사업자 or 주민 are not automatically applicants.
  // Treat a lane as active only when its label is explicit or its own nodes contain an entry act.
  const activePersonaLanes = personaLanes.filter((lane) => {
    const laneText = process.nodes.filter((node) => node.lane === lane).map(nodeText).join(" ");
    return ACTIVE_PERSONA_PATTERN.test(lane) || ENTRY_PATTERN.test(laneText);
  });
  const activePersonaNodeIds = new Set(
    process.nodes.filter((node) => activePersonaLanes.includes(node.lane)).map((node) => node.id),
  );
  const findings = [];

  for (const node of process.nodes.filter((item) => item.unverified || item.status === "needs-review")) {
    findings.push({
      rule: "operational-source-pending",
      severity: "medium",
      node: node.id,
      detail: "법률 본문만으로 확정할 수 없는 운영 절차·기준의 공식 출처 확인이 남아 있다.",
    });
  }

  for (const lane of personaLanes) {
    const laneNodes = process.nodes.filter((node) => node.lane === lane);
    if (laneNodes.length < 2) {
      findings.push({
        rule: "persona-thin",
        severity: "medium",
        lane,
        nodes: laneNodes.map((node) => node.id),
        detail: "당사자 레인에 행위 노드가 2개 미만이다.",
      });
    }
    const laneText = laneNodes.map(nodeText).join(" ");
    if (!ENTRY_PATTERN.test(laneText) && !RECEIPT_PATTERN.test(laneText)) {
      findings.push({
        rule: "persona-no-entry-or-receipt",
        severity: "medium",
        lane,
        nodes: laneNodes.map((node) => node.id),
        detail: "당사자의 신청·제출 또는 결과 수령 행위가 보이지 않는다.",
      });
    }
  }

  const personaEntries = process.nodes.filter(
    (node) => activePersonaNodeIds.has(node.id) && ENTRY_PATTERN.test(nodeText(node)),
  );
  const terminals = process.nodes.filter(
    (node) => !(outgoing.get(node.id) ?? []).some((edge) => edge.type === "sequence"),
  );
  if (activePersonaLanes.length > 0 && personaEntries.length === 0) {
    findings.push({
      rule: "normal-no-persona-entry",
      severity: "high",
      detail: "정상 시나리오를 시작할 당사자 신청·제출 노드가 없다.",
    });
  } else if (
    personaEntries.length > 0 &&
    !personaEntries.some((entry) => reachesAny(entry.id, new Set(terminals.map((node) => node.id)), outgoing))
  ) {
    findings.push({
      rule: "normal-no-terminal",
      severity: "high",
      nodes: personaEntries.map((node) => node.id),
      detail: "당사자 진입점에서 종결 결과까지 도달하지 못한다.",
    });
  }

  for (const node of process.nodes.filter((item) => /^(보완|보정|재신청|재제출|수정)/u.test(item.name ?? ""))) {
    const routes = outgoing.get(node.id) ?? [];
    const arrivals = incoming.get(node.id) ?? [];
    const currentStage = stageIndex.get(node.stage) ?? 0;
    const hasReturn = arrivals.some((edge) => {
      const source = nodesById.get(edge.source);
      return edge.type === "loop" || (source && (stageIndex.get(source.stage) ?? currentStage) >= currentStage);
    }) || routes.some((edge) => {
      const target = nodesById.get(edge.target);
      return edge.type === "loop" || (target && (stageIndex.get(target.stage) ?? currentStage) <= currentStage);
    });
    if (!hasReturn) {
      findings.push({
        rule: "correction-no-reentry",
        severity: "high",
        node: node.id,
        detail: "보완·보정 행위 뒤 재심사 또는 이전 단계 복귀 경로가 없다.",
      });
    }
  }

  const adverseNodes = process.nodes.filter((node) => ADVERSE_PATTERN.test(nodeText(node)));
  if (adverseNodes.length > 0) {
    const remedyNodes = process.nodes.filter((node) => REMEDY_PATTERN.test(nodeText(node)));
    if (remedyNodes.length === 0) {
      findings.push({
        rule: "adverse-no-remedy",
        severity: "medium",
        nodes: adverseNodes.map((node) => node.id),
        detail: "불리한 결정은 있으나 의견제출·청문·불복 경로가 도식에 없다.",
      });
    }
  }

  const decisionNodes = process.nodes.filter(
    (node) => !personaNodeIds.has(node.id) && /(결정|처분|허가|승인|지정|선정|등록|인가)/u.test(nodeText(node)),
  );
  const receiptNodes = process.nodes.filter(
    (node) => activePersonaNodeIds.has(node.id) && RECEIPT_PATTERN.test(nodeText(node)),
  );
  if (activePersonaLanes.length > 0 && decisionNodes.length > 0 && receiptNodes.length === 0) {
    findings.push({
      rule: "decision-no-persona-receipt",
      severity: "medium",
      nodes: decisionNodes.map((node) => node.id),
      detail: "기관 결정은 있으나 당사자의 결과 수령·확인 노드가 없다.",
    });
  }

  for (const node of process.nodes) {
    const documents = node.output_documents ?? [];
    if (personaNodeIds.has(node.id) && documents.length === 0) {
      findings.push({
        rule: "persona-no-output-document",
        severity: "medium",
        node: node.id,
        detail: "당사자 행위의 제출·수령 문서가 없다.",
      });
    }
  }

  return {
    priority: institution.priority,
    slug: institution.slug,
    name: institution.name,
    personaLanes,
    activePersonaLanes,
    scenarios: {
      normal: {
        entries: personaEntries.map((node) => node.id),
        terminals: terminals.map((node) => node.id),
      },
      correction: process.nodes.filter((node) => CORRECTION_PATTERN.test(nodeText(node))).map((node) => node.id),
      adverse: adverseNodes.map((node) => node.id),
    },
    findings,
  };
}

function isPersonaLane(lane) {
  if (!PERSONA_PATTERN.test(lane)) return false;
  return !AUTHORITY_ONLY_PATTERN.test(lane) || /(신청인|청구인|신고자|당사자|피해자|사업자|시행자)/u.test(lane);
}

function reachesAny(start, targets, outgoing) {
  const visited = new Set();
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift();
    if (targets.has(node)) return true;
    if (visited.has(node)) continue;
    visited.add(node);
    for (const edge of outgoing.get(node) ?? []) queue.push(edge.target);
  }
  return false;
}

function nodeText(node) {
  return `${node.name ?? ""} ${node.action ?? ""}`;
}

function groupBy(values, keyFor) {
  const grouped = new Map();
  for (const value of values) {
    const key = keyFor(value);
    const bucket = grouped.get(key) ?? [];
    bucket.push(value);
    grouped.set(key, bucket);
  }
  return grouped;
}

function countBy(values, keyFor) {
  const counts = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function score(result) {
  return result.findings.reduce(
    (total, finding) => total + (finding.severity === "high" ? 3 : 1),
    0,
  );
}

function valueArg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function numericArg(name, fallback) {
  const value = Number(valueArg(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
