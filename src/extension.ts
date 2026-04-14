import * as vscode from "vscode";
import { registerHttpClient } from "./http_client/register";
import { registerKeil } from "./keil/register";
import { registerSelection } from "./selection/register";
import { ToastService } from "./toast/service";

export function activate(context: vscode.ExtensionContext) {
  const channel = vscode.window.createOutputChannel("mx-dev-toolkit");
  const toastService = new ToastService(vscode.window);
  context.subscriptions.push(channel);
  context.subscriptions.push(toastService);

  channel.appendLine("Mx Dev Toolkit activated.");

  registerHttpClient(context, channel, toastService);
  registerKeil(context, channel, toastService);
  registerSelection(context, toastService);
}

export function deactivate() {}
