import test from "node:test";
import assert from "node:assert/strict";
import { parseAdminRuleArticleHeaders, parseAdminRuleArticles } from "./lib/admin-rule-service.mjs";

test("parses article headers from admrul JSON arrays", () => {
  const found = parseAdminRuleArticleHeaders({
    AdmRulService: {
      "조문내용": [
        "제29조(안전성·유효성 심사기준) 심사 기준을 정한다.",
        "제55조(자료의 요청 및 보완 등) 자료 보완을 요구할 수 있다.",
      ],
    },
  });

  assert.deepEqual([...found], ["제29조", "제55조"]);
});

test("parses branch articles from a single admrul JSON string", () => {
  const found = parseAdminRuleArticleHeaders({
    AdmRulService: {
      "조문내용": "제55조의2(재신청 서류의 처리) 재신청 절차를 정한다.",
    },
  });

  assert.deepEqual([...found], ["제55조의2"]);
});

test("parses the nested 조문 payload returned by the current DRF response", () => {
  const found = parseAdminRuleArticleHeaders({
    AdmRulService: {
      조문: {
        조문내용: [
          "제9조(사이버안전대책의 수립·시행 등) 내용을 정한다.",
          "제10조의2(보안관제센터의 설치·운영) 내용을 정한다.",
        ],
      },
    },
  });

  assert.deepEqual([...found], ["제9조", "제10조의2"]);
});

test("returns no headers when the admrul service omits article content", () => {
  const found = parseAdminRuleArticleHeaders({ AdmRulService: { "조문내용": null } });
  assert.equal(found.size, 0);
});

test("parses exact administrative-rule article bodies and dates", () => {
  const articles = parseAdminRuleArticles({
    AdmRulService: {
      행정규칙기본정보: { 시행일자: "20260326" },
      조문내용: [
        "제2조(정의) 용어는 다음과 같다.1. 신청인2. 처리기관",
        "제3조의2(검토) ① 담당자는 검토한다.② 장은 결정한다.",
      ],
    },
  });

  assert.deepEqual(articles.get("제3조의2"), {
    article: "제3조의2",
    title: "검토",
    text: "① 담당자는 검토한다.\n② 장은 결정한다.",
    effectiveOn: "2026-03-26",
  });
});
