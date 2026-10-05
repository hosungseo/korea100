import type { Article, EdgeKind, Lane, Tier } from "@/lib/law-map-types";

export const TIER_ORDER: Tier[] = ["statute", "decree", "rule", "adminRule", "ordinance"];

export const TIER_LABELS: Record<Tier, string> = {
  statute: "법률",
  decree: "시행령",
  rule: "시행규칙",
  adminRule: "행정규칙",
  ordinance: "자치법규",
};

export const EDGE_ORDER: EdgeKind[] = ["decree", "rule", "adminRule", "ordinance", "cites"];

export const EDGE_LABELS: Record<EdgeKind, string> = {
  decree: "시행령 위임",
  rule: "시행규칙 위임",
  adminRule: "행정규칙 위임",
  ordinance: "조례 위임",
  cites: "인용 법령",
};

export const EDGE_COLORS: Record<EdgeKind, string> = {
  decree: "#2456d6",
  rule: "#0f9f72",
  adminRule: "#7c56c9",
  ordinance: "#c78116",
  cites: "#8a949e",
};

/** Human-readable label for a node id: "<lane name> <article label>" for articles, lane name for lane boxes. */
export function describeNode(id: string, articleById: Map<string, Article>, laneById: Map<string, Lane>): string {
  const article = articleById.get(id);
  if (article) return `${laneById.get(article.laneId)?.name ?? ""} ${article.label}`.trim();
  return laneById.get(id)?.name ?? id;
}
