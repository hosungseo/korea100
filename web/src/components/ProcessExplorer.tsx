"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ProcessLaneGroup,
  ProcessModel,
  ProcessNode,
  SourceVerification,
} from "@/lib/types";
import { trackEvent } from "@/lib/client-events";
import { NODE_STATUS_META } from "@/lib/node-status";
import { getNodeVerification } from "@/lib/process-verification";
import { VerificationMark } from "./ProcessVerification";
import DesktopProcessBoard from "./DesktopProcessBoard";
import PortraitProcessBoard from "./PortraitProcessBoard";

type ProcessMode = "summary" | "full";

export default function ProcessExplorer({
  process,
  verification,
  slug,
  laneGroups,
}: {
  process: ProcessModel;
  verification?: SourceVerification;
  slug: string;
  laneGroups?: ProcessLaneGroup[];
}) {
  const searchParams = useSearchParams();
  const defaultNodeId =
    searchParams.get("node") ??
    process.nodes.find((node) => node.status === "current")?.id ??
    process.nodes[0]?.id;
  const [mode, setMode] = useState<ProcessMode>(() =>
    searchParams.get("process") === "summary" ? "summary" : "full",
  );
  const [selectedNodeId, setSelectedNodeId] = useState(defaultNodeId);
  const selectedNode =
    process.nodes.find((node) => node.id === selectedNodeId) ?? process.nodes[0];

  function selectMode(nextMode: ProcessMode) {
    setMode(nextMode);
    updateDetailUrl("process", nextMode === "summary" ? "summary" : "");
    trackEvent("process_mode", { slug, mode: nextMode });
  }

  function handleNodeChange(nodeId: string | null) {
    if (!nodeId) return;
    setSelectedNodeId(nodeId);
    updateDetailUrl("node", nodeId);
    trackEvent("process_node_open", { slug, node_id: nodeId });
  }

  return (
    <div className="process-explorer process-explorer-v2">
      <div className="process-mode-bar">
        <p>
          {mode === "summary"
            ? "단계별 핵심 업무를 빠르게 훑어봅니다."
            : "행위자 레인과 게이트를 전체 표시합니다."}
        </p>
        <div className="process-view-controls">
          <div
            className="process-mode-control"
            role="group"
            aria-label="업무구조도 표시 범위"
          >
            <button
              type="button"
              aria-pressed={mode === "summary"}
              onClick={() => selectMode("summary")}
            >
              핵심 흐름
            </button>
            <button
              type="button"
              aria-pressed={mode === "full"}
              onClick={() => selectMode("full")}
            >
              전체 구조도
            </button>
          </div>
        </div>
      </div>

      <div className="process-desktop-board">
        <DesktopProcessBoard
          process={process}
          compact={mode === "summary"}
          selectedNodeId={selectedNode.id}
          onNodeChange={handleNodeChange}
        />
      </div>

      <div className="process-mobile-board">
        <PortraitProcessBoard
          key={slug}
          process={process}
          verification={verification}
          laneGroups={laneGroups}
          initialNodeId={defaultNodeId}
          onNodeChange={handleNodeChange}
          embedded
          showDrawer={false}
        />
      </div>

      {selectedNode && (
        <ProcessNodeInspector node={selectedNode} verification={verification} />
      )}
    </div>
  );
}

function ProcessNodeInspector({
  node,
  verification,
}: {
  node: ProcessNode;
  verification?: SourceVerification;
}) {
  const status = NODE_STATUS_META[node.status];
  const verificationResult = getNodeVerification(node, verification);
  const documents = [
    ...(node.input_documents ?? []),
    ...(node.output_documents ?? []),
  ];

  return (
    <section className="process-node-inspector" aria-label="선택한 업무 노드 상세">
      <div className="process-node-inspector-main">
        <div className="process-node-inspector-label">
          <span>노드 상세</span>
          <strong>{node.id}</strong>
          {status.label && (
            <i style={{ color: status.color, borderColor: status.color }}>
              {status.label}
            </i>
          )}
        </div>
        <h3>{node.name}</h3>
        <p>{node.stage} · {node.lane} · {node.actor}</p>
        {documents.length > 0 && (
          <div className="process-node-documents">
            {[...new Set(documents)].map((document) => (
              <span key={document}>{document}</span>
            ))}
          </div>
        )}
      </div>

      <div className="process-node-inspector-metrics">
        <div>
          <span>기한</span>
          <strong>{node.deadline ?? "—"}</strong>
        </div>
        <div>
          <span>확신도</span>
          <strong>
            {node.confidence === undefined
              ? "—"
              : `${Math.round(node.confidence * 100)}%`}
          </strong>
        </div>
        {node.blocker && (
          <p><strong>유의</strong> · {node.blocker}</p>
        )}
      </div>

      <div className="process-node-inspector-laws">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          법적 근거
          <VerificationMark result={verificationResult} />
        </span>
        <div>
          {(node.legal_basis ?? []).map((basis) => (
            <article key={`${basis.law}:${basis.article}`}>
              <strong>{basis.law} {basis.article}</strong>
              {basis.text && <p>{basis.text}</p>}
            </article>
          ))}
          {!node.legal_basis?.length && <p>명시 조문 확인 필요</p>}
        </div>
      </div>
    </section>
  );
}

function updateDetailUrl(key: string, value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
