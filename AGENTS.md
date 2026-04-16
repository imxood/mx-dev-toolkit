# Repository Guidelines

## 项目结构与模块组织
- `src/extension.ts` 是 VS Code 扩展入口, 负责创建输出通道、创建 `ToastService`, 并装配 `registerHttpClient(...)`、`registerKeil(...)`、`registerSelection(...)`。
- `src/keil/keil.ts` 是 Keil 编排层（状态管理与流程组织）。
- `src/keil/parser.ts` 是 Keil 项目解析层。
- `src/keil/runner.ts` 是 Keil 运行执行层。
- `src/keil/register.ts` 是 Keil 命令与事件注册。
- `src/selection/line_count.ts` 是选区行数状态栏能力。
- `src/selection/copy_path_range.ts` 是选区路径范围复制能力。
- `src/selection/register.ts` 是选区命令与事件注册。
- `src/http_client/register.ts` 是 HTTP Client 的命令、侧边栏与生命周期装配入口。
- `src/http_client/panel.ts` 是 HTTP Client 工作台宿主控制器。
- `src/http_client/sidebar_view.ts` 是 HTTP Client 侧边栏宿主 provider。
- `src/http_client/store.ts` / `resolver.ts` / `runner.ts` / `load_runner.ts` / `curl_import.ts` 分别负责存储、变量解析、普通请求执行、压测执行与 cURL 导入。
- `src/http_client/webview/react_html.ts` 与 `src/http_client/webview/index.ts` 是 React Webview 的宿主装载层。
- `src/toast/service.ts` 是统一 Toast 调度入口；`src/toast/webview.ts` 提供注入式 Webview Toast host。
- `webviews/http_client/` 是 HTTP Client 的 React + Vite 前端工程, 包含 `workbench`、`sidebar`、`shared`、`styles` 与 `tests`。
- `media/http_client/` 是 Webview 构建产物目录（生成文件）。
- `out/` 是扩展宿主构建产物目录（生成文件）。
- `eh_keil_tool/` 为 Rust 辅助工具（`Cargo.toml`、`src/`、`examples/`）。
- `docs/设计.md` 是仓库总体设计文档；`docs/HTTP客户端设计.md` 是 HTTP Client 正式事实源。
- 工作区文件：根目录 `mx_dev.json` 与生成的 `.vscode/c_cpp_properties.json`。

## 构建、测试与开发命令
- `pnpm install` 安装 Node 依赖。
- `pnpm compile` 先构建 React Webview，再构建扩展宿主。
- `pnpm compile:webview` 编译 `webviews/http_client/` 到 `media/http_client/`。
- `pnpm compile:extension` 用 `esbuild` 打包 `src/extension.ts` 到 `out/extension.js`。
- `pnpm watch` 并行监听 Webview 与扩展宿主。
- `pnpm watch:webview` 监听并增量构建 React Webview。
- `pnpm watch:extension` 监听并增量构建扩展宿主。
- `pnpm lint` 对 `src/` 与 `webviews/http_client/` 运行 ESLint。
- `pnpm test:http-client:core` 运行 `src/http_client/tests/*`。
- `pnpm test:http-client:webview` 运行 `webviews/http_client/tests/*`。
- `pnpm test:http-client` 聚合 HTTP Client 核心与 Webview 测试。
- `pnpm test:toast` 运行 `src/toast/tests/service.test.ts`。
- `pnpm test` 运行 HTTP Client + Toast 全量测试。
- `pnpm vscode:prepublish` 发布前完整编译。
- 可选（Rust 工具）：`cd eh_keil_tool; cargo build`。

## 本地验证（扩展调试）
- 运行 `pnpm install` 与 `pnpm compile`（或 `pnpm watch`）准备调试产物。
- 在 VS Code 中按 `F5` 启动 Extension Development Host。
- HTTP Client 验证：
  - 点击状态栏 `HTTP Client` 按钮打开工作台。
  - 或执行 `mx http open` / `mx http send` / `mx http save` / `mx http import curl` / `mx http load test`。
  - 验证完整三栏工作台可正常显示与通信。
  - 验证发送请求、保存、导入 cURL、环境切换、历史/收藏、压测与 Toast 提示。
- Keil 验证：
  - 在新窗口打开包含 Keil 工程的工作区。
  - 执行 `mx keil gen config` 选择 Keil 项目并生成 `mx_dev.json`（或手动创建）。
  - 在设置中确认 `mx-dev-toolkit.Uv4Path` 指向 `UV4.exe`。
  - 运行 `mx keil build` / `mx keil rebuild` / `mx keil clean`，查看 `mx-dev-toolkit` 输出通道日志。
- Selection 验证：
  - 选中文本后确认左下角状态栏显示 `已选 N 行`，取消选区后状态栏隐藏。
  - 使用 `ctrl+alt+c` 验证相对路径范围复制，使用 `ctrl+shift+alt+c` 验证绝对路径范围复制。

## 编码风格与命名规范
- TypeScript 使用 2 空格缩进、双引号、分号（ESLint 会提示）。
- 文件名保持小写（如 `extension.ts`、`keil.ts`、`line_count.ts`、`react_html.ts`）。
- 导入命名遵循 camelCase / PascalCase。
- Webview 前端使用 React + TSX，仍遵循同一套格式化与 ESLint 约束。
- 不要手改生成目录 `out/`、`media/http_client/` 或 `eh_keil_tool/target/`。

## 测试指南
- 当前仓库已经存在模块测试，不要再写“当前未配置测试用例”。
- 主要测试目录：
  - `src/http_client/tests/`
  - `src/toast/tests/`
  - `webviews/http_client/tests/`
- 根目录没有统一 `test/` 目录，测试说明请以真实模块目录和 `package.json` 脚本为准。
- 新增测试建议放在所属模块目录下，并使用 `*.test.ts` 命名。

## 提交与 PR 指南
- 现有历史提交信息较简单（如 `.`）；新提交请使用清晰、祈使句式摘要。
- PR 需包含：变更说明、验证方式（命令或手动步骤）、涉及 UI/命令面板的截图或动图。
- 如果改动涉及 HTTP Client Webview，请同时说明工作台、侧边栏与 Toast 是否一起验证。

## 发布到 VS Code Marketplace
- 更新 `package.json` 中的 `version` 并确认 `publisher` 正确。
- 安装发布工具：`npm i -g @vscode/vsce`（或使用 `npx vsce`）。
- 本地打包：`pnpm vscode:prepublish` 后运行 `vsce package` 生成 `.vsix`。
- 发布：`vsce publish`（需要微软 Marketplace 账号与 PAT）。
- 如需先验证包，可用 VS Code “从 VSIX 安装”进行本地安装测试。

## 配置说明
- 扩展在 VS Code 启动后自动激活（`onStartupFinished`）。
- Keil 命令依赖工作区根目录 `mx_dev.json`。
- `mx_dev.json` 示例：
  ```json
  { "project": "path/to/project.uvprojx" }
  ```
- 确保 `mx-dev-toolkit.Uv4Path` 指向 `UV4.exe`（默认 `C:/Keil_v5/UV4/UV4.exe`）。
- HTTP Client 不依赖 `mx_dev.json`；其状态由 `http_client` 模块自行管理。
