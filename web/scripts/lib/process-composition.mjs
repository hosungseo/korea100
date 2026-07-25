// Composition quality metrics for korea100 process boards.
//
// Reuses the real portrait renderer geometry (buildLayout + edgeRoute +
// orthogonalSegments) so the numbers match what actually gets drawn. Inspired
// by fireworks-tech-graph's quantified composition contract, but scored against
// korea100's own lane×stage engine.

import {
  buildLayout,
  edgeRoute,
  orthogonalSegments,
} from "../generate-process-article-image.mjs";
import { buildProcessLaneGroups } from "../../src/lib/process-layout.mjs";

// Budget thresholds — a diagram is "clean" when it stays under these.
// Piercings are the worst sin (edge cuts through an unrelated card), so they
// dominate the score. Everything else is soft complexity.
export const COMPOSITION_BUDGET = {
  maxNodePiercings: 0,
  maxCrossings: 6,
  maxBendsPerEdge: 4,
  maxRouteStretch: 2.2,
  maxAdjustedLabels: 4,
};

const PIERCE_MARGIN = 3; // px; ignore segments that merely graze a card border

function edgeSegments(edge, context) {
  const source = context.nodeLayout.get(edge.source);
  const target = context.nodeLayout.get(edge.target);
  if (!source || !target) return null;
  const { path } = edgeRoute(edge, source, target, context);
  return {
    source,
    target,
    segments: orthogonalSegments(path),
  };
}

function segmentsCross(horizontal, vertical) {
  const hMin = Math.min(horizontal.start, horizontal.end);
  const hMax = Math.max(horizontal.start, horizontal.end);
  const vMin = Math.min(vertical.start, vertical.end);
  const vMax = Math.max(vertical.start, vertical.end);
  return (
    vertical.fixed > hMin &&
    vertical.fixed < hMax &&
    horizontal.fixed > vMin &&
    horizontal.fixed < vMax
  );
}

function splitOrientation(segments) {
  const horizontal = [];
  const vertical = [];
  for (const segment of segments) {
    if (segment.orientation === "horizontal") horizontal.push(segment);
    else vertical.push(segment);
  }
  return { horizontal, vertical };
}

function countCrossings(routes) {
  let crossings = 0;
  for (let left = 0; left < routes.length; left += 1) {
    const a = splitOrientation(routes[left].segments);
    for (let right = left + 1; right < routes.length; right += 1) {
      const b = splitOrientation(routes[right].segments);
      for (const h of a.horizontal) {
        for (const v of b.vertical) if (segmentsCross(h, v)) crossings += 1;
      }
      for (const h of b.horizontal) {
        for (const v of a.vertical) if (segmentsCross(h, v)) crossings += 1;
      }
    }
  }
  return crossings;
}

function segmentPiercesRect(segment, rect) {
  const left = rect.x + PIERCE_MARGIN;
  const right = rect.x + rect.width - PIERCE_MARGIN;
  const top = rect.y + PIERCE_MARGIN;
  const bottom = rect.y + rect.height - PIERCE_MARGIN;
  if (segment.orientation === "horizontal") {
    if (segment.fixed <= top || segment.fixed >= bottom) return false;
    const min = Math.min(segment.start, segment.end);
    const max = Math.max(segment.start, segment.end);
    return min < right && max > left;
  }
  if (segment.fixed <= left || segment.fixed >= right) return false;
  const min = Math.min(segment.start, segment.end);
  const max = Math.max(segment.start, segment.end);
  return min < bottom && max > top;
}

function countNodePiercings(edges, routes, context) {
  const nodes = [...context.nodeLayout.entries()];
  let piercings = 0;
  const offenders = [];
  routes.forEach((route, index) => {
    const edge = edges[index];
    for (const [nodeId, rect] of nodes) {
      if (nodeId === edge.source || nodeId === edge.target) continue;
      if (route.segments.some((segment) => segmentPiercesRect(segment, rect))) {
        piercings += 1;
        offenders.push(`${edge.id}↯${nodeId}`);
      }
    }
  });
  return { piercings, offenders };
}

