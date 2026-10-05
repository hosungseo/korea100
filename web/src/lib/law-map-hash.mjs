// URL 해시 ↔ 보드 상태. `#a=<조문id>` 포커스, `#route=<from>..<to>` 경로.
export function parseLawMapHash(hash) {
  const raw = String(hash ?? "").replace(/^#/, "");
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const route = params.get("route");
  if (route && route.includes("..")) {
    const [from, to] = route.split("..");
    if (from && to) return { route: [from, to] };
  }
  const article = params.get("a");
  return article ? { article } : {};
}

export function formatLawMapHash({ article, route } = {}) {
  const params = new URLSearchParams();
  if (route) params.set("route", `${route[0]}..${route[1]}`);
  else if (article) params.set("a", article);
  const s = params.toString();
  return s ? `#${s}` : "";
}
