import assert from "node:assert/strict";
import test from "node:test";
import { prepareCapture, sanitizeSourceUrl, scanForPersonalData } from "../src/lib/privacy.js";

test("개인정보 유형을 탐지한다", () => {
  const findings = scanForPersonalData({
    email: "person@example.com",
    phone: "010-1234-5678",
    resident: "900101-1234567"
  });
  assert.deepEqual(
    new Set(findings.map((finding) => finding.code)),
    new Set(["email", "phone", "resident-number"])
  );
});

test("법령 조문과 날짜는 개인정보로 오인하지 않는다", () => {
  const findings = scanForPersonalData("근로기준법 제76조의3, 원문 확인일 2026-07-16");
  assert.equal(findings.length, 0);
});

test("캡처 링크에서 쿼리와 해시를 제거한다", () => {
  assert.equal(
    sanitizeSourceUrl("https://example.com/path?token=secret&item=1#part"),
    "https://example.com/path"
  );
  assert.equal(sanitizeSourceUrl("chrome://extensions"), "");
});

test("캡처 본문을 정규화하고 개인정보를 함께 검사한다", () => {
  const { capture, findings } = prepareCapture({
    title: "  자료  ",
    url: "https://example.com/a?q=1",
    excerpt: "문의: person@example.com"
  });
  assert.equal(capture.title, "자료");
  assert.equal(capture.url, "https://example.com/a");
  assert.equal(findings[0].code, "email");
});
