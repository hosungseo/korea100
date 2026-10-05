import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArticleList, parseClause, parseLsDelegated, parseLsStmd, stripOc } from "./lib/law-map-parsers.mjs";
import { DELEGATED_XML, STMD_XML } from "./law-map-fixtures.mjs";

// 건축법 lsStmd 실응답 전체(OC 제거본, fetch-law-map이 남긴 캐시). 있을 때만 모양 회귀를 잡는다.
const WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REAL_STMD_PATH = process.env.LAW_MAP_REAL_STMD ?? path.join(WEB_DIR, "data/law-map/raw/lsStmd-001823.xml");

test("stripOc removes the OC query parameter but keeps the rest of the URL", () => {
  assert.equal(
    stripOc("/DRF/lawService.do?OC=secret123&amp;target=law&amp;MST=1"),
    "/DRF/lawService.do?target=law&amp;MST=1",
  );
  assert.equal(stripOc("https://x/y?target=law&OC=secret123"), "https://x/y?target=law");
  assert.equal(stripOc("https://x/y?oc=secret123&target=law"), "https://x/y?target=law");
  assert.equal(stripOc("plain text"), "plain text");
});

test("parseClause reads article number, branch and the remaining clause", () => {
  assert.deepEqual(parseClause("제2조제1항제11호"), { no: 2, branch: null, label: "제2조", rest: "제1항제11호" });
  assert.deepEqual(parseClause("제13조의2제2항"), { no: 13, branch: 2, label: "제13조의2", rest: "제2항" });
  assert.deepEqual(parseClause("제 4 조의 2"), { no: 4, branch: 2, label: "제4조의2", rest: "" });
  assert.equal(parseClause(""), null);
  assert.equal(parseClause("별표 1"), null);
});

test("parseLsStmd walks the nested tree and classifies each 기본정보 by its enclosing tag", () => {
  const stmd = parseLsStmd(STMD_XML);
  assert.deepEqual(stmd.root, {
    lawId: "001823", mst: "273437", name: "건축법", kind: "법률",
    effectiveOn: "2026-02-27", promulgatedOn: "2025-08-26",
  });
  assert.equal(stmd.decrees.length, 1);
  assert.equal(stmd.decrees[0].name, "건축법 시행령");
  assert.equal(stmd.decrees[0].mst, "288849");
  assert.deepEqual(stmd.rules.map((r) => [r.mst, r.name, r.kind]), [
    ["273103", "건축물대장의 기재 및 관리 등에 관한 규칙", "국토교통부령"],
    ["283727", "건축법 시행규칙", "국토교통부령"],
  ]);
  assert.deepEqual(stmd.adminRules.map((r) => [r.serial, r.name, r.kind, r.effectiveOn]), [
    ["2100000198238", "건축행정시스템 운영규정", "훈령", "2021-02-18"],
    ["2100000244148", "건축공사 감리세부기준", "고시", "2024-07-10"],
    ["2100000272946", "실내건축의 구조·시공방법 등에 관한 기준", "고시", "2026-01-22"],
  ]);
  assert.deepEqual(stmd.ordinances.map((o) => [o.serial, o.name, o.kind]), [
    ["2124585", "가평군 군계획 조례", "조례"],
    ["1850983", "가평군 제증명 등 수수료 징수 조례", "조례"],
    ["2049613", "경산시 건축 조례 시행규칙", "규칙"],
  ]);
  assert.ok(!JSON.stringify(stmd).includes("secret123"));
});

