import assert from "node:assert/strict";
import Module = require("node:module");
import { test } from "node:test";
import { createTestLogger } from "./helpers";
import { createDefaultConfigFile, createDefaultRequest } from "../types";

test("react_loader: 工作台装载页输出 React 资源与 bootstrap", async () => {
  const logger = await createTestLogger("http_client_react_loader.txt");
  await logger.flow("验证工作台 React 装载页引用正确资源, 并保留 bootstrap 和 Toast host");

  const { getHttpClientHtml } = loadWorkbenchModule();
  const html = getHttpClientHtml(
    {
      cspSource: "vscode-webview://test",
      asWebviewUri: (value: { toString(): string }) => ({
        toString: () => `vscode-webview://test/${value.toString().replace(/^[a-zA-Z]:/, "").replace(/\\/g, "/")}`,
      }),
    } as never,
    {
      config: createDefaultConfigFile(),
      activeRequestId: null,
      activeEnvironmentId: null,
      draft: createDefaultRequest("工作台装载"),
      history: [],
      response: null,
      requestRunning: false,
      loadTestProfile: {
        totalRequests: 1,
        concurrency: 1,
        timeoutMs: 1000,
      },
      loadTestResult: null,
      loadTestProgress: null,
      dirty: false,
      activeTab: "params",
      responseTab: "body",
    },
    "nonce"
  );

  await logger.step("检查 HTML 已切换到外部 workbench 资源装载");
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /workbench\.css/);
  assert.match(html, /workbench\.js/);
  assert.match(html, /type="module"/);

  await logger.verify("检查 bootstrap buildId 和统一 Toast host 仍然注入");
  assert.match(html, /window\.__MX_HTTP_CLIENT_BOOTSTRAP__/);
  assert.match(html, /"surface":"workbench"/);
  assert.match(html, /"buildId":"2026-04-13-01"/);
  assert.match(html, /window\.__mxToastCenter/);
  assert.match(html, /mx-toast-root/);

  await logger.conclusion("工作台 React 装载页已正确接入外部构建产物和统一 Toast host");
});

function loadWorkbenchModule(): typeof import("../webview") {
  const moduleApi = Module as unknown as {
    _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
  };
  const originalLoad = moduleApi._load;
  moduleApi._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
    if (request === "vscode") {
      return {
        Uri: {
          file: (value: string) => ({
            toString: () => value,
          }),
        },
      };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require("../webview") as typeof import("../webview");
  } finally {
    moduleApi._load = originalLoad;
  }
}
