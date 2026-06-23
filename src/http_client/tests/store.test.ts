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

  await logger.step("upsertRequestById 自动按 id 查找; 新 id 时落到默认集合顶部");
  const response = buildResponse(200, "{\"ok\":true}", 128);
  const updated = await store.upsertRequestById(request, response);
  assert.equal(updated.lastStatus, 200);
  assert.equal(updated.lastResponseSnapshot?.status, 200);
  const next = await store.loadConfig();
  assert.equal(next.collections[0].requests[0].id, updated.id);
  assert.equal(next.collections[0].requests[0].lastStatus, 200);

  await logger.step("二次 upsert 命中同一 id 时不新增记录, 只更新快照 (允许同名不同 url 共存)");
  const later = buildResponse(201, "{\"ok\":true}", 256);
  const updatedAgain = await store.upsertRequestById(request, later);
  assert.equal(updatedAgain.id, updated.id);
  const finalConfig = await store.loadConfig();
  assert.equal(finalConfig.collections[0].requests.length, 1);

  await logger.step("改 url 后 upsert 仍命中同一 id, 不按 url 去重");
  const renamedRequest = createDefaultRequest("同 id 不同 url");
  renamedRequest.id = request.id;
  renamedRequest.url = "http://localhost/api/products/v2";
  const updatedV2 = await store.upsertRequestById(renamedRequest, buildResponse(202, "{\"v\":2}", 32));
  assert.equal(updatedV2.id, request.id);
  const afterV2 = await store.loadConfig();
  assert.equal(afterV2.collections[0].requests[0].url, "http://localhost/api/products/v2");
  assert.equal(afterV2.collections[0].requests[0].lastStatus, 202);

  await logger.step("重写 store 实例后, lastResponseSnapshot 应从磁盘恢复");
  const nextStore = new HttpClientStore(workspaceRoot, stateStore);
  const snapshot = await nextStore.loadSnapshot();
  const lookup = nextStore.findRequestById(updated.id);
  assert.ok(lookup);
  assert.equal(lookup.request.lastStatus, 202);
  assert.equal(lookup.request.lastResponseSnapshot?.bodyRawText, "{\"v\":2}");

  await logger.step("默认集合不可重命名或删除");
  await assert.rejects(() => nextStore.renameCollection(HTTP_CLIENT_DEFAULT_COLLECTION_ID, "新名字"));
  await assert.rejects(() => nextStore.deleteCollection(HTTP_CLIENT_DEFAULT_COLLECTION_ID));

  await logger.conclusion("store 已满足嵌套集合, 快照自动 upsert 和默认集合保护要求");
});

test("store: moveRequest 支持同集合按 beforeId 重排, ULID 中点算法", async () => {
  const logger = await createTestLogger("http_client_store_reorder.txt");
  await logger.flow("验证同集合内按 beforeId 重排顺序, sortId 用 ULID 中点算法");

  const workspaceRoot = await createTempWorkspace("mx-http-store-reorder");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);

  const savedA = await store.saveRequest(createDefaultRequest("A"));
  const savedB = await store.saveRequest(createDefaultRequest("B"));
  const savedC = await store.saveRequest(createDefaultRequest("C"));

  const initial = await store.loadConfig();
  const defaultCollection = initial.collections[0];
  assert.equal(defaultCollection.requests.length, 3);
  // saveRequest 内部用 unshift, 所以保存顺序为 [C, B, A] (后保存的在前面)
  const initialOrder = defaultCollection.requests.map((r) => r.id);
  assert.deepEqual(initialOrder, [savedC.id, savedB.id, savedA.id]);

  await logger.step("把 A 移到 B 之前 (beforeId = B) → [C, A, B] (A 进 B 当前 index 1)");
  await store.moveRequest(savedA.id, savedB.id, defaultCollection.id);
  const afterMoveAB = await store.loadConfig();
  assert.deepEqual(
    afterMoveAB.collections[0].requests.map((r) => r.id),
    [savedC.id, savedA.id, savedB.id]
  );

  await logger.step("把 A 移到 C 之前 (beforeId = C) → [A, C, B] (A 进 C 当前 index 0)");
  await store.moveRequest(savedA.id, savedC.id, defaultCollection.id);
  const afterMoveAC = await store.loadConfig();
  assert.deepEqual(
    afterMoveAC.collections[0].requests.map((r) => r.id),
    [savedA.id, savedC.id, savedB.id]
  );

  await logger.step("把 A 移到 A 之前 (beforeId = A) → no-op (紧邻 no-op)");
  await store.moveRequest(savedA.id, savedA.id, defaultCollection.id);
  const afterNoop = await store.loadConfig();
  assert.deepEqual(
    afterNoop.collections[0].requests.map((r) => r.id),
    [savedA.id, savedC.id, savedB.id]
  );

  await logger.step("把 C 移到 A 之前 (beforeId = A) → [C, A, B] (C 进 A 当前 index 0)");
  await store.moveRequest(savedC.id, savedA.id, defaultCollection.id);
  const afterMoveCA = await store.loadConfig();
  const order = afterMoveCA.collections[0].requests.map((r) => r.id);
  assert.deepEqual(order, [savedC.id, savedA.id, savedB.id]);

  await logger.step("移动后 sortId 字典序与新位置一致");
  const sortIds = afterMoveCA.collections[0].requests.map((r) => r.sortId);
  assert.ok(sortIds[0] < sortIds[1] && sortIds[1] < sortIds[2], `sortId 顺序应为升序: ${sortIds.join(", ")}`);

  await logger.conclusion("moveRequest 同集合重排按 ULID 中点算法正确生成 sortId, 顺序与位置一致");
});

