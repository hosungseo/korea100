import { MAX_CAPTURE_LENGTH } from "./constants.js";

const RULES = [
  {
    code: "resident-number",
    label: "주민·외국인등록번호",
    pattern: /\b\d{6}\s*[- ]\s*[1-8]\d{6}\b/g
  },
  {
    code: "email",
    label: "이메일 주소",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
  },
  {
    code: "phone",
    label: "전화번호",
    pattern: /(?:\+?82[-\s]?)?(?:0?1[016789]|0(?:2|[3-6][1-5]))[-\s]?\d{3,4}[-\s]?\d{4}\b/g
  },
  {
    code: "long-number",
    label: "계좌·카드로 보이는 긴 숫자",
    pattern: /\b(?:\d[-\s]?){13,19}\b/g
  },
  {
    code: "secret-query",
    label: "인증정보가 포함된 링크",
    pattern: /[?&](?:access_?token|api_?key|auth|password|session|secret)=/gi
  }
];

function visit(value, path, findings) {
  if (typeof value === "string") {
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(value)) {
        findings.push({ code: rule.code, label: rule.label, path });
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${path}[${index}]`, findings));
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => visit(item, `${path}.${key}`, findings));
  }
}

export function scanForPersonalData(value) {
  const findings = [];
  visit(value, "$", findings);
  const specificNumberPaths = new Set(
    findings.filter((finding) => finding.code === "resident-number").map((finding) => finding.path)
  );
  const seen = new Set();
  return findings.filter((finding) => {
    if (finding.code === "long-number" && specificNumberPaths.has(finding.path)) return false;
    const key = `${finding.code}:${finding.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeText(value, maxLength = MAX_CAPTURE_LENGTH) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeSourceUrl(value) {
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) return "";
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function prepareCapture({ title, url, excerpt }) {
  const capture = {
    title: normalizeText(title, 180) || "제목 없는 웹페이지",
    url: sanitizeSourceUrl(url),
    excerpt: normalizeText(excerpt)
  };
  return { capture, findings: scanForPersonalData(capture) };
}
