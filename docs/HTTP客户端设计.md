# HTTP 客户端工作台设计

最后更新: 2026-04-13

## 1. 背景与目标

本功能用于在 `mx-dev-toolkit` 中新增一个内置的 HTTP Client 工作台, 面向日常接口调试, 环境切换, 请求复用, 响应分析和小规模压测.

设计目标如下:

1. 简洁直观. 用户打开面板后, 能在一屏内完成主要操作.
2. 操作方便. 常见动作应尽量在 1 到 3 次交互内完成.
3. 可沉淀. 请求集合, 环境配置和常用接口应可随项目保存和复用.
4. 可观察. 响应状态, 耗时, 响应体, Header 和压测结果应清晰可读.
5. 可扩展. 第一版不做 GraphQL 等高级协议, 但模块边界需要为后续扩展预留空间.

本设计以 MVP 为边界, 优先支持:

- `GET/POST/PUT/DELETE/PATCH`
- URL, Query, Header, Raw Body
- JSON Body 格式化
- 环境变量替换, 例如 `{{baseUrl}}`
- 响应区 `Body/Headers/Meta`
- 请求历史
- cURL 导入
- 请求集合持久化
- 小规模压测

当前明确不在第一版范围内:

- GraphQL
- WebSocket
- gRPC
- OAuth 流程
- Cookie Jar
- 文件上传
- Pre-request / Post-response 脚本
- 大规模专业压测

## 2. 设计原则

### 2.1 单工作台优先

核心思路不是复制 Postman 或 Thunder Client 的复杂多页结构, 而是做一个以单工作台为中心的高频调试面板. 用户应在同一个面板内完成:

- 选择请求
- 编辑请求
- 发送请求
- 查看响应
- 查看历史
- 发起压测

### 2.2 文本与 GUI 结合

请求内容允许通过 GUI 编辑, 但请求集合和环境配置必须以文本文件落地, 便于:

- 进入 Git 版本管理
- 在多人或多机器间同步
- 批量修改和搜索
- 后续兼容文本导入导出能力

### 2.3 先做顺手, 再做复杂

第一版只实现最常用的能力, 但交互必须顺滑. 例如:

- `Ctrl+Enter` 发送
- 自动保存草稿
- 最近历史一键重放
- 响应 JSON 自动格式化
- 压测配置最少化

### 2.4 压测定位清晰

第一版压测定位为 "开发调试用的小规模压测", 目标是帮助用户快速验证:

- 接口是否稳定
- 版本前后是否明显变慢
- 错误率是否异常
- 基本吞吐能力和响应分布

它不是 `wrk`, `k6`, `JMeter` 的替代品.

## 3. 用户场景

### 3.1 日常接口调试

开发者在工作区内打开 HTTP Client 面板, 选择某个已保存请求, 修改 Query 或 JSON Body, 发送请求后立即查看响应结果.

### 3.2 多环境切换

开发者在 `dev`, `test`, `prod-readonly` 等环境间切换, URL 和 Token 自动替换, 不需要手工修改请求内容.

### 3.3 历史重放

开发者临时调试一个请求后, 希望在几分钟后能从历史中直接重放, 并查看之前的响应时间和状态.

### 3.4 快速导入

开发者从浏览器, 终端或后端文档中拿到一段 `cURL`, 粘贴后即可生成请求并发送.

### 3.5 小规模压测

开发者对当前请求直接设置 `总请求数`, `并发数`, `超时`, 点击开始压测后查看:

- 成功率
- 平均耗时
- P95
- 最大耗时
- RPS
- 状态码分布
- 错误样本

## 4. 整体交互结构

### 4.1 工作台布局

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ VS Code Activity Bar / Side Bar                                            │
│ - 新建请求                                                                   │
│ - 历史 / 集合 / 环境                                                         │
│ - 搜索与高频导航                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 中间编辑区                                      │ 右侧结果区               │
│ [Method] [URL..........................] [Env]  │ 状态 / 耗时 / 大小       │
│ [发送] [压测] [保存] [导入 cURL]                │ Tabs: Body / Headers     │
│                                                 │       / Meta / 压测结果  │
│ 请求编辑区                                      │                          │
│ Tabs: Params | Headers | Body                  │                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 核心布局说明

