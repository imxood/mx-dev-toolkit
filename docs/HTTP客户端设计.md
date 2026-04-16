# HTTP 客户端设计

最后更新: 2026-04-16
状态: 设计

## 1. 文档定位

本文档描述 `http_client` 的当前正式实现。

它回答的是“现在系统怎么工作”, 而不是“迁移前曾经怎么计划”。

如果你要查历史演进, 请看:

- `docs/未来规划/HTTP客户端Webview React化迁移设计.md`
- `docs/未来规划/HTTP客户端Webview React化TODO规划.md`

## 2. 当前结论

HTTP Client 已经完成 React Webview 重构, 并进一步把高频交互收敛到单一工作台页面。

当前正式运行模型已经切到 `Webview local-first + Host service-backend`:

- Webview 负责工作台会话态和即时交互反馈
- Host 负责持久化、真实请求执行、VS Code API 与外部副作用
- 高频选择和编辑不再依赖 Host 每次整包回推 `httpClient/state`

当前真实架构是:

- 扩展宿主继续负责命令、持久化、请求执行、cURL 导入、环境解析、存储和消息桥
- 主要 UI 由 `webviews/http_client/` 下的 React workbench 承载
- 工作台内部包含左侧 `记录 / 集合 / 环境`、中间请求编辑和右侧响应结果, 高频交互都在同一个 WebviewPanel 内完成
- 左侧操作当前已经收敛为 `左键选择 + 右键菜单`, 以减少行内按钮噪音
- 中间编辑区已移除冗余提示文案, 并新增 `说明` 按钮用于查看用法和快捷键
- 外部入口当前改为命令和状态栏按钮, 不再占用 Activity Bar 自定义侧边栏
- 宿主侧仍保留 `src/http_client/webview/*` 作为 HTML 装载层
- Toast 沿用统一 `ToastService + Webview host script + VS Code native fallback` 体系, 主要 host 位于工作台

因此, 当前系统的正式主路径是:

- 状态栏按钮 / 命令面板 -> 完整 HTTP Client 工作台
- 工作台内完成几乎全部高频 UI 交互

## 3. 模块拆分

### 3.1 宿主层

核心文件与职责:

- `register.ts`
  - 注册 HTTP Client 命令
  - 注册状态栏入口按钮
  - 装配 store、panel、sidebar 与 toast

- `panel.ts`
  - `HttpClientPanelController`
  - 管理工作台 `WebviewPanel`
  - 维护工作台视图状态、草稿、响应、压测结果
  - 处理工作台与宿主之间的消息
  - 注册工作台 Toast host

- `sidebar_view.ts`
  - 旧侧边栏启动器实现
  - 当前已不再注册为正式运行入口

- `store.ts`
  - 管理请求集合、环境、历史、收藏和视图相关状态

- `resolver.ts`
  - 负责请求解析与变量求值

- `runner.ts`
  - 执行普通请求

- `load_runner.ts`
  - 执行小规模压测

- `curl_import.ts`
  - 将 cURL 导入为请求实体

- `types.ts`
  - 定义宿主与 Webview 共享类型、视图状态与消息协议常量

### 3.2 Webview 装载层

宿主侧仍保留一个很薄的 Webview 装载层:

- `src/http_client/webview/index.ts`
  - 工作台 HTML 入口
  - 当前直接返回 `getReactWorkbenchHtml(...)`

- `src/http_client/webview/react_html.ts`
  - 统一生成 React Webview HTML
  - 当前主要服务 `workbench` surface
  - 负责拼接 `media/http_client/*.js` 与 `*.css`
  - 负责注入 bootstrap
  - 负责注入统一 Toast host 标记、样式和脚本
  - 负责 CSP 与 nonce

- `src/http_client/sidebar_view.ts`
  - 侧边栏当前直接输出轻量启动器 HTML
  - 不再装载完整 React 列表页

### 3.3 React 前端层

当前 UI 主实现位于 `webviews/http_client/`:

