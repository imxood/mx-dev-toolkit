import * as fs from "fs";
import path from "path";
import * as xml2js from "xml2js";
import JSON5 from "json5";

export const MX_DEV_CONFIG_FILE = "mx_dev.json";

interface KeilTargetNode {
  TargetName: string;
  TargetOption: {
    TargetCommonOption: {
      Device: string;
      Cpu: string;
      OutputName: string;
    };
    TargetArmAds?: {
      Cads?: {
        VariousControls?: {
          IncludePath?: string;
          Define?: string;
        };
      };
    };
  };
}

export interface ParsedKeilProject {
  projectPath: string;
  targetName: string;
  device: string;
  cpu: string;
  outputName: string;
  includes: string[];
  defines: string[];
}

export function readProjectFromConfigForLoad(workDir: string): string | undefined {
  const configPath = path.join(workDir, MX_DEV_CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  return resolveProjectPathFromConfig(workDir, false);
}

export function readProjectFromConfigForRun(workDir: string): string {
  return resolveProjectPathFromConfig(workDir, true) ?? "";
}

export async function parseKeilProject(
  workDir: string,
  projectPath: string
): Promise<ParsedKeilProject> {
  const parser = new xml2js.Parser({ explicitArray: false });
  const doc = await parser.parseStringPromise(fs.readFileSync(projectPath, "utf-8"));
  const targetNode = resolveTarget(doc);
  if (!targetNode) {
    throw new Error("Keil target config not found");
  }

  const targetName = targetNode.TargetName;
  const common = targetNode.TargetOption.TargetCommonOption;
  const device = common.Device;
  const cpu = common.Cpu;
  const outputName = common.OutputName;

  const controls = targetNode.TargetOption.TargetArmAds?.Cads?.VariousControls;
  const includePath = controls?.IncludePath ?? "";
  const defineText = controls?.Define ?? "";

  const projectDir = path.resolve(projectPath, "..");
  const includes = includePath
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => path.join(projectDir, item).replace(workDir, "${workspaceFolder}"));

  const defines = ["__CC_ARM"];
  defineText.split(",").forEach((part) => {
    part
      .split(" ")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .forEach((item) => defines.push(item));
  });

  return {
    projectPath,
    targetName,
    device,
    cpu,
    outputName,
    includes,
    defines,
  };
}

function resolveProjectPathFromConfig(workDir: string, strict: boolean): string | undefined {
  const configPath = path.join(workDir, MX_DEV_CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    if (strict) {
      throw new Error(`Missing config file: ${MX_DEV_CONFIG_FILE}`);
    }
    return undefined;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON5.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Failed to parse config file: ${MX_DEV_CONFIG_FILE}, ${(error as Error).message}`);
  }

  const project = config.project;
  if (typeof project !== "string" || project.trim().length === 0) {
    if (strict) {
      throw new Error(`Missing valid field 'project' in ${MX_DEV_CONFIG_FILE}`);
    }
    return undefined;
  }

  const projectPath = path.isAbsolute(project) ? project : path.join(workDir, project);
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Keil project path does not exist: ${projectPath}`);
  }
  if (path.extname(projectPath).toLowerCase() !== ".uvprojx") {
    throw new Error(`The 'project' field must point to a .uvprojx file: ${projectPath}`);
  }

  return projectPath;
}

function resolveTarget(doc: unknown): KeilTargetNode | undefined {
  const root = doc as {
    Project?: { Targets?: { Target?: KeilTargetNode | KeilTargetNode[] } };
  };
  const target = root.Project?.Targets?.Target;
  if (!target) {
    return undefined;
  }
  return Array.isArray(target) ? target[0] : target;
}
