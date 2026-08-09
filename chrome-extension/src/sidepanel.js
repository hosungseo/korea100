import {
  CONTRIBUTION_KIND,
  DRAFT_KIND,
  EDGE_TYPES,
  MAX_IMPORT_BYTES,
  NODE_TYPES,
  SITE_ORIGIN,
  WORKSPACE_KIND
} from "./lib/constants.js";
import {
  createBlankDraft,
  createContributionPackage,
  createDraftFromInstitution,
  createWorkspacePackage,
  formatLegalBasis,
  makeId,
  nextEdgeId,
  nextNodeId,
  normalizeDraft,
  parseLegalBasis,
  parseList,
  remapNodesForListChange,
  validateDraft
} from "./lib/model.js";
import { prepareCapture, scanForPersonalData } from "./lib/privacy.js";
import {
  clearWorkspace,
  deleteDraft,
  deleteSource,
  getDraft,
  getDraftIndex,
  getFavorites,
  getPendingCapture,
  getSettings,
  listDrafts,
  listSources,
  saveDraft,
  saveSource,
  setFavorites,
  setPendingCapture,
  setSettings,
  toggleFavorite,
  updateSource
} from "./lib/storage.js";
import { downloadJson, escapeHtml, formatDate, icon, slugifyFilename } from "./lib/view.js";

const content = document.querySelector("#content");
const modal = document.querySelector("#modal");
const modalContent = document.querySelector("#modal-content");
const confirmDialog = document.querySelector("#confirm-dialog");
const importFile = document.querySelector("#import-file");
const toast = document.querySelector("#toast");

const state = {
  catalog: [],
  catalogBySlug: new Map(),
  favorites: [],
  draftIndex: [],
  localDraftIds: new Set(),
  sources: [],
  settings: { activeTab: "mine", compactRows: false },
  tab: "mine",
  draftSection: "overview",
  activeDraft: null,
  query: "",
  category: "",
  pendingCapture: null,
  toastTimer: null
};

function showToast(message, type = "success") {
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.className = `toast ${type === "error" ? "error" : ""} show`;
  state.toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 2_800);
}

function showModal(html) {
  if (modal.open) modal.close();
  modalContent.innerHTML = html;
  modal.showModal();
  requestAnimationFrame(() => {
    modal.querySelector("input:not([readonly]), textarea, select, button")?.focus();
  });
}

function closeModal() {
  if (modal.open) modal.close();
}

function askConfirmation({ title, message, submitLabel = "삭제" }) {
  document.querySelector("#confirm-title").textContent = title;
  document.querySelector("#confirm-message").textContent = message;
  document.querySelector("#confirm-submit").textContent = submitLabel;
  confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmDialog.addEventListener(
      "close",
      () => {
        resolve(confirmDialog.returnValue === "confirm");
      },
      { once: true }
    );
  });
}

function categoryOptions(selected = "") {
  const categories = [...new Set(state.catalog.map((item) => item.category).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ko")
  );
  return [
    `<option value="">전체 분야</option>`,
    ...categories.map(
      (category) =>
        `<option value="${escapeHtml(category)}" ${category === selected ? "selected" : ""}>${escapeHtml(category)}</option>`
    )
  ].join("");
}

function updateNavigation() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const selected = button.dataset.tab === state.tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}

function render() {
  updateNavigation();
  if (state.tab === "search") renderSearch();
  else if (state.tab === "draft") renderDraft();
  else renderMine();
}

function renderMine() {
  const favoriteItems = state.favorites.map((slug) => state.catalogBySlug.get(slug)).filter(Boolean);
  const inbox = state.sources.filter((source) => !source.draftId);
  content.innerHTML = `
    <div class="page-heading">
      <div>
        <p class="eyebrow">Workspace</p>
        <h1>내 제도</h1>
        <p>초안 ${state.draftIndex.length}개 · 즐겨찾기 ${favoriteItems.length}개</p>
      </div>
      <div class="button-row">
        <button class="button secondary small" type="button" data-action="import-json">
          ${icon("upload")}<span>가져오기</span>
        </button>
        <button class="button small" type="button" data-action="new-draft">
          ${icon("plus")}<span>새 초안</span>
        </button>
      </div>
    </div>

    <section class="section" aria-labelledby="draft-list-title">
      <div class="section-heading">
        <h2 id="draft-list-title">최근 초안</h2>
        <span class="count">${state.draftIndex.length}</span>
      </div>
      ${renderDraftIndex()}
    </section>

    <section class="section" aria-labelledby="favorite-list-title">
      <div class="section-heading">
        <h2 id="favorite-list-title">즐겨찾기</h2>
        <span class="count">${favoriteItems.length}</span>
      </div>
      ${favoriteItems.length ? `<ul class="list">${favoriteItems.map(renderInstitutionRow).join("")}</ul>` : renderEmpty("star", "찾기에서 자주 보는 제도를 표시하세요.", "find-institutions", "제도 찾기")}
    </section>

    <section class="section" aria-labelledby="inbox-title">
      <div class="section-heading">
        <h2 id="inbox-title">근거 보관함</h2>
        <span class="count">${inbox.length}</span>
      </div>
      ${inbox.length ? inbox.map((source) => renderSourceRow(source, { inbox: true })).join("") : `<p class="notice">웹페이지에서 가져온 근거 중 아직 초안에 연결하지 않은 항목이 없습니다.</p>`}
    </section>
  `;
}

function renderDraftIndex() {
  if (!state.draftIndex.length) {
    return renderEmpty("file-text", "새로 만들거나 기존 제도를 복제해 시작하세요.", "find-institutions", "제도 찾기");
  }
  return `<ul class="list">${state.draftIndex
    .map((draft) => {
      const available = state.localDraftIds.has(draft.id);
      return `
        <li class="list-row">
          <div class="list-main">
            <button class="list-title" type="button" data-action="open-draft" data-id="${escapeHtml(draft.id)}" ${available ? "" : "disabled"}>${escapeHtml(draft.name)}</button>
            <div class="list-meta">
              ${draft.category ? `<span>${escapeHtml(draft.category)}</span>` : ""}
              <span>노드 ${draft.nodeCount ?? 0}개</span>
              <span>${escapeHtml(formatDate(draft.updatedAt))}</span>
              ${available ? "" : `<span class="badge">이 기기 본문 없음</span>`}
            </div>
          </div>
          <div class="row-actions">
            <button class="icon-button" type="button" data-action="open-draft" data-id="${escapeHtml(draft.id)}" ${available ? "" : "disabled"} aria-label="${escapeHtml(draft.name)} 편집" title="${available ? "편집" : "이 기기에 본문 없음"}">
              ${icon("pencil")}
            </button>
            <button class="icon-button" type="button" data-action="delete-draft" data-id="${escapeHtml(draft.id)}" aria-label="${escapeHtml(draft.name)} 삭제" title="삭제">
              ${icon("trash-2")}
            </button>
          </div>
        </li>
      `;
    })
    .join("")}</ul>`;
}

