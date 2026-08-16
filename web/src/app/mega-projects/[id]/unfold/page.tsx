import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MegaProjectUnfold from "@/components/MegaProjectUnfold";
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
  if (!project) return { title: "메가프로젝트 행정절차 펼쳐보기" };
  return {
    title: `${project.name} 행정절차 전체 펼쳐보기`,
    description: project.summary,
    alternates: { canonical: `${SITE_URL}/mega-projects/${project.id}/unfold/` },
  };
}

export default async function MegaProjectUnfoldPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = getMegaProjectBundle(id);
  if (!bundle) notFound();

  return (
    <MegaProjectUnfold
      project={bundle.project}
      artifacts={bundle.artifacts}
      templates={bundle.templates}
      detailTemplates={bundle.detailTemplates}
    />
  );
}
