import { HTTP_CLIENT_WEBVIEW_BUILD_ID, HttpClientViewState } from "../types";

export function createSerializedInitialState(initialState: HttpClientViewState): string {
  return JSON.stringify(initialState).replace(/</g, "\\u003c");
}

export function getWebviewScript(initialState: HttpClientViewState): string {
  const serializedState = createSerializedInitialState(initialState);
  return `
    <script>
      const vscode = acquireVsCodeApi();
      const state = ${serializedState};
      const uiState = {
        responseSearch: "",
        responsePretty: true,
        lastErrorMessage: ""
      };

      const requestTabNames = ["params", "headers", "body"];
      const responseTabNames = ["body", "headers", "meta", "loadTest"];

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function highlightText(source, keyword) {
        const rawSource = String(source ?? "");
        if (!keyword) {
          return escapeHtml(rawSource);
        }
        const safeKeyword = keyword.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&");
        const regex = new RegExp(safeKeyword, "gi");
        return escapeHtml(rawSource).replace(regex, function(match) {
          return "<mark>" + match + "</mark>";
        });
      }

      function postMessage(type, payload) {
        vscode.postMessage(payload === undefined ? { type } : { type, payload });
      }

      function stringifyError(error) {
        if (!error) {
          return "unknown error";
        }
        if (typeof error === "string") {
          return error;
        }
        if (error instanceof Error) {
          return error.stack || error.message || error.name;
        }
        try {
          return JSON.stringify(error);
        } catch {
          return String(error);
        }
      }

      function reportFrontendLog(level, scope, detail) {
        postMessage("httpClient/frontendLog", {
          level: level,
          scope: scope,
          message: stringifyError(detail)
        });
      }

      function ackRenderedResponse(source) {
        if (!state.response || state.requestRunning) {
          return;
        }
        postMessage("httpClient/responseAck", {
          source: source
        });
      }

      function safeRun(scope, job) {
        try {
          return job();
        } catch (error) {
          reportFrontendLog("error", scope, error);
          state.requestRunning = false;
          setBanner("界面渲染失败, 请查看 OUTPUT 日志", "warning");
          const sendButton = document.getElementById("send-button");
          if (sendButton) {
            sendButton.textContent = "发送";
          }
          return undefined;
        }
      }

      function setBanner(message, kind) {
        const banner = document.getElementById("message-banner");
        if (!banner) {
          return;
        }
        banner.textContent = message || "";
        banner.className = "message-banner" + (message ? " " + (kind || "info") : "");
      }

      function buildUrlHint(rawUrl) {
        const trimmed = String(rawUrl || "").trim();
        if (!trimmed) {
          return "URL 不能为空";
        }
        const bareHostPattern = /^[a-zA-Z0-9.-]+(:\\d+)?(\\/.*)?$/;
        if (bareHostPattern.test(trimmed) && !/^[a-zA-Z][a-zA-Z\\d+\\-.]*:/.test(trimmed)) {
          return "URL 需要以 http:// 或 https:// 开头, 例如 https://" + trimmed.replace(/^\\/+/, "");
        }
        try {
          const parsed = new URL(trimmed);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return "仅支持 HTTP/HTTPS 请求, 例如 https://example.com/api";
          }
        } catch {
          return "URL 格式不正确, 例如 https://example.com/api";
        }
        return "";
      }

      function ensureDraft() {
        if (!state.draft) {
          return null;
        }
        return state.draft;
      }

      function syncDraft() {
        if (!state.draft) {
          return;
        }
        postMessage("httpClient/draftChanged", {
          request: state.draft,
          dirty: state.dirty
        });
      }

      function setDraft(mutator) {
        if (!state.draft) {
          return;
        }
        mutator(state.draft);
        state.draft.updatedAt = new Date().toISOString();
        state.dirty = true;
        uiState.lastErrorMessage = "";
        syncDraft();
        render();
      }

      function render() {
        renderToolbar();
        renderRequestTabs();
        renderRequestContent();
        renderResponseSummary();
        renderResponseTabs();
        renderResponseContent();
      }

      function splitUrlParts(rawUrl) {
        const value = String(rawUrl || "");
        const hashIndex = value.indexOf("#");
        const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
        const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
        const queryIndex = withoutHash.indexOf("?");
        return {
          base: queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash,
          query: queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "",
          hash
        };
      }

      function syncParamsFromUrl(draft) {
        const parts = splitUrlParts(draft.url);
        if (!parts.query) {
          return;
        }
        const params = Array.from(new URLSearchParams(parts.query).entries()).map(function(entry) {
          return {
            id: crypto.randomUUID(),
            key: entry[0],
            value: entry[1],
            enabled: true
          };
        });
        draft.params = params.length > 0 ? params.concat([{ id: crypto.randomUUID(), key: "", value: "", enabled: true }]) : [{ id: crypto.randomUUID(), key: "", value: "", enabled: true }];
      }

      function syncUrlFromParams(draft) {
        const parts = splitUrlParts(draft.url);
        const search = new URLSearchParams();
        draft.params.forEach(function(item) {
          if (item.enabled && item.key.trim()) {
            search.set(item.key.trim(), item.value);
          }
        });
        const queryText = search.toString();
        draft.url = parts.base + (queryText ? "?" + queryText : "") + parts.hash;
      }

      function renderToolbar() {
        const draft = state.draft;
        const methodSelect = document.getElementById("method-select");
        const urlInput = document.getElementById("url-input");
        const envSelect = document.getElementById("environment-select");
        const dirtyIndicator = document.getElementById("dirty-indicator");
        const requestHint = document.getElementById("request-hint");

        methodSelect.innerHTML = ["GET", "POST", "PUT", "DELETE", "PATCH"].map(function(method) {
          const selected = draft && draft.method === method ? "selected" : "";
          return '<option value="' + method + '" ' + selected + '>' + method + "</option>";
        }).join("");
        methodSelect.disabled = !draft;
        methodSelect.value = draft ? draft.method : "GET";

        urlInput.value = draft ? draft.url : "";
        urlInput.disabled = !draft;

        const envOptions = ['<option value="">不使用环境</option>']
          .concat(state.config.environments.map(function(environment) {
            const selected = state.activeEnvironmentId === environment.id ? "selected" : "";
            return '<option value="' + environment.id + '" ' + selected + '>' + escapeHtml(environment.name) + "</option>";
          }));
        envSelect.innerHTML = envOptions.join("");
        envSelect.value = state.activeEnvironmentId || "";

        dirtyIndicator.textContent = state.dirty ? "未保存" : "已同步";
        dirtyIndicator.className = "dirty-indicator" + (state.dirty ? " dirty" : "");
        requestHint.textContent = draft ? draft.name : "请选择请求或新建请求";
        const sendButton = document.getElementById("send-button");
        sendButton.textContent = state.requestRunning ? "取消" : "发送";
      }

      function renderSidebar() {
        renderCollectionTree();
        renderFavorites();
        renderHistory();
      }

      function renderCollectionTree() {
        const root = document.getElementById("collection-tree");
        const requests = state.config.requests.slice().sort(function(left, right) {
          return left.updatedAt < right.updatedAt ? 1 : -1;
        });
        const activeRequestId = state.draft ? state.draft.id : state.activeRequestId;
        const sections = state.config.collections.map(function(collection) {
          const members = requests.filter(function(request) {
            return request.collectionId === collection.id;
          });
          return (
            '<div class="collection-block">' +
              '<div class="collection-header">' +
                '<span class="collection-name static">' + escapeHtml(collection.name) + "</span>" +
                '<div class="collection-actions">' +
                  '<button class="icon-button" data-action="create-request" data-collection-id="' + collection.id + '" type="button">+</button>' +
                  '<button class="icon-button" data-action="rename-collection" data-collection-id="' + collection.id + '" type="button">改</button>' +
                  '<button class="icon-button" data-action="delete-collection" data-collection-id="' + collection.id + '" type="button">删</button>' +
                "</div>" +
              "</div>" +
              '<div class="request-list">' +
                members.map(function(request) {
                  const activeClass = activeRequestId === request.id ? " active" : "";
                  return (
                    '<div class="request-item' + activeClass + '">' +
                      '<button class="request-main" data-action="select-request" data-request-id="' + request.id + '" type="button">' +
                        '<span class="method-pill method-' + request.method.toLowerCase() + '">' + request.method + "</span>" +
                        '<span class="request-name">' + escapeHtml(request.name) + "</span>" +
                      "</button>" +
                      '<div class="request-actions">' +
                        '<button class="icon-button" data-action="toggle-favorite" data-request-id="' + request.id + '" data-favorite="' + (!request.favorite) + '" type="button">' + (request.favorite ? "★" : "☆") + "</button>" +
                        '<button class="icon-button" data-action="duplicate-request" data-request-id="' + request.id + '" type="button">复</button>' +
                        '<button class="icon-button" data-action="rename-request" data-request-id="' + request.id + '" type="button">改</button>' +
                        '<button class="icon-button" data-action="delete-request" data-request-id="' + request.id + '" type="button">删</button>' +
                      "</div>" +
                    "</div>"
                  );
                }).join("") +
              "</div>" +
            "</div>"
          );
        });

        const ungrouped = requests.filter(function(request) {
          return !request.collectionId || !state.config.collections.some(function(collection) {
            return collection.id === request.collectionId;
          });
        });
        if (ungrouped.length > 0) {
          sections.push(
            '<div class="collection-block">' +
              '<div class="collection-header"><span class="collection-name static">未分组</span></div>' +
              '<div class="request-list">' +
              ungrouped.map(function(request) {
                const activeClass = activeRequestId === request.id ? " active" : "";
                return (
                  '<div class="request-item' + activeClass + '">' +
                    '<button class="request-main" data-action="select-request" data-request-id="' + request.id + '" type="button">' +
                      '<span class="method-pill method-' + request.method.toLowerCase() + '">' + request.method + "</span>" +
                      '<span class="request-name">' + escapeHtml(request.name) + "</span>" +
                    "</button>" +
                  "</div>"
                );
              }).join("") +
              "</div>" +
            "</div>"
          );
        }
        root.innerHTML = sections.join("") || '<div class="empty-state">暂无请求集合</div>';
      }

      function renderFavorites() {
        const root = document.getElementById("favorite-list");
        const favorites = state.config.requests.filter(function(request) {
          return request.favorite;
        });
        root.innerHTML = favorites.length === 0
          ? '<div class="empty-state">暂无收藏</div>'
          : favorites.map(function(request) {
              return (
                '<button class="list-row-button" data-action="select-request" data-request-id="' + request.id + '" type="button">' +
                  '<span class="method-pill method-' + request.method.toLowerCase() + '">' + request.method + "</span>" +
                  '<span class="list-row-title">' + escapeHtml(request.name) + "</span>" +
                "</button>"
              );
            }).join("");
      }

      function renderHistory() {
        const root = document.getElementById("history-list");
        root.innerHTML = state.history.length === 0
          ? '<div class="empty-state">暂无历史</div>'
          : state.history.map(function(item) {
              const status = item.responseSummary.status === null ? "ERR" : String(item.responseSummary.status);
              return (
                '<button class="history-item" data-action="select-history" data-history-id="' + item.id + '" type="button">' +
                  '<div class="history-top">' +
                    '<span class="method-pill method-' + item.request.method.toLowerCase() + '">' + item.request.method + "</span>" +
                    '<span class="list-row-title">' + escapeHtml(item.request.name) + "</span>" +
                  "</div>" +
                  '<div class="history-bottom">' +
                    '<span class="history-status">' + status + "</span>" +
                    '<span class="history-time">' + escapeHtml(new Date(item.executedAt).toLocaleString()) + "</span>" +
                    '<span class="history-duration">' + item.responseSummary.durationMs + " ms</span>" +
                  "</div>" +
                "</button>"
              );
            }).join("");
      }

      function renderRequestTabs() {
        requestTabNames.forEach(function(tabName) {
          const button = document.querySelector('[data-tab-group="request"][data-tab="' + tabName + '"]');
          if (button) {
            button.classList.toggle("active", state.activeTab === tabName);
          }
        });
      }

      function renderRequestContent() {
        const root = document.getElementById("request-tab-content");
        if (!state.draft) {
          root.innerHTML = '<div class="empty-panel">请选择左侧请求或点击新建请求</div>';
          return;
        }
        if (state.activeTab === "params") {
          root.innerHTML = renderKeyValueEditor("params", state.draft.params, "添加参数");
          return;
        }
        if (state.activeTab === "headers") {
          root.innerHTML = renderKeyValueEditor("headers", state.draft.headers, "添加请求头");
          return;
        }
        root.innerHTML = renderBodyEditor(state.draft);
      }

      function renderKeyValueEditor(section, items, actionText) {
        return (
          '<div class="kv-editor">' +
            '<div class="kv-header">' +
              '<span>启用</span><span>Key</span><span>Value</span><span>操作</span>' +
            "</div>" +
            items.map(function(item) {
              return (
                '<div class="kv-row">' +
                  '<label class="checkbox-cell">' +
                    '<input type="checkbox" data-input="kv-enabled" data-section="' + section + '" data-id="' + item.id + '" ' + (item.enabled ? "checked" : "") + " />" +
                  "</label>" +
                  '<input class="kv-input" type="text" data-input="kv-key" data-section="' + section + '" data-id="' + item.id + '" value="' + escapeHtml(item.key) + '" />' +
                  '<input class="kv-input" type="text" data-input="kv-value" data-section="' + section + '" data-id="' + item.id + '" value="' + escapeHtml(item.value) + '" />' +
                  '<button class="ghost-button" data-action="remove-kv-row" data-section="' + section + '" data-id="' + item.id + '" type="button">删除</button>' +
                "</div>"
              );
            }).join("") +
            '<button class="secondary-button add-row-button" data-action="add-kv-row" data-section="' + section + '" type="button">' + actionText + "</button>" +
          "</div>"
        );
      }

      function renderBodyEditor(draft) {
        const bodyVisible = draft.method !== "GET" && draft.method !== "DELETE";
        if (!bodyVisible) {
          return '<div class="empty-panel">当前方法通常不发送 Body. 如需调试, 请切换到 POST / PUT / PATCH.</div>';
        }
        return (
          '<div class="body-editor">' +
            '<div class="body-toolbar">' +
              '<select id="body-mode-select">' +
                '<option value="none"' + (draft.bodyMode === "none" ? " selected" : "") + '>none</option>' +
                '<option value="raw"' + (draft.bodyMode === "raw" ? " selected" : "") + '>raw</option>' +
                '<option value="json"' + (draft.bodyMode === "json" ? " selected" : "") + '>json</option>' +
              "</select>" +
              '<button class="ghost-button" id="format-json-button" type="button">格式化 JSON</button>' +
            "</div>" +
            '<textarea id="body-textarea" class="body-textarea" placeholder="请输入请求体">' + escapeHtml(draft.bodyText) + "</textarea>" +
          "</div>"
        );
      }

      function renderResponseSummary() {
        const root = document.getElementById("response-summary");
        if (state.requestRunning) {
          root.innerHTML = '<span class="summary-pill neutral">请求中</span>';
          return;
        }
        if (!state.response) {
          root.innerHTML = '<span class="summary-pill neutral">等待请求</span>';
          return;
        }
        root.innerHTML =
          '<span class="summary-pill ' + (state.response.ok ? "success" : "warning") + '">' + state.response.status + " " + escapeHtml(state.response.statusText) + "</span>" +
          '<span class="summary-pill neutral">' + state.response.meta.durationMs + " ms</span>" +
          '<span class="summary-pill neutral">' + state.response.meta.sizeBytes + " B</span>";
      }

      function renderResponseTabs() {
        responseTabNames.forEach(function(tabName) {
          const button = document.querySelector('[data-tab-group="response"][data-tab="' + tabName + '"]');
          if (button) {
            button.classList.toggle("active", state.responseTab === tabName);
          }
        });
      }

      function renderResponseContent() {
        const root = document.getElementById("response-tab-content");
        if (state.responseTab === "loadTest") {
          root.innerHTML = renderLoadTestContent();
          return;
        }
        if (!state.response) {
          if (uiState.lastErrorMessage) {
            root.innerHTML = '<div class="empty-panel error-panel"><strong>请求失败</strong><span>' + escapeHtml(uiState.lastErrorMessage) + "</span></div>";
            return;
          }
          root.innerHTML = '<div class="empty-panel">发送请求后在这里查看响应.</div>';
          return;
        }
        if (state.responseTab === "headers") {
          root.innerHTML = renderHeadersContent();
          return;
        }
        if (state.responseTab === "meta") {
          root.innerHTML = renderMetaContent();
          return;
        }
        root.innerHTML = renderBodyContent();
      }

      function renderBodyContent() {
        const responseText = uiState.responsePretty && state.response.isJson ? state.response.bodyPrettyText : state.response.bodyText;
        return (
          '<div class="response-tools">' +
            '<input id="response-search-input" type="text" class="response-search-input" placeholder="搜索响应内容" value="' + escapeHtml(uiState.responseSearch) + '" />' +
            '<button id="response-toggle-mode" class="ghost-button" type="button">' + (uiState.responsePretty ? "切换 Raw" : "切换 Pretty") + "</button>" +
            '<button id="copy-response-button" class="ghost-button" type="button">复制响应</button>' +
          "</div>" +
          '<pre class="response-code">' + highlightText(responseText, uiState.responseSearch) + "</pre>"
        );
      }

      function renderHeadersContent() {
        return (
          '<div class="table-like headers-table">' +
            state.response.headers.map(function(header) {
              return (
                '<div class="table-row">' +
                  '<span class="table-cell key">' + escapeHtml(header.key) + "</span>" +
                  '<span class="table-cell value">' + escapeHtml(header.value) + '</span><button class="ghost-button" data-action="copy-header-value" data-header-value="' + encodeURIComponent(header.value) + '" type="button">复制</button>' +
                "</div>"
              );
            }).join("") +
          "</div>"
        );
      }

      function renderMetaContent() {
        const meta = state.response.meta;
        const unresolved = meta.unresolvedVariables.length > 0 ? meta.unresolvedVariables.join(", ") : "无";
        return (
          '<div class="meta-grid">' +
            renderMetaItem("最终 URL", meta.finalUrl) +
            renderMetaItem("耗时", meta.durationMs + " ms") +
            renderMetaItem("响应大小", meta.sizeBytes + " B") +
            renderMetaItem("开始时间", new Date(meta.startedAt).toLocaleString()) +
            renderMetaItem("内容类型", meta.contentType || "未知") +
            renderMetaItem("重定向", meta.redirected ? "是" : "否") +
            renderMetaItem("未解析变量", unresolved) +
          "</div>"
        );
      }

      function renderMetaItem(label, value) {
        return (
          '<div class="meta-item">' +
            '<span class="meta-label">' + escapeHtml(label) + "</span>" +
            '<span class="meta-value">' + escapeHtml(value) + "</span>" +
          "</div>"
        );
      }

      function renderLoadTestContent() {
        const progress = state.loadTestProgress;
        const result = state.loadTestResult;
        const profile = state.loadTestProfile;
        return (
          '<div class="load-test-content">' +
            '<div class="load-test-config-grid">' +
              '<label class="field-block"><span>总请求数</span><input id="load-total-input" type="number" min="1" value="' + profile.totalRequests + '" /></label>' +
              '<label class="field-block"><span>并发数</span><input id="load-concurrency-input" type="number" min="1" value="' + profile.concurrency + '" /></label>' +
              '<label class="field-block"><span>超时 ms</span><input id="load-timeout-input" type="number" min="1" value="' + profile.timeoutMs + '" /></label>' +
            "</div>" +
            '<div class="load-test-actions">' +
              '<button id="load-test-start-button" class="primary-button" type="button">' + (progress && progress.running ? "运行中" : "开始压测") + "</button>" +
              '<button id="load-test-stop-button" class="ghost-button" type="button">停止</button>' +
            "</div>" +
            renderLoadTestProgress(progress) +
            renderLoadTestResult(result) +
          "</div>"
        );
      }

      function renderLoadTestProgress(progress) {
        if (!progress) {
          return '<div class="empty-state compact">尚未启动压测</div>';
        }
        return (
          '<div class="progress-panel">' +
            '<div class="progress-bar"><span style="width:' + Math.min(100, Math.round((progress.completedRequests / Math.max(progress.totalRequests, 1)) * 100)) + '%"></span></div>' +
            '<div class="progress-text">已完成 ' + progress.completedRequests + " / " + progress.totalRequests + ' , 成功 ' + progress.successCount + ' , 失败 ' + progress.failureCount + "</div>" +
          "</div>"
        );
      }

      function renderLoadTestResult(result) {
        if (!result) {
          return "";
        }
        return (
          '<div class="load-result">' +
            '<div class="summary-grid">' +
              renderMetric("成功率", (result.successRate * 100).toFixed(2) + "%") +
              renderMetric("平均耗时", result.averageDurationMs.toFixed(2) + " ms") +
              renderMetric("P95", result.p95DurationMs + " ms") +
              renderMetric("最大耗时", result.maxDurationMs + " ms") +
              renderMetric("RPS", result.rps.toFixed(2)) +
              renderMetric("总耗时", result.durationMs + " ms") +
            "</div>" +
            '<div class="table-like">' +
              result.statusCounts.map(function(item) {
                return '<div class="table-row"><span class="table-cell key">' + escapeHtml(item.status) + '</span><span class="table-cell value">' + item.count + "</span></div>";
              }).join("") +
            "</div>" +
            '<div class="error-samples">' +
              (result.errorSamples.length === 0
                ? '<div class="empty-state compact">无错误样本</div>'
                : result.errorSamples.map(function(sample) {
                    return '<div class="error-sample">#' + sample.index + " " + escapeHtml(sample.message) + (sample.status ? " (" + sample.status + ")" : "") + "</div>";
                  }).join("")) +
            "</div>" +
          "</div>"
        );
      }

      function renderMetric(label, value) {
        return '<div class="metric-card"><span class="metric-label">' + escapeHtml(label) + '</span><span class="metric-value">' + escapeHtml(value) + "</span></div>";
      }

      function addKeyValueRow(section) {
        setDraft(function(draft) {
          draft[section].push({
            id: crypto.randomUUID(),
            key: "",
            value: "",
            enabled: true
          });
          if (section === "params") {
            syncUrlFromParams(draft);
          }
        });
      }

      function removeKeyValueRow(section, id) {
        setDraft(function(draft) {
          draft[section] = draft[section].filter(function(item) {
            return item.id !== id;
          });
          if (draft[section].length === 0) {
            draft[section].push({
              id: crypto.randomUUID(),
              key: "",
              value: "",
              enabled: true
            });
          }
          if (section === "params") {
            syncUrlFromParams(draft);
          }
        });
      }

      function performSend() {
        if (state.requestRunning) {
          postMessage("httpClient/cancelRequest");
          setBanner("正在取消请求...", "warning");
          return;
        }
        const draft = ensureDraft();
        if (!draft) {
          setBanner("请先创建或选择请求", "warning");
          return;
        }
        const urlHint = buildUrlHint(draft.url);
        if (urlHint) {
          uiState.lastErrorMessage = urlHint;
          setBanner(urlHint, "warning");
          state.response = null;
          state.responseTab = "body";
          renderToolbar();
          renderResponseSummary();
          renderResponseTabs();
          renderResponseContent();
          const urlInput = document.getElementById("url-input");
          if (urlInput instanceof HTMLInputElement) {
            urlInput.focus();
            urlInput.select();
          }
          return;
        }
        state.requestRunning = true;
        state.response = null;
        uiState.lastErrorMessage = "";
        renderToolbar();
        renderResponseSummary();
        renderResponseContent();
        setBanner("正在发送请求...", "info");
        postMessage("httpClient/send", {
          request: draft,
          environmentId: state.activeEnvironmentId,
          timeoutMs: 30000
        });
      }

      function performSave() {
        const draft = ensureDraft();
        if (!draft) {
          setBanner("没有可保存的请求", "warning");
          return;
        }
        postMessage("httpClient/save", {
          request: draft
        });
      }

      function performLoadTest() {
        const draft = ensureDraft();
        if (!draft) {
          setBanner("没有可压测的请求", "warning");
          return;
        }
        state.responseTab = "loadTest";
        postMessage("httpClient/uiStateChanged", {
          activeTab: state.activeTab,
          responseTab: state.responseTab
        });
        renderResponseTabs();
        renderResponseContent();
        postMessage("httpClient/loadTest/start", {
          request: draft,
          environmentId: state.activeEnvironmentId,
          profile: state.loadTestProfile
        });
      }

      function installListeners() {
        document.addEventListener("click", function(event) {
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (!target) {
            return;
          }
          const actionTarget = target.closest("[data-action]");
          const tabTarget = target.closest("[data-tab-group]");
          const action = actionTarget ? actionTarget.getAttribute("data-action") : null;
          if (action === "create-collection") {
            postMessage("httpClient/createCollectionPrompt");
            return;
          }
          if (action === "create-request") {
            postMessage("httpClient/createRequest", {
              collectionId: actionTarget.getAttribute("data-collection-id")
            });
            return;
          }
          if (action === "select-request") {
            postMessage("httpClient/selectRequest", {
              requestId: actionTarget.getAttribute("data-request-id")
            });
            return;
          }
          if (action === "rename-collection") {
            postMessage("httpClient/renameCollectionPrompt", {
              collectionId: actionTarget.getAttribute("data-collection-id")
            });
            return;
          }
          if (action === "delete-collection") {
            postMessage("httpClient/deleteCollection", {
              collectionId: actionTarget.getAttribute("data-collection-id")
            });
            return;
          }
          if (action === "rename-request") {
            postMessage("httpClient/renameRequestPrompt", {
              requestId: actionTarget.getAttribute("data-request-id")
            });
            return;
          }
          if (action === "duplicate-request") {
            postMessage("httpClient/duplicateRequest", {
              requestId: actionTarget.getAttribute("data-request-id")
            });
            return;
          }
          if (action === "delete-request") {
            postMessage("httpClient/deleteRequest", {
              requestId: actionTarget.getAttribute("data-request-id")
            });
            return;
          }
          if (action === "toggle-favorite") {
            postMessage("httpClient/toggleFavorite", {
              requestId: actionTarget.getAttribute("data-request-id"),
              favorite: actionTarget.getAttribute("data-favorite") === "true"
            });
            return;
          }
          if (action === "copy-header-value") {
            navigator.clipboard.writeText(decodeURIComponent(actionTarget.getAttribute("data-header-value") || "")).then(function() {
              setBanner("Header 值已复制", "success");
            });
            return;
          }
          if (action === "select-history") {
            postMessage("httpClient/selectHistory", {
              historyId: actionTarget.getAttribute("data-history-id")
            });
            return;
          }
          if (action === "add-kv-row") {
            addKeyValueRow(actionTarget.getAttribute("data-section"));
            return;
          }
          if (action === "remove-kv-row") {
            removeKeyValueRow(actionTarget.getAttribute("data-section"), actionTarget.getAttribute("data-id"));
            return;
          }
          if (tabTarget && tabTarget.matches('[data-tab-group="request"]')) {
            state.activeTab = tabTarget.getAttribute("data-tab");
            postMessage("httpClient/uiStateChanged", {
              activeTab: state.activeTab,
              responseTab: state.responseTab
            });
            renderRequestTabs();
            renderRequestContent();
            return;
          }
          if (tabTarget && tabTarget.matches('[data-tab-group="response"]')) {
            state.responseTab = tabTarget.getAttribute("data-tab");
            postMessage("httpClient/uiStateChanged", {
              activeTab: state.activeTab,
              responseTab: state.responseTab
            });
            renderResponseTabs();
            renderResponseContent();
            return;
          }
        });

        document.addEventListener("input", function(event) {
          const target = event.target;
          if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
            return;
          }
          if (target.id === "url-input") {
            setDraft(function(draft) {
              draft.url = target.value.trim();
              syncParamsFromUrl(draft);
            });
            return;
          }
          if (target.id === "method-select") {
            setDraft(function(draft) {
              draft.method = target.value;
            });
            return;
          }
          if (target.id === "environment-select") {
            state.activeEnvironmentId = target.value || null;
            postMessage("httpClient/selectEnvironment", {
              environmentId: state.activeEnvironmentId
            });
            renderToolbar();
            return;
          }
          if (target.dataset.input === "kv-enabled") {
            setDraft(function(draft) {
              const items = draft[target.dataset.section];
              const item = items.find(function(entry) {
                return entry.id === target.dataset.id;
              });
              if (item) {
                item.enabled = target.checked;
              }
              if (target.dataset.section === "params") {
                syncUrlFromParams(draft);
              }
            });
            return;
          }
          if (target.dataset.input === "kv-key" || target.dataset.input === "kv-value") {
            setDraft(function(draft) {
              const items = draft[target.dataset.section];
              const item = items.find(function(entry) {
                return entry.id === target.dataset.id;
              });
              if (item) {
                item[target.dataset.input === "kv-key" ? "key" : "value"] = target.value;
              }
              if (target.dataset.section === "params") {
                syncUrlFromParams(draft);
              }
            });
            return;
          }
          if (target.id === "body-mode-select") {
            setDraft(function(draft) {
              draft.bodyMode = target.value;
            });
            return;
          }
          if (target.id === "body-textarea") {
            setDraft(function(draft) {
              draft.bodyText = target.value;
            });
            return;
          }
          if (target.id === "response-search-input") {
            uiState.responseSearch = target.value;
            renderResponseContent();
            return;
          }
          if (target.id === "load-total-input" || target.id === "load-concurrency-input" || target.id === "load-timeout-input") {
            const totalInput = document.getElementById("load-total-input");
            const concurrencyInput = document.getElementById("load-concurrency-input");
            const timeoutInput = document.getElementById("load-timeout-input");
            state.loadTestProfile = {
              totalRequests: Number(totalInput ? totalInput.value : state.loadTestProfile.totalRequests),
              concurrency: Number(concurrencyInput ? concurrencyInput.value : state.loadTestProfile.concurrency),
              timeoutMs: Number(timeoutInput ? timeoutInput.value : state.loadTestProfile.timeoutMs)
            };
          }
        });

        document.addEventListener("keydown", function(event) {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            performSend();
            return;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            performSave();
          }
        });

        document.getElementById("send-button").addEventListener("click", performSend);
        document.getElementById("save-button").addEventListener("click", performSave);
        document.getElementById("load-test-button").addEventListener("click", function() {
          state.responseTab = "loadTest";
          postMessage("httpClient/uiStateChanged", {
            activeTab: state.activeTab,
            responseTab: state.responseTab
          });
          renderResponseTabs();
          renderResponseContent();
        });
        document.getElementById("import-curl-button").addEventListener("click", function() {
          postMessage("httpClient/importCurlPrompt");
        });

        document.addEventListener("click", function(event) {
          const target = event.target;
          if (!(target instanceof HTMLElement)) {
            return;
          }
          if (target.id === "copy-response-button") {
            const responseText = uiState.responsePretty && state.response && state.response.isJson
              ? state.response.bodyPrettyText
              : state.response ? state.response.bodyText : "";
            navigator.clipboard.writeText(responseText).then(function() {
              setBanner("响应体已复制到剪贴板", "success");
            });
            return;
          }
          if (target.id === "response-toggle-mode") {
            uiState.responsePretty = !uiState.responsePretty;
            renderResponseContent();
            return;
          }
          if (target.id === "format-json-button") {
            if (!state.draft) {
              return;
            }
            try {
              const formatted = JSON.stringify(JSON.parse(state.draft.bodyText || "{}"), null, 2);
              setDraft(function(draft) {
                draft.bodyMode = "json";
                draft.bodyText = formatted;
              });
              setBanner("JSON 已格式化", "success");
            } catch {
              setBanner("当前内容不是合法 JSON", "warning");
            }
            return;
          }
          if (target.id === "load-test-start-button") {
            performLoadTest();
            return;
          }
          if (target.id === "load-test-stop-button") {
            postMessage("httpClient/loadTest/stop");
          }
        });
      }

      window.addEventListener("message", function(event) {
        safeRun("message.dispatch", function() {
          const message = event.data;
          if (!message || typeof message.type !== "string") {
            return;
          }
          if (message.type === "httpClient/state") {
            Object.assign(state, message.payload);
            render();
            ackRenderedResponse("state");
            return;
          }
          if (message.type === "httpClient/response") {
            state.response = message.payload;
            state.requestRunning = false;
            state.responseTab = "body";
            uiState.lastErrorMessage = "";
            renderToolbar();
            renderResponseSummary();
            renderResponseTabs();
            renderResponseContent();
            setBanner("请求完成", "success");
            reportFrontendLog("info", "httpClient/response", "response rendered");
            ackRenderedResponse("response");
            return;
          }
          if (message.type === "httpClient/loadTest/progress") {
            state.loadTestProgress = message.payload;
            state.responseTab = "loadTest";
            renderResponseTabs();
            renderResponseContent();
            return;
          }
          if (message.type === "httpClient/loadTest/result") {
            state.loadTestResult = message.payload;
            state.loadTestProgress = null;
            state.responseTab = "loadTest";
            renderResponseTabs();
            renderResponseContent();
            setBanner(message.payload.cancelled ? "压测已停止" : "压测完成", "success");
            return;
          }
          if (message.type === "httpClient/error") {
            uiState.lastErrorMessage = message.payload.message;
            state.response = null;
            state.requestRunning = false;
            state.responseTab = "body";
            renderToolbar();
            renderResponseSummary();
            renderResponseTabs();
            renderResponseContent();
            setBanner(message.payload.message, "warning");
            return;
          }
          if (message.type === "httpClient/hostCommand") {
            if (message.payload.command === "send") {
              performSend();
            } else if (message.payload.command === "save") {
              performSave();
            } else if (message.payload.command === "loadTest") {
              performLoadTest();
            } else if (message.payload.command === "focusCurlImport") {
              postMessage("httpClient/importCurlPrompt");
            }
          }
        });
      });

      window.addEventListener("error", function(event) {
        reportFrontendLog("error", "window.error", event.error || event.message || "unknown window error");
      });

      window.addEventListener("unhandledrejection", function(event) {
        reportFrontendLog("error", "window.unhandledrejection", event.reason);
      });

      window.addEventListener("DOMContentLoaded", function() {
        safeRun("DOMContentLoaded", function() {
          installListeners();
          render();
          ackRenderedResponse("bootstrap");
          reportFrontendLog("info", "bootstrap", "dom ready build=" + ${JSON.stringify(HTTP_CLIENT_WEBVIEW_BUILD_ID)});
          postMessage("httpClient/init", {
            buildId: ${JSON.stringify(HTTP_CLIENT_WEBVIEW_BUILD_ID)}
          });
        });
      });
    </script>
  `;
}