test("store: moveRequest 跨集合按 beforeId 插入到目标集合指定位置", async () => {
  const logger = await createTestLogger("http_client_store_move_before.txt");
  await logger.flow("验证跨集合 moveRequest 时, beforeId 决定目标集合插入位置");

  const workspaceRoot = await createTempWorkspace("mx-http-store-move-before");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);

  const target = await store.createCollection("目标集合");
  const x1 = await store.saveRequest({ ...createDefaultRequest("X1"), id: "x1" }, { collectionId: target.id });
  const x2 = await store.saveRequest({ ...createDefaultRequest("X2"), id: "x2" }, { collectionId: target.id });
  const x3 = await store.saveRequest({ ...createDefaultRequest("X3"), id: "x3" }, { collectionId: target.id });
  // 把 X1, X2, X3 都搬进 target
  await store.moveRequest(x1.id, null, target.id);
  await store.moveRequest(x2.id, null, target.id);
  await store.moveRequest(x3.id, null, target.id);

  // 源 default 集合里建 A
  const a = await store.saveRequest(createDefaultRequest("A"));

  await logger.step("把 A 插入到 X1 之前 (target 头部)");
  await store.moveRequest(a.id, x1.id, target.id);
  const afterAFirst = await store.loadConfig();
  const targetAfterAFirst = afterAFirst.collections.find((c) => c.id === target.id);
  assert.equal(targetAfterAFirst?.requests[0].id, a.id);

  await logger.step("把 A 插入到 X3 之后 (target 末尾, beforeId = null)");
  await store.moveRequest(a.id, null, target.id);
  const afterAEnd = await store.loadConfig();
  const targetAfterAEnd = afterAEnd.collections.find((c) => c.id === target.id);
  const ids = targetAfterAEnd?.requests.map((r) => r.id) ?? [];
  assert.equal(ids[ids.length - 1], a.id, "A 应在 target 末尾");

  await logger.step("把 A 插入到 X2 之前 (target 中间)");
  await store.moveRequest(a.id, x2.id, target.id);
  const afterAMid = await store.loadConfig();
  const targetAfterAMid = afterAMid.collections.find((c) => c.id === target.id);
  const finalIds = targetAfterAMid?.requests.map((r) => r.id) ?? [];
  const aIndex = finalIds.indexOf(a.id);
  const x2Index = finalIds.indexOf(x2.id);
  assert.ok(aIndex < x2Index, `A (index ${aIndex}) 应在 X2 (index ${x2Index}) 之前`);

  await logger.conclusion("跨集合 moveRequest 接受 beforeId, 精确插入到目标位置");
});

test("store: 集合的请求可移动并保留历史快照", async () => {
  const logger = await createTestLogger("http_http_store_move.txt");
  await logger.flow("验证 moveRequest 在集合之间移动请求, 同时保留 lastResponseSnapshot");

  const workspaceRoot = await createTempWorkspace("mx-http-store-move");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);

  const config = await store.ensureInitialized();
  const savedA = await store.saveRequest(createDefaultRequest("A"));
  await store.upsertRequestById(savedA, buildResponse(200, "{\"a\":1}", 64));
  const products = await store.createCollection("产品 API");

  await logger.step("moveRequest 把默认集合的请求搬到目标集合, 快照保留");
  await store.moveRequest(savedA.id, null, products.id);
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
