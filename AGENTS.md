# Repository Guidelines

## 项目结构与模块组织
- `src/extension.ts` 是 VS Code 入口，仅负责功能模块装配。
- `src/keil/keil.ts` 是 Keil 编排层（状态管理与流程组织）。
- `src/keil/parser.ts` 是 Keil 项目解析层。
- `src/keil/runner.ts` 是 Keil 运行执行层。
- `src/keil/register.ts` 是 Keil 命令与事件注册。
- `src/selection/line_count.ts` 是选区行数状态栏能力。
- `src/selection/copy_path_range.ts` 是选区路径范围复制能力。
- `src/selection/register.ts` 是选区命令与事件注册。
- `out/` 是 `tsc` 产物（生成文件）。
- `eh_keil_tool/` 为 Rust 辅助工具（`Cargo.toml`、`src/`、`examples/`）。
- `docs/设计.md` 是插件模块化设计文档。
- 工作区文件：根目录 `mx_dev.json` 与生成的 `.vscode/c_cpp_properties.json`。

## 构建、测试与开发命令
- `pnpm install` 安装 Node 依赖。
- `pnpm compile` 编译 TypeScript 到 `out/`。
- `pnpm watch` 监听并增量编译。
- `pnpm lint` 对 `src/` 运行 ESLint。
- `pnpm test` 运行 VS Code 扩展测试（当前未配置测试用例）。
- `pnpm vscode:prepublish` 发布前编译。
- 可选（Rust 工具）：`cd eh_keil_tool; cargo build`。

## 本地验证（扩展调试）
- 运行 `pnpm install` 与 `pnpm compile`（或 `pnpm watch`）准备调试产物。
- 在 VS Code 中按 `F5` 启动 Extension Development Host。
- 在新窗口打开包含 Keil 工程的工作区。
- 执行 `mx keil gen config` 选择 Keil 项目并生成 `mx_dev.json`（或手动创建）。
- 在设置中确认 `mx-dev-toolkit.Uv4Path` 指向 `UV4.exe`。
- 运行 `mx keil build` / `mx keil rebuild` / `mx keil clean`，查看 `mx-dev-toolkit` 输出通道日志。
- 选中文本后确认左下角状态栏显示 `已选 N 行`，取消选区后状态栏隐藏。
- 使用 `ctrl+alt+c` 验证相对路径范围复制，使用 `ctrl+shift+alt+c` 验证绝对路径范围复制。

## 编码风格与命名规范
- TypeScript 使用 2 空格缩进、双引号、分号（ESLint 会提示）。
- 文件名保持小写（如 `extension.ts`、`keil.ts`、`line_count.ts`）。
- 导入命名遵循 camelCase/PascalCase（见 ESLint 规则）。
- 不要手改生成目录 `out/` 或 `eh_keil_tool/target/`。

## 测试指南
- 测试框架：`@vscode/test-cli`，通过 `pnpm test` 运行。
- 暂无覆盖率要求；新增测试建议放在 `test/`（或 `src/`）并使用 `*.test.ts` 命名。

## 提交与 PR 指南
- 现有历史提交信息较简单（如 `.`）；新提交请使用清晰、祈使句式摘要。
- PR 需包含：变更说明、验证方式（命令或手动步骤）、涉及 UI/命令面板的截图或动图。

## 发布到 VS Code Marketplace
- 更新 `package.json` 中的 `version` 并确认 `publisher` 正确。
- 安装发布工具：`npm i -g @vscode/vsce`（或使用 `npx vsce`）。
- 本地打包：`pnpm vscode:prepublish` 后运行 `vsce package` 生成 `.vsix`。
- 发布：`vsce publish`（需要微软 Marketplace 账号与 PAT）。
- 如需先验证包，可用 VS Code “从 VSIX 安装”进行本地安装测试。

## 配置说明
- 扩展在 VS Code 启动后自动激活。
- Keil 命令依赖工作区根目录 `mx_dev.json`。
- `mx_dev.json` 示例：
  ```json
  { "project": "path/to/project.uvprojx" }
  ```
- 确保 `mx-dev-toolkit.Uv4Path` 指向 `UV4.exe`（默认 `C:/Keil_v5/UV4/UV4.exe`）。
