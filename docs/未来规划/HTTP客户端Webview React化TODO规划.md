# HTTP 客户端 Webview React 化 TODO 规划（归档）

最后更新: 2026-04-14
状态: 迁移里程碑归档

## 1. 文档定位

本文档保留为 HTTP Client React 化迁移的里程碑记录。

它不再表示“React 迁移尚未开始”, 也不再作为当前正式 TODO 的唯一来源。当前增量待办请看 `docs/HTTP客户端TODO规划.md`。

## 2. 里程碑结果

### M1 Webview 前端工程落地

状态: 已完成

结果:

- `webviews/http_client/` 工程已建立
- Vite 构建已接入
- 产物稳定输出到 `media/http_client/`

### M2 工作台静态壳 React 化

状态: 已完成

结果:

- 工作台 React 入口已建立
- 宿主可加载 React workbench HTML
- 静态结构、基础样式和 bootstrap 已接通

### M3 工作台交互等价迁移

状态: 已完成

结果:

- 工作台主交互已迁移到 React
- 宿主消息桥、草稿、发送、保存、导入、响应展示、压测相关主流程已接通

### M4 侧边栏等价迁移

状态: 已完成

结果:

- 侧边栏 React 入口已建立
- 侧边栏主交互与宿主消息链路已迁移到 React
- 请求集合、历史、环境等入口已接通

### M5 Toast 与运行路径切换

状态: 已完成

结果:

- 工作台与侧边栏主运行路径已切换到 React 装载器
- Toast 继续复用统一宿主注入体系
- 当前不再应把 React 路径描述成“仅规划”或“旁路试验”

### M6 全量验收与文档回写

状态: 进行中

结果:

- 正在统一 README、总体设计、HTTP Client 设计、迁移归档之间的状态说明
- 目标是彻底移除“尚未 React 化”的旧表述
- 最终状态应以本轮构建、lint、测试与文档核对结果为准

## 3. 当前可确认的最终形态

以下事实已经成立:

- 工作台与侧边栏均通过 React Webview 运行
- 宿主入口分别通过 React HTML 装载器返回页面
- Webview 构建产物位于 `media/http_client/`
- React UI 通过 bootstrap 和宿主消息协议获取状态
- Toast 仍采用宿主调度 + Webview host script + 原生回退

## 4. 已废弃的旧表述

以下表述已经失效, 不应继续沿用:

- “当前并不切换运行时路径”
- “React 化仍停留在规划阶段”
- “主 UI 仍以 `src/http_client/webview/ui/*` 为准”
- “Toast 后续才会接入统一体系”

## 5. 归档使用说明

如果你想理解当前正式实现, 请优先阅读:

1. `docs/HTTP客户端设计.md`
2. `docs/设计.md`

如果你想了解这次迁移是如何落地的, 再回看本归档文档与迁移设计归档。
