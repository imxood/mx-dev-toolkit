import React, { useState } from "react";
import { SidebarSurface } from "../sidebar/SidebarApp";
import { isScratchDraft } from "../shared/workbench_model";
import { type WorkbenchController, useWorkbenchController } from "./useWorkbenchController";

export function App(): React.ReactElement {
  const controller = useWorkbenchController();
  const [helpOpen, setHelpOpen] = useState(false);
  return <AppView controller={controller} helpOpen={helpOpen} onOpenHelp={() => setHelpOpen(true)} onCloseHelp={() => setHelpOpen(false)} />;
}

export function AppView({
  controller,
  helpOpen = false,
  onOpenHelp,
  onCloseHelp,
}: {
  controller: WorkbenchController;
  helpOpen?: boolean;
  onOpenHelp?: () => void;
  onCloseHelp?: () => void;
}): React.ReactElement {
  const { viewState, uiState } = controller;
  const draft = viewState.draft;
  const response = viewState.response;
  const responseSummaryKind = !response ? "neutral" : response.ok ? "success" : "warning";
  const loadTestRunning = Boolean(viewState.loadTestProgress?.running);
  const scratchDraft = isScratchDraft(viewState);

  return (
    <div className="app-shell" data-build-id={controller.buildId} data-host-state={controller.hasHostState ? "ready" : "fallback"}>
      <aside className="sidebar-pane panel-surface">
        <SidebarSurface controller={controller} />
      </aside>

      <main className="editor-shell">
        <section className={`http-toolbar${scratchDraft ? " context-new" : ""}${viewState.selectedHistoryId ? " context-history" : ""}`}>
          <div className="toolbar-main">
            <select aria-label="HTTP Method" value={draft?.method ?? "GET"} onChange={(event) => controller.setMethod(event.target.value as never)} disabled={!draft}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </select>
            <input
              className="toolbar-url"
              type="text"
              value={draft?.url ?? ""}
              placeholder="请输入请求 URL"
              onChange={(event) => controller.setUrl(event.target.value)}
              disabled={!draft}
            />
            <button id="send-button" className="primary-button" type="button" onClick={controller.performSend}>
              {viewState.requestRunning ? "取消" : "发送"}
            </button>
          </div>
          <div className="toolbar-secondary">
            <select
              aria-label="环境"
              value={viewState.activeEnvironmentId ?? ""}
              onChange={(event) => controller.setEnvironment(event.target.value || null)}
            >
              <option value="">不使用环境</option>
              {viewState.config.environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ))}
            </select>
            <div className="toolbar-secondary-actions">
              <button id="load-test-button" className="secondary-button" type="button" onClick={loadTestRunning ? controller.stopLoadTest : controller.performLoadTest}>
                {loadTestRunning ? "停止" : "压测"}
              </button>
              <button id="save-button" className="secondary-button" type="button" onClick={controller.performSave}>
                保存
              </button>
              <button id="import-curl-button" className="ghost-button" type="button" onClick={controller.importCurl}>
                导入 cURL
              </button>
              <button className="ghost-button toolbar-help-button" type="button" title="使用说明" onClick={onOpenHelp}>
                说明
              </button>
            </div>
          </div>
        </section>

        <section className="request-editor panel-surface">
          <div className="panel-title-row">
            <div>
              <h2>请求配置</h2>
            </div>
            <div className="tab-strip" id="request-tabs">
              <button type="button" className={`tab-button${viewState.activeTab === "params" ? " active" : ""}`} onClick={() => controller.setRequestTab("params")}>
                Params
              </button>
              <button type="button" className={`tab-button${viewState.activeTab === "headers" ? " active" : ""}`} onClick={() => controller.setRequestTab("headers")}>
                Headers
              </button>
              <button type="button" className={`tab-button${viewState.activeTab === "body" ? " active" : ""}`} onClick={() => controller.setRequestTab("body")}>
                Body
              </button>
            </div>
          </div>

          <div className="request-content">{draft ? renderRequestTab(viewState.activeTab, draft, controller) : <div className="empty-panel">请选择左侧请求或点击新建请求</div>}</div>
        </section>

        {helpOpen ? <HelpDialog onClose={onCloseHelp} /> : null}
      </main>

      <section className="response-viewer panel-surface">
        <div className="panel-title-row">
          <div>
            <h2>响应结果</h2>
          </div>
          <div id="response-summary" className="response-summary">
            {viewState.requestRunning ? (
              <span className="summary-pill neutral">请求中</span>
            ) : response ? (
              <>
                <span className={`summary-pill ${responseSummaryKind}`}>{response.status} {response.statusText}</span>
                <span className="summary-pill neutral">{response.meta.durationMs} ms</span>
                <span className="summary-pill neutral">{response.meta.sizeBytes} B</span>
              </>
            ) : (
              <span className="summary-pill neutral">等待请求</span>
            )}
          </div>
        </div>

        <div className="tab-strip" id="response-tabs">
          <button type="button" className={`tab-button${viewState.responseTab === "body" ? " active" : ""}`} onClick={() => controller.setResponseTab("body")}>
            Body
          </button>
          <button type="button" className={`tab-button${viewState.responseTab === "headers" ? " active" : ""}`} onClick={() => controller.setResponseTab("headers")}>
            Headers
          </button>
          <button type="button" className={`tab-button${viewState.responseTab === "meta" ? " active" : ""}`} onClick={() => controller.setResponseTab("meta")}>
            Meta
          </button>
          <button type="button" className={`tab-button${viewState.responseTab === "loadTest" ? " active" : ""}`} onClick={() => controller.setResponseTab("loadTest")}>
            压测结果
          </button>
        </div>

        <div className="response-content">{renderResponseTab(controller)}</div>
      </section>
    </div>
  );
}

