import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  formatProcessWarning,
  formatProcessWarnings,
} from "../src/lib/process-warnings.mjs";

test("formats text and structured process warnings", () => {
  assert.equal(formatProcessWarning("  현장 확인 필요  "), "현장 확인 필요");
  assert.equal(
    formatProcessWarning({ date: "2026-07-12", message: "조문을 정정했다." }),
    "2026-07-12 · 조문을 정정했다.",
  );
  assert.equal(
    formatProcessWarning({ date: "2026-07-12", 내용: "2026-07-12 검증 완료" }),
    "2026-07-12 검증 완료",
  );
  assert.equal(formatProcessWarning({ content: "공식 원문 확인" }), "공식 원문 확인");
});

test("ignores values that cannot be shown as a warning", () => {
  assert.equal(formatProcessWarning(null), null);
  assert.equal(formatProcessWarning(["경고"]), null);
  assert.equal(formatProcessWarning({ date: "2026-07-12" }), null);
  assert.deepEqual(formatProcessWarnings(undefined), []);
});

test("every institution warning has a readable label", async () => {
  const dataDirectory = path.resolve("data/institutions");
  const files = (await readdir(dataDirectory)).filter((file) => file.endsWith(".json"));

  for (const file of files) {
    const institution = JSON.parse(
      await readFile(path.join(dataDirectory, file), "utf8"),
    );
    const sourceWarnings = institution.process?.warnings ?? [];
    const labels = formatProcessWarnings(sourceWarnings);

    assert.equal(labels.length, sourceWarnings.length, `${file}: unreadable warning`);
    assert.equal(
      labels.some((label) => label.toLowerCase().includes("[object object]")),
      false,
      `${file}: object coercion leaked into the UI`,
    );
  }
});
