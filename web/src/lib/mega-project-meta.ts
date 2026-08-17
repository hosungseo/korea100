import { buildMegaProjectGraph } from "./mega-project-graph";
import { getMegaProjectBundle } from "./mega-projects";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hosungseo.github.io/korea100";

const OG_IMAGES: Record<string, { path: string; width: number; height: number }> = {
  "gwangju-semiconductor-cluster": {
    path: "/og/mega-gwangju-semiconductor-cluster.png",
    width: 2400,
    height: 1260,
  },
};

export interface MegaOgImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

export function getMegaOgImage(projectId: string): MegaOgImage {
  const image = OG_IMAGES[projectId];
  if (!image) {
    return {
      url: `${SITE_URL}/og-default.png`,
      width: 1200,
      height: 630,
      alt: "대한민국 제도 지도",
    };
  }
  return {
    url: `${SITE_URL}${image.path}`,
    width: image.width,
    height: image.height,
    alt: "마일스톤 × 담당 주체 절차 밀도 지도",
  };
}

export function getMegaProjectStats(projectId: string) {
  const bundle = getMegaProjectBundle(projectId);
  if (!bundle) return null;
  const graph = buildMegaProjectGraph(
    bundle.project,
    bundle.artifacts,
    bundle.templates,
    bundle.detailTemplates,
  );
  return {
    // missing-mapping milestones surface as one placeholder procedure each,
    // matching the poster/flow view totals
    procs:
      graph.detailInventory.exact +
      graph.detailInventory.template +
      graph.detailInventory.missingMilestones,
    templates: graph.detailInventory.uniqueTemplates,
  };
}
