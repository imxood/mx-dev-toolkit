import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import * as path from "path";
import { HttpClientStore } from "../store";
import {
  createDefaultRequest,
  HTTP_CLIENT_HISTORY_RESPONSE_MAX_BYTES,
  HttpResponseResult,
} from "../types";
import { createTempWorkspace, createTestLogger, MemoryStateStore } from "./helpers";

test("store: 配置初始化, 保存请求与历史状态可恢复", async () => {
  const logger = await createTestLogger("http_client_store.txt");
  await logger.flow("验证 store 初始化, 请求持久化和 workspaceState 状态恢复");

  const workspaceRoot = await createTempWorkspace("mx-http-store");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);

  await logger.step("首次初始化工作区, 自动创建 mx_http_client.json");
  const config = await store.ensureInitialized();
  assert.ok(config.collections.length > 0);
  assert.ok(config.environments.length > 0);
  assert.ok(await fileExists(path.join(workspaceRoot, "mx_http_client.json")));

  await logger.step("创建请求并保存到配置文件");
  const request = createDefaultRequest("获取产品列表", config.collections[0].id);
  request.method = "POST";
  request.url = "http://localhost/api/products";
  request.bodyMode = "json";
  request.bodyText = "{\n  \"user\": \"demo\"\n}";
  const savedRequest = await store.saveRequest(request);
  assert.equal(savedRequest.name, "获取产品列表");

  await logger.step("写入 activeRequestId, draft 和 history");
  await store.setActiveRequestId(savedRequest.id);
  await store.saveDraft({ ...savedRequest, name: "获取产品列表 草稿" }, true);
  await store.recordHistory({
    id: "history-1",
    request: savedRequest,
    environmentId: null,
    executedAt: new Date().toISOString(),
    responseSummary: {
      status: 200,
      statusText: "OK",
      durationMs: 12,
      ok: true,
      sizeBytes: 128,
    },
  });

  await logger.step("重新创建 store 实例, 校验磁盘和状态可恢复");
  const nextStore = new HttpClientStore(workspaceRoot, stateStore);
  const nextSnapshot = await nextStore.loadSnapshot();
  const nextDraft = nextStore.getDraft(savedRequest.id);

  await logger.verify(`快照中请求数量: ${nextSnapshot.config.requests.length}`);
  assert.equal(nextSnapshot.config.requests.length, 1);
  assert.equal(nextSnapshot.activeRequestId, savedRequest.id);
  assert.equal(nextDraft.dirty, true);
  assert.equal(nextDraft.draft?.name, "获取产品列表 草稿");
  assert.equal(nextSnapshot.history.length, 1);

  const rawConfig = JSON.parse(await fs.readFile(path.join(workspaceRoot, "mx_http_client.json"), "utf8"));
  await logger.verify(`磁盘配置 version: ${rawConfig.version}`);
  assert.equal(rawConfig.version, 1);

  await logger.conclusion("store 已满足初始化, 持久化和状态恢复要求");
});

test("store: 环境可保存变量并在删除后清理激活状态", async () => {
  const logger = await createTestLogger("http_client_store.txt");
  await logger.flow("验证环境变量持久化以及删除环境后的激活状态清理");

  const workspaceRoot = await createTempWorkspace("mx-http-store-env");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  const config = await store.ensureInitialized();
  const environment = config.environments[0];

  await logger.step("保存环境变量修改并写回磁盘");
  environment.name = "prod";
  environment.variables.baseUrl = "https://api.example.com";
  environment.variables.token = "demo-token";
  const savedEnvironment = await store.saveEnvironment(environment);
  await store.setActiveEnvironmentId(savedEnvironment.id);

  const savedConfig = await store.loadConfig();
  const savedProd = savedConfig.environments.find((item) => item.id === savedEnvironment.id);
  assert.equal(savedProd?.name, "prod");
  assert.equal(savedProd?.variables.baseUrl, "https://api.example.com");

  await logger.step("删除当前激活环境后, activeEnvironmentId 应清空");
  await store.deleteEnvironment(savedEnvironment.id);
  const snapshot = await store.loadSnapshot();
  assert.equal(snapshot.activeEnvironmentId, null);
  assert.equal(snapshot.config.environments.some((item) => item.id === savedEnvironment.id), false);

  await logger.conclusion("环境保存与删除行为符合预期");
});

