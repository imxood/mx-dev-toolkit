import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import {
  createDefaultCollection,
  createDefaultEnvironment,
  createDefaultRequest,
  type HttpClientViewState,
} from "../../../src/http_client/types";
import { createTestLogger } from "../../../src/http_client/tests/helpers";
import { AppView } from "../workbench/App";
import { SidebarView } from "../sidebar/SidebarApp";
import type { SidebarController } from "../sidebar/useSidebarController";
import type { WorkbenchController } from "../workbench/useWorkbenchController";
import { createFallbackViewState, createInitialUiState } from "../shared/workbench_model";
import { createInitialSidebarUiState } from "../shared/sidebar_model";

test("component_contract: 工作台工具栏与响应区保持正确接线", async () => {
  const logger = await createTestLogger("http_client_component_contract.txt");
  await logger.flow("验证 React 工作台的标题栏, URL 行发送按钮和响应正文渲染契约");

  let loadTestCalls = 0;
  let stopLoadTestCalls = 0;
  let openResponseEditorCalls = 0;
  const controller = createWorkbenchController();
  controller.performLoadTest = () => {
    loadTestCalls += 1;
  };
  controller.stopLoadTest = () => {
    stopLoadTestCalls += 1;
  };
  controller.openResponseEditor = () => {
    openResponseEditorCalls += 1;
  };

  controller.viewState.draft = createDefaultRequest("临时草稿", controller.viewState.config.collections[0].id);
  controller.viewState.activeRequestId = controller.viewState.draft.id;

  await logger.step("标题行应已移除, 且发送按钮应并入 METHOD/URL 同一行");
  const chromeTree = AppView({ controller });
  assert.throws(() => findElement(chromeTree, (element) => element.props.className === "toolbar-title-row"));
  const toolbarMain = findElement(chromeTree, (element) => element.props.className === "toolbar-main");
  assert.equal(findElement(toolbarMain.props.children as React.ReactNode, (element) => element.props.id === "send-button").props.id, "send-button");
  const toolbarSecondary = findElement(chromeTree, (element) => element.props.className === "toolbar-secondary");
  assert.equal(findElement(toolbarSecondary.props.children as React.ReactNode, (element) => element.props.className === "toolbar-secondary-actions").props.className, "toolbar-secondary-actions");
  assert.equal(findElement(toolbarSecondary.props.children as React.ReactNode, (element) => readText(element.props.children as React.ReactNode) === "说明").props.className, "ghost-button toolbar-help-button");

  await logger.step("未运行压测时, 顶部主按钮应触发 performLoadTest");
  const idleTree = AppView({ controller });
  const loadTestButton = findElement(idleTree, (element) => element.props.id === "load-test-button");
  assert.equal(readText(loadTestButton.props.children as React.ReactNode), "压测");
  invokeClick(loadTestButton);
  assert.equal(loadTestCalls, 1);

  await logger.step("压测运行中时, 顶部主按钮应切换为停止");
  controller.viewState.loadTestProgress = {
    completedRequests: 3,
    totalRequests: 10,
    successCount: 3,
    failureCount: 0,
    running: true,
  };
  const runningTree = AppView({ controller });
  const stopButton = findElement(runningTree, (element) => element.props.id === "load-test-button");
  assert.equal(readText(stopButton.props.children as React.ReactNode), "停止");
  invokeClick(stopButton);
  assert.equal(stopLoadTestCalls, 1);

  await logger.step("响应正文在原文或 Raw 模式下应走高亮 HTML, 且编辑按钮接线有效");
  controller.viewState.loadTestProgress = null;
  controller.viewState.response = {
    ok: true,
    status: 200,
    statusText: "OK",
    bodyRawText: "获取成功",
    bodyText: "获取成功",
    bodyPrettyText: "获取成功",
    isJson: false,
    headers: [],
    meta: {
      startedAt: "2026-04-14T00:00:00.000Z",
      durationMs: 47,
      sizeBytes: 16,
      finalUrl: "https://example.com",
      redirected: false,
      contentType: "text/plain",
      unresolvedVariables: [],
      environmentId: null,
    },
  };
  controller.uiState.responsePretty = false;
  controller.uiState.responseSearch = "成功";
  controller.highlightedResponseHtml = "获取<mark>成功</mark>";
  const responseTree = AppView({ controller });
  const openEditorButton = findElement(responseTree, (element) => element.props.id === "response-open-editor");
  assert.equal(readText(openEditorButton.props.children as React.ReactNode), "编辑");
  assert.equal(openEditorButton.props.className, "ghost-button");
  invokeClick(openEditorButton);
  assert.equal(openResponseEditorCalls, 1);
  const responseCode = findElement(responseTree, (element) => element.props.className === "response-code response-code-raw");
  const html = (responseCode.props.dangerouslySetInnerHTML as { __html: string }).__html;
  assert.match(String(html), /<mark>成功<\/mark>/);

  await logger.conclusion("工作台标题栏, 发送按钮布局和响应渲染契约已得到自动化保护");
});

