import Link from "next/link";
import styles from "./MegaViewNav.module.css";

export type MegaViewKey = "poster" | "flow" | "unfold" | "table" | "briefing";

const VIEWS: { key: MegaViewKey; href: string; label: string; hint: string }[] = [
  { key: "poster", href: "", label: "전경 포스터", hint: "한 장 조감도" },
  { key: "flow", href: "flow/", label: "절차 스윔레인", hint: "주체별 흐름" },
  { key: "unfold", href: "unfold/", label: "펼쳐보기", hint: "목록으로 읽기" },
  { key: "table", href: "table/", label: "전체표", hint: "스프레드시트" },
  { key: "briefing", href: "briefing/", label: "기관장 브리핑", hint: "위상 계층" },
];

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function MegaViewNav({
  projectId,
  active,
  tone = "light",
}: {
  projectId: string;
  active: MegaViewKey;
  tone?: "light" | "dark";
}) {
  return (
    <nav className={styles.nav} data-tone={tone} aria-label="메가프로젝트 보기 전환">
      {VIEWS.map((view) => (
        <Link
          key={view.key}
          href={`/mega-projects/${projectId}/${view.href}`}
          aria-current={view.key === active ? "page" : undefined}
        >
          <strong>{view.label}</strong>
          <small>{view.hint}</small>
        </Link>
      ))}
      {/* 같은 데이터를 3D로 보는 관제 화면. public/ 정적 페이지라 Next 라우터 밖이다 */}
      <a href={`${BASE_PATH}/warroom/?p=${projectId}`}>
        <strong>종합상황판</strong>
        <small>3D 관제·일정</small>
      </a>
    </nav>
  );
}
