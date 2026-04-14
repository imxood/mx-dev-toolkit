import * as vscode from "vscode";
import { HttpClientViewState } from "../types";
import { getReactWorkbenchHtml } from "./react_html";

export function getHttpClientHtml(
  webview: vscode.Webview,
  initialState: HttpClientViewState,
  nonce: string
): string {
  return getReactWorkbenchHtml(webview, initialState, nonce);
}