function pathLength(segments) {
  return segments.reduce(
    (sum, segment) => sum + Math.abs(segment.end - segment.start),
    0
  );
}

// Detour ratio of an edge's routed path vs. the direct center-to-center
// distance. The denominator is floored at one card width so short loop/return
// edges (whose endpoints nearly coincide) don't explode the ratio — we care
// about genuinely over-routed long edges, not tight local returns.
const MIN_STRETCH_DENOMINATOR = 270; // = CARD_WIDTH

function routeStretch(route) {
  const { source, target, segments } = route;
  const manhattan =
    Math.abs(
      target.x + target.width / 2 - (source.x + source.width / 2)
    ) +
    Math.abs(target.y + target.height / 2 - (source.y + source.height / 2));
  return pathLength(segments) / Math.max(manhattan, MIN_STRETCH_DENOMINATOR);
}

export function computeComposition(institution) {
  const process = institution.process;
  const groups = buildProcessLaneGroups(process?.lanes ?? [], institution.slug);
  const context = buildLayout(institution, process, groups);

  const edges = process.edges;
  const routes = edges.map((edge) => edgeSegments(edge, context)).filter(Boolean);

  const crossings = countCrossings(routes);
  const { piercings, offenders } = countNodePiercings(edges, routes, context);

  const bends = routes.map((route) => Math.max(0, route.segments.length - 1));
  const bendsPerEdgeMax = bends.length ? Math.max(...bends) : 0;
  const totalBends = bends.reduce((sum, value) => sum + value, 0);

  const stretches = routes.map(routeStretch);
  const routeStretchMax = stretches.length ? Math.max(...stretches) : 1;
  const routeStretchAvg = stretches.length
    ? stretches.reduce((sum, value) => sum + value, 0) / stretches.length
    : 1;

  const adjustedLabels = [...context.edgeLabelLayout.values()].filter(
    (label) => label.adjusted
  ).length;

  const metrics = {
    nodes: process.nodes.length,
    lanes: process.lanes.length,
    stages: process.stages.length,
    edges: edges.length,
    longRoutes: context.edgeRouteAudit.longRoutes,
    crossings,
    nodePiercings: piercings,
    piercingOffenders: offenders,
    bendsPerEdgeMax,
    totalBends,
    routeStretchMax: round(routeStretchMax),
    routeStretchAvg: round(routeStretchAvg),
    adjustedLabels,
  };

  return {
    slug: institution.slug,
    name: institution.name,
    metrics,
    score: compositionScore(metrics),
    violations: budgetViolations(metrics),
  };
}

// Higher score = messier diagram. Piercings dominate; the rest is soft.
export function compositionScore(m) {
  return round(
    m.nodePiercings * 20 +
      m.crossings * 3 +
      Math.max(0, m.bendsPerEdgeMax - 3) * 2 +
      Math.max(0, m.routeStretchMax - 1.6) * 6 +
      m.adjustedLabels * 1.5
  );
}

export function budgetViolations(m) {
  const violations = [];
  if (m.nodePiercings > COMPOSITION_BUDGET.maxNodePiercings)
    violations.push(`node-piercing ${m.nodePiercings}`);
  if (m.crossings > COMPOSITION_BUDGET.maxCrossings)
    violations.push(`crossings ${m.crossings}>${COMPOSITION_BUDGET.maxCrossings}`);
  if (m.bendsPerEdgeMax > COMPOSITION_BUDGET.maxBendsPerEdge)
    violations.push(
      `bends/edge ${m.bendsPerEdgeMax}>${COMPOSITION_BUDGET.maxBendsPerEdge}`
    );
  if (m.routeStretchMax > COMPOSITION_BUDGET.maxRouteStretch)
    violations.push(
      `stretch ${m.routeStretchMax}>${COMPOSITION_BUDGET.maxRouteStretch}`
    );
  if (m.adjustedLabels > COMPOSITION_BUDGET.maxAdjustedLabels)
    violations.push(
      `adjusted-labels ${m.adjustedLabels}>${COMPOSITION_BUDGET.maxAdjustedLabels}`
    );
  return violations;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
