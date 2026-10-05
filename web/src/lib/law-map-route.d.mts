import type { Edge, EdgeKind } from "./law-map-types";

export interface LawMapRoute {
  nodes: string[];
  edges: string[];
}

export function findRoute(edges: Edge[], fromId: string, toId: string): LawMapRoute | null;
export function indexEdgesByNode(edges: Edge[]): Map<string, Edge[]>;
export function countEdgeKinds(edges: Edge[]): Record<EdgeKind, number>;
