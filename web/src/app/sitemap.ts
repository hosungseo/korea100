export const dynamic = "force-static";

import type { MetadataRoute } from "next";
import { getAllSlugs, getAllInstitutions } from "@/lib/data";

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
    ...modelPages,
  ];
}