function renderEmpty(iconName, text, action, label) {
  return `
    <div class="empty-state">
      ${icon(iconName)}
      <span>${escapeHtml(text)}</span>
      ${action ? `<button class="button secondary small" type="button" data-action="${action}">${escapeHtml(label)}</button>` : ""}
    </div>
  `;
}

function getFilteredCatalog() {
  const query = state.query.trim().toLocaleLowerCase("ko-KR");
  return state.catalog.filter((item) => {
    if (state.category && item.category !== state.category) return false;
    if (!query) return true;
    return query.split(/\s+/).every((term) => item.searchText.includes(term));
  });
}

function renderSearch() {
  const results = getFilteredCatalog();
  content.innerHTML = `
    <div class="page-heading">
      <div>
        <p class="eyebrow">Catalog</p>
        <h1>제도 찾기</h1>
        <p>제도명·기관·법령·업무로 검색</p>
      </div>
      <button class="button small" type="button" data-action="new-draft">${icon("plus")}<span>새 초안</span></button>
    </div>
    <div class="search-bar">
      ${icon("search")}
      <label class="visually-hidden" for="catalog-search">제도 검색</label>
      <input id="catalog-search" type="search" value="${escapeHtml(state.query)}" placeholder="예: 연구비 정산, 환경영향평가" autocomplete="off">
      ${state.query ? `<button class="icon-button clear-search" type="button" data-action="clear-search" aria-label="검색어 지우기" title="검색어 지우기">${icon("x")}</button>` : ""}
    </div>
    <div class="filter-row">
      <label class="visually-hidden" for="category-filter">분야</label>
      <select id="category-filter">${categoryOptions(state.category)}</select>
      <span id="result-count" class="result-count">${results.length}개</span>
    </div>
    <ul id="catalog-results" class="list">${results.slice(0, 60).map(renderInstitutionRow).join("")}</ul>
    <p id="result-limit-notice" class="notice" ${results.length > 60 ? "" : "hidden"}>검색 결과 ${results.length}개 중 앞의 60개를 표시합니다.</p>
  `;
  requestAnimationFrame(() => {
    const input = document.querySelector("#catalog-search");
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  });
}

function refreshSearchResults() {
  const results = getFilteredCatalog();
  const resultList = document.querySelector("#catalog-results");
  const resultCount = document.querySelector("#result-count");
  const limitNotice = document.querySelector("#result-limit-notice");
  if (resultList) resultList.innerHTML = results.slice(0, 60).map(renderInstitutionRow).join("");
  if (resultCount) resultCount.textContent = `${results.length}개`;
  if (limitNotice) {
    limitNotice.hidden = results.length <= 60;
    limitNotice.textContent = `검색 결과 ${results.length}개 중 앞의 60개를 표시합니다.`;
  }
}

function renderInstitutionRow(item) {
  const favorite = state.favorites.includes(item.slug);
  return `
    <li class="list-row">
      <div class="list-main">
        <button class="list-title" type="button" data-action="copy-institution" data-slug="${escapeHtml(item.slug)}">${escapeHtml(item.name)}</button>
        <div class="list-meta">
          <span class="badge">${escapeHtml(item.category || item.type || "제도")}</span>
          <span>노드 ${item.nodeCount}개</span>
          <span>${escapeHtml(item.asOfDate || "")}</span>
        </div>
        <p class="list-summary">${escapeHtml(item.oneLiner || "")}</p>
      </div>
      <div class="row-actions">
        <button class="icon-button ${favorite ? "favorite-active" : ""}" type="button" data-action="toggle-favorite" data-slug="${escapeHtml(item.slug)}" aria-label="${favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}" title="${favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}">
          ${icon("star")}
        </button>
        <button class="icon-button" type="button" data-action="open-site" data-url="${SITE_ORIGIN}/model/${escapeHtml(item.slug)}/" aria-label="원본 페이지 열기" title="원본 페이지 열기">
          ${icon("external-link")}
        </button>
        <button class="button secondary small" type="button" data-action="copy-institution" data-slug="${escapeHtml(item.slug)}">
          ${icon("copy")}<span>복제</span>
        </button>
      </div>
    </li>
  `;
}

function renderDraft() {
  if (!state.activeDraft) {
    content.innerHTML = `
      <div class="page-heading">
        <div><p class="eyebrow">Draft</p><h1>초안</h1></div>
      </div>
      ${renderEmpty("file-text", "열린 초안이 없습니다.", "new-draft", "새 초안")}
    `;
    return;
  }

  const draft = state.activeDraft;
  content.innerHTML = `
    <div class="draft-header">
      <div class="draft-heading">
        <div class="draft-heading-main">
          <button class="icon-button" type="button" data-action="go-home" aria-label="내 제도로 돌아가기" title="내 제도로 돌아가기">${icon("chevron-left")}</button>
          <div>
            <p class="eyebrow">${draft.baseSlug ? "Personal copy" : "Personal draft"}</p>
            <h1>${escapeHtml(draft.name)}</h1>
            <p>${draft.nodes.length}개 노드 · ${draft.edges.length}개 연결</p>
          </div>
        </div>
      </div>
      <div class="draft-toolbar" aria-label="초안 명령">
        ${state.draftSection === "overview" ? `<button class="button small" type="button" data-action="save-overview">${icon("save")}저장</button>` : ""}
        ${draft.sourceUrl ? `<button class="button ghost small" type="button" data-action="open-site" data-url="${escapeHtml(draft.sourceUrl)}">${icon("external-link")}원본</button>` : ""}
        <button class="button secondary small" type="button" data-action="export-draft">${icon("download")}JSON</button>
        <button class="button secondary small" type="button" data-action="export-contribution">${icon("git-pull-request")}기여 제안</button>
      </div>
    </div>
    <nav class="draft-subtabs" aria-label="초안 편집 메뉴">
      ${[
        ["overview", "개요"],
        ["steps", "단계"],
        ["edges", "연결"],
        ["evidence", "근거"]
      ]
        .map(
          ([key, label]) =>
            `<button class="tab-button ${state.draftSection === key ? "active" : ""}" type="button" data-action="change-draft-section" data-section="${key}">${label}</button>`
        )
        .join("")}
    </nav>
    <div id="draft-problems"></div>
    ${
      state.draftSection === "steps"
        ? renderSteps(draft)
        : state.draftSection === "edges"
          ? renderEdges(draft)
          : state.draftSection === "evidence"
            ? renderEvidence(draft)
            : renderOverview(draft)
    }
  `;
}

