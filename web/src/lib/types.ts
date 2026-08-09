export type LegalBasisKind =
  | "법률"
  | "대통령령"
  | "총리령"
  | "부령"
  | "행정안전부령"
  | "대법원규칙"
  | "감사원규칙"
  | "행정규칙"
  | "고시·지침"
  | "조약"
  | "조례"
  | "조례·규칙";

export interface LegalBasis {
  law: string;
  articles?: string;
  kind: LegalBasisKind;
}

export type SourceVerificationStatus =
  | "source-linked"
  | "article-verified"
  | "needs-review";

export type LegalSourceType = "statute" | "admin-rule" | "treaty";

export interface LegalSource {
  law: string;
  kind: LegalBasisKind;
  sourceType?: LegalSourceType;
  officialName?: string;
  lawId?: string;
  mst?: string;
  adminRuleId?: string;
  adminRuleSerial?: string;
  treatyId?: string;
  treatyNumber?: string;
  promulgatedOn?: string;
  effectiveOn?: string;
  officialUrl: string;
}

export interface UnresolvedLegalSource {
  law: string;
  kind: LegalBasisKind;
  reasonCode:
    | "local-scope"
    | "institution-scope"
    | "internal-rule"
    | "external-official-document"
    | "title-needs-confirmation";
  reason: string;
  nextStep: string;
}

export interface ArticleVerificationSummary {
  checkedAt: string;
  method: string;
  citationEntries: number;
  explicitCitationEntries: number;
  articleReferences: number;
  verifiedReferences: number;
  missingReferences: number;
  uncheckableReferences: number;
}

export interface ArticleTextEntry {
  sourceKey: string;
  article: string;
  citation: string;
  title?: string;
  text: string;
  effectiveOn?: string | null;
  checkedAt: string;
}

export interface SourceVerification {
  status: SourceVerificationStatus;
  verifiedAt: string;
  method: string;
  scope: string;
  notes?: string[];
  sources: LegalSource[];
  unresolved?: UnresolvedLegalSource[];
  articleVerification?: ArticleVerificationSummary;
  articleTexts?: Record<string, ArticleTextEntry[]>;
}

export interface Authority {
  name: string;
  role: string;
}

export interface Canvas {
  purpose: string;
  stakeholders: string;
  legalBasis: LegalBasis[];
  authorities: Authority[];
  procedure: string[];
  moneyFlow: string;
  docsFlow: string;
  bottlenecks: string[];
  reformPoints: string[];
}

export interface ProcessNodeLegalBasis {
  law: string;
  article: string;
  text?: string;
  unverified?: boolean;
}

export type NodeStatus = "done" | "current" | "waiting" | "risk" | "loop";
export type NodeType = "task" | "gateway" | "notice" | "system";
export type EdgeType = "sequence" | "message" | "loop";
export type AgentReadinessLevel = "R0" | "R1" | "R2" | "R3" | "R4";
export type AgentMode = "reference-only" | "next-action";
export type AgentTriggerEvent =
  | "procedure.started"
  | "predecessor.completed"
  | "application.received"
  | "approval.completed"
  | "notice.received"
  | "supplement.requested"
  | "external.reply.received"
  | "objection.filed"
  | "inspection.completed"
  | "manual.confirmed";
export type AgentObligation = "required" | "conditional" | "optional" | "operational" | "unclassified";
export type AgentBasisStatus = "citation-verified" | "source-linked" | "unverified" | "descriptive" | "none";
export type AgentAutomationLevel = "inform-only" | "draft-with-review" | "manual-only";
export type AgentDeadlineRuleType =
  | "statutory"
  | "internal-target"
  | "document-defined"
  | "not-specified"
  | "needs-verification";

export interface AgentNodeContract {
  trigger_event: AgentTriggerEvent;
  trigger_condition: string;
  completion_condition: string;
  obligation: AgentObligation;
  basis_status: AgentBasisStatus;
  automation_level: AgentAutomationLevel;
  human_confirmation_required: true;
  resolved_input_documents: string[];
  completion_evidence: string[];
  handoff_recipients: string[];
  deadline_rule: {
    type: AgentDeadlineRuleType;
    expression: string | null;
  };
  derivation: "existing-data-and-graph";
}

export interface AgentTransitionContract {
  condition: string;
  transition_type: "required" | "conditional";
  handoff: {
    from_actor: string;
    to_actor: string;
    documents: string[];
  };
  human_confirmation_required: true;
}

