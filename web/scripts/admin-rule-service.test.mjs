import test from "node:test";
import assert from "node:assert/strict";
import { parseAdminRuleArticleHeaders } from "./lib/admin-rule-service.mjs";

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

test("returns no headers when the admrul service omits article content", () => {
  const found = parseAdminRuleArticleHeaders({ AdmRulService: { "조문내용": null } });
  assert.equal(found.size, 0);
});