- VS Code 原生侧边栏用于请求组织与导航, 承担历史, 集合和环境切换.
- 中间编辑区用于 URL, Header, Params 和 Body 编辑.
- 右侧结果区用于稳定展示响应详情与压测结果.
- 顶部操作栏只保留高频操作, 避免占用过多垂直空间.

这种布局的目标是贴近 Thunder Client 与桌面 IDE 的工作流, 减少视线往返距离, 并把最宝贵的主工作区宽度优先留给 URL 编辑和响应查看.

## 5. 详细交互设计

### 5.1 顶部操作栏

顶部操作栏字段:

- Method 下拉框
- URL 输入框
- Environment 下拉框
- `发送` 按钮
- `压测` 按钮
- `保存` 按钮
- `导入 cURL` 按钮

交互要求:

- `Ctrl+Enter` 发送当前请求
- `Ctrl+S` 保存当前请求
- URL 输入框支持粘贴后自动去除首尾空白
- 请求发送中, `发送` 按钮显示 loading 状态
- 压测运行中, `压测` 按钮切换为 `停止`

### 5.2 左侧栏

左侧栏包含 3 个标签页:

1. 记录
2. 集合
3. 环境

记录能力:

- 基于最近 `30` 条执行记录展示
- 底层仍保留每次执行历史, 不做按 URL 覆盖
- 展示层按请求维度分组, 同一请求多次测试归为一组
- 组头展示最近一次状态, 耗时, 执行时间和总次数
- 点击组头恢复该组最近一次执行
- 展开后可查看该组最近几次执行明细
- 点击明细可恢复指定历史记录

集合能力:

- 新建集合
- 新建请求
- 重命名
- 复制请求
- 删除请求
- 拖拽排序可作为后续增强项, 第一版可不做

环境能力:

- 切换当前环境
- 新建环境
- 展示当前环境变量数量

### 5.3 请求编辑区

请求编辑区包含 3 个标签页:

- Params
- Headers
- Body

#### Params

- 二列表格形式, `Key` 和 `Value`
- 每一项有启用开关
- URL Query 与 Params 互相同步
- 如果用户直接编辑 URL 中的 Query, 发送前重新解析覆盖 Params 视图

#### Headers

- 二列表格形式, `Key` 和 `Value`
- 每一项有启用开关
- 常见 Header 可提供快速插入, 例如 `Content-Type`, `Authorization`

#### Body

- 支持 `raw` 文本模式
- 支持 `JSON` 格式化模式
- 仅在方法允许 Body 时展示编辑器
- JSON 模式下提供 `格式化` 按钮

### 5.4 响应结果区

结果区包含 4 个标签页:

- Body
- Headers
- Meta
- 压测结果

Body:

- 文本响应直接展示
- JSON 响应由扩展宿主完成解析和格式化
- 支持 `Pretty / Raw` 切换
- Pretty 模式支持 JSON 语法高亮
- 支持文本搜索
- 复制操作使用内容区右上角图标
- 复制内容始终以当前展示文本为准
- 合法 JSON 中的 Unicode 转义必须显示为真实字符, 不允许在前端通过正则做临时解码

Headers:

- 展示响应 Header 列表
- 支持复制 Header 值

Meta:

- 展示状态码
- 状态文本
- 请求开始时间
- 总耗时
- 响应大小
- 最终 URL
- 重定向信息

压测结果:

- 仅在执行压测后展示
- 展示关键指标和错误样本
- 支持重置结果

### 5.5 导入 cURL

支持用户粘贴一段 cURL 字符串, 自动解析出:

- Method
- URL
- Header
- Body

对于解析失败场景:

- 显示错误原因
- 保留用户原始文本
- 不覆盖现有请求内容, 除非用户确认替换

### 5.6 草稿与自动保存

当前正在编辑但未保存的请求内容应自动保存在 `workspaceState`, 用于:

- 面板关闭重开后恢复状态
- 避免误操作导致内容丢失
- 支持正在编辑的临时请求

## 6. 功能边界

### 6.1 第一版支持能力

- HTTP 常用方法
- Query 参数编辑
- Header 编辑
- Raw Body 与 JSON 格式化
- 环境变量替换
- 请求集合持久化
- 历史记录
- 收藏
- cURL 导入
- 普通请求发送
- 小规模压测

### 6.2 第一版不支持能力

- 二进制响应预览
- Multipart 文件上传
- Cookie 自动管理
- HTTP/2 专项能力
- 请求链路编排
- 断言脚本
- 复杂认证流程

