import * as path from "path";
import * as vscode from "vscode";
import { ToastService } from "../toast/service";

export class PathRangeCopier {
  constructor(private readonly toastService: ToastService) {}

  async copyRelativeRange(): Promise<string | undefined> {
    return this.copyPathRange(false);
  }

  async copyAbsoluteRange(): Promise<string | undefined> {
    return this.copyPathRange(true);
  }

  private async copyPathRange(useAbsolutePath: boolean): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await this.toastService.notify({
        kind: "warning",
        message: "未找到活动编辑器",
        source: "selection.copyPathRange",
      });
      return undefined;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
      await this.toastService.notify({
        kind: "warning",
        message: "请先选择文本",
        source: "selection.copyPathRange",
      });
      return undefined;
    }

    const lineRange = this.toLineRange(selection);
    if (!lineRange) {
      await this.toastService.notify({
        kind: "warning",
        message: "无法解析当前选区的行范围",
        source: "selection.copyPathRange",
      });
      return undefined;
    }

    let filePath: string;
    if (useAbsolutePath) {
      filePath = this.normalizePath(editor.document.uri.fsPath);
    } else {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
      if (!workspaceFolder) {
        filePath = this.normalizePath(editor.document.uri.fsPath);
        await this.toastService.notify({
          kind: "warning",
          message: "文件不在工作区内, 已回退为绝对路径",
          source: "selection.copyPathRange",
        });
      } else {
        filePath = this.normalizePath(path.relative(workspaceFolder.uri.fsPath, editor.document.uri.fsPath));
      }
    }

    const [startLine, endLine] = lineRange;
    const text = startLine === endLine ? `${filePath}:${startLine}` : `${filePath}:${startLine}-${endLine}`;

    await vscode.env.clipboard.writeText(text);
    await this.toastService.notify({
      kind: "success",
      message: `已复制: ${text}`,
      copyText: text,
      source: "selection.copyPathRange",
    });
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
