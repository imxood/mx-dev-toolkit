# HTTP 客户端设计

最后更新: 2026-06-23
状态: 设计

## 1. 文档定位

本文档描述 `http_client` 的当前正式实现。

它回答的是“现在系统怎么工作”, 而不是“迁移前曾经怎么计划”。

如果你要查历史演进, 请看:

- `docs/未来规划/HTTP客户端Webview React化迁移设计.md`
- `docs/未来规划/HTTP客户端Webview React化TODO规划.md`

## 2. 当前结论

HTTP Client 已经切到 `集合驱动 + 快照内化` 的新数据模型, 并完成 React 工作台重写。

新模型的核心变化:

- 集合直接挂载 `requests`, 不再有独立的 `requests[]` 平行数组
- 每个 `HttpRequestEntity` 自带 `lastStatus / lastDurationMs / lastExecutedAt / lastResponseSnapshot` 四个字段, 历史响应快照内化到 req 上
- 默认集合 (`c-default` / `default-collection`) 接管所有"曾经发过的请求", 按 `method+url` 唯一 upsert
- Sidebar 从 `记录 / 集合 / 环境` 三 tab 收敛为 `集合 / 环境` 两 tab
- 集合支持拖拽 req 跨集合移动
- 请求右键菜单精简: 加载到编辑器 / 复制 URL / 复制为 cURL / 重命名 / 删除

当前正式运行模型已经切到 `Webview local-first + Host service-backend`:

- Webview 负责工作台会话态和即时交互反馈
- Host 负责持久化、真实请求执行、VS Code API 与外部副作用
- 高频选择和编辑不再依赖 Host 每次整包回推 `httpClient/state`

## 3. 模块拆分

### 3.1 宿主层

核心文件与职责:

- `register.ts`
  - 注册 HTTP Client 命令
  - 注册状态栏入口按钮
  - 装配 store、panel 与 toast

- `panel.ts`
  - `HttpClientPanelController`
  - 管理工作台 `WebviewPanel`
  - 维护工作台视图状态、草稿、响应、压测结果
  - 处理工作台与宿主之间的消息
  - 注册工作台 Toast host
  - 处理 `moveRequest` / `exportCurl` 副作用消息

- `store.ts`
  - 管理 `mx_http_client.json` 配置
  - 集合内嵌 requests 持久化
  - `findRequestByUrl` / `upsertRequestByUrl` (按 method+url 唯一 upsert)
  - `moveRequest` 跨集合搬运
  - 默认集合保护 (不可重命名/删除)

- `resolver.ts`
  - 负责请求解析与变量求值

- `runner.ts`
  - 执行普通请求

- `load_runner.ts`
  - 执行小规模压测

- `curl_import.ts`
  - 将 cURL 字符串导入为请求实体

- `curl_export.ts`
  - 将请求导出为 cURL 字符串 (用于右键"复制为 cURL")

- `types.ts`
  - 定义宿主与 Webview 共享类型、视图状态与消息协议常量
  - `HttpCollectionEntity.requests: HttpRequestEntity[]` (内嵌)
  - `HttpRequestEntity.lastStatus / lastDurationMs / lastExecutedAt / lastResponseSnapshot`

### 3.2 Webview 装载层

- `src/http_client/webview/index.ts`
  - 工作台 HTML 入口, 返回 `getReactWorkbenchHtml(...)`

- `src/http_client/webview/react_html.ts`
  - 统一生成 React Webview HTML
  - 负责拼接 `media/http_client/*.js` 与 `*.css`
  - 负责注入 bootstrap
  - 负责注入统一 Toast host 标记、样式和脚本
  - 负责 CSP 与 nonce

- `src/http_client/webview/styles.ts`
  - 旧版内联样式 (保留但不在主路径)

### 3.3 React 前端层

当前 UI 主实现位于 `webviews/http_client/`:

- `workbench/main.tsx`: 工作台入口
- `workbench/App.tsx`: 工作台根组件 (三栏布局)
- `workbench/useWorkbenchController.ts`: 工作台宿主消息桥 + local-first 会话态
- `sidebar/SidebarApp.tsx`: 左侧 `集合 / 环境` 视图层, 包含紧凑 req-item 渲染, 默认集合锁标, 拖拽支持和右键菜单
- `sidebar/useSidebarController.ts`: 独立 sidebar 入口控制器
- `shared/bootstrap.ts`: 读取宿主注入的 bootstrap 数据
- `shared/vscode.ts`: VS Code Webview API 适配
- `shared/workbench_model.ts`: 工作台纯逻辑模型 (selectRequestLocally 自动加载 lastResponseSnapshot)
- `shared/sidebar_model.ts`: 侧边栏纯逻辑模型 (buildCollectionGroups / getRequestStatusBadge / relativeTime)
- `styles/tokens.css`: 共享样式 token

