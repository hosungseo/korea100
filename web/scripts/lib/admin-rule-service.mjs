import { parseArticleHeaders } from "./article-citations.mjs";

function articleContent(payload) {
  const service = payload?.AdmRulService;
  const content = service?.["조문내용"] ?? service?.["조문"]?.["조문내용"];
  if (Array.isArray(content)) return content.filter((item) => typeof item === "string").join("\n");
  return typeof content === "string" ? content : "";
}

function articleContentItems(payload) {
  const service = payload?.AdmRulService;
  const content = service?.["조문내용"] ?? service?.["조문"]?.["조문내용"];
  if (Array.isArray(content)) return content.filter((item) => typeof item === "string");
  return typeof content === "string" ? [content] : [];
}

function normalizeDate(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 8
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    : null;
}

function formatBody(value) {
  return value
    .trim()
    .replace(/([^\n])([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚])/g, "$1\n$2")
    .replace(/([^\n\d])(\d+\.\s+)/g, "$1\n$2")
    .replace(/\n{2,}/g, "\n");
}

function splitArticleBlocks(value) {
  const starts = [];
  const pattern = /(?:^|\n)\s*(제\s*\d+\s*조(?:\s*의\s*\d+)?(?:\s*\([^\n)]*\))?)/g;
  for (const match of value.matchAll(pattern)) {
    starts.push(match.index + match[0].indexOf(match[1]));
  }
  if (starts.length === 0) return [];
  return starts.map((start, index) => value.slice(start, starts[index + 1] ?? value.length).trim());
}

export function parseAdminRuleArticles(payload) {
  const articles = new Map();
  const effectiveOn = normalizeDate(payload?.AdmRulService?.["행정규칙기본정보"]?.["시행일자"]);
  for (const item of articleContentItems(payload)) {
    for (const block of splitArticleBlocks(item)) {
      const match = block.match(/^제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*(?:\(([^\n)]*)\))?\s*/);
      if (!match) continue;
      const article = `제${Number(match[1])}조${match[2] ? `의${Number(match[2])}` : ""}`;
      const text = formatBody(block.slice(match[0].length));
      articles.set(article, {
        article,
        title: match[3]?.trim() || undefined,
        text,
        effectiveOn,
      });
    }
  }
  return articles;
}

export function parseAdminRuleArticleHeaders(payload) {
  const parsed = parseAdminRuleArticles(payload);
  return parsed.size > 0 ? new Set(parsed.keys()) : parseArticleHeaders(articleContent(payload));
}

async function fetchAdminRulePayload(serial, { oc, signal } = {}) {
  if (!serial || !oc) throw new Error("행정규칙 일련번호와 법제처 API 인증값이 필요합니다.");

  const url = new URL("https://www.law.go.kr/DRF/lawService.do");
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "admrul");
  url.searchParams.set("ID", serial);
  url.searchParams.set("type", "JSON");

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`행정규칙 본문 API 응답 오류: ${response.status}`);

  return response.json();
}

export async function fetchAdminRuleArticles(serial, options = {}) {
  const payload = await fetchAdminRulePayload(serial, options);
  const found = parseAdminRuleArticles(payload);
  if (found.size === 0) {
    throw new Error(
      typeof payload?.Law === "string" ? payload.Law : "행정규칙 JSON 본문에 조문 내용이 없습니다.",
    );
  }
  return found;
}

export async function fetchAdminRuleArticleHeaders(serial, options = {}) {
  const payload = await fetchAdminRulePayload(serial, options);
  const found = parseAdminRuleArticleHeaders(payload);
  if (found.size === 0) {
    throw new Error(
      typeof payload?.Law === "string" ? payload.Law : "행정규칙 JSON 본문에 조문 내용이 없습니다.",
    );
  }
  return found;
}
