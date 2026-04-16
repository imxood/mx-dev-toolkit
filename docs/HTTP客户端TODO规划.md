# HTTP 客户端增量 TODO 规划

最后更新: 2026-04-16
状态: 增量 TODO

## 1. 文档定位

本文档只跟踪“在当前已落地 HTTP Client 架构之上, 还要继续推进什么”。

它不再维护旧的 React 迁移前提, 也不再把 `src/http_client/webview/ui/*` 当作当前主实现来分解任务。

当前正式事实源请看:

- `docs/HTTP客户端设计.md`
- `docs/设计.md`

迁移历史请看:

- `docs/未来规划/HTTP客户端Webview React化迁移设计.md`
- `docs/未来规划/HTTP客户端Webview React化TODO规划.md`

## 2. 当前基线

以下能力已经落地:

- HTTP Client 工作台与侧边栏均通过 React Webview 运行
- 宿主层继续负责 store / resolver / runner / load_runner / curl_import / 消息桥
- Vite 双入口前端稳定输出到 `media/http_client/`
- 工作台与侧边栏都已接入统一 ToastService
- 已有宿主测试、Webview 纯逻辑测试与 React 装载测试

因此, 当前 TODO 的重点不再是“是否要迁移到 React”, 而是围绕现有实现继续做验收、治理和后续增强。

## 3. 已完成的基础里程碑

### 3.1 架构落地

- React workbench 落地
- React sidebar 落地
- 宿主 React 装载器落地
- `media/http_client/` 构建链打通
- Webview bootstrap 注入打通

### 3.2 行为等价迁移

- 工作台主交互已迁移到 React
- 侧边栏主交互已迁移到 React
- Toast 运行路径已切到统一宿主注入体系
- 工作台/侧边栏消息桥已切到 React 运行路径

### 3.3 测试基线

- 宿主侧已有 `panel` / `sidebar_view` / `react_loader` / `runner` / `resolver` / `store` 等测试
- 前端侧已有 `workbench_model` / `sidebar_model` / `component_contract` 等测试

## 4. 当前进行中的工作

### T1. Workbench local-first 架构收敛

目标:

- 保持三栏工作台视觉与交互形态不变
- 将高频交互从 `Host postState -> Webview 全量刷新` 收敛到 `Webview local-first`
- 明确 Host 只承担持久化、执行和外部副作用

当前判断:

- 方案 B 第一阶段已经落地
- `httpClient/init` 已改为复用 bootstrap snapshot, 不再重复回推全量 state
- `selectRequest` / `selectHistory` / `selectEnvironment` / `createRequest` / `toggleFavorite` 已改为 local-first 热路径
- `workbench_model` 已新增 session patch 纯函数, 用于避免热路径整包 deep clone

## 5. 下一阶段增量 TODO

### T2. 增量事件继续收缩

背景:

- 当前已经消除了最明显的“高频选择 -> Host 整包回推”链路
- 但 `httpClient/state` 仍承担结构性刷新、历史异步落盘刷新和异常恢复

待办:

- 继续梳理哪些结构性刷新也可以下沉为增量消息
- 评估是否把收藏、集合、环境、历史的结构变更进一步拆成 event 级别同步
- 保持 Host 和 Webview 的单一事实边界, 避免重新长回双状态源

### T3. 旧 Webview 目录治理

背景:

- `src/http_client/webview/state.ts` 与 `src/http_client/webview/ui/*` 仍存在
- 当前主运行路径已切到 React

待办:

- 梳理这些旧文件是否仍承担兼容、测试辅助或纯历史遗留职责
- 如果已经不再参与主路径, 逐步收敛或迁移到更清晰的归档/兼容位置
- 在删除前补齐必要测试, 避免误删隐式依赖

### T4. React Webview 验收面补强

待办:

- 增强工作台与侧边栏联动场景的手动验收清单
- 视需要补充更贴近真实消息流的前端控制器测试
- 重点覆盖: 打开请求、切换环境、导入 cURL、压测流程、Toast 分发

### T5. UI 与主题一致性

待办:

- 持续统一 workbench / sidebar / toast 的视觉 token 与交互反馈
- 检查深浅色主题、长文本、错误提示、空态与窄宽度布局
- 需要时再决定是否把 Toast host 进一步组件化, 但这不是当前默认前提

### T6. 发布前稳定性治理

待办:

- 保持 `pnpm compile`、`pnpm lint`、`pnpm test` 长期可用
- 在 Extension Development Host 中做一轮完整 smoke test
- 确认 `media/http_client/` 产物更新后宿主 buildId 与资源引用一致

## 6. 不再继续维护的旧任务写法

以下写法不应再出现在当前 TODO 中:

- 把 React 化写成尚未开始的规划
- 按 `src/http_client/webview/ui/*` 作为当前主 UI 继续细分任务
- 把 Toast 路线写成“后续才会接入统一体系”
- 把工作台和侧边栏仍描述成旧模板页面

## 7. 最小验收清单

每次较大改动后, 至少验证:

1. `pnpm compile`
2. `pnpm lint`
3. `pnpm test`
4. Activity Bar 可打开 HTTP Client 侧边栏
5. `mx http open` 可打开工作台
6. 发送请求、保存请求、导入 cURL、切换环境、查看历史正常
7. 压测可启动并可看到进度/结果
8. Toast 在工作台、侧边栏、原生回退路径上表现正常

## 8. 维护约定

- 本文件只记录“现在还没做完什么”。
- 已完成的迁移设计与里程碑请归档到 `docs/未来规划/` 下的迁移历史文档。
- 只要正式设计已经更新, 本文件就不再重复描述稳定结构细节。
