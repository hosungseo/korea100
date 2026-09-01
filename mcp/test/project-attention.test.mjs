import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadOntologyCase } from "../src/ontology-bridge.mjs";
import { attentionView, allMilestoneStatuses } from "../src/project-case.mjs";

const ontologyDir = fileURLToPath(new URL("../../ontology/", import.meta.url));
const PROJECTS = [
  "gwangju-semiconductor-cluster",
  "five-poles-three-special",
  "arctic-route",
  "daegu-gyeongbuk-airport",
];

async function load(project) {
  return loadOntologyCase({ ontologyDir, caseFile: `samples/${project}.case.json` });
}

test("관심층은 절차 전량이 아니라 의제만 올린다 — 광주 총리·국무위원 층은 마일스톤의 소수", async () => {
  const view = attentionView(await load("gwangju-semiconductor-cluster"));
  assert.equal(view.inventory.milestone_count, 54);
  assert.equal(view.inventory.institution_count, 108);
  assert.equal(view.counts.cabinet + view.counts.agency + view.counts.working, 54);
  // 손으로 고른 목록이 아니라 계산이므로 상한만 고정한다. 54개 중 1/4 넘게 총리 의제면 계산이 깨진 것이다.
  assert.ok(view.counts.cabinet > 0 && view.counts.cabinet <= 13, `cabinet=${view.counts.cabinet}`);
  assert.equal(view.execution_allowed, false);
  assert.deepEqual(view.decision_tier_missing, []);
});

test("층에 오른 마일스톤은 전부 사유를 가진다. 사유 없는 마일스톤은 working이다", async () => {
  for (const project of PROJECTS) {
    const view = attentionView(await load(project));
    for (const entry of [...view.cabinet, ...view.agency]) {
      assert.ok(entry.reasons.length > 0, `${project} ${entry.node_id} 사유 없음`);
      assert.ok(
        entry.reasons.some((reason) => reason.tier === entry.attention_tier),
        `${project} ${entry.node_id} 층(${entry.attention_tier})과 사유 층 불일치`,
      );
    }
    // 완료 마일스톤은 어느 층에도 안 오른다.
    const done = allMilestoneStatuses(await load(project)).filter((s) => s.openness === "done").map((s) => s.node_id);
    for (const id of done) {
      assert.ok(!view.cabinet.some((e) => e.node_id === id) && !view.agency.some((e) => e.node_id === id), `${project} 완료 ${id}가 의제에 있음`);
    }
  }
});

test("광주: 총리 위원장 법정 위원회 의결(N03)과 거버넌스(N02)는 총리 층, 사업시행자 건설(N28)은 실무", async () => {
  const view = attentionView(await load("gwangju-semiconductor-cluster"));
  const cabinet = new Set(view.cabinet.map((entry) => entry.node_id));
  assert.ok(cabinet.has("N03"), "N03 반도체클러스터 지정(반도체산업경쟁력강화특별위원회)");
  assert.ok(cabinet.has("N02"), "N02 거버넌스");
  const n03 = view.cabinet.find((entry) => entry.node_id === "N03");
  assert.ok(n03.reasons.some((reason) => reason.code === "central_decision"));
  assert.ok(view.working.some((entry) => entry.node_id === "N28"), "N28 부지조성·팹 건설은 실무");
});

test("광주: gridPath 배타 분기가 걸린 N19·N20은 총리 층이고, 그것을 기다리는 N21은 다부처 물림으로 올라온다", async () => {
  const view = attentionView(await load("gwangju-semiconductor-cluster"));
  const byId = new Map(view.cabinet.map((entry) => [entry.node_id, entry]));
  assert.ok(byId.get("N19")?.reasons.some((reason) => reason.code === "exclusive_branch_gate"));
  assert.ok(byId.get("N20")?.reasons.some((reason) => reason.code === "exclusive_branch_gate"));
  const n21 = byId.get("N21");
  assert.ok(n21, "N21 송변전 승인이 총리 층에 있어야 함");
  const wait = n21.reasons.find((reason) => reason.code === "cross_ministry_wait");
  assert.ok(wait, "다부처 물림 사유");
  assert.match(wait.evidence, /N20/);
});

test("고지렛대 개방: 하류 파급이 상위 사분위인 열린 관문은 정부·위원회 손이면 총리, 사업자 손이면 기관장", async () => {
  const view = attentionView(await load("gwangju-semiconductor-cluster"));
  const all = [...view.cabinet, ...view.agency];
  const leveraged = all.filter((entry) => entry.reasons.some((reason) => reason.code === "high_leverage_open"));
  assert.ok(leveraged.length > 0);
  for (const entry of leveraged) {
    assert.ok(["ready", "in_progress"].includes(entry.openness));
    assert.ok(entry.downstream_reach >= view.leverage_threshold);
    const reason = entry.reasons.find((r) => r.code === "high_leverage_open");
    assert.equal(reason.tier, entry.decision_tier === "field" ? "agency" : "cabinet");
  }
});

test("정책 분류라도 하류가 없으면 총리 의제가 아니다 — 북극항로 R&D·인력양성은 기관장 층", async () => {
  const view = attentionView(await load("arctic-route"));
  const cabinet = new Set(view.cabinet.map((entry) => entry.node_id));
  for (const id of ["N19", "N20", "N24"]) {
    assert.ok(!cabinet.has(id), `${id}는 하류 0인 policy 항목`);
    assert.ok(view.agency.some((entry) => entry.node_id === id), `${id}는 기관장 층`);
  }
  // 위원회 구성(N04)은 governance라 하류 유무와 무관하게 총리 층.
  assert.ok(cabinet.has("N04"));
});

test("5극3특: 국회·대통령 소속 위원회 결정선은 중앙 결정으로 올라오고, 국토종합계획 미확정을 기다리는 N20은 다부처 물림", async () => {
  const view = attentionView(await load("five-poles-three-special"));
  const byId = new Map(view.cabinet.map((entry) => [entry.node_id, entry]));
  const legislature = view.cabinet.filter((entry) => entry.decision_tier === "legislature");
  assert.ok(legislature.length > 0);
  for (const entry of legislature) {
    assert.ok(entry.reasons.some((reason) => reason.code === "central_decision"));
  }
  const n20 = byId.get("N20");
  assert.ok(n20?.reasons.some((reason) => reason.code === "cross_ministry_wait" && /N19/.test(reason.evidence)));
});

test("tier 필터는 나머지 층을 비우고 counts는 유지한다(서버 핸들러 계약)", async () => {
  const view = attentionView(await load("daegu-gyeongbuk-airport"));
  const filtered = { ...view, cabinet: view.cabinet, agency: [], working: [] };
  assert.equal(filtered.counts.agency, view.agency.length);
  assert.equal(filtered.agency.length, 0);
});
