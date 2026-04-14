import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultConfigFile, createDefaultRequest, type HttpResponseResult } from "../../../src/http_client/types";
import { createTestLogger } from "../../../src/http_client/tests/helpers";
import {
  applyWorkbenchMessage,
  buildUrlHint,
  cloneViewState,
  createFallbackViewState,
  createInitialUiState,
  getDisplayedResponseText,
  renderJsonHighlightedText,
  syncParamsFromUrl,
  syncUrlFromParams,
} from "../shared/workbench_model";

test("workbench_model: React workbench 纯逻辑与旧协议保持一致", async () => {
  const logger = await createTestLogger("http_client_workbench_model.txt");
  await logger.flow("验证 React workbench 共享纯函数与现有 HTTP Client 协议保持一致");

  await logger.step("验证 URL 校验提示文案");
  assert.equal(buildUrlHint(""), "URL 不能为空");
  assert.equal(buildUrlHint("baidu.com"), "URL 需要以 http:// 或 https:// 开头, 例如 https://baidu.com");
  assert.equal(buildUrlHint("ftp://example.com/api"), "仅支持 HTTP/HTTPS 请求, 例如 https://example.com/api");
  assert.equal(buildUrlHint("https://example.com/api"), "");

  await logger.step("验证 URL 与 Params 的双向同步行为");
  const request = createDefaultRequest("查询用户");
  request.url = "https://example.com/api/member?id=42&name=maxu#hash";

  const draftFromUrl = syncParamsFromUrl(request, createId);
  assert.deepEqual(
    draftFromUrl.params.map((item) => ({ key: item.key, value: item.value, enabled: item.enabled })),
    [
      { key: "id", value: "42", enabled: true },
      { key: "name", value: "maxu", enabled: true },
      { key: "", value: "", enabled: true },
    ]
  );

  draftFromUrl.params[0].value = "99";
  draftFromUrl.params[1].enabled = false;
  const requestFromParams = syncUrlFromParams(draftFromUrl);
  assert.equal(requestFromParams.url, "https://example.com/api/member?id=99#hash");

  await logger.step("验证响应文本展示与 JSON 高亮输出");
  const response = createResponseResult();
  assert.equal(getDisplayedResponseText(response, true), response.bodyPrettyText);
  assert.equal(getDisplayedResponseText(response, false), response.bodyText);

  const highlighted = renderJsonHighlightedText(response.bodyPrettyText, "成功");
  assert.match(highlighted, /json-key/);
  assert.match(highlighted, /json-string/);
  assert.match(highlighted, /<mark>成功<\/mark>/);

  await logger.step("验证协议消息应用后的状态收敛");
  const currentViewState = createFallbackViewState();
  currentViewState.config = createDefaultConfigFile();
  currentViewState.requestRunning = true;
  currentViewState.responseTab = "meta";

  const currentUiState = createInitialUiState();
  currentUiState.lastErrorMessage = "旧错误";

  const statePayload = cloneViewState(currentViewState);
  statePayload.activeTab = "headers";
  const stateSnapshot = applyWorkbenchMessage(currentViewState, currentUiState, {
    type: "httpClient/state",
    payload: statePayload,
  });
  assert.equal(stateSnapshot.viewState.activeTab, "headers");
  assert.notStrictEqual(stateSnapshot.viewState, statePayload);

  const responseSnapshot = applyWorkbenchMessage(currentViewState, currentUiState, {
    type: "httpClient/response",
    payload: response,
  });
  assert.equal(responseSnapshot.viewState.requestRunning, false);
  assert.equal(responseSnapshot.viewState.responseTab, "body");
  assert.equal(responseSnapshot.uiState.lastErrorMessage, "");
  assert.equal(responseSnapshot.viewState.response?.status, 200);

  const errorSnapshot = applyWorkbenchMessage(responseSnapshot.viewState, responseSnapshot.uiState, {
    type: "httpClient/error",
    payload: { message: "URL 不合法" },
  });
  assert.equal(errorSnapshot.viewState.response, null);
  assert.equal(errorSnapshot.viewState.requestRunning, false);
  assert.equal(errorSnapshot.uiState.lastErrorMessage, "URL 不合法");

  const hostCommandSnapshot = applyWorkbenchMessage(currentViewState, currentUiState, {
    type: "httpClient/hostCommand",
    payload: { command: "send" },
  });
  assert.equal(hostCommandSnapshot.hostCommand, "send");

  const toastSnapshot = applyWorkbenchMessage(currentViewState, currentUiState, {
    type: "mxToast/show",
    payload: {
      id: "toast-1",
      kind: "success",
      message: "请求完成",
      copyText: "请求完成",
      durationMs: 2200,
      source: "test",
      createdAt: "2026-04-14T00:00:00.000Z",
    },
  });
  assert.strictEqual(toastSnapshot.viewState, currentViewState);
  assert.strictEqual(toastSnapshot.uiState, currentUiState);

  await logger.verify("URL 校验, JSON 高亮, 状态消息应用和 Toast 旁路逻辑都符合预期");
  await logger.conclusion("React workbench 共享纯函数已具备稳定的自动化回归保护");
});

function createResponseResult(): HttpResponseResult {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    bodyRawText: "{\"message\":\"获取成功\",\"count\":1}",
    bodyText: "{\"message\":\"获取成功\",\"count\":1}",
    bodyPrettyText: "{\n  \"message\": \"获取成功\",\n  \"count\": 1\n}",
    isJson: true,
    headers: [
      { key: "content-type", value: "application/json; charset=utf-8" },
      { key: "x-request-id", value: "req-1" },
    ],
    meta: {
      startedAt: "2026-04-14T00:00:00.000Z",
      durationMs: 47,
      sizeBytes: 256,
      finalUrl: "https://example.com/api/member?id=99",
      redirected: false,
      contentType: "application/json; charset=utf-8",
      unresolvedVariables: [],
      environmentId: null,
    },
  };
}

function createId(): string {
  return `test-id-${idCounter++}`;
}

let idCounter = 1;
