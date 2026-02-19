import * as fs from "fs";
import path from "path";

interface CppPropertiesOptions {
  vscodeRoot: string;
  includes: string[];
  defines: string[];
}

export function writeCppProperties(options: CppPropertiesOptions): void {
  const { vscodeRoot, includes, defines } = options;
  if (!fs.existsSync(vscodeRoot)) {
    fs.mkdirSync(vscodeRoot, { recursive: true });
  }

  const cConfigPath = path.join(vscodeRoot, "c_cpp_properties.json");
  fs.writeFileSync(
    cConfigPath,
    JSON.stringify(
      {
        configurations: [
          {
            name: "Win32",
            defines,
            includePath: includes,
          },
        ],
        version: 4,
      },
      null,
      2
    )
  );
}