test("parseLsStmd on the full 건축법 response (local cache file only)", (t) => {
  if (!fs.existsSync(REAL_STMD_PATH)) return t.skip(`real lsStmd file not present: ${REAL_STMD_PATH}`);
  const xml = fs.readFileSync(REAL_STMD_PATH, "utf8");
  const count = (re) => (xml.match(re) ?? []).length;
  const distinct = (re) => new Set([...xml.matchAll(re)].map((m) => m[1])).size;
  // 원본 나열: 1 시행령, 7 시행규칙, 45 행정규칙(44 고시 + 1 훈령), 1,100 자치법규(1,094 조례 + 6 규칙).
  // 같은 고시·조례가 여러 시행규칙 아래 되풀이 나열되므로 일련번호로 중복을 걷으면 35·580이 된다.
  assert.deepEqual([count(/<고시>/g), count(/<훈령>/g), count(/<조례>/g), count(/<규칙>/g)], [44, 1, 1094, 6]);
  const stmd = parseLsStmd(xml);
  assert.equal(stmd.decrees.length, 1);
  assert.equal(stmd.rules.length, 7);
  assert.equal(stmd.adminRules.length, 35);
  assert.equal(stmd.adminRules.length, distinct(/<행정규칙일련번호>([^<]*)</g));
  assert.equal(stmd.adminRules.filter((r) => r.kind === "훈령").length, 1);
  assert.equal(stmd.ordinances.length, 580);
  assert.equal(stmd.ordinances.length, distinct(/<자치법규일련번호>([^<]*)</g));
  assert.equal(stmd.ordinances.filter((o) => o.kind === "규칙").length, 6);
  assert.ok(!/OC=/i.test(JSON.stringify(stmd)));
});

test("parseLsStmd classifies 기본정보 under unknown tags (공고·지침 등) by its own id field", () => {
  const xml = `<법령체계도><기본정보><법령ID>000001</법령ID><법령일련번호>1</법령일련번호><법종구분>법률</법종구분><법령명><![CDATA[시험법]]></법령명></기본정보><상하위법><법률>
<기본정보><법령ID>000001</법령ID><법령일련번호>1</법령일련번호><법종구분>법률</법종구분><법령명><![CDATA[시험법]]></법령명></기본정보>
<특별령><기본정보><법령ID>000002</법령ID><법령일련번호>2</법령일련번호><법종구분>대통령령</법종구분><법령명><![CDATA[시험법 시행령]]></법령명></기본정보></특별령>
<특별령><기본정보><법령ID>000003</법령ID><법령일련번호>3</법령일련번호><법종구분>총리령</법종구분><법령명><![CDATA[시험법 시행규칙]]></법령명></기본정보></특별령>
<행정규칙>
<공고><기본정보><행정규칙ID>10</행정규칙ID><행정규칙일련번호>2100000000010</행정규칙일련번호><법종구분>공고</법종구분><행정규칙명><![CDATA[시험 공고]]></행정규칙명><시행일자>20250101</시행일자></기본정보></공고>
<지침><기본정보><행정규칙ID>11</행정규칙ID><행정규칙일련번호>2100000000011</행정규칙일련번호><법종구분>지침</법종구분><행정규칙명><![CDATA[시험 지침]]></행정규칙명></기본정보></지침>
</행정규칙>
<자치법규><규정><기본정보><자치법규ID>20</자치법규ID><자치법규일련번호>3000020</자치법규일련번호><법종구분>규정</법종구분><자치법규명><![CDATA[시험군 규정]]></자치법규명></기본정보></규정></자치법규>
</법률></상하위법></법령체계도>`;
  const stmd = parseLsStmd(xml);
  assert.deepEqual(stmd.decrees.map((d) => [d.mst, d.kind]), [["2", "대통령령"]]);
  assert.deepEqual(stmd.rules.map((r) => [r.mst, r.kind]), [["3", "총리령"]]);
  assert.deepEqual(stmd.adminRules.map((r) => [r.serial, r.name, r.kind, r.effectiveOn]), [
    ["2100000000010", "시험 공고", "공고", "2025-01-01"],
    ["2100000000011", "시험 지침", "지침", null],
  ]);
  assert.deepEqual(stmd.ordinances.map((o) => [o.serial, o.name, o.kind]), [["3000020", "시험군 규정", "규정"]]);
});

