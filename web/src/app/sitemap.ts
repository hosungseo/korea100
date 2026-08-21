export const dynamic = "force-static";

import type { MetadataRoute } from "next";
import { getAllSlugs, getAllInstitutions } from "@/lib/data";
import { getMegaProject, getMegaProjectIds } from "@/lib/mega-projects";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hosungseo.github.io/korea100";

export default function sitemap(): MetadataRoute.Sitemap {
  const slugs = getAllSlugs();
  const institutions = getAllInstitutions();

  const modelPages: MetadataRoute.Sitemap = slugs.map((slug) => {
    const inst = institutions.find((i) => i.slug === slug);
    return {
      url: `${SITE_URL}/model/${slug}/`,
      lastModified: inst?.asOfDate ? new Date(inst.asOfDate) : new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.9,
    };
  });

  const megaProjectPages: MetadataRoute.Sitemap = getMegaProjectIds("mega").map(
    (id) => {
      const project = getMegaProject(id);
      return {
        url: `${SITE_URL}/mega-projects/${id}/`,
        lastModified: project?.asOfDate
          ? new Date(project.asOfDate)
          : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.85,
      };
    },
  );

  const strategyPages: MetadataRoute.Sitemap = getMegaProjectIds(
    "strategy",
  ).map((id) => {
    const project = getMegaProject(id);
    return {
      url: `${SITE_URL}/strategies/${id}/flow/`,
      lastModified: project?.asOfDate ? new Date(project.asOfDate) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.85,
    };
  });

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/request/`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/verification/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/ax-cases/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...megaProjectPages,
    ...strategyPages,
    ...modelPages,
  ];
}
