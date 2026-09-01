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

async function fetchLawPayloadBy(identifier, value, { oc, signal } = {}) {
  if (!value || !oc) throw new Error("법령 식별자와 법제처 API 인증값이 필요합니다.");

  const url = new URL("https://www.law.go.kr/DRF/lawService.do");
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "law");
  url.searchParams.set(identifier, value);
  url.searchParams.set("type", "JSON");

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`법령 본문 API 응답 오류: ${response.status}`);

  return response.json();
}

async function fetchLawPayload(mst, options = {}) {
  if (!mst) throw new Error("법령 MST와 법제처 API 인증값이 필요합니다.");
  return fetchLawPayloadBy("MST", mst, options);
}

function lawSnapshotMetadata(payload) {
  const law = payload?.["법령"];
  const info = law?.["기본정보"] ?? {};
  return {
    officialName: info["법령명_한글"] ?? null,
    lawId: info["법령ID"] ?? null,
    versionKey: law?.["법령키"] ?? null,
    promulgatedOn: normalizeDate(info["공포일자"]),
    effectiveOn: normalizeDate(info["시행일자"]),
  };
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

/**
 * 지정한 날짜에 시행 중이던 판을 찾는다.
 *
 * lawService의 ID 조회는 최신 공포본을 준다. 공포는 됐지만 시행일이 남은 개정본이면
 * 그것은 현행이 아니다. eflaw 검색은 같은 MST에 대해 시행일자별 행을 돌려주므로
 * 대조일 이전에 시행된 것 중 가장 늦은 판을 고를 수 있다.
 */
export async function resolveEffectiveLawVersion(lawId, { oc, signal, asOf, officialName } = {}) {
  if (!lawId || !oc || !asOf || !officialName) return null;

  const url = new URL("https://www.law.go.kr/DRF/lawSearch.do");
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "eflaw");
  url.searchParams.set("query", officialName);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("display", "100");

  const response = await fetch(url, { signal });
  if (!response.ok) return null;
  const payload = await response.json();
  const rows = [].concat(payload?.LawSearch?.law ?? []);

  return rows
    .filter((row) => String(row["법령ID"]) === String(lawId))
    .map((row) => ({
      mst: String(row["법령일련번호"] ?? ""),
      effectiveOn: normalizeDate(row["시행일자"]),
      historyCode: row["현행연혁코드"] ?? null,
    }))
    .filter((row) => row.mst && row.effectiveOn && row.effectiveOn <= asOf)
    .sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn))[0] ?? null;
}

async function fetchEffectiveLawPayload(mst, effectiveOn, { oc, signal } = {}) {
  const url = new URL("https://www.law.go.kr/DRF/lawService.do");
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "eflaw");
  url.searchParams.set("MST", mst);
  url.searchParams.set("efYd", effectiveOn.replace(/-/gu, ""));
  url.searchParams.set("type", "JSON");

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`시행일 법령 본문 API 응답 오류: ${response.status}`);
  return response.json();
}

export async function fetchCurrentLawArticleSnapshot(lawId, options = {}) {
  if (!lawId) throw new Error("법령 ID와 법제처 API 인증값이 필요합니다.");

  // 대조일과 공식 법령명을 알면 그 날짜에 시행 중이던 판을 직접 집는다.
  const version = await resolveEffectiveLawVersion(lawId, options).catch(() => null);
  if (version) {
    const payload = await fetchEffectiveLawPayload(version.mst, version.effectiveOn, options);
    const headers = parseLawArticleHeaders(payload);
    if (headers.size > 0) {
      return { headers, ...lawSnapshotMetadata(payload), resolvedBy: "eflaw", mst: version.mst };
    }
  }

  const payload = await fetchLawPayloadBy("ID", lawId, options);
  const headers = parseLawArticleHeaders(payload);
  if (headers.size === 0) throw new Error("현행 법령 JSON 본문에 조문 내용이 없습니다.");
  return { headers, ...lawSnapshotMetadata(payload), resolvedBy: "law-id" };
}
