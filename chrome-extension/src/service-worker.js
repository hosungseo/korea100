import { prepareCapture } from "./lib/privacy.js";
import { setPendingCapture } from "./lib/storage.js";

const MENU_CAPTURE = "korea100-capture-selection";
const MENU_OPEN = "korea100-open-workbench";

async function configureExtension() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_CAPTURE,
    title: "선택 문장을 Korea100 근거로 가져오기",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: MENU_OPEN,
    title: "Korea100 작업대 열기",
    contexts: ["page"]
  });
}

chrome.runtime.onInstalled.addListener(() => {
  configureExtension().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

async function publishPendingCapture(payload) {
  const { capture, findings } = prepareCapture(payload);
  const pending = {
    ...capture,
    findings,
    requestedAt: new Date().toISOString()
  };
  await setPendingCapture(pending);
  try {
    await chrome.runtime.sendMessage({ type: "pending-capture-ready" });
  } catch {
    // The side panel may not be open yet.
  }
  return pending;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id;
  if (info.menuItemId === MENU_OPEN && tabId) {
    chrome.sidePanel.open({ tabId }).catch(console.error);
    return;
  }
  if (info.menuItemId !== MENU_CAPTURE || !tabId) return;

  publishPendingCapture({
    title: tab.title,
    url: tab.url,
    excerpt: info.selectionText
  })
    .then(() => chrome.sidePanel.open({ tabId }))
    .catch(console.error);
});

async function captureActiveSelection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("현재 탭을 찾지 못했습니다.");
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      title: document.title,
      url: window.location.href,
      excerpt: window.getSelection()?.toString() ?? ""
    })
  });
  if (!result?.excerpt?.trim()) throw new Error("웹페이지에서 근거로 쓸 문장을 먼저 선택하세요.");
  return publishPendingCapture(result);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "capture-active-selection") return false;
  captureActiveSelection()
    .then((capture) => sendResponse({ ok: true, capture }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
