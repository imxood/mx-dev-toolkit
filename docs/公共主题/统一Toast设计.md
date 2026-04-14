# 统一Toast设计

最后更新: 2026-04-14

## 1. 目标

为 `mx-dev-toolkit` 建立插件级统一 Toast 提示体系, 解决当前提示入口分散, 样式不一致, 无法多条并存, 无法复制提示内容的问题.

本设计覆盖:

- `http_client` Webview 工作台
- `http_client` 侧边栏 Webview
- `selection` 模块
- `keil` 模块

## 2. 现状问题

当前插件存在两套完全不同的提示路径:

1. `http_client`
   - 在 Webview 内部使用单槽 `message-banner`
   - 新提示会覆盖旧提示
   - 无法同时显示多条
   - 无法复制提示文本
2. `selection` 与 `keil`
   - 直接调用 `vscode.window.showInformationMessage` / `showWarningMessage` / `showErrorMessage`
   - 样式由 VS Code 控制
   - 无法与 `http_client` 形成统一交互语言

直接后果:

- 同一插件中提示样式割裂
- 无法做统一显示时长和优先级
- Webview 内无法做悬停暂停和复制
- 后续若扩展更多模块, 提示体验会继续发散

## 3. 设计原则

### 3.1 统一入口

所有模块不得直接各自管理提示显示, 必须统一通过宿主侧 `ToastService` 发出提示.

### 3.2 渲染与调度分离

- 扩展宿主负责:
  - 标准化 Toast 数据
  - 选择当前最合适的显示宿主
  - 在无 Webview 宿主时回退到 VS Code 原生提示
- Webview 负责:
  - 多条 Toast 视觉呈现
  - 定时器
  - 悬停暂停
  - 复制按钮

### 3.3 轻架构

不引入复杂事件总线, 不做全局历史中心. 第一版只完成:

- 统一调用入口
- 多宿主路由
- Webview 多实例 ToastCenter
- 原生消息回退

### 3.4 插件边界明确

VS Code 扩展无法在整个主界面随意绘制全局浮层. 因此:

- 有活动 Webview 宿主时, 使用自定义 Toast
- 无活动 Webview 宿主时, 回退到 VS Code 原生消息

这属于平台约束, 不是实现缺陷.

## 4. 方案选择

采用 `方案 B: 插件级统一 Toast 服务`.

方案结论:

- 统一入口由扩展宿主维护
- Webview 提示样式统一
- 不强求所有场景都使用同一个 DOM 节点
- 通过"宿主选择 + 原生回退"保证提示永远可见

## 5. 整体架构

```text
selection / keil / http_client / future modules
                 │
                 ▼
             ToastService
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
优先可见 Webview 宿主     VS Code 原生消息
      │
      ▼
  ToastCenter
      │
      ├─ Toast #1
      ├─ Toast #2
      └─ Toast #3
```

## 6. 宿主选择策略

### 6.1 可注册宿主

第一版允许以下宿主注册到 `ToastService`:

- `http_client` 工作台 WebviewPanel
- `http_client` 侧边栏 WebviewView

### 6.2 优先级

默认优先级如下:

1. `http_client` 工作台
2. `http_client` 侧边栏
3. VS Code 原生消息回退

原因:

- 工作台拥有更完整的展示空间
- 侧边栏适合作为次级宿主
- 原生消息只在没有可见 Webview 时使用

### 6.3 选择条件

宿主被视为可用需同时满足:

- 宿主实例存在
- 对应 Webview 当前可见
- Webview 已完成初始化
- `postMessage` 可用

若当前无任何可用宿主, `ToastService` 直接调用 VS Code 原生消息接口.

## 7. 数据模型

```ts
export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  copyText: string;
  durationMs: number;
  source: string;
  createdAt: string;
}
```

字段约束:

- `message`
  - 用户直接可见的提示文本
- `copyText`
  - 复制按钮默认复制的文本
  - 未单独指定时与 `message` 相同
- `durationMs`
  - 单条 Toast 的显示时长
  - 每条独立控制
- `source`
  - 记录来源模块, 用于排障和后续扩展

## 8. 交互规则

### 8.1 堆叠规则

- 右上角垂直堆叠显示
- 默认最大同时显示 `8` 条
- 超出上限时, 优先移除最旧且未被悬停的 Toast

### 8.2 时长规则

默认时长建议:

- `success`: `1800ms`
- `info`: `2400ms`
- `warning`: `3200ms`
- `error`: `4200ms`

