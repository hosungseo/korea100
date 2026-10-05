// URL 해시 ↔ 보드 상태. `#a=<조문id>` 포커스, `#route=<from>..<to>` 경로, `v=o|d` 보기(큰 그림·자세히).
// `v`는 a=·route=와 같이 쓸 수 있다. a=·route=만 있고 v가 없으면 보드는 자세히 보기로 복원한다(옛 링크 호환).
const VIEW_CODES = { overview: "o", detail: "d" };
const VIEW_BY_CODE = { o: "overview", d: "detail" };

export function parseLawMapHash(hash) {
  const raw = String(hash ?? "").replace(/^#/, "");
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const state = {};
  const view = VIEW_BY_CODE[params.get("v") ?? ""];
  if (view) state.view = view;
  const route = params.get("route");
  if (route && route.includes("..")) {
    const [from, to] = route.split("..");
    if (from && to) return { ...state, route: [from, to] };
  }
  const article = params.get("a");
  return article ? { ...state, article } : state;
}

export function formatLawMapHash({ article, route, view } = {}) {
  const params = new URLSearchParams();
  if (route) params.set("route", `${route[0]}..${route[1]}`);
  else if (article) params.set("a", article);
  if (view && VIEW_CODES[view]) params.set("v", VIEW_CODES[view]);
  const s = params.toString();
  return s ? `#${s}` : "";
}
