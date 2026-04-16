import assert from "node:assert/strict";
import Module = require("node:module");
import { test } from "node:test";
import { createTestLogger } from "./helpers";

test("register: HTTP Client 命令不应主动弹出 OUTPUT", async () => {
  const logger = await createTestLogger("http_client_register.txt");
  await logger.flow("验证 HTTP Client 状态栏与命令入口只打开工作台和触发动作, 不主动 show OutputChannel");

  const commandHandlers = new Map<string, () => Promise<void> | void>();
  const triggerCommands: string[] = [];
  const outputLogs: string[] = [];
  let outputShowCalls = 0;
  let controllerShowCalls = 0;
  const createdStatusBarItems: Array<{ command?: string; showCalls: number }> = [];

  const registerHttpClient = loadRegisterModule({
    workspaceFolders: [{ uri: { fsPath: "E:/git/maxu/mx-dev-toolkit" } }],
    createStatusBarItem: () => {
      const item = {
        command: undefined as string | undefined,
        showCalls: 0,
        name: "",
        text: "",
        tooltip: "",
        show() {
          item.showCalls += 1;
        },
        dispose() {
          return undefined;
        },
      };
      createdStatusBarItems.push(item);
      return item;
    },
    registerCommand: (command: string, handler: () => Promise<void> | void) => {
      commandHandlers.set(command, handler);
      return {
        dispose() {
          return undefined;
        },
      };
    },
    createController: () => ({
      show: async () => {
        controllerShowCalls += 1;
      },
      triggerCommand: async (command: "send" | "save" | "loadTest" | "focusCurlImport") => {
        triggerCommands.push(command);
      },
      dispose: () => undefined,
    }),
  });

  const context = {
    workspaceState: {},
    subscriptions: [],
  };
  const channel = {
    appendLine: (message: string) => {
      outputLogs.push(message);
    },
    show: () => {
      outputShowCalls += 1;
    },
  };

  registerHttpClient(context as never, channel as never, {} as never);

  await logger.step("注册后状态栏按钮应可见, 且命令处理器应挂载完成");
  assert.equal(createdStatusBarItems.length, 1);
  assert.equal(createdStatusBarItems[0].showCalls, 1);
  assert.equal(createdStatusBarItems[0].command, "mx-dev-toolkit.httpClient.openWorkbench");

  await logger.step("执行 open/send/save/import/load test 命令时, 不应主动弹出 OUTPUT");
  await invokeRegisteredCommand(commandHandlers, "mx-dev-toolkit.httpClient.openWorkbench");
  await invokeRegisteredCommand(commandHandlers, "mx-dev-toolkit.httpClient.sendCurrent");
  await invokeRegisteredCommand(commandHandlers, "mx-dev-toolkit.httpClient.saveCurrent");
  await invokeRegisteredCommand(commandHandlers, "mx-dev-toolkit.httpClient.importCurl");
  await invokeRegisteredCommand(commandHandlers, "mx-dev-toolkit.httpClient.runLoadTest");

  await logger.verify(`output.show 调用次数: ${outputShowCalls}`);
  assert.equal(outputShowCalls, 0);
  assert.equal(controllerShowCalls, 1);
  assert.deepEqual(triggerCommands, ["send", "save", "focusCurlImport", "loadTest"]);
  assert.deepEqual(outputLogs, [
    "[HttpClient] open workbench",
    "[HttpClient] command send current",
    "[HttpClient] command save current",
    "[HttpClient] command import curl",
    "[HttpClient] command load test",
  ]);

  await logger.conclusion("HTTP Client 入口已改为静默记录日志, 不再抢焦点弹出 OUTPUT");
});

function loadRegisterModule(stubs: {
  workspaceFolders: Array<{ uri: { fsPath: string } }>;
  createStatusBarItem: () => {
    command?: string;
    showCalls: number;
    name: string;
    text: string;
    tooltip: string;
    show(): void;
    dispose(): void;
  };
  registerCommand: (command: string, handler: () => Promise<void> | void) => { dispose(): void };
  createController: () => {
    show(): Promise<void>;
    triggerCommand(command: "send" | "save" | "loadTest" | "focusCurlImport"): Promise<void>;
    dispose(): void;
  };
}): typeof import("../register").registerHttpClient {
  const moduleApi = Module as unknown as {
    _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
  };
  const originalLoad = moduleApi._load;
  moduleApi._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
    if (request === "vscode") {
      return {
        workspace: {
          workspaceFolders: stubs.workspaceFolders,
        },
        window: {
          createStatusBarItem: stubs.createStatusBarItem,
        },
        commands: {
          registerCommand: stubs.registerCommand,
        },
        StatusBarAlignment: {
          Left: 1,
        },
      };
    }
    if (request === "./panel") {
      return {
        HttpClientPanelController: class {
          public constructor() {
            return stubs.createController();
          }
        },
      };
    }
    if (request === "./store") {
      return {
        HttpClientStore: class {
          public constructor() {
            return {};
          }
        },
      };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require("../register").registerHttpClient as typeof import("../register").registerHttpClient;
  } finally {
    moduleApi._load = originalLoad;
  }
}

async function invokeRegisteredCommand(
  handlers: Map<string, () => Promise<void> | void>,
  command: string
): Promise<void> {
  const handler = handlers.get(command);
  assert.ok(handler, `command not registered: ${command}`);
  await handler();
}
