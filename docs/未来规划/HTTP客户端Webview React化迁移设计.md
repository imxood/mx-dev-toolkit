# HTTP 客户端 Webview React 化迁移设计

最后更新: 2026-04-14

## 1. 文档定位

本文档只讨论 `HTTP Client` 的 Webview 技术栈迁移, 不讨论产品功能扩展和视觉改版.

当前正式事实源如下:

- 现状设计: [../HTTP客户端设计.md](../HTTP客户端设计.md)
- 当前稳定基线提交: `7813a4c`

本文档的唯一目标是:

1. 在技术实现上从当前的字符串模板 Webview 迁移到 `React + TailwindCSS + TypeScript`.
2. 在迁移过程中保持当前功能完全一致.
3. 在迁移过程中保持当前 UI 完全一致.
4. 保持现有消息协议, 宿主逻辑和数据模型不变.

## 2. 当前实现现状

当前实现并不是 React 架构, 而是扩展宿主侧以 TypeScript 生成 Webview HTML, 并内联脚本和样式.

当前关键入口如下:

- 工作台 HTML 组装: `src/http_client/webview/index.ts`
- 工作台脚本生成: `src/http_client/webview/state.ts`
- 侧边栏 HTML 与脚本: `src/http_client/sidebar_view.ts`
- 协议与视图模型: `src/http_client/types.ts`

当前方案已经可用, 但随着功能增加, 有以下客观问题:

1. 页面状态越来越多, 手写 DOM 更新与事件分发的维护成本持续升高.
2. 页面结构较长, 局部改动容易影响整体渲染和脚本稳定性.
3. Toast, 响应视图, 记录分组, 发送状态, 压测状态等交互已经具备组件化条件.
4. 后续若继续做 UI 收口和交互打磨, 原生字符串拼接会明显降低迭代效率.

## 3. 迁移硬约束

本次迁移必须满足以下硬约束. 任何不满足这些约束的方案都不应实施.

### 3.1 功能一致

- 请求编辑, 发送, 保存, 导入 cURL, 环境切换, 历史恢复, 压测, 响应展示, Toast 提示等能力必须保持完整.
- 现有日志链路, `responseAck` 自愈机制, 历史分组策略, JSON 专业格式化方案必须保留.

### 3.2 UI 一致

- 页面结构保持现状, 不做主动改版.
- 文案, 标签顺序, 区块划分, 按钮位置, 间距层级, 桌面化视觉密度都必须以当前版本为基线.
- Tailwind 只是实现手段, 不是新的视觉来源.

### 3.3 协议一致

- 扩展宿主与 Webview 的消息协议继续复用现有定义.
- 现有 `httpClient/*` 与 `mxToast/*` 消息类型不改名, 不改语义, 不改时序.

### 3.4 宿主逻辑不动

以下部分不在本次迁移改造范围内:

- `src/http_client/panel.ts`
- `src/http_client/runner.ts`
- `src/http_client/register.ts`
- 持久化存储逻辑
- 环境变量解析逻辑
- 压测执行逻辑
- `keil` 与 `selection` 模块

### 3.5 构建链保持轻量

- 不引入与当前闭环无关的大型前端工程体系.
- 不使用运行时 CDN.
- 不引入第三方 UI 组件库.
- 不引入 CSS-in-JS.

## 4. 迁移范围

### 4.1 纳入范围

- HTTP Client 工作台 Webview
- HTTP Client 侧边栏 Webview
- Webview 内部 Toast 渲染层
- Webview 构建与资源装载方式

### 4.2 不纳入范围

- 视觉重设计
- 交互改版
- 新增功能
- 协议重构
- 宿主层架构重写
- 文档事实源切换

## 5. 技术方案选择

### 5.1 前端框架

选型:

- `React`
- `TypeScript`
- `TailwindCSS`

选择理由:

1. `React` 适合承载当前已经形成规模的组件树和状态切换.
2. `TypeScript` 可继续与现有宿主类型系统对齐.
3. `TailwindCSS` 适合作为构建期样式组织工具, 便于在不改视觉的前提下整理布局和密度规则.

### 5.2 不选择 Vite 作为第一落地方案

第一落地阶段优先建议:

- `esbuild` 负责打包 Webview TSX
- `TailwindCSS CLI` 负责输出静态 CSS

原因:

1. 仓库当前已经使用 `esbuild`.
2. 目标是严格保留现状行为, 不需要先引入更重的 Dev Server 体系.
3. 构建脚本越简单, 越有利于排查 VS Code Webview 的 CSP 和资源路径问题.

后续若确实需要更强的前端开发体验, 再评估 `Vite` 是否值得引入.

### 5.3 Tailwind 使用原则

Tailwind 在本项目中必须遵守以下规则:

1. 关闭 `preflight`, 避免干扰 VS Code Webview 的桌面化细节.
2. 优先使用 VS Code 主题变量, 不允许用 Tailwind 默认调色板替代现有主题体系.
3. 允许 `Tailwind utility + 少量语义化组件类 + 保留设计 token CSS` 共存.
4. 不要求把所有现有样式机械改写成纯 utility class.

