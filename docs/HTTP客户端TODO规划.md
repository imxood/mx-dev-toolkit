# HTTP 客户端生产级 TODO 规划

最后更新: 2026-04-13

关联文档: [HTTP客户端设计.md](./HTTP客户端设计.md)

## 0. 当前状态

截至 2026-04-13, 本规划对应的 HTTP Client MVP 已完成首轮实现, 并已完成以下闭环:

- 核心模块实现完成.
- Webview 工作台可打开并承载请求编辑, 响应查看和压测入口.
- 自动化测试, 测试日志和 Skill 文档已补齐.
- `pnpm compile`, `pnpm lint`, `pnpm test:http-client` 已通过.

后续若继续迭代, 本文档继续作为增量开发和发布门禁清单使用.

## 1. 文档目标

本文档不是功能愿景说明, 而是面向实际落地的生产级 TODO 规划. 目标是把 [HTTP客户端设计.md](./HTTP客户端设计.md) 拆成可以执行, 可以验收, 可以发布的实现计划.

本规划关注 5 个核心问题:

1. 先做什么, 后做什么.
2. 每个阶段具体改哪些文件.
3. 每个阶段如何验证完成.
4. 哪些风险需要提前控制.
5. 什么时候可以进入发布和回归验证.

## 2. 范围基线

本规划以 MVP 范围为基线, 包含:

- HTTP 常用方法支持
- URL, Query, Header, Raw Body
- JSON Body 格式化
- 环境变量
- 请求集合持久化
- 历史和收藏
- cURL 导入
- 普通请求执行
- 小规模压测
- 对应测试, 测试日志, Skill 文档

当前不进入实施范围:

- GraphQL
- WebSocket
- gRPC
- OAuth
- Cookie Jar
- Multipart 文件上传
- 请求脚本系统
- 大规模压测引擎

## 3. 生产级完成标准

只有同时满足以下条件, 才能视为 HTTP Client MVP 达到可发布状态:

### 3.1 功能完成

- 用户可创建, 编辑, 保存, 删除请求
- 用户可切换环境并完成变量替换
- 用户可查看响应 Body, Headers, Meta
- 用户可从历史中重放请求
- 用户可导入 cURL
- 用户可运行并停止小规模压测

### 3.2 工程完成

- 模块结构符合当前仓库约定
- `extension.ts` 只负责装配
- 输出通道日志可读
- 工作区和本地状态存储边界清晰
- 没有引入不必要依赖

### 3.3 质量完成

- `pnpm compile` 通过
- `pnpm lint` 通过
- HTTP Client 模块测试可运行
- 测试日志按规范落盘
- 手工验证清单全部通过

### 3.4 回归完成

- Keil 模块未回归
- selection 模块未回归
- Webview 打开, 关闭, 重开状态正常
- 普通请求完成后, UI 不会卡在 `正在发送请求...`

## 4. 里程碑规划

建议按 8 个里程碑执行, 每个里程碑都有明确产出和退出条件.

```text
M0 预备与骨架
M1 数据模型与持久化
M2 变量解析与请求执行内核
M3 Webview 工作台壳层
M4 请求编辑与集合交互
M5 响应展示与历史收藏
M6 压测 MVP
M7 测试, 打磨与发布
```

## 5. 里程碑明细

### M0. 预备与骨架

目标:

- 确定目录结构
- 接入命令入口
- 建立 WebviewPanel 基础壳层
- 建立类型定义与消息协议骨架

涉及文件:

- `src/extension.ts`
- `src/http_client/register.ts`
- `src/http_client/panel.ts`
- `src/http_client/types.ts`
- `package.json`
- `docs/设计.md`

TODO:

- [ ] 新建 `src/http_client/`
- [ ] 在 `package.json` 中注册 HTTP Client 命令
- [ ] 在 `src/extension.ts` 装配 `registerHttpClient(...)`
- [ ] 建立 `WebviewPanel` 打开逻辑
- [ ] 建立前后端消息协议基础类型
- [ ] 在 `docs/设计.md` 增补 HTTP Client 模块说明

验收:

- 命令面板可执行 `mx http open`
- 可打开一个空白工作台壳层
- 不影响现有 Keil 和 selection 模块

风险:

- Webview 生命周期处理不完整, 导致重复实例或消息丢失

应对:

- `panel.ts` 采用单实例管理
- 所有消息通道先定义类型再接线

