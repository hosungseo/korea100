import assert from "node:assert/strict";
import test from "node:test";
import { findLegalSources, legalSourceKey } from "./lib/legal-source-resolution.mjs";

const sources = [
  { law: "하도급거래 공정화에 관한 법률", sourceType: "statute", mst: "10", officialUrl: "law" },
  { law: "근로기준법", sourceType: "statute", mst: "20", officialUrl: "labor" },
  { law: "노동조합 및 노동관계조정법", sourceType: "statute", mst: "30", officialUrl: "union" },
];

test("resolves common law aliases", () => {
  assert.equal(findLegalSources("하도급법", sources)[0].mst, "10");
});

test("resolves composite citations to each official source", () => {
  assert.deepEqual(
    findLegalSources("근로기준법·노동조합 및 노동관계조정법", sources).map((source) => source.mst),
    ["20", "30"],
  );
});

test("rejects placeholder source identifiers", () => {
  assert.equal(legalSourceKey({ sourceType: "statute", mst: "0" }), null);
});
