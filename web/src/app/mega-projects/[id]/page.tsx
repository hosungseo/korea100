import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MegaProjectBoard from "@/components/MegaProjectBoard";
import {
  getAllMegaProjectIds,
  getMegaProject,
  getMegaProjectBundle,
} from "@/lib/mega-projects";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hosungseo.github.io/korea100";

export function generateStaticParams() {
  return getAllMegaProjectIds().map((id) => ({ id }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = getMegaProject(id);
  if (!project) return { title: "메가프로젝트 행정속도 보드" };
  return {
    title: `${project.name} 행정속도 보드`,
    description: project.summary,
    alternates: { canonical: `${SITE_URL}/mega-projects/${project.id}/` },
    openGraph: {
      title: `${project.name} — MEGA / PERMIT LAB`,
      description: project.summary,
      url: `${SITE_URL}/mega-projects/${project.id}/`,
      type: "website",
      images: [
        {
          url: `${SITE_URL}/og-default.png`,
          width: 1200,
          height: 630,
          alt: "대한민국 제도 지도",
        },
      ],
    },
  };
}

export default async function MegaProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = getMegaProjectBundle(id);
  if (!bundle) notFound();

  return (
    <MegaProjectBoard
      project={bundle.project}
      artifacts={bundle.artifacts}
      templates={bundle.templates}
      detailTemplates={bundle.detailTemplates}
    />
  );
}
