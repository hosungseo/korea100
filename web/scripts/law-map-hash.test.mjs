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
