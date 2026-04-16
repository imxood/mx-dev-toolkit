import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HttpClientViewState, HttpEnvironmentEntity, HttpHistoryRecord, HttpRequestEntity } from "../../../src/http_client/types";
import {
  buildVisibleHistoryRecords,
  type SidebarTab,
  type SidebarUiState,
} from "../shared/sidebar_model";
import type { WorkbenchController } from "../workbench/useWorkbenchController";
import { type SidebarController, useSidebarController } from "./useSidebarController";

interface SidebarViewController {
  buildId: string;
  viewState: HttpClientViewState | null;
  uiState: Pick<SidebarUiState, "activeTab" | "keyword" | "selectedHistoryId" | "selectedEnvironmentId" | "expandedCollectionGroups">;
  hasHostState: boolean;
  historyGroups: SidebarController["historyGroups"];
  collectionGroups: SidebarController["collectionGroups"];
  favoriteRequests: HttpRequestEntity[];
  ungroupedRequests: HttpRequestEntity[];
  environmentItems: SidebarController["environmentItems"];
  selectedEnvironment: HttpEnvironmentEntity | null;
  environmentDraft: SidebarController["environmentDraft"];
  pendingRequestAction: SidebarController["pendingRequestAction"];
  setActiveTab(tab: SidebarTab): void;
  setKeyword(keyword: string): void;
  toggleHistoryGroup(groupKey: string): void;
  toggleCollectionGroup(groupKey: string): void;
  createRequest(collectionId?: string | null): void;
  createCollection(): void;
  renameCollection(collectionId: string): void;
  deleteCollection(collectionId: string): void;
  createEnvironment(): void;
  selectRequest(requestId: string): void;
  renameRequest(requestId: string): void;
  duplicateRequest(requestId: string): void;
  deleteRequest(requestId: string): void;
  toggleFavorite(requestId: string, favorite: boolean): void;
  selectHistory(historyId: string): void;
  promptSaveHistoryToCollection(historyId: string): void;
  saveHistoryToCollection(historyId: string, collectionId: string): void;
  traceHistoryPointerDown?(historyId: string, source: "group-main" | "record-item"): void;
  selectEnvironment(environmentId: string | null): void;
  setEnvironmentDraftName(name: string): void;
  updateEnvironmentVariable(id: string, field: "key" | "value", value: string): void;
  addEnvironmentVariable(): void;
  removeEnvironmentVariable(id: string): void;
  saveEnvironment(): void;
  deleteEnvironment(): void;
}

export interface SidebarContextMenuAction {
  id: string;
  label: string;
  tone?: "default" | "danger";
  onSelect: () => void;
}

export interface SidebarContextMenuState {
  title: string;
  x: number;
  y: number;
  actions: SidebarContextMenuAction[];
}

interface SidebarViewProps {
  controller: SidebarController | WorkbenchController | SidebarViewController;
  menuState?: SidebarContextMenuState | null;
  onRunMenuAction?: (action: SidebarContextMenuAction) => void;
  onCloseMenu?: () => void;
  onTabContextMenu?: (event: React.MouseEvent<HTMLElement>, tab: SidebarTab) => void;
  onCollectionsEmptyContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
  onCollectionContextMenu?: (event: React.MouseEvent<HTMLElement>, collectionId: string) => void;
  onRequestContextMenu?: (event: React.MouseEvent<HTMLElement>, request: HttpRequestEntity) => void;
  onActivityContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
  onHistoryRecordContextMenu?: (event: React.MouseEvent<HTMLElement>, record: HttpHistoryRecord) => void;
  onEnvironmentListContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
  onEnvironmentContextMenu?: (event: React.MouseEvent<HTMLElement>, environment: HttpEnvironmentEntity | null) => void;
  onEnvironmentEditorContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
  onEnvironmentVariableContextMenu?: (event: React.MouseEvent<HTMLElement>, variableId: string) => void;
}

