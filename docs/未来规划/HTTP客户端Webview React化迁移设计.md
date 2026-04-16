# HTTP 客户端 Webview React 化迁移设计（归档）

最后更新: 2026-04-14
状态: 已完成 / 迁移归档

## 1. 文档定位

本文档保留为 HTTP Client React 化迁移的历史设计记录。

它描述的是“这次迁移最终怎样落地”, 而不是当前正式事实源。当前正式实现请以 `docs/HTTP客户端设计.md` 为准。

## 2. 迁移目标

这次迁移的目标不是简单替换技术栈, 而是在不破坏宿主侧业务边界的前提下, 完成 Webview UI 的结构升级。

目标包括:

- 将 HTTP Client 主 UI 从旧宿主内联 Webview 路径迁移到 React
- 保留宿主层的 store / resolver / runner / load_runner / curl_import / 消息桥职责
- 同时支持工作台与侧边栏两个运行表面
- 用 Vite 构建产物替代旧的单体字符串模板 UI 输出
- 保留统一 ToastService 和原生消息回退策略

## 3. 最终落地方案

### 3.1 宿主层不变的部分

迁移后仍由扩展宿主负责:

- 命令注册
- 工作台 `WebviewPanel` 生命周期
- 侧边栏 `WebviewView` 生命周期
- 请求状态、环境、历史、收藏等事实源
- 普通请求执行与压测执行
- cURL 导入
- 输出日志与 Toast 调度

### 3.2 新的前端结构

最终前端落地到 `webviews/http_client/`:

- `workbench/main.tsx`
- `sidebar/main.tsx`
- `shared/bootstrap.ts`
- `shared/vscode.ts`
- `shared/workbench_model.ts`
- `shared/sidebar_model.ts`
- `styles/tokens.css`

构建输出到 `media/http_client/`。

### 3.3 新的宿主装载方式

宿主侧新增并启用了 React 装载器:

- `src/http_client/webview/react_html.ts`
- `src/http_client/webview/index.ts`
- `src/http_client/sidebar_view.ts`

最终运行路径:

- 工作台 -> `getReactWorkbenchHtml(...)`
- 侧边栏 -> `getReactSidebarHtml(...)`

HTML 外壳负责:

- 引入 `workbench.js` / `sidebar.js`
- 引入对应 CSS
- 注入 `window.__MX_HTTP_CLIENT_BOOTSTRAP__`
- 注入统一 Toast host
- 生成 CSP 与 nonce

## 4. 关键设计决定

### 4.1 保留宿主事实源

迁移没有把核心业务状态搬进 React 前端。

原因:

- VS Code 扩展的命令、存储、请求执行与 Webview 生命周期天然属于宿主层
- 宿主作为事实源能避免双向状态漂移
- 前端更适合负责渲染、局部交互与纯逻辑模型

### 4.2 双入口而不是单入口

迁移没有把工作台与侧边栏强行合并成同一入口。

原因:

- 两个表面职责不同
- 它们拥有不同的初始状态与消息节奏
- 双入口更有利于资源拆分和表面边界维护

最终 Vite 双入口为:

- `workbench/main.tsx`
- `sidebar/main.tsx`

### 4.3 继续复用统一 Toast host

迁移没有强制把 Toast 改成完整 React 组件树。

当前实际策略是:

- Toast 由宿主 `ToastService` 调度
- Webview 使用宿主注入的 Toast host 标记、样式和脚本
- 无可用 Webview 时回退原生消息

这让迁移范围聚焦在主 UI 表面, 避免把稳定的提示链路一起重写。

## 5. 与原旧路径的关系

仓库中仍保留了旧 `src/http_client/webview/state.ts` 与 `src/http_client/webview/ui/*` 等文件。

迁移完成后的正确理解是:

- 它们不再是当前主运行路径
- 它们可能仍承担过渡、兼容、测试辅助或待清理职责
- 文档不应再把它们写成当前正式 UI 结构

## 6. 迁移完成后的结果

迁移完成后, 已经可以明确确认:

- 工作台和侧边栏都通过 React Webview 运行
- `webviews/http_client/` 成为主 UI 事实源
- `media/http_client/` 成为稳定构建输出目录
- 宿主入口与前端构建之间通过 bootstrap 和 buildId 关联
- Toast 路径已经纳入统一宿主调度体系

## 7. 当前应以哪些文档为准

迁移完成后, 请按以下顺序理解当前实现:

1. `docs/HTTP客户端设计.md`
2. `docs/设计.md`
3. 本归档文档

也就是说, 本文档只保留“为什么会这么落地”的历史上下文, 不再承担当前实现的唯一事实源角色。
