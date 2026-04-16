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

test("component_contract: 工作台压测按钮与响应区保持正确接线", async () => {
  const logger = await createTestLogger("http_client_component_contract.txt");
  await logger.flow("验证 React 工作台的主操作按钮接线与响应正文渲染契约");

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

  await logger.step("主工作台应移除旧提示文案, 并暴露说明按钮");
  const chromeTree = AppView({ controller });
  assert.throws(() => findElement(chromeTree, (element) => readText(element.props.children as React.ReactNode) === "Editor"));
  assert.throws(() => findElement(chromeTree, (element) => readText(element.props.children as React.ReactNode) === "Ctrl+Enter 发送"));
  assert.equal(findElement(chromeTree, (element) => readText(element.props.children as React.ReactNode) === "说明").props.className, "ghost-button toolbar-help-button");

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

  await logger.step("选中历史记录时, URL 编辑区应显示对应序号");
  controller.viewState.selectedHistoryId = "history-2";
  controller.viewState.history = [
    createHistoryRecord("history-1", "https://api.example.com/member", "2026-04-14T08:00:00.000Z", 47),
    createHistoryRecord("history-2", "https://api.example.com/member-retry", "2026-04-14T07:59:00.000Z", 58),
  ];
  const historyTree = AppView({ controller });
  assert.equal(
    findElement(
      historyTree,
      (element) =>
        element.props.className === "request-context-pill request-context-pill-history" &&
        readText(element.props.children as React.ReactNode) === "记录 #2"
    ).props.className,
    "request-context-pill request-context-pill-history"
  );

  await logger.conclusion("工作台主按钮与响应渲染契约已得到自动化保护");
});

test("component_contract: 侧边栏应暴露右键菜单入口与环境编辑界面", async () => {
  const logger = await createTestLogger("http_client_component_contract.txt");
  await logger.flow("验证 React 侧边栏已暴露右键菜单入口, 收藏区和环境编辑区");

  const actions = {
    requestMenu: 0,
    collectionMenu: 0,
    environmentMenu: 0,
    variableMenu: 0,
  };
  const controller = createSidebarController(actions);

  await logger.step("集合页应显示收藏分组, 并允许集合标题和请求行接入右键菜单");
  const collectionsTree = SidebarView({
    controller,
    onCollectionContextMenu: () => {
      actions.collectionMenu += 1;
    },
    onRequestContextMenu: () => {
      actions.requestMenu += 1;
    },
  });
  assert.equal(
    findElement(
      collectionsTree,
      (element) => element.props.className === "group-title-main" && readText(element.props.children as React.ReactNode).includes("收藏")
    ).props.className,
    "group-title-main"
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

  await logger.step("环境页应渲染编辑卡片, 并允许环境项和变量行接入右键菜单");
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

  await logger.conclusion("侧边栏右键入口, 收藏区和环境编辑区已得到自动化保护");
});

test("component_contract: 记录页不应重复渲染最新记录, 且旧记录应有明确选中态", async () => {
  const logger = await createTestLogger("http_client_component_contract.txt");
  await logger.flow("验证 React 侧边栏记录页的去重展示和选中态契约");

  const actions = {
    requestMenu: 0,
    collectionMenu: 0,
    environmentMenu: 0,
    variableMenu: 0,
  };
  const controller = createSidebarController(actions);
  controller.uiState.activeTab = "activity";
  controller.historyGroups = [
    {
      key: "request:member",
      requestId: "request-member",
      title: "获取会员信息",
      method: "POST",
      latestUrl: "https://api.example.com/member",
      latestRecord: createHistoryRecord("history-1", "https://api.example.com/member", "2026-04-14T08:00:00.000Z", 47),
      records: [
        createHistoryRecord("history-1", "https://api.example.com/member", "2026-04-14T08:00:00.000Z", 47),
        createHistoryRecord("history-2", "https://api.example.com/member-retry", "2026-04-14T07:59:00.000Z", 58),
      ],
      totalCount: 2,
      expanded: true,
      active: true,
      activeRecordId: "history-2",
    },
  ];

  await logger.step("最新记录摘要只应在组头出现一次");
  const tree = SidebarView({ controller });
  assert.equal(countElementsWithText(tree, "history-group-url", "https://api.example.com/member"), 1);
  assert.equal(countElementsWithText(tree, "history-record-caption", "https://api.example.com/member"), 0);

  await logger.step("最新记录应显示序号, 方便与编辑区上下文保持一致");
  assert.equal(findElement(tree, (element) => readText(element.props.children as React.ReactNode) === "#1").props.className, "history-order-pill");

  await logger.step("旧记录被选中时, 子项应携带 active class");
  const activeHistoryItem = findElement(tree, (element) => element.props.className === "history-record-item active");
  assert.equal(readText(activeHistoryItem.props.children as React.ReactNode).includes("https://api.example.com/member-retry"), true);

  await logger.conclusion("记录页的去重和选中态输出稳定");
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
  environmentMenu: number;
  variableMenu: number;
}): SidebarController {
  const collection = createDefaultCollection("默认集合");
  const request = createDefaultRequest("获取会员信息", collection.id);
  request.favorite = true;
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

function countElementsWithText(node: React.ReactNode, className: string, expectedText: string): number {
  let count = 0;
  visitNode(node, (element) => {
    if (element.props.className !== className) {
      return;
    }
    if (readText(element.props.children as React.ReactNode) === expectedText) {
      count += 1;
    }
  });
  return count;
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
