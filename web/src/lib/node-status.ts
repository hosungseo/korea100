import type { NodeStatus } from "./types";

// 편집 표지(done/current/waiting/risk/loop)의 화면 어휘 단일 출처.
// done·waiting은 배지 없이 중립으로 그린다 — 진행률 어휘(완료·현재·대기)는
// 정적 예시 화면이 이용자 자신의 진행 상태로 오해되므로 쓰지 않는다.
export const NODE_STATUS_META: Record<
  NodeStatus,
  { label: string | null; color: string }
> = {
  done: { label: null, color: "#87938d" },
  waiting: { label: null, color: "#87938d" },
  current: { label: "핵심", color: "#087452" },
  risk: { label: "유의", color: "#c78116" },
  loop: { label: "회귀", color: "#2563eb" },
};

export function nodeStatusAriaLabel(name: string, status: NodeStatus): string {
  const meta = NODE_STATUS_META[status];
  return meta.label ? `${name} — ${meta.label}` : name;
}
