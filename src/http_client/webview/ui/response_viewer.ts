import { renderLoadTestShell } from "./load_test_view";

export function renderResponseViewerShell(): string {
  return `
    <section class="response-viewer panel-surface">
      <div class="panel-title-row">
        <div>
          <span class="section-kicker">Response</span>
          <h2>响应结果</h2>
        </div>
        <div id="response-summary" class="response-summary"></div>
      </div>
      <div class="tab-strip" id="response-tabs">
        <button type="button" class="tab-button" data-tab-group="response" data-tab="body">Body</button>
        <button type="button" class="tab-button" data-tab-group="response" data-tab="headers">Headers</button>
        <button type="button" class="tab-button" data-tab-group="response" data-tab="meta">Meta</button>
        <button type="button" class="tab-button" data-tab-group="response" data-tab="loadTest">压测结果</button>
      </div>
      <div id="response-tab-content" class="response-content"></div>
      <template id="load-test-template">
        ${renderLoadTestShell()}
      </template>
    </section>
  `;
}
