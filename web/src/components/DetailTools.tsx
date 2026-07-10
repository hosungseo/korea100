"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/client-events";

export default function DetailTools({
  institutionName,
  slug,
}: {
  institutionName: string;
  slug: string;
}) {
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);

  async function sharePage() {
    const shareData = {
      title: `${institutionName} — 대한민국 제도 100`,
      text: `${institutionName}의 법령상 구조와 업무 흐름`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        trackEvent("detail_share", { slug, method: "native" });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setStatus("링크를 복사했습니다.");
      trackEvent("detail_share", { slug, method: "clipboard" });
    } catch {
      setStatus("공유를 완료하지 못했습니다.");
    }
  }

  async function savePng() {
    const target = document.getElementById("institution-one-page");
    if (!target || exporting) return;
    setExporting(true);
    setStatus("");
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(target, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = `${slug}-institution-model.png`;
      link.href = dataUrl;
      link.click();
      setStatus("PNG 파일을 만들었습니다.");
      trackEvent("detail_export", { slug, format: "png" });
    } catch {
      setStatus("PNG 생성에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  function printPage() {
    trackEvent("detail_export", { slug, format: "print" });
    window.print();
  }

  return (
    <div className="detail-tools" aria-label="공유 및 내보내기">
      <button type="button" onClick={sharePage}>
        공유
      </button>
      <button type="button" onClick={savePng} disabled={exporting}>
        {exporting ? "PNG 생성 중" : "PNG 저장"}
      </button>
      <button type="button" onClick={printPage}>
        인쇄·PDF
      </button>
      <span aria-live="polite">{status}</span>
    </div>
  );
}
