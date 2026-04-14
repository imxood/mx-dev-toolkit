import * as fs from "fs";
import path, { join } from "path";
import * as vscode from "vscode";
import dayjs from "dayjs";
import { writeCppProperties } from "./config_writer";
import {
  MX_DEV_CONFIG_FILE,
  parseKeilProject,
  readProjectFromConfigForLoad,
  readProjectFromConfigForRun,
} from "./parser";
import {
  KeilRunType,
  backupAndDeleteOutputBin,
  copyOutputBinToFolder,
  runKeil,
} from "./runner";
import { ToastService } from "../toast/service";

export class KeilService {
  project = "";
  targetName = "";
  device = "";
  cpu = "";
  outputName = "";

  workDir = "";
  vscodeRoot = "";

  running = false;
  readonly channel: vscode.OutputChannel;

  get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("mx-dev-toolkit");
  }

  get logPath(): string {
    return join(this.vscodeRoot, "uv4.log");
  }

  constructor(channel: vscode.OutputChannel, private readonly toastService: ToastService) {
    this.channel = channel;
  }

  async load(workDir: string): Promise<void> {
    this.resetProjectState();
    this.workDir = workDir;
    this.vscodeRoot = join(workDir, ".vscode");

    if (!fs.existsSync(this.vscodeRoot)) {
      fs.mkdirSync(this.vscodeRoot);
    }

    const projectPath = readProjectFromConfigForLoad(workDir);
    if (!projectPath) {
      return;
    }

    const parsed = await parseKeilProject(workDir, projectPath);
    this.applyParsedProject(parsed);
    writeCppProperties({
      vscodeRoot: this.vscodeRoot,
      includes: parsed.includes,
      defines: parsed.defines,
    });

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    this.channel.appendLine(`${now} C/C++ config updated`);
  }

  async generateConfig(): Promise<void> {
    if (!this.workDir) {
      await this.toastService.notify({
        kind: "error",
        message: `未打开工作区, 无法生成 ${MX_DEV_CONFIG_FILE}`,
        source: "keil.generateConfig",
      });
      return;
    }

    const configPath = join(this.workDir, MX_DEV_CONFIG_FILE);
    const workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(this.workDir));
    const pattern: string | vscode.RelativePattern = workspace
      ? new vscode.RelativePattern(workspace, "**/*.uvprojx")
      : "**/*.uvprojx";
    const files = await vscode.workspace.findFiles(pattern, "**/{node_modules,out,dist,eh_keil_tool/target}/**");

    if (files.length === 0) {
      await this.toastService.notify({
        kind: "error",
        message: "未找到 .uvprojx 工程文件",
        source: "keil.generateConfig",
      });
      return;
    }

    const items: Array<vscode.QuickPickItem & { relative: string }> = files.map((file) => {
      const relative = path.relative(this.workDir, file.fsPath).replace(/\\/g, "/");
      return { label: relative, relative };
    });

    const selected = items.length === 1
      ? items[0]
      : await vscode.window.showQuickPick(items, { placeHolder: "Select a Keil project to generate config" });

    if (!selected) {
      return;
    }

    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          project: selected.relative,
        },
        null,
        2
      )
    );

    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    this.channel.show();
    this.channel.appendLine(`${now} Generated ${MX_DEV_CONFIG_FILE}`);
    await this.load(this.workDir);
  }

  async build(): Promise<void> {
    backupAndDeleteOutputBin(this.project, this.outputName);
    await this.runKeil("build");
  }

  async rebuild(): Promise<void> {
    backupAndDeleteOutputBin(this.project, this.outputName);
    await this.runKeil("rebuild");
  }

  async clean(): Promise<void> {
    await this.runKeil("clean");
  }

  private async runKeil(runName: KeilRunType): Promise<void> {
    try {
      await this.refreshParsedProjectForRun();
    } catch (error) {
      await this.toastService.notify({
        kind: "error",
        message: (error as Error).message,
        source: "keil.run",
      });
      return;
    }

    const uv4Exe = this.config.get("Uv4Path") as string;
    if (!uv4Exe || !fs.existsSync(uv4Exe)) {
      await this.toastService.notify({
        kind: "error",
        message: `UV4.exe 未找到: ${uv4Exe}`,
        copyText: uv4Exe || "",
        source: "keil.run",
      });
      return;
    }

    await runKeil({
      uv4Exe,
      projectPath: this.project,
      targetName: this.targetName,
      runName,
      logPath: this.logPath,
      channel: this.channel,
      device: this.device,
      cpu: this.cpu,
    });
    copyOutputBinToFolder(this.project, this.outputName, this.vscodeRoot);
  }

  private async refreshParsedProjectForRun(): Promise<void> {
    if (!this.workDir) {
      throw new Error("No workspace opened. Open a folder containing mx_dev.json first");
    }

    const projectPath = readProjectFromConfigForRun(this.workDir);
    const parsed = await parseKeilProject(this.workDir, projectPath);
    this.applyParsedProject(parsed);
    writeCppProperties({
      vscodeRoot: this.vscodeRoot,
      includes: parsed.includes,
      defines: parsed.defines,
    });
  }

  private applyParsedProject(parsed: Awaited<ReturnType<typeof parseKeilProject>>): void {
    this.project = parsed.projectPath;
    this.targetName = parsed.targetName;
    this.device = parsed.device;
    this.cpu = parsed.cpu;
    this.outputName = parsed.outputName;
  }

  private resetProjectState(): void {
    this.project = "";
    this.targetName = "";
    this.device = "";
    this.cpu = "";
    this.outputName = "";
  }
}
