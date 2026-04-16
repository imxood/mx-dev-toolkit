import assert from "node:assert/strict";
import Module = require("node:module");
import { test } from "node:test";
import { createTestLogger } from "./helpers";

test("sidebar_view: 侧边启动器应输出轻量入口按钮并避免再装载完整 React 侧栏", async () => {
  const logger = await createTestLogger("http_client_sidebar_view.txt");
  await logger.flow("验证 Activity 侧边栏已降级为轻量启动器, 不再承担高频列表交互");

  const { getSidebarHtml } = loadSidebarModule();
  const html = getSidebarHtml(
    {
      cspSource: "vscode-webview://test",
    } as never,
    "nonce"
  );

  await logger.step("检查侧边栏只保留启动器按钮和内联脚本");
  assert.match(html, /打开完整工作台/);
  assert.match(html, /id="open-workbench"/);
  assert.match(html, /id="create-request"/);
  assert.match(html, /id="import-curl"/);
  assert.doesNotMatch(html, /sidebar\.css/);
  assert.doesNotMatch(html, /sidebar\.js/);

  await logger.verify("检查 HTML 保留标题, CSP 与启动器说明");
  assert.match(html, /<title>HTTP Client<\/title>/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /建议在完整工作台中完成高频操作/);

  await logger.conclusion("侧边栏已切换为轻量启动器, 高频交互将收敛到单一工作台页面");
});

function loadSidebarModule(): typeof import("../sidebar_view") {
  const moduleApi = Module as unknown as {
    _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
  };
  const originalLoad = moduleApi._load;
  moduleApi._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
    if (request === "vscode") {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require("../sidebar_view") as typeof import("../sidebar_view");
  } finally {
    moduleApi._load = originalLoad;
  }
}
