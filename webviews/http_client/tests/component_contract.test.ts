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

  controller.viewState.draft = createDefaultRequest("临时草稿");
  controller.viewState.activeRequestId = controller.viewState.draft.id;

  await logger.step("标题行应已移除, 且发送按钮应并入 METHOD/URL 同一行");
  const chromeTree = AppView({ controller, elapsedMs: 0 });
  assert.throws(() => findElement(chromeTree, (element) => element.props.className === "toolbar-title-row"));
  const toolbarMain = findElement(chromeTree, (element) => element.props.className === "toolbar-main");
  assert.equal(findElement(toolbarMain.props.children as React.ReactNode, (element) => element.props.id === "send-button").props.id, "send-button");
  const toolbarSecondary = findElement(chromeTree, (element) => element.props.className === "toolbar-secondary");
  assert.equal(findElement(toolbarSecondary.props.children as React.ReactNode, (element) => element.props.className === "toolbar-secondary-actions").props.className, "toolbar-secondary-actions");
  assert.equal(findElement(toolbarSecondary.props.children as React.ReactNode, (element) => readText(element.props.children as React.ReactNode) === "说明").props.className, "ghost-button toolbar-help-button");

  await logger.step("未运行压测时, 顶部主按钮应触发 performLoadTest");
  const idleTree = AppView({ controller, elapsedMs: 0 });
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
  const runningTree = AppView({ controller, elapsedMs: 0 });
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
      startedAt: new Date().toISOString(),
      durationMs: 0,
      sizeBytes: 0,
      finalUrl: "",
      redirected: false,
      contentType: "text/plain",
      unresolvedVariables: [],
      environmentId: null,
    },
  };

  invokeClick(findElement(AppView({ controller, elapsedMs: 0 }), (element) => element.props.id === "response-open-editor"));
  assert.equal(openResponseEditorCalls, 1);

  await logger.conclusion("工作台标题栏, 发送按钮布局和响应渲染契约已得到自动化保护");
});

test("component_contract: 侧边栏集合页应显示紧凑请求行和默认集合锁标", async () => {
  const logger = await createTestLogger("http_client_component_contract.txt");
  await logger.flow("验证 React 侧边栏集合页已切到 2 tab + 紧凑请求行 + 默认集合锁标");

  const actions = {
    requestMenu: 0,
    collectionMenu: 0,
    environmentMenu: 0,
    variableMenu: 0,
  };
  const controller = createSidebarController(actions);

  await logger.step("集合页应显示 sidebar-shell 容器, 2 个 tab 和集合列表");
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
    findElement(collectionsTree, (element) => element.props.className === "sidebar-shell").props.className,
    "sidebar-shell"
  );
  assert.equal(
    findElement(collectionsTree, (element) => element.props.className === "tab-button active").props.className,
    "tab-button active"
  );

  await logger.step("环境页应继续渲染编辑卡片, 并允许环境项接入右键菜单");
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
  invokeContextMenu(findElement(environmentsTree, (element) => element.props.className === "environment-item active"));
  assert.equal(actions.environmentMenu, 1);

  await logger.conclusion("集合页, 环境页和右键入口已得到自动化保护");
});

function createWorkbenchController(): WorkbenchController {
  const viewState = createFallbackViewState();
  const collection = createDefaultCollection("默认集合");
  collection.isDefault = true;
  const request = createDefaultRequest("契约测试");
  collection.requests = [request];
  const environment = createDefaultEnvironment("default");
  viewState.config = {
    version: 2,
    collections: [collection],
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
    collectionGroups: [
      {
        collectionId: collection.id,
        collectionName: collection.name,
        isDefault: true,
        requests: [request],
        expanded: true,
      },
    ],
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
    exportCurl: () => undefined,
    moveRequest: () => undefined,
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
    formatResponseJson: () => true,
    setResponseSearch: () => undefined,
    toggleResponsePretty: () => undefined,
    performSend: () => undefined,
    performSave: () => undefined,
    cancelRequest: () => undefined,
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
  collection.isDefault = true;
  const request = createDefaultRequest("获取会员信息");
  request.method = "POST";
  request.url = "https://api.example.com/member";
  collection.requests = [request];
  const environment = createDefaultEnvironment("prod");
  const viewState: HttpClientViewState = {
    ...createFallbackViewState(),
    config: {
      version: 2,
      collections: [collection],
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
    collectionGroups: [
      {
        collectionId: collection.id,
        collectionName: collection.name,
        isDefault: true,
        requests: [request],
        expanded: true,
      },
    ],
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
    exportCurl: () => undefined,
    moveRequest: () => undefined,
    selectEnvironment: () => undefined,
    setEnvironmentDraftName: () => undefined,
    updateEnvironmentVariable: () => undefined,
    addEnvironmentVariable: () => undefined,
    removeEnvironmentVariable: () => undefined,
    saveEnvironment: () => undefined,
    deleteEnvironment: () => undefined,
    void: actions,
  } as SidebarController & { void: unknown };
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
  if (node === null || node === undefined || typeof node === "boolean") {
    return;
  }
  if (typeof node === "string" || typeof node === "number") {
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