## 4. Workbench 优先运行模型

主运行表面仍是 `workbench`。Sidebar 当前作为可选独立入口保留, 但工作台已包含完整左侧交互。

Vite 构建配置保持不变。

## 5. 工作台运行模型

工作台由 `HttpClientPanelController` 驱动。

### 5.1 首屏与启动

主要流程:

1. 用户执行 `mx http open` / `mx http send` / `mx http save` / `mx http import curl` / `mx http load test`
2. 宿主打开或复用 `WebviewPanel`
3. `panel.ts` 调用 `getHttpClientHtml(...)` -> `getReactWorkbenchHtml(...)`
4. HTML 注入 bootstrap `window.__MX_HTTP_CLIENT_BOOTSTRAP__ = { buildId, surface, initialState }`
5. React 前端启动后向宿主发送 `httpClient/init`
6. `initialState` 作为首屏 snapshot 被前端消费

### 5.2 Local-first 运行边界

Webview 持有工作台会话态:

- `activeRequestId`
- `activeEnvironmentId`
- `draft`
- `response` (或 req.lastResponseSnapshot 自动加载)
- `requestRunning`
- `loadTestProfile`
- `loadTestResult`
- `loadTestProgress`
- `dirty`
- `activeTab`
- `responseTab`

Host 持有持久化与副作用能力:

- `mx_http_client.json` 配置
- 请求草稿持久化
- 普通请求执行与取消
- 压测执行
- cURL 导入与导出
- VS Code API, Toast 与命令入口

### 5.3 集合与请求数据流

新数据模型的核心:

- **集合内嵌请求**: `HttpCollectionEntity.requests: HttpRequestEntity[]`, 不再有平行 `requests[]` 数组
- **默认集合接管历史**: 发送请求时, 按 `method+url` 在所有集合里查找:
  - 命中 → 更新 `lastStatus / lastDurationMs / lastExecutedAt / lastResponseSnapshot`
  - 未命中 → 自动创建到默认集合顶部
- **选择请求自动加载快照**: `selectRequestLocally(viewState, requestId)` 会自动把 `req.lastResponseSnapshot` 加载到 `viewState.response`, 用户切回历史请求能立即看到响应
- **跨集合拖拽**: `moveRequest(requestId, targetCollectionId)` 在 store 层搬运请求并保留 `lastResponseSnapshot`

### 5.4 侧边栏 UI 行为

#### 5.4.1 集合 tab

- 每个集合是可折叠分组, 默认集合带 🔒 标识 + 不可删除/重命名
- 请求行紧凑显示: `method pill + name + 状态码 · 耗时 · 相对时间`
- 状态码颜色编码: 2xx 绿 (ok), 4xx 黄 (warn), 5xx 红 (err), 未运行灰 (neutral)
- 空集合显示引导文案 ("拖入 URL 或右击新建请求")
- 拖拽: `req-item` 可拖到任意 `collection-body`, 目标区域显示蓝色虚线 drop 提示
- 集合右键: 新建请求 / 重命名 / 删除 (默认集合只有"新建请求")
- 请求右键: 加载到编辑器 / 复制 URL / 复制为 cURL / 重命名 / 删除 (5 项)

#### 5.4.2 环境 tab

- 环境列表 + 激活切换
- 环境编辑卡片 (名称 + key/value 变量列表)
- 环境右键: 保存环境 / 删除环境

### 5.5 响应区

响应区当前的正式行为:

- `Body` 默认显示非 Pretty 的文本视图
- `切换 Raw` 切到轻量转义视图
- `编辑` 按钮请求 Host 在当前工作台所在标签组中打开一个新的临时文档

## 6. 外部入口运行模型

外部入口:

1. 状态栏按钮 `HTTP Client`
2. 命令面板命令 `mx http open`

入口行为: 宿主打开或复用 `WebviewPanel`, 工作台承担完整三栏交互。

## 7. Bootstrap 与构建一致性

React HTML 向全局注入:

```js
window.__MX_HTTP_CLIENT_BOOTSTRAP__ = {
  buildId,
  surface,
  initialState,
};
```

工作台宿主会保存当前 `buildId` 并使用 `HTTP_CLIENT_WEBVIEW_BUILD_ID` 校验当前 Webview 是否是预期构建。如果不一致, Host 会重建 HTML 并重新注入最新 snapshot。

## 8. 消息协议边界

### 8.1 工作台关键消息