test("component_contract: 侧边栏集合页应显示折叠集合和紧凑 URL 列表", async () => {
  const logger = await createTestLogger("http_client_component_contract.txt");
  await logger.flow("验证 React 侧边栏集合页已切到可折叠集合和 METHOD + URL 紧凑列表");

  const actions = {
    requestMenu: 0,
    collectionMenu: 0,
    historyMenu: 0,
    environmentMenu: 0,
    variableMenu: 0,
  };
  const controller = createSidebarController(actions);

  await logger.step("集合页应显示可折叠集合标题, 并允许集合标题和请求行接入右键菜单");
  const collectionsTree = SidebarView({
    controller,
    onCollectionContextMenu: () => {
      actions.collectionMenu += 1;
    },
    onRequestContextMenu: () => {
      actions.requestMenu += 1;
    },
  });
  assert.equal(findElement(collectionsTree, (element) => element.props.className === "group-title-button").props.className, "group-title-button");
  assert.equal(
    findElement(collectionsTree, (element) => element.props.className === "compact-request-url" && readText(element.props.children as React.ReactNode) === "https://api.example.com/member").props.className,
    "compact-request-url"
  );
  invokeContextMenu(
    findElement(
      collectionsTree,
      (element) => element.props.className === "group-title" && readText(element.props.children as React.ReactNode).includes("默认集合")
    )
  );
  invokeContextMenu(findElement(collectionsTree, (element) => element.props.className === "collection-item active"));
  assert.equal(actions.collectionMenu, 1);
  assert.equal(actions.requestMenu, 1);

  await logger.step("环境页应继续渲染编辑卡片, 并允许环境项和变量行接入右键菜单");
  controller.uiState.activeTab = "environments";
  const environmentsTree = SidebarView({
    controller,
    onEnvironmentContextMenu: () => {
      actions.environmentMenu += 1;
    },
    onEnvironmentVariableContextMenu: () => {
      actions.variableMenu += 1;
    },
  });
  assert.equal(
    findElement(
      environmentsTree,
      (element) => element.props.className === "group-title-main" && readText(element.props.children as React.ReactNode).includes("环境编辑")
    ).props.className,
    "group-title-main"
  );
  invokeContextMenu(findElement(environmentsTree, (element) => element.props.className === "environment-item active"));
  invokeContextMenu(findElement(environmentsTree, (element) => element.props.className === "environment-variable-row"));
  assert.equal(actions.environmentMenu, 1);
  assert.equal(actions.variableMenu, 1);

  await logger.conclusion("集合折叠, 紧凑 URL 列表和环境编辑入口已得到自动化保护");
});

test("component_contract: 记录页应显示紧凑历史项并保留右键入口", async () => {
  const logger = await createTestLogger("http_client_component_contract.txt");
  await logger.flow("验证 React 侧边栏记录页已切到 METHOD + URL 紧凑历史列表");

  const actions = {
    requestMenu: 0,
    collectionMenu: 0,
    historyMenu: 0,
    environmentMenu: 0,
    variableMenu: 0,
  };
  const controller = createSidebarController(actions);
  controller.uiState.activeTab = "activity";
  controller.uiState.selectedHistoryId = "history-2";
  assert.ok(controller.viewState);
  controller.viewState.history = [
    createHistoryRecord("history-1", "https://api.example.com/member", "2026-04-14T08:00:00.000Z", 47),
    createHistoryRecord("history-2", "https://api.example.com/member-retry", "2026-04-14T07:59:00.000Z", 58),
  ];

  await logger.step("记录页应直接显示 METHOD + URL, 且右键菜单仍可挂接");
  const tree = SidebarView({
    controller,
    onHistoryRecordContextMenu: () => {
      actions.historyMenu += 1;
    },
  });
  assert.equal(findElement(tree, (element) => element.props.className === "compact-request-url" && readText(element.props.children as React.ReactNode) === "https://api.example.com/member").props.className, "compact-request-url");
  const activeHistoryItem = findElement(tree, (element) => element.props.className === "list-item compact-request-item active");
  assert.equal(readText(activeHistoryItem.props.children as React.ReactNode).includes("https://api.example.com/member-retry"), true);
  invokeContextMenu(activeHistoryItem);
  assert.equal(actions.historyMenu, 1);

  await logger.conclusion("记录页紧凑历史列表和右键入口已得到自动化保护");
});

