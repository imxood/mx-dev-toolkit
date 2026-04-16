import assert from "node:assert/strict";
import Module = require("node:module");
import { test } from "node:test";
import {
  createDefaultCollection,
  createDefaultConfigFile,
  createDefaultRequest,
  ExtensionToWebviewMessage,
  HTTP_CLIENT_WEBVIEW_BUILD_ID,
  HttpHistoryRecord,
  HttpResponseResult,
} from "../types";
import { createTestLogger } from "./helpers";

test("panel: 响应结果应先回推到界面, 历史记录异步持久化", async () => {
  const logger = await createTestLogger("http_client_panel.txt");
  await logger.flow("验证请求成功后, 控制器先把响应回推给 webview, 再异步写入历史记录");

  const HttpClientPanelController = loadPanelController();
  const config = createDefaultConfigFile();
  const request = createDefaultRequest("查询会员信息", config.collections[0].id);
  request.method = "POST";
  request.url = "http://iot.iotim.com/ehong/tool/GetMemberInfo";
  request.bodyMode = "json";
  request.bodyText = "{\n  \"memberId\": \"demo\"\n}";

  const response: HttpResponseResult = {
    ok: true,
    status: 200,
    statusText: "OK",
    bodyRawText: "{\"ok\":true}",
    bodyText: "{\"ok\":true}",
    bodyPrettyText: "{\n  \"ok\": true\n}",
    isJson: true,
    headers: [
      {
        key: "content-type",
        value: "application/json",
      },
    ],
    meta: {
      startedAt: new Date().toISOString(),
      durationMs: 120,
      sizeBytes: 12,
      finalUrl: request.url,
      redirected: false,
      contentType: "application/json",
      unresolvedVariables: [],
      environmentId: null,
    },
  };

  let historyStarted = false;
  let releaseHistoryPersist: (() => void) | null = null;
  const historyGate = new Promise<void>((resolve) => {
    releaseHistoryPersist = resolve;
  });
  const historyRecords: HttpHistoryRecord[] = [];
  const messages: ExtensionToWebviewMessage[] = [];
  const outputLogs: string[] = [];

  const store = {
    ensureInitialized: async () => config,
    loadSnapshot: async () => ({
      config,
      history: historyRecords,
      activeRequestId: request.id,
      selectedHistoryId: null,
      activeEnvironmentId: null,
    }),
    getActiveRequestId: () => request.id,
    setActiveRequestId: async () => undefined,
    saveDraft: async () => undefined,
    saveScratchDraft: async () => undefined,
    getLastLoadProfile: <T>(defaultValue: T) => defaultValue,
    recordHistory: async (record: HttpHistoryRecord) => {
      historyStarted = true;
      historyRecords.unshift(record);
      await historyGate;
    },
  };

  const controller = new HttpClientPanelController(
    { subscriptions: [] } as never,
    {
      appendLine: (message: string) => {
        outputLogs.push(message);
      },
    } as never,
    store as never,
    createToastServiceStub() as never
  );

  (controller as unknown as { panel: unknown }).panel = {
    webview: {
      postMessage: async (message: ExtensionToWebviewMessage) => {
        messages.push(message);
        return true;
      },
    },
  };
  (controller as unknown as { requestRunner: unknown }).requestRunner = {
    run: async () => response,
  };

  await logger.step("触发发送请求, 但让历史记录持久化阶段人为阻塞");
  const sendPromise = (
    controller as unknown as {
      sendRequest: (payload: { request: typeof request; environmentId: string | null; timeoutMs: number }) => Promise<void>;
    }
  ).sendRequest({
    request,
    environmentId: null,
    timeoutMs: 30000,
  });

  const sendOutcome = await Promise.race([
    sendPromise.then(() => "resolved"),
    delay(200).then(() => "timeout"),
  ]);

  await logger.verify(`sendRequest 结果: ${sendOutcome}`);
  assert.equal(sendOutcome, "resolved");
  assert.equal(historyStarted, true);
  assert.ok(messages.some((message) => message.type === "httpClient/response"));
  assert.ok(outputLogs.some((line) => line.includes("[HttpClient] response delivered=true")));
  assert.ok(outputLogs.some((line) => line.includes("[HttpClient] history save scheduled")));
  assert.ok(!outputLogs.some((line) => line.includes("[HttpClient] history saved")));

  await logger.step("释放历史写入阻塞, 确认后台持久化最终完成");
  const releaseHistory = releaseHistoryPersist ?? (() => {
    throw new Error("history release callback missing");
  });
  releaseHistory();
  await waitUntil(() => outputLogs.some((line) => line.includes("[HttpClient] history saved")), 500);

  await logger.verify(`发送阶段消息数: ${messages.length}`);
  assert.ok(outputLogs.some((line) => line.includes("[HttpClient] history state refreshed")));
  assert.equal(historyRecords.length, 1);

  await logger.conclusion("控制器已满足“先展示响应, 后异步落历史”的执行顺序");
});

