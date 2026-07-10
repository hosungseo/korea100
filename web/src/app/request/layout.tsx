import type { Metadata } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://hosungseo.github.io/korea100";

export const metadata: Metadata = {
  title: "제도 분석 제안",
  description: "다음에 분석할 제도와 가장 궁금한 업무 지점을 제안합니다.",
  alternates: { canonical: `${SITE_URL}/request/` },
};

export default function RequestLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
