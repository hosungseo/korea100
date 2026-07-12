import test from "node:test";
import assert from "node:assert/strict";
import { parseLawArticleHeaders } from "./lib/law-service.mjs";

test("parses ordinary and branch law articles from DRF JSON", () => {
  const found = parseLawArticleHeaders({
    법령: {
      조문: {
        조문단위: [
          { 조문여부: "전문", 조문번호: "1" },
          { 조문여부: "조문", 조문번호: "25", 조문제목: "인증" },
          { 조문여부: "조문", 조문번호: "25", 조문가지번호: "5", 조문제목: "판매 의무" },
        ],
      },
    },
  });

  assert.deepEqual([...found], ["제25조", "제25조의5"]);
});

test("ignores malformed law article units", () => {
  const found = parseLawArticleHeaders({ 법령: { 조문: { 조문단위: [{ 조문여부: "조문", 조문번호: "" }] } } });
  assert.equal(found.size, 0);
});
