import assert from "node:assert/strict";
import Module = require("node:module");
import { test } from "node:test";
import * as vm from "node:vm";
import { createTestLogger } from "./helpers";

test("sidebar_view: 记录页脚本支持请求分组渲染和展开交互", async () => {
  const logger = await createTestLogger("http_client_sidebar_view.txt");
  await logger.flow("验证侧边栏记录页脚本可解析, 且已接入请求分组和展开逻辑");

  const { getSidebarHtml } = loadSidebarModule();
  const html = getSidebarHtml({ cspSource: "vscode-webview://test" } as never, "nonce");
  const match = html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/);

  assert.ok(match, "sidebar script block should exist");

  await logger.step("使用 vm.Script 校验侧边栏脚本文本可成功解析");
  assert.doesNotThrow(() => {
    new vm.Script(match?.[1] ?? "");
  });

  await logger.verify("检查记录页已包含分组, 展开和最近 30 条参与聚合的逻辑");
  assert.match(html, />记录<\/button>/);
  assert.match(match?.[1] ?? "", /function buildHistoryGroups/);
  assert.match(match?.[1] ?? "", /expandedHistoryGroups/);
  assert.match(match?.[1] ?? "", /state\.history\.slice\(0, 30\)/);
  assert.match(match?.[1] ?? "", /select-history-group/);
  assert.match(match?.[1] ?? "", /toggle-history-group/);
  assert.match(match?.[1] ?? "", /renderHistoryGroup/);

  await logger.conclusion("侧边栏记录页已从平铺历史切换为请求维度分组展示");
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
