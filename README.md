# Mx Dev Toolkit

最后更新: 2026-04-14

Mx Dev Toolkit 是一个模块化的 VS Code 开发工具箱扩展, 当前已经不是单一的 Keil 辅助插件, 而是围绕日常开发工作流组织的一组能力集合。

当前核心模块:

- `keil`: Keil 工程配置生成、构建、重建、清理
- `selection`: 选区行数状态栏、路径范围复制
- `http_client`: 内置 HTTP Client 工作台与侧边栏
- `toast`: 插件级统一 Toast 调度与原生消息回退

其中 `http_client` 已完成 React Webview 重构:

- 扩展宿主继续负责命令、状态、请求执行、存储和消息桥
- UI 由 `webviews/http_client/` 下的 React + Vite 双入口前端承载
- 构建产物输出到 `media/http_client/`
- Webview HTML 装载仍由宿主侧负责, 并注入 bootstrap 与统一 Toast host

## 1. 当前能力概览

### 1.1 Keil

- 生成 `mx_dev.json`
- 调用 `UV4.exe` 执行 build / rebuild / clean
- 输出日志到 `mx-dev-toolkit` 输出通道

### 1.2 Selection

- 状态栏显示当前选区行数
- 复制相对路径范围: `ctrl+alt+c`
- 复制绝对路径范围: `ctrl+shift+alt+c`
- Windows 路径会统一格式化为正斜杠, 且绝对路径盘符固定输出为大写, 例如 `E:/repo/file.ts:12`

### 1.3 HTTP Client

- 状态栏中提供 `HTTP Client` 入口
- 工作台命令:
  - `mx http open`
  - `mx http send`
  - `mx http save`
  - `mx http import curl`
  - `mx http load test`
- 支持请求集合、环境、历史、收藏、cURL 导入和小规模压测
- 工作台与侧边栏均通过 React Webview 运行

### 1.4 Toast

- 宿主统一入口 `ToastService`
- 优先投递到 HTTP Client 工作台 Webview
- 次优先投递到 HTTP Client 侧边栏 Webview
- 无可用 Webview 时回退到 VS Code 原生消息

## 2. 目录概览

```text
src/
├─ extension.ts
├─ keil/
├─ selection/
├─ http_client/
│  ├─ register.ts
│  ├─ panel.ts
│  ├─ sidebar_view.ts
│  ├─ store.ts
│  ├─ resolver.ts
│  ├─ runner.ts
│  ├─ load_runner.ts
│  ├─ curl_import.ts
│  ├─ types.ts
│  ├─ webview/
│  └─ tests/
└─ toast/
   ├─ service.ts
   ├─ webview.ts
   ├─ types.ts
   └─ tests/

webviews/http_client/
├─ workbench/
├─ sidebar/
├─ shared/
├─ styles/
├─ tests/
└─ vite.config.ts

media/http_client/   # Webview 构建产物
out/                 # Extension host 构建产物
docs/
eh_keil_tool/
```

说明:

- `src/http_client/webview/` 现在主要承担宿主 HTML 装载与兼容层职责。
- 当前主运行路径不是旧的字符串模板 UI, 而是 `webviews/http_client/` 下的 React 前端。
- `src/http_client/webview/ui/*` 仍存在, 但不应再被视为当前主 UI 的事实源。

## 3. 构建与开发命令

安装依赖:

```bash
pnpm install
```

常用命令:

- `pnpm compile`: 先构建 Webview, 再构建扩展宿主
- `pnpm compile:webview`: 编译 `webviews/http_client/` 到 `media/http_client/`
- `pnpm compile:extension`: 通过 esbuild 打包 `src/extension.ts` 到 `out/extension.js`
- `pnpm watch`: 并行监听 Webview 与扩展宿主
- `pnpm watch:webview`: watch 模式构建 React Webview
- `pnpm watch:extension`: watch 模式构建扩展宿主
- `pnpm lint`: 检查 `src/` 与 `webviews/http_client/`
- `pnpm vscode:prepublish`: 发布前执行完整编译

## 4. 测试命令

当前测试不是单一根级 `test/` 目录, 而是分布在模块目录中。

- `pnpm test:http-client:core`: `src/http_client/tests/*`
- `pnpm test:http-client:webview`: `webviews/http_client/tests/*`
- `pnpm test:http-client`: 聚合 HTTP Client 核心与 Webview 测试
- `pnpm test:selection`: `src/selection/tests/path_format.test.ts`
- `pnpm test:toast`: `src/toast/tests/service.test.ts`
- `pnpm test`: 运行 HTTP Client、Selection 与 Toast 全量测试

已存在的测试覆盖至少包括:

- `panel.test.ts`
- `sidebar_view.test.ts`
- `react_loader.test.ts`
- `store.test.ts`
- `webview_state.test.ts`
- `runner.test.ts`
- `resolver.test.ts`
- `curl_import.test.ts`
- `load_runner.test.ts`
- `service.test.ts`
- `component_contract.test.ts`
- `sidebar_model.test.ts`
- `workbench_model.test.ts`

## 5. 本地调试与验证

### 5.1 通用准备

1. `pnpm install`
2. `pnpm compile` 或 `pnpm watch`
3. 在 VS Code 中按 `F5` 启动 Extension Development Host

### 5.2 HTTP Client

1. 点击状态栏 `HTTP Client`
2. 或从命令面板执行:
   - `mx http open`
   - `mx http send`
   - `mx http save`
   - `mx http import curl`
   - `mx http load test`
3. 验证工作台与侧边栏都能正常显示
4. 验证发送请求、保存、导入 cURL、切换环境、查看历史与压测流程
5. 验证 Toast 优先出现在工作台, 无工作台时可在侧边栏或原生消息中看到反馈

### 5.3 Keil

1. 打开包含 Keil 工程的工作区
2. 执行 `mx keil gen config` 生成 `mx_dev.json`
3. 确认设置 `mx-dev-toolkit.Uv4Path` 指向 `UV4.exe`
4. 执行 `mx keil build` / `mx keil rebuild` / `mx keil clean`
5. 检查 `mx-dev-toolkit` 输出通道日志

### 5.4 Selection

1. 选中文本后确认左下角显示 `已选 N 行`
2. 取消选区后状态栏隐藏
3. 使用 `ctrl+alt+c` 验证相对路径范围复制
4. 使用 `ctrl+shift+alt+c` 验证绝对路径范围复制

## 6. 配置说明

### 6.1 Keil 配置

Keil 命令依赖工作区根目录 `mx_dev.json`:

```json
{
  "project": "path/to/project.uvprojx"
}
```

同时需配置:

- `mx-dev-toolkit.Uv4Path`: `UV4.exe` 路径, 默认 `C:/Keil_v5/UV4/UV4.exe`

### 6.2 HTTP Client

HTTP Client 不依赖 `mx_dev.json`。其状态、请求集合和运行时数据由 `http_client` 模块自行管理。

## 7. 文档索引

- 总体设计: [docs/设计.md](./docs/设计.md)
- 文档总览: [docs/README.md](./docs/README.md)
- HTTP Client 设计: [docs/HTTP客户端设计.md](./docs/HTTP客户端设计.md)
- HTTP Client TODO: [docs/HTTP客户端TODO规划.md](./docs/HTTP客户端TODO规划.md)
- Toast 设计: [docs/公共主题/统一Toast设计.md](./docs/公共主题/统一Toast设计.md)
- 迁移归档与未来规划: [docs/未来规划/README.md](./docs/未来规划/README.md)
