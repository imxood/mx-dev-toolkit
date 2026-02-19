import * as fs from "fs";
import path, { join } from "path";
import { exec } from "child_process";
import * as vscode from "vscode";

export type KeilRunType = "build" | "rebuild" | "clean";

interface RunKeilOptions {
  uv4Exe: string;
  projectPath: string;
  targetName: string;
  runName: KeilRunType;
  logPath: string;
  channel: vscode.OutputChannel;
  device: string;
  cpu: string;
}

const RUN_TYPE_ARG_MAP: Record<KeilRunType, string> = {
  build: "b",
  rebuild: "r",
  clean: "c",
};

export function backupAndDeleteOutputBin(projectPath: string, outputName: string): void {
  if (!projectPath || !outputName) {
    return;
  }

  const projectDir = path.resolve(projectPath, "..");
  const source = join(projectDir, `${outputName}.bin`);
  const backupFile = join(projectDir, `${outputName}.1.bin`);

  if (fs.existsSync(source)) {
    fs.copyFileSync(source, backupFile);
    fs.unlinkSync(source);
  }
}

export function copyOutputBinToFolder(projectPath: string, outputName: string, targetFolder: string): void {
  if (!projectPath || !outputName || !targetFolder) {
    return;
  }

  const targetFile = `${outputName}.bin`;
  const source = join(path.resolve(projectPath, ".."), targetFile);
  if (!fs.existsSync(source)) {
    return;
  }

  const target = join(targetFolder, targetFile);
  fs.copyFileSync(source, target);
}

export async function runKeil(options: RunKeilOptions): Promise<void> {
  const { uv4Exe, projectPath, targetName, runName, logPath, channel, device, cpu } = options;
  const typeArg = RUN_TYPE_ARG_MAP[runName];
  fs.writeFileSync(logPath, "");

  const command = `"${uv4Exe}" -${typeArg} "${projectPath}" -t "${targetName}" -j0 -o "${logPath}"`;

  let initText = "\n";
  initText += `$ cmd: ${command}\n`;
  initText += `dev: ${device}\ncpu: ${cpu}\n`;

  channel.show();
  channel.appendLine(`[Exec] ${command}`);
  channel.appendLine(`$: ${runName} target ${targetName}`);

  const timer = setInterval(() => {
    const logText = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf-8") : "";
    const text = `$: ${runName} target ${targetName}\n${initText}\n${logText}`;
    channel.replace(text);
  }, 200);

  await new Promise<void>((resolve) => {
    setTimeout(() => {
      exec(command).once("exit", (code) => {
        setTimeout(() => clearInterval(timer), 100);
        channel.appendLine(`\nProcess exited, ${code}`);
        resolve();
      });
    }, 500);
  });
}
