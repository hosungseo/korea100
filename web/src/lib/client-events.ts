export type EventProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

const ANALYTICS_ENDPOINT =
  process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT?.trim() ?? "";
const LOCAL_METRICS_KEY = "korea100_event_counts";

declare global {
  interface Window {
    gtag?: (
      command: "event",
      eventName: string,
      properties?: EventProperties
    ) => void;
  }
}

export function trackEvent(name: string, properties: EventProperties = {}) {
  if (typeof window === "undefined") return;

  const cleanProperties = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined)
  );
  const payload = {
    name,
    properties: cleanProperties,
    path: window.location.pathname,
    occurredAt: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent("korea100:analytics", { detail: payload }));
  window.gtag?.("event", name, cleanProperties);
  recordLocalCount(name);

  if (!ANALYTICS_ENDPOINT) return;
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      ANALYTICS_ENDPOINT,
      new Blob([body], { type: "application/json" })
    );
    return;
  }

  void fetch(ANALYTICS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

function recordLocalCount(name: string) {
  try {
    const current = JSON.parse(
      window.localStorage.getItem(LOCAL_METRICS_KEY) ?? "{}"
    ) as Record<string, number>;
    current[name] = (current[name] ?? 0) + 1;
    window.localStorage.setItem(LOCAL_METRICS_KEY, JSON.stringify(current));
  } catch {
    // Metrics must never interrupt the user workflow.
  }
}