test("panel: webview 未确认响应时应自动重载并按当前状态恢复界面", async () => {
  const logger = await createTestLogger("http_client_panel.txt");
  await logger.flow("验证 webview 未返回 responseAck 时, panel 会自动按当前状态重载");

  const HttpClientPanelController = loadPanelController();
  const config = createDefaultConfigFile();
  const request = createDefaultRequest("查询会员信息", config.collections[0].id);
  request.method = "POST";
  request.url = "http://iot.iotim.com/ehong/tool/GetMemberInfo";

  const response: HttpResponseResult = {
    ok: true,
    status: 200,
    statusText: "OK",
    bodyRawText: "{\"ok\":true}",
    bodyText: "{\"ok\":true}",
    bodyPrettyText: "{\n  \"ok\": true\n}",
    isJson: true,
    headers: [],
    meta: {
      startedAt: new Date().toISOString(),
      durationMs: 46,
      sizeBytes: 12,
      finalUrl: request.url,
      redirected: false,
      contentType: "application/json",
      unresolvedVariables: [],
      environmentId: null,
    },
  };

  const outputLogs: string[] = [];
  const htmlAssignments: string[] = [];

  const store = {
    ensureInitialized: async () => config,
    loadSnapshot: async () => ({
      config,
      history: [],
      activeRequestId: request.id,
      selectedHistoryId: null,
      activeEnvironmentId: null,
    }),
    getActiveRequestId: () => request.id,
    setActiveRequestId: async () => undefined,
    saveDraft: async () => undefined,
    saveScratchDraft: async () => undefined,
    getLastLoadProfile: <T>(defaultValue: T) => defaultValue,
    recordHistory: async () => undefined,
  };

  const controller = new HttpClientPanelController(
    { subscriptions: [] } as never,
    {
      appendLine: (message: string) => {
        outputLogs.push(message);
      },
    } as never,
    store as never,
    createToastServiceStub() as never
  );

  const webview = {
    cspSource: "vscode-webview://test",
    postMessage: async (message: ExtensionToWebviewMessage) => {
      return message.type !== "httpClient/state" || message.payload.response !== null;
    },
  };
  const panel = {
    webview,
  } as {
    webview: typeof webview;
    html?: string;
  };
  Object.defineProperty(panel.webview, "html", {
    configurable: true,
    enumerable: true,
    get() {
      return htmlAssignments[htmlAssignments.length - 1] ?? "";
    },
    set(value: string) {
      htmlAssignments.push(value);
    },
  });

  (controller as unknown as { panel: unknown }).panel = panel;
  (controller as unknown as { currentWebviewBuildId: string | null }).currentWebviewBuildId = HTTP_CLIENT_WEBVIEW_BUILD_ID;
  (controller as unknown as { requestRunner: unknown }).requestRunner = {
    run: async () => response,
  };

  await logger.step("发送成功后不返回 responseAck, 等待控制器进入超时自愈分支");
  await (
    controller as unknown as {
      sendRequest: (payload: { request: typeof request; environmentId: string | null; timeoutMs: number }) => Promise<void>;
    }
  ).sendRequest({
    request,
    environmentId: null,
    timeoutMs: 30000,
  });

  await waitUntil(() => htmlAssignments.length > 0, 1200);

  await logger.verify(`panel 重载次数: ${htmlAssignments.length}`);
  assert.ok(outputLogs.some((line) => line.includes("response ack timeout, reload panel from current state")));
  assert.ok(htmlAssignments[0].includes("HTTP Client"));

  await logger.conclusion("responseAck 缺失时, panel 可自动重载并用当前状态恢复界面");
});

