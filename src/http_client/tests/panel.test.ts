import assert from "node:assert/strict";
import Module = require("node:module");
import { test } from "node:test";
import { promises as fs } from "fs";
import * as path from "path";
import { HttpClientStore } from "../store";
import {
  createDefaultCollection,
  createDefaultConfigFile,
  createDefaultEnvironment,
  createDefaultRequest,
  ExtensionToWebviewMessage,
  HTTP_CLIENT_DEFAULT_COLLECTION_ID,
  HTTP_CLIENT_WEBVIEW_BUILD_ID,
  HttpRequestEntity,
  HttpResponseResult,
} from "../types";
import { createTempWorkspace, createTestLogger, MemoryStateStore } from "./helpers";

interface HttpClientPanelControllerShape {
  show(): Promise<void>;
  triggerCommand(command: "send" | "save" | "loadTest" | "focusCurlImport"): Promise<void>;
  dispose(): void;
}

let ensureModuleLoaded = false;
type PanelControllerConstructor = new (
  context: unknown,
  channel: unknown,
  store: unknown,
  toastService: unknown
) => HttpClientPanelControllerShape;

function ensurePanelModuleLoaded(): PanelControllerConstructor {
  if (!ensureModuleLoaded) {
    installVscodeMock();
    ensureModuleLoaded = true;
  }
  const required = (Module.createRequire(__dirname + "/../") as NodeJS.Require)("./panel");
  return required.HttpClientPanelController as PanelControllerConstructor;
}

function createPanelController(
  context: unknown,
  channel: unknown,
  store: unknown,
  toastService: unknown
): HttpClientPanelControllerShape {
  return new (ensurePanelModuleLoaded())(context, channel, store, toastService);
}

