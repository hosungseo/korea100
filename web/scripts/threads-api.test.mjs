import test from "node:test";
import assert from "node:assert/strict";
import { maskSecret, summarizeThread } from "./lib/threads-api.mjs";

test("masks configured secrets without exposing values", () => {
  assert.equal(maskSecret("abcdef"), "<set:6>");
  assert.equal(maskSecret(""), "<missing>");
});

test("summarizes thread text without dumping long content", () => {
  const summary = summarizeThread({
    id: "123",
    media_type: "TEXT",
    permalink: "https://www.threads.com/@example/post/123",
    timestamp: "2026-07-13T00:00:00+0000",
    text: "a".repeat(130),
  });

  assert.equal(summary.id, "123");
  assert.equal(summary.mediaType, "TEXT");
  assert.equal(summary.textPreview.length, 93);
  assert.match(summary.textPreview, /\.\.\.$/);
});
