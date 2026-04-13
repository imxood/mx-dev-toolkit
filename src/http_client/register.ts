import * as vscode from "vscode";
import { HttpClientPanelController } from "./panel";
import { HttpClientSidebarProvider } from "./sidebar_view";
import { HttpClientStore } from "./store";

const CMD_HTTP_OPEN = "mx-dev-toolkit.httpClient.openWorkbench";
const CMD_HTTP_SEND = "mx-dev-toolkit.httpClient.sendCurrent";
const CMD_HTTP_SAVE = "mx-dev-toolkit.httpClient.saveCurrent";
const CMD_HTTP_IMPORT_CURL = "mx-dev-toolkit.httpClient.importCurl";
const CMD_HTTP_LOAD_TEST = "mx-dev-toolkit.httpClient.runLoadTest";

export function registerHttpClient(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel
): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    channel.appendLine("[HttpClient] no workspace folder found, register skipped.");
    return;
  }

  const store = new HttpClientStore(workspaceRoot, context.workspaceState);
  const controller = new HttpClientPanelController(context, channel, store);
  const sidebarProvider = new HttpClientSidebarProvider(controller);

  context.subscriptions.push(
    controller,
    sidebarProvider,
    vscode.window.registerWebviewViewProvider("mx-dev-toolkit-httpClientLauncher", sidebarProvider, {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
    }),
    vscode.commands.registerCommand(CMD_HTTP_OPEN, async () => {
      channel.show();
      channel.appendLine("[HttpClient] open workbench");
      await controller.show();
    }),
    vscode.commands.registerCommand(CMD_HTTP_SEND, async () => {
      channel.show();
      channel.appendLine("[HttpClient] command send current");
      await controller.triggerCommand("send");
    }),
    vscode.commands.registerCommand(CMD_HTTP_SAVE, async () => {
      channel.show();
      channel.appendLine("[HttpClient] command save current");
      await controller.triggerCommand("save");
    }),
    vscode.commands.registerCommand(CMD_HTTP_IMPORT_CURL, async () => {
      channel.show();
      channel.appendLine("[HttpClient] command import curl");
      await controller.triggerCommand("focusCurlImport");
    }),
    vscode.commands.registerCommand(CMD_HTTP_LOAD_TEST, async () => {
      channel.show();
      channel.appendLine("[HttpClient] command load test");
      await controller.triggerCommand("loadTest");
    })
  );
}
