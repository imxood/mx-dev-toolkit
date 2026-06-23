# HTTP 客户端请求响应延迟排查

最后更新: 2026-06-23
状态: 排查归档 / 已修复
适用版本: HTTP Client Webview React 化 v2 (config version=2) 之后
触发版本: `package.json` 0.4.x, `media/http_client/workbench.js` 34.79 kB

## 1. 现象

用户报告:

- 请求 `http://iot.iotim.com/ehong/api/health` 实测耗时 **30 ms**
- 在 HTTP Client 工作台里点"发送"后, **体感 1.5 秒** 才看到响应渲染
- 复现稳定, 与请求 URL / 大小无关, 看似"所有请求都慢"

用户的初始描述: "实际请求 31 ms 但看到输出延迟几秒", 并明确否定磁盘 I/O 假设。

## 2. 排查过程

### 2.1 误判: 磁盘 I/O

第一反应是 `mx_http_client.json` 写盘慢 (每个响应都触发 `upsertRequestByUrl` → `writeConfig`), 但用户已否定: **响应能正常落盘, 体感延迟不是磁盘问题**。

### 2.2 读 sendRequest 主流程

`src/http_client/panel.ts` 的 `sendRequest` 在 `requestRunner.run()` (30 ms 完成) 之后依次执行:

```ts
// 1. 推响应 (核心契约, 不能删)
const responseDelivered = await this.postMessage({
  type: "httpClient/response",
  payload: response,
});

// 2. 等 ack (兜底, 400ms 超时 reload)
if (responseDelivered) this.scheduleResponseAckWait();

// 3. 推完整 state (冗余, 是元凶)
await this.postState();

// 4. 后台写盘
this.persistRequestSnapshotInBackground(...);

// 5. finally 又推一次完整 state (冗余)
} finally {
  await this.postState();
}
```

### 2.3 锁定元凶: 冗余的 `postState()` 推全量 viewState

`postState()` 推的是 `httpClient/state` 消息, payload 是完整 `HttpClientViewState`:

```
{
  config: 所有 collections + 所有 requests + 每个 request 的 lastResponseSnapshot,  ← 巨大, 几 MB
  draft,
  response,
  requestRunning,
  loadTestProfile,
  ...
}
```

**关键事实**:

- HTTP Client 切到"集合内嵌 req + 快照内化"数据模型后, 每个 `HttpRequestEntity` 自带 `lastResponseSnapshot`
- 默认集合接管所有"曾经发过的请求", 按 `method+url` 唯一 upsert
- 用户每发一个请求, `config` 里就多一个带快照的 req
- 跑了 N 个请求后, `config` 字段可达几 MB (假设平均 50 KB 快照 × 50 请求)

**postState() 的两次冗余推送**:

- 第 3 步: 响应推完立刻 postState, 序列化整个 config + 跨 IPC 推到 webview
- 第 5 步 (finally): 再次 postState, 又序列化一次

**Webview 端** (`workbench_model.ts:96-108`) 收到 `httpClient/response` 时已经通过 `patchWorkbenchSession` 设了:

- `response`
- `requestRunning: false`
- `responseTab: "body"`

React 该 re-render 就 re-render。**根本不需要再收一次完整 state**。

## 3. 修复

`src/http_client/panel.ts` 的 sendRequest 主流程:

**改前**:

```ts
const responseDelivered = await this.postMessage({
  type: "httpClient/response",
  payload: response,
});
this.channel.appendLine(`[HttpClient] response delivered=${responseDelivered}`);
if (responseDelivered) {
  this.scheduleResponseAckWait();
}
await this.postState();                                                // ← 删
this.channel.appendLine("[HttpClient] response state refreshed");      // ← 删

// 快照写盘放后台, 不阻塞用户感知.
this.persistRequestSnapshotInBackground(...);
} catch (error) {
  ...
} finally {
  this.requestRunning = false;
  this.requestAbortController = null;
  await this.postState();                                              // ← 删
  this.channel.appendLine("[HttpClient] request cycle completed");
}
```

**改后**:

```ts
const responseDelivered = await this.postMessage({
  type: "httpClient/response",
  payload: response,
});
this.channel.appendLine(`[HttpClient] response delivered=${responseDelivered}`);
if (responseDelivered) {
  this.scheduleResponseAckWait();
}

// 快照写盘放后台, 不阻塞用户感知.
this.persistRequestSnapshotInBackground(...);
} catch (error) {
  ...
} finally {
  this.requestRunning = false;
  this.requestAbortController = null;
  this.channel.appendLine("[HttpClient] request cycle completed");
}
```

## 4. 验证

### 4.1 加诊断埋点

`postMessage` 包了一层, 记录每次 postMessage 的字节数和耗时:

```ts
private async postMessage(message: ExtensionToWebviewMessage): Promise<boolean> {
  if (!this.panel) return false;
  const startedAt = performance.now();
  let payloadBytes = 0;
  try {
    payloadBytes = Buffer.byteLength(JSON.stringify(message), "utf8");
  } catch {
    payloadBytes = -1;
  }
  const delivered = await this.panel.webview.postMessage(message);
  const elapsedMs = performance.now() - startedAt;
  this.channel.appendLine(
    `[HttpClientPerf][postMessage] type=${message.type} bytes=${payloadBytes} elapsed=${formatPerfDuration(elapsedMs)} delivered=${delivered}`
  );
  return delivered;
}
```

未来再出"卡顿"问题, 看 `mx-dev-toolkit` 输出通道的 `[HttpClientPerf][postMessage]` 行, 能直接定位哪个 message 序列化慢、多大。

