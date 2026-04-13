export const HTTP_CLIENT_STYLES = `
  :root {
    color-scheme: light dark;
    --app-bg: var(--vscode-editor-background, #1e1e1e);
    --surface: var(--vscode-editorWidget-background, var(--app-bg));
    --surface-alt: var(--vscode-panel-background, var(--app-bg));
    --border: var(--vscode-panel-border, rgba(128, 128, 128, 0.32));
    --border-soft: var(--vscode-widget-border, rgba(128, 128, 128, 0.18));
    --input-bg: var(--vscode-input-background, rgba(255, 255, 255, 0.04));
    --input-border: var(--vscode-input-border, rgba(128, 128, 128, 0.32));
    --hover-bg: var(--vscode-list-hoverBackground, rgba(255, 255, 255, 0.05));
    --active-bg: var(--vscode-list-activeSelectionBackground, rgba(255, 255, 255, 0.08));
    --focus: var(--vscode-focusBorder, #007fd4);
    --button-bg: var(--vscode-button-background, #0e639c);
    --button-hover: var(--vscode-button-hoverBackground, #1177bb);
    --button-fg: var(--vscode-button-foreground, #ffffff);
    --button-secondary-bg: var(--vscode-button-secondaryBackground, rgba(255, 255, 255, 0.06));
    --button-secondary-fg: var(--vscode-button-secondaryForeground, var(--vscode-foreground, #cccccc));
    --text: var(--vscode-foreground, #cccccc);
    --muted: var(--vscode-descriptionForeground, #9a9a9a);
    --soft: var(--vscode-disabledForeground, #757575);
    --success: #73c991;
    --warning: #d7ba7d;
    --danger: #f48771;
    --radius: 4px;
    --space-1: 4px;
    --space-2: 6px;
    --space-3: 8px;
    --space-4: 10px;
    --space-5: 12px;
    --control-height: 28px;
    --input-height: 32px;
    --font-ui: "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif;
    --font-code: var(--vscode-editor-font-family, "Cascadia Code", Consolas, monospace);
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
    background: var(--app-bg);
    color: var(--text);
    font: 13px/1.45 var(--font-ui);
  }

  body {
    min-height: 100vh;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  .app-shell {
    display: grid;
    grid-template-columns: minmax(560px, 1.15fr) minmax(380px, 0.85fr);
    gap: var(--space-3);
    width: 100%;
    height: 100vh;
    padding: var(--space-3);
    background: var(--app-bg);
  }

  .editor-shell {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: var(--space-3);
    min-width: 0;
    min-height: 0;
  }

  .http-toolbar,
  .panel-surface {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    min-height: 0;
    padding: var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }

  .request-editor,
  .response-viewer {
    overflow: auto;
  }

  .response-viewer {
    height: calc(100vh - 16px);
  }

  .toolbar-heading,
  .toolbar-title-row,
  .toolbar-actions,
  .toolbar-meta,
  .panel-title-row,
  .body-toolbar,
  .response-tools,
  .load-test-actions,
  .response-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .toolbar-heading,
  .panel-title-row,
  .body-toolbar,
  .response-tools {
    justify-content: space-between;
  }

  .toolbar-heading {
    align-items: flex-start;
  }

  .toolbar-title-row,
  .toolbar-actions,
  .toolbar-meta,
  .response-summary,
  .response-tools,
  .load-test-actions,
  .body-toolbar {
    flex-wrap: wrap;
  }

  .toolbar-heading-copy,
  .panel-title-row > div:first-child {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .section-kicker {
    display: inline-flex;
    align-items: center;
    min-height: 14px;
    color: var(--soft);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .toolbar-heading-copy h2,
  .panel-title-row h2,
  h3 {
    margin: 0;
    color: var(--text);
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .toolbar-heading-copy h2,
  .panel-title-row h2 {
    font-size: 13px;
    line-height: 1.3;
  }

  h3 {
    font-size: 12px;
    line-height: 1.3;
  }

  .toolbar-shortcut {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 6px;
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    background: var(--surface-alt);
    color: var(--soft);
    font-size: 11px;
  }

  .toolbar-meta {
    margin-left: auto;
    justify-content: flex-end;
    color: var(--muted);
    font-size: 11px;
  }

  .toolbar-main {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr) 150px;
    gap: var(--space-2);
  }

  .dirty-indicator {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--soft);
    font-weight: 600;
  }

  .dirty-indicator::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .dirty-indicator.dirty {
    color: var(--warning);
  }

  .request-hint,
  .toolbar-url,
  .response-code,
  .meta-value {
    font-family: var(--font-code);
  }

  .request-hint {
    max-width: 280px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  select,
  input[type="text"],
  input[type="number"],
  textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--input-border);
    border-radius: var(--radius);
    outline: none;
    background: var(--input-bg);
    color: var(--text);
    transition: border-color 120ms ease, box-shadow 120ms ease, background-color 120ms ease;
  }

  select,
  input[type="text"],
  input[type="number"] {
    height: var(--input-height);
    padding: 0 10px;
  }

  textarea {
    min-height: 220px;
    padding: 8px 10px;
    resize: vertical;
    line-height: 1.5;
  }

  select:focus,
  input:focus,
  textarea:focus {
    border-color: var(--focus);
    box-shadow: inset 0 0 0 1px var(--focus);
  }

  input[type="checkbox"] {
    width: 14px;
    height: 14px;
    accent-color: var(--focus);
  }

  .primary-button,
  .secondary-button,
  .ghost-button,
  .icon-button,
  .tab-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    height: var(--control-height);
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text);
    white-space: nowrap;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
  }

  .primary-button:focus-visible,
  .secondary-button:focus-visible,
  .ghost-button:focus-visible,
  .icon-button:focus-visible,
  .tab-button:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: 1px;
  }

  .primary-button {
    background: var(--button-bg);
    color: var(--button-fg);
    font-weight: 600;
  }

  .primary-button:hover {
    background: var(--button-hover);
  }

  .secondary-button {
    border-color: var(--input-border);
    background: var(--button-secondary-bg);
    color: var(--button-secondary-fg);
  }

  .secondary-button:hover,
  .ghost-button:hover,
  .icon-button:hover,
  .tab-button:hover {
    background: var(--hover-bg);
    color: var(--text);
  }

  .ghost-button,
  .icon-button,
  .tab-button {
    border-color: var(--input-border);
    color: var(--muted);
    background: var(--surface-alt);
  }

  .icon-button {
    width: 24px;
    min-width: 24px;
    height: 24px;
    padding: 0;
  }

  .panel-title-row {
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--border);
  }

  .tab-strip {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .tab-button {
    height: 26px;
    padding: 0 8px;
    border-color: transparent;
    background: transparent;
  }

  .tab-button.active {
    border-color: var(--focus);
    background: var(--active-bg);
    color: var(--text);
  }

  .request-content,
  .response-content,
  .kv-editor,
  .body-editor,
  .load-test-content,
  .load-result,
  .error-samples,
  .load-test-shell {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
    flex: 1;
  }

  .kv-header,
  .kv-row {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) minmax(0, 1fr) 66px;
    gap: var(--space-2);
    align-items: center;
  }

  .kv-header {
    padding: 0 6px;
    color: var(--muted);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .kv-row {
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-alt);
  }

  .checkbox-cell {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .add-row-button {
    align-self: flex-start;
  }

  .body-toolbar select {
    width: 120px;
  }

  .body-textarea,
  .response-code {
    flex: 1;
  }

  .response-search-input {
    max-width: 240px;
  }

  .response-code {
    margin: 0;
    min-height: 220px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--input-bg);
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.5;
  }

  .method-pill,
  .summary-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 48px;
    height: 20px;
    padding: 0 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .method-get {
    color: var(--success);
    background: rgba(115, 201, 145, 0.16);
  }

  .method-post {
    color: #75beff;
    background: rgba(117, 190, 255, 0.16);
  }

  .method-put,
  .method-patch {
    color: var(--warning);
    background: rgba(215, 186, 125, 0.16);
  }

  .method-delete {
    color: var(--danger);
    background: rgba(244, 135, 113, 0.16);
  }

  .summary-pill.success {
    color: var(--success);
    background: rgba(115, 201, 145, 0.16);
  }

  .summary-pill.warning {
    color: var(--warning);
    background: rgba(215, 186, 125, 0.16);
  }

  .summary-pill.neutral {
    color: var(--muted);
    background: var(--surface-alt);
    border: 1px solid var(--border);
  }

  .table-like,
  .meta-grid,
  .summary-grid,
  .load-test-config-grid {
    display: grid;
    gap: var(--space-2);
  }

  .table-row {
    display: grid;
    grid-template-columns: minmax(120px, 160px) minmax(0, 1fr);
    gap: var(--space-2);
    align-items: center;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-alt);
  }

  .headers-table .table-row {
    grid-template-columns: minmax(120px, 160px) minmax(0, 1fr) 56px;
  }

  .table-cell,
  .meta-label,
  .metric-label,
  .field-block > span:first-child,
  .progress-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .table-cell.key,
  .meta-label,
  .metric-label,
  .field-block > span:first-child,
  .progress-text {
    color: var(--muted);
  }

  .meta-grid,
  .summary-grid,
  .load-test-config-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .meta-item,
  .metric-card,
  .field-block,
  .progress-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-alt);
  }

  .metric-value {
    font-size: 15px;
    font-weight: 600;
  }

  .progress-bar {
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: var(--hover-bg);
    overflow: hidden;
  }

  .progress-bar span {
    display: block;
    height: 100%;
    background: var(--button-bg);
  }

  .error-sample {
    padding: 6px 8px;
    border: 1px solid rgba(244, 135, 113, 0.28);
    border-radius: var(--radius);
    background: rgba(244, 135, 113, 0.08);
  }

  .message-banner {
    min-height: 18px;
    padding: 0 2px;
    color: var(--muted);
    font-size: 12px;
  }

  .message-banner.success {
    color: var(--success);
  }

  .message-banner.warning {
    color: var(--warning);
  }

  .empty-panel,
  .empty-state {
    padding: var(--space-5);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    color: var(--muted);
    text-align: center;
    font-size: 12px;
  }

  .error-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: flex-start;
    text-align: left;
    border-style: solid;
    border-color: rgba(244, 135, 113, 0.3);
    background: rgba(244, 135, 113, 0.06);
    color: var(--danger);
  }

  .error-panel strong {
    color: var(--danger);
    font-size: 12px;
  }

  .error-panel span {
    color: var(--text);
    line-height: 1.5;
  }

  .empty-state.compact {
    padding: var(--space-3);
  }

  mark {
    padding: 0 1px;
    border-radius: 2px;
    background: rgba(215, 186, 125, 0.25);
    color: inherit;
  }

  @media (max-width: 1200px) {
    .app-shell {
      grid-template-columns: 1fr;
      height: auto;
      min-height: 100vh;
    }

    html,
    body {
      overflow: auto;
    }

    .response-viewer {
      height: auto;
      min-height: 420px;
    }

    .toolbar-main,
    .meta-grid,
    .summary-grid,
    .load-test-config-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .http-toolbar,
    .panel-surface {
      padding: var(--space-3);
    }

    .toolbar-heading {
      flex-direction: column;
    }

    .toolbar-meta {
      margin-left: 0;
      justify-content: flex-start;
    }

    .kv-header {
      display: none;
    }

    .kv-row {
      grid-template-columns: 40px minmax(0, 1fr);
    }

    .kv-row > :nth-child(3),
    .kv-row > :nth-child(4) {
      grid-column: 2 / -1;
    }

    .headers-table .table-row,
    .table-row {
      grid-template-columns: 1fr;
    }
  }
`;