test("panel: cURL 导入失败后应保留原文并允许重新编辑", async () => {
  const logger = await createTestLogger("http_client_panel.txt");
  await logger.flow("验证 cURL 导入失败时会保留原始输入, 用户可在原文基础上重新编辑");

  const HttpClientPanelController = loadPanelController();
  const config = createDefaultConfigFile();
  const capturedInputValues: Array<string | undefined> = [];

  setMockShowInputBox(async (options?: { value?: string }) => {
    capturedInputValues.push(options?.value);
    if (capturedInputValues.length === 1) {
      return "curl";
    }
    return "curl https://example.com/api/member";
  });
  setMockShowWarningMessage(async (message: string) => {
    if (message.startsWith("cURL 导入失败:")) {
      return "重新编辑";
    }
    return "覆盖当前请求";
  });

  const savedScratchDrafts: Array<{ id: string; url: string }> = [];
  const controller = new HttpClientPanelController(
    { subscriptions: [] } as never,
    { appendLine: () => undefined } as never,
    {
      ensureInitialized: async () => config,
      loadSnapshot: async () => ({
        config,
        history: [],
        activeRequestId: null,
        selectedHistoryId: null,
        activeEnvironmentId: null,
      }),
      getActiveRequestId: () => null,
      setActiveRequestId: async () => undefined,
      saveDraft: async () => undefined,
      saveScratchDraft: async (draft: { id: string; url: string }) => {
        savedScratchDrafts.push({ id: draft.id, url: draft.url });
      },
      getLastLoadProfile: <T>(defaultValue: T) => defaultValue,
      recordHistory: async () => undefined,
    } as never,
    createToastServiceStub() as never
  );

  (controller as unknown as { currentDraft: ReturnType<typeof createDefaultRequest> | null }).currentDraft = createDefaultRequest();
  await logger.step("第一次解析失败后, 第二次输入框应带回原始 cURL 文本");
  await (controller as unknown as { importCurlByPrompt: () => Promise<void> }).importCurlByPrompt();

  await logger.verify(`输入框回填值: ${capturedInputValues.join(" | ")}`);
  assert.deepEqual(capturedInputValues, [undefined, "curl"]);
  assert.equal(savedScratchDrafts.at(-1)?.url, "https://example.com/api/member");
  assert.equal((controller as unknown as { currentDraft: { url: string } | null }).currentDraft?.url, "https://example.com/api/member");

  setMockShowInputBox(async () => undefined);
  setMockShowWarningMessage(async () => undefined);
  await logger.conclusion("cURL 导入失败后可保留原文并继续修正导入");
});

test("panel: workbench init 应复用 bootstrap snapshot, 不重复回推整包状态", async () => {
  const logger = await createTestLogger("http_client_panel.txt");
  await logger.flow("验证 React workbench 初始化时直接复用 bootstrap snapshot, Host 不再重复 postState");

  const HttpClientPanelController = loadPanelController();
  const config = createDefaultConfigFile();
  const request = createDefaultRequest("初始化请求", config.collections[0].id);
  config.requests.push(request);
  const messages: ExtensionToWebviewMessage[] = [];

  const controller = new HttpClientPanelController(
    { subscriptions: [] } as never,
    { appendLine: () => undefined } as never,
    {
      ensureInitialized: async () => config,
      loadSnapshot: async () => ({
        config,
        history: [],
        activeRequestId: request.id,
        activeEnvironmentId: null,
      }),
      getActiveRequestId: () => request.id,
      getDraft: () => ({
        draft: null,
        dirty: false,
      }),
      getScratchDraft: () => null,
      setActiveRequestId: async () => undefined,
      saveScratchDraft: async () => undefined,
      getLastLoadProfile: <T>(defaultValue: T) => defaultValue,
      recordHistory: async () => undefined,
    } as never,
    createToastServiceStub() as never
  );

  (controller as unknown as { panel: unknown }).panel = {
    webview: {
      postMessage: async (message: ExtensionToWebviewMessage) => {
        messages.push(message);
        return true;
      },
    },
  };

  await logger.step("触发 httpClient/init, 仅同步 buildId 和 pendingHostCommand");
  await (
    controller as unknown as {
      handleMessage: (message: { type: "httpClient/init"; payload: { buildId: string } }) => Promise<void>;
    }
  ).handleMessage({
    type: "httpClient/init",
    payload: { buildId: HTTP_CLIENT_WEBVIEW_BUILD_ID },
  });

  await logger.verify(`初始化期间回推消息数: ${messages.length}`);
  assert.equal(messages.length, 0);
  assert.equal((controller as unknown as { currentWebviewBuildId: string | null }).currentWebviewBuildId, HTTP_CLIENT_WEBVIEW_BUILD_ID);

  await logger.conclusion("workbench init 已改为直接复用 bootstrap initialState, 不再重复发送 httpClient/state");
});

