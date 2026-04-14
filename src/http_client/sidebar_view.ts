import { randomUUID } from "crypto";
import * as vscode from "vscode";
import { HttpClientPanelController } from "./panel";
import { HttpClientViewState } from "./types";
import { ToastService } from "../toast/service";
import { ToastToWebviewMessage } from "../toast/types";
import { TOAST_HOST_MARKUP, TOAST_HOST_SCRIPT, TOAST_HOST_STYLES } from "../toast/webview";

type SidebarMessage =
  | { type: "httpClientSidebar/init" }
  | { type: "httpClientSidebar/createRequest"; payload?: { collectionId?: string | null } }
  | { type: "httpClientSidebar/createCollection" }
  | { type: "httpClientSidebar/createEnvironment" }
  | { type: "httpClientSidebar/selectRequest"; payload: { requestId: string } }
  | { type: "httpClientSidebar/selectHistory"; payload: { historyId: string } }
  | { type: "httpClientSidebar/selectEnvironment"; payload: { environmentId: string | null } };

type SidebarOutboundMessage = {
  type: "httpClientSidebar/state";
  payload: HttpClientViewState;
} | ToastToWebviewMessage;

export class HttpClientSidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "mx-dev-toolkit-httpClientLauncher";

  private view: vscode.WebviewView | null = null;
  private readonly stateChangeDisposable: vscode.Disposable;
  private readonly toastHostDisposable: { dispose(): void };
  private viewReady = false;

  constructor(
    private readonly controller: HttpClientPanelController,
    private readonly toastService: ToastService
  ) {
    this.stateChangeDisposable = this.controller.onDidChangeState(() => {
      void this.postState();
    });
    this.toastHostDisposable = this.toastService.registerHost({
      id: "httpClient.sidebar",
      priority: 50,
      isAvailable: () => Boolean(this.view && this.view.visible && this.viewReady),
      postToast: async (toast) => {
        if (!this.view) {
          return false;
        }
        return this.view.webview.postMessage({
          type: "mxToast/show",
          payload: toast,
        });
      },
    });
  }

  public dispose(): void {
    this.stateChangeDisposable.dispose();
    this.toastHostDisposable.dispose();
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    this.viewReady = false;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.html = getSidebarHtml(webviewView.webview, createNonce());
    webviewView.webview.onDidReceiveMessage(
      (message: SidebarMessage) => {
        void this.handleMessage(message);
      },
      undefined
    );
    webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.view = null;
        this.viewReady = false;
      }
    });
    await this.postState();
  }

  private async handleMessage(message: SidebarMessage): Promise<void> {
    switch (message.type) {
      case "httpClientSidebar/init":
        this.viewReady = true;
        await this.postState();
        return;
      case "httpClientSidebar/createRequest":
        await this.controller.createRequest(message.payload?.collectionId ?? null);
        return;
      case "httpClientSidebar/createCollection":
        await this.controller.createCollection();
        return;
      case "httpClientSidebar/createEnvironment":
        await this.controller.createEnvironment();
        return;
      case "httpClientSidebar/selectRequest":
        await this.controller.openRequest(message.payload.requestId);
        return;
      case "httpClientSidebar/selectHistory":
        await this.controller.openHistory(message.payload.historyId);
        return;
      case "httpClientSidebar/selectEnvironment":
        await this.controller.selectEnvironment(message.payload.environmentId);
        return;
      default:
        return;
    }
  }

  private async postState(): Promise<void> {
    if (!this.view) {
      return;
    }
    const message: SidebarOutboundMessage = {
      type: "httpClientSidebar/state",
      payload: await this.controller.getViewState(),
    };
    await this.view.webview.postMessage(message);
  }
}

function createNonce(): string {
  return randomUUID().replace(/-/g, "");
}

