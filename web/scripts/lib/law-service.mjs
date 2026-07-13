import { articleLabel } from "./article-citations.mjs";

function articleUnits(payload) {
  const units = payload?.["법령"]?.["조문"]?.["조문단위"];
  return Array.isArray(units) ? units : [];
}

export function parseLawArticleHeaders(payload) {
  const headers = new Set();
  for (const unit of articleUnits(payload)) {
    if (unit?.["조문여부"] !== "조문") continue;
    const article = unit["조문번호"];
    const branch = unit["조문가지번호"];
    if (!/^\d+$/.test(article ?? "")) continue;
    headers.add(articleLabel(article, /^\d+$/.test(branch ?? "") ? branch : null));
  }
  return headers;
}

export async function fetchLawArticleHeaders(mst, { oc, signal } = {}) {
  if (!mst || !oc) throw new Error("법령 MST와 법제처 API 인증값이 필요합니다.");

  const url = new URL("https://www.law.go.kr/DRF/lawService.do");
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "law");
  url.searchParams.set("MST", mst);
  url.searchParams.set("type", "JSON");

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`법령 본문 API 응답 오류: ${response.status}`);

  const payload = await response.json();
  const found = parseLawArticleHeaders(payload);
  if (found.size === 0) throw new Error("법령 JSON 본문에 조문 내용이 없습니다.");
  return found;
}