### M1. 数据模型与持久化

目标:

- 实现 `mx_http_client.json` 的读取, 写入, 初始化和升级
- 打通请求集合, 请求实体, 环境实体的存储
- 建立 `workspaceState` 存储策略

涉及文件:

- `src/http_client/types.ts`
- `src/http_client/store.ts`
- `src/http_client/tests/store.test.ts`
- `logs/mx-dev-toolkit/tests/http_client_store.txt`

TODO:

- [ ] 定义 `HttpCollectionEntity`
- [ ] 定义 `HttpRequestEntity`
- [ ] 定义 `HttpEnvironmentEntity`
- [ ] 定义 `HttpHistoryRecord`
- [ ] 实现配置文件默认结构生成
- [ ] 实现配置文件 schema 版本管理
- [ ] 实现集合 CRUD
- [ ] 实现请求 CRUD
- [ ] 实现环境 CRUD
- [ ] 实现收藏状态持久化
- [ ] 实现 `workspaceState` key 规范

验收:

- 工作区首次打开时可自动初始化 `mx_http_client.json`
- 重启 VS Code 后请求集合可恢复
- 非法 JSON 或缺失字段时能给出明确报错

风险:

- 用户手工修改配置文件后产生脏数据

应对:

- 增加 schema 校验和默认值回填
- 对损坏配置给出可恢复提示

### M2. 变量解析与请求执行内核

目标:

- 完成环境变量替换
- 完成普通请求发送
- 完成超时, 取消, 响应格式化, 错误分类

涉及文件:

- `src/http_client/resolver.ts`
- `src/http_client/runner.ts`
- `src/http_client/tests/resolver.test.ts`
- `src/http_client/tests/runner.test.ts`
- `logs/mx-dev-toolkit/tests/http_client_resolver.txt`
- `logs/mx-dev-toolkit/tests/http_client_runner.txt`

TODO:

- [ ] 实现 `{{variableName}}` 替换
- [ ] 收集未解析变量列表
- [ ] 实现请求对象规范化
- [ ] 实现 `fetch` 请求发送
- [ ] 实现 `AbortController` 超时控制
- [ ] 实现用户主动取消
- [ ] 实现响应 Header 解析
- [ ] 实现响应 Meta 指标计算
- [ ] 实现 JSON 自动格式化判断
- [ ] 将普通请求结果写入历史记录

验收:

- 普通请求可完成发送并返回响应结果
- 未解析变量不会阻断发送, 但会在 Meta 中提示
- 超时和取消行为可被正确区分

风险:

- Webview 侧和宿主侧的请求状态不同步

应对:

- 所有执行态统一由宿主维护
- Webview 仅消费状态更新消息

### M3. Webview 工作台壳层

目标:

- 搭建完整工作台框架
- 打通初始化状态加载和基本交互

涉及文件:

- `src/http_client/panel.ts`
- `src/http_client/webview/index.ts`
- `src/http_client/webview/state.ts`
- `src/http_client/webview/ui/*`

TODO:

- [ ] 输出主布局骨架
- [ ] 建立左侧栏, 顶部栏, 编辑区, 结果区
- [ ] 建立初始化消息 `httpClient/init`
- [ ] 建立宿主到 Webview 的状态同步
- [ ] 建立 loading, error, empty 状态 UI
- [ ] 建立未保存标记展示

验收:

- 打开面板后能加载已有集合数据
- 状态初始化稳定, 无白屏和死区
- 面板关闭重开后能恢复当前活动请求

风险:

- 首屏状态过多, 导致消息协议混乱

应对:

- 首次只发送一个完整状态快照
- 后续变更使用增量消息或统一 `state refresh`
- Webview 必须带 `buildId` 初始化, 用于识别旧实例
- 请求响应展示增加 `responseAck` 和超时自愈重载

### M4. 请求编辑与集合交互

目标:

- 完成请求编辑区和集合操作
- 完成保存, 新建, 删除, 复制, 环境切换, cURL 导入

涉及文件:

- `src/http_client/store.ts`
- `src/http_client/panel.ts`
- `src/http_client/webview/ui/*`
- `src/http_client/parser.ts` 或 `src/http_client/curl_import.ts`
- `src/http_client/tests/store.test.ts`

TODO:

