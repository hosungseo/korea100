import test from "node:test";
import assert from "node:assert/strict";
import {
  apiDateWindow,
  parseNaverResponse,
  parsePolicyBriefingXml,
  rankCandidates,
} from "./lib/news-candidates.mjs";

const config = {
  signals: {
    institution: ["제도", "시행", "신설"],
    process: ["신청", "심사", "허가"],
    novelty: ["최초", "시범"],
  },
  noise: ["FIFA", "월드컵", "미국"],
};

test("parses Naver news items into candidate source records", () => {
  const items = parseNaverResponse({
    items: [{
      title: "새 <b>제도</b> 시행",
      description: "신청과 심사 절차",
      originallink: "https://example.com/original",
      link: "https://n.news.naver.com/article/1",
      pubDate: "Mon, 13 Jul 2026 06:00:00 +0900",
    }],
  }, "\"제도\" \"시행\"");

  assert.deepEqual(items, [{
    title: "새 제도 시행",
    body: "신청과 심사 절차",
    url: "https://example.com/original",
    sourceName: "네이버뉴스검색",
    sourceType: "naver_news",
    publishedAt: "2026-07-13",
    query: "\"제도\" \"시행\"",
  }]);
});

test("parses Policy Briefing XML news items", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>0</resultCode><resultMsg>NORMAL_SERVICE</resultMsg></header>
  <body>
    <NewsItem>
      <ApproveDate>07/12/2026 12:30:00</ApproveDate>
      <Title><![CDATA[신규 지원 제도 시행]]></Title>
      <SubTitle1>시범사업 신청 개시</SubTitle1>
      <DataContents><![CDATA[<p>위원회 심사를 거쳐 허가한다.</p>]]></DataContents>
      <OriginalUrl>https://www.korea.kr/news/policyNewsView.do?newsId=1</OriginalUrl>
    </NewsItem>
  </body>
</response>`;

  const items = parsePolicyBriefingXml(xml, "20260711-20260713");

  assert.equal(items[0].title, "신규 지원 제도 시행");
  assert.equal(items[0].body, "시범사업 신청 개시\n위원회 심사를 거쳐 허가한다.");
  assert.equal(items[0].sourceType, "policy_briefing");
  assert.equal(items[0].publishedAt, "2026-07-12");
});

test("uses the maximum allowed three-day policy briefing window", () => {
  assert.deepEqual(apiDateWindow("2026-07-13"), ["20260711", "20260713"]);
});

test("ranks policy process news while penalizing existing Korea100 topics", () => {
  const manifest = [{ name: "환경영향평가", slug: "environmental-impact-assessment" }];
  const candidates = rankCandidates([
    {
      title: "환경영향평가 제도 시행",
      body: "신청 심사",
      url: "https://example.com/existing",
      sourceName: "네이버뉴스검색",
      sourceType: "naver_news",
      publishedAt: "2026-07-12",
      query: "q",
    },
    {
      title: "신규 인허가 제도 최초 시행",
      body: "신청 심사 허가",
      url: "https://example.com/new",
      sourceName: "정책브리핑",
      sourceType: "policy_briefing",
      publishedAt: "2026-07-12",
      query: "q",
    },
  ], config, manifest, 2);

  assert.equal(candidates[0].url, "https://example.com/new");
  assert.deepEqual(candidates[1].existingMatches, [
    { name: "환경영향평가", slug: "environmental-impact-assessment" },
  ]);
});

test("filters noisy foreign or sports keyword matches", () => {
  const candidates = rankCandidates([
    {
      title: "FIFA 월드컵 제도 확대",
      body: "미국 스포츠 규정",
      url: "https://example.com/noise",
      sourceName: "네이버뉴스검색",
      sourceType: "naver_news",
      publishedAt: "2026-07-12",
      query: "q",
    },
  ], config, [], 1);

  assert.deepEqual(candidates, []);
});
