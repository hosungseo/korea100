import type { Edge, EdgeKind, Lane, Tier } from "./law-map-types";
import type { OverviewHeadline } from "./law-map-overview-layout.mjs";

export const TOOLTIP_LIST_MAX: number;
export const ROW_LABELS: string[];

export interface TreeOptions {
  pillarW: number;
  pillarGap: number;
  gutter: number;
  nodeH: number;
  leafH: number;
  stackGap: number;
  rowGap: number;
  collapseAbove: number;
}
export const TREE_DEFAULTS: TreeOptions;

export type TreeNodeKind = "chapter" | "summary" | "adminRules" | "ordinances";

export interface TreeNodeMeta {
  /** 장 노드 */
  laneName?: string;
  laneKind?: string | null;
  isLane?: boolean;
  chapterNo?: string | null;
  chapterRest?: string;
  articleCount?: number;
  /** 요약 상자·행정규칙 상자: 툴팁 목록 */
  items?: string[];
  more?: number;
  childIds?: string[];
  unit?: string;
  laneIds?: string[];
  /** 잎 상자 건수(행정규칙 수 또는 조례 위임 건수) */
  count?: number;
  /** 조례 상자: 전국 조례·규칙 총수 */
  total?: number;
}

export interface TreeNode {
  id: string;
  row: number;
  /** 기둥(법률 장) 번호 */
  pillar: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub: string | null;
  kind: TreeNodeKind;
  tier: Tier;
  laneId: string | null;
  parentId: string | null;
  articleIds: string[];
  orphan: boolean;
  order: number;
  meta: TreeNodeMeta;
}

export interface TreeConnector {
  parentId: string;
  childId: string;
  count: number;
  byKind: Record<Exclude<EdgeKind, "cites">, number>;
}

export interface TreeCrossEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  count: number;
}

export interface TreeRow {
  row: number;
  y: number;
  h: number;
  label: string;
}

export interface TreePillar {
  /** 법률 장 노드 id */
  id: string;
  index: number;
  x: number;
  spineX: number;
  spineY1: number;
  /** 선이 닿는 마지막 자손의 가운데 높이. 자손이 없거나 모두 고아면 null */
  spineY2: number | null;
}

export interface TreeLayout {
  nodes: TreeNode[];
  connectors: TreeConnector[];
  crossEdges: TreeCrossEdge[];
  /** 조문·레인 id → 그려지는 노드 id */
  nodeOf: Map<string, string>;
  rows: TreeRow[];
  pillars: TreePillar[];
  width: number;
  height: number;
  headline: OverviewHeadline;
}

export interface ParentCandidate {
  source: string;
  count: number;
  order: number;
}

export function stackHeight(count: number, nodeH: number, gap: number): number;
export function rowHeights(pillarCounts: Map<number, number>[], nodeHOf: (row: number) => number, gap: number, rowCount?: number): number[];
export function pickParent(candidates: ParentCandidate[]): string | null;
export function orphanParentIndex(index: number, total: number, parentCount: number): number;
export function collapseChildren<T extends { orphan: boolean; order: number }>(
  children: T[],
  collapseAbove: number,
): { kept: T[]; connected: T[] | null; orphans: T[] | null };
export function splitChapter(title: string): { no: string | null; rest: string };
export function listNames(names: string[], max?: number): { items: string[]; more: number };
export function buildTreeLayout(
  map: {
    name: string;
    lanes: Pick<Lane, "id" | "name" | "tier" | "kind" | "collapsed">[];
    articles: { id: string; laneId: string; chapter: string | null }[];
    edges: Pick<Edge, "id" | "from" | "to" | "kind">[];
  },
  options?: Partial<TreeOptions>,
): TreeLayout;