test("panel: 发送请求后自动 upsert 集合快照, 并在 webview 上展示响应", async () => {
  const logger = await createTestLogger("http_client_panel_send.txt");
  await logger.flow("验证 sendRequest 完成后, store 自动 upsert lastResponseSnapshot, webview 收到 response");

  const workspaceRoot = await createTempWorkspace("mx-http-panel-send");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  await store.ensureInitialized();

  const request = createDefaultRequest("查询会员信息");
  request.method = "POST";
  request.url = "http://iot.iotim.com/ehong/tool/GetMemberInfo";
  request.bodyMode = "json";
  request.bodyText = "{}";

  const response: HttpResponseResult = {
    ok: true,
    status: 200,
    statusText: "OK",
    bodyRawText: "{\"ok\":true}",
    bodyText: "{\"ok\":true}",
    bodyPrettyText: "{\n  \"ok\": true\n}",
    isJson: true,
    headers: [{ key: "content-type", value: "application/json" }],
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

  const messages: ExtensionToWebviewMessage[] = [];
  const controller = createPanelController(
    createContextStub(),
    { appendLine: () => undefined } as never,
    store as never,
    createToastServiceStub() as never
  );

  attachPanel(controller, messages);
  stubRunner(controller, async () => response);

  await logger.step("sendRequest 应先响应再写快照");
  await (controller as unknown as { sendRequest: (payload: { request: HttpRequestEntity; environmentId: string | null; timeoutMs: number }) => Promise<void> }).sendRequest({
    request,
    environmentId: null,
    timeoutMs: 30000,
  });

  const lookup = store.findRequestByUrl(request.method, request.url);
  assert.ok(lookup, "默认集合应自动 upsert 一个新请求");
  assert.equal(lookup.collection.id, HTTP_CLIENT_DEFAULT_COLLECTION_ID);
  assert.equal(lookup.request.lastStatus, 200);
  assert.equal(lookup.request.lastResponseSnapshot?.status, 200);
  assert.ok(messages.some((m) => m.type === "httpClient/response"));

  await logger.conclusion("sendRequest 已具备 upsert 集合快照的能力");
});

test("panel: 选择已有请求时应自动加载 lastResponseSnapshot", async () => {
  const logger = await createTestLogger("http_client_panel_select.txt");
  await logger.flow("验证 selectRequest 命中已保存请求时, lastResponseSnapshot 自动进入 currentResponse");

  const workspaceRoot = await createTempWorkspace("mx-http-panel-select");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  await store.ensureInitialized();
  const request = createDefaultRequest("查询会员信息");
  request.method = "POST";
  request.url = "http://iot.iotim.com/ehong/tool/GetMemberInfo";
  const response = buildResponse(200, "{\"ok\":true}");
  await store.upsertRequestByUrl(request, response);

  const messages: ExtensionToWebviewMessage[] = [];
  const controller = createPanelController(
    createContextStub(),
    { appendLine: () => undefined } as never,
    store as never,
    createToastServiceStub() as never
  );
  attachPanel(controller, messages);
  stubRunner(controller, async () => response);

  await (controller as unknown as { handleMessage: (message: unknown) => Promise<void> }).handleMessage({
    type: "httpClient/selectRequest",
    payload: { requestId: request.id },
  });

  const currentResponse = (controller as unknown as { currentResponse: HttpResponseResult | null }).currentResponse;
  assert.ok(currentResponse, "应加载 lastResponseSnapshot");
  assert.equal(currentResponse?.status, 200);

  await logger.conclusion("selectRequest 已能恢复快照响应");
});

test("panel: moveRequest 应跨集合搬运请求并推送整包 state", async () => {
  const logger = await createTestLogger("http_client_panel_move.txt");
  await logger.flow("验证拖拽触发 moveRequest 时, 请求迁到目标集合, webview 收到更新");

  const workspaceRoot = await createTempWorkspace("mx-http-panel-move");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  await store.ensureInitialized();
  const request = createDefaultRequest("查询");
  request.method = "POST";
  request.url = "http://example.com/api";
  await store.upsertRequestByUrl(request, buildResponse(200, "{}"));
  const products = await store.createCollection("产品 API");

  const messages: ExtensionToWebviewMessage[] = [];
  const controller = createPanelController(
    createContextStub(),
    { appendLine: () => undefined } as never,
    store as never,
    createToastServiceStub() as never
  );
  attachPanel(controller, messages);

  await (controller as unknown as { handleMessage: (message: unknown) => Promise<void> }).handleMessage({
    type: "httpClient/moveRequest",
    payload: { requestId: request.id, targetCollectionId: products.id },
  });

  const config = await store.loadConfig();
  const defaultCollection = config.collections.find((c) => c.isDefault);
  const productsCollection = config.collections.find((c) => c.id === products.id);
  assert.equal(defaultCollection?.requests.length ?? -1, 0);
  assert.equal(productsCollection?.requests.length, 1);
  assert.equal(productsCollection?.requests[0].id, request.id);
  assert.ok(messages.some((m) => m.type === "httpClient/state"));

  await logger.conclusion("moveRequest 跨集合迁移完成");
});

test("panel: exportCurl 应基于已保存请求生成 cURL 命令并回推到 webview", async () => {
  const logger = await createTestLogger("http_client_panel_export.txt");
  await logger.flow("验证 exportCurl 消息会带回完整的 cURL 命令");

  const workspaceRoot = await createTempWorkspace("mx-http-panel-export");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  await store.ensureInitialized();
  const request = createDefaultRequest("获取会员");
  request.method = "POST";
  request.url = "http://iot.iotim.com/api";
  request.headers = [
    { id: "h1", key: "Content-Type", value: "application/json", enabled: true },
  ];
  request.bodyMode = "json";
  request.bodyText = "{\"k\":1}";
  await store.upsertRequestByUrl(request, buildResponse(200, "{}"));

  const messages: ExtensionToWebviewMessage[] = [];
  const controller = createPanelController(
    createContextStub(),
    { appendLine: () => undefined } as never,
    store as never,
    createToastServiceStub() as never
  );
  attachPanel(controller, messages);

  await (controller as unknown as { handleMessage: (message: unknown) => Promise<void> }).handleMessage({
    type: "httpClient/exportCurl",
    payload: { requestId: request.id },
  });

  const curlMessage = messages.find((m) => m.type === "httpClient/curl");
  assert.ok(curlMessage, "应收到 httpClient/curl 消息");
  if (curlMessage && curlMessage.type === "httpClient/curl") {
    assert.ok(curlMessage.payload.curl.includes("curl -X POST"));
    assert.ok(curlMessage.payload.curl.includes("Content-Type"));
    assert.ok(curlMessage.payload.curl.includes("{\"k\":1}"));
  }

  await logger.conclusion("exportCurl 已能生成完整 cURL 命令");
});

test("panel: 默认集合拒绝删除", async () => {
  const logger = await createTestLogger("http_client_panel_delete.txt");
  await logger.flow("验证 controller 在收到默认集合 deleteCollection 消息时应拒绝并返回错误");

  const workspaceRoot = await createTempWorkspace("mx-http-panel-delete");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  await store.ensureInitialized();

  const messages: ExtensionToWebviewMessage[] = [];
  const controller = createPanelController(
    createContextStub(),
    { appendLine: () => undefined } as never,
    store as never,
    createToastServiceStub() as never
  );
  attachPanel(controller, messages);

  await (controller as unknown as { handleMessage: (message: unknown) => Promise<void> }).handleMessage({
    type: "httpClient/deleteCollection",
    payload: { collectionId: HTTP_CLIENT_DEFAULT_COLLECTION_ID },
  });
  const errorMessage = messages.find((m) => m.type === "httpClient/error");
  assert.ok(errorMessage, "默认集合删除应报错");

  const config = await store.loadConfig();
  assert.equal(config.collections.length, 1);
  assert.ok(config.collections[0].isDefault);

  await logger.conclusion("controller 已保护默认集合不可删除");
});

test("panel: webview 未确认响应时应自动重载并按当前状态恢复界面", async () => {
  const logger = await createTestLogger("http_client_panel_ack.txt");
  await logger.flow("验证 webview 未返回 responseAck 时, panel 会自动按当前状态重载");

  const workspaceRoot = await createTempWorkspace("mx-http-panel-ack");
  const stateStore = new MemoryStateStore();
  const store = new HttpClientStore(workspaceRoot, stateStore);
  await store.ensureInitialized();
  const request = createDefaultRequest("查询会员信息");
  request.method = "POST";
  request.url = "http://iot.iotim.com/ehong/tool/GetMemberInfo";
  const response = buildResponse(200, "{\"ok\":true}");

  const outputLogs: string[] = [];
  const htmlAssignments: string[] = [];
  const controller = createPanelController(
    createContextStub(),
    { appendLine: (msg: string) => outputLogs.push(msg) } as never,
    store as never,
    createToastServiceStub() as never
  );

  const webview = {
    cspSource: "vscode-webview://test",
    postMessage: async (message: ExtensionToWebviewMessage) => {
      return message.type !== "httpClient/state" || message.payload.response !== null;
    },
  };
  const panel: { webview: typeof webview; html?: string } = { webview };
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
  stubRunner(controller, async () => response);

  await (controller as unknown as { sendRequest: (payload: { request: HttpRequestEntity; environmentId: string | null; timeoutMs: number }) => Promise<void> }).sendRequest({
    request,
    environmentId: null,
    timeoutMs: 30000,
  });

  await waitUntil(() => htmlAssignments.length > 0, 1500);
  assert.ok(outputLogs.some((line) => line.includes("response ack timeout, reload panel from current state")));

  await logger.conclusion("responseAck 缺失时, panel 可自动重载并恢复界面");
});

function createContextStub(): never {
  return { subscriptions: [] } as never;
}

function attachPanel(controller: HttpClientPanelControllerShape, messages: ExtensionToWebviewMessage[]): void {
  (controller as unknown as { panel: unknown }).panel = {
    webview: {
      postMessage: async (message: ExtensionToWebviewMessage) => {
        messages.push(message);
        return true;
      },
    },
  };
}

function stubRunner(controller: HttpClientPanelControllerShape, run: (request: unknown) => Promise<HttpResponseResult>): void {
  (controller as unknown as { requestRunner: { run: typeof run } }).requestRunner = { run };
}

function createToastServiceStub(): unknown {
  return {
    notify: async () => undefined,
    registerHost: () => ({ dispose: () => undefined }),
  };
}

function buildResponse(status: number, body: string): HttpResponseResult {
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
      sizeBytes: body.length,
      finalUrl: "http://localhost/api/products",
      redirected: false,
      contentType: "application/json",
      unresolvedVariables: [],
      environmentId: null,
    },
  };
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      return;
    }
    await delay(40);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function installVscodeMock(): void {
  const moduleRef = Module as unknown as {
    _load?: (request: string, parent: { id: string } | null, isMain: boolean) => unknown;
  };
  const originalLoad = moduleRef._load;
  moduleRef._load = function (request, parent, isMain) {
    if (request === "vscode") {
      return buildVscodeMock();
    }
    if (originalLoad) {
      return originalLoad.call(this, request, parent, isMain);
    }
    return undefined;
  };
}

function buildVscodeMock(): unknown {
  const never = () => {
    throw new Error("vscode mock method not implemented");
  };
  const showInfoMock = async () => undefined;
  return {
    workspace: {
      openTextDocument: never,
    },
    window: {
      showInformationMessage: showInfoMock,
      showWarningMessage: showInfoMock,
      showErrorMessage: showInfoMock,
      showInputBox: never,
      createWebviewPanel: never,
    },
    commands: {
      registerCommand: never,
      executeCommand: never,
    },
    ViewColumn: {
      One: 1,
      Active: 2,
    },
    Uri: {
      file: (fsPath: string) => ({ fsPath, toString: () => fsPath }),
    },
    EventEmitter: class {
      public event: unknown = () => undefined;
      public fire(_value: unknown): void {
        undefined;
      }
      public dispose(): void {
        undefined;
      }
    },
    Disposable: class {
      public dispose(): void {
        undefined;
      }
    },
  };
}

void createDefaultCollection;
void createDefaultConfigFile;
void createDefaultEnvironment;
void path;
void fs;
