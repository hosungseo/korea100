import test from "node:test";
import assert from "node:assert/strict";
import { mergeExistingSources } from "./lib/source-merging.mjs";

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