export function getSidebarHtml(webview: vscode.Webview, nonce: string): string {
  return `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';"
      />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        :root {
          color-scheme: light dark;
          --bg: var(--vscode-sideBar-background, #181818);
          --surface: var(--vscode-sideBarSectionHeader-background, rgba(255, 255, 255, 0.02));
          --border: var(--vscode-sideBar-border, rgba(128, 128, 128, 0.22));
          --input-bg: var(--vscode-input-background, rgba(255, 255, 255, 0.04));
          --input-border: var(--vscode-input-border, rgba(128, 128, 128, 0.28));
          --text: var(--vscode-sideBar-foreground, var(--vscode-foreground, #cccccc));
          --muted: var(--vscode-descriptionForeground, #8f8f8f);
          --soft: var(--vscode-disabledForeground, #6f6f6f);
          --focus: var(--vscode-focusBorder, #007fd4);
          --button-bg: var(--vscode-button-background, #0e639c);
          --button-hover: var(--vscode-button-hoverBackground, #1177bb);
          --button-fg: var(--vscode-button-foreground, #ffffff);
          --hover: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05));
          --active: var(--vscode-list-activeSelectionBackground, rgba(255, 255, 255, 0.08));
          --radius: 4px;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: var(--bg);
          color: var(--text);
          font: 12px/1.4 "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif;
        }

        button,
        input {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        .sidebar-shell {
          display: grid;
          grid-template-rows: auto auto auto auto minmax(0, 1fr);
          gap: 8px;
          height: 100vh;
          padding: 10px 10px 8px;
        }

        .sidebar-head,
        .tab-strip,
        .search-bar,
        .empty-actions,
        .panel-head,
        .panel-head-main,
        .list-meta {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .sidebar-head,
        .panel-head {
          justify-content: space-between;
        }

        .brand {
          color: var(--text);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .primary-button,
        .ghost-button,
        .icon-button,
        .tab-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 28px;
          padding: 0 10px;
          border: 1px solid transparent;
          border-radius: var(--radius);
          background: transparent;
          color: var(--text);
          transition: background-color 120ms ease, border-color 120ms ease;
        }

        .primary-button {
          width: 100%;
          background: var(--button-bg);
          color: var(--button-fg);
          font-weight: 600;
        }

        .primary-button:hover {
          background: var(--button-hover);
        }

        .ghost-button,
        .icon-button,
        .tab-button {
          border-color: var(--input-border);
          color: var(--muted);
          background: var(--surface);
        }

        .ghost-button:hover,
        .icon-button:hover,
        .tab-button:hover,
        .list-item:hover,
        .collection-item:hover {
          background: var(--hover);
          color: var(--text);
        }

        .icon-button {
          width: 24px;
          min-width: 24px;
          height: 24px;
          padding: 0;
        }

        .empty-actions {
          justify-content: center;
        }

        .tab-strip {
          gap: 4px;
          padding-bottom: 4px;
          border-bottom: 1px solid var(--border);
        }

        .tab-button {
          flex: 1;
          height: 26px;
          border-color: transparent;
          background: transparent;
        }

        .tab-button.active {
          color: var(--text);
          border-color: var(--focus);
          background: var(--active);
        }

        .search-input {
          width: 100%;
          height: 28px;
          padding: 0 10px;
          border: 1px solid var(--input-border);
          border-radius: 999px;
          outline: none;
          background: var(--input-bg);
          color: var(--text);
        }

        .search-input:focus {
          border-color: var(--focus);
        }

        .list-panel {
          display: flex;
          flex-direction: column;
          min-height: 0;
          border-top: 1px solid transparent;
        }

        .panel-head {
          padding: 0 0 4px;
          min-height: 24px;
          color: var(--soft);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border-bottom: 1px solid var(--border);
        }

        .panel-head-main {
          gap: 4px;
          min-width: 0;
        }

        .panel-head-title {
          color: var(--soft);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .panel-head-subtitle {
          color: var(--muted);
          font-size: 10px;
          font-weight: 500;
          text-transform: none;
          letter-spacing: 0;
        }

        .list-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 0;
          overflow: auto;
          padding: 6px 0 4px;
        }

        .group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 0 0 6px;
        }

        .group + .group {
          padding-top: 8px;
          border-top: 1px solid var(--border);
        }

        .group-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          padding: 0 2px 2px;
          color: var(--muted);
          font-size: 11px;
          font-weight: 600;
        }

        .group-title button {
          border: none;
          background: transparent;
          color: var(--soft);
          padding: 0;
        }

        .group-title button:hover {
          color: var(--text);
        }

        .group-items {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .collection-item,
        .list-item,
        .environment-item {
          width: 100%;
          border: 1px solid transparent;
          border-radius: var(--radius);
          background: transparent;
          color: inherit;
          text-align: left;
        }

        .collection-item,
        .list-item {
          padding: 6px 8px;
        }

        .collection-item.active,
        .list-item.active,
        .environment-item.active {
          border-color: var(--focus);
          background: var(--active);
        }

        .collection-main,
        .list-main {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }

        .method-pill,
        .status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 40px;
          height: 18px;
          padding: 0 5px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .method-get {
          color: #73c991;
          background: rgba(115, 201, 145, 0.16);
        }

        .method-post {
          color: #75beff;
          background: rgba(117, 190, 255, 0.16);
        }

        .method-put,
        .method-patch {
          color: #d7ba7d;
          background: rgba(215, 186, 125, 0.16);
        }

        .method-delete {
          color: #f48771;
          background: rgba(244, 135, 113, 0.16);
        }

        .status-pill.ok {
          color: #73c991;
          background: rgba(115, 201, 145, 0.16);
        }

        .status-pill.error {
          color: #f48771;
          background: rgba(244, 135, 113, 0.16);
        }

        .status-pill.neutral {
          color: var(--muted);
          background: var(--surface);
        }

        .item-title,
        .item-subtitle,
        .list-meta span,
        .environment-main span,
        .environment-main small,
        .history-group-title,
        .history-group-url,
        .history-record-caption,
        .history-group-more {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .item-title,
        .environment-main span {
          color: var(--text);
        }

        .item-subtitle,
        .list-meta,
        .environment-main small {
          color: var(--muted);
          font-size: 11px;
        }

        .list-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .list-meta {
          gap: 8px;
        }

        .history-group-card {
          display: flex;
          flex-direction: column;
          gap: 0;
          border: 1px solid var(--border);
          border-radius: calc(var(--radius) + 1px);
          background: var(--surface);
          overflow: hidden;
        }

        .history-group-card.active {
          border-color: var(--focus);
          background: var(--active);
        }

        .history-group-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 24px;
          gap: 4px;
          align-items: start;
          padding: 6px;
        }

        .history-group-main,
        .history-record-item {
          width: 100%;
          border: none;
          background: transparent;
          color: inherit;
          text-align: left;
        }

        .history-group-main {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          padding: 0;
        }

        .history-group-main:hover .history-group-title,
        .history-record-item:hover .history-record-caption {
          color: var(--text);
        }

        .history-group-top,
        .history-record-top {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }

        .history-group-title {
          flex: 1;
          min-width: 0;
          color: var(--text);
          font-size: 12px;
          font-weight: 600;
        }

        .history-group-count {
          flex: 0 0 auto;
          min-width: 36px;
          padding: 0 6px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--muted);
          font-size: 10px;
          line-height: 18px;
          text-align: center;
        }

        .history-group-url,
        .history-record-caption {
          color: var(--muted);
          font-size: 11px;
        }

        .history-group-meta,
        .history-record-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          color: var(--muted);
          font-size: 11px;
        }

        .history-group-toggle {
          width: 24px;
          min-width: 24px;
          height: 24px;
          padding: 0;
          border-color: transparent;
          background: transparent;
          color: var(--soft);
        }

        .history-group-toggle:hover {
          border-color: var(--input-border);
          background: var(--hover);
          color: var(--text);
        }

        .history-group-items {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 0 6px 6px;
          border-top: 1px solid var(--border);
        }

        .history-record-item {
          display: flex;
          flex-direction: column;
          gap: 3px;
          padding: 6px;
          border: 1px dashed rgba(128, 128, 128, 0.18);
          border-radius: var(--radius);
        }

        .history-record-item:hover {
          border-color: rgba(128, 128, 128, 0.28);
          background: var(--hover);
        }

        .history-record-item.latest {
          border-style: solid;
        }

        .history-record-more {
          padding: 2px 2px 0;
          color: var(--soft);
          font-size: 10px;
        }

        .environment-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 7px 8px;
        }

        .environment-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px 10px;
          border: 1px dashed var(--border);
          border-radius: var(--radius);
          color: var(--muted);
          text-align: center;
        }

        .empty-title {
          color: var(--text);
          font-size: 12px;
          font-weight: 600;
        }

        ${TOAST_HOST_STYLES}
      </style>
    </head>
    <body>
      <div class="sidebar-shell">
        <div class="sidebar-head">
          <span class="brand">HTTP Client</span>
        </div>
        <button class="primary-button" data-action="createRequest" type="button">新建 HTTP 连接</button>
        <div class="tab-strip">
          <button class="tab-button active" data-tab="activity" type="button">记录</button>
          <button class="tab-button" data-tab="collections" type="button">集合</button>
          <button class="tab-button" data-tab="environments" type="button">环境</button>
        </div>
        <div class="search-bar">
          <input id="search-input" class="search-input" type="text" placeholder="筛选历史记录" />
        </div>
        <div class="list-panel">
          <div id="panel-head" class="panel-head"></div>
          <div id="list-body" class="list-body"></div>
        </div>
      </div>
      ${TOAST_HOST_MARKUP}
      <script nonce="${nonce}">
        ${TOAST_HOST_SCRIPT}
        const vscode = acquireVsCodeApi();
        const uiState = {
          activeTab: "activity",
          keyword: "",
          expandedHistoryGroups: {}
        };
        let state = null;

        function escapeHtml(value) {
          return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function matchesKeyword() {
          const keyword = uiState.keyword.trim().toLowerCase();
          if (!keyword) {
            return () => true;
          }
          return (value) => String(value ?? "").toLowerCase().includes(keyword);
        }

        function relativeTime(input) {
          const diff = Date.now() - new Date(input).getTime();
          if (Number.isNaN(diff)) {
            return "";
          }
          const minutes = Math.max(1, Math.floor(diff / 60000));
          if (minutes < 60) {
            return minutes + " 分钟前";
          }
          const hours = Math.floor(minutes / 60);
          if (hours < 24) {
            return hours + " 小时前";
          }
          const days = Math.floor(hours / 24);
          return days + " 天前";
        }

        function formatClock(input) {
          const value = new Date(input);
          if (Number.isNaN(value.getTime())) {
            return "";
          }
          return value.toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          });
        }

        function normalizeHistoryUrl(rawUrl) {
          const value = String(rawUrl || "").trim();
          if (!value) {
            return "";
          }
          return value.replace(/\\/+$/, "");
        }

        function getHistoryGroupKey(item) {
          const requestId = String(item && item.request && item.request.id || "").trim();
          if (requestId) {
            return "request:" + requestId;
          }
          return "fallback:" + String(item.request.method || "GET") + ":" + normalizeHistoryUrl(item.request.url || "");
        }

        function buildHistoryGroups() {
          const recentItems = state.history.slice(0, 30);
          const grouped = new Map();
          recentItems.forEach((item) => {
            const key = getHistoryGroupKey(item);
            const current = grouped.get(key);
            if (current) {
              current.records.push(item);
              return;
            }
            grouped.set(key, {
              key,
              requestId: item.request && item.request.id ? item.request.id : null,
              title: item.request && item.request.name ? item.request.name : "未命名请求",
              method: item.request && item.request.method ? item.request.method : "GET",
              latestUrl: item.request && item.request.url ? item.request.url : "未填写 URL",
              latestRecord: item,
              records: [item]
            });
          });

          const match = matchesKeyword();
          const keyword = uiState.keyword.trim();
          const groups = Array.from(grouped.values())
            .filter((group) => {
              if (!keyword) {
                return true;
              }
              if (match(group.title + " " + group.latestUrl + " " + group.method)) {
                return true;
              }
              return group.records.some((record) => {
                return match(record.request.name + " " + record.request.url + " " + String(record.responseSummary.status ?? "ERR"));
              });
            })
            .map((group) => ({
              ...group,
              totalCount: group.records.length
            }))
            .sort((left, right) => left.latestRecord.executedAt < right.latestRecord.executedAt ? 1 : -1);

          const nextExpanded = {};
          groups.forEach((group) => {
            if (uiState.expandedHistoryGroups[group.key]) {
              nextExpanded[group.key] = true;
            }
          });
          if (groups.length > 0 && !groups.some((group) => nextExpanded[group.key])) {
            nextExpanded[groups[0].key] = true;
          }
          uiState.expandedHistoryGroups = nextExpanded;
          return groups;
        }

        function updateTabs() {
          document.querySelectorAll("[data-tab]").forEach((button) => {
            button.classList.toggle("active", button.getAttribute("data-tab") === uiState.activeTab);
          });
        }

        function render() {
          updateTabs();
          const head = document.getElementById("panel-head");
          const body = document.getElementById("list-body");
          const searchInput = document.getElementById("search-input");
          if (!state) {
            head.innerHTML = '<div class="panel-head-main"><span class="panel-head-title">Loading</span></div>';
            body.innerHTML = '<div class="empty-state">加载中</div>';
            return;
          }
          if (uiState.activeTab === "collections") {
            head.innerHTML = renderPanelHead("集合", "浏览请求集合", "createCollection");
            if (searchInput) {
              searchInput.placeholder = "筛选集合或请求";
            }
            body.innerHTML = renderCollections();
            return;
          }
          if (uiState.activeTab === "environments") {
            head.innerHTML = renderPanelHead("环境", "切换当前环境", "createEnvironment");
            if (searchInput) {
              searchInput.placeholder = "筛选环境";
            }
            body.innerHTML = renderEnvironments();
            return;
          }
          head.innerHTML = renderPanelHead("最近请求记录", "30 条", null);
          if (searchInput) {
            searchInput.placeholder = "筛选历史记录";
          }
          body.innerHTML = renderActivity();
        }

        function renderPanelHead(title, subtitle, action) {
          const actionButton = action
            ? '<button class="icon-button" data-action="' + action + '" type="button">+</button>'
            : "";
          return (
            '<div class="panel-head-main">' +
              '<span class="panel-head-title">' + escapeHtml(title) + '</span>' +
              '<span class="panel-head-subtitle">' + escapeHtml(subtitle) + '</span>' +
            '</div>' +
            actionButton
          );
        }

        function renderCollections() {
          const match = matchesKeyword();
          const requests = state.config.requests.slice().sort((left, right) => left.updatedAt < right.updatedAt ? 1 : -1);
          const groups = state.config.collections.map((collection) => {
            const members = requests.filter((request) => request.collectionId === collection.id && match(request.name + " " + request.url));
            if (members.length === 0 && uiState.keyword && !match(collection.name)) {
              return "";
            }
            return (
              '<div class="group">' +
                '<div class="group-title">' +
                  '<span>' + escapeHtml(collection.name) + '</span>' +
                  '<button data-action="createRequest" data-collection-id="' + collection.id + '" type="button">+</button>' +
                '</div>' +
                '<div class="group-items">' +
                  (members.length === 0
                    ? '<div class="empty-state">暂无请求</div>'
                    : members.map(renderRequestItem).join("")) +
                '</div>' +
              '</div>'
            );
          }).join("");
          const loose = requests.filter((request) => {
            if (!match(request.name + " " + request.url)) {
              return false;
            }
            return !request.collectionId || !state.config.collections.some((collection) => collection.id === request.collectionId);
          });
          const looseGroup = loose.length > 0
            ? '<div class="group"><div class="group-title"><span>未分组</span></div><div class="group-items">' + loose.map(renderRequestItem).join("") + '</div></div>'
            : "";
          const hasCollectionGroups = state.config.collections.length > 0;
          if (!groups && !looseGroup && !hasCollectionGroups) {
            return renderRequestEmptyState("还没有任何 HTTP 请求", true);
          }
          return groups + looseGroup || renderRequestEmptyState("没有匹配的请求", false);
        }

        function renderRequestItem(request) {
          const activeClass = state.activeRequestId === request.id ? " active" : "";
          return (
            '<button class="collection-item' + activeClass + '" data-action="selectRequest" data-request-id="' + request.id + '" type="button">' +
              '<div class="collection-main">' +
                '<span class="method-pill method-' + request.method.toLowerCase() + '">' + request.method + '</span>' +
                '<div style="min-width:0;">' +
                  '<div class="item-title">' + escapeHtml(request.name) + '</div>' +
                  '<div class="item-subtitle">' + escapeHtml(request.url || "未填写 URL") + '</div>' +
                '</div>' +
              '</div>' +
            '</button>'
          );
        }

        function renderActivity() {
          const groups = buildHistoryGroups();
          if (groups.length === 0) {
            return renderRequestEmptyState(state.history.length === 0 ? "暂无历史记录" : "没有匹配的历史记录", state.history.length === 0);
          }
          return groups.map((group) => renderHistoryGroup(group)).join("");
        }

        function renderHistoryGroup(group) {
          const latest = group.latestRecord;
          const statusValue = latest.responseSummary.status === null ? "ERR" : String(latest.responseSummary.status);
          const statusClass = latest.responseSummary.ok ? "ok" : latest.responseSummary.status === null ? "neutral" : "error";
          const expanded = Boolean(uiState.expandedHistoryGroups[group.key]);
          const activeClass = group.requestId && state.activeRequestId === group.requestId ? " active" : "";
          const overflowCount = Math.max(0, group.totalCount - 3);
          return (
            '<div class="history-group-card' + activeClass + '">' +
              '<div class="history-group-head">' +
                '<button class="history-group-main" data-action="select-history-group" data-history-id="' + latest.id + '" type="button">' +
                  '<div class="history-group-top">' +
                    '<span class="method-pill method-' + group.method.toLowerCase() + '">' + group.method + '</span>' +
                    '<span class="history-group-title">' + escapeHtml(group.title) + '</span>' +
                    '<span class="history-group-count">' + group.totalCount + ' 次</span>' +
                  '</div>' +
                  '<div class="history-group-url">' + escapeHtml(group.latestUrl || "未填写 URL") + '</div>' +
                  '<div class="history-group-meta">' +
                    '<span class="status-pill ' + statusClass + '">' + escapeHtml(statusValue) + '</span>' +
                    '<span>' + latest.responseSummary.durationMs + ' ms</span>' +
                    '<span>' + escapeHtml(relativeTime(latest.executedAt)) + '</span>' +
                  '</div>' +
                '</button>' +
                '<button class="icon-button history-group-toggle" data-action="toggle-history-group" data-group-key="' + encodeURIComponent(group.key) + '" type="button" aria-label="' + (expanded ? "收起记录" : "展开记录") + '">' + (expanded ? "−" : "+") + '</button>' +
              '</div>' +
              (
                expanded
                  ? '<div class="history-group-items">' +
                      group.records.slice(0, 3).map((record, index) => renderHistoryRecordItem(record, index === 0)).join("") +
                      (overflowCount > 0 ? '<div class="history-record-more">还有 ' + overflowCount + ' 条较早记录</div>' : "") +
                    '</div>'
                  : ""
              ) +
            '</div>'
          );
        }

        function renderHistoryRecordItem(item, latest) {
          const statusValue = item.responseSummary.status === null ? "ERR" : String(item.responseSummary.status);
          const statusClass = item.responseSummary.ok ? "ok" : item.responseSummary.status === null ? "neutral" : "error";
          const latestClass = latest ? " latest" : "";
          return (
            '<button class="history-record-item' + latestClass + '" data-action="selectHistory" data-history-id="' + item.id + '" type="button">' +
              '<div class="history-record-top">' +
                '<span class="status-pill ' + statusClass + '">' + escapeHtml(statusValue) + '</span>' +
                '<div class="history-record-meta">' +
                  '<span>' + item.responseSummary.durationMs + ' ms</span>' +
                  '<span>' + escapeHtml(formatClock(item.executedAt)) + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="history-record-caption">' + escapeHtml(item.request.url || "未填写 URL") + '</div>' +
            '</button>'
          );
        }

        function renderEnvironments() {
          const match = matchesKeyword();
          const items = state.config.environments.filter((environment) => match(environment.name + " " + Object.keys(environment.variables).join(" ")));
          const builtIn = (
            '<button class="environment-item' + (!state.activeEnvironmentId ? " active" : "") + '" data-action="selectEnvironment" data-environment-id="" type="button">' +
              '<div class="environment-main">' +
                '<span>不使用环境</span>' +
                '<small>直接使用原始 URL 和 Header</small>' +
              '</div>' +
            '</button>'
          );
          const content = items.map((environment) => {
            const activeClass = environment.id === state.activeEnvironmentId ? " active" : "";
            return (
              '<button class="environment-item' + activeClass + '" data-action="selectEnvironment" data-environment-id="' + environment.id + '" type="button">' +
                '<div class="environment-main">' +
                  '<span>' + escapeHtml(environment.name) + '</span>' +
                  '<small>' + Object.keys(environment.variables).length + ' 个变量</small>' +
                '</div>' +
              '</button>'
            );
          }).join("");
          return (
            '<div class="group">' +
              '<div class="group-title"><span>当前环境</span><button data-action="createEnvironment" type="button">+</button></div>' +
              '<div class="group-items">' +
                builtIn +
                content +
              '</div>' +
            '</div>'
          );
        }

        function renderRequestEmptyState(title, allowCreateCollection) {
          const actions = [
            '<button class="primary-button" data-action="createRequest" type="button">新建 HTTP 连接</button>'
          ];
          if (allowCreateCollection) {
            actions.push('<button class="ghost-button" data-action="createCollection" type="button">新建集合</button>');
          }
          return (
            '<div class="empty-state">' +
              '<div class="empty-title">' + escapeHtml(title) + '</div>' +
              '<div>点击按钮创建第一个请求, 然后在主工作台中编辑并发送.</div>' +
              '<div class="empty-actions">' + actions.join("") + '</div>' +
            '</div>'
          );
        }

        document.addEventListener("click", (event) => {
          const target = event.target instanceof HTMLElement ? event.target.closest("[data-action], [data-tab]") : null;
          if (!target) {
            return;
          }
          const tabName = target.getAttribute("data-tab");
          if (tabName) {
            uiState.activeTab = tabName;
            render();
            return;
          }
          const action = target.getAttribute("data-action");
          if (!action) {
            return;
          }
          if (action === "createRequest") {
            vscode.postMessage({
              type: "httpClientSidebar/createRequest",
              payload: {
                collectionId: target.getAttribute("data-collection-id")
              }
            });
            return;
          }
          if (action === "createCollection") {
            uiState.activeTab = "collections";
            render();
            vscode.postMessage({ type: "httpClientSidebar/createCollection" });
            return;
          }
          if (action === "createEnvironment") {
            uiState.activeTab = "environments";
            render();
            vscode.postMessage({ type: "httpClientSidebar/createEnvironment" });
            return;
          }
          if (action === "selectRequest") {
            vscode.postMessage({
              type: "httpClientSidebar/selectRequest",
              payload: { requestId: target.getAttribute("data-request-id") }
            });
            return;
          }
          if (action === "select-history-group") {
            vscode.postMessage({
              type: "httpClientSidebar/selectHistory",
              payload: { historyId: target.getAttribute("data-history-id") }
            });
            return;
          }
          if (action === "toggle-history-group") {
            const encodedKey = target.getAttribute("data-group-key");
            if (!encodedKey) {
              return;
            }
            const groupKey = decodeURIComponent(encodedKey);
            uiState.expandedHistoryGroups[groupKey] = !uiState.expandedHistoryGroups[groupKey];
            render();
            return;
          }
          if (action === "selectHistory") {
            vscode.postMessage({
              type: "httpClientSidebar/selectHistory",
              payload: { historyId: target.getAttribute("data-history-id") }
            });
            return;
          }
          if (action === "selectEnvironment") {
            vscode.postMessage({
              type: "httpClientSidebar/selectEnvironment",
              payload: {
                environmentId: target.getAttribute("data-environment-id") || null
              }
            });
          }
        });

        document.getElementById("search-input").addEventListener("input", (event) => {
          uiState.keyword = event.target.value;
          render();
        });

        window.addEventListener("message", (event) => {
          const message = event.data;
          if (!message) {
            return;
          }
          if (message.type === "mxToast/show") {
            window.__mxToastCenter.push(message.payload);
            return;
          }
          if (message.type !== "httpClientSidebar/state") {
            return;
          }
          state = message.payload;
          render();
        });

        window.addEventListener("DOMContentLoaded", () => {
          vscode.postMessage({ type: "httpClientSidebar/init" });
          render();
        });
      </script>
    </body>
  </html>`;
}
