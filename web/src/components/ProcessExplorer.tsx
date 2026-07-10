"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ProcessModel, SourceVerification } from "@/lib/types";
import { trackEvent } from "@/lib/client-events";
import ProcessBoard from "./ProcessBoard";

type ProcessMode = "summary" | "full";

export default function ProcessExplorer({
  process,
  verification,
  slug,
}: {
  process: ProcessModel;
  verification?: SourceVerification;
  slug: string;
}) {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<ProcessMode>(() =>
    searchParams.get("process") === "full" ? "full" : "summary"
  );
  const initialNodeId = searchParams.get("node") ?? undefined;

  function selectMode(nextMode: ProcessMode) {
    setMode(nextMode);
    updateDetailUrl("process", nextMode === "full" ? "full" : "");
    trackEvent("process_mode", { slug, mode: nextMode });
  }

  function handleNodeChange(nodeId: string | null) {
    updateDetailUrl("node", nodeId ?? "");
    if (nodeId) trackEvent("process_node_open", { slug, node_id: nodeId });
  }

  return (
    <div className="process-explorer">
      <div className="process-mode-bar">
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
        <p>
          {mode === "summary"
            ? "핵심·병목·회귀 노드를 먼저 표시합니다."
            : "모든 행위자 레인과 연결 관계를 표시합니다."}
        </p>
      </div>

      <ProcessBoard
        process={process}
        verification={verification}
        compact={mode === "summary"}
        initialNodeId={initialNodeId}
        onNodeChange={handleNodeChange}
      />
    </div>
  );
}

function updateDetailUrl(key: string, value: string) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
