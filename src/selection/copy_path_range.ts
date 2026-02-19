import * as path from "path";
import * as vscode from "vscode";

export class PathRangeCopier {
  async copyRelativeRange(): Promise<string | undefined> {
    return this.copyPathRange(false);
  }

  async copyAbsoluteRange(): Promise<string | undefined> {
    return this.copyPathRange(true);
  }

  private async copyPathRange(useAbsolutePath: boolean): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor found");
      return undefined;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
      vscode.window.showWarningMessage("Please select text first");
      return undefined;
    }

    const lineRange = this.toLineRange(selection);
    if (!lineRange) {
      vscode.window.showWarningMessage("Failed to parse selected range");
      return undefined;
    }

    let filePath: string;
    if (useAbsolutePath) {
      filePath = this.normalizePath(editor.document.uri.fsPath);
    } else {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (!workspaceFolder) {
        filePath = this.normalizePath(editor.document.uri.fsPath);
        vscode.window.showWarningMessage("File is outside workspace. Fallback to absolute path");
      } else {
        filePath = this.normalizePath(path.relative(workspaceFolder.uri.fsPath, editor.document.uri.fsPath));
      }
    }

    const [startLine, endLine] = lineRange;
    const text = startLine === endLine ? `${filePath}:${startLine}` : `${filePath}:${startLine}-${endLine}`;

    await vscode.env.clipboard.writeText(text);
    vscode.window.showInformationMessage(`Copied: ${text}`);
    return text;
  }

  private toLineRange(selection: vscode.Selection): [number, number] | undefined {
    if (selection.isEmpty) {
      return undefined;
    }

    let startLine = selection.start.line + 1;
    let endLine = selection.end.line + 1;

    // Avoid counting one extra line when selection ends at the next line start.
    if (selection.end.character === 0 && selection.end.line > selection.start.line) {
      endLine -= 1;
    }

    if (endLine < startLine) {
      endLine = startLine;
    }

    return [startLine, endLine];
  }

  private normalizePath(inputPath: string): string {
    return inputPath.replace(/\\/g, "/");
  }
}