test("panel: 选择请求消息只更新 Host 会话态, 不再全量回推 state", async () => {
  const logger = await createTestLogger("http_client_panel.txt");
  await logger.flow("验证 selectRequest 属于 local-first 热路径, Host 只更新内部状态并在后台延迟持久化 stable request");

  const HttpClientPanelController = loadPanelController();
  const config = createDefaultConfigFile();
  const requestA = createDefaultRequest("请求 A", config.collections[0].id);
  const requestB = createDefaultRequest("请求 B", config.collections[0].id);
  config.requests.push(requestA, requestB);

  const messages: ExtensionToWebviewMessage[] = [];
  const activeRequestIds: Array<string | null> = [];
  let loadSnapshotCalls = 0;

  const controller = new HttpClientPanelController(
    { subscriptions: [] } as never,
    { appendLine: () => undefined } as never,
    {
      ensureInitialized: async () => config,
      loadSnapshot: async () => {
        loadSnapshotCalls += 1;
        return {
          config,
          history: [],
          activeRequestId: requestA.id,
          activeEnvironmentId: null,
        };
      },
      getActiveRequestId: () => requestA.id,
      getDraft: () => ({
        draft: null,
        dirty: false,
      }),
      getScratchDraft: () => null,
      setActiveRequestId: async (requestId: string | null) => {
        activeRequestIds.push(requestId);
      },
      saveDraft: async () => undefined,
      saveScratchDraft: async () => undefined,
      getLastLoadProfile: <T>(defaultValue: T) => defaultValue,
      recordHistory: async () => undefined,
    } as never,
    createToastServiceStub() as never
  );

  (controller as unknown as { panel: unknown }).panel = {
    webview: {
      postMessage: async (message: ExtensionToWebviewMessage) => {
        messages.push(message);
        return true;
      },
    },
  };

  await logger.step("触发 selectRequest, Host 应仅更新 activeRequestId 与 currentDraft");
  await (
    controller as unknown as {
      handleMessage: (message: { type: "httpClient/selectRequest"; payload: { requestId: string } }) => Promise<void>;
    }
  ).handleMessage({
    type: "httpClient/selectRequest",
    payload: { requestId: requestB.id },
  });

  await logger.verify(`selectRequest 后消息数: ${messages.length}`);
  assert.equal(messages.length, 0);
  assert.equal((controller as unknown as { currentDraft: { id: string } | null }).currentDraft?.id, requestB.id);
  assert.equal(loadSnapshotCalls, 0);
  assert.deepEqual(activeRequestIds, []);

  await logger.step("等待后台去抖持久化, 应只写最后一次 stable request");
  await waitUntil(() => activeRequestIds.length === 1, 1200);
  assert.deepEqual(activeRequestIds, [requestB.id]);

  await logger.conclusion("selectRequest 已保持 local-first 热路径, activeRequestId 仅在后台 quiet period 后写入一次");
});

