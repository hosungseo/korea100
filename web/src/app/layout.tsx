import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "한 장으로 끝내는 대한민국 제도 100",
  description:
    "기업에는 비즈니스 모델이 있듯이, 국가에는 제도 모델이 있다. 대한민국 주요 제도를 법령·조직·절차·예산·문서를 한 장 구조도로 보여드립니다.",
  keywords: "대한민국 제도, 환경영향평가, 예비타당성조사, 행정, 정책, 법령",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col site-body">
        <Header />
        <main className="flex-1">{children}</main>
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
          제도 100
        </Link>

        <nav className="site-nav" aria-label="주요 메뉴">
          <NavLink href="/#institutions">제도 목록</NavLink>
          <NavLink
            href="/model/environmental-impact-assessment/"
            className="nav-featured-link"
          >
            업무구조도 예시
          </NavLink>
        </nav>

        <Link href="/request/" className="site-header-cta">
          제도 제안
        </Link>
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
            한 장으로 끝내는 대한민국 제도 100
          </p>
          <p style={{ fontSize: 13, color: "var(--color-muted)", lineHeight: 1.7 }}>
            법령 기준일 기준으로 작성된 참고자료입니다.
            <br />
            법률 자문이나 공식 유권해석이 아닙니다.
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
            오류·제보:{" "}
            <a
              href="mailto:ghtjd10855@gmail.com"
              style={{ color: "var(--color-accent-dark)", textDecoration: "none" }}
            >
              ghtjd10855@gmail.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