## 7. 数据模型设计

### 7.1 TypeScript 类型

```ts
export interface HttpKeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface HttpRequestEntity {
  id: string;
  collectionId: string | null;
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;
  params: HttpKeyValue[];
  headers: HttpKeyValue[];
  bodyMode: "none" | "raw" | "json";
  bodyText: string;
  favorite: boolean;
  updatedAt: string;
}

export interface HttpEnvironmentEntity {
  id: string;
  name: string;
  variables: Record<string, string>;
}
```

### 7.2 工作区配置文件

建议新增工作区根目录文件:

- `mx_http_client.json`

示例结构:

```json
{
  "version": 1,
  "collections": [
    {
      "id": "col_user_service",
      "name": "用户服务"
    }
  ],
  "requests": [
    {
      "id": "req_get_products",
      "collectionId": "col_user_service",
      "name": "获取产品列表",
      "method": "POST",
      "url": "{{baseUrl}}/ehong/tool/GetProductList",
      "params": [],
      "headers": [
        {
          "id": "hdr_content_type",
          "key": "Content-Type",
          "value": "application/json",
          "enabled": true
        }
      ],
      "bodyMode": "json",
      "bodyText": "{\n  \"user\": \"ehong\"\n}",
      "favorite": true,
      "updatedAt": "2026-04-13T10:00:00.000Z"
    }
  ],
  "environments": [
    {
      "id": "env_dev",
      "name": "dev",
      "variables": {
        "baseUrl": "http://iot.iotim.com/ehong",
        "token": ""
      }
    }
  ]
}
```

设计理由:

- 集合和请求跟随工作区, 适合进 Git.
- 结构简单, 易于手工编辑和导出.
- 后续可通过 `version` 字段支持升级迁移.

### 7.3 本地状态存储

使用 `context.workspaceState` 保存:

- 当前打开的请求 ID
- 当前激活环境 ID
- 未保存草稿
- 最近历史索引
- 最近压测配置

建议使用的 key:

- `httpClient.activeRequestId`
- `httpClient.activeEnvironmentId`
- `httpClient.draft.<requestId>`
- `httpClient.history`
- `httpClient.lastLoadProfile`

### 7.4 敏感数据策略

第一版环境变量暂时全部存储在 `mx_http_client.json`.

文档需明确提醒:

- 不建议在该文件中存储生产密钥
- 如确有敏感变量需求, 后续版本引入 `SecretStorage`

### 7.5 响应结果模型

响应结果模型需要同时保留"传输原文"和"展示文本", 避免 UI 为了显示中文或 Pretty JSON 再做二次猜测.

```ts
export interface HttpResponseResult {
  requestId: string;
  recordId: string;
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  finalUrl: string;
  startedAt: string;
  headers: HttpKeyValue[];
  unresolvedVariables: string[];
  isJson: boolean;
  bodyRawText: string;
  bodyText: string;
  bodyPrettyText: string;
}
```

字段约束:

- `bodyRawText`
  - 保存网络返回的原始文本
  - 用于大小统计, 原始回溯和后续问题排查
- `bodyText`
  - 作为 Raw 视图的展示文本
  - 对合法 JSON, 由宿主执行 `JSON.parse` 后再 `JSON.stringify(parsed)` 生成标准化文本
- `bodyPrettyText`
  - 作为 Pretty 视图的展示文本
  - 对合法 JSON, 由宿主执行 `JSON.stringify(parsed, null, 2)` 生成

这样可以确保:

- 原始传输内容不丢失
- Raw / Pretty 都基于同一份已解析 JSON
- `\uXXXX` 在展示层呈现为真实字符
- Webview 只负责展示, 不承担 JSON 解码和纠错职责

## 8. 环境变量解析规则

### 8.1 支持语法

支持 `{{variableName}}` 形式的占位符, 可出现在:

- URL
- Query
- Header
- Body

### 8.2 解析顺序

建议解析优先级如下:

1. 当前请求内临时变量
2. 当前激活环境变量
3. 全局默认变量

第一版可以只实现:

1. 当前激活环境变量

并在代码中预留扩展位.

### 8.3 解析失败策略

如果存在未能解析的变量:

- 默认允许发送
- UI 中提示 `存在未解析变量`
- Meta 中记录未解析变量列表

原因是阻塞发送会降低调试效率, 而某些接口允许服务端处理占位文本.

## 9. 请求执行设计

