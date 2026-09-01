import test from "node:test";
import assert from "node:assert/strict";
import {
  institutionCandidateToProcessDraft,
  institutionCandidatesToProcessDrafts,
  selectInstitutionCandidatesForDraft,
  hasClearLegalBasis,
} from "./lib/institution-candidate-to-process-draft.mjs";
import { renderProcessDraftPortraitSvg, PORTRAIT } from "./lib/render-process-draft-portrait.mjs";

test("builds draft from institution candidate name/basis not headline", () => {
  const draft = institutionCandidateToProcessDraft({
    name: "산업위기대응특별지역 지정·지원",
    basis: "지역 산업위기대응 특별법",
    ministry: "산업통상자원부",
    why: "지정 신청→심의→지정→지원 절차",
    status: "proposed",
    articles: [{ title: "패스트트랙 신설 기사", url: "https://example.com/x" }],
  }, { index: 0, runDate: "2026-09-01" });

  assert.equal(draft.name, "산업위기대응특별지역 지정·지원");
  assert.equal(draft.status, "institution-draft");
  assert.match(draft.slug, /^inst-draft-/);
  assert.equal(draft.sourceInstitutionCandidate.basis, "지역 산업위기대응 특별법");
  assert.ok(draft.process.nodes.length >= 4);
  assert.notEqual(draft.name, draft.sourceNews?.title);
});

test("selects proposed institutions from queue with clear basis only", () => {
  const selected = selectInstitutionCandidatesForDraft({
    candidates: [
      { name: "A", status: "accepted", basis: "행정규제기본법" },
      { name: "B 제도", status: "proposed", basis: "행정규제기본법 제7조", why: "신청 심사", articles: [{}] },
      { name: "C 제도", status: "proposed", basis: "확인 필요" },
      { name: "국방 표준화(국방규격·국제표준 제공·관리)", status: "proposed", basis: "방위사업법·훈령" },
    ],
  }, { limit: 5, statuses: ["proposed"] });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].name, "B 제도");
});

test("portrait render works for institution draft", () => {
  const drafts = institutionCandidatesToProcessDrafts({
    candidates: [{
      name: "규제영향분석·규제심사",
      basis: "행정규제기본법 제7조·제10조",
      ministry: "국무조정실",
      why: "규제영향분석서 작성 후 규제심사 요청 절차",
      status: "proposed",
    }],
  }, { limit: 1, runDate: "2026-09-01", statuses: ["proposed"] });
  assert.equal(drafts.length, 1);
  const svg = renderProcessDraftPortraitSvg(drafts[0]);
  assert.match(svg, new RegExp(`width=\\"${PORTRAIT.width}\\"`));
  assert.match(svg, /INSTITUTION-DRAFT|institution-draft|규제영향분석/);
});

test("hasClearLegalBasis rejects defense-standardization and missing basis", () => {
  assert.equal(hasClearLegalBasis({
    name: "국방 표준화(국방규격·국제표준 제공·관리)",
    basis: "방위사업법 제26조·훈령·나토 지침",
  }), false);
  assert.equal(hasClearLegalBasis({
    name: "노후 공공청사 복합개발 사업계획 승인",
    basis: "확인 필요 — 제정안",
  }), false);
  assert.equal(hasClearLegalBasis({
    name: "규제영향분석·규제심사",
    basis: "행정규제기본법 제7조·제10조",
  }), true);
});
