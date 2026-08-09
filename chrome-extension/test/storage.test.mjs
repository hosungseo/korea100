import assert from "node:assert/strict";
import test from "node:test";
import { getDraftIndex, readChunked, writeChunked } from "../src/lib/storage.js";

class FakeArea {
  data = {};

  async get(keys) {
    if (typeof keys === "string") return { [keys]: this.data[keys] };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, this.data[key]]));
    return { ...this.data };
  }

  async set(values) {
    Object.assign(this.data, values);
  }

  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key];
  }
}

test("Chrome sync 항목 크기에 맞춰 한글 JSON을 분할하고 복원한다", async () => {
  const area = new FakeArea();
  const value = Array.from({ length: 500 }, (_, index) => `제도-${index}-${"가".repeat(30)}`);
  await writeChunked(area, "sample", value);
  assert.ok(area.data["sample:meta"].count > 1);
  assert.deepEqual(await readChunked(area, "sample", []), value);
});

test("값이 짧아지면 남은 동기화 조각을 제거한다", async () => {
  const area = new FakeArea();
  await writeChunked(area, "sample", ["가".repeat(20_000)]);
  const previousCount = area.data["sample:meta"].count;
  await writeChunked(area, "sample", ["짧은 값"]);
  assert.ok(previousCount > 1);
  assert.equal(area.data["sample:meta"].count, 1);
  assert.equal(area.data["sample:1"], undefined);
});

test("동기화 목록과 현재 기기 목록을 합쳐 최신 초안 색인을 만든다", async () => {
  const sync = new FakeArea();
  const local = new FakeArea();
  globalThis.chrome = { storage: { sync, local, session: new FakeArea() } };
  await writeChunked(sync, "k100:draft-index", [
    { id: "remote", name: "다른 기기", updatedAt: "2026-07-15T00:00:00.000Z" },
    { id: "same", name: "오래된 이름", updatedAt: "2026-07-14T00:00:00.000Z" }
  ]);
  local.data["k100:local-draft-index"] = [
    { id: "local", name: "현재 기기", updatedAt: "2026-07-16T00:00:00.000Z" },
    { id: "same", name: "최신 이름", updatedAt: "2026-07-16T01:00:00.000Z" }
  ];
  const index = await getDraftIndex();
  assert.deepEqual(index.map((item) => item.id), ["same", "local", "remote"]);
  assert.equal(index[0].name, "최신 이름");
  delete globalThis.chrome;
});