function renderOverview(draft) {
  return `
    <form id="overview-form" class="editor-form">
      <div class="field">
        <label for="draft-name">제도명</label>
        <input id="draft-name" name="name" value="${escapeHtml(draft.name)}" maxlength="160" required>
      </div>
      <div class="field">
        <label for="draft-summary">한 줄 설명</label>
        <textarea id="draft-summary" name="summary" maxlength="600">${escapeHtml(draft.summary)}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="draft-category">분야</label>
          <input id="draft-category" name="category" value="${escapeHtml(draft.category)}" maxlength="120">
        </div>
        <div class="field">
          <label for="draft-date">기준일</label>
          <input id="draft-date" name="asOfDate" type="date" value="${escapeHtml(draft.asOfDate)}">
        </div>
      </div>
      <div class="field">
        <label for="draft-purpose">목적</label>
        <textarea id="draft-purpose" class="tall" name="purpose" maxlength="1500">${escapeHtml(draft.purpose)}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="draft-lanes">행위주체</label>
          <textarea id="draft-lanes" name="lanes" placeholder="한 줄에 하나">${escapeHtml(draft.lanes.join("\n"))}</textarea>
        </div>
        <div class="field">
          <label for="draft-stages">업무 단계</label>
          <textarea id="draft-stages" name="stages" placeholder="한 줄에 하나">${escapeHtml(draft.stages.join("\n"))}</textarea>
        </div>
      </div>
      <div class="field">
        <label for="draft-note">기여 변경 요약</label>
        <textarea id="draft-note" name="contributionNote" maxlength="1000">${escapeHtml(draft.contributionNote)}</textarea>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">${icon("save")}저장</button>
      </div>
    </form>
  `;
}

function renderSteps(draft) {
  const grouped = draft.stages.map((stage) => ({ stage, nodes: draft.nodes.filter((node) => node.stage === stage) }));
  const unknownNodes = draft.nodes.filter((node) => !draft.stages.includes(node.stage));
  if (unknownNodes.length) grouped.push({ stage: "미지정", nodes: unknownNodes });

  return `
    <section class="section">
      <div class="section-heading">
        <div><h2>업무 단계</h2><p>위에서 아래 순서로 편집</p></div>
        <button class="button small" type="button" data-action="open-step">${icon("plus")}단계 추가</button>
      </div>
      ${
        draft.nodes.length
          ? grouped
              .map(
                ({ stage, nodes }, stageIndex) => `
                  <div class="flow-stage">
                    <div class="stage-heading">
                      <span class="stage-index">G${stageIndex}</span>
                      <h3>${escapeHtml(stage)}</h3>
                      <span class="count">${nodes.length}</span>
                    </div>
                    ${nodes.map((node) => renderNodeRow(node, draft)).join("") || `<p class="notice">등록된 업무가 없습니다.</p>`}
                  </div>
                `
              )
              .join("")
          : renderEmpty("file-text", "첫 업무 단계를 추가하세요.", "open-step", "단계 추가")
      }
    </section>
  `;
}

function renderNodeRow(node, draft) {
  const index = draft.nodes.findIndex((item) => item.id === node.id);
  return `
    <article class="node-row">
      <div class="node-main">
        <div class="node-kicker">
          <span class="node-id">${escapeHtml(node.id)}</span>
          <span class="lane-badge">${escapeHtml(node.lane)}</span>
          <span class="type-badge">${escapeHtml(NODE_TYPES.find(([key]) => key === node.type)?.[1] || node.type)}</span>
        </div>
        <h4 class="node-title">${escapeHtml(node.name)}</h4>
        ${node.action ? `<p class="node-action">${escapeHtml(node.action)}</p>` : ""}
        <div class="node-meta">
          ${node.actor ? `<span>${escapeHtml(node.actor)}</span>` : ""}
          ${node.deadline ? `<span>${escapeHtml(node.deadline)}</span>` : ""}
          ${node.legalBasis.length ? `<span>조문 ${node.legalBasis.length}건</span>` : ""}
        </div>
      </div>
      <div class="node-controls">
        <button class="icon-button" type="button" data-action="move-node" data-id="${escapeHtml(node.id)}" data-direction="up" ${index === 0 ? "disabled" : ""} aria-label="위로 이동" title="위로 이동">${icon("arrow-up")}</button>
        <button class="icon-button" type="button" data-action="move-node" data-id="${escapeHtml(node.id)}" data-direction="down" ${index === draft.nodes.length - 1 ? "disabled" : ""} aria-label="아래로 이동" title="아래로 이동">${icon("arrow-down")}</button>
        <button class="icon-button" type="button" data-action="open-step" data-id="${escapeHtml(node.id)}" aria-label="${escapeHtml(node.name)} 편집" title="편집">${icon("pencil")}</button>
        <button class="icon-button" type="button" data-action="delete-node" data-id="${escapeHtml(node.id)}" aria-label="${escapeHtml(node.name)} 삭제" title="삭제">${icon("trash-2")}</button>
      </div>
    </article>
  `;
}

function renderEdges(draft) {
  return `
    <section class="section">
      <div class="section-heading">
        <div><h2>업무 연결</h2><p>노드 사이의 순서·전달·회귀</p></div>
        <button class="button small" type="button" data-action="open-edge" ${draft.nodes.length < 2 ? "disabled" : ""}>${icon("plus")}연결 추가</button>
      </div>
      ${
        draft.edges.length
          ? `<div>${draft.edges.map((edge) => renderEdgeRow(edge, draft)).join("")}</div>`
          : renderEmpty("link-2", draft.nodes.length < 2 ? "노드를 두 개 이상 만든 뒤 연결하세요." : "첫 연결을 추가하세요.", draft.nodes.length >= 2 ? "open-edge" : "", draft.nodes.length >= 2 ? "연결 추가" : "")
      }
    </section>
  `;
}

function renderEdgeRow(edge, draft) {
  const source = draft.nodes.find((node) => node.id === edge.source);
  const target = draft.nodes.find((node) => node.id === edge.target);
  const type = EDGE_TYPES.find(([key]) => key === edge.type)?.[1] || edge.type;
  return `
    <article class="connection-row">
      <div>
        <div class="connection-route">
          <span>${escapeHtml(source?.name || edge.source)}</span>
          <span class="connection-arrow">→</span>
          <span>${escapeHtml(target?.name || edge.target)}</span>
        </div>
        <div class="list-meta"><span class="type-badge">${escapeHtml(type)}</span>${edge.label ? `<span>${escapeHtml(edge.label)}</span>` : ""}<span>${escapeHtml(edge.id)}</span></div>
      </div>
      <div class="row-actions">
        <button class="icon-button" type="button" data-action="open-edge" data-id="${escapeHtml(edge.id)}" aria-label="연결 편집" title="편집">${icon("pencil")}</button>
        <button class="icon-button" type="button" data-action="delete-edge" data-id="${escapeHtml(edge.id)}" aria-label="연결 삭제" title="삭제">${icon("trash-2")}</button>
      </div>
    </article>
  `;
}

