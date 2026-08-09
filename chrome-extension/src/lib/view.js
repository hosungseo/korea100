const ICONS = new Set([
  "arrow-down",
  "arrow-up",
  "book-open",
  "check",
  "chevron-left",
  "circle-alert",
  "copy",
  "database",
  "download",
  "external-link",
  "file-text",
  "folder-open",
  "git-pull-request",
  "inbox",
  "link-2",
  "panel-right-open",
  "pencil",
  "plus",
  "save",
  "search",
  "settings-2",
  "shield-check",
  "star",
  "trash-2",
  "upload",
  "x"
]);

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function icon(name, className = "") {
  if (!ICONS.has(name)) return "";
  return `<img class="icon ${escapeHtml(className)}" src="icons/${name}.svg" alt="" aria-hidden="true">`;
}

export function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export function downloadJson(filename, value) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function slugifyFilename(value) {
  return String(value || "korea100")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "korea100";
}
