import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MegaProjectBoard from "@/components/MegaProjectBoard";
import {
  getAllMegaProjectIds,
  getMegaProject,
  getMegaProjectBundle,
} from "@/lib/mega-projects";
import { getMegaOgImage, getMegaProjectStats } from "@/lib/mega-project-meta";

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
  const stats = getMegaProjectStats(id);
  const title = stats
    ? `행정절차 ${stats.procs.toLocaleString()}개를 한 장에 — ${project.name}`
    : `${project.name} 행정속도 보드`;
  const description = stats
    ? `${project.stages.length}개 게이트 · ${project.nodes.length}개 마일스톤 · ${stats.templates}개 법정 제도 · ${stats.procs.toLocaleString()}개 하위절차. 무엇이 끝났고, 무엇이 진행 중이고, 지금 무엇을 착수할 수 있는지 한 화면에서 추적합니다.`
    : project.summary;
  const ogImage = getMegaOgImage(project.id);
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/mega-projects/${project.id}/` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/mega-projects/${project.id}/`,
      type: "website",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.url],
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