- [ ] 实现 Method 下拉
- [ ] 实现 URL 输入
- [ ] 实现 Params 表格
- [ ] 实现 Headers 表格
- [ ] 实现 Body 编辑器
- [ ] 实现 `Ctrl+Enter` 发送
- [ ] 实现 `Ctrl+S` 保存
- [ ] 实现集合新建和请求新建
- [ ] 实现请求复制和删除
- [ ] 实现环境切换
- [ ] 实现 cURL 文本导入
- [ ] 处理 cURL 解析失败反馈

验收:

- 一个新请求可从创建到发送全流程跑通
- 可将当前请求保存为集合项
- cURL 导入可覆盖常见 `-X`, `-H`, `-d` 场景

风险:

- Params 与 URL Query 双向同步逻辑容易出现覆盖错误

应对:

- 先统一内部数据源为 `params[]`
- URL 文本仅作为最终拼接结果和输入入口

### M5. 响应展示与历史收藏

目标:

- 完成响应区
- 完成历史记录, 收藏视图, 重放能力

涉及文件:

- `src/http_client/panel.ts`
- `src/http_client/store.ts`
- `src/http_client/webview/ui/*`
- `src/http_client/types.ts`

TODO:

- [ ] 实现 `Body` 标签页
- [ ] 实现 `Headers` 标签页
- [ ] 实现 `Meta` 标签页
- [ ] 实现 `Pretty / Raw` 切换
- [ ] 实现响应内搜索
- [ ] 实现复制响应体
- [ ] 实现历史记录列表
- [ ] 实现历史重放
- [ ] 实现收藏视图
- [ ] 实现从历史转收藏或保存请求

验收:

- 发送请求后响应结果可清晰展示
- 历史中点击某项可恢复请求内容
- 收藏和历史之间的数据关系清晰, 不会产生重复脏数据

风险:

- 响应体过大导致 Webview 卡顿

应对:

- 第一版限制超大响应的默认展开策略
- 必要时延迟渲染 `Pretty` 模式

### M6. 压测 MVP

目标:

- 完成小规模压测调度与结果展示
- 提供停止能力和限制保护

涉及文件:

- `src/http_client/load_runner.ts`
- `src/http_client/panel.ts`
- `src/http_client/webview/ui/*`
- `src/http_client/tests/load_runner.test.ts`
- `logs/mx-dev-toolkit/tests/http_client_load_runner.txt`

TODO:

- [ ] 定义压测配置类型
- [ ] 实现并发 worker 调度
- [ ] 实现实时进度上报
- [ ] 实现成功率统计
- [ ] 实现延迟分位数统计
- [ ] 实现状态码分布统计
- [ ] 实现错误样本采样
- [ ] 实现压测中止
- [ ] 实现并发和请求数硬上限保护
- [ ] 实现压测结果面板

验收:

- 可基于当前请求启动压测
- 压测过程中可看到进度更新
- 停止压测后资源可以释放
- 汇总指标与测试预期一致

风险:

- 扩展宿主 CPU 飙高, 影响 VS Code 交互

应对:

- 第一版严格限制并发和总请求数
- 结果统计过程避免重复排序和过度拷贝

### M7. 测试, 打磨与发布

目标:

- 补齐测试体系
- 完成手工验证, 文档补充, 发布准备

涉及文件:

- `src/http_client/tests/*`
- `logs/mx-dev-toolkit/tests/*`
- `.codex/skills/mx_dev_toolkit_tests/SKILL.md`
- `docs/HTTP客户端设计.md`
- `docs/HTTP客户端TODO规划.md`
- `package.json`

TODO:

- [ ] 补齐模块化测试
- [ ] 实现测试日志落盘
- [ ] 编写 HTTP Client 测试 Skill 文档
- [ ] 补充用户可见命令说明
- [ ] 补充工作区配置说明
- [ ] 完成手工验证清单
- [ ] 回归验证 Keil 和 selection
- [ ] 评估 `.vscodeignore` 是否需要调整
- [ ] 确认发布包不包含无关文件

验收:

- 文档, 测试, 日志, 功能同时具备
- 发布前检查项全部通过
- 不存在明显崩溃和数据丢失问题

风险:

- 功能完成了, 但测试和文档缺失, 无法真正进入发布

应对:

- 将测试和 Skill 更新列入发布硬门禁

## 6. 文件级 TODO 清单

### 6.1 扩展入口与注册

- [ ] `src/extension.ts`: 装配 `registerHttpClient(context, channel)`
- [ ] `src/http_client/register.ts`: 注册命令与面板入口
- [ ] `package.json`: 增加 commands, activation 入口, 可能的 view/container 定义

