import assert from "node:assert/strict";
import test from "node:test";
import {
  maskCrossLawReferences,
  parseArticleHeaders,
  parseArticleReferences,
} from "./lib/article-citations.mjs";

test("parses individual articles and ignores paragraph numbers", () => {
  assert.deepEqual(parseArticleReferences("제3조제1항, 제5조의2 제4항"), [
    "제3조",
    "제5조의2",
  ]);
});

test("expands ordinary article ranges", () => {
  assert.deepEqual(parseArticleReferences("제8~11조 및 제20조"), [
    "제8조",
    "제9조",
    "제10조",
    "제11조",
    "제20조",
  ]);
  assert.deepEqual(parseArticleReferences("제2조~제4조"), ["제2조", "제3조", "제4조"]);
});

test("expands branch-article ranges", () => {
  assert.deepEqual(parseArticleReferences("제5조의2~제5조의4"), [
    "제5조의2",
    "제5조의3",
    "제5조의4",
  ]);
});

test("deduplicates repeated references", () => {
  assert.deepEqual(parseArticleReferences("제7조·제7조제2항"), ["제7조"]);
});

test("extracts only line-leading article headers", () => {
  const text = "상법\n제1조 상사적용법규\n본문은 제2조를 인용한다.\n제401조의2(책임) 내용";
  assert.deepEqual([...parseArticleHeaders(text)], ["제1조", "제401조의2"]);
});

test("masks parent-law references in implementing-rule summaries", () => {
  const text = "제71조(감리 대상), 법 제7조·제22조·제57조 위임, 산안법 제36조 참고";
  assert.deepEqual(parseArticleReferences(maskCrossLawReferences(text)), ["제71조"]);
});