test("panel: 选择历史消息只更新 Host 会话态, 不再构建整包 viewState", async () => {
  const logger = await createTestLogger("http_client_panel.txt");
  await logger.flow("验证 selectHistory 热路径下, Host 不再执行 buildViewState/postState, 且浏览历史不会改写 activeRequestId");

  const HttpClientPanelController = loadPanelController();
  const config = createDefaultConfigFile();
  const request = createDefaultRequest("历史请求", config.collections[0].id);
  const history = {
    id: "history-1",
    request,
    environmentId: null,
    executedAt: new Date().toISOString(),
    responseSummary: {
      status: 200,
      statusText: "OK",
      durationMs: 18,
      ok: true,
      sizeBytes: 64,
    },
  };

  const messages: ExtensionToWebviewMessage[] = [];
  const activeRequestIds: Array<string | null> = [];
  let loadSnapshotCalls = 0;

  const controller = new HttpClientPanelController(
    { subscriptions: [] } as never,
    { appendLine: () => undefined } as never,
    {
      ensureInitialized: async () => config,
      loadSnapshot: async () => {
        loadSnapshotCalls += 1;
        return {
          config,
          history: [history],
          activeRequestId: null,
          activeEnvironmentId: null,
        };
      },
      getActiveRequestId: () => null,
      getHistoryItem: (historyId: string) => (historyId === history.id ? history : null),
      setActiveRequestId: async (requestId: string | null) => {
        activeRequestIds.push(requestId);
      },
      getLastLoadProfile: <T>(defaultValue: T) => defaultValue,
      recordHistory: async () => undefined,
    } as never,
    createToastServiceStub() as never
  );

  (controller as unknown as { panel: unknown }).panel = {
    webview: {
      postMessage: async (message: ExtensionToWebviewMessage) => {
        messages.push(message);
        return true;
      },
    },
  };

  await logger.step("触发 selectHistory, Host 应只更新 currentDraft 和 activeRequestId");
  await (
    controller as unknown as {
      handleMessage: (message: { type: "httpClient/selectHistory"; payload: { historyId: string } }) => Promise<void>;
    }
  ).handleMessage({
    type: "httpClient/selectHistory",
    payload: { historyId: history.id },
  });

  await logger.verify(`selectHistory 后快照构建次数: ${loadSnapshotCalls}`);
  assert.equal(messages.length, 0);
  assert.equal((controller as unknown as { currentDraft: { id: string } | null }).currentDraft?.id, request.id);
  assert.equal((controller as unknown as { selectedHistoryId: string | null }).selectedHistoryId, history.id);
  assert.equal(loadSnapshotCalls, 0);
  assert.deepEqual(activeRequestIds, []);

  await logger.step("等待一个完整 quiet period, 浏览历史本身不应触发 activeRequestId 持久化");
  await delay(800);
  assert.deepEqual(activeRequestIds, []);

  await logger.conclusion("selectHistory 已保持 local-first 热路径, 历史浏览不再改写持久化锚点");
});

test("panel: 历史记录可直接保存到目标集合", async () => {
  const logger = await createTestLogger("http_client_panel.txt");
  await logger.flow("验证工作台右键保存历史记录时, Host 会把该历史请求复制到指定集合并切到新请求");

  const HttpClientPanelController = loadPanelController();
  const config = createDefaultConfigFile();
  const targetCollection = createDefaultCollection("归档集合");
  config.collections.push(targetCollection);

  const historyRequest = createDefaultRequest("历史请求", config.collections[0].id);
  historyRequest.method = "POST";
  historyRequest.url = "https://api.example.com/member/history";
  const history = {
    id: "history-1",
    request: historyRequest,
    environmentId: null,
    executedAt: new Date().toISOString(),
    responseSummary: {
      status: 200,
      statusText: "OK",
      durationMs: 18,
      ok: true,
      sizeBytes: 64,
    },
  };

  const messages: ExtensionToWebviewMessage[] = [];
  const savedRequests: Array<{ id: string; collectionId: string | null; url: string }> = [];
  let activeRequestId: string | null = null;

  const controller = new HttpClientPanelController(
    { subscriptions: [] } as never,
    { appendLine: () => undefined } as never,
    {
      ensureInitialized: async () => config,
      loadSnapshot: async () => ({
        config,
        history: [history],
        activeRequestId,
        activeEnvironmentId: null,
      }),
      getActiveRequestId: () => activeRequestId,
      getHistoryItem: (historyId: string) => (historyId === history.id ? history : null),
      saveRequest: async (request: { id: string; collectionId: string | null; url: string; name: string }) => {
        savedRequests.push({
          id: request.id,
          collectionId: request.collectionId,
          url: request.url,
        });
        activeRequestId = request.id;
        config.requests.push(request as never);
        return request as never;
      },
      setActiveRequestId: async (requestId: string | null) => {
        activeRequestId = requestId;
      },
      getLastLoadProfile: <T>(defaultValue: T) => defaultValue,
      recordHistory: async () => undefined,
    } as never,
    createToastServiceStub() as never
  );

  (controller as unknown as { panel: unknown }).panel = {
    webview: {
      postMessage: async (message: ExtensionToWebviewMessage) => {
        messages.push(message);
        return true;
      },
    },
  };

  await logger.step("触发 saveHistoryToCollection, Host 应复制一份新请求并刷新当前工作台状态");
  await (
    controller as unknown as {
      handleMessage: (message: { type: "httpClient/saveHistoryToCollection"; payload: { historyId: string; collectionId: string } }) => Promise<void>;
    }
  ).handleMessage({
    type: "httpClient/saveHistoryToCollection",
    payload: { historyId: history.id, collectionId: targetCollection.id },
  });

  await logger.verify(`保存后请求数: ${savedRequests.length}, state 消息数: ${messages.filter((message) => message.type === "httpClient/state").length}`);
  assert.equal(savedRequests.length, 1);
  assert.equal(savedRequests[0].collectionId, targetCollection.id);
  assert.equal(savedRequests[0].url, historyRequest.url);
  assert.notEqual(savedRequests[0].id, historyRequest.id);
  assert.equal((controller as unknown as { currentDraft: { id: string } | null }).currentDraft?.id, savedRequests[0].id);
  assert.equal((controller as unknown as { selectedHistoryId: string | null }).selectedHistoryId, null);
  assert.ok(messages.some((message) => message.type === "httpClient/state"));

  await logger.conclusion("历史记录已可直接复制到指定集合, 并切换为新的稳定请求");
});