function createWorkbenchController(): WorkbenchController {
  const viewState = createFallbackViewState();
  const collection = createDefaultCollection("默认集合");
  const request = createDefaultRequest("契约测试", collection.id);
  const environment = createDefaultEnvironment("default");
  viewState.config = {
    version: 1,
    collections: [collection],
    requests: [request],
    environments: [environment],
  };
  viewState.draft = request;
  viewState.activeRequestId = request.id;
  viewState.activeEnvironmentId = environment.id;
  return {
    buildId: "test-build",
    viewState,
    uiState: createInitialUiState(),
    sidebarUiState: createInitialSidebarUiState(),
    hasHostState: true,
    displayedResponseText: "",
    highlightedResponseHtml: "",
    historyGroups: [],
    collectionGroups: [
      {
        collectionId: collection.id,
        collectionName: collection.name,
        requests: [request],
        expanded: true,
      },
    ],
    favoriteRequests: [],
    ungroupedRequests: [],
    environmentItems: [
      {
        environment,
        active: true,
      },
    ],
    selectedEnvironment: environment,
    environmentDraft: {
      environmentId: environment.id,
      name: environment.name,
      variables: [{ id: "env-row-1", key: "baseUrl", value: "https://api.example.com" }],
      dirty: false,
    },
    pendingRequestAction: null,
    setSidebarTab: () => undefined,
    setSidebarKeyword: () => undefined,
    toggleHistoryGroup: () => undefined,
    toggleCollectionGroup: () => undefined,
    createRequest: () => undefined,
    createCollection: () => undefined,
    renameCollection: () => undefined,
    deleteCollection: () => undefined,
    createEnvironment: () => undefined,
    selectRequest: () => undefined,
    renameRequest: () => undefined,
    duplicateRequest: () => undefined,
    deleteRequest: () => undefined,
    toggleFavorite: () => undefined,
    selectHistory: () => undefined,
    promptSaveHistoryToCollection: () => undefined,
    saveHistoryToCollection: () => undefined,
    setEnvironmentDraftName: () => undefined,
    updateEnvironmentVariable: () => undefined,
    addEnvironmentVariable: () => undefined,
    removeEnvironmentVariable: () => undefined,
    saveEnvironment: () => undefined,
    deleteEnvironment: () => undefined,
    setRequestTab: () => undefined,
    setResponseTab: () => undefined,
    setMethod: () => undefined,
    setUrl: () => undefined,
    setEnvironment: () => undefined,
    selectEnvironment: () => undefined,
    updateKeyValue: () => undefined,
    addKeyValue: () => undefined,
    removeKeyValue: () => undefined,
    setBodyMode: () => undefined,
    setBodyText: () => undefined,
    formatJsonBody: () => true,
    setResponseSearch: () => undefined,
    toggleResponsePretty: () => undefined,
    performSend: () => undefined,
    performSave: () => undefined,
    performLoadTest: () => undefined,
    stopLoadTest: () => undefined,
    setLoadTestProfileField: () => undefined,
    importCurl: () => undefined,
    copyResponse: async () => undefined,
    openResponseEditor: () => undefined,
    copyHeaderValue: async () => undefined,
  };
}

