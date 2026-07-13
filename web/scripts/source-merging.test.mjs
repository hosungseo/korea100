import test from "node:test";
import assert from "node:assert/strict";
import { filterUnresolvedAgainstSources, mergeExistingSources } from "./lib/source-merging.mjs";

test("preserves curated metadata while refreshing generated source fields", () => {
  const sources = mergeExistingSources(
    [{ sourceType: "admin-rule", officialName: "방위사업관리규정", adminRuleSerial: "new" }],
    [{ sourceType: "admin-rule", officialName: "방위사업관리규정", adminRuleSerial: "old", issueNo: "제969호" }],
  );

  assert.deepEqual(sources, [
    {
      sourceType: "admin-rule",
      officialName: "방위사업관리규정",
      adminRuleSerial: "new",
      issueNo: "제969호",
    },
  ]);
});

test("keeps a manually linked supporting source", () => {
  const supporting = {
    sourceType: "admin-rule",
    officialName: "(대한법률구조공단) 법률구조사건 처리규칙 시행규정",
    adminRuleSerial: "2200000089971",
  };

  assert.deepEqual(mergeExistingSources([], [supporting]), [supporting]);
});

test("keeps an explicitly pinned scheduled statute version", () => {
  const generated = [{
    sourceType: "statute",
    officialName: "가상법",
    mst: "100",
    effectiveOn: "2026-07-01",
  }];
  const pinned = [{
    sourceType: "statute",
    officialName: "가상법",
    mst: "200",
    effectiveOn: "2026-12-03",
    pinnedVersion: true,
  }];

  assert.deepEqual(mergeExistingSources(generated, pinned), pinned);
});

test("drops an unresolved item when a curated source links the same title", () => {
  const unresolved = [{ law: "간호사의 진료지원업무 수행에 관한 규칙", kind: "부령" }];
  const sources = [{
    sourceType: "statute",
    officialName: "간호사의 진료지원업무 수행에 관한 규칙",
    mst: "288085",
  }];

  assert.deepEqual(filterUnresolvedAgainstSources(unresolved, sources), []);
});