### 6.2 宿主侧服务

- [ ] `src/http_client/types.ts`: 数据模型, 消息协议, 结果类型
- [ ] `src/http_client/store.ts`: 配置文件和状态存储
- [ ] `src/http_client/resolver.ts`: 环境变量解析
- [ ] `src/http_client/runner.ts`: 普通请求执行
- [ ] `src/http_client/load_runner.ts`: 压测调度和统计
- [ ] `src/http_client/panel.ts`: Webview 生命周期和消息分发

### 6.3 Webview 侧

- [ ] `src/http_client/webview/index.ts`: 启动入口
- [ ] `src/http_client/webview/state.ts`: 前端状态管理
- [ ] `src/http_client/webview/ui/sidebar.ts`
- [ ] `src/http_client/webview/ui/toolbar.ts`
- [ ] `src/http_client/webview/ui/request_editor.ts`
- [ ] `src/http_client/webview/ui/response_viewer.ts`
- [ ] `src/http_client/webview/ui/load_test_view.ts`

### 6.4 测试与文档

- [ ] `src/http_client/tests/store.test.ts`
- [ ] `src/http_client/tests/resolver.test.ts`
- [ ] `src/http_client/tests/runner.test.ts`
- [ ] `src/http_client/tests/load_runner.test.ts`
- [ ] `logs/mx-dev-toolkit/tests/*`
- [ ] `.codex/skills/mx_dev_toolkit_tests/SKILL.md`
- [ ] `docs/设计.md`

## 7. 发布门禁

进入发布前, 必须逐项确认:

- [ ] `pnpm compile` 通过
- [ ] `pnpm lint` 通过
- [ ] HTTP Client 相关测试通过
- [ ] 测试日志已生成
- [ ] Skill 文档已更新
- [ ] 设计文档已同步
- [ ] TODO 规划文档已同步
- [ ] 手工验证通过
- [ ] Keil 回归通过
- [ ] selection 回归通过
- [ ] `package.json` 命令和标题可用
- [ ] 输出通道日志无明显噪声
- [ ] 工作区配置文件创建与读取正常
- [ ] Webview 重开后状态恢复正常
- [ ] 请求成功后不会长期停留在 `请求中`

## 8. 手工验证清单

### 8.1 工作台基础

- [ ] 命令面板打开 HTTP Client
- [ ] 面板重复打开不会创建多个实例
- [ ] 关闭后再次打开状态可恢复

### 8.2 请求流程

- [ ] 新建请求
- [ ] 修改 Method
- [ ] 修改 URL
- [ ] 添加 Params
- [ ] 添加 Headers
- [ ] 填写 JSON Body
- [ ] `Ctrl+Enter` 发送
- [ ] `Ctrl+S` 保存
- [ ] 请求成功后按钮从 `取消` 恢复为 `发送`

### 8.3 数据持久化

- [ ] 首次自动生成 `mx_http_client.json`
- [ ] 集合重启后仍存在
- [ ] 收藏重启后仍存在
- [ ] 历史记录可恢复

### 8.4 环境变量

- [ ] 切换环境后 URL 正确替换
- [ ] Header 中变量正确替换
- [ ] Body 中变量正确替换
- [ ] 未解析变量提示正确

### 8.5 响应查看

- [ ] JSON 响应自动格式化
- [ ] `Pretty / Raw` 切换正常
- [ ] Headers 展示正常
- [ ] Meta 展示耗时和大小
- [ ] 复制响应体正常
- [ ] 请求成功后 `正在发送请求...` banner 会消失
- [ ] 若 Webview 未消费响应消息, 工作台可自动自愈并恢复结果

### 8.6 cURL 导入

- [ ] 导入 GET cURL
- [ ] 导入带 Header 的 cURL
- [ ] 导入带 JSON Body 的 cURL
- [ ] 非法 cURL 提示清晰

### 8.7 压测

- [ ] 输入合法参数可启动压测
- [ ] 超过上限会被拦截
- [ ] 进度实时更新
- [ ] 可停止压测
- [ ] 结果摘要正确
- [ ] 错误样本可见

## 9. 测试策略

### 9.1 自动化测试优先级

P0:

- store 配置读写
- resolver 变量替换
- runner 超时和取消
- load_runner 统计正确性

P1:

