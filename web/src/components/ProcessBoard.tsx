"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProcessModel, ProcessNode, ProcessEdge } from "@/lib/types";
import SwimlaneBoard from "./SwimlaneBoard";

interface ProcessBoardProps {
  process: ProcessModel;
  compact?: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────────

type StageStatus = "done" | "current" | "risk" | "waiting";

function getStageStatus(stage: string, nodes: ProcessNode[]): StageStatus {
  const sn = nodes.filter((n) => n.stage === stage);
  if (sn.length === 0) return "waiting";
  if (sn.some((n) => n.status === "current")) return "current";
  if (sn.some((n) => n.status === "risk")) return "risk";
  if (sn.every((n) => n.status === "done")) return "done";
  return "waiting";
}

function getLoopEdgesForNode(
  nodeId: string,
  edges: ProcessEdge[]
): ProcessEdge[] {
  return edges.filter(
    (e) => e.type === "loop" && (e.source === nodeId || e.target === nodeId)
  );
}

function getMessageEdgesForNode(
  nodeId: string,
  edges: ProcessEdge[]
): ProcessEdge[] {
  return edges.filter(
    (e) =>
      e.type === "message" && (e.source === nodeId || e.target === nodeId)
  );
}

// ── status styles ─────────────────────────────────────────────────────────────

const STATUS_META: Record<
  string,
  { label: string; cardBg: string; cardBorder: string; badgeBg: string; badgeText: string }
> = {
  done: {
    label: "완료",
    cardBg: "#f5f7f6",
    cardBorder: "#dde5df",
    badgeBg: "#dff5eb",
    badgeText: "#087452",
  },
  current: {
    label: "진행 중",
    cardBg: "#ffffff",
    cardBorder: "#0f9f72",
    badgeBg: "#0f9f72",
    badgeText: "#ffffff",
  },
  waiting: {
    label: "대기",
    cardBg: "#f5f7f6",
    cardBorder: "#dde5df",
    badgeBg: "#f5f7f6",
    badgeText: "#5d6b63",
  },
  risk: {
    label: "위험",
    cardBg: "#fffaf3",
    cardBorder: "#c78116",
    badgeBg: "#fef6e7",
    badgeText: "#c78116",
  },
  loop: {
    label: "회귀",
    cardBg: "#fffaf3",
    cardBorder: "#c78116",
    badgeBg: "#fef6e7",
    badgeText: "#c78116",
  },
  gateway: {
    label: "판단",
    cardBg: "#f5f7f6",
    cardBorder: "#dde5df",
    badgeBg: "#f5f7f6",
    badgeText: "#5d6b63",
  },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META["waiting"];
}

// ── Gate Timeline ─────────────────────────────────────────────────────────────

function GateTimeline({
  stages,
  nodes,
  compact,
}: {
  stages: string[];
  nodes: ProcessNode[];
  compact: boolean;
}) {
  return (
    <div
      style={{
        overflowX: "auto",
        overflowY: "hidden",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        padding: "2px 0 8px",
      } as React.CSSProperties}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          minWidth: "max-content",
          padding: "0 4px",
        }}
      >
        {stages.map((stage, i) => {
          const st = getStageStatus(stage, nodes);
          const isLast = i === stages.length - 1;
          const [code, ...rest] = stage.split(" ");
          const label = rest.join(" ");

          const dotColor =
            st === "done"
              ? "#0f9f72"
              : st === "current"
              ? "#0f9f72"
              : st === "risk"
              ? "#c78116"
              : "#bdcbc4";

          const lineColor =
            st === "done" || st === "current" ? "#0f9f72" : "#dde5df";

          return (
            <div
              key={stage}
              style={{ display: "flex", alignItems: "center" }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {/* Dot */}
                <div style={{ position: "relative" }}>
                  <div
                    style={{
                      width: compact ? 10 : 14,
                      height: compact ? 10 : 14,
                      borderRadius: "50%",
                      background:
                        st === "done"
                          ? "#0f9f72"
                          : st === "current"
                          ? "#0f9f72"
                          : "transparent",
                      border: `2px solid ${dotColor}`,
                      boxShadow:
                        st === "current"
                          ? "0 0 0 3px rgba(15,159,114,0.18)"
                          : "none",
                      transition: "all 220ms cubic-bezier(.2,.8,.2,1)",
                      flexShrink: 0,
                    }}
                  />
                  {st === "current" && !compact && (
                    <div
                      style={{
                        position: "absolute",
                        inset: -4,
                        borderRadius: "50%",
                        border: "2px solid #0f9f72",
                        opacity: 0,
                        animation: "pulse-ring 2s ease-out infinite",
                      }}
                    />
                  )}
                </div>

                {/* Label */}
                {!compact && (
                  <div
                    style={{
                      textAlign: "center",
                      maxWidth: 72,
                    }}
                  >
                    <div
                      className="mono"
                      style={{
                        color:
                          st === "current" || st === "done"
                            ? "#0f9f72"
                            : st === "risk"
                            ? "#c78116"
                            : "#87938d",
                        display: "block",
                      }}
                    >
                      {code}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color:
                          st === "current"
                            ? "#111714"
                            : st === "done"
                            ? "#5d6b63"
                            : "#87938d",
                        lineHeight: 1.3,
                        fontWeight: st === "current" ? 600 : 430,
                      }}
                    >
                      {label}
                    </div>
                  </div>
                )}
                {compact && (
                  <div
                    className="mono"
                    style={{
                      color:
                        st === "current" || st === "done"
                          ? "#0f9f72"
                          : "#87938d",
                      fontSize: 10,
                    }}
                  >
                    {code}
                  </div>
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  style={{
                    width: compact ? 20 : 32,
                    height: 2,
                    background: lineColor,
                    flexShrink: 0,
                    marginBottom: compact ? 20 : 40,
                    transition: "background 220ms cubic-bezier(.2,.8,.2,1)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Node Card ─────────────────────────────────────────────────────────────────

function NodeCard({
  node,
  edges,
  onClick,
  compact,
}: {
  node: ProcessNode;
  edges: ProcessEdge[];
  onClick: (node: ProcessNode) => void;
  compact: boolean;
}) {
  const meta = statusMeta(node.status);
  const loopEdges = getLoopEdgesForNode(node.id, edges);
  const isLoop = node.status === "loop" || loopEdges.some((e) => e.source === node.id);
  const hasBlocker = node.blocker && node.blocker.trim() !== "";
  const isCurrent = node.status === "current";
  const lowConfidence =
    node.confidence !== undefined && node.confidence < 0.8;

  return (
    <button
      onClick={() => onClick(node)}
      aria-label={`${node.name} — ${meta.label}`}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: compact ? "10px 12px" : "14px 16px",
        background: meta.cardBg,
        border: `1px solid ${meta.cardBorder}`,
        borderRadius: 12,
        cursor: "pointer",
        transition: "border-color 140ms ease-out, box-shadow 140ms ease-out",
        boxShadow: isCurrent
          ? "0 0 0 2px rgba(15,159,114,0.15)"
          : "none",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow =
          "0 4px 12px rgba(11,20,16,0.08)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "#bdcbc4";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = isCurrent
          ? "0 0 0 2px rgba(15,159,114,0.15)"
          : "none";
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          meta.cardBorder;
      }}
    >
      {/* Top row: lane tag + status badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "#87938d",
            background: "#f5f7f6",
            padding: "2px 6px",
            borderRadius: 4,
            border: "1px solid #dde5df",
          }}
        >
          {node.lane}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 9999,
            background: meta.badgeBg,
            color: meta.badgeText,
            flexShrink: 0,
          }}
        >
          {meta.label}
        </span>
        {isLoop && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 9999,
              background: "#fef6e7",
              color: "#c78116",
              fontWeight: 600,
            }}
          >
            ↩ 보완 회귀
          </span>
        )}
        {lowConfidence && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 9999,
              background: "#fef6e7",
              color: "#c78116",
              fontWeight: 600,
            }}
          >
            현장 검증 필요
          </span>
        )}
      </div>

      {/* Node ID + Name */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          className="mono"
          style={{ color: "#87938d", flexShrink: 0 }}
        >
          {node.id}
        </span>
        <span
          style={{
            fontSize: compact ? 13 : 14,
            fontWeight: 600,
            color: "#111714",
            lineHeight: 1.35,
          }}
        >
          {node.name}
        </span>
      </div>

      {/* Actor */}
      {!compact && (
        <div
          style={{
            fontSize: 12,
            color: "#5d6b63",
            marginTop: 4,
          }}
        >
          담당: {node.actor}
        </div>
      )}

      {/* Blocker */}
      {hasBlocker && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            background: "#fef6e7",
            borderRadius: 6,
            fontSize: 12,
            color: "#c78116",
            fontWeight: 500,
            borderLeft: "3px solid #c78116",
          }}
        >
          ⚠ {node.blocker}
        </div>
      )}

      {/* Progress bar */}
      {!compact && node.progress !== undefined && node.progress > 0 && (
        <div
          style={{
            marginTop: 10,
            height: 3,
            background: "#dde5df",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${node.progress}%`,
              background:
                node.status === "risk" ? "#c78116" : "#0f9f72",
              borderRadius: 2,
              transition: "width 220ms cubic-bezier(.2,.8,.2,1)",
            }}
          />
        </div>
      )}
    </button>
  );
}

// ── Node Drawer ───────────────────────────────────────────────────────────────

function NodeDrawer({
  node,
  edges,
  onClose,
}: {
  node: ProcessNode;
  edges: ProcessEdge[];
  onClose: () => void;
}) {
  const meta = statusMeta(node.status);
  const loopEdges = getLoopEdgesForNode(node.id, edges);
  const messageEdges = getMessageEdgesForNode(node.id, edges);
  const lowConfidence =
    node.confidence !== undefined && node.confidence < 0.8;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,20,16,0.35)",
          zIndex: 100,
          animation: "fade-in 220ms cubic-bezier(.2,.8,.2,1)",
        }}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={node.name}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(480px, 100vw)",
          background: "#ffffff",
          borderLeft: "1px solid var(--color-border)",
          zIndex: 101,
          overflowY: "auto",
          padding: 28,
          animation: "slide-in-right 220ms cubic-bezier(.2,.8,.2,1)",
          boxShadow: "-8px 0 48px rgba(11,20,16,0.12)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <span
                className="mono"
                style={{ color: "#87938d" }}
              >
                {node.id}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 9999,
                  background: meta.badgeBg,
                  color: meta.badgeText,
                }}
              >
                {meta.label}
              </span>
            </div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 680,
                color: "#111714",
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              {node.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#87938d",
              fontSize: 22,
              lineHeight: 1,
              padding: 4,
              flexShrink: 0,
              marginLeft: 16,
            }}
          >
            ×
          </button>
        </div>

        {/* Badges */}
        {lowConfidence && (
          <div
            style={{
              padding: "10px 14px",
              background: "#fef6e7",
              borderRadius: 8,
              border: "1px solid rgba(199,129,22,0.25)",
              fontSize: 13,
              color: "#c78116",
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            ⚠ 현장 검증 필요 — 법령 근거 확신도 {Math.round((node.confidence ?? 0) * 100)}%
          </div>
        )}

        {/* Meta grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <MetaItem label="레인" value={node.lane} />
          <MetaItem label="게이트" value={node.stage} />
          <MetaItem label="담당" value={node.actor} />
          {node.action && <MetaItem label="행위" value={node.action} />}
        </div>

        {/* Deadline */}
        {node.deadline && (
          <DrawerSection title="기한">
            <p style={{ fontSize: 14, color: "#111714", margin: 0 }}>
              {node.deadline}
            </p>
          </DrawerSection>
        )}

        {/* Blocker */}
        {node.blocker && (
          <DrawerSection title="병목">
            <div
              style={{
                padding: "10px 12px",
                background: "#fef6e7",
                borderRadius: 8,
                fontSize: 14,
                color: "#c78116",
                fontWeight: 500,
              }}
            >
              {node.blocker}
            </div>
          </DrawerSection>
        )}

        {/* Output documents */}
        {node.output_documents && node.output_documents.length > 0 && (
          <DrawerSection title="산출 문서">
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {node.output_documents.map((doc, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: 14,
                    color: "#111714",
                    padding: "4px 0",
                    borderBottom:
                      i < (node.output_documents?.length ?? 0) - 1
                        ? "1px solid #dde5df"
                        : "none",
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#0f9f72", flexShrink: 0 }}>▸</span>
                  {doc}
                </li>
              ))}
            </ul>
          </DrawerSection>
        )}

        {/* Legal basis */}
        {node.legal_basis && node.legal_basis.length > 0 && (
          <DrawerSection title="법적 근거">
            {node.legal_basis.map((lb, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  background: "#f5f7f6",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#111714",
                    marginBottom: 2,
                  }}
                >
                  {lb.law}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#5d6b63",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {lb.article}
                </div>
                {lb.text && (
                  <div style={{ fontSize: 13, color: "#5d6b63", marginTop: 4 }}>
                    {lb.text}
                  </div>
                )}
              </div>
            ))}
          </DrawerSection>
        )}

        {/* Loop edges */}
        {loopEdges.length > 0 && (
          <DrawerSection title="회귀 루프">
            {loopEdges.map((e) => (
              <div
                key={e.id}
                style={{
                  padding: "8px 12px",
                  background: "#fef6e7",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#c78116",
                  marginBottom: 6,
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <span>↩</span>
                <span>
                  {e.label ?? "보완 회귀"} ({e.source} → {e.target})
                </span>
              </div>
            ))}
          </DrawerSection>
        )}

        {/* Message edges */}
        {messageEdges.length > 0 && (
          <DrawerSection title="정보 흐름">
            {messageEdges.map((e) => (
              <div
                key={e.id}
                style={{
                  padding: "8px 12px",
                  background: "#f5f7f6",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#5d6b63",
                  marginBottom: 6,
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <span style={{ color: "#0f9f72" }}>→</span>
                <span>
                  {e.label} ({e.source} → {e.target})
                </span>
              </div>
            ))}
          </DrawerSection>
        )}
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slide-in-right {
          from { transform: translateX(24px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#87938d",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: "#111714", fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "#87938d",
          marginBottom: 8,
          paddingBottom: 6,
          borderBottom: "1px solid #dde5df",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Stage Group ───────────────────────────────────────────────────────────────

function StageGroup({
  stage,
  nodes,
  edges,
  onNodeClick,
  compact,
}: {
  stage: string;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
  onNodeClick: (node: ProcessNode) => void;
  compact: boolean;
}) {
  const stageNodes = nodes.filter((n) => n.stage === stage);
  if (stageNodes.length === 0) return null;
  const st = getStageStatus(stage, nodes);
  const [code, ...rest] = stage.split(" ");

  const stageBorderColor =
    st === "current"
      ? "#0f9f72"
      : st === "risk"
      ? "#c78116"
      : st === "done"
      ? "#dff5eb"
      : "#dde5df";

  return (
    <div
      style={{
        borderLeft: `3px solid ${stageBorderColor}`,
        paddingLeft: 16,
        marginBottom: 24,
        transition: "border-color 220ms cubic-bezier(.2,.8,.2,1)",
      }}
    >
      {/* Stage label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span
          className="mono"
          style={{
            color:
              st === "current" || st === "done"
                ? "#0f9f72"
                : st === "risk"
                ? "#c78116"
                : "#87938d",
          }}
        >
          {code}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color:
              st === "current"
                ? "#111714"
                : st === "done"
                ? "#5d6b63"
                : "#87938d",
          }}
        >
          {rest.join(" ")}
        </span>
        {st === "current" && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 9999,
              background: "#0f9f72",
              color: "#fff",
              fontWeight: 600,
              animation: "none",
            }}
          >
            진행 중
          </span>
        )}
      </div>

      {/* Node cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 8,
        }}
      >
        {stageNodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            edges={edges}
            onClick={onNodeClick}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { status: "done", label: "완료" },
    { status: "current", label: "진행 중" },
    { status: "waiting", label: "대기" },
    { status: "risk", label: "위험·병목" },
    { status: "loop", label: "보완 회귀" },
  ] as const;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "6px 16px",
        padding: "12px 0",
        borderTop: "1px solid #dde5df",
        marginTop: 8,
      }}
    >
      {items.map(({ status, label }) => {
        const meta = statusMeta(status);
        return (
          <div
            key={status}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: meta.badgeBg,
                border: `1.5px solid ${meta.cardBorder}`,
              }}
            />
            <span style={{ fontSize: 12, color: "#5d6b63" }}>{label}</span>
          </div>
        );
      })}
      <span
        style={{
          fontSize: 12,
          color: "#87938d",
          marginLeft: "auto",
          fontStyle: "italic",
        }}
      >
        법령상 구조 기준 — 노드 클릭 시 상세 보기
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProcessBoard({ process, compact = false }: ProcessBoardProps) {
  // Full board: delegate to the BPMN swimlane board
  if (!compact) {
    return <SwimlaneBoard process={process} />;
  }

  // ── Compact mode (home preview) ───────────────────────────────────────────
  const [activeNode, setActiveNode] = useState<ProcessNode | null>(null);
  const handleNodeClick = useCallback((node: ProcessNode) => setActiveNode(node), []);
  const handleClose     = useCallback(() => setActiveNode(null), []);

  const displayNodes = process.nodes
    .filter((n) => n.status === "current" || n.status === "risk" || n.status === "loop")
    .slice(0, 5);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 16 }}>
        <GateTimeline stages={process.stages} nodes={process.nodes} compact={true} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
        {displayNodes.map((node) => (
          <NodeCard key={node.id} node={node} edges={process.edges} onClick={handleNodeClick} compact={true} />
        ))}
      </div>

      <p style={{ fontSize: 12, color: "#87938d", marginTop: 12, fontStyle: "italic" }}>
        법령상 구조 기준 · 현장 검증 필요 항목은 앰버로 표시
      </p>

      {activeNode && (
        <NodeDrawer node={activeNode} edges={process.edges} onClose={handleClose} />
      )}
    </div>
  );
}