结论是:

- `Tailwind` 在这里是样式编排工具.
- 当前视觉 token 仍然是最终事实源.

## 6. 目标架构

迁移后应形成如下边界:

```text
Extension Host
├─ src/http_client/panel.ts
├─ src/http_client/sidebar_view.ts
├─ src/http_client/runner.ts
├─ src/http_client/types.ts
└─ 负责: 状态快照, 请求执行, 存储, 日志, postMessage

Webview Frontend
├─ workbench React App
├─ sidebar React App
├─ shared protocol adapter
├─ shared ToastCenter
└─ 负责: 渲染, 本地交互, 局部 UI 状态
```

核心原则:

1. 宿主仍然是业务事实源.
2. Webview 只接管渲染和页面局部交互.
3. 消息边界不改变.

## 7. 目录规划

建议新增独立前端源码目录, 不再把整段 HTML 与 JS 写回宿主字符串模板.

建议结构如下:

```text
webviews/http_client/
├─ workbench/
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ components/
│  ├─ hooks/
│  └─ pages/
├─ sidebar/
│  ├─ main.tsx
│  ├─ SidebarApp.tsx
│  └─ components/
├─ shared/
│  ├─ vscode.ts
│  ├─ protocol.ts
│  ├─ toast.tsx
│  ├─ state.ts
│  └─ utils/
├─ styles/
│  ├─ tokens.css
│  ├─ workbench.css
│  ├─ sidebar.css
│  └─ tailwind.css
└─ tailwind.config.js
```

扩展宿主侧保留最小 HTML 装载器:

```text
src/http_client/webview/index.ts
src/http_client/sidebar_view.ts
```

这两个文件迁移后的职责应缩减为:

- 生成 CSP
- 注入初始状态
- 引用外部构建产物
- 维持 `postMessage` 入口

## 8. 构建设计

### 8.1 产物位置

建议将 Webview 构建产物输出到固定静态目录, 例如:

```text
media/http_client/
├─ workbench.js
├─ workbench.css
├─ sidebar.js
└─ sidebar.css
```

原因:

1. VS Code 扩展打包对固定资源路径更友好.
2. 不必引入复杂的 manifest 解析逻辑.
3. 当前目标不是前端网站发布, 没有必要引入 hash 文件名策略.

### 8.2 构建脚本建议

建议新增脚本:

```json
{
  "compile:webview": "...",
  "watch:webview": "...",
  "compile": "pnpm compile:webview && 原有 extension build",
  "watch": "并行 watch webview 与 extension"
}
```

### 8.3 CSP 策略

迁移后不应继续依赖大段内联脚本.

建议目标:

- `style-src ${webview.cspSource}`
- `script-src ${webview.cspSource}`

仅在必须保留少量引导脚本时才使用 `nonce`.

### 8.4 初始状态注入

初始状态仍需由宿主生成并注入页面, 但注入方式应收敛为:

1. 在 HTML 中挂载根节点.
2. 通过一个极小的启动脚本把 `initialState` 放到 `window`.
3. React 启动后读取该初始状态并进入受控渲染.

## 9. React 组件切分方案

为了保证 UI 不变, 组件切分必须围绕当前现有视觉区块进行, 不能先做抽象化拆分.

### 9.1 工作台

建议工作台组件树:

```text
App
├─ Toolbar
│  ├─ MethodSelect
│  ├─ UrlInput
│  ├─ EnvironmentSelect
│  ├─ SendButton
│  ├─ LoadTestButton
│  ├─ SaveButton
│  └─ ImportCurlButton
├─ RequestEditor
│  ├─ EditorTabs
│  ├─ ParamsEditor
│  ├─ HeadersEditor
│  └─ BodyEditor
├─ ResponseViewer
│  ├─ ResponseMetaBar
│  ├─ ResponseTabs
│  ├─ BodyPanel
│  ├─ HeadersPanel
│  ├─ MetaPanel
│  └─ LoadTestPanel
└─ ToastCenter
```

### 9.2 侧边栏

建议侧边栏组件树:

```text
SidebarApp
├─ SidebarHeader
├─ TabStrip
├─ EmptyStateAction
├─ RecordList
├─ CollectionList
├─ EnvironmentList
└─ ToastCenter
```

### 9.3 组件边界规则

- 组件名称应直接映射当前 UI 区块.
- 不提前抽出通用 `BaseButton`, `GenericList`, `UniversalPanel` 这类重抽象组件.
- 只有出现第 2 个真实复用点时才做抽象.

## 10. 状态与消息模型

### 10.1 状态分层

建议状态明确分为两层:

1. 宿主快照状态
2. 前端临时 UI 状态

宿主快照状态负责:

- 当前请求与集合数据
- 当前环境
- 历史记录
- 当前响应
- 压测结果