前端到宿主:

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
- `httpClient/renameRequest` (含 name payload)
- `httpClient/deleteRequest`
- `httpClient/duplicateRequest`
- `httpClient/moveRequest` (拖拽跨集合)
- `httpClient/exportCurl` (复制为 cURL)
- `httpClient/selectEnvironment`
- `httpClient/saveEnvironment`
- `httpClient/deleteEnvironment`
- `httpClient/openResponseEditor`
- `httpClient/loadTest/start`
- `httpClient/loadTest/stop`
- `httpClient/responseAck`
- `mxToast/notify`

宿主到前端:

- `httpClient/state`
- `httpClient/curl` (响应 `exportCurl` 请求, 携带完整 cURL 字符串)
- `httpClient/response`
- `httpClient/loadTest/progress`
- `httpClient/loadTest/result`
- `httpClient/error`
- `httpClient/hostCommand`
- `mxToast/show`

约束:

- `httpClient/state` 只用于结构性刷新、外部命令打开、异步落盘刷新和异常恢复
- `httpClient/response`、`httpClient/loadTest/progress`、`httpClient/loadTest/result` 负责把执行结果推回前端
- 高频选择动作不再由 Host 用整包 `state` 进行二次确认

### 8.2 外部入口

状态栏按钮直接绑定命令 `mx-dev-toolkit.httpClient.openWorkbench`。

## 9. Toast 集成

HTTP Client 直接接入 `ToastService`:

1. 工作台 host `httpClient.panel` 优先级 `100`
2. 无可用 Webview 时回退到原生 `showErrorMessage` / `showWarningMessage` / `showInformationMessage`

## 10. 关于旧 UI 文件

仓库中不再保留 `src/http_client/webview/ui/*` 旧 UI 文件 (已迁移到 React 后清理)。`src/http_client/sidebar_view.ts` 也已废弃, 外部入口仅保留状态栏按钮和 `mx http open` 命令。

`src/http_client/webview/styles.ts` 保留作为内联样式 fallback, 但不在主路径使用。

## 11. 构建与测试

### 11.1 构建

- `pnpm compile:webview`: 构建 React Webview 到 `media/http_client/`
- `pnpm compile:extension`: 打包扩展宿主到 `out/extension.js`
- `pnpm compile`: 先 Webview, 后宿主

### 11.2 测试

宿主侧测试:

- `src/http_client/tests/store.test.ts`: 配置初始化, 嵌套集合, 快照持久化, 默认集合保护
- `src/http_client/tests/panel.test.ts`: 发送请求后自动 upsert 集合快照, 加载 lastResponseSnapshot, 跨集合移动, 导出 cURL, 默认集合删除保护
- `src/http_client/tests/curl_import.test.ts`
- `src/http_client/tests/load_runner.test.ts`
- `src/http_client/tests/runner.test.ts`
- `src/http_client/tests/resolver.test.ts`
- `src/http_client/tests/register.test.ts`
- `src/http_client/tests/react_loader.test.ts`

前端侧测试:

- `webviews/http_client/tests/sidebar_model.test.ts`: 集合筛选, 默认集合保护, 状态徽章, 时间工具
- `webviews/http_client/tests/workbench_model.test.ts`: 纯逻辑函数, local-first session patch, lastResponseSnapshot 自动加载, moveRequestLocally
- `webviews/http_client/tests/component_contract.test.ts`: 工作台三栏接线, 侧边栏集合页 + 环境页契约

对应脚本:

- `pnpm test:http-client:core`
- `pnpm test:http-client:webview`
- `pnpm test:http-client`

## 12. 手动验收建议

最小验收路径:

1. 点击状态栏 `HTTP Client`, 进入完整工作台
2. 在工作台左栏切换 `集合 / 环境`
3. 编辑 URL 发送一个全新请求, 验证自动出现在默认集合顶部
4. 再次发送相同 URL, 验证快照被更新 (不新建条目)
5. 拖拽请求到另一个集合, 验证移动成功
6. 右击请求 → 复制为 cURL, 验证剪贴板有 cURL 命令
7. 切换环境并验证变量解析
8. 启动一次压测并确认进度/结果展示
9. 检查 Toast 在工作台与原生回退路径上的表现

## 13. 后续维护原则

- 当前正式事实以本文件与 `docs/设计.md` 为准。
- 旧 UI 代码路径不再保留, 任何"历史兼容"都属于一次性迁移动作, 不应回流覆盖正式设计。
- 新增 UI 变更时, 优先复用 `shared/sidebar_model.ts` 与 `shared/workbench_model.ts` 提供的纯函数。
- `mx_http_client.json` 配置版本已升到 `2`, 旧版本会被 store 检测后丢弃并重置 (采用破坏性升级策略)。