test("parseLsStmd rejects non-lsStmd responses", () => {
  assert.throws(() => parseLsStmd("<html>오류</html>"), /lsStmd/);
});

test("parseLsDelegated flattens delegation records by kind", () => {
  const { law, records, dropped } = parseLsDelegated(DELEGATED_XML);
  assert.deepEqual(law, { mst: "273437", lawId: "001823", name: "건축법", ministry: "국토교통부" });
  assert.equal(records.length, 11);
  assert.equal(dropped, 1);

  const decree = records.find((r) => r.kind === "시행령");
  assert.deepEqual(decree, {
    from: { no: 2, branch: null, label: "제2조", title: "정의" },
    kind: "시행령", targetSerial: "288849", targetName: "건축법 시행령",
    targetLabel: "제3조의3", targetTitle: "지형적 조건 등에 따른 도로의 구조와 너비",
    fromClause: "제2조제1항제11호", linkText: "대통령령", phrase: "대통령령으로 정하는",
  });

  const cites = records.filter((r) => r.kind === "인용법령");
  assert.deepEqual(cites.map((r) => [r.targetName, r.targetSerial, r.targetLabel]), [
    ["국토의 계획 및 이용에 관한 법률", "246675", null],
    ["건설산업기본법", "253515", "제2조"],
    ["녹색건축물 조성 지원법", null, null],
  ]);

  const ordinances = records.filter((r) => r.kind === "위임자치법규");
  assert.equal(ordinances.length, 2);
  assert.equal(ordinances[0].from.label, "제4조");
  assert.equal(ordinances[0].fromClause, null);
  assert.equal(ordinances[0].targetSerial, "2160161");

  const admin = records.find((r) => r.kind === "위임행정규칙");
  assert.equal(admin.from.label, "제13조의2");
  assert.equal(admin.from.branch, 2);
  assert.equal(admin.targetSerial, "2100000110729");
  assert.equal(admin.fromClause, "제13조의2제2항");
});

test("parseLsDelegated keeps header-less 위임정보 blocks, inferring the kind from 링크텍스트", () => {
  const { records } = parseLsDelegated(DELEGATED_XML);
  const head = records.filter((r) => r.from.label === "제4조" && r.kind !== "위임자치법규");
  assert.deepEqual(head.map((r) => [r.kind, r.targetSerial, r.targetName, r.targetLabel, r.linkText]), [
    ["시행령", null, null, "제5조", "대통령령"],
    ["시행령", null, null, "제5조의2", "대통령령"],
    ["시행규칙", null, null, "제2조", "국토교통부령"], // 가지번호 0 → 가지 없음
    ["인용법령", null, "녹색건축물 조성 지원법", null, "「녹색건축물 조성 지원법」"],
  ]);
  assert.deepEqual(head[0], {
    from: { no: 4, branch: null, label: "제4조", title: "건축위원회" },
    kind: "시행령", targetSerial: null, targetName: null,
    targetLabel: "제5조", targetTitle: "중앙건축위원회의 설치 등",
    fromClause: "제4조제5항", linkText: "대통령령", phrase: "대통령령으로 정하는",
  });
  // 조문 내부 참조("제1항")는 레코드가 되지 않는다
  assert.ok(!records.some((r) => r.linkText === "제1항"));
});

