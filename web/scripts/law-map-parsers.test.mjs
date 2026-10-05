import test from "node:test";
import assert from "node:assert/strict";
import { parseClause, parseLsStmd, stripOc } from "./lib/law-map-parsers.mjs";

export const STMD_XML = `<?xml version="1.0" encoding="UTF-8"?><법령체계도><기본정보><법령ID>001823</법령ID><법령일련번호>273437</법령일련번호><공포일자>20250826</공포일자><공포번호>21035</공포번호><법종구분 법종구분코드="A0002">법률</법종구분>
<법령명><![CDATA[건축법]]></법령명><시행일자>20260227</시행일자><제개정구분 제개정구분코드="110402">일부개정</제개정구분></기본정보><상하위법><법률>
<기본정보><법령ID>001823</법령ID><법령일련번호>273437</법령일련번호><공포일자>20250826</공포일자><법종구분 법종구분코드="A0002">법률</법종구분><법령명><![CDATA[건축법]]></법령명><시행일자>20260227</시행일자><본문상세링크>/DRF/lawService.do?OC=secret123&amp;target=law&amp;MST=273437&amp;type=XML&amp;mobileYn=</본문상세링크></기본정보><시행령>
<기본정보><법령ID>002118</법령ID><법령일련번호>288849</법령일련번호><공포일자>20260818</공포일자><법종구분 법종구분코드="A0007">대통령령</법종구분><법령명><![CDATA[건축법 시행령]]></법령명><시행일자>20260918</시행일자><본문상세링크>/DRF/lawService.do?OC=secret123&amp;target=law&amp;MST=288849&amp;type=XML</본문상세링크></기본정보></시행령><시행규칙>
<기본정보><법령ID>006186</법령ID><법령일련번호>273103</법령일련번호><공포일자>20250731</공포일자><법종구분 법종구분코드="A0103">국토교통부령</법종구분><법령명><![CDATA[건축물대장의 기재 및 관리 등에 관한 규칙]]></법령명><시행일자>20250731</시행일자></기본정보></시행규칙><시행규칙>
<기본정보><법령ID>006191</법령ID><법령일련번호>283727</법령일련번호><공포일자>20260301</공포일자><법종구분 법종구분코드="A0103">국토교통부령</법종구분><법령명><![CDATA[건축법 시행규칙]]></법령명><시행일자>20260301</시행일자></기본정보></시행규칙><행정규칙><고시>
<기본정보><행정규칙ID>37055</행정규칙ID><행정규칙일련번호>2100000251146</행정규칙일련번호><발령일자>20241224</발령일자><발령번호>2024-846</발령번호><법종구분 법종구분코드="B0003">고시</법종구분><행정규칙명><![CDATA[건축구조기준]]></행정규칙명><시행일자>20241224</시행일자></기본정보></고시><훈령>
<기본정보><행정규칙ID>40001</행정규칙ID><행정규칙일련번호>2100000300000</행정규칙일련번호><발령일자>20250101</발령일자><법종구분 법종구분코드="B0001">훈령</법종구분><행정규칙명><![CDATA[건축행정 업무처리 지침]]></행정규칙명><시행일자>20250101</시행일자></기본정보></훈령></행정규칙><자치법규><조례>
<기본정보><자치법규ID>2019668</자치법규ID><자치법규일련번호>2124585</자치법규일련번호><공포일자>20260420</공포일자><법종구분 법종구분코드="C0001">조례</법종구분><자치법규명><![CDATA[가평군 군계획 조례]]></자치법규명><시행일자>20260420</시행일자></기본정보></조례><조례>
<기본정보><자치법규ID>2019669</자치법규ID><자치법규일련번호>2124586</자치법규일련번호><공포일자>20260420</공포일자><법종구분 법종구분코드="C0001">조례</법종구분><자치법규명><![CDATA[영광군 건축 조례]]></자치법규명><시행일자>20260420</시행일자></기본정보></조례></자치법규></상하위법></법령체계도>`;

test("stripOc removes the OC query parameter but keeps the rest of the URL", () => {
  assert.equal(
    stripOc("/DRF/lawService.do?OC=secret123&amp;target=law&amp;MST=1"),
    "/DRF/lawService.do?target=law&amp;MST=1",
  );
  assert.equal(stripOc("https://x/y?target=law&OC=secret123"), "https://x/y?target=law");
  assert.equal(stripOc("plain text"), "plain text");
});

test("parseClause reads article number, branch and the remaining clause", () => {
  assert.deepEqual(parseClause("제2조제1항제11호"), { no: 2, branch: null, label: "제2조", rest: "제1항제11호" });
  assert.deepEqual(parseClause("제13조의2제2항"), { no: 13, branch: 2, label: "제13조의2", rest: "제2항" });
  assert.deepEqual(parseClause("제 4 조의 2"), { no: 4, branch: 2, label: "제4조의2", rest: "" });
  assert.equal(parseClause(""), null);
  assert.equal(parseClause("별표 1"), null);
});

test("parseLsStmd extracts root, decrees, rules, admin rules and ordinances without OC", () => {
  const stmd = parseLsStmd(STMD_XML);
  assert.deepEqual(stmd.root, {
    lawId: "001823", mst: "273437", name: "건축법", kind: "법률",
    effectiveOn: "2026-02-27", promulgatedOn: "2025-08-26",
  });
  assert.equal(stmd.decrees.length, 1);
  assert.equal(stmd.decrees[0].name, "건축법 시행령");
  assert.equal(stmd.decrees[0].mst, "288849");
  assert.deepEqual(stmd.rules.map((r) => r.name), ["건축물대장의 기재 및 관리 등에 관한 규칙", "건축법 시행규칙"]);
  assert.deepEqual(stmd.adminRules.map((r) => [r.serial, r.name, r.kind]), [
    ["2100000251146", "건축구조기준", "고시"],
    ["2100000300000", "건축행정 업무처리 지침", "훈령"],
  ]);
  assert.deepEqual(stmd.ordinances.map((o) => o.name), ["가평군 군계획 조례", "영광군 건축 조례"]);
  assert.ok(!JSON.stringify(stmd).includes("secret123"));
});

test("parseLsStmd rejects non-lsStmd responses", () => {
  assert.throws(() => parseLsStmd("<html>오류</html>"), /lsStmd/);
});
