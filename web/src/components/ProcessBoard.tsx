"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ProcessModel,
  ProcessNode,
  ProcessEdge,
  ProcessLaneGroup,
  SourceVerification,
} from "@/lib/types";
import { getNodeVerification } from "@/lib/process-verification";
import {
  NodeLegalVerification,
  ProcessVerificationSummaryBar,
  VerificationMark,
} from "./ProcessVerification";
import PortraitProcessBoard from "./PortraitProcessBoard";
import SwimlaneBoard from "./SwimlaneBoard";

interface ProcessBoardProps {
  process: ProcessModel;
  verification?: SourceVerification;
  compact?: boolean;
  layout?: "portrait" | "landscape";
  laneGroups?: ProcessLaneGroup[];
  initialNodeId?: string;
  onNodeChange?: (nodeId: string | null) => void;
  showDrawer?: boolean;
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
    label: "선행",
    cardBg: "#f5f7f6",
    cardBorder: "#dde5df",
    badgeBg: "#dff5eb",
    badgeText: "#087452",
  },
  current: {
    label: "핵심",
    cardBg: "#ffffff",
    cardBorder: "#0f9f72",
    badgeBg: "#0f9f72",
    badgeText: "#ffffff",
  },
  waiting: {
    label: "후속",
    cardBg: "#f5f7f6",
    cardBorder: "#dde5df",
    badgeBg: "#f5f7f6",
    badgeText: "#5d6b63",
  },
  risk: {
    label: "병목",
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
                      transition:
                        "background-color 180ms var(--ease-in-out), border-color 180ms var(--ease-in-out), box-shadow 180ms var(--ease-in-out)",
                      flexShrink: 0,
                    }}
                  />
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
                    transition:
                      "background-color 180ms var(--ease-in-out)",
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
  verification,
  onClick,
  compact,
}: {
  node: ProcessNode;
  edges: ProcessEdge[];
  verification?: SourceVerification;
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
  const verificationResult = getNodeVerification(node, verification);

  return (
    <button
      className="process-node-card"
      onClick={() => onClick(node)}
      aria-label={`${node.name} — ${meta.label}`}
      style={{
        "--node-card-border": meta.cardBorder,
        "--node-card-shadow": isCurrent
          ? "0 0 0 2px rgba(15,159,114,0.15)"
          : "none",
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: compact ? "10px 12px" : "14px 16px",
        background: meta.cardBg,
        borderRadius: 8,
        cursor: "pointer",
        position: "relative",
      } as React.CSSProperties}
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
            borderRadius: 4,
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
              borderRadius: 4,
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
              borderRadius: 4,
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

      <div style={{ marginTop: 7 }}>
        <VerificationMark result={verificationResult} compact />
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
  verification,
  onClose,
}: {
  node: ProcessNode;
  edges: ProcessEdge[];
  verification?: SourceVerification;
  onClose: () => void;
}) {
  const meta = statusMeta(node.status);
  const loopEdges = getLoopEdgesForNode(node.id, edges);
  const messageEdges = getMessageEdgesForNode(node.id, edges);
  const lowConfidence =
    node.confidence !== undefined && node.confidence < 0.8;
  const [closing, setClosing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const requestClose = useCallback(
    (immediate = false) => {
      if (immediate) {
        onClose();
        return;
      }
      if (closing) return;
      setClosing(true);
      closeTimerRef.current = window.setTimeout(onClose, 160);
    },
    [closing, onClose]
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        requestClose(true);
        return;
      }
      if (e.key === "Tab") {
        keepFocusInDrawer(e, drawerRef.current);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [requestClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    },
    []
  );

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
        className="process-node-backdrop"
        data-closing={closing}
        onClick={() => requestClose()}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,20,16,0.35)",
          zIndex: 100,
        }}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className="process-node-drawer"
        data-closing={closing}
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
                  borderRadius: 4,
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
            ref={closeButtonRef}
            className="process-node-close"
            onClick={() => requestClose()}
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

        {node.legal_basis && node.legal_basis.length > 0 && (
          <DrawerSection title="법적 근거 · 검증">
            <NodeLegalVerification node={node} verification={verification} />
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

    </>
  );
}

function keepFocusInDrawer(event: KeyboardEvent, drawer: HTMLElement | null) {
  if (!drawer) return;
  const focusable = Array.from(
    drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.getClientRects().length > 0);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable.at(-1) ?? first;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !drawer.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !drawer.contains(active))) {
    event.preventDefault();
    first.focus();
  }
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProcessBoard({
  process,
  verification,
  compact = false,
  layout = "portrait",
  laneGroups,
  initialNodeId,
  onNodeChange,
  showDrawer = true,
}: ProcessBoardProps) {
  const [activeNode, setActiveNode] = useState<ProcessNode | null>(() =>
    process.nodes.find((node) => node.id === initialNodeId) ?? null
  );
  const handleNodeClick = useCallback(
    (node: ProcessNode) => {
      setActiveNode(node);
      onNodeChange?.(node.id);
    },
    [onNodeChange]
  );
  const handleClose = useCallback(() => {
    setActiveNode(null);
    onNodeChange?.(null);
  }, [onNodeChange]);

  // Full board: portrait is the default; landscape remains available as a detail view.
  if (!compact) {
    if (layout === "portrait") {
      return (
        <PortraitProcessBoard
          process={process}
          verification={verification}
          laneGroups={laneGroups}
          initialNodeId={initialNodeId}
          onNodeChange={onNodeChange}
          showDrawer={showDrawer}
        />
      );
    }
    return (
      <SwimlaneBoard
        process={process}
        verification={verification}
        initialNodeId={initialNodeId}
        onNodeChange={onNodeChange}
        showDrawer={showDrawer}
      />
    );
  }

  // ── Compact mode (home preview) ───────────────────────────────────────────
  const displayNodes = process.nodes
    .filter((n) => n.status === "current" || n.status === "risk" || n.status === "loop")
    .slice(0, 5);

  return (
    <div style={{ width: "100%" }}>
      <ProcessVerificationSummaryBar
        process={process}
        verification={verification}
        compact
      />

      <div style={{ marginBottom: 16 }}>
        <GateTimeline stages={process.stages} nodes={process.nodes} compact={true} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
        {displayNodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            edges={process.edges}
            verification={verification}
            onClick={handleNodeClick}
            compact={true}
          />
        ))}
      </div>

      <p style={{ fontSize: 12, color: "#87938d", marginTop: 12 }}>
        법령상 구조 기준 · 공식 원문 검증 상태 포함
      </p>

      {showDrawer && activeNode && (
        <NodeDrawer
          node={activeNode}
          edges={process.edges}
          verification={verification}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
