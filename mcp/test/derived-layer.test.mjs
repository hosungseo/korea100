import assert from "node:assert/strict";
import test from "node:test";

import { checkAllCases } from "../../ontology/scripts/verify-derived-layer.mjs";

// PRD 원칙 3 — 구조 층은 파생물이다. 지금까지 이 원칙은 사람이 --remerge를
// 기억해야만 지켜졌다. 제도 JSON이나 오버레이를 고치고 재파생을 잊으면 케이스는
// 옛 그림을 든 채로 남고 아무도 알려주지 않았다. 이 테스트가 그 자리를 막는다.
test("모든 케이스의 구조 층이 원본과 일치한다", async () => {
  const results = await checkAllCases();

  assert.ok(results.length >= 9, `케이스가 ${results.length}건뿐입니다`);

  const notCurrent = results.filter((result) => result.status !== "current");
  const report = notCurrent
    .map((result) => {
      const detail = (result.diffs ?? [])
        .map((diff) => `${diff.label}: +${diff.added.length} -${diff.removed.length} ~${diff.changed.length}`)
        .join(" / ");
      return `${result.file} [${result.status}] ${detail || result.message || ""}`;
    })
    .join("\n");

  assert.deepEqual(
    notCurrent,
    [],
    `구조 층이 원본과 어긋났습니다. node ontology/scripts/verify-derived-layer.mjs --fix 로 재파생하세요.\n${report}`,
  );
});

test("검사는 세 종류 케이스를 모두 다룬다", async () => {
  const results = await checkAllCases();
  const kinds = new Set(results.map((result) => result.kind));

  // 종류를 하나라도 못 알아보면 그 케이스는 조용히 검사에서 빠진다.
  assert.deepEqual([...kinds].sort(), ["institution", "milestone", "project"]);
  assert.ok(!results.some((result) => result.status === "unknown_kind"));
});