export function SidebarApp(): React.ReactElement {
  const controller = useSidebarController();
  return <SidebarSurface controller={controller} />;
}

export function SidebarSurface({ controller }: { controller: SidebarController | WorkbenchController }): React.ReactElement {
  const adaptedController = useMemo(() => normalizeController(controller), [controller]);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [menuState, setMenuState] = useState<SidebarContextMenuState | null>(null);

  const closeMenu = useCallback(() => {
    setMenuState(null);
  }, []);

  useEffect(() => {
    if (!menuState) {
      return;
    }

    const close = () => {
      setMenuState(null);
    };

    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [menuState]);

  const pushToast = useCallback((message: string, kind: "info" | "success" | "warning" | "error" = "info") => {
    window.__mxToastCenter?.push({
      message,
      kind,
      copyText: message,
    });
  }, []);

  const copyText = useCallback(
    async (text: string, successMessage: string) => {
      try {
        await navigator.clipboard.writeText(text);
        pushToast(successMessage, "success");
      } catch {
        pushToast("复制失败", "error");
      }
    },
    [pushToast]
  );

  const openMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, title: string, actions: SidebarContextMenuAction[]) => {
      event.preventDefault();
      event.stopPropagation();
      if (actions.length === 0) {
        return;
      }

      const position = resolveMenuPosition(event, shellRef.current, actions.length);
      setMenuState({
        title,
        x: position.x,
        y: position.y,
        actions,
      });
    },
    []
  );

  const onRunMenuAction = useCallback(
    (action: SidebarContextMenuAction) => {
      closeMenu();
      action.onSelect();
    },
    [closeMenu]
  );

  const handleTabContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, tab: SidebarTab) => {
      if (tab === "collections") {
        openMenu(event, "集合操作", [
          {
            id: "create-request",
            label: "新建 HTTP 连接",
            onSelect: () => adaptedController.createRequest(),
          },
          {
            id: "create-collection",
            label: "新建集合",
            onSelect: adaptedController.createCollection,
          },
        ]);
        return;
      }

      if (tab === "environments") {
        openMenu(event, "环境操作", [
          {
            id: "create-environment",
            label: "新建环境",
            onSelect: adaptedController.createEnvironment,
          },
          {
            id: "disable-environment",
            label: "不使用环境",
            onSelect: () => adaptedController.selectEnvironment(null),
          },
        ]);
        return;
      }

      openMenu(event, "记录操作", [
        {
          id: "open-latest-history",
          label: "打开最近一条记录",
          onSelect: () => {
            const latest = adaptedController.viewState?.history[0] ?? null;
            if (latest) {
              adaptedController.selectHistory(latest.id);
            }
          },
        },
        {
          id: "clear-filter",
          label: "清空筛选",
          onSelect: () => adaptedController.setKeyword(""),
        },
      ]);
    },
    [adaptedController, openMenu]
  );

  const handleCollectionsEmptyContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      openMenu(event, "集合操作", [
        {
          id: "create-request",
          label: "新建 HTTP 连接",
          onSelect: () => adaptedController.createRequest(),
        },
        {
          id: "create-collection",
          label: "新建集合",
          onSelect: adaptedController.createCollection,
        },
      ]);
    },
    [adaptedController, openMenu]
  );

  const handleCollectionContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, collectionId: string) => {
      openMenu(event, "集合", [
        {
          id: "create-request-in-collection",
          label: "在集合中新建请求",
          onSelect: () => adaptedController.createRequest(collectionId),
        },
        {
          id: "rename-collection",
          label: "重命名集合",
          onSelect: () => adaptedController.renameCollection(collectionId),
        },
        {
          id: "delete-collection",
          label: "删除集合",
          tone: "danger",
          onSelect: () => adaptedController.deleteCollection(collectionId),
        },
      ]);
    },
    [adaptedController, openMenu]
  );

  const handleRequestContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, request: HttpRequestEntity) => {
      openMenu(event, request.name || "请求", [
        {
          id: "open-request",
          label: "在编辑区打开",
          onSelect: () => adaptedController.selectRequest(request.id),
        },
        {
          id: "toggle-favorite",
          label: request.favorite ? "取消收藏" : "加入收藏",
          onSelect: () => adaptedController.toggleFavorite(request.id, !request.favorite),
        },
        {
          id: "duplicate-request",
          label: "复制请求",
          onSelect: () => adaptedController.duplicateRequest(request.id),
        },
        {
          id: "rename-request",
          label: "重命名请求",
          onSelect: () => adaptedController.renameRequest(request.id),
        },
        {
          id: "delete-request",
          label: "删除请求",
          tone: "danger",
          onSelect: () => adaptedController.deleteRequest(request.id),
        },
      ]);
    },
    [adaptedController, openMenu]
  );

  const handleActivityContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      openMenu(event, "记录操作", [
        {
          id: "open-latest-history",
          label: "打开最近一条记录",
          onSelect: () => {
            const latest = adaptedController.viewState?.history[0] ?? null;
            if (latest) {
              adaptedController.selectHistory(latest.id);
            }
          },
        },
        {
          id: "clear-activity-filter",
          label: "清空筛选",
          onSelect: () => adaptedController.setKeyword(""),
        },
      ]);
    },
    [adaptedController, openMenu]
  );

  const handleHistoryRecordContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, record: HttpHistoryRecord) => {
      openMenu(event, "请求记录", [
        {
          id: "open-history-record",
          label: "在编辑区打开",
          onSelect: () => adaptedController.selectHistory(record.id),
        },
        {
          id: "copy-history-url",
          label: "复制请求 URL",
          onSelect: () => {
            void copyText(record.request.url || "", "请求 URL 已复制");
          },
        },
        {
          id: "save-history-to-collection",
          label: "保存到集合...",
          onSelect: () => adaptedController.promptSaveHistoryToCollection(record.id),
        },
      ]);
    },
    [adaptedController, copyText, openMenu]
  );

  const handleEnvironmentListContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      openMenu(event, "环境操作", [
        {
          id: "create-environment",
          label: "新建环境",
          onSelect: adaptedController.createEnvironment,
        },
        {
          id: "disable-environment",
          label: "不使用环境",
          onSelect: () => adaptedController.selectEnvironment(null),
        },
      ]);
    },
    [adaptedController, openMenu]
  );

  const handleEnvironmentContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, environment: HttpEnvironmentEntity | null) => {
      if (!environment) {
        openMenu(event, "环境操作", [
          {
            id: "disable-environment",
            label: "不使用环境",
            onSelect: () => adaptedController.selectEnvironment(null),
          },
          {
            id: "create-environment",
            label: "新建环境",
            onSelect: adaptedController.createEnvironment,
          },
        ]);
        return;
      }

      const isActive = adaptedController.viewState?.activeEnvironmentId === environment.id;
      openMenu(
        event,
        environment.name,
        isActive
          ? [
              {
                id: "save-environment",
                label: "保存环境",
                onSelect: adaptedController.saveEnvironment,
              },
              {
                id: "delete-environment",
                label: "删除环境",
                tone: "danger",
                onSelect: adaptedController.deleteEnvironment,
              },
            ]
          : [
              {
                id: "use-environment",
                label: "使用该环境",
                onSelect: () => adaptedController.selectEnvironment(environment.id),
              },
            ]
      );
    },
    [adaptedController, openMenu]
  );

  const handleEnvironmentEditorContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      openMenu(event, "环境编辑", [
        {
          id: "add-variable",
          label: "新增变量",
          onSelect: adaptedController.addEnvironmentVariable,
        },
        {
          id: "save-environment",
          label: "保存环境",
          onSelect: adaptedController.saveEnvironment,
        },
        {
          id: "delete-environment",
          label: "删除环境",
          tone: "danger",
          onSelect: adaptedController.deleteEnvironment,
        },
      ]);
    },
    [adaptedController, openMenu]
  );

  const handleEnvironmentVariableContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, variableId: string) => {
      const variable = adaptedController.environmentDraft?.variables.find((item) => item.id === variableId) ?? null;
      openMenu(event, variable?.key || "环境变量", [
        {
          id: "copy-variable-key",
          label: "复制变量名",
          onSelect: () => {
            void copyText(variable?.key || "", "变量名已复制");
          },
        },
        {
          id: "delete-variable",
          label: "删除变量",
          tone: "danger",
          onSelect: () => adaptedController.removeEnvironmentVariable(variableId),
        },
      ]);
    },
    [adaptedController, copyText, openMenu]
  );

  return (
    <div ref={shellRef} className="sidebar-surface-root">
      <SidebarView
        controller={adaptedController}
        menuState={menuState}
        onRunMenuAction={onRunMenuAction}
        onCloseMenu={closeMenu}
        onTabContextMenu={handleTabContextMenu}
        onCollectionsEmptyContextMenu={handleCollectionsEmptyContextMenu}
        onCollectionContextMenu={handleCollectionContextMenu}
        onRequestContextMenu={handleRequestContextMenu}
        onActivityContextMenu={handleActivityContextMenu}
        onHistoryRecordContextMenu={handleHistoryRecordContextMenu}
        onEnvironmentListContextMenu={handleEnvironmentListContextMenu}
        onEnvironmentContextMenu={handleEnvironmentContextMenu}
        onEnvironmentEditorContextMenu={handleEnvironmentEditorContextMenu}
        onEnvironmentVariableContextMenu={handleEnvironmentVariableContextMenu}
      />
    </div>
  );
}

