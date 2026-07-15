import test from "node:test";
import assert from "node:assert/strict";
import { parseLawArticleHeaders, parseLawArticles } from "./lib/law-service.mjs";

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

test("preserves paragraph, item, and effective-date text", () => {
  const articles = parseLawArticles({
    법령: {
      조문: {
        조문단위: [{
          조문여부: "조문",
          조문번호: "11",
          조문가지번호: "3",
          조문제목: "영향평가",
          조문시행일자: "20260701",
          조문내용: "제11조의3(영향평가)",
          항: [{
            항내용: "① 다음 각 호를 평가한다.",
            호: [{ 호내용: "1. 계획" }, { 호내용: "2. 사업" }],
          }],
        }],
      },
    },
  });

  assert.deepEqual(articles.get("제11조의3"), {
    article: "제11조의3",
    title: "영향평가",
    text: "① 다음 각 호를 평가한다.\n1. 계획\n2. 사업",
    effectiveOn: "2026-07-01",
  });
});