### 9.1 技术选型

扩展当前运行目标为 Node 18, 可直接使用原生 `fetch` 实现请求发送, 避免引入额外依赖.

优点:

- 依赖少
- 维护成本低
- 与当前构建链路兼容

### 9.2 执行流程

```text
UI 请求发送
   │
   ▼
参数收集
   │
   ▼
环境变量替换
   │
   ▼
规范化请求对象
   │
   ▼
AbortController + fetch
   │
   ▼
响应解析
   │
   ├── Body 文本
   ├── Header 列表
   └── Meta 指标
   ▼
写入历史并回传 UI
```

### 9.3 超时与取消

- 普通请求默认超时建议 `30s`
- 使用 `AbortController` 实现取消
- 面板关闭或用户主动取消时中断请求

### 9.4 响应处理

第一版统一按文本读取响应体, 再根据 `content-type` 决定是否进行 JSON 解析和展示标准化.

处理规则:

1. 始终先读取 `bodyRawText`
2. 若判定为 JSON:
   - 使用宿主侧 `JSON.parse(bodyRawText)` 解析
   - `bodyText = JSON.stringify(parsed)`
   - `bodyPrettyText = JSON.stringify(parsed, null, 2)`
3. 若不是 JSON:
   - `bodyText = bodyRawText`
   - `bodyPrettyText = bodyRawText`
4. `sizeBytes` 仍基于 `bodyRawText` 计算

设计要求:

- 不在 Webview 里通过字符串替换或正则去解 `\uXXXX`
- JSON 的 Raw / Pretty 展示必须共享同一宿主解析结果
- 前端只消费 `HttpResponseResult`, 不重复推断响应编码语义

这样设计的原因:

- 简化实现
- 降低二进制处理复杂度
- 覆盖绝大多数接口调试场景
- 避免 JSON 响应中中文显示异常
- 避免前端临时兼容逻辑和宿主解析结果不一致

## 10. 压测设计

### 10.1 压测定位

压测只针对当前请求执行, 不独立维护另一套配置模型. 用户在当前请求上下文中直接设置:

- 总请求数
- 并发数
- 单请求超时

### 10.2 压测执行模型

第一版在扩展宿主内执行并发调度. 调度器逻辑:

```text
初始化任务池
   │
   ▼
按并发数启动 worker
   │
   ▼
每个 worker 循环领取任务
   │
   ▼
发送请求并记录耗时与状态
   │
   ▼
汇总统计结果
   │
   ▼
实时回传 UI
```

### 10.3 压测限制

为避免拖垮 Extension Host, 第一版加入硬限制:

- 并发数最大 `50`
- 总请求数最大 `10000`
- 超时最大 `120s`

超出时:

- UI 拒绝启动
- 给出明确提示

### 10.4 压测结果指标

必须输出:

- 总请求数
- 成功数
- 失败数
- 成功率
- 平均耗时
- 最小耗时
- P50
- P95
- 最大耗时
- RPS
- 状态码分布
- 错误样本

建议错误样本保留前 `20` 条.

### 10.5 压测结果展示

结果区显示:

- 顶部摘要卡片
- 状态码分布表
- 错误样本列表

第一版可先不做图表, 仅做数据表格和摘要数字.

### 10.6 后续演进方向

如未来需要更强压测能力, 文档中预留两种升级路径:

1. Node Worker 线程化执行
2. 调用 `eh_keil_tool` 之外的新 Rust 子进程执行压测核心

## 11. 模块设计

为保持与当前仓库结构一致, 建议新增:

```text
src/
└─ http_client/
   ├─ register.ts
   ├─ panel.ts
   ├─ store.ts
   ├─ resolver.ts
   ├─ runner.ts
   ├─ load_runner.ts
   ├─ types.ts
   ├─ webview/
   │  ├─ index.ts
   │  ├─ state.ts
   │  └─ ui/
   └─ tests/
      ├─ store.test.ts
      ├─ resolver.test.ts
      ├─ runner.test.ts
      └─ load_runner.test.ts
```

模块职责:

- `register.ts`
  - 注册命令
  - 注册 TreeView 或 Webview 打开入口
  - 装配输出通道和状态服务

- `panel.ts`
  - 管理 WebviewPanel 生命周期
  - 处理前后端消息通信

- `store.ts`
  - 读写 `mx_http_client.json`
  - 管理集合, 请求, 环境