test("panel: 保存历史记录到集合时可先新建集合再落请求", async () => {
  const logger = await createTestLogger("http_client_panel.txt");
  await logger.flow("验证工作台右键保存历史记录时, 可通过 QuickPick 选择新建集合并在输入名称后完成保存");

  const HttpClientPanelController = loadPanelController();
  const config = createDefaultConfigFile();
  const historyRequest = createDefaultRequest("历史请求", config.collections[0].id);
  historyRequest.method = "POST";
  historyRequest.url = "https://api.example.com/member/history";
  const history = {
    id: "history-1",
    request: historyRequest,
    environmentId: null,
    executedAt: new Date().toISOString(),
    responseSummary: {
      status: 200,
      statusText: "OK",
      durationMs: 18,
      ok: true,
      sizeBytes: 64,
    },
  };

  const messages: ExtensionToWebviewMessage[] = [];
  const createdCollections: Array<{ id: string; name: string }> = [];
  const savedRequests: Array<{ id: string; collectionId: string | null }> = [];
  let activeRequestId: string | null = null;

  setMockShowQuickPick(async (items: Array<{ label: string; collectionId?: string }>) => {
    assert.ok(items.some((item) => item.collectionId === "__create__"));
    return items.find((item) => item.collectionId === "__create__") ?? null;
  });
  setMockShowInputBox(async (options?: { value?: string }) => {
    if (options?.value !== undefined) {
      return options.value;
    }
    return "新建归档集合";
  });

  const controller = new HttpClientPanelController(
    { subscriptions: [] } as never,
    { appendLine: () => undefined } as never,
    {
      ensureInitialized: async () => config,
      loadSnapshot: async () => ({
        config,
        history: [history],
        activeRequestId,
        activeEnvironmentId: null,
      }),
      getActiveRequestId: () => activeRequestId,
      getHistoryItem: (historyId: string) => (historyId === history.id ? history : null),
      createCollection: async (name: string) => {
        const collection = createDefaultCollection(name);
        createdCollections.push({ id: collection.id, name: collection.name });
        config.collections.push(collection);
        return collection;
      },
      saveRequest: async (request: { id: string; collectionId: string | null }) => {
        savedRequests.push({ id: request.id, collectionId: request.collectionId });
        activeRequestId = request.id;
        config.requests.push(request as never);
        return request as never;
      },
      setActiveRequestId: async (requestId: string | null) => {
        activeRequestId = requestId;
      },
      getLastLoadProfile: <T>(defaultValue: T) => defaultValue,
      recordHistory: async () => undefined,
    } as never,
    createToastServiceStub() as never
  );

  (controller as unknown as { panel: unknown }).panel = {
    webview: {
      postMessage: async (message: ExtensionToWebviewMessage) => {
        messages.push(message);
        return true;
      },
    },
  };

  await logger.step("触发 promptSaveHistoryToCollection, Host 应先创建集合, 再把历史请求保存进去");
  await (
    controller as unknown as {
      handleMessage: (message: { type: "httpClient/promptSaveHistoryToCollection"; payload: { historyId: string } }) => Promise<void>;
    }
  ).handleMessage({
    type: "httpClient/promptSaveHistoryToCollection",
    payload: { historyId: history.id },
  });

  await logger.verify(`新建集合数: ${createdCollections.length}, 保存请求数: ${savedRequests.length}`);
  assert.equal(createdCollections.length, 1);
  assert.equal(createdCollections[0].name, "新建归档集合");
  assert.equal(savedRequests.length, 1);
  assert.equal(savedRequests[0].collectionId, createdCollections[0].id);
  assert.ok(messages.some((message) => message.type === "httpClient/state"));

  setMockShowQuickPick(async () => null);
  setMockShowInputBox(async () => undefined);
  await logger.conclusion("QuickPick + InputBox 路径可完成新建集合并保存历史请求");
});