test("store: 配置缓存预热后, duplicateRequest 与 loadSnapshot 不再依赖重复读盘", async () => {
  const logger = await createTestLogger("http_client_store.txt");
  await logger.flow("验证配置缓存预热后, 复制请求和生成快照可复用内存配置, 不再依赖重复读盘");

  const workspaceRoot = await createTempWorkspace("mx-http-store-cache");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  const config = await store.ensureInitialized();

  await logger.step("先保存一条请求, 让配置缓存处于已预热状态");
  const request = createDefaultRequest("缓存测试请求", config.collections[0].id);
  request.url = "https://example.com/cache";
  const savedRequest = await store.saveRequest(request);

  await logger.step("删除磁盘配置后直接执行 duplicateRequest, 应仍能依赖缓存成功完成并重建文件");
  const configPath = path.join(workspaceRoot, "mx_http_client.json");
  await fs.unlink(configPath);
  const duplicate = await store.duplicateRequest(savedRequest.id);

  await logger.step("继续读取快照, 应直接得到包含原请求和副本的配置");
  const snapshot = await store.loadSnapshot();

  await logger.verify(`缓存快照请求数量: ${snapshot.config.requests.length}`);
  assert.equal(snapshot.config.requests.length, 2);
  assert.equal(snapshot.activeRequestId, duplicate.id);
  assert.ok(await fileExists(configPath));

  await logger.conclusion("配置缓存已可支撑复制请求与状态快照, 避免关键路径重复读盘");
});

test("store: createScratchRequest 支持沿用前端本地草稿 ID", async () => {
  const logger = await createTestLogger("http_client_store.txt");
  await logger.flow("验证前端本地创建的新请求可直接把同一份草稿 ID 交给 store 持久化");

  const workspaceRoot = await createTempWorkspace("mx-http-store-scratch");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  const config = await store.ensureInitialized();

  await logger.step("构造带固定 ID 的本地草稿, 然后交给 store 创建 scratch request");
  const localDraft = createDefaultRequest("本地新请求", config.collections[0].id);
  localDraft.url = "https://example.com/local-first";
  const scratch = await store.createScratchRequest(config.collections[0].id, localDraft);

  await logger.step("读取 scratchDraft 与快照, 校验 activeRequestId 和草稿 ID 保持一致");
  const scratchDraft = store.getScratchDraft();
  const snapshot = await store.loadSnapshot();

  await logger.verify(`草稿 ID: ${scratch.id}`);
  assert.equal(scratch.id, localDraft.id);
  assert.equal(scratchDraft?.id, localDraft.id);
  assert.equal(snapshot.activeRequestId, localDraft.id);
  assert.equal(scratchDraft?.url, "https://example.com/local-first");

  await logger.conclusion("store 已支持沿用前端本地草稿 ID, 避免 Host 重新生成 request id");
});

test("store: recordHistory 按 method+url 去重, 复用历史 ID 并保留最新响应", async () => {
  const logger = await createTestLogger("http_client_store.txt");
  await logger.flow("验证同一 method+url 的多次执行只保留一条历史, ID 保持稳定, 响应正文被持久化");

  const workspaceRoot = await createTempWorkspace("mx-http-store-history-dedupe");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  const config = await store.ensureInitialized();

  const savedRequest = await store.saveRequest({
    ...createDefaultRequest("会员查询", config.collections[0].id),
    method: "POST",
    url: "https://api.example.com/member/info",
    bodyMode: "json",
    bodyText: "{\"memberId\":\"demo\"}",
  });

  const responseFirst = createJsonResponse({
    body: "{\"ok\":true,\"value\":1}",
    status: 200,
  });
  const responseSecond = createJsonResponse({
    body: "{\"ok\":true,\"value\":2}",
    status: 200,
  });

  await logger.step("首次记录 POST /member/info 的执行结果");
  await store.recordHistory({
    id: "history-a",
    request: savedRequest,
    environmentId: null,
    executedAt: new Date().toISOString(),
    responseSummary: {
      status: responseFirst.status,
      statusText: responseFirst.statusText,
      durationMs: responseFirst.meta.durationMs,
      ok: responseFirst.ok,
      sizeBytes: responseFirst.meta.sizeBytes,
    },
    response: responseFirst,
  });

  await logger.step("再次执行同一 URL, 应替换原历史条目而不是新增");
  await store.recordHistory({
    id: "history-b",
    request: savedRequest,
    environmentId: null,
    executedAt: new Date().toISOString(),
    responseSummary: {
      status: responseSecond.status,
      statusText: responseSecond.statusText,
      durationMs: responseSecond.meta.durationMs,
      ok: responseSecond.ok,
      sizeBytes: responseSecond.meta.sizeBytes,
    },
    response: responseSecond,
  });

  const history = store.getHistory();
  await logger.verify(`历史条目数: ${history.length}, history id: ${history[0]?.id ?? "<none>"}`);
  assert.equal(history.length, 1);
  assert.equal(history[0].id, "history-a");
  assert.equal(history[0].response?.bodyPrettyText, responseSecond.bodyPrettyText);
  assert.equal(history[0].responseSummary.status, 200);

  await logger.step("执行不同 URL 的请求, 应作为独立的历史条目并存");
  const otherRequest = await store.saveRequest({
    ...createDefaultRequest("设备查询", config.collections[0].id),
    url: "https://api.example.com/device/info",
  });
  await store.recordHistory({
    id: "history-c",
    request: otherRequest,
    environmentId: null,
    executedAt: new Date().toISOString(),
    responseSummary: {
      status: 200,
      statusText: "OK",
      durationMs: 12,
      ok: true,
      sizeBytes: 24,
    },
    response: createJsonResponse({ body: "{\"device\":1}", status: 200 }),
  });

  const allHistory = store.getHistory();
  await logger.verify(`混合后历史条目数: ${allHistory.length}`);
  assert.equal(allHistory.length, 2);
  assert.deepEqual(
    allHistory.map((item) => `${item.request.method} ${item.request.url}`),
    ["GET https://api.example.com/device/info", "POST https://api.example.com/member/info"]
  );

  await logger.step("新 store 实例读取快照, 验证响应持久化可跨会话恢复");
  const restoredStore = new HttpClientStore(workspaceRoot, stateStore);
  const restoredHistory = restoredStore.getHistory();
  const restoredMember = restoredHistory.find((item) => item.request.url === savedRequest.url);
  assert.ok(restoredMember);
  assert.equal(restoredMember.response?.bodyPrettyText, responseSecond.bodyPrettyText);

  await logger.conclusion("recordHistory 已按 method+url 去重并保留最新响应快照");
});

