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
import { getNodeVerification } from "@/lib/process-verification";
import DesktopProcessBoard from "./DesktopProcessBoard";
import PortraitProcessBoard from "./PortraitProcessBoard";
import { VerificationMark } from "./ProcessVerification";

type ProcessMode = "summary" | "full";

// 에이전트 준비도 — R2 파이프라인이 제도 JSON에 심는 블록의 필요한 부분만.
// 전체 타입은 검증 파이프라인 소관이라 여기서는 화면에 쓰는 필드만 좁게 읽는다.
type AgentReadinessLite = {
  level?: string;
  actionable_node_ids?: string[];
  reference_only_node_ids?: string[];
  reference_only_reasons?: Record<string, string[]>;
};

function readReadiness(process: ProcessModel): AgentReadinessLite | undefined {
  return (process as ProcessModel & { agent_readiness?: AgentReadinessLite }).agent_readiness;
}

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
  const readiness = readReadiness(process);
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
          {readiness?.level === "R2" && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                fontWeight: 700,
                color: "#0b7a5c",
                border: "1px solid currentColor",
                borderRadius: 4,
                padding: "1px 6px",
                whiteSpace: "nowrap",
              }}
              title={`에이전트 준비도 R2 — 법제처 현행 원문 대조·전이 수동 대조 통과. 실행 대상 ${readiness.actionable_node_ids?.length ?? 0}개 단계${
                (readiness.reference_only_node_ids?.length ?? 0) > 0
                  ? `, 참고용 격리 ${readiness.reference_only_node_ids?.length}개`
                  : ""
              }`}
            >
              R2 · 다음 행동 {readiness.actionable_node_ids?.length ?? 0}/{process.nodes.length}
            </span>
          )}
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
        <ProcessNodeInspector node={selectedNode} verification={verification} readiness={readiness} />
      )}
    </div>
  );
}

function ProcessNodeInspector({
  node,
  verification,
  readiness,
}: {
  node: ProcessNode;
  verification?: SourceVerification;
  readiness?: AgentReadinessLite;
}) {
  const status = statusMeta(node.status);
  // 참고용 격리 — 근거 품질 문제로 다음 행동 계산에서 빠진 단계.
  // MCP가 이 단계를 지나는 계산을 거부하므로 화면에서도 같은 말을 해야 한다.
  const isolationReasons = readiness?.reference_only_node_ids?.includes(node.id)
    ? readiness.reference_only_reasons?.[node.id] ?? []
    : null;
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
          <i style={{ color: status.color, borderColor: status.color }}>
            {status.label}
          </i>
          {isolationReasons && (
            <i
              style={{ color: "#8a6d1a", borderColor: "#8a6d1a" }}
              title={`이 단계는 다음 행동 계산에서 제외됩니다 — ${
                isolationReasons.join(", ") || "사유 미기재"
              }`}
            >
              참고용 격리
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
          <p><strong>병목</strong> · {node.blocker}</p>
        )}
      </div>

      <div className="process-node-inspector-laws">
        <div className="process-node-inspector-laws-heading">
          <span>법적 근거</span>
          <VerificationMark result={verificationResult} />
        </div>
        <div className="process-node-inspector-laws-list">
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

function statusMeta(status: ProcessNode["status"]) {
  const meta = {
    done: { label: "완료", color: "#5d6b63" },
    current: { label: "현재", color: "#087452" },
    waiting: { label: "대기", color: "#5d6b63" },
    risk: { label: "위험", color: "#c78116" },
    loop: { label: "회귀", color: "#c78116" },
  };
  return meta[status];
}

function updateDetailUrl(key: string, value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
