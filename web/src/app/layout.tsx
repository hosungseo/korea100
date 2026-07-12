import type { Metadata } from "next";
import Link from "next/link";
import Telemetry from "@/components/Telemetry";
import { getInstitutionSummaries } from "@/lib/data";
import pkg from "../../package.json";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

const SITE_VERSION = pkg.version;
const CHANGELOG_URL =
  "https://github.com/Milkbuttercheese2/How-Did-They-Do-All-That-Procurement-/blob/main/CHANGELOG.md";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://milkbuttercheese2.github.io/How-Did-They-Do-All-That-Procurement-";
const INSTITUTIONS = getInstitutionSummaries();
const MODEL_COUNT = INSTITUTIONS.length;
const LATEST_AS_OF_DATE = INSTITUTIONS.reduce(
  (latest, institution) =>
    institution.asOfDate > latest ? institution.asOfDate : latest,
  "",
);

export const metadata: Metadata = {
  title: {
    default: "한 장으로 끝내는 조달제도 100",
    template: "%s | 조달제도 100",
  },
  description:
    "입찰참가자격 등록부터 계약 체결, 대금 지급까지 — 국가계약법·시행령·계약예규에 흩어진 공공조달 제도를 누가, 무엇을, 어떤 순서로 진행하는지 보이는 한 장의 업무 흐름도로 정리합니다. 모든 근거는 국가법령정보센터 현행 법령과 조문 단위로 연결해 검증합니다.",
  keywords: "공공조달, 조달청, 나라장터, 국가계약, 입찰, 수의계약, 조달업체 등록, 법령",
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    title: "한 장으로 끝내는 조달제도 100",
    description: "법령부터 실제 업무 흐름까지 한 장으로 읽는 공공조달 카탈로그",
    url: `${SITE_URL}/`,
    siteName: "조달제도 100",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: `${SITE_URL}/og-default.png`,
        width: 1200,
        height: 630,
        alt: "조달제도 100",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "한 장으로 끝내는 조달제도 100",
    description: "법령부터 실제 업무 흐름까지 한 장으로 읽는 공공조달 카탈로그",
    images: [`${SITE_URL}/og-default.png`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col site-body">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "CollectionPage",
              name: "한 장으로 끝내는 조달제도 100",
              description:
                "대한민국 공공조달·계약 제도를 행위자, 절차, 돈, 문서 흐름과 조문 단위 법적 근거로 구조화한 업무 흐름도 카탈로그",
              inLanguage: "ko-KR",
              url: `${SITE_URL}/`,
              numberOfItems: MODEL_COUNT,
            }).replace(/</g, "\\u003c"),
          }}
        />
        <Header />
        <main className="flex-1">{children}</main>
        <Telemetry />
        <Footer />
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-brand">
          <strong>조달제도 100</strong>
          <span>How Did They Do All That Procurement</span>
        </Link>

        <nav className="site-nav" aria-label="주요 메뉴">
          <NavLink href="/#institutions">제도 대장</NavLink>
          <NavLink href="/request/">요청하기</NavLink>
          <span className="site-header-date">기준일 {LATEST_AS_OF_DATE}</span>
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`nav-link ${className}`.trim()}>
      {children}
    </Link>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div
        style={{
          maxWidth: 1440,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 32,
        }}
      >
        <div>
          <p
            style={{
              fontWeight: 720,
              fontSize: 14,
              color: "var(--color-ink)",
              marginBottom: 8,
            }}
          >
            한 장으로 끝내는 조달제도 100
          </p>
          <p style={{ fontSize: 13, color: "var(--color-muted)", lineHeight: 1.7 }}>
            법령 기준일 기준으로 작성된 참고자료입니다.
            <br />
            법률 자문이나 공식 유권해석이 아닙니다.
            <br />
            <a
              href={CHANGELOG_URL}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--color-muted)", textDecoration: "none" }}
            >
              v{SITE_VERSION} · 변경 이력
            </a>
          </p>
        </div>
        <div>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "var(--color-faint)",
              marginBottom: 8,
            }}
          >
            안내
          </p>
          <p style={{ fontSize: 13, color: "var(--color-muted)", lineHeight: 1.7 }}>
            각 제도 페이지에 법령 기준일을 표시합니다.
            <br />
            법령이 개정되면 내용이 달라질 수 있습니다.
            <br />
            <Link
              href="/verification/"
              style={{ color: "var(--color-accent-dark)", textDecoration: "none" }}
            >
              현장 검증 대장 보기
            </Link>
            <br />
            오류·제보:{" "}
            <a
              href="mailto:wooseongkyun@korea.kr"
              style={{ color: "var(--color-accent-dark)", textDecoration: "none" }}
            >
              wooseongkyun@korea.kr
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
