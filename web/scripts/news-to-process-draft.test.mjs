import test from "node:test";
import assert from "node:assert/strict";
import {
  candidateToProcessDraft,
  candidatesToProcessDrafts,
  evaluateProcessCandidacy,
  selectProcessWorthyCandidates,
} from "./lib/news-to-process-draft.mjs";
import { renderProcessDraftSvg } from "./lib/render-process-draft-svg.mjs";
import { renderProcessDraftPortraitSvg, PORTRAIT } from "./lib/render-process-draft-portrait.mjs";

test("rejects legislative package news like multi-bill National Assembly passage", () => {
  const ev = evaluateProcessCandidacy({
    title: "기후에너지환경법안 7개 국회 통과…재생에너지 대전환 속도",
    body: "관련 법안이 국회를 통과했다.",
  });
  assert.equal(ev.ok, false);
  assert.equal(ev.reason, "legislative-passage");
});

test("rejects fact-check explainers", () => {
  const ev = evaluateProcessCandidacy({
    title: "[사실은 이렇습니다] 농작물보험은 실제 생산량과 소득 감소 중심으로 보상하고 있습니다.",
    body: "보상 기준을 설명합니다.",
  });
  assert.equal(ev.ok, false);
  assert.equal(ev.reason, "fact-check-explain");
});

test("accepts procedure-like fast-track application news", () => {
  const ev = evaluateProcessCandidacy({
    title: "산업위기지역 대응 빨라진다…특별지역 신청 '패스트트랙' 신설",
    body: "지자체가 특별지역 지정을 신청하면 심사를 빠르게 진행한다.",
  });
  assert.equal(ev.ok, true);
});

test("selectProcessWorthyCandidates skips bill-passage and keeps procedure items", () => {
  const selected = selectProcessWorthyCandidates([
    { title: "기후에너지환경법안 7개 국회 통과", body: "통과" },
    { title: "특별지역 신청 패스트트랙 신설", body: "신청 후 심사" },
    { title: "나토 표준 제공·관리 지침 제정", body: "기업이 표준 제공을 신청하고 관리받는 절차" },
  ], { limit: 5 });
  assert.equal(selected.length, 2);
  assert.match(selected[0].title, /패스트트랙|나토/);
});

test("builds draft process with nodes/edges and news-draft status", () => {
  const draft = candidateToProcessDraft({
    title: "산업용 전기요금 지역별 차등 인가",
    body: "신청 후 심사·인가를 거쳐 시행한다. 이의신청 가능.",
    url: "https://example.com/a",
    sourceName: "정책브리핑",
    sourceType: "policy_briefing",
    publishedAt: "2026-09-01",
    score: 1,
  }, { index: 0, runDate: "2026-09-01" });

  assert.equal(draft.status, "news-draft");
  assert.ok(draft.process.nodes.length >= 4);
  assert.equal(draft.process.edges.length, draft.process.nodes.length - 1);
  assert.equal(draft.verification.status, "unverified-news-draft");
  assert.match(draft.slug, /^news-draft-2026-09-01-/);
});

test("renders svg with draft banner", () => {
  const drafts = candidatesToProcessDrafts([{
    title: "테스트 제도 신청 심사 허가",
    body: "신청 심사 허가 절차 신설",
    url: "https://example.com/b",
  }], { limit: 1, runDate: "2026-09-01" });
  assert.equal(drafts.length, 1);
  const svg = renderProcessDraftSvg(drafts[0]);
  assert.match(svg, /<svg /);
  assert.match(svg, /NEWS-DRAFT/);
  assert.match(svg, /P01/);
});

test("portrait svg is 1800x2400 news-draft board", () => {
  const drafts = candidatesToProcessDrafts([{
    title: "세로형 제도 신청 심사 허가",
    body: "신청 심사 허가 시행 절차",
    url: "https://example.com/c",
  }], { limit: 1, runDate: "2026-09-01" });
  const svg = renderProcessDraftPortraitSvg(drafts[0]);
  assert.match(svg, new RegExp(`width=\\"${PORTRAIT.width}\\"`));
  assert.match(svg, new RegExp(`height=\\"${PORTRAIT.height}\\"`));
  assert.match(svg, /NEWS-DRAFT/);
});
