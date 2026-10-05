import test from "node:test";
import assert from "node:assert/strict";
import { formatLawMapHash, parseLawMapHash } from "../src/lib/law-map-hash.mjs";

test("round-trips article focus", () => {
  const hash = formatLawMapHash({ article: "L1:제11조" });
  assert.equal(hash, "#a=L1%3A%EC%A0%9C11%EC%A1%B0");
  assert.deepEqual(parseLawMapHash(hash), { article: "L1:제11조" });
});

test("route wins over article and round-trips", () => {
  const hash = formatLawMapHash({ article: "R1:제6조", route: ["L1:제11조", "R1:제6조"] });
  assert.deepEqual(parseLawMapHash(hash), { route: ["L1:제11조", "R1:제6조"] });
});

test("ignores empty or malformed hashes", () => {
  assert.deepEqual(parseLawMapHash(""), {});
  assert.deepEqual(parseLawMapHash("#"), {});
  assert.deepEqual(parseLawMapHash("#route=L1"), {});
  assert.deepEqual(parseLawMapHash("#foo=bar"), {});
  assert.equal(formatLawMapHash({}), "");
});

test("view round-trips alone and alongside article or route", () => {
  assert.equal(formatLawMapHash({ view: "overview" }), "#v=o");
  assert.deepEqual(parseLawMapHash("#v=o"), { view: "overview" });
  assert.deepEqual(parseLawMapHash("#v=d"), { view: "detail" });
  const withArticle = formatLawMapHash({ article: "L1:제11조", view: "detail" });
  assert.equal(withArticle, "#a=L1%3A%EC%A0%9C11%EC%A1%B0&v=d");
  assert.deepEqual(parseLawMapHash(withArticle), { article: "L1:제11조", view: "detail" });
  const withRoute = formatLawMapHash({ route: ["L1:제11조", "R1:제6조"], view: "overview" });
  assert.deepEqual(parseLawMapHash(withRoute), { route: ["L1:제11조", "R1:제6조"], view: "overview" });
});

test("rule view is v=r and composes with an article", () => {
  assert.equal(formatLawMapHash({ view: "rule" }), "#v=r");
  assert.deepEqual(parseLawMapHash("#v=r"), { view: "rule" });
  const withArticle = formatLawMapHash({ article: "L1:제11조", view: "rule" });
  assert.equal(withArticle, "#a=L1%3A%EC%A0%9C11%EC%A1%B0&v=r");
  assert.deepEqual(parseLawMapHash(withArticle), { article: "L1:제11조", view: "rule" });
});

test("hashes without v carry no view, and unknown v is ignored", () => {
  assert.deepEqual(parseLawMapHash("#a=L1%3A%EC%A0%9C11%EC%A1%B0"), { article: "L1:제11조" });
  assert.deepEqual(parseLawMapHash("#v=x"), {});
  assert.deepEqual(parseLawMapHash("#v=x&a=L1"), { article: "L1" });
  assert.equal(formatLawMapHash({ view: undefined }), "");
});
