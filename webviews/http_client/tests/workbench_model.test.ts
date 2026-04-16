import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultConfigFile, createDefaultRequest, type HttpResponseResult } from "../../../src/http_client/types";
import { createTestLogger } from "../../../src/http_client/tests/helpers";
import {
  applyWorkbenchMessage,
  buildUrlHint,
  cloneViewState,
  createScratchRequestLocally,
  createFallbackViewState,
  createInitialUiState,
  getDisplayedResponseText,
  getSelectedHistoryOrdinal,
  highlightText,
  isScratchDraft,
  selectHistoryLocally,
  selectRequestLocally,
  setEnvironmentLocally,
  syncParamsFromUrl,
  syncUrlFromParams,
  toggleFavoriteLocally,
  updateDraftLocally,
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

  await logger.step("验证响应文本展示与转义输出");
  const response = createResponseResult();
  assert.equal(getDisplayedResponseText(response, true), "{\"message\":\"获取成功\n下一行\",\"count\":1}");
  assert.equal(getDisplayedResponseText(response, false), "{\"message\":\"获取成功\\n下一行\",\"count\":1}");

  const plainTextResponse: HttpResponseResult = {
    ...response,
    isJson: false,
    bodyRawText: "第一行\n第二行",
    bodyText: "第一行\n第二行",
    bodyPrettyText: "第一行\n第二行",
  };
  assert.equal(getDisplayedResponseText(plainTextResponse, true), "第一行\n第二行");
  assert.equal(getDisplayedResponseText(plainTextResponse, false), "第一行\\n第二行");

  const rawHighlighted = highlightText("first line\n获取成功\nsecond line", "成功");
  assert.match(rawHighlighted, /<mark>成功<\/mark>/);

  await logger.step("验证历史序号和新建草稿识别");
  const historyViewState = createFallbackViewState();
  historyViewState.history = [
    {
      id: "history-1",
      request,
      responseSummary: {
        status: 200,
        statusText: "OK",
        durationMs: 20,
        ok: true,
        sizeBytes: 16,
      },
      environmentId: null,
      executedAt: "2026-04-14T08:00:00.000Z",
    },
  ];
  historyViewState.selectedHistoryId = "history-1";
  assert.equal(getSelectedHistoryOrdinal(historyViewState.history, historyViewState.selectedHistoryId), 1);
  assert.equal(isScratchDraft(historyViewState), true);

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
  assert.strictEqual(hostCommandSnapshot.viewState, currentViewState);

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

test("workbench_model: local-first session patch 应复用冷数据引用", async () => {
  const logger = await createTestLogger("http_client_workbench_model.txt");
  await logger.flow("验证 local-first 架构下, 请求切换与草稿编辑只更新会话态, 不全量复制 config 和 history");

  const currentViewState = createFallbackViewState();
  currentViewState.config = createDefaultConfigFile();
  const requestA = createDefaultRequest("请求 A", currentViewState.config.collections[0].id);
  const requestB = createDefaultRequest("请求 B", currentViewState.config.collections[0].id);
  currentViewState.config.requests = [requestA, requestB];
  currentViewState.draft = requestA;
  currentViewState.activeRequestId = requestA.id;
  currentViewState.history = [
    {
      id: "history-1",
      request: requestB,
      responseSummary: {
        status: 200,
        statusText: "OK",
        durationMs: 28,
        ok: true,
        sizeBytes: 64,
      },
      environmentId: null,
      executedAt: "2026-04-16T08:00:00.000Z",
    },
  ];

  await logger.step("切换保存请求时, config 和 history 应保持原引用");
  const selectedRequestState = selectRequestLocally(currentViewState, requestB.id);
  assert.equal(selectedRequestState.activeRequestId, requestB.id);
  assert.strictEqual(selectedRequestState.config, currentViewState.config);
  assert.strictEqual(selectedRequestState.history, currentViewState.history);
  assert.notStrictEqual(selectedRequestState.draft, requestB);

  await logger.step("编辑草稿与切换环境时, 只更新会话态");
  const updatedDraftState = updateDraftLocally(selectedRequestState, (draft) => ({
    ...draft,
    url: "https://example.com/local-first",
  }));
  const selectedEnvironmentState = setEnvironmentLocally(updatedDraftState, "env-1");
  assert.equal(updatedDraftState.dirty, true);
  assert.equal(selectedEnvironmentState.activeEnvironmentId, "env-1");
  assert.strictEqual(updatedDraftState.config, selectedRequestState.config);
  assert.strictEqual(selectedEnvironmentState.history, updatedDraftState.history);

  await logger.step("新建请求, 切换历史和收藏都不应触发全量深拷贝");
  const scratchRequest = createDefaultRequest("本地新建", currentViewState.config.collections[0].id);
  const scratchState = createScratchRequestLocally(selectedEnvironmentState, scratchRequest);
  const historyState = selectHistoryLocally(scratchState, "history-1");
  const favoriteState = toggleFavoriteLocally(historyState, requestB.id, true);

  assert.equal(scratchState.activeRequestId, scratchRequest.id);
  assert.equal(historyState.selectedHistoryId, "history-1");
  assert.equal(favoriteState.config.requests.find((item) => item.id === requestB.id)?.favorite, true);
  assert.strictEqual(scratchState.config, selectedEnvironmentState.config);
  assert.strictEqual(historyState.config, scratchState.config);
  assert.strictEqual(favoriteState.history, historyState.history);

  await logger.conclusion("local-first 纯函数已把热路径更新收敛到会话态, 避免冷数据被整包 clone");
});

function createResponseResult(): HttpResponseResult {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    bodyRawText: "{\"message\":\"\\u83b7\\u53d6\\u6210\\u529f\\n\\u4e0b\\u4e00\\u884c\",\"count\":1}",
    bodyText: "{\"message\":\"获取成功\\n下一行\",\"count\":1}",
    bodyPrettyText: "{\n  \"message\": \"获取成功\\n下一行\",\n  \"count\": 1\n}",
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