- `workbench/main.tsx`: 工作台入口
- `workbench/App.tsx`: 工作台根组件
- `workbench/useWorkbenchController.ts`: 工作台宿主消息桥
- `sidebar/SidebarApp.tsx`: 左侧 `记录 / 集合 / 环境` 视图层, 当前由纯视图 `SidebarView` 和运行时包装层 `SidebarSurface` 组成, 负责右键菜单和环境编辑卡片
- `sidebar/useSidebarController.ts`: 旧侧边栏控制器, 当前更多保留为共享逻辑和测试入口
- `shared/bootstrap.ts`: 读取宿主注入的 bootstrap 数据
- `shared/vscode.ts`: VS Code Webview API 适配
- `shared/workbench_model.ts`: 工作台纯逻辑模型
- `shared/sidebar_model.ts`: 侧边栏纯逻辑模型
- `styles/tokens.css`: 共享样式 token

## 4. Workbench 优先运行模型

当前正式运行时应按"完整工作台优先"理解, 而不是再把 HTTP Client 视为左右两个独立热交互面板。

当前最重要的事实是:

- 主运行表面是 `workbench`
- 左侧 `记录 / 集合 / 环境` 已内嵌到工作台页面
- 外部入口已切换为状态栏和命令, 不再依赖 Activity Bar 自定义侧边栏

Vite 构建仍保留多个入口产物, 但运行时主路径已经收敛:

- `root = webviews/http_client`
- `publicDir = false`
- `appType = "custom"`
- `plugins = [react(), tailwindcss()]`
- `target = "es2022"`
- 输出目录 `media/http_client/`
- 工作台入口 `workbench/main.tsx`
- 入口产物命名 `[name].js`
- 代码分块产物命名 `chunks/[name].js`
- CSS 产物直接输出为 `[name].css`

这也是为什么文档必须把 `webviews/http_client/` 与 `media/http_client/` 视为正式结构的一部分, 但不应再把 `sidebar` 入口理解为主运行时。

## 5. 工作台运行模型

工作台由 `HttpClientPanelController` 驱动。

### 5.1 首屏与启动

主要流程:

1. 用户执行 `mx http open` / `mx http send` / `mx http save` / `mx http import curl` / `mx http load test`
2. 宿主打开或复用 `WebviewPanel`
3. `panel.ts` 调用 `getHttpClientHtml(...)`
4. `getHttpClientHtml(...)` 当前直接走 `getReactWorkbenchHtml(...)`
5. HTML 注入:
   - `window.__MX_HTTP_CLIENT_BOOTSTRAP__ = { buildId, surface, initialState }`
   - `workbench.js`
   - `workbench.css`
   - Toast host 标记 / 样式 / 脚本
6. React 前端启动后向宿主发送 `httpClient/init`
7. `initialState` 直接作为首屏 snapshot 被前端消费
8. `httpClient/init` 仅用于 buildId 对齐、草稿恢复和待执行宿主命令下发, 不再立即重复回推 `httpClient/state`

### 5.2 Local-first 运行边界

当前工作台已明确按 `local-first` 模式工作:

- Webview 持有工作台会话态:
  - `activeRequestId`
  - `selectedHistoryId`
  - `activeEnvironmentId`
  - `draft`
  - `response`
  - `requestRunning`
  - `loadTestProfile`
  - `loadTestResult`
  - `loadTestProgress`
  - `dirty`
  - `activeTab`
  - `responseTab`
- Host 持有持久化与副作用能力:
  - `mx_http_client.json` 配置
  - 请求草稿持久化
  - 历史记录
  - 普通请求执行与取消
  - 压测执行
  - cURL 导入
  - VS Code API, Toast 与命令入口

因此, 以下高频交互已经改为 Webview 本地立即完成, Host 只做后台状态同步:

- 选择请求
- 选择历史
- 选择环境
- 新建 scratch request
- 收藏切换
- 草稿编辑
- 请求 / 响应 tab 切换
- 压测参数编辑

`httpClient/state` 不再作为这些热路径的逐次确认消息。

工作台宿主继续保留的职责包括:

