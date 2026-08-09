import fs from "node:fs";

const GRAPH_BASE_URL = "https://graph.threads.net/v1.0";

const PROFILE_FIELDS = [
  "id",
  "username",
  "name",
  "threads_profile_picture_url",
  "threads_biography",
];

const THREAD_FIELDS = [
  "id",
  "media_type",
  "permalink",
  "timestamp",
  "text",
];

function formBody(values) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      body.set(key, String(value));
    }
  }
  return body;
}

function redactGraphError(payload) {
  const error = payload?.error;
  if (!error) return "unknown error";
  return [
    error.message,
    error.type ? `type=${error.type}` : "",
    error.code ? `code=${error.code}` : "",
    error.error_subcode ? `subcode=${error.error_subcode}` : "",
  ].filter(Boolean).join(" ");
}

export function loadEnvFile(filePath) {
  if (!filePath) return;
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

export function threadsConfigFromEnv() {
  return {
    appId: process.env.THREADS_APP_ID,
    appSecret: process.env.THREADS_APP_SECRET,
    accessToken: process.env.THREADS_ACCESS_TOKEN,
    userId: process.env.THREADS_USER_ID || "me",
  };
}

export function requireThreadsConfig(config = threadsConfigFromEnv()) {
  const missing = [];
  if (!config.accessToken) missing.push("THREADS_ACCESS_TOKEN");
  if (missing.length) {
    throw new Error(`Missing Threads env: ${missing.join(", ")}`);
  }
  return config;
}

export function maskSecret(value) {
  if (!value) return "<missing>";
  return `<set:${String(value).length}>`;
}

export async function threadsRequest(pathname, { method = "GET", accessToken, params = {} } = {}) {
  if (!accessToken) throw new Error("Threads access token required");

  const cleanPath = pathname.replace(/^\/+/, "");
  const url = new URL(`${GRAPH_BASE_URL}/${cleanPath}`);
  const request = { method };

  if (method === "GET") {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    url.searchParams.set("access_token", accessToken);
  } else {
    request.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    request.body = formBody({ ...params, access_token: accessToken });
  }

  const response = await fetch(url, request);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Threads API ${method} /${cleanPath} failed: HTTP ${response.status} ${redactGraphError(payload)}`);
  }
  return payload;
}

export async function getThreadsProfile(config) {
  return threadsRequest("me", {
    accessToken: config.accessToken,
    params: { fields: PROFILE_FIELDS.join(",") },
  });
}

export async function debugThreadsToken(config) {
  return threadsRequest("debug_token", {
    accessToken: config.accessToken,
    params: {
      input_token: config.accessToken,
    },
  });
}

export async function getRecentThreads(config, { limit = 5 } = {}) {
  const userId = config.userId || "me";
  return threadsRequest(`${encodeURIComponent(userId)}/threads`, {
    accessToken: config.accessToken,
    params: {
      fields: THREAD_FIELDS.join(","),
      limit,
    },
  });
}

export async function createTextContainer(config, { text }) {
  const userId = config.userId || "me";
  if (!text?.trim()) throw new Error("Text is required");
  return threadsRequest(`${encodeURIComponent(userId)}/threads`, {
    method: "POST",
    accessToken: config.accessToken,
    params: {
      media_type: "TEXT",
      text,
    },
  });
}

export async function publishContainer(config, { creationId }) {
  const userId = config.userId || "me";
  if (!creationId) throw new Error("creationId is required");
  return threadsRequest(`${encodeURIComponent(userId)}/threads_publish`, {
    method: "POST",
    accessToken: config.accessToken,
    params: { creation_id: creationId },
  });
}

export function summarizeThread(thread) {
  const text = String(thread.text ?? "");
  return {
    id: thread.id,
    mediaType: thread.media_type,
    timestamp: thread.timestamp,
    permalink: thread.permalink,
    textPreview: text.length > 90 ? `${text.slice(0, 90)}...` : text,
  };
}