- `resolver.ts`
  - 变量替换
  - 未解析变量收集

- `runner.ts`
  - 普通请求执行
  - 超时, 取消, 响应转换

- `load_runner.ts`
  - 并发调度
  - 压测指标统计

- `types.ts`
  - 统一数据结构

- `webview/`
  - 前端状态与视图层

## 12. VS Code 集成设计

### 12.1 命令清单

建议注册以下命令:

- `mx-dev-toolkit.httpClient.openWorkbench`
- `mx-dev-toolkit.httpClient.sendCurrent`
- `mx-dev-toolkit.httpClient.saveCurrent`
- `mx-dev-toolkit.httpClient.importCurl`
- `mx-dev-toolkit.httpClient.runLoadTest`

命令标题建议:

- `mx http open`
- `mx http send`
- `mx http save`
- `mx http import curl`
- `mx http load test`

### 12.2 入口建议

第一版建议提供两个入口:

1. Command Palette 命令打开
2. Activity Bar 内的 HTTP Client 侧边栏导航

侧边栏应提供:

- `新建请求` 主按钮
- `历史 / 集合 / 环境` 三类切换
- 搜索输入框
- 高频请求与环境的紧凑列表

主工作台则专注于:

- 请求编辑
- 请求发送
- 响应查看
- 压测结果展示

### 12.3 输出通道

复用现有 `mx-dev-toolkit` 输出通道, 日志前缀建议:

- `[HttpClient]`
- `[HttpLoadTest]`
- `[HttpClientWebview]`

输出内容包括:

- 请求发送开始与结束
- URL 和方法
- 请求取消
- 压测启动参数
- 压测完成摘要
- 异常信息
- Webview 启动 build 信息
- Webview 响应渲染确认和前端异常

建议将普通请求链路日志细化为:

- `request started`
- `request resolved`
- `send <METHOD> <URL>`
- `response <status> ...`
- `response delivered=<boolean>`
- `response ack source=<...>`
- `request cycle completed`

## 13. 前后端消息协议

Webview 与扩展宿主之间建议采用显式消息协议:

```ts
type WebviewToExtensionMessage =
  | { type: "httpClient/init"; payload?: { buildId?: string } }
  | { type: "httpClient/send"; payload: SendRequestPayload }
  | { type: "httpClient/save"; payload: SaveRequestPayload }
  | { type: "httpClient/importCurl"; payload: { raw: string } }
  | { type: "httpClient/loadTest/start"; payload: LoadTestPayload }
  | { type: "httpClient/loadTest/stop" }
  | { type: "httpClient/responseAck"; payload: { source: "bootstrap" | "state" | "response" } }
  | { type: "httpClient/frontendLog"; payload: { level: "info" | "warn" | "error"; scope: string; message: string } };

type ExtensionToWebviewMessage =
  | { type: "httpClient/state"; payload: HttpClientViewState }
  | { type: "httpClient/response"; payload: HttpResponseResult }
  | { type: "httpClient/error"; payload: { message: string } }
  | { type: "httpClient/loadTest/progress"; payload: LoadTestProgress }
  | { type: "httpClient/loadTest/result"; payload: LoadTestResult };
```

设计要求:

- 所有消息都带显式 `type`
- 扩展层做参数校验
- 未知消息直接忽略并记录日志
- `httpClient/init` 应回传前端 `buildId`, 用于识别旧 Webview 实例
- 请求成功后, Webview 必须回传 `responseAck`
- 若扩展在超时时间内未收到 `responseAck`, 应使用当前状态主动重建 Panel, 不能让界面长期停留在 `正在发送请求...`

## 14. UI 状态设计

前端状态建议至少包含:

- 当前请求
- 当前环境
- 集合树
- 收藏列表
- 历史列表
- 当前响应
- 当前压测状态
- 未保存状态标记

关键状态字段:

```ts
interface HttpClientViewState {
  activeRequestId: string | null;
  activeEnvironmentId: string | null;
  requests: HttpRequestEntity[];
  collections: HttpCollectionEntity[];
  environments: HttpEnvironmentEntity[];
  history: HttpHistoryRecord[];
  response: HttpResponseResult | null;
  loadTest: LoadTestUiState | null;
  dirty: boolean;
}
```

## 15. 错误处理与用户反馈

### 15.1 普通请求错误

错误分为:

- 变量解析错误
- 网络连接错误
- 超时错误
- 用户取消
- 状态码非 2xx

