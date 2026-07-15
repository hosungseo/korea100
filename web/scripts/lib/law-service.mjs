import { articleLabel } from "./article-citations.mjs";

function articleUnits(payload) {
  const units = payload?.["법령"]?.["조문"]?.["조문단위"];
  return Array.isArray(units) ? units : [];
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value && typeof value === "object" ? [value] : [];
}

function normalizeDate(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 8
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    : null;
}

function pushLine(lines, value) {
  if (typeof value !== "string") return;
  const line = value.trim();
  if (line) lines.push(line);
}

function flattenItems(items, contentKey, childKey, lines) {
  for (const item of asArray(items)) {
    pushLine(lines, item?.[contentKey]);
    if (childKey) flattenItems(item?.[childKey], childKey === "호" ? "호내용" : "목내용", childKey === "호" ? "목" : null, lines);
  }
}

function stripArticleHeading(value) {
  return String(value ?? "")
    .replace(/^\s*제\s*\d+\s*조(?:\s*의\s*\d+)?(?:\s*\([^)]*\))?\s*/, "")
    .trim();
}

function lawArticleText(unit) {
  const lines = [];
  const paragraphs = asArray(unit?.["항"]);
  if (paragraphs.length > 0) {
    flattenItems(paragraphs, "항내용", "호", lines);
  } else {
    pushLine(lines, stripArticleHeading(unit?.["조문내용"]));
    flattenItems(unit?.["호"], "호내용", "목", lines);
  }
  return lines.join("\n").trim();
}

export function parseLawArticles(payload) {
  const articles = new Map();
  for (const unit of articleUnits(payload)) {
    if (unit?.["조문여부"] !== "조문") continue;
    const article = unit["조문번호"];
    const branch = unit["조문가지번호"];
    if (!/^\d+$/.test(article ?? "")) continue;
    const label = articleLabel(article, /^\d+$/.test(branch ?? "") ? branch : null);
    articles.set(label, {
      article: label,
      title: typeof unit["조문제목"] === "string" ? unit["조문제목"].trim() : undefined,
      text: lawArticleText(unit),
      effectiveOn: normalizeDate(unit["조문시행일자"]),
    });
  }
  return articles;
}

export function parseLawArticleHeaders(payload) {
  return new Set(parseLawArticles(payload).keys());
}

async function fetchLawPayload(mst, { oc, signal } = {}) {
  if (!mst || !oc) throw new Error("법령 MST와 법제처 API 인증값이 필요합니다.");

  const url = new URL("https://www.law.go.kr/DRF/lawService.do");
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "law");
  url.searchParams.set("MST", mst);
  url.searchParams.set("type", "JSON");

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`법령 본문 API 응답 오류: ${response.status}`);

  return response.json();
}

export async function fetchLawArticles(mst, options = {}) {
  const payload = await fetchLawPayload(mst, options);
  const found = parseLawArticles(payload);
  if (found.size === 0) throw new Error("법령 JSON 본문에 조문 내용이 없습니다.");
  return found;
}

export async function fetchLawArticleHeaders(mst, options = {}) {
  const payload = await fetchLawPayload(mst, options);
  const found = parseLawArticleHeaders(payload);
  if (found.size === 0) throw new Error("법령 JSON 본문에 조문 내용이 없습니다.");
  return found;
}
