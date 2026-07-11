import type { ProcessEdge, ProcessLaneGroup } from "./types";

export function buildProcessLaneGroups(
  lanes: string[],
  slug?: string,
): ProcessLaneGroup[];

export interface ProcessEdgeRouteSlot {
  sourcePort: number;
  targetPort: number;
  channel: number;
  rail: number;
  railSide: -1 | 1;
  approach: number;
  sourceChannel: number;
  targetChannel: number;
  backRail: number;
}

export function buildProcessEdgeRouteSlots(
  edges: ProcessEdge[],
  nodePositions: Map<string, { stageIndex: number; groupIndex: number }>,
): Map<string, ProcessEdgeRouteSlot>;
