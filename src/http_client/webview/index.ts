import * as vscode from "vscode";
import { HttpClientViewState } from "../types";
import { renderRequestEditorShell } from "./ui/request_editor";
import { renderResponseViewerShell } from "./ui/response_viewer";
import { getWebviewScript } from "./state";
import { renderToolbarShell } from "./ui/toolbar";
import { HTTP_CLIENT_STYLES } from "./styles";

export function getHttpClientHtml(
  webview: vscode.Webview,
  initialState: HttpClientViewState,
  nonce: string
): string {
  return `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';"
      />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>HTTP Client</title>
      <style>${HTTP_CLIENT_STYLES}</style>
    </head>
    <body>
      <div class="app-shell">
        <main class="editor-shell">
          ${renderToolbarShell()}
          ${renderRequestEditorShell()}
          <div id="message-banner" class="message-banner"></div>
        </main>
        ${renderResponseViewerShell()}
      </div>
      ${getWebviewScript(initialState).replace("<script>", `<script nonce="${nonce}">`)}
    </body>
  </html>`;
}