前端临时 UI 状态负责:

- 当前激活 Tab
- 输入焦点
- 局部展开状态
- Toast 展示队列
- 请求中按钮的瞬时反馈

### 10.2 协议复用

以下原则必须成立:

1. `src/http_client/types.ts` 继续作为协议事实源.
2. React 前端不重命名现有消息类型.
3. 当前 `responseAck` 机制原样保留.
4. 当前 `frontendLog` 机制原样保留.

### 10.3 本地状态组织

不建议在第一阶段引入 Redux 或 Zustand.

建议使用:

- `useReducer` 管理页面状态
- `useMemo` 做派生展示
- `useEffect` 接入 `message` 事件和宿主通信

这样可以减少新依赖, 同时保持足够清晰的更新路径.

## 11. UI 一致性实施策略

本次迁移的难点不是“做一个更漂亮的页面”, 而是“用新的技术栈重做同一个页面”.

因此必须采用以下策略:

### 11.1 以当前版本为冻结基线

基线提交: `7813a4c`

在实施前需固定以下参考物:

- 工作台截图
- 侧边栏截图
- 关键状态截图, 包括空状态, 发送中, 成功响应, 错误响应, 压测结果, 多条 Toast

### 11.2 样式迁移顺序

建议顺序:

1. 先迁移设计 token 和 CSS 变量.
2. 再迁移布局骨架.
3. 再迁移具体交互组件.
4. 最后替换局部细节样式.

不要一开始就把现有 CSS 彻底打散成 Tailwind utility, 否则极易导致视觉漂移.

### 11.3 允许保留少量显式 CSS

若某些区块要达到完全一致, 允许保留少量显式 CSS 类.

这不是退步, 而是对“UI 完全一致”目标负责.

## 12. 分阶段实施方案

### 阶段 1. 构建基础设施

目标:

- 建立 `React + TS + Tailwind` Webview 构建链
- 输出固定静态资源
- 宿主能稳定加载 React 入口

交付物:

- Webview 新目录
- 构建脚本
- 最小空白挂载页

### 阶段 2. 工作台静态壳迁移

目标:

- React 渲染出当前工作台静态结构
- 视觉上与现状一致
- 暂不接入完整交互

交付物:

- `Toolbar`
- `RequestEditor`
- `ResponseViewer`

### 阶段 3. 工作台交互迁移

目标:

- 迁移当前所有工作台交互
- 保留发送, 保存, 压测, 响应切换, 复制等行为

### 阶段 4. 侧边栏迁移

目标:

- 迁移 `记录 / 集合 / 环境`
- 保留分组, 展开, 选择, 空状态新建操作

### 阶段 5. Toast 与收口

目标:

- 接通统一 ToastCenter
- 完成边界状态验证
- 删除旧版内联脚本主实现

### 阶段 6. 全量验收

目标:

- 按 [../HTTP客户端设计.md](../HTTP客户端设计.md) 做一次完整功能验收
- 对比基线截图确认 UI 无漂移

## 13. 验收标准

迁移完成后, 必须同时满足以下条件:

1. `HTTP Client` 所有现有自动化测试继续通过.
2. 工作台与侧边栏全部现有功能可用.
3. `responseAck` 失效自愈链路可复测.
4. Toast 多实例, 悬停暂停, 复制按钮, 锁位策略全部可用.
5. `记录` 页最近 `30` 条分组展示逻辑不变.
6. JSON 响应高亮, 中文显示, `Pretty / Raw` 切换逻辑不变.
7. 用户侧可见文案与布局不发生主动变化.
8. 按 [../HTTP客户端设计.md](../HTTP客户端设计.md) 做完整手工验收时, 不出现功能回退.

## 14. 风险与应对

### 风险 1. Tailwind 造成样式漂移

应对:

- 关闭 `preflight`
- 先迁 token, 后迁 utility
- 允许显式 CSS 保底

### 风险 2. React 状态更新影响响应回推时序

应对:

- `responseAck` 保持宿主主导
- 响应渲染完成后的确认动作必须保留
- 新增前端最小 smoke test 覆盖消息消费

### 风险 3. Webview 资源路径与 CSP 失配

应对:

- 使用固定产物路径
- 统一通过 `webview.asWebviewUri` 注入
- 先完成最小加载页验证, 再迁业务页面

### 风险 4. 迁移过程引入不必要重构

应对:

- 只动 Webview 层
- 不改宿主主链路
- 不在迁移过程中顺手做 UI 改版或协议重命名

## 15. 结论

在“功能完全一致, UI 完全一致”的前提下, 仍然可以迁移到 `React + TailwindCSS + TypeScript`.

但实现策略必须是:

1. 以当前版本为冻结基线.
2. 只迁移 Webview 层.
3. 以保真为第一目标, 不是以重构整洁度为第一目标.
4. 先完成等价迁移, 再考虑后续迭代收益.

只有按这个边界执行, 迁移才是低风险且值得做的.
