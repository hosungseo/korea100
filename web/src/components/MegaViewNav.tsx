import Link from "next/link";
import styles from "./MegaViewNav.module.css";

export type MegaViewKey = "poster" | "flow" | "unfold" | "table";

const VIEWS: { key: MegaViewKey; href: string; label: string; hint: string }[] = [
  { key: "poster", href: "", label: "전경 포스터", hint: "한 장 조감도" },
  { key: "flow", href: "flow/", label: "절차 스윔레인", hint: "주체별 흐름" },
  { key: "unfold", href: "unfold/", label: "펼쳐보기", hint: "목록으로 읽기" },
  { key: "table", href: "table/", label: "전체표", hint: "스프레드시트" },
];

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
    </nav>
  );
}
