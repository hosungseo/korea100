const DESCRIPTION_KEYS = ["message", "detail", "content", "내용"];

export function formatProcessWarning(warning) {
  if (typeof warning === "string") {
    return warning.trim() || null;
  }

  if (!warning || typeof warning !== "object" || Array.isArray(warning)) {
    return null;
  }

  const description = DESCRIPTION_KEYS
    .map((key) => warning[key])
    .find((value) => typeof value === "string" && value.trim());

  if (typeof description !== "string") {
    return null;
  }

  const text = description.trim();
  const date = typeof warning.date === "string" ? warning.date.trim() : "";

  return date && !text.includes(date) ? `${date} · ${text}` : text;
}

export function formatProcessWarnings(warnings) {
  if (!Array.isArray(warnings)) return [];

  return warnings
    .map(formatProcessWarning)
    .filter((warning) => warning !== null);
}