test("parseLsDelegated infers header-less kinds only from 시행령·총리령·부령·「법령」 link texts", () => {
  const item = (no, link, line) => `<위임법령조문정보><위임법령조문번호>${no}</위임법령조문번호><위임법령조문제목><![CDATA[제목]]></위임법령조문제목><링크텍스트>${link}</링크텍스트><라인텍스트><![CDATA[${line}]]></라인텍스트><조항호목>제7조제1항</조항호목></위임법령조문정보>`;
  const xml = `<lsDelegated><법령><법령정보><법령일련번호>1</법령일련번호><법령명><![CDATA[시험법]]></법령명><법령ID>000001</법령ID></법령정보>
<위임조문정보><조정보><조문번호>7</조문번호><조문제목><![CDATA[시험]]></조문제목></조정보><위임정보>
${item(1, "대통령령", "대통령령으로 정하는")}
${item(2, "「시험법 시행령」", "「시험법 시행령」 제2조")}
${item(3, "시험법 시행령", "시험법 시행령에 따라")}
${item(4, "총리령", "총리령으로 정하는")}
${item(5, "행정안전부령", "행정안전부령으로 정하는")}
${item(6, "명령", "명령으로 정하는")}
${item(7, "법령", "법령에 따라")}
${item(8, "제3항", "제7조제3항")}
</위임정보></위임조문정보></법령></lsDelegated>`;
  const { records, dropped } = parseLsDelegated(xml);
  assert.deepEqual(records.map((r) => [r.kind, r.targetName, r.targetLabel]), [
    ["시행령", null, "제1조"],
    ["인용법령", "시험법 시행령", "제2조"],
    ["시행령", null, "제3조"],
    ["시행규칙", null, "제4조"],
    ["시행규칙", null, "제5조"],
  ]);
  assert.equal(dropped, 3); // 명령·법령·제3항
});

test("parseLsDelegated rejects non-lsDelegated responses", () => {
  assert.throws(() => parseLsDelegated("<법령체계도></법령체계도>"), /lsDelegated/);
});

test("parseArticleList keeps document order, chapters, titles and text", () => {
  const list = parseArticleList({
    법령: {
      조문: {
        조문단위: [
          { 조문여부: "전문", 조문번호: "1", 조문내용: "                        제1장 총칙" },
          { 조문여부: "조문", 조문번호: "1", 조문제목: "목적", 조문내용: "제1조(목적) 이 법은 건축물의 안전을 위한다." },
          { 조문여부: "조문", 조문번호: "2", 조문제목: "정의", 조문내용: "제2조(정의)", 항: [{ 항내용: "① 용어의 뜻은 다음과 같다.", 호: [{ 호내용: "1. 대지란 토지를 말한다." }] }] },
          { 조문여부: "전문", 조문번호: "2", 조문내용: "                        제2장 건축물의 건축 <개정 2014.1.14>" },
          { 조문여부: "조문", 조문번호: "4", 조문가지번호: "2", 조문제목: "건축위원회의 건축 심의 등", 조문내용: "제4조의2(건축위원회의 건축 심의 등) ① 심의를 받아야 한다." },
          { 조문여부: "조문", 조문번호: "5", 조문내용: "  제5조 삭제 <2008.3.21>" },
          { 조문여부: "조문", 조문번호: "6", 조문가지번호: "0", 조문제목: "적용의 완화", 조문내용: "제6조(적용의 완화) 완화하여 적용할 수 있다." },
          { 조문여부: "조문", 조문번호: "7", 조문내용: "제7조 허가 사항을 삭제하려는 자는 신고한다." },
          { 조문여부: "조문", 조문번호: "", 조문내용: "깨진 단위" },
        ],
      },
    },
  });
  assert.deepEqual(list.map((a) => [a.label, a.title, a.chapter]), [
    ["제1조", "목적", "제1장 총칙"],
    ["제2조", "정의", "제1장 총칙"],
    ["제4조의2", "건축위원회의 건축 심의 등", "제2장 건축물의 건축"],
    ["제5조", "삭제", "제2장 건축물의 건축"],
    ["제6조", "적용의 완화", "제2장 건축물의 건축"], // 가지번호 "0"은 가지 없음
    ["제7조", "", "제2장 건축물의 건축"], // 본문에 "삭제"가 있어도 삭제 조문이 아니다
  ]);
  assert.equal(list[1].no, 2);
  assert.equal(list[2].branch, 2);
  assert.equal(list[4].branch, null);
  assert.match(list[0].text, /건축물의 안전/);
  assert.match(list[1].text, /대지란 토지/);
});