function renderEvidence(draft) {
  const attached = state.sources.filter((source) => source.draftId === draft.id);
  const inbox = state.sources.filter((source) => !source.draftId);
  const citationCount = draft.nodes.reduce((sum, node) => sum + node.legalBasis.length, 0);
  return `
    <section class="section">
      <div class="section-heading">
        <div><h2>웹 근거</h2><p>연결 ${attached.length}건 · 노드 조문 ${citationCount}건</p></div>
        <button class="button small" type="button" data-action="capture-selection">${icon("inbox")}선택문장</button>
      </div>
      ${attached.length ? attached.map((source) => renderSourceRow(source, { draft })).join("") : `<p class="notice info">웹페이지 문장을 선택한 뒤 선택문장 버튼을 누르면 이 초안에 근거로 연결할 수 있습니다.</p>`}
    </section>
    ${
      inbox.length
        ? `<section class="section"><div class="section-heading"><h2>보관함</h2><span class="count">${inbox.length}</span></div>${inbox.map((source) => renderSourceRow(source, { inbox: true, draft })).join("")}</section>`
        : ""
    }
  `;
}

function renderSourceRow(source, { inbox = false, draft = null } = {}) {
  const node = draft?.nodes.find((item) => item.id === source.nodeId);
  return `
    <article class="source-row">
      <h3 class="source-title">${escapeHtml(source.title)}</h3>
      <div class="source-meta">
        <span>${escapeHtml(formatDate(source.capturedAt))}</span>
        ${node ? `<span>${escapeHtml(node.id)} ${escapeHtml(node.name)}</span>` : inbox ? `<span class="badge">보관함</span>` : ""}
      </div>
      <p class="source-excerpt">${escapeHtml(source.excerpt)}</p>
      ${source.url ? `<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a>` : ""}
      <div class="source-actions">
        ${inbox && state.localDraftIds.size ? `<button class="button secondary small" type="button" data-action="assign-source" data-id="${escapeHtml(source.id)}">${icon("link-2")}초안에 연결</button>` : ""}
        ${!inbox ? `<button class="button ghost small" type="button" data-action="detach-source" data-id="${escapeHtml(source.id)}">보관함으로</button>` : ""}
        <button class="icon-button" type="button" data-action="delete-source" data-id="${escapeHtml(source.id)}" aria-label="근거 삭제" title="근거 삭제">${icon("trash-2")}</button>
      </div>
    </article>
  `;
}