function createSidebarController(actions: {
  requestMenu: number;
  collectionMenu: number;
  historyMenu: number;
  environmentMenu: number;
  variableMenu: number;
}): SidebarController {
  const collection = createDefaultCollection("默认集合");
  const request = createDefaultRequest("获取会员信息", collection.id);
  request.favorite = true;
  request.method = "POST";
  request.url = "https://api.example.com/member";
  const environment = createDefaultEnvironment("prod");
  const viewState: HttpClientViewState = {
    ...createFallbackViewState(),
    config: {
      version: 1,
      collections: [collection],
      requests: [request],
      environments: [environment],
    },
    activeRequestId: request.id,
    activeEnvironmentId: environment.id,
  };
  const uiState = createInitialSidebarUiState();
  uiState.activeTab = "collections";
  uiState.selectedEnvironmentId = environment.id;

  return {
    buildId: "test-build",
    viewState,
    uiState,
    hasHostState: true,
    historyGroups: [],
    collectionGroups: [
      {
        collectionId: collection.id,
        collectionName: collection.name,
        requests: [request],
        expanded: true,
      },
    ],
    favoriteRequests: [request],
    ungroupedRequests: [],
    environmentItems: [
      {
        environment,
        active: true,
      },
    ],
    selectedEnvironment: environment,
    environmentDraft: {
      environmentId: environment.id,
      name: environment.name,
      variables: [{ id: "env-row-1", key: "baseUrl", value: "https://api.example.com" }],
      dirty: false,
    },
    pendingRequestAction: null,
    setActiveTab: (tab) => {
      uiState.activeTab = tab;
    },
    setKeyword: () => undefined,
    toggleHistoryGroup: () => undefined,
    toggleCollectionGroup: () => undefined,
    createRequest: () => undefined,
    createCollection: () => undefined,
    renameCollection: () => undefined,
    deleteCollection: () => undefined,
    createEnvironment: () => undefined,
    selectRequest: () => undefined,
    renameRequest: () => undefined,
    duplicateRequest: () => undefined,
    deleteRequest: () => undefined,
    toggleFavorite: () => undefined,
    selectHistory: () => undefined,
    promptSaveHistoryToCollection: () => undefined,
    saveHistoryToCollection: () => undefined,
    selectEnvironment: () => undefined,
    setEnvironmentDraftName: () => undefined,
    updateEnvironmentVariable: () => undefined,
    addEnvironmentVariable: () => undefined,
    removeEnvironmentVariable: () => undefined,
    saveEnvironment: () => undefined,
    deleteEnvironment: () => undefined,
  };
}

function createHistoryRecord(id: string, url: string, executedAt: string, durationMs: number) {
  return {
    id,
    request: {
      ...createDefaultRequest("获取会员信息"),
      id: "request-member",
      method: "POST" as const,
      url,
    },
    responseSummary: {
      status: 200,
      statusText: "OK",
      durationMs,
      ok: true,
      sizeBytes: 4305,
    },
    environmentId: null,
    executedAt,
  };
}

function findElement(
  root: React.ReactNode,
  predicate: (element: React.ReactElement<Record<string, unknown>>) => boolean
): React.ReactElement<Record<string, unknown>> {
  let matched: React.ReactElement<Record<string, unknown>> | null = null;
  visitNode(root, (element) => {
    if (!matched && predicate(element)) {
      matched = element;
    }
  });
  if (!matched) {
    throw new Error("target element not found");
  }
  return matched;
}

function visitNode(
  node: React.ReactNode,
  visitor: (element: React.ReactElement<Record<string, unknown>>) => void
): void {
  if (Array.isArray(node)) {
    node.forEach((child) => visitNode(child, visitor));
    return;
  }
  if (!React.isValidElement(node)) {
    return;
  }
  const element = node as React.ReactElement<Record<string, unknown>>;
  visitor(element);
  visitNode(element.props.children as React.ReactNode, visitor);
}

function readText(node: React.ReactNode): string {
  if (Array.isArray(node)) {
    return node.map((item) => readText(item)).join("");
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!React.isValidElement(node)) {
    return "";
  }
  return readText((node as React.ReactElement<Record<string, unknown>>).props.children as React.ReactNode);
}

function invokeClick(element: React.ReactElement<Record<string, unknown>>): void {
  const onClick = element.props.onClick;
  assert.equal(typeof onClick, "function");
  (onClick as () => void)();
}

function invokeContextMenu(element: React.ReactElement<Record<string, unknown>>): void {
  const onContextMenu = element.props.onContextMenu;
  assert.equal(typeof onContextMenu, "function");
  (onContextMenu as (event: { preventDefault(): void; stopPropagation(): void }) => void)({
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  });
}