export function SidebarView({
  controller,
  menuState = null,
  onRunMenuAction,
  onCloseMenu,
  onTabContextMenu,
  onCollectionsEmptyContextMenu,
  onCollectionContextMenu,
  onRequestContextMenu,
  onActivityContextMenu,
  onHistoryRecordContextMenu,
  onEnvironmentListContextMenu,
  onEnvironmentContextMenu,
  onEnvironmentEditorContextMenu,
  onEnvironmentVariableContextMenu,
}: SidebarViewProps): React.ReactElement {
  const view = normalizeController(controller);
  const { viewState, uiState } = view;

  return (
    <div className="sidebar-shell" data-build-id={view.buildId} data-host-state={view.hasHostState ? "ready" : "fallback"}>
      <div className="sidebar-head">
        <span className="brand">HTTP Client</span>
      </div>

      <button className="primary-button" type="button" onClick={() => view.createRequest()}>
        新建 HTTP 连接
      </button>

      <div className="tab-strip">
        {renderTabButton("activity", "记录", uiState.activeTab, view.setActiveTab, onTabContextMenu)}
        {renderTabButton("collections", "集合", uiState.activeTab, view.setActiveTab, onTabContextMenu)}
        {renderTabButton("environments", "环境", uiState.activeTab, view.setActiveTab, onTabContextMenu)}
      </div>

      <div className="search-bar">
        <input
          className="search-input"
          type="text"
          placeholder={getSearchPlaceholder(uiState.activeTab)}
          value={uiState.keyword}
          onChange={(event) => view.setKeyword(event.target.value)}
        />
      </div>

      <div className="list-panel">
        {renderPanelContent(view, {
          onCollectionsEmptyContextMenu,
          onCollectionContextMenu,
          onRequestContextMenu,
          onActivityContextMenu,
          onHistoryRecordContextMenu,
          onEnvironmentListContextMenu,
          onEnvironmentContextMenu,
          onEnvironmentEditorContextMenu,
          onEnvironmentVariableContextMenu,
        })}
      </div>

      {menuState ? (
        <div className="context-menu-layer" onClick={onCloseMenu}>
          <div className="context-menu" style={{ left: menuState.x, top: menuState.y }} onClick={(event) => event.stopPropagation()}>
            <div className="context-menu-title">{menuState.title}</div>
            {menuState.actions.map((action) => (
              <button key={action.id} type="button" className={`context-menu-item${action.tone === "danger" ? " danger" : ""}`} onClick={() => onRunMenuAction?.(action)}>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderTabButton(
  tab: SidebarTab,
  label: string,
  activeTab: SidebarTab,
  onClick: (tab: SidebarTab) => void,
  onContextMenu?: (event: React.MouseEvent<HTMLElement>, tab: SidebarTab) => void
): React.ReactElement {
  return (
    <button className={`tab-button${activeTab === tab ? " active" : ""}`} type="button" onClick={() => onClick(tab)} onContextMenu={onContextMenu ? (event) => onContextMenu(event, tab) : undefined}>
      {label}
    </button>
  );
}

function renderPanelContent(
  controller: SidebarViewController,
  events: Pick<
    SidebarViewProps,
    | "onCollectionsEmptyContextMenu"
    | "onCollectionContextMenu"
    | "onRequestContextMenu"
    | "onActivityContextMenu"
    | "onHistoryRecordContextMenu"
    | "onEnvironmentListContextMenu"
    | "onEnvironmentContextMenu"
    | "onEnvironmentEditorContextMenu"
    | "onEnvironmentVariableContextMenu"
  >
): React.ReactElement {
  if (!controller.viewState) {
    return (
      <>
        <div className="panel-head">
          <div className="panel-head-main">
            <span className="panel-head-title">加载中</span>
          </div>
        </div>
        <div className="list-body">
          <div className="empty-state">加载中</div>
        </div>
      </>
    );
  }

  if (controller.uiState.activeTab === "collections") {
    return renderCollectionsPanel(controller, events.onCollectionsEmptyContextMenu, events.onCollectionContextMenu, events.onRequestContextMenu);
  }

  if (controller.uiState.activeTab === "environments") {
    return renderEnvironmentsPanel(
      controller,
      events.onEnvironmentListContextMenu,
      events.onEnvironmentContextMenu,
      events.onEnvironmentEditorContextMenu,
      events.onEnvironmentVariableContextMenu
    );
  }

  return renderActivityPanel(controller, events.onActivityContextMenu, events.onHistoryRecordContextMenu);
}

function renderCollectionsPanel(
  controller: SidebarViewController,
  onEmptyContextMenu?: (event: React.MouseEvent<HTMLElement>) => void,
  onCollectionContextMenu?: (event: React.MouseEvent<HTMLElement>, collectionId: string) => void,
  onRequestContextMenu?: (event: React.MouseEvent<HTMLElement>, request: HttpRequestEntity) => void
): React.ReactElement {
  const activeRequestId = controller.viewState?.activeRequestId ?? null;
  const ungroupedExpanded = controller.uiState.expandedCollectionGroups["__ungrouped__"] !== false;
  const noResult = controller.collectionGroups.length === 0 && controller.ungroupedRequests.length === 0;
  const hasKeyword = controller.uiState.keyword.trim().length > 0;

  return (
    <>
      <div className="panel-head">
        <div className="panel-head-main">
          <span className="panel-head-title">集合</span>
        </div>
      </div>
      <div className="list-body" onContextMenu={onEmptyContextMenu}>
        {noResult ? (
          renderEmptyState(hasKeyword ? "没有匹配的请求" : "还没有任何 HTTP 请求", !hasKeyword, controller)
        ) : (
          <div className="compact-request-list">
            {controller.collectionGroups.map((group) => (
              <section className="group" key={group.collectionId}>
                <div className="group-title" onContextMenu={onCollectionContextMenu ? (event) => onCollectionContextMenu(event, group.collectionId) : undefined}>
                  <button className="group-title-button" type="button" onClick={() => controller.toggleCollectionGroup(group.collectionId)}>
                    <div className="group-title-main">
                      <span>{group.collectionName}</span>
                      <span className="group-count">{group.requests.length}</span>
                    </div>
                    <span className="group-title-toggle" aria-hidden="true">
                      {group.expanded ? "收起" : "展开"}
                    </span>
                  </button>
                </div>
                {group.expanded ? (
                  <div className="group-items">
                    {group.requests.length === 0 ? (
                      <div className="empty-state compact-empty">暂无请求</div>
                    ) : (
                      group.requests.map((request) => renderRequestRow(request, activeRequestId, controller, onRequestContextMenu))
                    )}
                  </div>
                ) : null}
              </section>
            ))}

            {controller.ungroupedRequests.length > 0 ? (
              <section className="group">
                <div className="group-title">
                  <button className="group-title-button" type="button" onClick={() => controller.toggleCollectionGroup("__ungrouped__")}>
                    <div className="group-title-main">
                      <span>未分组</span>
                      <span className="group-count">{controller.ungroupedRequests.length}</span>
                    </div>
                    <span className="group-title-toggle" aria-hidden="true">
                      {ungroupedExpanded ? "收起" : "展开"}
                    </span>
                  </button>
                </div>
                {ungroupedExpanded ? (
                  <div className="group-items">
                    {controller.ungroupedRequests.map((request) => renderRequestRow(request, activeRequestId, controller, onRequestContextMenu))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

function renderEnvironmentsPanel(
  controller: SidebarViewController,
  onEnvironmentListContextMenu?: (event: React.MouseEvent<HTMLElement>) => void,
  onEnvironmentContextMenu?: (event: React.MouseEvent<HTMLElement>, environment: HttpEnvironmentEntity | null) => void,
  onEnvironmentEditorContextMenu?: (event: React.MouseEvent<HTMLElement>) => void,
  onEnvironmentVariableContextMenu?: (event: React.MouseEvent<HTMLElement>, variableId: string) => void
): React.ReactElement {
  const activeEnvironmentId = controller.viewState?.activeEnvironmentId ?? null;
  const draft = controller.environmentDraft;

  return (
    <>
      <div className="panel-head">
        <div className="panel-head-main">
          <span className="panel-head-title">环境</span>
        </div>
      </div>
      <div className="list-body" onContextMenu={onEnvironmentListContextMenu}>
        <section className="group">
          <div className="group-title">
            <div className="group-title-main">
              <span>环境列表</span>
              <span className="group-count">{controller.environmentItems.length}</span>
            </div>
          </div>
          <div className="group-items">
            <button
              className={`environment-item${!activeEnvironmentId ? " active" : ""}`}
              type="button"
              onClick={() => controller.selectEnvironment(null)}
              onContextMenu={onEnvironmentContextMenu ? (event) => onEnvironmentContextMenu(event, null) : undefined}
            >
              <div className="environment-main">
                <span>不使用环境</span>
                <small>直接发送原始 URL 与 Header</small>
              </div>
            </button>
            {controller.environmentItems.map(({ environment, active }) => (
              <button
                key={environment.id}
                className={`environment-item${active ? " active" : ""}`}
                type="button"
                onClick={() => controller.selectEnvironment(environment.id)}
                onContextMenu={onEnvironmentContextMenu ? (event) => onEnvironmentContextMenu(event, environment) : undefined}
              >
                <div className="environment-main">
                  <span>{environment.name}</span>
                  <small>{Object.keys(environment.variables).length} 个变量</small>
                </div>
              </button>
            ))}
          </div>
        </section>

        {draft ? (
          <section className="environment-editor-card" onContextMenu={onEnvironmentEditorContextMenu}>
            <div className="environment-editor-head">
              <div className="group-title-main">
                <span>环境编辑</span>
                <span className={`row-inline-badge${draft.dirty ? "" : " subtle"}`}>{draft.dirty ? "未保存" : "已同步"}</span>
              </div>
            </div>
            <label className="environment-field">
              <span>名称</span>
              <input type="text" value={draft.name} onChange={(event) => controller.setEnvironmentDraftName(event.target.value)} />
            </label>
            <div className="environment-variable-list">
              {draft.variables.map((item) => (
                <div key={item.id} className="environment-variable-row" onContextMenu={onEnvironmentVariableContextMenu ? (event) => onEnvironmentVariableContextMenu(event, item.id) : undefined}>
                  <input type="text" value={item.key} placeholder="变量名" onChange={(event) => controller.updateEnvironmentVariable(item.id, "key", event.target.value)} />
                  <input type="text" value={item.value} placeholder="变量值" onChange={(event) => controller.updateEnvironmentVariable(item.id, "value", event.target.value)} />
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className="empty-state compact-empty">右键环境页可新建环境</div>
        )}
      </div>
    </>
  );
}

function renderActivityPanel(
  controller: SidebarViewController,
  onActivityContextMenu?: (event: React.MouseEvent<HTMLElement>) => void,
  onHistoryRecordContextMenu?: (event: React.MouseEvent<HTMLElement>, record: HttpHistoryRecord) => void
): React.ReactElement {
  const viewState = controller.viewState;
  const visibleHistoryRecords = viewState
    ? buildVisibleHistoryRecords(viewState, controller.uiState.keyword, controller.uiState.selectedHistoryId)
    : [];
  return (
    <>
      <div className="panel-head">
        <div className="panel-head-main">
          <span className="panel-head-title">记录</span>
        </div>
      </div>
      <div className="list-body" onContextMenu={onActivityContextMenu}>
        {visibleHistoryRecords.length === 0
          ? renderEmptyState(viewState?.history.length === 0 ? "暂无历史记录" : "没有匹配的历史记录", viewState?.history.length === 0, controller)
          : (
              <div className="compact-request-list">
                {visibleHistoryRecords.map(({ record, active }) => (
                  <button
                    key={record.id}
                    className={`list-item compact-request-item${active ? " active" : ""}`}
                    type="button"
                    onPointerDown={(event) => {
                      if (!shouldHandlePrimaryPointerDown(event)) {
                        return;
                      }
                      controller.traceHistoryPointerDown?.(record.id, "record-item");
                      controller.selectHistory(record.id);
                    }}
                    onClick={(event) => {
                      if (shouldHandleKeyboardClick(event)) {
                        controller.selectHistory(record.id);
                      }
                    }}
                    onContextMenu={onHistoryRecordContextMenu ? (event) => onHistoryRecordContextMenu(event, record) : undefined}
                  >
                    <div className="compact-request-row">
                      <span className={`method-pill method-${record.request.method.toLowerCase()}`}>{record.request.method}</span>
                      <span className="compact-request-url">{record.request.url || "未填写 URL"}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
      </div>
    </>
  );
}

function renderRequestRow(
  request: HttpRequestEntity,
  activeRequestId: string | null,
  controller: SidebarViewController,
  onRequestContextMenu?: (event: React.MouseEvent<HTMLElement>, request: HttpRequestEntity) => void
): React.ReactElement {
  const pending = controller.pendingRequestAction?.requestId === request.id;
  return (
    <div className={`request-row${activeRequestId === request.id ? " active" : ""}${pending ? " pending" : ""}`}>
      <button
        className={`collection-item${activeRequestId === request.id ? " active" : ""}`}
        type="button"
        onPointerDown={(event) => {
          if (shouldHandlePrimaryPointerDown(event)) {
            controller.selectRequest(request.id);
          }
        }}
        onClick={(event) => {
          if (shouldHandleKeyboardClick(event)) {
            controller.selectRequest(request.id);
          }
        }}
        onContextMenu={onRequestContextMenu ? (event) => onRequestContextMenu(event, request) : undefined}
      >
        <div className="collection-main compact-request-row">
          <span className={`method-pill method-${request.method.toLowerCase()}`}>{request.method}</span>
          <span className="compact-request-url">{request.url || "未填写 URL"}</span>
        </div>
      </button>
      {pending ? <span className="request-action-status">{controller.pendingRequestAction?.kind === "delete" ? "删除中" : "复制中"}</span> : null}
    </div>
  );
}

function renderEmptyState(title: string, allowCreateCollection: boolean, controller: SidebarViewController): React.ReactElement {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      <div>点击上方按钮创建请求. 其它操作可通过右键菜单完成.</div>
      <div className="empty-actions">
        <button className="primary-button inline-primary" type="button" onClick={() => controller.createRequest()}>
          新建 HTTP 连接
        </button>
        {allowCreateCollection ? (
          <button className="ghost-button" type="button" onClick={controller.createCollection}>
            新建集合
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getSearchPlaceholder(activeTab: SidebarTab): string {
  if (activeTab === "collections") {
    return "筛选集合或请求";
  }

  if (activeTab === "environments") {
    return "筛选环境";
  }

  return "筛选最近记录";
}

function normalizeController(controller: SidebarController | WorkbenchController | SidebarViewController): SidebarViewController {
  if ("setActiveTab" in controller) {
    return controller;
  }

  return {
    buildId: controller.buildId,
    viewState: controller.viewState,
    uiState: controller.sidebarUiState,
    hasHostState: controller.hasHostState,
    historyGroups: controller.historyGroups,
    collectionGroups: controller.collectionGroups,
    favoriteRequests: controller.favoriteRequests,
    ungroupedRequests: controller.ungroupedRequests,
    environmentItems: controller.environmentItems,
    selectedEnvironment: controller.selectedEnvironment,
    environmentDraft: controller.environmentDraft,
    pendingRequestAction: controller.pendingRequestAction,
    setActiveTab: controller.setSidebarTab,
    setKeyword: controller.setSidebarKeyword,
    toggleHistoryGroup: controller.toggleHistoryGroup,
    toggleCollectionGroup: controller.toggleCollectionGroup,
    createRequest: controller.createRequest,
    createCollection: controller.createCollection,
    renameCollection: controller.renameCollection,
    deleteCollection: controller.deleteCollection,
    createEnvironment: controller.createEnvironment,
    selectRequest: controller.selectRequest,
    renameRequest: controller.renameRequest,
    duplicateRequest: controller.duplicateRequest,
    deleteRequest: controller.deleteRequest,
    toggleFavorite: controller.toggleFavorite,
    selectHistory: controller.selectHistory,
    promptSaveHistoryToCollection: controller.promptSaveHistoryToCollection,
    saveHistoryToCollection: controller.saveHistoryToCollection,
    traceHistoryPointerDown: "traceHistoryPointerDown" in controller ? controller.traceHistoryPointerDown : undefined,
    selectEnvironment: controller.selectEnvironment,
    setEnvironmentDraftName: controller.setEnvironmentDraftName,
    updateEnvironmentVariable: controller.updateEnvironmentVariable,
    addEnvironmentVariable: controller.addEnvironmentVariable,
    removeEnvironmentVariable: controller.removeEnvironmentVariable,
    saveEnvironment: controller.saveEnvironment,
    deleteEnvironment: controller.deleteEnvironment,
  };
}

function shouldHandlePrimaryPointerDown(event: React.PointerEvent<HTMLElement>): boolean {
  return event.button === 0;
}

function shouldHandleKeyboardClick(event: React.MouseEvent<HTMLElement>): boolean {
  return event.detail === 0;
}

function resolveMenuPosition(event: React.MouseEvent<HTMLElement>, root: HTMLDivElement | null, actionCount: number): { x: number; y: number } {
  const rect = root?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const menuWidth = 188;
  const menuHeight = 34 + actionCount * 32;
  const padding = 8;
  const rawX = event.clientX - rect.left;
  const rawY = event.clientY - rect.top;
  const maxX = Math.max(padding, rect.width - menuWidth - padding);
  const maxY = Math.max(padding, rect.height - menuHeight - padding);

  return {
    x: Math.min(Math.max(rawX, padding), maxX),
    y: Math.min(Math.max(rawY, padding), maxY),
  };
}
