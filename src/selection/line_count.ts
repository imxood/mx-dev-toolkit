import * as vscode from "vscode";

export class LineCountStatus implements vscode.Disposable {
  private readonly statusBar: vscode.StatusBarItem;

  constructor() {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
    this.statusBar.name = "Mx Dev Toolkit Selection";
    this.statusBar.tooltip = "Total selected lines in the active editor";
  }

  dispose(): void {
    this.statusBar.dispose();
  }

  update(editor?: vscode.TextEditor): void {
    if (!editor) {
      this.statusBar.hide();
      return;
    }

    const totalLines = this.getSelectedLineCount(editor.selections);
    if (totalLines <= 0) {
      this.statusBar.hide();
      return;
    }

    this.statusBar.text = `Selected ${totalLines} lines`;
    this.statusBar.show();
  }

  private getSelectedLineCount(selections: readonly vscode.Selection[]): number {
    const ranges = selections
      .map((selection) => this.toLineRange(selection))
      .filter((range): range is [number, number] => Boolean(range))
      .sort((a, b) => a[0] - b[0]);

    if (ranges.length === 0) {
      return 0;
    }

    let total = 0;
    let [currentStart, currentEnd] = ranges[0];
    for (let i = 1; i < ranges.length; i++) {
      const [start, end] = ranges[i];
      if (start <= currentEnd + 1) {
        currentEnd = Math.max(currentEnd, end);
      } else {
        total += currentEnd - currentStart + 1;
        currentStart = start;
        currentEnd = end;
      }
    }
    total += currentEnd - currentStart + 1;
    return total;
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
}