export interface AgentReadinessMetrics {
  nodes: number;
  edges: number;
  node_contract_coverage: number;
  transition_contract_coverage: number;
  explicit_basis_coverage: number;
  output_document_coverage: number;
  low_confidence_nodes: number;
  template_like_nodes: number;
  deadline_review_nodes: number;
  field_verification_items: number;
}

export interface AgentLiveLegalCheckIssue {
  node_id: string;
  law: string;
  article: string;
  reason: string;
}

export interface AgentLiveLegalSourceResult {
  law: string;
  source_type: "statute" | "admin-rule";
  source_id: string;
  official_url: string;
  status: "passed" | "partial" | "failed";
  official_name?: string;
  version_key?: string;
  promulgated_on?: string;
  effective_on?: string;
  requested_articles: string[];
  verified_articles: string[];
  missing_articles: string[];
  error?: string;
}

export interface AgentLiveLegalCheck {
  checked_at: string;
  method: "law.go.kr-DRF-direct";
  status: "passed" | "partial" | "failed";
  citation_fingerprint: `sha256:${string}`;
  sources_checked: number;
  source_failures: number;
  article_references: number;
  verified_references: number;
  missing_references: AgentLiveLegalCheckIssue[];
  uncheckable_references: AgentLiveLegalCheckIssue[];
  verified_node_ids: string[];
  unverified_node_ids: string[];
  source_results: AgentLiveLegalSourceResult[];
}

export interface AgentReadiness {
  contract_version: "1.1.0";
  level: AgentReadinessLevel;
  mode: AgentMode;
  assessed_at: string;
  assessment_method: string;
  live_legal_check: "required-before-use";
  last_live_check?: AgentLiveLegalCheck;
  actionable_node_ids: string[];
  reference_only_node_ids: string[];
  blockers: string[];
  metrics: AgentReadinessMetrics;
}

export interface ProcessNode {
  id: string;
  name: string;
  lane: string;
  stage: string;
  type: NodeType;
  status: NodeStatus;
  progress?: number;
  actor: string;
  receiver?: string;
  recipients?: string[];
  action?: string;
  input_documents?: string[];
  output_documents?: string[];
  deadline?: string;
  blocker?: string | null;
  confidence?: number;
  legal_basis?: ProcessNodeLegalBasis[];
  agent?: AgentNodeContract;
}

export interface ProcessEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  label?: string | null;
  agent_transition?: AgentTransitionContract;
}

export interface ProcessLaneGroup {
  id: string;
  title: string;
  lanes: string[];
  accent: string;
}

export interface ProcessModel {
  institution_name?: string;
  law_name?: string;
  lanes: string[];
  stages: string[];
  nodes: ProcessNode[];
  edges: ProcessEdge[];
  agent_readiness?: AgentReadiness;
  warnings?: import("./process-warnings.mjs").ProcessWarning[];
}

export interface Institution {
  slug: string;
  name: string;
  oneLiner: string;
  type: string;
  priority: number;
  category?: string;
  whyFirst: string;
  asOfDate: string;
  status: "full" | "canvas";
  canvas: Canvas;
  related: string[];
  fieldVerification: string[];
  verification?: SourceVerification;
  process?: ProcessModel;
}

export interface InstitutionSummary {
  slug: string;
  name: string;
  oneLiner: string;
  type: string;
  priority: number;
  category: string;
  asOfDate: string;
  processNodeCount: number;
  processStageCount: number;
  processLaneCount: number;
  processGatewayCount: number;
  legalBasisCount: number;
  fieldVerificationCount: number;
  bottleneckCount: number;
  verificationStatus?: SourceVerificationStatus;
  verifiedReferences: number;
  articleReferences: number;
  sourceCount: number;
  laws: string[];
}

export interface InstitutionComparison {
  slug: string;
  purpose: string;
  stakeholders: string;
  authorityNames: string[];
  legalBasisNames: string[];
  moneyFlow: string;
  docsFlow: string;
  keyBottlenecks: string[];
  keyReformPoints: string[];
}

export interface FieldVerificationEntry {
  id: string;
  priority: number;
  slug: string;
  institutionName: string;
  category: string;
  item: string;
  domain: string;
  suggestedEvidence: string;
  status: "open" | "reviewing" | "verified";
}

export interface FieldVerificationQueue {
  sourceAsOfDate: string;
  total: number;
  institutions: number;
  byDomain: Record<string, number>;
  entries: FieldVerificationEntry[];
}
