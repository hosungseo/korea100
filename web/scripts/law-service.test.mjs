import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchCurrentLawArticleSnapshot,
  parseLawArticleHeaders,
  parseLawArticles,
} from "./lib/law-service.mjs";

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

test("fetches the current statute by stable law ID", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (input) => {
    requestedUrl = new URL(input);
    return new Response(JSON.stringify({
      법령: {
        법령키: "0018722024102220520",
        기본정보: {
          법령명_한글: "근로기준법",
          법령ID: "001872",
          공포일자: "20241022",
          시행일자: "20251023",
        },
        조문: { 조문단위: [{ 조문여부: "조문", 조문번호: "76", 조문가지번호: "3" }] },
      },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const snapshot = await fetchCurrentLawArticleSnapshot("001872", { oc: "test" });
    assert.equal(requestedUrl.searchParams.get("ID"), "001872");
    assert.equal(requestedUrl.searchParams.has("MST"), false);
    assert.deepEqual([...snapshot.headers], ["제76조의3"]);
    assert.equal(snapshot.officialName, "근로기준법");
    assert.equal(snapshot.effectiveOn, "2025-10-23");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
