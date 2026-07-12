import { parseArticleHeaders } from "./article-citations.mjs";

function articleContent(payload) {
  const content = payload?.AdmRulService?.["조문내용"];
  if (Array.isArray(content)) return content.filter((item) => typeof item === "string").join("\n");
  return typeof content === "string" ? content : "";
}

export function parseAdminRuleArticleHeaders(payload) {
  return parseArticleHeaders(articleContent(payload));
}

export async function fetchAdminRuleArticleHeaders(serial, { oc, signal } = {}) {
  if (!serial || !oc) throw new Error("행정규칙 일련번호와 법제처 API 인증값이 필요합니다.");

  const url = new URL("https://www.law.go.kr/DRF/lawService.do");
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "admrul");
  url.searchParams.set("ID", serial);
  url.searchParams.set("type", "JSON");

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`행정규칙 본문 API 응답 오류: ${response.status}`);

  const payload = await response.json();
  const found = parseAdminRuleArticleHeaders(payload);
  if (found.size === 0) {
    throw new Error(
      typeof payload?.Law === "string" ? payload.Law : "행정규칙 JSON 본문에 조문 내용이 없습니다.",
    );
  }
  return found;
}