- cURL 解析
- 历史记录写入
- 请求状态恢复

P2:

- Webview 消息协议集成测试
- UI 交互端到端测试

### 9.2 测试实现要求

- 每个测试文件都要有 `[流程]`, `[步骤]`, `[验证]`, `[结论]`
- 每个测试文件都要落盘日志
- 外部网络依赖场景要可替换为本地 mock server
- 压测测试要避免真实高负载, 使用可控 mock 响应

### 9.3 建议的 mock 方案

- 使用 Node 内置 `http` 模块启动临时测试服务
- 提供 `200`, `400`, `500`, 延迟响应, 超时响应等固定场景
- 每个测试结束后显式释放端口和资源

## 10. 技术风险清单

### R1. Webview 构建复杂度上升

说明:

- 当前仓库使用 `esbuild` 打包扩展入口
- 如果 Webview 前端代码逐渐增多, 需要明确其打包方式

处理:

- 第一阶段先以最小化脚本接入
- 若前端代码增长明显, 再拆独立打包入口

### R2. 配置文件与草稿状态不一致

说明:

- 已保存请求和未保存草稿并存时, 容易让用户混淆

处理:

- UI 明确展示 `未保存`
- 保存后清理对应草稿版本

### R3. 压测影响扩展宿主稳定性

说明:

- 高并发压测会消耗 CPU 和内存

处理:

- 强制参数上限
- 结果采样而非保存全部明细
- 后续必要时切换 Worker 或 Rust 子进程

### R4. cURL 兼容度不足

说明:

- cURL 语法变体非常多

处理:

- 第一版只覆盖常见参数
- 未支持参数以 warning 形式提示, 不默默忽略

### R5. Webview 已收到响应但界面未刷新

说明:

- 实际验收中出现过 `response delivered=true` 但 UI 仍停留在 `请求中` 的问题
- 根因包括旧 Webview 实例未升级, 或前端未稳定消费 `httpClient/response`

处理:

- `httpClient/init` 回传 `buildId`
- 输出通道增加 `[HttpClientWebview]` 前端日志
- Webview 渲染完成后回传 `responseAck`
- 宿主在 ack 超时后按当前状态自动重建 Panel

## 11. 建议执行顺序

为了降低返工, 建议严格按以下顺序推进:

1. `types.ts`
2. `store.ts`
3. `resolver.ts`
4. `runner.ts`
5. `register.ts`
6. `panel.ts`
7. Webview 壳层
8. 请求编辑 UI
9. 响应展示 UI
10. 历史和收藏
11. cURL 导入
12. `load_runner.ts`
13. 压测 UI
14. 测试补齐
15. 文档与发布检查

原因:

- 先稳定内核, 再做 UI
- 先稳定普通请求, 再做压测
- 先让功能可用, 再做体验打磨

## 12. 建议的提交粒度

为了便于回滚和审查, 建议按功能块提交, 不要一次性堆大提交.

建议提交粒度:

1. `feat: add http client module scaffold`
2. `feat: implement http client store and workspace schema`
3. `feat: add request resolver and fetch runner`
4. `feat: add http client webview workbench shell`
5. `feat: implement request editor and collection actions`
6. `feat: add response viewer with history and favorites`
7. `feat: add http load test runner and result panel`
8. `test: add http client module tests and logs`
9. `docs: add http client design and todo documents`

## 13. 资源与依赖判断

当前实现建议优先使用已有能力:

- Node 18 `fetch`
- VS Code `WebviewPanel`
- `workspaceState`
- 当前统一输出通道

当前不建议先引入:

- 重型 HTTP 库
- 重型状态管理框架
- 图表库
- 专业压测依赖

原则:

- 第一版先把核心链路跑通
- 新依赖必须能说明明确收益

## 14. 最终执行结论

HTTP Client 的生产级实施不应从 UI 开始, 而应从 `数据模型 -> 持久化 -> 请求执行 -> 工作台 -> 压测 -> 测试发布` 逐层推进.

本规划的目标不是让 TODO 看起来完整, 而是确保以下事实成立:

- 每个阶段都有可交付结果
- 每个阶段都有退出条件
- 每个模块都有测试责任
- 每次提交都能被审查和回滚
- 最终发布前没有遗漏文档, 日志和回归验证

如果后续按本规划实施, 第一版 HTTP Client 可以在不破坏现有插件结构的前提下, 以较低风险落地为一个可持续维护的生产功能.