处理原则:

- 非 2xx 不视为运行失败, 仍正常展示响应
- 超时和网络错误给出清晰提示
- 用户取消要有明显状态反馈

### 15.2 压测错误

压测中错误请求不应中断整个压测任务, 除非:

- 用户主动停止
- 调度器内部异常

错误应被记录到:

- 错误样本列表
- 输出通道
- 结果摘要

### 15.3 Webview 响应渲染失步问题

在实际实现和验收过程中, 出现过以下问题:

- HTTP 请求真实成功, 输出通道可见 `response 200 OK`
- `response delivered=true`
- 历史记录也已落盘
- 但 UI 仍停留在 `正在发送请求...` 和 `请求中`

该问题说明:

- 宿主侧请求执行链路已完成
- 但 Webview 侧没有稳定消费 `httpClient/response`, 或当前仍是旧版前端实例

根因分为两类:

1. Webview 旧实例仍在运行, 前后端脚本版本不一致
2. `httpClient/response` 消息已投递, 但前端渲染链路没有完成或未回写状态

最终解决办法:

1. `httpClient/init` 增加 `buildId`, 扩展宿主检测旧 Webview 后主动重建 Panel
2. Webview 启动时输出 `bootstrap` 日志, 并将前端异常通过 `httpClient/frontendLog` 回传到 OUTPUT
3. Webview 在成功渲染响应后必须发送 `httpClient/responseAck`
4. 扩展宿主在发送响应后启动 ack 等待定时器
5. 若在超时时间内未收到 ack, 宿主使用 `currentResponse` 和当前状态重新生成 Webview HTML, 强制恢复界面

这条约束属于稳定性设计, 不是临时调试代码, 后续实现必须保留.

### 15.4 JSON 展示与 Unicode 转义问题

在响应区优化过程中, 出现过以下问题:

- 接口返回的是合法 JSON
- 原始文本中包含 `\u83b7\u53d6\u6210\u529f` 这类 Unicode 转义
- 前端若直接展示原始文本, 用户看到的是转义串而不是真实中文
- 若在 Webview 里用正则替换 `\uXXXX`, 只能覆盖部分场景, 且容易与真实转义语义冲突

最终结论:

- 这不是前端样式问题, 而是响应模型职责边界问题
- 专业做法应当是"宿主标准化, 前端只展示"

最终解决办法:

1. `HttpResponseResult` 增加 `bodyRawText`, 用于保存网络原始文本
2. 对合法 JSON, 宿主统一执行 `JSON.parse` 和 `JSON.stringify`
3. Webview 的 Raw / Pretty 直接读取 `bodyText` 和 `bodyPrettyText`
4. Pretty 模式额外做只读语法高亮, 但不再负责 Unicode 解码
5. 复制操作复制当前展示文本, 保证与用户看到的内容一致

这条约束属于响应模型设计原则, 后续不得退回到"前端正则解码 JSON Unicode"方案.

### 15.5 Webview 模板字符串拼接语法问题

在新增响应区复制图标和 JSON 高亮后, 曾出现以下问题:

- `pnpm compile` 和 `pnpm lint` 均通过
- `pnpm test:http-client` 失败
- `webview_state.test.ts` 中 `vm.Script` 报错 `Unexpected token ')'`

根因:

- `renderBodyContent()` 中 HTML 字符串拼接末尾残留尾随 `+`
- 该问题只会在生成后的内联脚本解析阶段暴露, TypeScript 类型检查无法捕获

最终解决办法:

1. 保留 `webview_state.test.ts` 对生成脚本的 `vm.Script` 语法校验
2. 每次修改 Webview 内联模板后, 必须执行 `pnpm test:http-client`
3. 将内联脚本语法正确性视为 HTTP Client 的回归验收项

## 16. 测试设计

根据仓库测试规范, 该模块必须同时提供模块化测试, 流程输出和日志落盘.

### 16.1 测试目录

```text
src/http_client/tests/
├─ resolver.test.ts
├─ store.test.ts
├─ runner.test.ts
└─ load_runner.test.ts
```

### 16.2 测试覆盖点

`resolver.test.ts`

- [流程] 环境变量替换成功
- [流程] 未解析变量收集
- [流程] Body, Header, URL 多位置替换

`store.test.ts`

- [流程] 新建集合并持久化
- [流程] 保存请求并重新加载
- [流程] JSON 升级字段兼容