- 请求配置与草稿持久化
- 请求执行与取消
- 响应结果与 ACK 等待
- 压测状态与结果
- 与 store / resolver / runner / load_runner / curl_import 的联动

工作台前端当前承担:

- 左侧导航与筛选
- 请求选择, 历史切换, 环境切换的即时本地反馈
- 左侧 `记录 / 集合 / 环境` 的上下文菜单渲染与交互编排
- 环境页中的变量编辑卡片与收藏区展示
- 中间编辑区和右侧响应区的同页联动
- 中间 `说明` 弹窗与快捷键提示
- 响应高亮, 搜索, 复制和 Toast 呈现
- Local-first 会话态更新与宿主消息消费

## 6. 外部入口运行模型

当前外部入口已经收敛为更轻的形式:

1. 状态栏按钮 `HTTP Client`
2. 命令面板命令 `mx http open`

入口行为:

1. 用户点击状态栏按钮或执行命令
2. 宿主打开或复用 `WebviewPanel`
3. 工作台承担完整三栏交互

这样做的原因是:

- 避免为一个完整页面额外占用 VS Code 的 Sidebar 宽度
- 保持主视觉聚焦在三栏工作台
- 降低用户对"外层启动器 + 内层主页面"双层结构的感知负担

## 7. Bootstrap 与构建一致性

当前 React HTML 会向全局注入:

```js
window.__MX_HTTP_CLIENT_BOOTSTRAP__ = {
  buildId,
  surface,
  initialState,
};
```

这个 bootstrap 有两个作用:

1. 在 Webview 首屏渲染前提供完整首屏 snapshot
2. 让宿主与前端确认当前构建版本一致

工作台宿主会保存当前 `buildId`, 并使用 `HTTP_CLIENT_WEBVIEW_BUILD_ID` 校验当前 Webview 是否是预期构建。

如果发现 Webview 构建版本不一致, Host 会重建 HTML 并重新注入最新 snapshot, 而不是继续依赖旧页面与旧消息语义。

## 8. 消息协议边界

### 8.1 工作台关键消息

前端到宿主常见消息包括:

- `httpClient/init`
- `httpClient/uiStateChanged`
- `httpClient/draftChanged`
- `httpClient/save`
- `httpClient/send`
- `httpClient/cancelRequest`
- `httpClient/importCurlPrompt`
- `httpClient/createCollectionPrompt`
- `httpClient/renameCollectionPrompt`
- `httpClient/deleteCollection`
- `httpClient/createRequest`
- `httpClient/createEnvironment`
- `httpClient/renameRequestPrompt`
- `httpClient/deleteRequest`
- `httpClient/duplicateRequest`
- `httpClient/toggleFavorite`
- `httpClient/selectEnvironment`
- `httpClient/saveEnvironment`
- `httpClient/deleteEnvironment`
- `httpClient/selectHistory`
- `httpClient/loadTest/start`
- `httpClient/loadTest/stop`
- `httpClient/responseAck`
- `mxToast/notify`

其中消息边界已经按频率拆开:

- Local-first 高频消息:
  - `httpClient/draftChanged`
  - `httpClient/selectRequest`
  - `httpClient/selectHistory`
  - `httpClient/selectEnvironment`
  - `httpClient/createRequest`
  - `httpClient/toggleFavorite`
- 宿主副作用消息:
  - `httpClient/save`
  - `httpClient/send`
  - `httpClient/cancelRequest`
  - `httpClient/loadTest/start`
  - `httpClient/loadTest/stop`
  - `httpClient/importCurlPrompt`
  - `httpClient/createCollectionPrompt`
  - `httpClient/renameCollectionPrompt`
  - `httpClient/deleteCollection`
  - `httpClient/createEnvironment`
  - `httpClient/saveEnvironment`
  - `httpClient/deleteEnvironment`
  - `httpClient/renameRequestPrompt`
  - `httpClient/deleteRequest`
  - `httpClient/duplicateRequest`

宿主到前端常见消息包括:

- `httpClient/state`
- `httpClient/hostCommand`
- `httpClient/response`
- `httpClient/loadTest/progress`
- `httpClient/loadTest/result`
- `mxToast/show`

