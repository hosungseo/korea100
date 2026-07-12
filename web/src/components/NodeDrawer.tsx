"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type {
  ProcessNode,
  ProcessEdge,
  SourceVerification,
} from "@/lib/types";
import { NodeLegalVerification } from "./ProcessVerification";

// Badge and loop-edge styling differ between the process board and the
// swimlane board; everything else in the drawer is identical, so the two
// callers pass these two style objects and share this single implementation.
export interface NodeDrawerBadge {
  label: string;
  background: string;
  color: string;
  border?: string;
}

export interface NodeDrawerLoopEdgeStyle {
  background: string;
  color: string;
}

export function NodeDrawer({
  node,
  edges,
  verification,
  onClose,
  badge,
  loopEdgeStyle,
}: {
  node: ProcessNode;
  edges: ProcessEdge[];
  verification?: SourceVerification;
  onClose: () => void;
  badge: NodeDrawerBadge;
  loopEdgeStyle: NodeDrawerLoopEdgeStyle;
}) {
  const loopEdges = edges.filter(
    (e) => e.type === "loop" && (e.source === node.id || e.target === node.id)
  );
  const messageEdges = edges.filter(
    (e) => e.type === "message" && (e.source === node.id || e.target === node.id)
  );
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

  // Close on Escape, trap Tab focus inside the drawer
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
              <span className="mono" style={{ color: "#5d6b63" }}>
                {node.id}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: badge.background,
                  color: badge.color,
                  border: badge.border,
                }}
              >
                {badge.label}
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
              color: "#5d6b63",
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

        {/* Low-confidence badge */}
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
                  background: loopEdgeStyle.background,
                  borderRadius: 8,
                  fontSize: 13,
                  color: loopEdgeStyle.color,
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

export function keepFocusInDrawer(
  event: KeyboardEvent,
  drawer: HTMLElement | null
) {
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

export function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#5d6b63",
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

export function DrawerSection({
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
          color: "#5d6b63",
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
