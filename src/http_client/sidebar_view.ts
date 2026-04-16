import { randomUUID } from "crypto";
import * as vscode from "vscode";
import { HttpClientPanelController } from "./panel";

type LauncherMessage =
  | { type: "httpClientLauncher/openWorkbench" }
  | { type: "httpClientLauncher/createRequest" }
  | { type: "httpClientLauncher/importCurl" };

export class HttpClientSidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "mx-dev-toolkit-httpClientLauncher";

  private view: vscode.WebviewView | null = null;

  constructor(private readonly controller: HttpClientPanelController) {}

  public dispose(): void {
    this.view = null;
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.html = getSidebarHtml(webviewView.webview, createNonce());
    webviewView.webview.onDidReceiveMessage(
      (message: LauncherMessage) => {
        void this.handleMessage(message);
      },
      undefined
    );
    webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.view = null;
      }
    });
  }

  private async handleMessage(message: LauncherMessage): Promise<void> {
    switch (message.type) {
      case "httpClientLauncher/openWorkbench":
        await this.controller.show();
        return;
      case "httpClientLauncher/createRequest":
        await this.controller.createRequest(null);
        return;
      case "httpClientLauncher/importCurl":
        await this.controller.triggerCommand("focusCurlImport");
        return;
      default:
        return;
    }
  }
}

function createNonce(): string {
  return randomUUID().replace(/-/g, "");
}

export function getSidebarHtml(webview: vscode.Webview, nonce: string): string {
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HTTP Client</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: var(--vscode-sideBar-background, #181818);
        --surface: var(--vscode-sideBarSectionHeader-background, rgba(255, 255, 255, 0.03));
        --border: var(--vscode-sideBar-border, rgba(128, 128, 128, 0.22));
        --text: var(--vscode-sideBar-foreground, var(--vscode-foreground, #cccccc));
        --muted: var(--vscode-descriptionForeground, #8f8f8f);
        --button-bg: var(--vscode-button-background, #0e639c);
        --button-hover: var(--vscode-button-hoverBackground, #1177bb);
        --button-fg: var(--vscode-button-foreground, #ffffff);
        --input-border: var(--vscode-input-border, rgba(128, 128, 128, 0.3));
        --radius: 6px;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
      }

      body {
        background: var(--bg);
        color: var(--text);
        font: 12px/1.45 "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", sans-serif;
      }

      .launcher-shell {
        display: grid;
        grid-template-rows: auto auto 1fr;
        gap: 10px;
        width: 100%;
        height: 100%;
        padding: 12px 10px 10px;
      }

      .launcher-card {
        display: grid;
        gap: 10px;
        padding: 12px;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface);
      }

      .launcher-kicker {
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .launcher-title {
        font-size: 15px;
        font-weight: 700;
      }

      .launcher-copy {
        color: var(--muted);
      }

      .action-stack {
        display: grid;
        gap: 8px;
      }

      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 30px;
        width: 100%;
        border: 1px solid var(--input-border);
        border-radius: var(--radius);
        background: transparent;
        color: var(--text);
        font: inherit;
        cursor: pointer;
      }

      button.primary {
        border-color: transparent;
        background: var(--button-bg);
        color: var(--button-fg);
        font-weight: 600;
      }

      button.primary:hover {
        background: var(--button-hover);
      }

      button.secondary:hover {
        background: rgba(255, 255, 255, 0.05);
      }

      .launcher-tip {
        align-self: end;
        color: var(--muted);
        font-size: 11px;
      }
    </style>
  </head>
  <body>
    <div class="launcher-shell">
      <div class="launcher-card">
        <div class="launcher-kicker">HTTP Client</div>
        <div class="launcher-title">打开完整工作台</div>
        <div class="launcher-copy">左侧列表, 请求编辑, 响应结果和压测都已收敛到同一个页面中.</div>
      </div>

      <div class="action-stack">
        <button id="open-workbench" class="primary" type="button">打开 HTTP Client</button>
        <button id="create-request" class="secondary" type="button">新建 HTTP 连接</button>
        <button id="import-curl" class="secondary" type="button">导入 cURL</button>
      </div>

      <div class="launcher-tip">建议在完整工作台中完成高频操作, 以获得更快的交互体验.</div>
    </div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      document.getElementById("open-workbench")?.addEventListener("click", () => {
        vscode.postMessage({ type: "httpClientLauncher/openWorkbench" });
      });
      document.getElementById("create-request")?.addEventListener("click", () => {
        vscode.postMessage({ type: "httpClientLauncher/createRequest" });
      });
      document.getElementById("import-curl")?.addEventListener("click", () => {
        vscode.postMessage({ type: "httpClientLauncher/importCurl" });
      });
    </script>
  </body>
</html>`;
}
