export function renderRequestEditorShell(): string {
  return `
    <section class="request-editor panel-surface">
      <div class="panel-title-row">
        <div>
          <span class="section-kicker">Request</span>
          <h2>请求配置</h2>
        </div>
        <div class="tab-strip" id="request-tabs">
          <button type="button" class="tab-button" data-tab-group="request" data-tab="params">Params</button>
          <button type="button" class="tab-button" data-tab-group="request" data-tab="headers">Headers</button>
          <button type="button" class="tab-button" data-tab-group="request" data-tab="body">Body</button>
        </div>
      </div>
      <div id="request-tab-content" class="request-content"></div>
    </section>
  `;
}
