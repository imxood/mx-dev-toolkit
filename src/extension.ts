import * as vscode from "vscode";
import { registerHttpClient } from "./http_client/register";
import { registerKeil } from "./keil/register";
import { registerSelection } from "./selection/register";

export function activate(context: vscode.ExtensionContext) {
  const channel = vscode.window.createOutputChannel("mx-dev-toolkit");
  context.subscriptions.push(channel);

  channel.appendLine("Mx Dev Toolkit activated.");

  registerHttpClient(context, channel);
  registerKeil(context, channel);
  registerSelection(context);
}

export function deactivate() {}
