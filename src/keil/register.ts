import * as path from "path";
import * as vscode from "vscode";
import { KeilService } from "./keil";

const CMD_KEIL_BUILD = "mx-dev-toolkit.keil.build";
const CMD_KEIL_REBUILD = "mx-dev-toolkit.keil.rebuild";
const CMD_KEIL_CLEAN = "mx-dev-toolkit.keil.clean";
const CMD_KEIL_GEN_CONFIG = "mx-dev-toolkit.keil.generateConfig";
const MX_DEV_CONFIG_FILE = "mx_dev.json";

export function registerKeil(context: vscode.ExtensionContext, channel: vscode.OutputChannel): void {
  const keil = new KeilService(channel);
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (workspace) {
    void keil.load(workspace.uri.fsPath);
  }

  const runWithLock = async (action: () => Promise<void>) => {
    if (keil.running) {
      vscode.window.showWarningMessage("A task is already running. Please wait...");
      return;
    }
    keil.running = true;
    try {
      await action();
    } finally {
      keil.running = false;
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      const fileName = path.basename(document.fileName).toLowerCase();
      if (fileName !== MX_DEV_CONFIG_FILE) {
        return;
      }
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspaceFolder) {
        return;
      }
      const workDir = workspaceFolder.uri.fsPath;
      if (keil.workDir === workDir) {
        channel.show();
        channel.appendLine(`[Command] mx keil load (${MX_DEV_CONFIG_FILE})`);
        void keil.load(workDir);
      }
    }),
    vscode.commands.registerCommand(CMD_KEIL_GEN_CONFIG, () =>
      runWithLock(async () => {
        channel.show();
        channel.appendLine("[Command] mx keil gen config");
        await keil.generateConfig();
      })
    ),
    vscode.commands.registerCommand(CMD_KEIL_BUILD, () =>
      runWithLock(async () => {
        channel.show();
        channel.appendLine("[Command] mx keil build");
        await keil.build();
      })
    ),
    vscode.commands.registerCommand(CMD_KEIL_REBUILD, () =>
      runWithLock(async () => {
        channel.show();
        channel.appendLine("[Command] mx keil rebuild");
        await keil.rebuild();
      })
    ),
    vscode.commands.registerCommand(CMD_KEIL_CLEAN, () =>
      runWithLock(async () => {
        channel.show();
        channel.appendLine("[Command] mx keil clean");
        await keil.clean();
      })
    )
  );
}
