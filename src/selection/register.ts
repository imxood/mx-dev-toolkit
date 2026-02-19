import * as vscode from "vscode";
import { LineCountStatus } from "./line_count";
import { PathRangeCopier } from "./copy_path_range";

const CMD_COPY_RELATIVE_RANGE = "mx-dev-toolkit.selection.copyRelativeRange";
const CMD_COPY_ABSOLUTE_RANGE = "mx-dev-toolkit.selection.copyAbsoluteRange";

export function registerSelection(
  context: vscode.ExtensionContext
): void {
  const lineCountStatus = new LineCountStatus();
  const pathRangeCopier = new PathRangeCopier();

  context.subscriptions.push(
    lineCountStatus,
    vscode.window.onDidChangeTextEditorSelection((event) => {
      lineCountStatus.update(event.textEditor);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      lineCountStatus.update(editor);
    }),
    vscode.commands.registerCommand(CMD_COPY_RELATIVE_RANGE, () => pathRangeCopier.copyRelativeRange()),
    vscode.commands.registerCommand(CMD_COPY_ABSOLUTE_RANGE, () => pathRangeCopier.copyAbsoluteRange())
  );

  lineCountStatus.update(vscode.window.activeTextEditor);
}
