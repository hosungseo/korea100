import type { LawMap, LawMapActor, LawMapClass, LawMapStage } from "./law-map-types";

export const STAGE_ORDER: Exclude<LawMapStage, "unknown">[];
export const STAGE_LABELS: Record<LawMapStage, string>;
export const ACTOR_ORDER: Exclude<LawMapActor, "unknown">[];
export const ACTOR_LABELS: Record<LawMapActor, string>;
export const UNCLASSIFIED_LABEL: string;
export const CELL_CHIP_LIMIT: number;
export const LOW_CONFIDENCE: number;

export interface RuleDelegations { decree: number; rule: number }

export interface RuleChip {
  id: string;
  label: string;
  title: string;
  stage: LawMapStage;
  actor: LawMapActor;
  confidence: number;
  lowConfidence: boolean;
  secondary: { actor: LawMapActor; evidence: string[] }[];
  evidence: string[];
  method: string;
  delegations: RuleDelegations;
}

export interface RuleCell {
  stage: LawMapStage;
  actor: LawMapActor;
  articles: RuleChip[];
  delegations: RuleDelegations;
}

export interface RuleColumn { stage: LawMapStage; label: string; count: number }
export interface RuleRow { actor: LawMapActor; label: string; count: number }
export interface RuleHeadline { title: string; subtitle: string }

export interface RuleGrid {
  columns: RuleColumn[];
  rows: RuleRow[];
  cells: RuleCell[];
  cellOf: (stage: LawMapStage, actor: LawMapActor) => RuleCell | null;
  total: number;
  deleted: number;
  lowConfidence: number;
  withSecondary: number;
  method: string | null;
  headline: RuleHeadline;
}

export function buildRuleGrid(map: LawMap, classMap: LawMapClass | null): RuleGrid;
export function buildRuleHeadline(map: LawMap, classMap: LawMapClass | null): RuleHeadline;
export function describeEvidence(evidence: string[] | undefined, limit?: number): string[];
