import { SYNC_CHUNK_BYTES } from "./constants.js";
import { makeId } from "./model.js";

const KEYS = {
  favorites: "k100:favorites",
  draftIndex: "k100:draft-index",
  localDraftIndex: "k100:local-draft-index",
  settings: "k100:settings",
  sources: "k100:sources"
};

function getChrome() {
  if (!globalThis.chrome?.storage) throw new Error("Chrome 저장소를 사용할 수 없습니다.");
  return globalThis.chrome;
}

function chunkText(text, maxBytes = SYNC_CHUNK_BYTES) {
  const encoder = new TextEncoder();
  const chunks = [];
  let current = "";
  let bytes = 0;
  for (const char of text) {
    const charBytes = encoder.encode(char).byteLength;
    if (bytes + charBytes > maxBytes && current) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += charBytes;
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}

export async function readChunked(area, key, fallback) {
  const metaKey = `${key}:meta`;
  const metaResult = await area.get(metaKey);
  const count = Number(metaResult?.[metaKey]?.count ?? 0);
  if (!count) return fallback;
  const chunkKeys = Array.from({ length: count }, (_, index) => `${key}:${index}`);
  const values = await area.get(chunkKeys);
  const serialized = chunkKeys.map((chunkKey) => values?.[chunkKey] ?? "").join("");
  try {
    return JSON.parse(serialized);
  } catch {
    return fallback;
  }
}

export async function writeChunked(area, key, value) {
  const metaKey = `${key}:meta`;
  const previous = await area.get(metaKey);
  const previousCount = Number(previous?.[metaKey]?.count ?? 0);
  const chunks = chunkText(JSON.stringify(value));
  const payload = {
    [metaKey]: { count: chunks.length, version: 1 }
  };
  chunks.forEach((chunk, index) => {
    payload[`${key}:${index}`] = chunk;
  });
  await area.set(payload);
  if (previousCount > chunks.length) {
    await area.remove(
      Array.from({ length: previousCount - chunks.length }, (_, index) => `${key}:${chunks.length + index}`)
    );
  }
}

export async function getFavorites() {
  return readChunked(getChrome().storage.sync, KEYS.favorites, []);
}

export async function setFavorites(slugs) {
  const unique = [...new Set(slugs)].sort();
  await writeChunked(getChrome().storage.sync, KEYS.favorites, unique);
  return unique;
}

export async function toggleFavorite(slug) {
  const favorites = await getFavorites();
  const next = favorites.includes(slug) ? favorites.filter((item) => item !== slug) : [...favorites, slug];
  return setFavorites(next);
}

export async function getDraftIndex() {
  const chrome = getChrome();
  const [synced, localResult] = await Promise.all([
    readChunked(chrome.storage.sync, KEYS.draftIndex, []),
    chrome.storage.local.get(KEYS.localDraftIndex)
  ]);
  const local = localResult?.[KEYS.localDraftIndex] ?? [];
  const merged = new Map();
  for (const item of [...synced, ...local]) {
    const previous = merged.get(item.id);
    if (!previous || String(item.updatedAt).localeCompare(String(previous.updatedAt)) >= 0) merged.set(item.id, item);
  }
  return [...merged.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function setDraftIndex(index) {
  const sorted = [...index].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const chrome = getChrome();
  await Promise.all([
    chrome.storage.local.set({ [KEYS.localDraftIndex]: sorted }),
    writeChunked(chrome.storage.sync, KEYS.draftIndex, sorted.slice(0, 80))
  ]);
  return sorted;
}

export async function getDraft(id) {
  const key = `k100:draft:${id}`;
  const result = await getChrome().storage.local.get(key);
  return result?.[key] ?? null;
}

export async function listDrafts() {
  const index = await getDraftIndex();
  const drafts = await Promise.all(index.map((item) => getDraft(item.id)));
  return drafts.filter(Boolean);
}

export async function saveDraft(draft) {
  const timestamp = new Date().toISOString();
  const saved = { ...draft, updatedAt: timestamp };
  const key = `k100:draft:${saved.id}`;
  await getChrome().storage.local.set({ [key]: saved });
  const index = await getDraftIndex();
  const nextItem = {
    id: saved.id,
    name: saved.name,
    baseSlug: saved.baseSlug || "",
    category: saved.category || "",
    nodeCount: saved.nodes?.length ?? 0,
    updatedAt: timestamp
  };
  await setDraftIndex([nextItem, ...index.filter((item) => item.id !== saved.id)]);
  return saved;
}

export async function deleteDraft(id) {
  await getChrome().storage.local.remove(`k100:draft:${id}`);
  const index = await getDraftIndex();
  await setDraftIndex(index.filter((item) => item.id !== id));
  const sources = await listSources();
  await setSources(sources.map((source) => (source.draftId === id ? { ...source, draftId: "", nodeId: "" } : source)));
}

export async function getSettings() {
  return readChunked(getChrome().storage.sync, KEYS.settings, {
    activeTab: "mine",
    compactRows: false
  });
}

export async function setSettings(settings) {
  await writeChunked(getChrome().storage.sync, KEYS.settings, settings);
  return settings;
}

export async function listSources() {
  const result = await getChrome().storage.local.get(KEYS.sources);
  return result?.[KEYS.sources] ?? [];
}

async function setSources(sources) {
  const limited = [...sources]
    .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))
    .slice(0, 300);
  await getChrome().storage.local.set({ [KEYS.sources]: limited });
  return limited;
}

export async function saveSource(source) {
  const sources = await listSources();
  const saved = {
    id: source.id || makeId("source"),
    title: source.title,
    url: source.url,
    excerpt: source.excerpt,
    capturedAt: source.capturedAt || new Date().toISOString(),
    draftId: source.draftId || "",
    nodeId: source.nodeId || ""
  };
  await setSources([saved, ...sources.filter((item) => item.id !== saved.id)]);
  return saved;
}

export async function updateSource(id, patch) {
  const sources = await listSources();
  return setSources(sources.map((source) => (source.id === id ? { ...source, ...patch } : source)));
}

export async function deleteSource(id) {
  const sources = await listSources();
  return setSources(sources.filter((source) => source.id !== id));
}

export async function getPendingCapture() {
  const result = await getChrome().storage.session.get("k100:pending-capture");
  return result?.["k100:pending-capture"] ?? null;
}

export async function setPendingCapture(value) {
  if (value) {
    await getChrome().storage.session.set({ "k100:pending-capture": value });
  } else {
    await getChrome().storage.session.remove("k100:pending-capture");
  }
}

export async function clearWorkspace() {
  const index = await getDraftIndex();
  await getChrome().storage.local.remove(index.map((item) => `k100:draft:${item.id}`));
  await getChrome().storage.local.remove(KEYS.sources);
  await getChrome().storage.local.remove(KEYS.localDraftIndex);
  await setDraftIndex([]);
  await setFavorites([]);
}
