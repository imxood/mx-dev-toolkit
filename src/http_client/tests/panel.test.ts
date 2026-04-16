import assert from "node:assert/strict";
import Module = require("node:module");
import { test } from "node:test";
import {
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
  await logger.flow("验证 selectRequest 属于 local-first 热路径, Host 只更新内部状态并持久化");

  const HttpClientPanelController = loadPanelController();
  const config = createDefaultConfigFile();
  const requestA = createDefaultRequest("请求 A", config.collections[0].id);
  const requestB = createDefaultRequest("请求 B", config.collections[0].id);
  config.requests.push(requestA, requestB);

  const messages: ExtensionToWebviewMessage[] = [];
  const activeRequestIds: Array<string | null> = [];

  const controller = new HttpClientPanelController(
    { subscriptions: [] } as never,
    { appendLine: () => undefined } as never,
    {
      ensureInitialized: async () => config,
      loadSnapshot: async () => ({
        config,
        history: [],
        activeRequestId: requestA.id,
        activeEnvironmentId: null,
      }),
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
  assert.deepEqual(activeRequestIds, [requestB.id]);
  assert.equal((controller as unknown as { currentDraft: { id: string } | null }).currentDraft?.id, requestB.id);

  await logger.conclusion("selectRequest 已从全量 postState 改为 local-first, Host 不再回推整包状态");
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
      One: 1,
    },
    window: {
      showInputBox: (options?: { value?: string }) => mockShowInputBox(options),
      showWarningMessage: (message: string, _options?: unknown, ...items: string[]) => mockShowWarningMessage(message, items),
      showInformationMessage: (_message: string) => Promise.resolve(undefined),
      showErrorMessage: (_message: string) => Promise.resolve(undefined),
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
let mockShowWarningMessage: (message: string, items: string[]) => Promise<string | undefined> = async () => undefined;

function setMockShowInputBox(handler: (options?: { value?: string }) => Promise<string | undefined>): void {
  mockShowInputBox = handler;
}

function setMockShowWarningMessage(handler: (message: string, items: string[]) => Promise<string | undefined>): void {
  mockShowWarningMessage = handler;
}
