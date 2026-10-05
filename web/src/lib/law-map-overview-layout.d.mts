import type { Edge, EdgeKind, Lane } from "./law-map-types";

export const MISC_CHAPTER: string;

export interface ChapterGroup {
  id: string;
  laneId: string;
  title: string;
  /** 장이 없는 레인을 통째로 담은 묶음(레인 이름이 제목). */
  isLane: boolean;
  articleIds: string[];
}

export interface AggregatedEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  count: number;
}

export function groupLaneArticles(
  lane: Pick<Lane, "id" | "name">,
  articles: { id: string; chapter: string | null }[],
): ChapterGroup[];
export function aggregateEdges(edges: Edge[], nodeMap: Map<string, string>, kinds: Set<EdgeKind>): AggregatedEdge[];
export function strokeWidthFor(count: number): number;
export function measureText(text: string, fontSize: number): number;
export function fitLabel(text: string, maxWidth: number, fontSize: number): string;

export const OVERVIEW_SUBTITLE: string;
export interface OverviewHeadline {
  title: string;
  subtitle: string;
  delegatingCount: number;
  topChapter: string | null;
}
export function buildOverviewHeadline(
  map: { name: string; lanes: Pick<Lane, "id" | "name" | "tier">[]; articles: { id: string; laneId: string; chapter: string | null }[]; edges: Pick<Edge, "from" | "kind">[] },
): OverviewHeadline;
