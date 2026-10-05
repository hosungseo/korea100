import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDrfClient } from "./lib/law-map-drf.mjs";
import { buildLawMapIndex } from "./lib/law-map-index.mjs";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "law-map-drf-"));
}

function responder(bodies) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const body = bodies.shift();
    return { ok: body.status ? body.status < 400 : true, status: body.status ?? 200, text: async () => body.text };
  };
  return { calls, fetchImpl };
}

test("getText caches the stripped response and never writes the OC", async () => {
  const dir = tmpDir();
  const { calls, fetchImpl } = responder([{ text: '<a><링크>/x?OC=secret123&amp;t=1</링크></a>' }]);
  const drf = createDrfClient({ oc: "secret123", cacheDir: dir, delayMs: 0, fetchImpl });
  const first = await drf.getText({ target: "lsStmd", ID: "1" }, "stmd-1.xml");
  const second = await drf.getText({ target: "lsStmd", ID: "1" }, "stmd-1.xml");
  assert.equal(first, "<a><링크>/x?t=1</링크></a>");
  assert.equal(second, first);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /OC=secret123/);
  assert.equal(fs.readFileSync(path.join(dir, "stmd-1.xml"), "utf8"), first);
});

test("request retries on HTML error pages and redacts the OC in the final error", async () => {
  const dir = tmpDir();
  const { calls, fetchImpl } = responder([
    { text: "<!DOCTYPE html><html>오류</html>" },
    { text: "", status: 500 },
    { text: "<ok/>" },
  ]);
  const drf = createDrfClient({ oc: "secret123", cacheDir: dir, delayMs: 0, retries: 3, fetchImpl, backoffMs: 0 });
  assert.equal(await drf.getText({ target: "lsDelegated", MST: "2" }, "d-2.xml"), "<ok/>");
  assert.equal(calls.length, 3);

  const failing = createDrfClient({ oc: "secret123", cacheDir: dir, delayMs: 0, retries: 1, backoffMs: 0, fetchImpl: responder([{ text: "<html/>" }, { text: "<html/>" }]).fetchImpl });
  await assert.rejects(() => failing.getText({ target: "lsStmd", ID: "9" }, "s-9.xml"), (err) => {
    assert.ok(!err.message.includes("secret123"));
    assert.match(err.message, /오류 페이지/);
    return true;
  });
  assert.ok(!fs.existsSync(path.join(dir, "s-9.xml")));
});

test("getJson parses cached JSON", async () => {
  const dir = tmpDir();
  const drf = createDrfClient({ oc: "x", cacheDir: dir, delayMs: 0, fetchImpl: responder([{ text: '{"법령":{"법령ID":"1"}}' }]).fetchImpl });
  assert.deepEqual(await drf.getJson({ target: "eflaw", MST: "1", efYd: "20260101" }, "eflaw-1.json"), { 법령: { 법령ID: "1" } });
});

test("buildLawMapIndex summarizes maps sorted by Korean name", () => {
  const mk = (lawId, name, lanes) => ({
    lawId, name, ministry: "국토교통부", effectiveOn: "2026-01-01",
    lanes, edges: [{ id: "e1" }], institutions: [{ slug: "a" }],
    stats: { articlesByTier: { statute: 3, decree: 2, rule: 1, adminRule: 0, ordinance: 0 }, edgesByKind: {}, unresolved: 1 },
  });
  const index = buildLawMapIndex([
    mk("2", "도로법", [{ tier: "statute", name: "도로법" }, { tier: "adminRule", name: "고시" }]),
    mk("1", "건축법", [{ tier: "statute", name: "건축법" }, { tier: "decree", name: "건축법 시행령" }, { tier: "ordinance", name: "자치법규" }]),
  ], "2026-10-05");
  assert.equal(index.generatedAt, "2026-10-05");
  assert.deepEqual(index.laws.map((l) => l.name), ["건축법", "도로법"]);
  assert.deepEqual(index.laws[0], {
    lawId: "1", name: "건축법", ministry: "국토교통부", effectiveOn: "2026-01-01",
    articleCount: 6, edgeCount: 1, institutionCount: 1, unresolved: 1, names: ["건축법", "건축법 시행령"],
  });
});
