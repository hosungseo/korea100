export type MegaProjectStatus =
  | "policy-announced"
  | "planning"
  | "permitting"
  | "construction"
  | "operating";

export type MegaNodeStatus = "completed" | "active" | "planned" | "unknown";
export type MegaNodeClassification =
  | "policy"
  | "governance"
  | "plan"
  | "legal_gate"
  | "protection_gate"
  | "technical_gate"
  | "delivery"
  | "operation";
export type MegaNodeConfidence = "official" | "statutory" | "modeled" | "unknown";
export type MegaDependencyRelation =
  | "finish_to_start"
  | "start_to_start"
  | "finish_to_finish"
  | "satisfied_by";
export type MegaDependencyStrength = "hard" | "soft";
export type MegaDependencyKind =
  | "legal"
  | "protection"
  | "technical"
  | "policy"
  | "financial";
export type MegaRuleValue = boolean | string | null;

export interface MegaArtifact {
  id: string;
  label: string;
  category: string;
  definition: string;
  producerMode?: "alternative";
}

export interface MegaArtifactRegistry {
  schemaVersion: "1.0.0";
  id: string;
  asOfDate: string;
  description: string;
  artifacts: MegaArtifact[];
}

export interface MegaProjectParameter {
  value: MegaRuleValue | number;
  unit?: string;
  status: "known" | "unknown";
  reason?: string;
}

export interface MegaProjectRule {
  id: string;
  type: "boolean" | "enum";
  parameter: string;
  default: MegaRuleValue;
  allowed?: string[];
  description: string;
}

export interface MegaProjectSource {
  id: string;
  type: string;
  title: string;
  publishedOn?: string;
  effectiveOn?: string;
  url: string;
}

export interface MegaProjectStage {
  id: string;
  label: string;
}

export interface MegaProjectActor {
  id: string;
  code: string;
  label: string;
  shortLabel: string;
  mandate: string;
}

export interface MegaActorRoles {
  lead: string[];
  consult: string[];
  decision: string[];
}

export interface MegaRuleCondition {
  rule: string;
  equals: MegaRuleValue;
}

export type MegaNodeActivation =
  | { mode: "always" }
  | ({ mode: "rule" } & MegaRuleCondition);

export interface MegaDependency {
  artifact: string;
  relation: MegaDependencyRelation;
  strength: MegaDependencyStrength;
  kind: MegaDependencyKind;
  basis: string[];
  note?: string;
  whenRule?: MegaRuleCondition;
}

export interface MegaTemplateReference {
  institution: string;
  nodeIds?: string[];
}

export interface MegaProjectNode {
  id: string;
  name: string;
  stage: string;
  authority: string;
  leadActor: string;
  actorRoles: MegaActorRoles;
  classification: MegaNodeClassification;
  status: MegaNodeStatus;
  confidence: MegaNodeConfidence;
  activation: MegaNodeActivation;
  requires: MegaDependency[];
  produces: string[];
  templateRefs?: MegaTemplateReference[];
  evidence: string[];
  actual?: { completedOn?: string };
  note?: string;
  verificationNeeded?: string;
}

export interface MegaProject {
  schemaVersion: "1.0.0";
  id: string;
  name: string;
  projectFamily: string;
  asOfDate: string;
  status: MegaProjectStatus;
  summary: string;
  scope: Record<string, string>;
  parameters: Record<string, MegaProjectParameter>;
  rules: MegaProjectRule[];
  sources: MegaProjectSource[];
  stages: MegaProjectStage[];
  actors: MegaProjectActor[];
  nodes: MegaProjectNode[];
}

export interface MegaProjectBundle {
  project: MegaProject;
  artifacts: MegaArtifact[];
  templates: Record<string, string>;
}

export type MegaRuleValues = Record<string, MegaRuleValue>;
export type MegaActivationState = "active" | "inactive" | "unknown";
export type MegaDisplayStatus =
  | "completed"
  | "active"
  | "ready"
  | "blocked"
  | "conditional"
  | "inactive";