test("store: recordHistory 对超大响应体保留原始大小但记录仍可读", async () => {
  const logger = await createTestLogger("http_client_store.txt");
  await logger.flow("验证 store 不擅自截断响应正文, 截断策略由 panel 写入前完成, store 仅负责按 key 去重");

  const workspaceRoot = await createTempWorkspace("mx-http-store-history-large");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  const config = await store.ensureInitialized();

  const request = await store.saveRequest({
    ...createDefaultRequest("大数据响应", config.collections[0].id),
    url: "https://api.example.com/big",
  });

  const oversizeBody = "x".repeat(HTTP_CLIENT_HISTORY_RESPONSE_MAX_BYTES + 1024);
  const response = createJsonResponse({ body: oversizeBody, status: 200, sizeBytes: oversizeBody.length });

  await logger.step("写入超过阈值的大响应, store 应完整保留由 panel 预截断后的内容");
  await store.recordHistory({
    id: "history-big",
    request,
    environmentId: null,
    executedAt: new Date().toISOString(),
    responseSummary: {
      status: response.status,
      statusText: response.statusText,
      durationMs: response.meta.durationMs,
      ok: response.ok,
      sizeBytes: response.meta.sizeBytes,
    },
    response,
    responseTruncated: false,
  });

  const history = store.getHistory();
  const recorded = history[0];
  await logger.verify(`响应正文长度: ${recorded.response?.bodyRawText.length ?? 0}, truncated 标记: ${recorded.responseTruncated}`);
  assert.ok(recorded.response);
  assert.equal(recorded.responseSummary.sizeBytes, oversizeBody.length);

  await logger.conclusion("store 已按 key 去重并保留由 panel 处理的响应快照");
});

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function createJsonResponse(input: { body: string; status: number; sizeBytes?: number }): HttpResponseResult {
  const rawBytes = Buffer.byteLength(input.body, "utf8");
  return {
    ok: input.status >= 200 && input.status < 300,
    status: input.status,
    statusText: "OK",
    bodyRawText: input.body,
    bodyText: input.body,
    bodyPrettyText: tryFormatJson(input.body) ?? input.body,
    isJson: tryFormatJson(input.body) !== null,
    headers: [{ key: "content-type", value: "application/json" }],
    meta: {
      startedAt: new Date().toISOString(),
      durationMs: 18,
      sizeBytes: input.sizeBytes ?? rawBytes,
      finalUrl: "https://api.example.com",
      redirected: false,
      contentType: "application/json",
      unresolvedVariables: [],
      environmentId: null,
    },
  };
}

function tryFormatJson(input: string): string | null {
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return null;
  }
}