当前约束是:

- `httpClient/state` 只用于结构性刷新、外部命令打开、历史异步落盘刷新和异常恢复
- `httpClient/response`、`httpClient/loadTest/progress`、`httpClient/loadTest/result` 负责把真正的执行结果推回前端
- 高频选择动作不再由 Host 用整包 `state` 进行二次确认

### 8.2 外部入口关键行为

当前外部入口不再走单独的 webview 消息协议.

状态栏按钮直接绑定命令:

- `mx-dev-toolkit.httpClient.openWorkbench`

## 9. Toast 集成

HTTP Client 没有实现一套独立于全局的提示系统, 而是直接接入 `ToastService`。

当前优先级:

1. 工作台 host `httpClient.panel` 优先级 `100`
2. 无可用 Webview 时回退到原生 `showErrorMessage` / `showWarningMessage` / `showInformationMessage`

这也意味着当前 Toast 的运行时并不是完整 React 组件树, 而是宿主注入的 Webview Toast host 脚本。

## 10. 关于旧 `src/http_client/webview/ui/*`

仓库中仍然存在:

- `src/http_client/webview/state.ts`
- `src/http_client/webview/styles.ts`
- `src/http_client/webview/ui/toolbar.ts`
- `src/http_client/webview/ui/request_editor.ts`
- `src/http_client/webview/ui/response_viewer.ts`
- `src/http_client/webview/ui/load_test_view.ts`
- `src/http_client/webview/ui/sidebar.ts`

这些文件的存在并不代表它们仍是当前主运行路径。

当前文档约定应当明确:

- “目录仍存在” ≠ “仍是当前主 UI”
- 运行时主入口已经切到 React 双入口
- 如果未来继续清理旧目录, 应作为工程治理动作进行, 而不是把它们继续写成正式架构

## 11. 构建与测试

### 11.1 构建

- `pnpm compile:webview`: 构建 React Webview 到 `media/http_client/`
- `pnpm compile:extension`: 打包扩展宿主到 `out/extension.js`
- `pnpm compile`: 先 Webview, 后宿主
- `pnpm watch:webview`: 监听 Webview 构建
- `pnpm watch:extension`: 监听扩展宿主构建
- `pnpm watch`: 并行 watch

### 11.2 测试

宿主侧测试:

- `src/http_client/tests/panel.test.ts`
- `src/http_client/tests/sidebar_view.test.ts`
- `src/http_client/tests/react_loader.test.ts`
- `src/http_client/tests/store.test.ts`
- `src/http_client/tests/webview_state.test.ts`
- `src/http_client/tests/runner.test.ts`
- `src/http_client/tests/resolver.test.ts`
- `src/http_client/tests/curl_import.test.ts`
- `src/http_client/tests/load_runner.test.ts`

前端侧测试:

- `webviews/http_client/tests/component_contract.test.ts`
- `webviews/http_client/tests/sidebar_model.test.ts`
- `webviews/http_client/tests/workbench_model.test.ts`

对应脚本:

- `pnpm test:http-client:core`
- `pnpm test:http-client:webview`
- `pnpm test:http-client`

## 12. 手动验收建议

最小验收路径:

1. 点击状态栏 `HTTP Client`, 进入完整工作台
2. 在工作台左栏切换 `记录 / 集合 / 环境`
3. 新建请求, 编辑 URL 并发送
4. 保存请求后, 再从左栏重新选择它
5. 导入一段 cURL
6. 切换环境并验证变量解析
7. 启动一次压测并确认进度/结果展示
8. 检查 Toast 在工作台与原生回退路径上的表现

## 13. 后续维护原则

- 当前正式事实以本文件与 `docs/设计.md` 为准。
- React 迁移历史只保存在归档文档中, 不再回流覆盖正式设计。
- 新增 UI 变更时, 先确认宿主入口和 Vite 入口是否变化, 再更新文档。
- 只要当前主路径没有回退, 就不要再把 `src/http_client/webview/ui/*` 重新写成正式事实源。