test("panel: 浏览历史后只有继续编辑草稿才会后台刷新 activeRequestId", async () => {
  const logger = await createTestLogger("http_client_panel.txt");
  await logger.flow("验证历史浏览与稳定请求持久化解耦, 只有基于历史继续编辑时才会在后台刷新 activeRequestId");

  const HttpClientPanelController = loadPanelController();
  const config = createDefaultConfigFile();
  const requestA = createDefaultRequest("请求 A", config.collections[0].id);
  const requestB = createDefaultRequest("请求 B", config.collections[0].id);
  config.requests.push(requestA, requestB);
  const history = {
    id: "history-1",
    request: requestB,
    environmentId: null,
    executedAt: new Date().toISOString(),
    responseSummary: {
      status: 200,
      statusText: "OK",
      durationMs: 18,
      ok: true,
      sizeBytes: 64,
    },
  };

  const activeRequestIds: Array<string | null> = [];

  const controller = new HttpClientPanelController(
    { subscriptions: [] } as never,
    { appendLine: () => undefined } as never,
    {
      ensureInitialized: async () => config,
      loadSnapshot: async () => ({
        config,
        history: [history],
        activeRequestId: requestA.id,
        activeEnvironmentId: null,
      }),
      getActiveRequestId: () => requestA.id,
      getHistoryItem: (historyId: string) => (historyId === history.id ? history : null),
      getDraft: () => ({
        draft: null,
        dirty: false,
      }),
      getScratchDraft: () => null,
      setActiveRequestId: async (requestId: string | null) => {
        activeRequestIds.push(requestId);
      },
      saveDraft: async () => undefined,
      saveScratchDraft: async () => undefined,
      getLastLoadProfile: <T>(defaultValue: T) => defaultValue,
      recordHistory: async () => undefined,
    } as never,
    createToastServiceStub() as never
  );

  await logger.step("先浏览历史, 不应立即改写 activeRequestId");
  await (
    controller as unknown as {
      handleMessage: (message: { type: "httpClient/selectHistory"; payload: { historyId: string } }) => Promise<void>;
    }
  ).handleMessage({
    type: "httpClient/selectHistory",
    payload: { historyId: history.id },
  });
  await delay(800);
  assert.deepEqual(activeRequestIds, []);

  await logger.step("继续编辑历史派生草稿后, activeRequestId 才应在后台刷新");
  await (
    controller as unknown as {
      handleDraftChanged: (request: typeof requestB, dirty: boolean) => Promise<void>;
    }
  ).handleDraftChanged({
    ...requestB,
    url: "https://api.example.com/history-replay",
  }, true);

  await waitUntil(() => activeRequestIds.length === 1, 1200);
  assert.deepEqual(activeRequestIds, [requestB.id]);

  await logger.conclusion("历史浏览已不再触发持久化, 只有进入稳定编辑态才会后台刷新请求锚点");
});

test("panel: 编辑响应内容应在 VS Code 中打开一个新建文档", async () => {
  const logger = await createTestLogger("http_client_panel.txt");
  await logger.flow("验证工作台点击编辑响应后, Host 会在当前工作台所在标签组中打开一个新的临时文档");

  const HttpClientPanelController = loadPanelController();
  const config = createDefaultConfigFile();
  const openedDocuments: Array<{ content: string; language: string }> = [];
  const shownDocuments: Array<{ document: unknown; options: unknown }> = [];

  setMockOpenTextDocument(async (options: { content: string; language: string }) => {
    openedDocuments.push(options);
    return {
      uri: "untitled:test-response",
      ...options,
    };
  });
  setMockShowTextDocument(async (document: unknown, options?: unknown) => {
    shownDocuments.push({ document, options });
  });

  const controller = new HttpClientPanelController(
    { subscriptions: [] } as never,
    { appendLine: () => undefined } as never,
    {
      ensureInitialized: async () => config,
      loadSnapshot: async () => ({
        config,
        history: [],
        activeRequestId: null,
        selectedHistoryId: null,
        activeEnvironmentId: null,
      }),
      getActiveRequestId: () => null,
      getLastLoadProfile: <T>(defaultValue: T) => defaultValue,
      recordHistory: async () => undefined,
    } as never,
    createToastServiceStub() as never
  );
  (controller as unknown as { panel: unknown }).panel = {
    viewColumn: 1,
  };

  await logger.step("发送 openResponseEditor 消息, Host 应沿用当前 panel 的标签组打开新文档");
  await (
    controller as unknown as {
      handleMessage: (message: { type: "httpClient/openResponseEditor"; payload: { content: string; language: string } }) => Promise<void>;
    }
  ).handleMessage({
    type: "httpClient/openResponseEditor",
    payload: {
      content: "{\\\"ok\\\":true}",
      language: "plaintext",
    },
  });

  await logger.verify(`openTextDocument 调用次数: ${openedDocuments.length}`);
  assert.deepEqual(openedDocuments, [{ content: "{\\\"ok\\\":true}", language: "plaintext" }]);
  assert.equal(shownDocuments.length, 1);
  assert.deepEqual(shownDocuments[0].options, {
    preview: false,
    viewColumn: 1,
  });

  setMockOpenTextDocument(async (options: { content: string; language: string }) => ({
    uri: "untitled:default",
    ...options,
  }));
  setMockShowTextDocument(async () => undefined);

  await logger.conclusion("编辑响应会在当前工作台所在标签组中打开 VS Code 临时文档, 不再分离到旁侧标签组");
});

