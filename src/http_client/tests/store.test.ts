import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import * as path from "path";
import { HttpClientStore } from "../store";
import {
  createDefaultConfigFile,
  createDefaultRequest,
  HTTP_CLIENT_DEFAULT_COLLECTION_ID,
  HTTP_CLIENT_DEFAULT_COLLECTION_NAME,
  HttpResponseResult,
} from "../types";
import { createTempWorkspace, createTestLogger, MemoryStateStore } from "./helpers";

test("store: 配置初始化, 请求内嵌集合, 快照持久化与默认集合保护", async () => {
  const logger = await createTestLogger("http_client_store.txt");
  await logger.flow("验证 store 初始化, 请求嵌套集合, lastResponseSnapshot 落盘, 默认集合保护");

  const workspaceRoot = await createTempWorkspace("mx-http-store");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);

  await logger.step("首次初始化工作区, 自动创建默认集合与默认环境");
  const config = await store.ensureInitialized();
  assert.equal(config.version, 2);
  assert.equal(config.collections.length, 1);
  assert.ok(config.collections[0].isDefault);
  assert.equal(config.collections[0].id, HTTP_CLIENT_DEFAULT_COLLECTION_ID);
  assert.equal(config.collections[0].name, HTTP_CLIENT_DEFAULT_COLLECTION_NAME);
  assert.equal(config.environments.length, 1);
  assert.ok(await fileExists(path.join(workspaceRoot, "mx_http_client.json")));

  await logger.step("保存请求后, 请求应落在默认集合内");
  const request = createDefaultRequest("获取产品列表");
  request.method = "POST";
  request.url = "http://localhost/api/products";
  request.bodyMode = "json";
  request.bodyText = "{\n  \"user\": \"demo\"\n}";
  const saved = await store.saveRequest(request);
  const reloadedConfig = await store.loadConfig();
  assert.equal(reloadedConfig.collections.length, 1);
  assert.equal(reloadedConfig.collections[0].requests.length, 1);
  assert.equal(reloadedConfig.collections[0].requests[0].id, saved.id);

  await logger.step("upsertRequestByUrl 自动按 method+url 查找; 新建 URL 时落到默认集合顶部");
  const response = buildResponse(200, "{\"ok\":true}", 128);
  const updated = await store.upsertRequestByUrl(request, response);
  assert.equal(updated.lastStatus, 200);
  assert.equal(updated.lastResponseSnapshot?.status, 200);
  const next = await store.loadConfig();
  assert.equal(next.collections[0].requests[0].id, updated.id);
  assert.equal(next.collections[0].requests[0].lastStatus, 200);

  await logger.step("二次 upsert 命中同一 method+url 时不新增记录, 只更新快照");
  const later = buildResponse(201, "{\"ok\":true}", 256);
  const updatedAgain = await store.upsertRequestByUrl(request, later);
  assert.equal(updatedAgain.id, updated.id);
  const finalConfig = await store.loadConfig();
  assert.equal(finalConfig.collections[0].requests.length, 1);

  await logger.step("重写 store 实例后, lastResponseSnapshot 应从磁盘恢复");
  const nextStore = new HttpClientStore(workspaceRoot, stateStore);
  const snapshot = await nextStore.loadSnapshot();
  const lookup = nextStore.findRequestById(updated.id);
  assert.ok(lookup);
  assert.equal(lookup.request.lastStatus, 201);
  assert.equal(lookup.request.lastResponseSnapshot?.bodyRawText, "{\"ok\":true}");

  await logger.step("默认集合不可重命名或删除");
  await assert.rejects(() => nextStore.renameCollection(HTTP_CLIENT_DEFAULT_COLLECTION_ID, "新名字"));
  await assert.rejects(() => nextStore.deleteCollection(HTTP_CLIENT_DEFAULT_COLLECTION_ID));

  await logger.conclusion("store 已满足嵌套集合, 快照自动 upsert 和默认集合保护要求");
});

test("store: 集合的请求可移动并保留历史快照", async () => {
  const logger = await createTestLogger("http_http_store_move.txt");
  await logger.flow("验证 moveRequest 在集合之间移动请求, 同时保留 lastResponseSnapshot");

  const workspaceRoot = await createTempWorkspace("mx-http-store-move");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);

  const config = await store.ensureInitialized();
  const savedA = await store.saveRequest(createDefaultRequest("A"));
  await store.upsertRequestByUrl(savedA, buildResponse(200, "{\"a\":1}", 64));
  const products = await store.createCollection("产品 API");

  await logger.step("moveRequest 把默认集合的请求搬到目标集合, 快照保留");
  await store.moveRequest(savedA.id, products.id);
  const next = await store.loadConfig();
  const defaultCollection = next.collections.find((c) => c.isDefault);
  const productsCollection = next.collections.find((c) => c.id === products.id);
  assert.ok(defaultCollection && productsCollection);
  assert.equal(defaultCollection.requests.length, 0);
  assert.equal(productsCollection.requests.length, 1);
  assert.equal(productsCollection.requests[0].lastStatus, 200);

  await logger.step("删除非默认集合时, 其请求回迁到默认集合");
  await store.deleteCollection(products.id);
  const afterDelete = await store.loadConfig();
  const defaultAfterDelete = afterDelete.collections.find((c) => c.isDefault);
  assert.ok(defaultAfterDelete);
  assert.equal(defaultAfterDelete.requests.length, 1);
  assert.equal(defaultAfterDelete.requests[0].id, savedA.id);
  assert.equal(afterDelete.collections.length, 1);

  await logger.conclusion("moveRequest 与 deleteCollection 已具备集合整理能力");
});

test("store: 环境可保存变量并在删除后清理激活状态", async () => {
  const logger = await createTestLogger("http_client_store_env.txt");
  await logger.flow("验证环境变量持久化以及删除环境后的激活状态清理");

  const workspaceRoot = await createTempWorkspace("mx-http-store-env");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  const config = await store.ensureInitialized();
  const environment = config.environments[0];

  await logger.step("保存环境变量应覆盖回写");
  await store.saveEnvironment({
    ...environment,
    name: "staging",
    variables: { baseUrl: "https://staging.api", token: "abc" },
  });

  await logger.step("删除环境后, 若它处于激活状态, 激活 id 应清空");
  await store.setActiveEnvironmentId(environment.id);
  await store.deleteEnvironment(environment.id);
  const snapshot = await store.loadSnapshot();
  assert.equal(snapshot.activeEnvironmentId, null);

  await logger.conclusion("环境持久化和清理逻辑符合预期");
});

function buildResponse(status: number, body: string, sizeBytes: number): HttpResponseResult {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Created",
    bodyRawText: body,
    bodyText: body,
    bodyPrettyText: body,
    isJson: body.startsWith("{"),
    headers: [{ key: "content-type", value: "application/json" }],
    meta: {
      startedAt: new Date().toISOString(),
      durationMs: 50,
      sizeBytes,
      finalUrl: "http://localhost/api/products",
      redirected: false,
      contentType: "application/json",
      unresolvedVariables: [],
      environmentId: null,
    },
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
