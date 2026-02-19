import * as vscode from "vscode";
import { registerKeil } from "./keil/register";
import { registerSelection } from "./selection/register";

export function activate(context: vscode.ExtensionContext) {
  const channel = vscode.window.createOutputChannel("mx-dev-toolkit");
  context.subscriptions.push(channel);

  channel.appendLine("Mx Dev Toolkit activated.");

  registerKeil(context, channel);
  registerSelection(context);
}

export function deactivate() {}
