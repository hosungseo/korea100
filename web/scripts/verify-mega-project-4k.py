#!/usr/bin/env python3

import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify the mega-project board at a 4096x2160 viewport.")
    parser.add_argument("url")
    parser.add_argument("--screenshot", required=True)
    parser.add_argument("--executable")
    args = parser.parse_args()

    output = Path(args.screenshot).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    console_errors = []
    failed_requests = []

    with sync_playwright() as playwright:
        launch_options = {"headless": True}
        if args.executable:
            launch_options["executable_path"] = args.executable
        browser = playwright.chromium.launch(**launch_options)
        page = browser.new_page(viewport={"width": 4096, "height": 2160}, device_scale_factor=1)
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("requestfailed", lambda request: failed_requests.append({"url": request.url, "error": request.failure}))
        page.goto(args.url, wait_until="networkidle", timeout=120_000)
        page.wait_for_selector('[aria-label="49개 행정절차 선행조건 지도"]', timeout=30_000)
        page.wait_for_timeout(1_500)
        page.screenshot(path=str(output), full_page=False)

        metrics = page.evaluate(
            """
            () => {
              const viewport = { width: window.innerWidth, height: window.innerHeight };
              const milestones = [...document.querySelectorAll('article[aria-label^="N"]')];
              const detailGroups = [...document.querySelectorAll('[aria-label="Korea100 하위 행정절차"] section[data-mapping]')];
              const detailNodes = [...document.querySelectorAll('[aria-label="Korea100 하위 행정절차"] [data-type][data-mapping]')]
                .filter((element) => element.tagName.toLowerCase() === 'span');
              const outside = (element) => {
                const rect = element.getBoundingClientRect();
                return rect.width <= 0 || rect.height <= 0 || rect.left < -1 || rect.top < -1 || rect.right > viewport.width + 1 || rect.bottom > viewport.height + 1;
              };
              const mappingCounts = detailGroups.reduce((counts, element) => {
                const key = element.dataset.mapping || 'unknown';
                counts[key] = (counts[key] || 0) + 1;
                return counts;
              }, {});
              return {
                title: document.title,
                viewport,
                body: {
                  clientWidth: document.documentElement.clientWidth,
                  clientHeight: document.documentElement.clientHeight,
                  scrollWidth: document.documentElement.scrollWidth,
                  scrollHeight: document.documentElement.scrollHeight,
                },
                milestoneCount: milestones.length,
                detailGroupCount: detailGroups.length,
                detailNodeCount: detailNodes.length,
                mappingCounts,
                buttonCount: document.querySelectorAll('button').length,
                horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                verticalScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight,
                clippedMilestones: milestones.filter(outside).map((element) => element.getAttribute('aria-label')),
                clippedDetailGroups: detailGroups.filter(outside).map((element) => element.querySelector('a,strong')?.textContent?.trim() || 'unknown'),
                missingTemplateGroups: detailGroups.filter((element) => element.dataset.mapping === 'missing').length,
              };
            }
            """
        )
        browser.close()

    result = {
        **metrics,
        "consoleErrors": console_errors,
        "failedRequests": [item for item in failed_requests if "ERR_ABORTED" not in str(item["error"])],
        "abortedPrefetches": len([item for item in failed_requests if "ERR_ABORTED" in str(item["error"])]),
        "screenshot": str(output),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))

    failures = []
    if metrics["viewport"] != {"width": 4096, "height": 2160}:
        failures.append("viewport")
    if metrics["milestoneCount"] != 49:
        failures.append("milestoneCount")
    if metrics["detailNodeCount"] < 899:
        failures.append("detailNodeCount")
    if metrics["buttonCount"] != 0:
        failures.append("buttonCount")
    if metrics["horizontalScroll"] or metrics["verticalScroll"]:
        failures.append("documentScroll")
    if metrics["clippedMilestones"] or metrics["clippedDetailGroups"]:
        failures.append("clipping")
    material_request_failures = [item for item in failed_requests if "ERR_ABORTED" not in str(item["error"])]
    if console_errors or material_request_failures:
        failures.append("browserErrors")
    if failures:
        raise SystemExit("4K verification failed: " + ", ".join(failures))


if __name__ == "__main__":
    main()
