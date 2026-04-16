import { test } from "node:test";
import assert from "node:assert/strict";
import * as vm from "node:vm";
import { getWebviewScript } from "../webview/state";
import { createDefaultConfigFile, createDefaultRequest } from "../types";
import { createTestLogger } from "./helpers";

test("webview_state: 生成的 webview 脚本可被浏览器解释执行", async () => {
  const logger = await createTestLogger("http_client_webview_state.txt");
  await logger.flow("验证 webview 前端脚本文本不存在运行时语法错误");

  const scriptHtml = getWebviewScript({
    config: createDefaultConfigFile(),
    activeRequestId: null,
    selectedHistoryId: null,
    activeEnvironmentId: null,
    draft: createDefaultRequest("语法检查"),
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
  });

  const match = scriptHtml.match(/<script>([\s\S]*)<\/script>/);
  assert.ok(match, "script block should exist");

  await logger.step("使用 vm.Script 校验脚本文本可成功解析");
  assert.doesNotThrow(() => {
    new vm.Script(match?.[1] ?? "");
  });

  await logger.verify("检查脚本已包含 JSON 高亮, 响应复制和统一 Toast 处理逻辑");
  assert.match(match?.[1] ?? "", /function renderJsonHighlightedText/);
  assert.match(match?.[1] ?? "", /data-action="copy-response"/);
  assert.match(match?.[1] ?? "", /mxToast\/show/);
  assert.match(match?.[1] ?? "", /window\.__mxToastCenter/);
  assert.match(match?.[1] ?? "", /const MAX_TOASTS = 8/);
  assert.match(match?.[1] ?? "", /data-toast-action="copy"/);
  assert.match(match?.[1] ?? "", /mouseenter/);

  await logger.conclusion("webview state 脚本语法有效, 且已接入统一 Toast 渲染逻辑");
});
