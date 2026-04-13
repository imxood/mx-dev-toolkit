import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import * as path from "path";
import { HttpClientStore } from "../store";
import { createDefaultRequest } from "../types";
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

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
