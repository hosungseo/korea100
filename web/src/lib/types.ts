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

export interface SourceVerification {
  status: SourceVerificationStatus;
  verifiedAt: string;
  method: string;
  scope: string;
  notes?: string[];
  sources: LegalSource[];
  unresolved?: UnresolvedLegalSource[];
  articleVerification?: ArticleVerificationSummary;
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
}

export type NodeStatus = "done" | "current" | "waiting" | "risk" | "loop";
export type NodeType = "task" | "gateway" | "notice" | "system";
export type EdgeType = "sequence" | "message" | "loop";

export interface ProcessNode {
  id: string;
  name: string;
  lane: string;
  stage: string;
  type: NodeType;
  status: NodeStatus;
  progress?: number;
  actor: string;
  action?: string;
  input_documents?: string[];
  output_documents?: string[];
  deadline?: string;
  blocker?: string | null;
  confidence?: number;
  legal_basis?: ProcessNodeLegalBasis[];
}

export interface ProcessEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  label?: string | null;
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
