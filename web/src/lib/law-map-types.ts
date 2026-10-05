export type Tier = "statute" | "decree" | "rule" | "adminRule" | "ordinance";
export type EdgeKind = "decree" | "rule" | "adminRule" | "ordinance" | "cites";

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
