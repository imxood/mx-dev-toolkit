import { randomUUID } from "crypto";
import * as vscode from "vscode";
import { HttpClientPanelController } from "./panel";
import type { HttpClientViewState } from "./types";
import { ToastService } from "../toast/service";
import type { ToastToWebviewMessage } from "../toast/types";
import { getReactSidebarHtml } from "./webview/react_html";

type SidebarMessage =
  | { type: "httpClientSidebar/init" }
  | { type: "httpClientSidebar/createRequest"; payload?: { collectionId?: string | null } }
  | { type: "httpClientSidebar/createCollection" }
  | { type: "httpClientSidebar/createEnvironment" }
  | { type: "httpClientSidebar/selectRequest"; payload: { requestId: string } }
  | { type: "httpClientSidebar/selectHistory"; payload: { historyId: string } }
  | { type: "httpClientSidebar/selectEnvironment"; payload: { environmentId: string | null } };

type SidebarOutboundMessage = {
  type: "httpClientSidebar/state";
  payload: HttpClientViewState;
} | ToastToWebviewMessage;

export class HttpClientSidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "mx-dev-toolkit-httpClientLauncher";

  private view: vscode.WebviewView | null = null;
  private readonly stateChangeDisposable: vscode.Disposable;
  private readonly toastHostDisposable: { dispose(): void };
  private viewReady = false;

  constructor(
    private readonly controller: HttpClientPanelController,
    private readonly toastService: ToastService
  ) {
    this.stateChangeDisposable = this.controller.onDidChangeState(() => {
      void this.postState();
    });
    this.toastHostDisposable = this.toastService.registerHost({
      id: "httpClient.sidebar",
      priority: 50,
      isAvailable: () => Boolean(this.view && this.view.visible && this.viewReady),
      postToast: async (toast) => {
        if (!this.view) {
          return false;
        }
        return this.view.webview.postMessage({
          type: "mxToast/show",
          payload: toast,
        });
      },
    });
  }

  public dispose(): void {
    this.stateChangeDisposable.dispose();
    this.toastHostDisposable.dispose();
  }

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    this.viewReady = false;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.html = getSidebarHtml(webviewView.webview, await this.controller.getViewState(), createNonce());
    webviewView.webview.onDidReceiveMessage(
      (message: SidebarMessage) => {
        void this.handleMessage(message);
      },
      undefined
    );
    webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.view = null;
        this.viewReady = false;
      }
    });
    await this.postState();
  }

  private async handleMessage(message: SidebarMessage): Promise<void> {
    switch (message.type) {
      case "httpClientSidebar/init":
        this.viewReady = true;
        await this.postState();
        return;
      case "httpClientSidebar/createRequest":
        await this.controller.createRequest(message.payload?.collectionId ?? null);
        return;
      case "httpClientSidebar/createCollection":
        await this.controller.createCollection();
        return;
      case "httpClientSidebar/createEnvironment":
        await this.controller.createEnvironment();
        return;
      case "httpClientSidebar/selectRequest":
        await this.controller.openRequest(message.payload.requestId);
        return;
      case "httpClientSidebar/selectHistory":
        await this.controller.openHistory(message.payload.historyId);
        return;
      case "httpClientSidebar/selectEnvironment":
        await this.controller.selectEnvironment(message.payload.environmentId);
        return;
      default:
        return;
    }
  }

  private async postState(): Promise<void> {
    if (!this.view) {
      return;
    }
    const message: SidebarOutboundMessage = {
      type: "httpClientSidebar/state",
      payload: await this.controller.getViewState(),
    };
    await this.view.webview.postMessage(message);
  }
}

function createNonce(): string {
  return randomUUID().replace(/-/g, "");
}

export function getSidebarHtml(
  webview: vscode.Webview,
  initialState: HttpClientViewState,
  nonce: string
): string {
  return getReactSidebarHtml(webview, initialState, nonce);
}