function loadPanelController(): typeof import("../panel").HttpClientPanelController {
  const moduleApi = Module as unknown as {
    _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
  };
  const originalLoad = moduleApi._load;
  moduleApi._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
    if (request === "vscode") {
      return createVscodeStub();
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require("../panel").HttpClientPanelController as typeof import("../panel").HttpClientPanelController;
  } finally {
    moduleApi._load = originalLoad;
  }
}

function createVscodeStub(): unknown {
  class EventEmitter<T> {
    private readonly listeners = new Set<(event: T) => void>();

    public readonly event = (listener: (event: T) => void) => {
      this.listeners.add(listener);
      return {
        dispose: () => {
          this.listeners.delete(listener);
        },
      };
    };

    public fire(event: T): void {
      this.listeners.forEach((listener) => listener(event));
    }

    public dispose(): void {
      this.listeners.clear();
    }
  }

  return {
    EventEmitter,
    ViewColumn: {
      Active: -1,
      One: 1,
      Beside: 2,
    },
    workspace: {
      openTextDocument: (options: { content: string; language: string }) => mockOpenTextDocument(options),
    },
    window: {
      showInputBox: (options?: { value?: string }) => mockShowInputBox(options),
      showQuickPick: (items: Array<{ label: string; collectionId?: string }>) => mockShowQuickPick(items),
      showWarningMessage: (message: string, _options?: unknown, ...items: string[]) => mockShowWarningMessage(message, items),
      showInformationMessage: (_message: string) => Promise.resolve(undefined),
      showErrorMessage: (_message: string) => Promise.resolve(undefined),
      showTextDocument: (document: unknown, options?: unknown) => mockShowTextDocument(document, options),
    },
  };
}

function createToastServiceStub(): unknown {
  return {
    notify: async () => undefined,
    registerHost: () => ({
      dispose: () => undefined,
    }),
    dispose: () => undefined,
  };
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`waitUntil timeout: ${timeoutMs}ms`);
    }
    await delay(10);
  }
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

let mockShowInputBox: (options?: { value?: string }) => Promise<string | undefined> = async () => undefined;
let mockShowQuickPick: (items: Array<{ label: string; collectionId?: string }>) => Promise<{ label: string; collectionId?: string } | null> = async () => null;
let mockShowWarningMessage: (message: string, items: string[]) => Promise<string | undefined> = async () => undefined;
let mockOpenTextDocument: (options: { content: string; language: string }) => Promise<unknown> = async (options) => ({
  uri: "untitled:default",
  ...options,
});
let mockShowTextDocument: (document: unknown, options?: unknown) => Promise<void> = async () => undefined;

function setMockShowInputBox(handler: (options?: { value?: string }) => Promise<string | undefined>): void {
  mockShowInputBox = handler;
}

function setMockShowQuickPick(
  handler: (items: Array<{ label: string; collectionId?: string }>) => Promise<{ label: string; collectionId?: string } | null>
): void {
  mockShowQuickPick = handler;
}

function setMockShowWarningMessage(handler: (message: string, items: string[]) => Promise<string | undefined>): void {
  mockShowWarningMessage = handler;
}

function setMockOpenTextDocument(handler: (options: { content: string; language: string }) => Promise<unknown>): void {
  mockOpenTextDocument = handler;
}

function setMockShowTextDocument(handler: (document: unknown, options?: unknown) => Promise<void>): void {
  mockShowTextDocument = handler;
}