function HelpDialog({ onClose }: { onClose?: () => void }): React.ReactElement {
  return (
    <div className="help-dialog-layer" onClick={onClose}>
      <div className="help-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="help-dialog-head">
          <div>
            <h3>HTTP Client 使用说明</h3>
            <p>当前界面采用三列工作台. 左侧选择, 中间编辑, 右侧查看结果.</p>
          </div>
          <button className="icon-button help-dialog-close" type="button" title="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="help-dialog-grid">
          <section className="help-card">
            <h4>常用流程</h4>
            <ul>
              <li>左侧点击请求, 中间直接编辑 URL, Header, Body.</li>
              <li>点击 `发送` 执行真实 HTTP 请求.</li>
              <li>需要复用请求时, 右键 `集合` 或请求项进行新建、复制、重命名、删除.</li>
              <li>环境变量在 `环境` 页编辑, 右键可保存环境、删除环境、新增变量.</li>
            </ul>
          </section>
          <section className="help-card">
            <h4>快捷键</h4>
            <ul>
              <li>`Ctrl/Cmd + Enter`: 发送请求</li>
              <li>`Ctrl/Cmd + S`: 保存当前请求</li>
            </ul>
          </section>
          <section className="help-card">
            <h4>右键菜单</h4>
            <ul>
              <li>`记录`: 打开最近记录, 复制 URL.</li>
              <li>`集合`: 新建请求, 新建集合, 请求收藏与复制.</li>
              <li>`环境`: 切换环境, 保存环境, 删除环境, 管理变量.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function renderRequestTab(
  activeTab: "params" | "headers" | "body",
  draft: NonNullable<WorkbenchController["viewState"]["draft"]>,
  controller: WorkbenchController
): React.ReactElement {
  if (activeTab === "params") {
    return renderKeyValueEditor("params", draft.params, "添加参数", controller);
  }

  if (activeTab === "headers") {
    return renderKeyValueEditor("headers", draft.headers, "添加请求头", controller);
  }

  const bodyVisible = draft.method !== "GET" && draft.method !== "DELETE";
  if (!bodyVisible) {
    return <div className="empty-panel">当前方法通常不发送 Body. 如需调试, 请切换到 POST / PUT / PATCH.</div>;
  }

  return (
    <div className="body-editor">
      <div className="body-toolbar">
        <select value={draft.bodyMode} onChange={(event) => controller.setBodyMode(event.target.value as never)}>
          <option value="none">none</option>
          <option value="raw">raw</option>
          <option value="json">json</option>
        </select>
        <button className="ghost-button" id="format-json-button" type="button" onClick={() => controller.formatJsonBody()}>
          格式化 JSON
        </button>
      </div>
      <textarea
        id="body-textarea"
        className="body-textarea"
        placeholder="请输入请求体"
        value={draft.bodyText}
        onChange={(event) => controller.setBodyText(event.target.value)}
      />
    </div>
  );
}

function renderKeyValueEditor(
  section: "params" | "headers",
  items: Array<{ id: string; key: string; value: string; enabled: boolean }>,
  actionText: string,
  controller: WorkbenchController
): React.ReactElement {
  return (
    <div className="kv-editor">
      <div className="kv-header">
        <span>启用</span>
        <span>Key</span>
        <span>Value</span>
        <span>操作</span>
      </div>
      {items.map((item) => (
        <div className="kv-row" key={item.id}>
          <label className="checkbox-cell">
            <input type="checkbox" checked={item.enabled} onChange={(event) => controller.updateKeyValue(section, item.id, "enabled", event.target.checked)} />
          </label>
          <input type="text" value={item.key} onChange={(event) => controller.updateKeyValue(section, item.id, "key", event.target.value)} />
          <input type="text" value={item.value} onChange={(event) => controller.updateKeyValue(section, item.id, "value", event.target.value)} />
          <button className="ghost-button" type="button" onClick={() => controller.removeKeyValue(section, item.id)}>
            删除
          </button>
        </div>
      ))}
      <button className="secondary-button add-row-button" type="button" onClick={() => controller.addKeyValue(section)}>
        {actionText}
      </button>
    </div>
  );
}

function renderResponseTab(controller: WorkbenchController): React.ReactElement {
  const { viewState, uiState } = controller;
  const response = viewState.response;

  if (viewState.responseTab === "loadTest") {
    const progress = viewState.loadTestProgress;
    const result = viewState.loadTestResult;
    const profile = viewState.loadTestProfile;
    const progressPercent = progress ? Math.min(100, Math.round((progress.completedRequests / Math.max(progress.totalRequests, 1)) * 100)) : 0;

    return (
      <div className="load-test-content">
        <div className="load-test-config-grid">
          <label className="field-block">
            <span>总请求数</span>
            <input type="number" min={1} value={profile.totalRequests} onChange={(event) => controller.setLoadTestProfileField("totalRequests", Number(event.target.value))} />
          </label>
          <label className="field-block">
            <span>并发数</span>
            <input type="number" min={1} value={profile.concurrency} onChange={(event) => controller.setLoadTestProfileField("concurrency", Number(event.target.value))} />
          </label>
          <label className="field-block">
            <span>超时 ms</span>
            <input type="number" min={1} value={profile.timeoutMs} onChange={(event) => controller.setLoadTestProfileField("timeoutMs", Number(event.target.value))} />
          </label>
        </div>
        <div className="load-test-actions">
          <button id="load-test-start-button" className="primary-button" type="button" onClick={controller.performLoadTest}>
            {progress?.running ? "运行中" : "开始压测"}
          </button>
          <button id="load-test-stop-button" className="ghost-button" type="button" onClick={controller.stopLoadTest}>
            停止
          </button>
        </div>
        {progress ? (
          <div className="progress-panel">
            <div className="progress-bar">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="progress-text">已完成 {progress.completedRequests} / {progress.totalRequests} , 成功 {progress.successCount} , 失败 {progress.failureCount}</div>
          </div>
        ) : (
          <div className="empty-state compact">尚未启动压测</div>
        )}
        {result ? (
          <div className="load-result">
            <div className="summary-grid">
              {[
                ["成功率", `${(result.successRate * 100).toFixed(2)}%`],
                ["平均耗时", `${result.averageDurationMs.toFixed(2)} ms`],
                ["P95", `${result.p95DurationMs} ms`],
                ["最大耗时", `${result.maxDurationMs} ms`],
                ["RPS", result.rps.toFixed(2)],
                ["总耗时", `${result.durationMs} ms`],
              ].map(([label, value]) => (
                <div className="metric-card" key={label}>
                  <span className="metric-label">{label}</span>
                  <span className="metric-value">{value}</span>
                </div>
              ))}
            </div>
            <div className="table-like">
              {result.statusCounts.map((item) => (
                <div className="table-row" key={item.status}>
                  <span className="table-cell key">{item.status}</span>
                  <span className="table-cell value">{item.count}</span>
                </div>
              ))}
            </div>
            <div className="error-samples">
              {result.errorSamples.length === 0 ? (
                <div className="empty-state compact">无错误样本</div>
              ) : (
                result.errorSamples.map((sample) => (
                  <div className="error-sample" key={`${sample.index}-${sample.message}`}>
                    #{sample.index} {sample.message} {sample.status ? `(${sample.status})` : ""}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (!response) {
    if (uiState.lastErrorMessage) {
      return (
        <div className="empty-panel error-panel">
          <strong>请求失败</strong>
          <span>{uiState.lastErrorMessage}</span>
        </div>
      );
    }

    return <div className="empty-panel">发送请求后在这里查看响应.</div>;
  }

  if (viewState.responseTab === "headers") {
    return (
      <div className="table-like headers-table">
        {response.headers.map((header) => (
          <div className="table-row" key={`${header.key}-${header.value}`}>
            <span className="table-cell key">{header.key}</span>
            <span className="table-cell value">{header.value}</span>
            <button className="ghost-button" type="button" onClick={() => void controller.copyHeaderValue(header.value)}>
              复制
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (viewState.responseTab === "meta") {
    const unresolved = response.meta.unresolvedVariables.length > 0 ? response.meta.unresolvedVariables.join(", ") : "无";
    const metaItems = [
      ["最终 URL", response.meta.finalUrl],
      ["耗时", `${response.meta.durationMs} ms`],
      ["响应大小", `${response.meta.sizeBytes} B`],
      ["开始时间", new Date(response.meta.startedAt).toLocaleString()],
      ["内容类型", response.meta.contentType || "未知"],
      ["重定向", response.meta.redirected ? "是" : "否"],
      ["未解析变量", unresolved],
    ];

    return (
      <div className="meta-grid">
        {metaItems.map(([label, value]) => (
          <div className="meta-item" key={label}>
            <span className="meta-label">{label}</span>
            <span className="meta-value">{value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="response-body-panel">
      <div className="response-tools">
        <input
          id="response-search-input"
          type="text"
          className="response-search-input"
          placeholder="搜索响应内容"
          value={uiState.responseSearch}
          onChange={(event) => controller.setResponseSearch(event.target.value)}
        />
        <button id="response-open-editor" className="ghost-button" type="button" onClick={controller.openResponseEditor}>
          编辑
        </button>
        <button id="response-toggle-mode" className="ghost-button" type="button" onClick={controller.toggleResponsePretty}>
          {uiState.responsePretty ? "切换 Raw" : "切换 原文"}
        </button>
        </div>
        <div className="response-code-shell">
          <button className="icon-button copy-response-button" type="button" title="复制响应内容" aria-label="复制响应内容" onClick={() => void controller.copyResponse()}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path d="M5.5 2.5h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm0 1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-6Z" fill="currentColor" />
            <path d="M3 4.5H2.5A1.5 1.5 0 0 0 1 6v6.5A1.5 1.5 0 0 0 2.5 14H9v-1H2.5a.5.5 0 0 1-.5-.5V6a.5.5 0 0 1 .5-.5H3v-1Z" fill="currentColor" />
          </svg>
          </button>
          <pre
            className={`response-code${uiState.responsePretty ? "" : " response-code-raw"}`}
            dangerouslySetInnerHTML={{ __html: controller.highlightedResponseHtml }}
          />
        </div>
      </div>
  );
}