允许调用方覆盖默认值.

### 8.3 悬停暂停

单条 Toast 的倒计时必须独立计算:

- 鼠标进入当前 Toast 时:
  - 清理该条定时器
  - 记录剩余时长
- 鼠标离开当前 Toast 时:
  - 按剩余时长重新启动定时器

悬停只影响当前条目, 不影响其它 Toast.

### 8.4 复制按钮

每条 Toast 右侧提供复制按钮:

- 点击后复制当前 Toast 的 `copyText`
- 复制动作不得影响该 Toast 原有剩余时间
- 复制按钮本身应为轻量图标按钮, 不增加额外文本噪音

### 8.5 视觉要求

Toast 风格必须符合当前插件的桌面工具方向:

- 紧凑
- 边距克制
- 轻阴影
- 半透明表面
- 细边框
- 小图标
- 非网页式大面积飘浮卡片

## 9. 宿主与 Webview 的职责边界

### 9.1 扩展宿主职责

- 对外暴露统一 `notify()` API
- 统一默认时长和 kind
- 选择当前宿主
- 发送 `mxToast/show` 消息
- 宿主不可用时回退原生消息

### 9.2 Webview 职责

- 管理本地 Toast 队列
- 维护每条定时器
- 处理悬停暂停
- 处理复制动作
- 渲染退出动画

### 9.3 模块调用职责

业务模块只负责描述事件语义, 例如:

- `已复制路径范围`
- `请求完成`
- `UV4.exe 路径无效`

不得在业务模块内直接决定渲染位置和 DOM 表现.

## 10. 消息协议

统一使用宿主到 Webview 的消息:

```ts
{
  type: "mxToast/show",
  payload: ToastItem
}
```

第一版暂不需要 Webview 回传 ack.

原因:

- Toast 丢失不影响核心业务状态
- 即使 Webview 不可用, 宿主也会直接回退原生消息

## 11. 模块接入策略

### 11.1 http_client

`http_client` 内部现有 `setBanner()` 统一替换为 Toast 队列 API, 保留原有业务语义:

- 请求开始
- 请求完成
- 复制 Header
- 复制响应
- JSON 格式化成功
- URL 校验失败

### 11.2 selection

将 `PathRangeCopier` 中的原生 `showWarningMessage` / `showInformationMessage` 替换为统一 ToastService.

### 11.3 keil

将 `register.ts` 与 `keil.ts` 中直接触发的原生消息替换为统一 ToastService.

## 12. 回退策略

当没有活动 Toast 宿主时, 统一回退到:

- `info` / `success`: `vscode.window.showInformationMessage`
- `warning`: `vscode.window.showWarningMessage`
- `error`: `vscode.window.showErrorMessage`

要求:

- 回退文案必须与 Toast 文案一致
- 不因回退路径而改变业务含义

## 13. 测试要求

### 13.1 单元测试

新增 `ToastService` 测试, 覆盖:

- 宿主优先级选择
- 无宿主时回退原生消息
- 默认时长归一化

### 13.2 Webview 脚本测试

更新 `webview_state.test.ts`, 覆盖:

- 多条 Toast 容器脚本可被解释执行
- `mxToast/show` 消息处理存在
- 复制按钮和悬停逻辑存在

### 13.3 手工验收

至少验证:

1. 连续触发 3 条提示时可同时显示
2. 每条显示时长独立
3. 鼠标悬停某条时该条不消失
4. 鼠标离开后按剩余时间关闭
5. 点击复制按钮可复制 Toast 内容
6. 关闭 HTTP Client 面板后, 提示自动回退 VS Code 原生消息

## 14. 非目标

第一版明确不做:

- Toast 历史记录中心
- 跨 VS Code 窗口同步
- 多动作按钮系统
- 富文本内容
- 长驻通知中心

## 15. 实施顺序

1. 新增 `ToastService` 和共享类型
2. 在 `extension.ts` 装配统一服务
3. `http_client` 工作台接入 Toast 宿主
4. `http_client` 侧边栏接入 Toast 宿主
5. `selection` / `keil` 改为统一调用入口
6. 增加测试并执行编译、lint、回归

## 16. 最终结论

本方案的核心不是把某个页面上的提示改得更漂亮, 而是把插件提示体系从"页面局部实现"升级为"宿主统一能力".

后续所有新增模块若需要提示, 必须优先复用本设计, 不得再直接分散实现新的 Toast 体系.
