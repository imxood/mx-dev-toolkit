import path from "node:path";
import * as vscode from "vscode";
import { TOAST_HOST_MARKUP, TOAST_HOST_SCRIPT, TOAST_HOST_STYLES } from "../../toast/webview";
import { HTTP_CLIENT_WEBVIEW_BUILD_ID, type HttpClientViewState } from "../types";

type ReactSurface = "workbench" | "sidebar";

export function getReactWorkbenchHtml(
  webview: vscode.Webview,
  initialState: HttpClientViewState,
  nonce: string
): string {
  return createReactHtml(webview, {
    surface: "workbench",
    initialState,
    nonce,
  });
}

export function getReactSidebarHtml(
  webview: vscode.Webview,
  initialState: HttpClientViewState,
  nonce: string
): string {
  return createReactHtml(webview, {
    surface: "sidebar",
    initialState,
    nonce,
  });
}

function createReactHtml(
  webview: vscode.Webview,
  input: {
    surface: ReactSurface;
    initialState: HttpClientViewState;
    nonce: string;
  }
): string {
  const scriptUri = getWebviewAssetUri(webview, `${input.surface}.js`);
  const cssUri = getWebviewAssetUri(webview, `${input.surface}.css`);
  const bootstrap = serializeBootstrap({
    buildId: HTTP_CLIENT_WEBVIEW_BUILD_ID,
    surface: input.surface,
    initialState: input.initialState,
  });

  return `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${input.nonce}' ${webview.cspSource};"
      />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>HTTP Client</title>
      <link rel="stylesheet" href="${cssUri}" />
      <style>${TOAST_HOST_STYLES}</style>
    </head>
    <body>
      <div id="root"></div>
      ${TOAST_HOST_MARKUP}
      <script nonce="${input.nonce}">
        window.__MX_HTTP_CLIENT_BOOTSTRAP__ = ${bootstrap};
      </script>
      <script nonce="${input.nonce}">
        ${TOAST_HOST_SCRIPT}
      </script>
      <script type="module" src="${scriptUri}"></script>
    </body>
  </html>`;
}

function serializeBootstrap(input: {
  buildId: string;
  surface: ReactSurface;
  initialState: HttpClientViewState;
}): string {
  return JSON.stringify(input).replace(/</g, "\\u003c");
}

function getWebviewAssetUri(webview: vscode.Webview, name: string): string {
  const assetPath = path.resolve(__dirname, "../media/http_client", name);
  const fileUri =
    typeof vscode.Uri?.file === "function"
      ? vscode.Uri.file(assetPath)
      : {
          toString: () => assetPath,
        };

  if (typeof webview.asWebviewUri === "function") {
    return webview.asWebviewUri(fileUri as vscode.Uri).toString();
  }

  return fileUri.toString();
}
