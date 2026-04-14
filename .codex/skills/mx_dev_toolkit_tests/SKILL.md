---
name: mx_dev_toolkit_tests
description: 统一 `mx-dev-toolkit` 的测试执行, 日志分析和新增测试接入规范. 当前重点覆盖 `http_client` 模块的编译, lint, 测试与验收流程.
---

# mx_dev_toolkit_tests

最后更新: 2026-04-13

## 1. 目标

本 Skill 用于统一 `mx-dev-toolkit` 的测试执行, 日志分析和新增测试接入规范. 当前重点覆盖 `http_client` 模块.

## 2. 全量测试清单

### 2.1 HTTP Client

- `src/http_client/tests/store.test.ts`
  - 验证配置初始化, 请求持久化, draft 和 history 恢复.
- `src/http_client/tests/resolver.test.ts`
  - 验证环境变量替换和未解析变量收集.
- `src/http_client/tests/runner.test.ts`
  - 验证正常请求, 超时和取消.
- `src/http_client/tests/load_runner.test.ts`
  - 验证并发调度, 指标聚合和取消.
- `src/http_client/tests/curl_import.test.ts`
  - 验证常见 cURL 导入路径.
- `src/http_client/tests/panel.test.ts`
  - 验证响应回推与历史持久化顺序, 防止“请求完成但界面卡住”.
- `src/http_client/tests/sidebar_view.test.ts`
  - 验证 React 侧边栏装载页引用正确资源, 并保留 bootstrap 与 Toast host.
- `src/http_client/tests/react_loader.test.ts`
  - 验证 React 工作台装载页引用正确资源, 并保留 bootstrap 与 Toast host.
- `webviews/http_client/tests/workbench_model.test.ts`
  - 验证 React workbench 共享纯函数, 协议消息应用和 JSON 高亮逻辑.
- `webviews/http_client/tests/sidebar_model.test.ts`
  - 验证 React 侧边栏共享纯函数, 最近 30 条聚合和筛选逻辑.

## 3. 执行命令

### 3.1 HTTP Client 全量测试

```powershell
pnpm test:http-client
```

### 3.2 React Webview 纯逻辑测试

```powershell
pnpm test:http-client:webview
```

### 3.3 项目编译与静态检查

```powershell
pnpm compile
pnpm lint
```

## 4. 验收标准

以下条件必须同时满足:

1. `pnpm compile` 通过.
2. `pnpm lint` 通过.
3. `pnpm test:http-client` 通过.
4. 生成以下日志文件:
   - `logs/mx-dev-toolkit/tests/http_client_store.txt`
   - `logs/mx-dev-toolkit/tests/http_client_resolver.txt`
   - `logs/mx-dev-toolkit/tests/http_client_runner.txt`
   - `logs/mx-dev-toolkit/tests/http_client_load_runner.txt`
   - `logs/mx-dev-toolkit/tests/http_client_curl_import.txt`
   - `logs/mx-dev-toolkit/tests/http_client_panel.txt`
   - `logs/mx-dev-toolkit/tests/http_client_sidebar_view.txt`
   - `logs/mx-dev-toolkit/tests/http_client_react_loader.txt`
   - `logs/mx-dev-toolkit/tests/http_client_workbench_model.txt`
   - `logs/mx-dev-toolkit/tests/http_client_sidebar_model.txt`
5. 手工验证 HTTP Client 工作台核心路径:
   - 打开工作台
   - 新建请求并发送
   - 保存请求
   - 查看响应
   - 导入 cURL
   - 执行压测

## 5. 日志分析步骤

### 5.1 查看日志目录

```powershell
Get-ChildItem logs\mx-dev-toolkit\tests
```

### 5.2 按模块查看日志

```powershell
Get-Content logs\mx-dev-toolkit\tests\http_client_store.txt
Get-Content logs\mx-dev-toolkit\tests\http_client_runner.txt
```

### 5.3 分析方法

- 先看 `[流程]`, 确认当前测试验证目标.
- 再看 `[步骤]`, 还原关键执行路径.
- 再看 `[验证]`, 对照中间结果是否符合预期.
- 最后看 `[结论]`, 确认是否达成验收.

## 6. 新增测试接入流程

1. 宿主侧测试放在 `src/http_client/tests/` 下, React Webview 纯逻辑测试放在 `webviews/http_client/tests/` 下.
2. 保证测试输出包含 `[流程]`, `[步骤]`, `[验证]`, `[结论]`.
3. 为测试新增对应日志文件, 放在 `logs/mx-dev-toolkit/tests/`.
4. 将新增测试加入对应脚本:
   - 宿主侧加入 `test:http-client:core`
   - React Webview 加入 `test:http-client:webview`
   - 汇总校验保持接入 `test:http-client`
5. 更新本 Skill 中的测试清单和验收标准.
6. 执行 `pnpm test:http-client` 验证新增测试可运行.

## 7. 注意事项

- 网络相关测试默认使用本地 mock server, 避免依赖外部服务.
- 压测测试只能做可控的小规模调度验证, 不做真实高负载.
- 若新增模块测试, 必须同步扩展本 Skill 的模块索引和命令说明.
