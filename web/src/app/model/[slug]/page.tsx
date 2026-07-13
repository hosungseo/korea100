import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getAllSlugs,
  getInstitution,
  getInstitutionSummaries,
} from "@/lib/data";
import InstitutionDetailView from "@/components/InstitutionDetailView";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hosungseo.github.io/korea100";

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const institution = getInstitution(slug);
  if (!institution) return { title: "대한민국 제도 지도" };
  return {
    title: institution.name,
    description: institution.oneLiner,
    alternates: { canonical: `${SITE_URL}/model/${institution.slug}/` },
    openGraph: {
      title: `${institution.name} — 대한민국 제도 지도`,
      description: institution.oneLiner,
      type: "article",
      url: `${SITE_URL}/model/${institution.slug}/`,
      images: [
        {
          url: `${SITE_URL}/og-default.png`,
          width: 1200,
          height: 630,
          alt: "한 장으로 끝내는 대한민국 제도 지도",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${institution.name} — 대한민국 제도 지도`,
      description: institution.oneLiner,
      images: [`${SITE_URL}/og-default.png`],
    },
  };
}

export default async function ModelPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const institution = getInstitution(slug);
  if (!institution) notFound();

  const institutions = getInstitutionSummaries();
  const relatedSlugs = new Map(
    institutions.map((item) => [item.name, item.slug]),
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: institution.name,
    description: institution.oneLiner,
    dateModified: institution.asOfDate,
    inLanguage: "ko-KR",
    isPartOf: {
      "@type": "CollectionPage",
      name: "한 장으로 끝내는 대한민국 제도 지도",
      url: `${SITE_URL}/`,
    },
    about: institution.canvas.legalBasis.map((basis) => basis.law),
    url: `${SITE_URL}/model/${institution.slug}/`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <InstitutionDetailView
        institution={institution}
        institutions={institutions}
        relatedSlugs={relatedSlugs}
      />
    </>
  );
}