### 4.2 实测效果

- 修改前: 用户体感 1.5 秒延迟
- 修改后: 用户体感 "30 ms 请求 + 几乎瞬时看到响应"
- 测试: `pnpm test:http-client` 21/21 通过 (16 core + 5 webview)
- 编译: `pnpm compile` 通过 (webview 34.79 kB + extension 386.6 kB)

## 5. 可靠性论证

用户正确质疑: "如果 webview 没收到响应怎么办?"

**结论: 可靠性没退化**。核心响应契约没动, 删除的只是冗余的全量 state 同步。

| 场景 | 链路 | 现状 |
|---|---|---|
| 正常路径 | `httpClient/response` → webview 渲染 → `httpClient/responseAck` | ✅ 完整保留 |
| webview 渲染失败但消息到达 | `useEffect` (workbench_controller.ts:1010) 仍 post ack | ✅ ack 兜底 |
| webview 完全没收到 response (IPC 真丢包) | 400ms 内没 ack → `reloadPanelFromState("response ack timeout")` → 重新生成 HTML (currentResponse 已设) | ✅ reload 兜底 |
| fetch 失败 | catch → `httpClient/error` → webview 显示错误 | ✅ 错误路径保留 |
| 用户取消 | `httpClient/cancelRequest` → stopRequest | ✅ 取消路径保留 |

真正的"响应到达" 契约是:

- **乐观通道**: `httpClient/response` 推 + webview 渲染 + ack 回
- **悲观兜底**: 400ms 没 ack → panel reload HTML → webview 必然看到 currentResponse

两个 `postState()` 当初是"防御性"留作兜底, 实际上是**冗余**——webview 不需要再收一次完整 state 来知道响应来了, `httpClient/response` 消息本身已经带了所有必要信息。

## 6. 教训 (可复用)

### 6.1 IPC 类消息推送原则

- **事件通知** (轻): 推"发生了什么", payload 小, 该推就推, 例如 `httpClient/response`, `httpClient/loadTest/progress`
- **全量状态同步** (重): 推"当前完整快照", 只在状态真正变化时推, 不在每次事件后都推, 例如 `httpClient/state`

**不能把"全量 state 同步"当成"事件通知"用**, 否则 IPC 序列化的开销会随历史数据线性增长。

### 6.2 "防御性冗余" 反模式

代码里写"防御性冗余" (例如 catch 里再调一次 postState, finally 里又 postState), 看起来"保险", 实际:

- 增加 IPC 开销 (全量 state 序列化 + 跨进程推送)
- 跟正常的"事件通知"消息重复
- 一旦全量 state 膨胀 (含历史快照), 这部分开销会爆炸

**原则**: 一个消息该推一次就推一次。冗余推送不是保险, 是负担。

### 6.3 性能问题排查 SOP

1. **加埋点优先于猜**: 给每个关键 await 加时间戳 + payload 字节数, 跑一次看数据, 别靠"我觉得是 X"
2. **关注 payload 膨胀**: IPC 序列化成本 = O(payload size), 跟"消息推几次"无关, 跟"每次推多大"有关
3. **不要被"事件流"骗**: 用户看到"请求 30 ms + 延迟 1.5 秒", 第一反应是请求慢, 实际是请求后的 IPC 推送慢

### 6.4 数据模型影响性能

"集合内嵌 req + 快照内化" 数据模型让 `config` 字段自然增长, 这没问题 (设计本意就是用户历史)。**但任何推 `config` 的全量 state 同步路径都要谨慎**:

- 每次 postState 都序列化整个 config, 历史越长越慢
- 业务正确 ≠ 性能正确, 要分开看

如果未来 `config` 字段继续膨胀, 应该考虑:

- 全量 state 推送改为 diff 推送 (只推变化的部分)
- 把 lastResponseSnapshot 从 viewState 中分离, 按需加载
- 或者: `postState()` 干脆不推 config, webview 一次性拿到 config 后自己维护

## 7. 相关文件

- `src/http_client/panel.ts`
  - `sendRequest` 主流程 (修改)
  - `postMessage` 诊断埋点 (新增)
- `src/http_client/types.ts`
  - `HttpClientViewState` 定义 (含 `config` / `response` 字段)
  - `HttpRequestEntity.lastResponseSnapshot` 字段 (快照内化)
- `webviews/http_client/shared/workbench_model.ts`
  - `applyWorkbenchMessage` 的 `httpClient/response` 分支 (line 96-108)
  - `patchWorkbenchSession` 设 `response / requestRunning=false / responseTab="body"`
- `webviews/http_client/workbench/useWorkbenchController.ts`
  - `useEffect` (line 1010-1026) 发 `httpClient/responseAck` 兜底

## 8. 相关记忆

- `~/.mavis/agents/mavis/memory/MEMORY.md` 第 4 节: "测试代码不用硬超时"
- 跨项目可复用经验: 见 `~/.mavis/agents/mavis/memory/vscode-webview-perf.md` (TODO: 待新建)

## 9. 后续 TODO

- [ ] 评估是否把 `postMessage` 埋点常驻 (现仅 sendRequest 流程触发), 便于未来排查其它流程
- [ ] 评估是否把 `lastResponseSnapshot` 从 viewState 分离 (按需加载), 彻底杜绝"全量 state 推送膨胀"
- [ ] 跨项目经验沉淀: 新建 `vscode-webview-perf.md` topic, 把"事件通知 vs 全量 state 同步"原则写入