`runner.test.ts`

- [流程] 正常请求响应解析
- [流程] 超时取消
- [流程] JSON 响应格式化
- [流程] `bodyRawText` 保留原始传输文本
- [流程] JSON 展示文本标准化后可正确显示中文
- [流程] Header 透传

`load_runner.test.ts`

- [流程] 并发调度正确执行
- [流程] 统计指标计算正确
- [流程] 中途取消
- [流程] 错误样本上限裁剪

`panel.test.ts`

- [流程] 响应结果应先回推到界面, 历史记录异步持久化
- [流程] Webview 未确认响应时, Panel 应自动按当前状态重载

`webview_state.test.ts`

- [流程] Webview 脚本文本可被浏览器解释执行
- [流程] 启动脚本包含 build 和消息处理基础链路
- [流程] JSON 高亮和响应复制按钮逻辑存在

### 16.3 日志落盘

按仓库规范, 测试日志目录建议:

- `logs/mx-dev-toolkit/tests/`

建议文件:

- `logs/mx-dev-toolkit/tests/http_client_resolver.txt`
- `logs/mx-dev-toolkit/tests/http_client_store.txt`
- `logs/mx-dev-toolkit/tests/http_client_runner.txt`
- `logs/mx-dev-toolkit/tests/http_client_load_runner.txt`

日志格式建议:

- `[本地时间][流程] ...`
- `[本地时间][步骤] ...`
- `[本地时间][验证] ...`
- `[本地时间][结论] ...`

### 16.4 Skill 更新要求

实现阶段需要同步新增:

- `.codex/skills/mx_dev_toolkit_tests/SKILL.md`

至少包含:

- HTTP Client 模块测试清单
- 分模块执行命令
- 验收标准
- 日志分析步骤
- 新增测试接入流程

## 17. 实施阶段建议

### 阶段 1. 核心内核

目标:

- `store.ts`
- `resolver.ts`
- `runner.ts`
- 基础测试

产出:

- 可读写请求集合
- 可执行普通请求
- 可解析环境变量

### 阶段 2. 工作台 MVP

目标:

- WebviewPanel
- 请求编辑 UI
- 响应展示 UI
- 历史和收藏

产出:

- 可用的一体化工作台

### 阶段 3. 压测 MVP

目标:

- `load_runner.ts`
- 压测配置 UI
- 压测结果 UI
- 压测测试

产出:

- 小规模压测能力

### 阶段 4. 打磨

目标:

- 错误提示优化
- 草稿恢复
- cURL 导入增强
- 操作快捷键和复制能力

## 18. 后续规划

以下内容不进入第一版, 但应在后续规划文档中保留:

1. GraphQL 查询编辑和变量管理
2. WebSocket 调试
3. gRPC 调试
4. OAuth 流程辅助
5. Cookie Jar 管理
6. Multipart 文件上传
7. 请求前后脚本
8. 更高强度压测引擎
9. 敏感变量进入 `SecretStorage`
10. 响应断言和自动测试

## 19. 验收标准

第一版完成后, 至少满足以下验收标准:

1. 用户可以在工作台内新建请求, 填写 URL 和 Body, 并成功发送.
2. 用户可以保存请求到集合文件, 重启 VS Code 后仍能恢复.
3. 用户可以通过环境变量切换不同服务地址.
4. 用户可以查看 Body, Headers 和 Meta 三类响应信息.
5. 用户可以从历史中重放请求.
6. 用户可以导入 cURL 生成请求.
7. 用户可以基于当前请求执行小规模压测并看到关键指标.
8. 模块具备独立测试, 测试日志按规范落盘.
9. 请求成功后, UI 不得长期停留在 `正在发送请求...` 或 `请求中`.
10. 遇到旧 Webview 实例或响应消息未消费时, 工作台应能自动恢复显示结果.

## 20. 最终结论

该 HTTP Client 功能应被实现为 `mx-dev-toolkit` 内的独立模块, 采用 `单工作台 + 文本持久化 + 小规模压测` 的设计路线.

它的核心价值不在于功能数量, 而在于以下几点是否顺手:

- 打开即用
- 编辑路径短
- 环境切换快
- 响应展示清晰
- 历史重放方便
- 压测入口直接

只要这 6 点做好, 第一版就已经具备高频实用价值, 后续再逐步扩展高级协议和更强压测能力.
