export type Tier = "statute" | "decree" | "rule" | "adminRule" | "ordinance";
export type EdgeKind = "decree" | "rule" | "adminRule" | "ordinance" | "cites";
export type LawMapView = "overview" | "rule" | "detail";  // 구조도 | 규율 | 자세히

// ── 조문 분류(규칙 기반 추론, scripts/classify-law-articles.mjs → <lawId>.class.json) ──
export type LawMapStage = "purpose" | "standard" | "procedure" | "operation" | "organization" | "supervision" | "penalty" | "misc" | "unknown";
export type LawMapActor = "citizen" | "central" | "local" | "committee" | "court" | "none" | "unknown";

export interface LawMapClassActor {
  actor: LawMapActor;
  role: "primary" | "secondary";
  evidence: string[];
}

export interface LawMapClassEntry {
  stage: LawMapStage;
  actor: LawMapActor;              // 주 주체(actors[0])
  actors?: LawMapClassActor[];     // 주 주체 + 보조 주체(공동 주어, 허가·신고 상대 기관)
  confidence: number;              // 0~1, 두 축 중 낮은 쪽
  evidence: string[];              // "stage/title:허가", "actor/subject:건축주는" …
  method: string;                  // rule:title | rule:text | rule:chapter | unknown
  deleted?: true;
}

export interface LawMapClass {
  lawId: string;
  generatedAt: string;
  method: string;                  // "rule-based v0.1"
  articles: Record<string, LawMapClassEntry>;
  stats: Record<string, unknown>;
}

export interface Lane {
  id: string;                 // "L1" | "D1".."Dn" | "R1".."Rn" | "A1".."An" | "O1"
  tier: Tier;
  name: string;
  kind: string;               // 법종구분: 법률·대통령령·국토교통부령·고시·훈령·조례·규칙
  lawId?: string;
  mst?: string;
  serial?: string;            // 행정규칙일련번호
  effectiveOn?: string | null;
  officialUrl: string;        // law.go.kr 공개 URL (OC 없음)
  articleCount: number;
  collapsed?: { count: number; items: { name: string; serial: string }[] };
}

export interface Article {
  id: string;                 // `${laneId}:제11조`
  laneId: string;
  no: number;
  branch: number | null;
  label: string;              // "제11조"
  title: string;
  chapter: string | null;
  officialUrl: string;
}

export interface Edge {
  id: string;
  from: string;               // Article.id
  fromClause: string | null;  // "제2조제1항제11호"
  to: string | null;          // Article.id | Lane.id | null
  kind: EdgeKind;
  phrase: string;
  targetName: string;
  targetLabel?: string;
  targetTitle?: string;       // 도착 조문 제목 (시행령·시행규칙 위임, 미해결이어도 있으면 둔다)
  unresolved?: true;
}

export interface InstitutionRef {
  slug: string;
  name: string;
  articles: string[];
}

export interface LawMapStats {
  articlesByTier: Record<Tier, number>;
  edgesByKind: Record<EdgeKind, number>;
  unresolved: number;
}

export interface LawMap {
  schemaVersion: 1;
  lawId: string;
  mst: string;
  name: string;
  ministry: string | null;
  effectiveOn: string | null;
  promulgatedOn: string | null;
  generatedAt: string;
  lanes: Lane[];
  articles: Article[];
  edges: Edge[];
  institutions: InstitutionRef[];
  stats: LawMapStats;
}

export interface LawMapIndexEntry {
  lawId: string;
  name: string;
  ministry: string | null;
  effectiveOn: string | null;
  articleCount: number;
  edgeCount: number;
  institutionCount: number;
  unresolved: number;
  names: string[];            // 법률·시행령·시행규칙 레인 이름 (제도 → 법령 지도 링크 매칭용)
}

export interface LawMapIndex {
  generatedAt: string;
  laws: LawMapIndexEntry[];
}

export type LawMapTexts = Record<string, string>; // Article.id → 미리보기 텍스트