function renderProblems(result, target = document.querySelector("#draft-problems")) {
  if (!target) return;
  const items = [
    ...result.errors,
    ...result.privacyFindings.map((finding) => `${finding.label}가 포함되어 있습니다 (${finding.path}).`)
  ];
  target.innerHTML = items.length
    ? `<div class="problem-list"><strong>저장할 수 없는 항목</strong><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
    : "";
}

async function setTab(tab) {
  state.tab = tab;
  if (tab === "draft" && !state.activeDraft) {
    const localItem = state.draftIndex.find((item) => state.localDraftIds.has(item.id));
    if (localItem) state.activeDraft = await getDraft(localItem.id);
  }
  state.settings = { ...state.settings, activeTab: tab };
  setSettings(state.settings).catch(() => {});
  render();
}

async function refreshIndexes() {
  const [favorites, draftIndex, sources, localDrafts] = await Promise.all([
    getFavorites(),
    getDraftIndex(),
    listSources(),
    listDrafts()
  ]);
  state.favorites = favorites;
  state.draftIndex = draftIndex;
  state.sources = sources;
  state.localDraftIds = new Set(localDrafts.map((draft) => draft.id));
}

async function persistDraft(draft, { close = false } = {}) {
  const normalized = normalizeDraft(draft);
  normalized.id = draft.id;
  normalized.createdAt = draft.createdAt;
  const validation = validateDraft(normalized);
  if (!validation.valid) {
    renderProblems(validation, modal.open ? modal.querySelector("[data-problems]") : undefined);
    throw new Error("입력 내용을 확인하세요.");
  }
  state.activeDraft = await saveDraft(normalized);
  await refreshIndexes();
  if (close) closeModal();
  render();
  showToast("초안을 저장했습니다.");
  return state.activeDraft;
}

async function createNewDraft() {
  const draft = createBlankDraft();
  state.activeDraft = await saveDraft(draft);
  await refreshIndexes();
  state.draftSection = "overview";
  await setTab("draft");
}

async function copyInstitution(slug) {
  const response = await fetch(chrome.runtime.getURL(`data/institutions/${encodeURIComponent(slug)}.json`));
  if (!response.ok) throw new Error("제도 상세 데이터를 읽지 못했습니다.");
  const draft = createDraftFromInstitution(await response.json());
  state.activeDraft = await saveDraft(draft);
  await refreshIndexes();
  state.draftSection = "steps";
  await setTab("draft");
  showToast("개인 초안을 만들었습니다.");
}

function openStepDialog(nodeId = "") {
  const draft = state.activeDraft;
  const existing = draft.nodes.find((node) => node.id === nodeId);
  const node = existing ?? {
    id: nextNodeId(draft.nodes),
    name: "",
    lane: draft.lanes[0] || "",
    stage: draft.stages[0] || "",
    type: "task",
    actor: "",
    receiver: "",
    action: "",
    condition: "",
    inputDocuments: [],
    outputDocuments: [],
    deadline: "",
    blocker: "",
    legalBasis: []
  };
  showModal(`
    <form id="step-form" class="modal-body dialog-form">
      <div class="dialog-heading">
        <div><p class="eyebrow">Process node</p><h2 id="modal-title">${existing ? "업무 단계 편집" : "업무 단계 추가"}</h2></div>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="닫기" title="닫기">${icon("x")}</button>
      </div>
      <div data-problems></div>
      <div class="field-row">
        <div class="field"><label for="node-id">ID</label><input id="node-id" name="id" value="${escapeHtml(node.id)}" readonly></div>
        <div class="field"><label for="node-type">유형</label><select id="node-type" name="type">${NODE_TYPES.map(([key, label]) => `<option value="${key}" ${node.type === key ? "selected" : ""}>${label}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label for="node-name">업무명</label><input id="node-name" name="name" value="${escapeHtml(node.name)}" maxlength="160" required></div>
      <div class="field-row">
        <div class="field"><label for="node-lane">행위주체 레인</label><select id="node-lane" name="lane">${draft.lanes.map((lane) => `<option value="${escapeHtml(lane)}" ${node.lane === lane ? "selected" : ""}>${escapeHtml(lane)}</option>`).join("")}</select></div>
        <div class="field"><label for="node-stage">단계</label><select id="node-stage" name="stage">${draft.stages.map((stage) => `<option value="${escapeHtml(stage)}" ${node.stage === stage ? "selected" : ""}>${escapeHtml(stage)}</option>`).join("")}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="node-actor">수행자</label><input id="node-actor" name="actor" value="${escapeHtml(node.actor)}" maxlength="200"></div>
        <div class="field"><label for="node-receiver">전달 대상</label><input id="node-receiver" name="receiver" value="${escapeHtml(node.receiver)}" maxlength="200"></div>
      </div>
      <div class="field"><label for="node-action">행위</label><textarea id="node-action" name="action" maxlength="600">${escapeHtml(node.action)}</textarea></div>
      <div class="field"><label for="node-condition">조건·판단 기준</label><textarea id="node-condition" name="condition" maxlength="600">${escapeHtml(node.condition)}</textarea></div>
      <div class="field-row">
        <div class="field"><label for="node-inputs">받는 문서</label><textarea id="node-inputs" name="inputDocuments" placeholder="한 줄에 하나">${escapeHtml(node.inputDocuments.join("\n"))}</textarea></div>
        <div class="field"><label for="node-outputs">보내는 문서</label><textarea id="node-outputs" name="outputDocuments" placeholder="한 줄에 하나">${escapeHtml(node.outputDocuments.join("\n"))}</textarea></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="node-deadline">기한</label><input id="node-deadline" name="deadline" value="${escapeHtml(node.deadline)}" maxlength="300"></div>
        <div class="field"><label for="node-blocker">병목</label><input id="node-blocker" name="blocker" value="${escapeHtml(node.blocker)}" maxlength="600"></div>
      </div>
      <div class="field"><label for="node-law">근거 조문</label><textarea id="node-law" class="tall" name="legalBasis" placeholder="법령명 | 조문 | 업무 근거 요약">${escapeHtml(formatLegalBasis(node.legalBasis))}</textarea></div>
      <div class="dialog-actions">
        <button class="button secondary" type="button" data-action="close-modal">취소</button>
        <button class="button" type="submit">${icon("save")}${existing ? "변경 저장" : "단계 추가"}</button>
      </div>
    </form>
  `);
  document.querySelector("#step-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextNode = {
      id: String(data.get("id")),
      name: String(data.get("name")),
      lane: String(data.get("lane")),
      stage: String(data.get("stage")),
      type: String(data.get("type")),
      actor: String(data.get("actor")),
      receiver: String(data.get("receiver")),
      action: String(data.get("action")),
      condition: String(data.get("condition")),
      inputDocuments: parseList(data.get("inputDocuments")),
      outputDocuments: parseList(data.get("outputDocuments")),
      deadline: String(data.get("deadline")),
      blocker: String(data.get("blocker")),
      legalBasis: parseLegalBasis(data.get("legalBasis"))
    };
    const nodes = existing
      ? draft.nodes.map((item) => (item.id === existing.id ? nextNode : item))
      : [...draft.nodes, nextNode];
    try {
      await persistDraft({ ...draft, nodes }, { close: true });
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

function openEdgeDialog(edgeId = "") {
  const draft = state.activeDraft;
  const existing = draft.edges.find((edge) => edge.id === edgeId);
  const edge = existing ?? {
    id: nextEdgeId(draft.edges),
    source: draft.nodes[0]?.id || "",
    target: draft.nodes[1]?.id || draft.nodes[0]?.id || "",
    type: "sequence",
    label: ""
  };
  const nodeOptions = (selected) =>
    draft.nodes
      .map(
        (node) =>
          `<option value="${escapeHtml(node.id)}" ${node.id === selected ? "selected" : ""}>${escapeHtml(node.id)} · ${escapeHtml(node.name)}</option>`
      )
      .join("");
  showModal(`
    <form id="edge-form" class="modal-body dialog-form">
      <div class="dialog-heading">
        <div><p class="eyebrow">Connection</p><h2 id="modal-title">${existing ? "업무 연결 편집" : "업무 연결 추가"}</h2></div>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="닫기" title="닫기">${icon("x")}</button>
      </div>
      <div data-problems></div>
      <input type="hidden" name="id" value="${escapeHtml(edge.id)}">
      <div class="field"><label for="edge-source">출발 업무</label><select id="edge-source" name="source">${nodeOptions(edge.source)}</select></div>
      <div class="field"><label for="edge-target">도착 업무</label><select id="edge-target" name="target">${nodeOptions(edge.target)}</select></div>
      <div class="field-row">
        <div class="field"><label for="edge-type">연결 유형</label><select id="edge-type" name="type">${EDGE_TYPES.map(([key, label]) => `<option value="${key}" ${edge.type === key ? "selected" : ""}>${label}</option>`).join("")}</select></div>
        <div class="field"><label for="edge-label">연결 조건·라벨</label><input id="edge-label" name="label" value="${escapeHtml(edge.label)}" maxlength="240"></div>
      </div>
      <div class="dialog-actions">
        <button class="button secondary" type="button" data-action="close-modal">취소</button>
        <button class="button" type="submit">${icon("save")}${existing ? "변경 저장" : "연결 추가"}</button>
      </div>
    </form>
  `);
  document.querySelector("#edge-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextEdge = Object.fromEntries(["id", "source", "target", "type", "label"].map((key) => [key, String(data.get(key))]));
    if (nextEdge.source === nextEdge.target) {
      renderProblems(
        { errors: ["출발 업무와 도착 업무는 달라야 합니다."], privacyFindings: [] },
        modal.querySelector("[data-problems]")
      );
      return;
    }
    const edges = existing
      ? draft.edges.map((item) => (item.id === existing.id ? nextEdge : item))
      : [...draft.edges, nextEdge];
    try {
      await persistDraft({ ...draft, edges }, { close: true });
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

async function openCaptureDialog() {
  state.pendingCapture = await getPendingCapture();
  const pending = state.pendingCapture;
  if (!pending) return;
  const findings = pending.findings ?? [];
  const defaultDraftId = state.activeDraft?.id || "";
  showModal(`
    <form id="capture-form" class="modal-body dialog-form">
      <div class="dialog-heading">
        <div><p class="eyebrow">Web evidence</p><h2 id="modal-title">선택 문장 가져오기</h2></div>
        <button class="icon-button" type="button" data-action="discard-capture" aria-label="닫기" title="닫기">${icon("x")}</button>
      </div>
      ${
        findings.length
          ? `<div class="privacy-alert"><strong>개인정보로 보이는 내용이 있어 저장을 막았습니다.</strong><ul>${findings.map((finding) => `<li>${escapeHtml(finding.label)}</li>`).join("")}</ul></div>`
          : ""
      }
      <div class="field"><label>출처</label><div class="notice"><strong>${escapeHtml(pending.title)}</strong><br>${escapeHtml(pending.url || "주소를 저장할 수 없는 페이지")}</div></div>
      <div class="field"><label for="capture-excerpt">선택 문장</label><textarea id="capture-excerpt" class="tall" readonly>${escapeHtml(pending.excerpt)}</textarea></div>
      ${
        findings.length
          ? ""
          : `<div class="field"><label for="capture-draft">연결할 초안</label><select id="capture-draft" name="draftId"><option value="">근거 보관함</option>${state.draftIndex.filter((draft) => state.localDraftIds.has(draft.id)).map((draft) => `<option value="${escapeHtml(draft.id)}" ${draft.id === defaultDraftId ? "selected" : ""}>${escapeHtml(draft.name)}</option>`).join("")}</select></div>
             <div class="field"><label for="capture-node">연결할 업무 단계</label><select id="capture-node" name="nodeId">${captureNodeOptions(state.activeDraft, "")}</select></div>`
      }
      <div class="dialog-actions">
        <button class="button secondary" type="button" data-action="discard-capture">버리기</button>
        ${findings.length ? "" : `<button class="button" type="submit">${icon("inbox")}근거 저장</button>`}
      </div>
    </form>
  `);

  const draftSelect = document.querySelector("#capture-draft");
  draftSelect?.addEventListener("change", async () => {
    const draft = draftSelect.value ? await getDraft(draftSelect.value) : null;
    document.querySelector("#capture-node").innerHTML = captureNodeOptions(draft, "");
  });

  document.querySelector("#capture-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const draftId = String(data.get("draftId") || "");
    const nodeId = String(data.get("nodeId") || "");
    const { capture, findings: currentFindings } = prepareCapture(pending);
    if (currentFindings.length) {
      showToast("개인정보로 보이는 내용을 제거한 뒤 다시 가져오세요.", "error");
      return;
    }
    await saveSource({ ...capture, draftId, nodeId });
    await setPendingCapture(null);
    state.pendingCapture = null;
    state.sources = await listSources();
    closeModal();
    render();
    showToast(draftId ? "초안에 근거를 연결했습니다." : "근거 보관함에 저장했습니다.");
  });
}

function captureNodeOptions(draft, selected) {
  if (!draft?.nodes?.length) return `<option value="">업무 단계 연결 안 함</option>`;
  return [
    `<option value="">업무 단계 연결 안 함</option>`,
    ...draft.nodes.map(
      (node) =>
        `<option value="${escapeHtml(node.id)}" ${node.id === selected ? "selected" : ""}>${escapeHtml(node.id)} · ${escapeHtml(node.name)}</option>`
    )
  ].join("");
}

async function openAssignSourceDialog(sourceId) {
  const source = state.sources.find((item) => item.id === sourceId);
  const availableDrafts = state.draftIndex.filter((item) => state.localDraftIds.has(item.id));
  const defaultDraftId = state.activeDraft?.id || availableDrafts[0]?.id || "";
  const defaultDraft = defaultDraftId ? await getDraft(defaultDraftId) : null;
  if (!source || !defaultDraft) return;
  showModal(`
    <form id="assign-source-form" class="modal-body dialog-form">
      <div class="dialog-heading">
        <div><p class="eyebrow">Evidence link</p><h2 id="modal-title">근거 연결</h2></div>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="닫기" title="닫기">${icon("x")}</button>
      </div>
      <p class="dialog-copy">${escapeHtml(source.title)}</p>
      <div class="field"><label for="assign-draft">초안</label><select id="assign-draft" name="draftId">${availableDrafts.map((draft) => `<option value="${escapeHtml(draft.id)}" ${draft.id === defaultDraftId ? "selected" : ""}>${escapeHtml(draft.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="assign-node">업무 단계</label><select id="assign-node" name="nodeId">${captureNodeOptions(defaultDraft, "")}</select></div>
      <div class="dialog-actions">
        <button class="button secondary" type="button" data-action="close-modal">취소</button>
        <button class="button" type="submit">${icon("link-2")}연결</button>
      </div>
    </form>
  `);
  document.querySelector("#assign-draft").addEventListener("change", async (event) => {
    const draft = await getDraft(event.target.value);
    document.querySelector("#assign-node").innerHTML = captureNodeOptions(draft, "");
  });
  document.querySelector("#assign-source-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.sources = await updateSource(source.id, {
      draftId: String(data.get("draftId")),
      nodeId: String(data.get("nodeId") || "")
    });
    closeModal();
    render();
    showToast("초안에 근거를 연결했습니다.");
  });
}

function openSettings() {
  const localSourceCount = state.sources.length;
  showModal(`
    <div class="modal-body">
      <div class="dialog-heading">
        <div><p class="eyebrow">Settings</p><h2 id="modal-title">작업대 설정</h2></div>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="닫기" title="닫기">${icon("x")}</button>
      </div>
      <div class="privacy-summary">
        ${icon("shield-check")}
        <div><strong>계정 정보 수집 없음</strong><p>Google 이름·이메일·토큰을 읽지 않습니다. Chrome 저장소가 목록 동기화를 담당합니다.</p></div>
      </div>
      <section class="section">
        <div class="section-heading"><h2>저장 현황</h2></div>
        <ul class="list">
          <li class="list-row"><div class="list-main"><strong class="list-title">Chrome 동기화</strong><div class="list-meta"><span>즐겨찾기 ${state.favorites.length}개</span><span>초안 목록 ${state.draftIndex.length}개</span></div></div>${icon("database")}</li>
          <li class="list-row"><div class="list-main"><strong class="list-title">현재 기기</strong><div class="list-meta"><span>초안 본문 ${state.localDraftIds.size}개</span><span>웹 근거 ${localSourceCount}개</span></div></div>${icon("folder-open")}</li>
        </ul>
      </section>
      <section class="section">
        <div class="button-row">
          <button class="button secondary" type="button" data-action="import-json">${icon("upload")}JSON 가져오기</button>
          <button class="button secondary" type="button" data-action="export-workspace">${icon("download")}전체 백업</button>
        </div>
      </section>
      <section class="section">
        <button class="button danger" type="button" data-action="clear-workspace">${icon("trash-2")}개인 작업 모두 삭제</button>
      </section>
    </div>
  `);
}

async function exportDraft() {
  const attachedSources = state.sources.filter((source) => source.draftId === state.activeDraft.id);
  const payload = { ...state.activeDraft, sources: attachedSources };
  const findings = scanForPersonalData(payload);
  if (findings.length) throw new Error("개인정보로 보이는 내용을 제거해야 내보낼 수 있습니다.");
  downloadJson(`${slugifyFilename(state.activeDraft.name)}-초안.json`, payload);
  showToast("초안 JSON을 저장했습니다.");
}

function openContributionDialog() {
  showModal(`
    <div class="modal-body">
      <div class="dialog-heading">
        <div><p class="eyebrow">Contribution</p><h2 id="modal-title">기여 제안 저장</h2></div>
        <button class="icon-button" type="button" data-action="close-modal" aria-label="닫기" title="닫기">${icon("x")}</button>
      </div>
      <p class="dialog-copy">계정에 직접 제출하지 않고, 선택한 협업 플랫폼에 첨부할 JSON 파일을 만듭니다.</p>
      <ul class="list">
        <li class="list-row">
          <div class="list-main"><strong class="list-title">GitHub</strong><div class="list-meta"><span>Issue 또는 Pull Request</span></div></div>
          <button class="button secondary small" type="button" data-action="download-contribution" data-target="github">${icon("download")}GitHub용 저장</button>
        </li>
        <li class="list-row">
          <div class="list-main"><strong class="list-title">GitLab</strong><div class="list-meta"><span>Issue 또는 Merge Request</span></div></div>
          <button class="button secondary small" type="button" data-action="download-contribution" data-target="gitlab">${icon("download")}GitLab용 저장</button>
        </li>
      </ul>
      <div class="dialog-actions">
        <button class="button secondary" type="button" data-action="close-modal">닫기</button>
      </div>
    </div>
  `);
}

async function exportContribution(target) {
  const attachedSources = state.sources.filter((source) => source.draftId === state.activeDraft.id);
  const payload = createContributionPackage(state.activeDraft, attachedSources, { target });
  const findings = scanForPersonalData(payload);
  if (findings.length) throw new Error("개인정보로 보이는 내용을 제거해야 제안 패키지를 만들 수 있습니다.");
  downloadJson(`${slugifyFilename(state.activeDraft.name)}-${target}-기여-제안.json`, payload);
  closeModal();
  showToast(`${target === "github" ? "GitHub" : "GitLab"}용 기여 제안을 저장했습니다.`);
}

async function exportWorkspace() {
  const drafts = await listDrafts();
  const payload = createWorkspacePackage(drafts, state.sources, state.favorites);
  if (scanForPersonalData(payload).length) {
    throw new Error("개인정보로 보이는 내용이 있어 전체 백업을 중단했습니다.");
  }
  downloadJson("korea100-workspace-backup.json", payload);
  showToast("개인 작업 전체를 백업했습니다.");
}

async function importJsonFile(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) throw new Error("2MB 이하의 JSON 파일만 가져올 수 있습니다.");
  const parsed = JSON.parse(await file.text());
  if (scanForPersonalData(parsed).length) {
    throw new Error("개인정보로 보이는 내용이 있어 가져오기를 중단했습니다.");
  }

  if (parsed.kind === WORKSPACE_KIND) {
    const idMap = new Map();
    for (const item of parsed.drafts ?? []) {
      const draft = normalizeDraft(item);
      const previousId = draft.id;
      draft.id = makeId("draft");
      draft.createdAt = new Date().toISOString();
      idMap.set(previousId, draft.id);
      const result = validateDraft(draft);
      if (!result.valid) throw new Error(`${draft.name}: 유효하지 않은 초안입니다.`);
      await saveDraft(draft);
    }
    for (const item of parsed.sources ?? []) {
      const { capture, findings } = prepareCapture(item);
      if (findings.length) throw new Error("근거 항목에 개인정보로 보이는 내용이 있습니다.");
      await saveSource({
        ...capture,
        capturedAt: item.capturedAt,
        draftId: idMap.get(item.draftId) || "",
        nodeId: item.nodeId || ""
      });
    }
    state.favorites = await setFavorites([...state.favorites, ...(parsed.favorites ?? [])]);
  } else {
    const rawDraft = parsed.kind === DRAFT_KIND ? parsed : parsed.kind === CONTRIBUTION_KIND ? parsed : parsed;
    const draft = normalizeDraft(rawDraft);
    const previousId = draft.id;
    draft.id = makeId("draft");
    draft.createdAt = new Date().toISOString();
    const result = validateDraft(draft);
    if (!result.valid) throw new Error("가져온 초안의 단계·연결 구조를 확인하세요.");
    state.activeDraft = await saveDraft(draft);
    for (const item of parsed.sources ?? []) {
      const { capture, findings } = prepareCapture(item);
      if (findings.length) continue;
      await saveSource({ ...capture, capturedAt: item.capturedAt, draftId: draft.id, nodeId: item.nodeId || "" });
    }
    if (previousId === draft.id) throw new Error("가져오기 ID를 새로 만들지 못했습니다.");
    state.draftSection = "overview";
    state.tab = "draft";
  }

  await refreshIndexes();
  render();
  showToast("JSON 파일을 가져왔습니다.");
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (!action || button.disabled) return;
  if (action === "change-tab") return setTab(button.dataset.tab);
  if (action === "go-home") return setTab("mine");
  if (action === "find-institutions") return setTab("search");
  if (action === "new-draft") return createNewDraft();
  if (action === "open-settings") return openSettings();
  if (action === "close-modal") return closeModal();
  if (action === "import-json") {
    closeModal();
    importFile.click();
    return;
  }
  if (action === "clear-search") {
    state.query = "";
    renderSearch();
    return;
  }
  if (action === "toggle-favorite") {
    state.favorites = await toggleFavorite(button.dataset.slug);
    render();
    return;
  }
  if (action === "copy-institution") return copyInstitution(button.dataset.slug);
  if (action === "open-site") {
    await chrome.tabs.create({ url: button.dataset.url });
    return;
  }
  if (action === "open-draft") {
    const draft = await getDraft(button.dataset.id);
    if (!draft) throw new Error("이 기기에 초안 본문이 없습니다. 백업 JSON을 가져오세요.");
    state.activeDraft = draft;
    state.draftSection = "overview";
    return setTab("draft");
  }
  if (action === "delete-draft") {
    const item = state.draftIndex.find((draft) => draft.id === button.dataset.id);
    const confirmed = await askConfirmation({
      title: "초안을 삭제할까요?",
      message: `${item?.name || "이 초안"}의 본문은 현재 기기에서 삭제됩니다.`
    });
    if (!confirmed) return;
    await deleteDraft(button.dataset.id);
    if (state.activeDraft?.id === button.dataset.id) state.activeDraft = null;
    await refreshIndexes();
    render();
    showToast("초안을 삭제했습니다.");
    return;
  }
  if (action === "change-draft-section") {
    state.draftSection = button.dataset.section;
    renderDraft();
    return;
  }
  if (action === "save-overview") {
    document.querySelector("#overview-form")?.requestSubmit();
    return;
  }
  if (action === "export-draft") return exportDraft();
  if (action === "export-contribution") return openContributionDialog();
  if (action === "download-contribution") return exportContribution(button.dataset.target);
  if (action === "open-step") return openStepDialog(button.dataset.id);
  if (action === "move-node") {
    const nodes = [...state.activeDraft.nodes];
    const index = nodes.findIndex((node) => node.id === button.dataset.id);
    const target = button.dataset.direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= nodes.length) return;
    [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
    return persistDraft({ ...state.activeDraft, nodes });
  }
  if (action === "delete-node") {
    const node = state.activeDraft.nodes.find((item) => item.id === button.dataset.id);
    const connected = state.activeDraft.edges.filter(
      (edge) => edge.source === button.dataset.id || edge.target === button.dataset.id
    ).length;
    const confirmed = await askConfirmation({
      title: "업무 단계를 삭제할까요?",
      message: `${node?.name || button.dataset.id}와 연결된 ${connected}개 연결도 함께 삭제됩니다.`
    });
    if (!confirmed) return;
    return persistDraft({
      ...state.activeDraft,
      nodes: state.activeDraft.nodes.filter((item) => item.id !== button.dataset.id),
      edges: state.activeDraft.edges.filter(
        (edge) => edge.source !== button.dataset.id && edge.target !== button.dataset.id
      )
    });
  }
  if (action === "open-edge") return openEdgeDialog(button.dataset.id);
  if (action === "delete-edge") {
    const confirmed = await askConfirmation({
      title: "업무 연결을 삭제할까요?",
      message: "노드는 남고 선택한 연결만 삭제됩니다."
    });
    if (!confirmed) return;
    return persistDraft({
      ...state.activeDraft,
      edges: state.activeDraft.edges.filter((edge) => edge.id !== button.dataset.id)
    });
  }
  if (action === "capture-selection") {
    const response = await chrome.runtime.sendMessage({ type: "capture-active-selection" });
    if (!response?.ok) throw new Error(response?.error || "선택 문장을 가져오지 못했습니다.");
    return openCaptureDialog();
  }
  if (action === "discard-capture") {
    await setPendingCapture(null);
    state.pendingCapture = null;
    closeModal();
    return;
  }
  if (action === "assign-source") return openAssignSourceDialog(button.dataset.id);
  if (action === "detach-source") {
    state.sources = await updateSource(button.dataset.id, { draftId: "", nodeId: "" });
    render();
    showToast("근거를 보관함으로 옮겼습니다.");
    return;
  }
  if (action === "delete-source") {
    const confirmed = await askConfirmation({
      title: "근거를 삭제할까요?",
      message: "저장한 선택 문장과 출처 링크가 현재 기기에서 삭제됩니다."
    });
    if (!confirmed) return;
    state.sources = await deleteSource(button.dataset.id);
    render();
    showToast("근거를 삭제했습니다.");
    return;
  }
  if (action === "export-workspace") return exportWorkspace();
  if (action === "clear-workspace") {
    const confirmed = await askConfirmation({
      title: "개인 작업을 모두 삭제할까요?",
      message: "모든 초안 본문, 근거, 즐겨찾기와 동기화 목록이 삭제됩니다.",
      submitLabel: "모두 삭제"
    });
    if (!confirmed) return;
    closeModal();
    await clearWorkspace();
    state.activeDraft = null;
    await refreshIndexes();
    await setTab("mine");
    showToast("개인 작업을 모두 삭제했습니다.");
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  handleAction(button).catch((error) => showToast(error.message || "작업을 완료하지 못했습니다.", "error"));
});

document.addEventListener("input", (event) => {
  if (event.target.id !== "catalog-search") return;
  state.query = event.target.value;
  refreshSearchResults();
});

document.addEventListener("change", (event) => {
  if (event.target.id !== "category-filter") return;
  state.category = event.target.value;
  refreshSearchResults();
});

document.addEventListener("submit", (event) => {
  if (event.target.id !== "overview-form") return;
  event.preventDefault();
  const data = new FormData(event.target);
  const lanes = parseList(data.get("lanes"));
  const stages = parseList(data.get("stages"));
  const laneRemappedNodes = remapNodesForListChange(
    state.activeDraft.nodes,
    "lane",
    state.activeDraft.lanes,
    lanes
  );
  const nodes = remapNodesForListChange(
    laneRemappedNodes,
    "stage",
    state.activeDraft.stages,
    stages
  );
  persistDraft({
    ...state.activeDraft,
    name: String(data.get("name")),
    summary: String(data.get("summary")),
    category: String(data.get("category")),
    asOfDate: String(data.get("asOfDate")),
    purpose: String(data.get("purpose")),
    lanes,
    stages,
    nodes,
    contributionNote: String(data.get("contributionNote"))
  }).catch((error) => showToast(error.message, "error"));
});

importFile.addEventListener("change", () => {
  const [file] = importFile.files;
  importJsonFile(file)
    .catch((error) => showToast(error.message || "JSON 파일을 가져오지 못했습니다.", "error"))
    .finally(() => {
      importFile.value = "";
    });
});

modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "pending-capture-ready") {
    openCaptureDialog().catch((error) => showToast(error.message, "error"));
  }
});

async function initialize() {
  const catalogResponse = await fetch(chrome.runtime.getURL("data/catalog.json"));
  if (!catalogResponse.ok) throw new Error("제도 목록을 읽지 못했습니다.");
  const [catalog, favorites, draftIndex, sources, settings, pendingCapture, localDrafts] = await Promise.all([
    catalogResponse.json(),
    getFavorites(),
    getDraftIndex(),
    listSources(),
    getSettings(),
    getPendingCapture(),
    listDrafts()
  ]);
  state.catalog = catalog;
  state.catalogBySlug = new Map(catalog.map((item) => [item.slug, item]));
  state.favorites = favorites;
  state.draftIndex = draftIndex;
  state.localDraftIds = new Set(localDrafts.map((draft) => draft.id));
  state.sources = sources;
  state.settings = settings;
  state.tab = ["mine", "search", "draft"].includes(settings.activeTab) ? settings.activeTab : "mine";
  if (state.tab === "draft" && localDrafts[0]) state.activeDraft = localDrafts[0];
  state.pendingCapture = pendingCapture;
  render();
  if (pendingCapture) await openCaptureDialog();
}

initialize().catch((error) => {
  content.innerHTML = `
    <div class="empty-state">
      ${icon("circle-alert")}
      <strong>작업대를 열지 못했습니다.</strong>
      <span>${escapeHtml(error.message)}</span>
    </div>
  `;
});
