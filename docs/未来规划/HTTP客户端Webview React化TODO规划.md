# HTTP 客户端 Webview React 化 TODO 规划

最后更新: 2026-04-14

## 1. 文档定位

本文档是 [HTTP客户端Webview React化迁移设计.md](./HTTP客户端Webview%20React化迁移设计.md) 的实施清单.

目标固定为:

1. 功能完全一致.
2. UI 完全一致.
3. 协议完全一致.
4. 迁移过程可回退.

## 2. 总体策略

采用双构建链:

- 扩展宿主继续使用 `esbuild`
- Webview 前端新增 `Vite + React + TailwindCSS + TypeScript`

实施顺序遵循:

1. 先搭底座.
2. 再做等价迁移.
3. 最后切换运行路径.

## 3. 里程碑

### M1. Webview 前端工程落地

状态: 已完成

交付物:

- 新增 `webviews/http_client/` 前端目录
- `Vite` 多入口配置
- 最新版本 `React` 与 `TailwindCSS` 基础依赖
- 输出 `media/http_client/*.js` 与 `media/http_client/*.css`
- 不影响当前运行时行为

验收标准:

- `pnpm compile:webview` 通过
- 构建产物生成成功
- 现有 `pnpm compile`, `pnpm lint`, `pnpm test` 不回退

### M2. 工作台静态壳 React 化

状态: 已基本完成

交付物:

- React 工作台壳结构
- 与当前页面结构一致的区块骨架
- 保留现有视觉 token 和样式密度

验收标准:

- 对照基线截图, 结构和边距无明显漂移
- 不接业务消息时可独立完成静态渲染

### M3. 工作台交互等价迁移

状态: 已完成

交付物:

- 发送, 保存, 压测, 响应切换, 复制, 错误展示全部迁移
- `responseAck` 与 `frontendLog` 保持一致

验收标准:

- 所有主工作台交互与现状一致
- `HTTP客户端设计.md` 中工作台功能项完整通过

### M4. 侧边栏等价迁移

状态: 已完成

交付物:

- `记录 / 集合 / 环境` 三个标签页迁移
- 最近 `30` 条记录分组逻辑不变
- 空状态按钮与选择行为不变

验收标准:

- `sidebar_view` 行为与当前一致
- 现有 `sidebar_view.test.ts` 继续通过

### M5. Toast 与运行路径切换

状态: 已完成

交付物:

- React 版 ToastCenter 接入现有统一 Toast 协议
- 工作台与侧边栏切换到新前端入口
- 删除旧版主要渲染路径或降级为回退实现

验收标准:

- 多 Toast, 悬停暂停, 锁位, 复制行为全部一致
- 宿主侧无需额外业务改写

### M6. 全量验收与文档回写

状态: 待执行

交付物:

- 完整功能验收记录
- 文档事实源更新
- 迁移结论回写正式文档

验收标准:

- 对照 `docs/HTTP客户端设计.md` 完成完整功能验收
- 运行路径稳定, 无功能回退, 无 UI 主动变化

## 4. 分阶段 TODO

### 4.1 M1 TODO

- [x] 新增最新版本 `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`
- [x] 新增 `webviews/http_client/` 目录结构
- [x] 新增 `vite.config.ts`
- [x] 新增 `workbench/main.tsx`
- [x] 新增 `sidebar/main.tsx`
- [x] 新增共享 `vscode` 适配和基础 `App`
- [x] 新增基础 CSS token 文件
- [x] 更新 `package.json` 构建脚本
- [x] 保证产物输出到 `media/http_client/`

### 4.2 M2 TODO

- [x] 迁移工作台顶栏静态结构
- [x] 迁移请求编辑区静态结构
- [x] 迁移响应区静态结构
- [x] 对齐当前桌面化间距和尺寸
- [ ] 建立视觉对照清单

### 4.3 M3 TODO

- [x] 接通宿主消息初始化
- [x] 迁移草稿编辑与局部状态
- [x] 迁移发送与取消行为
- [x] 迁移保存行为
- [x] 迁移响应 Tab 与响应体渲染
- [x] 迁移压测状态与结果展示
- [x] 迁移快捷键与按钮状态

### 4.4 M4 TODO

- [x] 迁移侧边栏头部和标签页
- [x] 迁移记录分组列表
- [x] 迁移集合列表
- [x] 迁移环境列表
- [x] 迁移空状态与创建动作

### 4.5 M5 TODO

- [x] 复用现有 Toast host 脚本, 统一接通 `mxToast/show`
- [x] 工作台切换到新入口
- [x] 侧边栏切换到新入口
- [x] 通过自动化测试验证新装载器资源与 bootstrap
- [ ] 视需要再评估是否把 Toast host 完全组件化为 React 实现

### 4.6 M6 TODO

- [ ] 执行 `pnpm compile`
- [ ] 执行 `pnpm lint`
- [ ] 执行 `pnpm test`
- [ ] 按 `docs/HTTP客户端设计.md` 做手工功能验收
- [ ] 回写最终结论到正式文档

## 5. 回归门禁

每个里程碑完成后都必须至少执行:

1. `pnpm compile`
2. `pnpm lint`
3. `pnpm test`

若涉及 Webview 运行路径切换, 还必须补:

1. 打开工作台
2. 发送真实 HTTP 请求
3. 查看响应 Body / Headers / Meta
4. 查看最近请求记录
5. 触发 Toast
6. 执行一次压测

## 6. 回滚策略

### 6.1 M1 到 M4

此阶段不替换现有运行路径.

因此回滚方式为:

- 删除新增 Webview 前端工程目录
- 删除新增构建脚本与依赖

### 6.2 M5

运行路径切换时必须保留回退能力:

- 保留旧版装载器一段时间
- 用显式开关决定加载旧版还是新版
- 若新前端出现严重回退, 先切回旧版路径, 再修复

## 7. 当前执行决定

当前回合执行范围:

1. 完成本文档.
2. 执行 `M1. Webview 前端工程落地`.
3. 执行 `M2. 工作台静态壳 React 化`.
4. 执行 `M3. 工作台交互等价迁移`.
5. 不切换当前运行时路径.

这样可以保证:

- 仓库开始进入正式迁移.
- 当前用户可见功能保持完全不变.
- 后续每一步都有稳定基线可对照.

当前结果:

- `M1` 已完成.
- 新前端构建产物已稳定输出到 `media/http_client/`.
- `M2` 已完成旧版 DOM 结构的 React 静态壳复刻, 视觉对照清单待补.
- `M3` 已完成 React workbench 的宿主消息接入与主交互等价迁移.
- 已新增 `webviews/http_client/tests/workbench_model.test.ts`, 用于保护 React workbench 共享纯逻辑.
- `M4` 已完成 React 侧边栏的宿主消息接入, 最近 30 条记录分组, 集合 / 环境筛选与空状态迁移.
- `M5` 已完成真实运行入口切换, 当前工作台与侧边栏均通过 React 装载器运行.
- Toast 运行时继续复用现有稳定 host 脚本, 避免为迁移重复实现第二套行为.
