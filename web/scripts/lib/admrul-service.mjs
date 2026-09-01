// 행정규칙(고시·훈령·예규) 조문 조회.
//
// 법령(target=law/eflaw)과 응답 구조가 다르다. 법령은 `조문단위` 배열에 조·항·호가
// 구조화돼 오지만, 행정규칙은 `조문내용`이 **평면 문자열 배열**로 온다 — 장 제목,
// 조문 제목줄, 항, 호가 한 줄씩 순서대로 들어 있을 뿐 계층이 없다. 그래서 조문 경계를
// 이 쪽에서 다시 그어야 한다.
//
// 이걸 만든 이유: R2 17종 중 `national-rd-fund-use-settlement`만 인용문이 전부
// 스텁("…에 따른 절차")으로 남아 있었는데, 근거 15건이 고시라 법령 API 경로로는
// 원문을 받을 수 없었다.

import { resolveLawGoKrOc } from "./law-go-kr-oc.mjs";

const BASE = "https://www.law.go.kr/DRF";

/** "제73조(연구개발비의 사용 원칙)" 같은 조문 머리. 장·절 제목("제1장 총칙")은 제외한다. */
const ARTICLE_HEAD = /^제(\d+)조(의\d+)?\s*(\(([^)]*)\))?/;

export async function searchAdmRul(query, { oc = resolveLawGoKrOc(), signal } = {}) {
  const url = new URL(`${BASE}/lawSearch.do`);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "admrul");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "JSON");
  url.searchParams.set("display", "100");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`행정규칙 검색 응답 오류: ${response.status}`);
  const payload = await response.json();
  return [].concat(payload?.AdmRulSearch?.admrul ?? []).map((row) => ({
    id: String(row["행정규칙일련번호"] ?? ""),
    name: row["행정규칙명"] ?? "",
    kind: row["행정규칙종류"] ?? null,
    effectiveOn: normalizeDate(row["시행일자"]),
    ministry: row["소관부처명"] ?? null,
  }));
}

function normalizeDate(value) {
  const digits = String(value ?? "").replace(/\D/gu, "");
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : null;
}

/**
 * 평면 줄 배열을 조문 단위로 묶는다.
 *
 * 조문 머리로 시작하는 줄에서 새 조문을 열고, 다음 조문 머리를 만날 때까지의 줄을
 * 그 조문의 본문으로 모은다. 장·절 제목 줄은 어느 조문에도 넣지 않는다 —
 * 넣으면 인용문에 "제3장 연구개발비의 사용"이 섞여 원문이 아니게 된다.
 */
export function parseAdmRulArticles(payload) {
  const root = payload?.AdmRulService ?? payload;
  const lines = [].concat(root?.조문내용 ?? []).map((line) => String(line ?? "").trim()).filter(Boolean);
  const articles = [];
  let current = null;
  for (const line of lines) {
    const head = ARTICLE_HEAD.exec(line);
    if (head) {
      if (current) articles.push(current);
      current = {
        article: `제${head[1]}조${head[2] ?? ""}`,
        title: head[4] ?? null,
        lines: [line],
      };
      continue;
    }
    // 조문이 시작되기 전의 장·절 제목은 버린다.
    if (current) current.lines.push(line);
  }
  if (current) articles.push(current);
  return articles.map((entry) => ({
    article: entry.article,
    title: entry.title,
    content: entry.lines.join("\n"),
  }));
}

export async function fetchAdmRulArticles(id, { oc = resolveLawGoKrOc(), signal } = {}) {
  const url = new URL(`${BASE}/lawService.do`);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "admrul");
  url.searchParams.set("ID", id);
  url.searchParams.set("type", "JSON");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`행정규칙 본문 응답 오류: ${response.status}`);
  const payload = await response.json();
  const basic = (payload?.AdmRulService ?? payload)?.행정규칙기본정보 ?? {};
  return {
    id: String(id),
    name: basic["행정규칙명"] ?? null,
    kind: basic["행정규칙종류"] ?? null,
    effectiveOn: normalizeDate(basic["시행일자"]),
    articles: parseAdmRulArticles(payload),
  };
}

/**
 * 이름으로 찾아 본문까지 가져온다. 대조일에 시행 중인 판만 쓴다 —
 * 행정규칙도 시행일이 남은 개정본이 검색에 섞여 온다(원칙 5의 같은 함정).
 */
export async function fetchAdmRulByName(name, { asOf, oc = resolveLawGoKrOc(), signal } = {}) {
  const rows = await searchAdmRul(name, { oc, signal });
  const exact = rows.filter((row) => row.name === name);
  const pool = exact.length ? exact : rows;
  const inForce = pool
    .filter((row) => row.effectiveOn && (!asOf || row.effectiveOn <= asOf))
    .sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn));
  if (!inForce.length) return null;
  const snapshot = await fetchAdmRulArticles(inForce[0].id, { oc, signal });
  return { ...snapshot, pending: pool.filter((row) => row.effectiveOn && asOf && row.effectiveOn > asOf) };
}

/** "제73조제1항" 같은 표기에서 조 부분만 떼어 본문을 찾는다. */
export function findArticle(articles, reference) {
  const match = String(reference ?? "").match(/제\d+조(의\d+)?/);
  if (!match) return null;
  return articles.find((entry) => entry.article === match[0]) ?? null;
}
