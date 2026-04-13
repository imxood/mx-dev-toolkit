export function renderToolbarShell(): string {
  return `
    <section class="http-toolbar">
      <div class="toolbar-heading">
        <div class="toolbar-heading-copy">
          <span class="section-kicker">Editor</span>
          <div class="toolbar-title-row">
            <h2>请求编辑</h2>
            <span class="toolbar-shortcut">Ctrl+Enter 发送</span>
          </div>
        </div>
        <div class="toolbar-meta">
          <span id="dirty-indicator" class="dirty-indicator"></span>
          <span id="request-hint" class="request-hint"></span>
        </div>
      </div>
      <div class="toolbar-main">
        <select id="method-select" class="toolbar-method" aria-label="HTTP Method"></select>
        <input id="url-input" class="toolbar-url" type="text" placeholder="请输入请求 URL" />
        <select id="environment-select" class="toolbar-env" aria-label="环境"></select>
      </div>
      <div class="toolbar-actions">
        <button id="send-button" class="primary-button" type="button">发送</button>
        <button id="load-test-button" class="secondary-button" type="button">压测</button>
        <button id="save-button" class="secondary-button" type="button">保存</button>
        <button id="import-curl-button" class="ghost-button" type="button">导入 cURL</button>
      </div>
    </section>
  `;
}
