"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/client-events";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
type ExportKind = "landscape" | "portrait";

export default function DetailTools({
  institutionName,
  slug,
}: {
  institutionName: string;
  slug: string;
}) {
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState<ExportKind | null>(null);

  async function sharePage() {
    const pageUrl = new URL(`${BASE_PATH}/model/${slug}/`, window.location.origin).href;
    const shareData = {
      title: `${institutionName} — 대한민국 제도 100`,
      text: `${institutionName}의 법령상 구조와 업무 흐름`,
      url: pageUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        trackEvent("detail_share", { slug, method: "native" });
        return;
      }
      await navigator.clipboard.writeText(pageUrl);
      setStatus("링크를 복사했습니다.");
      trackEvent("detail_share", { slug, method: "clipboard" });
    } catch {
      setStatus("공유를 완료하지 못했습니다.");
    }
  }

  async function saveLandscapePng() {
    if (exporting) return;
    const target = document.querySelector<HTMLElement>(".process-desktop-board");
    if (!target) {
      setStatus("가로 업무구조도를 찾지 못했습니다.");
      return;
    }

    setExporting("landscape");
    setStatus("");
    const previousStyle = target.getAttribute("style");
    const previousAriaHidden = target.getAttribute("aria-hidden");

    try {
      const fullModeButton = document.querySelector<HTMLButtonElement>(
        '[data-process-mode="full"]',
      );
      if (!target.querySelector(".swimlane-board")) {
        fullModeButton?.click();
        await waitForElement(target, ".swimlane-board");
      }

      target.dataset.exporting = "true";
      target.setAttribute("aria-hidden", "true");
      target.style.setProperty("--process-export-width", "1700px");
      await waitForLayout();

      const scroll = target.querySelector<HTMLElement>(".process-board-scroll");
      const grid = scroll?.firstElementChild as HTMLElement | null;
      const contentWidth = Math.max(
        1280,
        scroll?.scrollWidth ?? 0,
        grid?.scrollWidth ?? 0,
      );
      target.style.setProperty("--process-export-width", `${contentWidth + 48}px`);
      await waitForLayout();
      await document.fonts.ready;

      const exportTarget = target;
      const width = Math.ceil(exportTarget.scrollWidth);
      const targetTop = exportTarget.getBoundingClientRect().top;
      const lastContent = exportTarget.querySelector<HTMLElement>(
        ".swimlane-desktop-view > .process-board-legend",
      );
      const contentBottom =
        lastContent?.getBoundingClientRect().bottom ??
        exportTarget.getBoundingClientRect().bottom;
      const height = Math.ceil(contentBottom - targetTop + 24);
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(exportTarget, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        pixelRatio: 2,
        width,
        height,
        style: {
          position: "static",
          top: "0",
          left: "0",
          zIndex: "auto",
        },
      });
      downloadFile(dataUrl, `${slug}-process-map-landscape.png`);
      setStatus("가로 업무구조도 PNG를 저장했습니다.");
      trackEvent("detail_export", { slug, format: "png-landscape" });
    } catch {
      setStatus("가로 PNG 생성에 실패했습니다.");
    } finally {
      delete target.dataset.exporting;
      restoreAttribute(target, "style", previousStyle);
      restoreAttribute(target, "aria-hidden", previousAriaHidden);
      setExporting(null);
    }
  }

  async function savePortraitPng() {
    if (exporting) return;
    setExporting("portrait");
    setStatus("");
    try {
      const imageUrl = `${BASE_PATH}/exports/process-maps/${slug}.png`;
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`Portrait image request failed: ${response.status}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      downloadFile(objectUrl, `${slug}-process-map-portrait.png`);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setStatus("세로 업무구조도 PNG를 저장했습니다.");
      trackEvent("detail_export", { slug, format: "png-portrait" });
    } catch {
      setStatus("세로 PNG 저장에 실패했습니다.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="detail-tools" aria-label="공유 및 내보내기">
      <button type="button" onClick={sharePage}>
        공유
      </button>
      <button type="button" onClick={saveLandscapePng} disabled={exporting !== null}>
        {exporting === "landscape" ? "PNG 생성 중" : "PNG 저장"}
      </button>
      <button type="button" onClick={savePortraitPng} disabled={exporting !== null}>
        {exporting === "portrait" ? "PNG 준비 중" : "세로 PNG 저장"}
      </button>
      <span aria-live="polite">{status}</span>
    </div>
  );
}

function downloadFile(href: string, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = href;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function restoreAttribute(
  element: HTMLElement,
  name: string,
  value: string | null,
) {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

async function waitForElement(
  parent: HTMLElement,
  selector: string,
  timeoutMs = 2_000,
) {
  const startedAt = performance.now();
  while (!parent.querySelector(selector)) {
    if (performance.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for ${selector}`);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 40));
  }
}

async function waitForLayout() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await new Promise((resolve) => window.setTimeout(resolve, 80));
}
