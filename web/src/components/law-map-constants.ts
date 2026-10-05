import type { EdgeKind, Tier } from "@/lib/law-map-types";

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
