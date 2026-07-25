// #4 Motion semantics — turn a board's stage order (G0→Gn) plus edge topology
// into a deterministic play schedule. Borrowed from fireworks-tech-graph's
// motion-stage concept, but driven entirely by korea100's own stage/edge data.
//
// The schedule is design-agnostic: it just says "at step k, these nodes and
// edges become visible." A renderer (see generate-process-motion.mjs) reveals
// the existing portrait board stage-band by stage-band, so the acclaimed
// vertical design is preserved and simply animated top-to-bottom.

import { buildLayout } from "../generate-process-article-image.mjs";
import { buildProcessLaneGroups } from "../../src/lib/process-layout.mjs";

export function buildMotionSchedule(institution) {
  const process = institution.process;
  const groups = buildProcessLaneGroups(process?.lanes ?? [], institution.slug);
  const context = buildLayout(institution, process, groups);

  const stageIndex = new Map(process.stages.map((stage, index) => [stage, index]));
  const nodeStage = new Map(
    process.nodes.map((node) => [node.id, stageIndex.get(node.stage) ?? 0])
  );

  // Nodes light up when their stage arrives.
  const nodeStep = new Map(nodeStage);
  // An edge appears once both endpoints exist — the later of the two stages.
  // Forward edges reveal with their target; loop/return edges reveal with the
  // higher stage so they never dangle.
  const edgeStep = new Map(
    process.edges.map((edge) => [
      edge.id,
      Math.max(nodeStage.get(edge.source) ?? 0, nodeStage.get(edge.target) ?? 0),
    ])
  );

  const steps = process.stages.map((stage, index) => ({
    stageIndex: index,
    stage,
    top: context.stageTops[index],
    height: context.stageHeights[index],
    nodeIds: process.nodes.filter((n) => nodeStage.get(n.id) === index).map((n) => n.id),
    edgeIds: process.edges
      .filter((e) => edgeStep.get(e.id) === index)
      .map((e) => e.id),
  }));

  return {
    slug: institution.slug,
    stepCount: steps.length,
    steps,
    nodeStep,
    edgeStep,
    stageBodyTop: context.stageTops[0],
    stageBodyBottom:
      context.stageTops.at(-1) + context.stageHeights.at(-1),
  };
}
