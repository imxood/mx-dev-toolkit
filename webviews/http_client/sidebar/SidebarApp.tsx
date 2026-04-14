import React from "react";
import type { HttpRequestEntity } from "../../../src/http_client/types";
import {
  formatClock,
  getHistoryStatusClass,
  getHistoryStatusText,
  relativeTime,
  type SidebarTab,
} from "../shared/sidebar_model";
import { useSidebarController } from "./useSidebarController";

export function SidebarApp(): React.ReactElement {
  const controller = useSidebarController();
  const { viewState, uiState } = controller;

  return (
    <div className="sidebar-shell" data-build-id={controller.buildId} data-host-state={controller.hasHostState ? "ready" : "fallback"}>
      <div className="sidebar-head">
        <span className="brand">HTTP Client</span>
      </div>

      <button className="primary-button" type="button" onClick={() => controller.createRequest()}>
        新建 HTTP 连接
      </button>

      <div className="tab-strip">
        {renderTabButton("activity", "记录", uiState.activeTab, controller.setActiveTab)}
        {renderTabButton("collections", "集合", uiState.activeTab, controller.setActiveTab)}
        {renderTabButton("environments", "环境", uiState.activeTab, controller.setActiveTab)}
      </div>

      <div className="search-bar">
        <input
          className="search-input"
          type="text"
          placeholder={getSearchPlaceholder(uiState.activeTab)}
          value={uiState.keyword}
          onChange={(event) => controller.setKeyword(event.target.value)}
        />
      </div>

      <div className="list-panel">{renderPanelContent(controller, viewState)}</div>
    </div>
  );
}

function renderTabButton(
  tab: SidebarTab,
  label: string,
  activeTab: SidebarTab,
  onClick: (tab: SidebarTab) => void
): React.ReactElement {
  return (
    <button className={`tab-button${activeTab === tab ? " active" : ""}`} type="button" onClick={() => onClick(tab)}>
      {label}
    </button>
  );
}

function renderPanelContent(
  controller: ReturnType<typeof useSidebarController>,
  viewState: ReturnType<typeof useSidebarController>["viewState"]
): React.ReactElement {
  if (!viewState) {
    return (
      <>
        <div className="panel-head">
          <div className="panel-head-main">
            <span className="panel-head-title">Loading</span>
          </div>
        </div>
        <div className="list-body">
          <div className="empty-state">加载中</div>
        </div>
      </>
    );
  }

  if (controller.uiState.activeTab === "collections") {
    return renderCollectionsPanel(controller, viewState.activeRequestId);
  }

  if (controller.uiState.activeTab === "environments") {
    return renderEnvironmentsPanel(controller, viewState.activeEnvironmentId);
  }

  return renderActivityPanel(controller, viewState);
}

function renderCollectionsPanel(
  controller: ReturnType<typeof useSidebarController>,
  activeRequestId: string | null
): React.ReactElement {
  const noResult = controller.collectionGroups.length === 0 && controller.ungroupedRequests.length === 0;
  const hasKeyword = controller.uiState.keyword.trim().length > 0;

  return (
    <>
      <div className="panel-head">
        <div className="panel-head-main">
          <span className="panel-head-title">集合</span>
          <span className="panel-head-subtitle">浏览请求集合</span>
        </div>
        <button className="icon-button" type="button" onClick={controller.createCollection}>
          +
        </button>
      </div>
      <div className="list-body">
        {noResult ? (
          renderEmptyState(hasKeyword ? "没有匹配的请求" : "还没有任何 HTTP 请求", !hasKeyword, controller)
        ) : (
          <>
            {controller.collectionGroups.map((group) => (
              <div className="group" key={group.collectionId}>
                <div className="group-title">
                  <span>{group.collectionName}</span>
                  <button type="button" onClick={() => controller.createRequest(group.collectionId)}>
                    +
                  </button>
                </div>
                <div className="group-items">
                  {group.requests.length === 0 ? (
                    <div className="empty-state compact-empty">暂无请求</div>
                  ) : (
                    group.requests.map((request) => renderRequestButton(request, activeRequestId, controller.selectRequest))
                  )}
                </div>
              </div>
            ))}
            {controller.ungroupedRequests.length > 0 ? (
              <div className="group">
                <div className="group-title">
                  <span>未分组</span>
                </div>
                <div className="group-items">
                  {controller.ungroupedRequests.map((request) => renderRequestButton(request, activeRequestId, controller.selectRequest))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function renderEnvironmentsPanel(
  controller: ReturnType<typeof useSidebarController>,
  activeEnvironmentId: string | null
): React.ReactElement {
  return (
    <>
      <div className="panel-head">
        <div className="panel-head-main">
          <span className="panel-head-title">环境</span>
          <span className="panel-head-subtitle">切换当前环境</span>
        </div>
        <button className="icon-button" type="button" onClick={controller.createEnvironment}>
          +
        </button>
      </div>
      <div className="list-body">
        <div className="group">
          <div className="group-title">
            <span>当前环境</span>
            <button type="button" onClick={controller.createEnvironment}>
              +
            </button>
          </div>
          <div className="group-items">
            <button className={`environment-item${!activeEnvironmentId ? " active" : ""}`} type="button" onClick={() => controller.selectEnvironment(null)}>
              <div className="environment-main">
                <span>不使用环境</span>
                <small>直接使用原始 URL 和 Header</small>
              </div>
            </button>
            {controller.environmentItems.map(({ environment, active }) => (
              <button
                key={environment.id}
                className={`environment-item${active ? " active" : ""}`}
                type="button"
                onClick={() => controller.selectEnvironment(environment.id)}
              >
                <div className="environment-main">
                  <span>{environment.name}</span>
                  <small>{Object.keys(environment.variables).length} 个变量</small>
                </div>
              </button>
            ))}
          </div>
        </div>
        {controller.environmentItems.length === 0 && controller.uiState.keyword.trim() ? renderEmptyState("没有匹配的环境", false, controller) : null}
      </div>
    </>
  );
}

function renderActivityPanel(
  controller: ReturnType<typeof useSidebarController>,
  viewState: NonNullable<ReturnType<typeof useSidebarController>["viewState"]>
): React.ReactElement {
  return (
    <>
      <div className="panel-head">
        <div className="panel-head-main">
          <span className="panel-head-title">最近请求记录</span>
          <span className="panel-head-subtitle">30 条</span>
        </div>
      </div>
      <div className="list-body">
        {controller.historyGroups.length === 0
          ? renderEmptyState(viewState.history.length === 0 ? "暂无历史记录" : "没有匹配的历史记录", viewState.history.length === 0, controller)
          : controller.historyGroups.map((group) => {
              const statusText = getHistoryStatusText(group.latestRecord);
              const statusClass = getHistoryStatusClass(group.latestRecord);
              const overflowCount = Math.max(0, group.totalCount - 3);
              return (
                <div key={group.key} className={`history-group-card${group.active ? " active" : ""}`}>
                  <div className="history-group-head">
                    <button className="history-group-main" type="button" onClick={() => controller.selectHistory(group.latestRecord.id)}>
                      <div className="history-group-top">
                        <span className={`method-pill method-${group.method.toLowerCase()}`}>{group.method}</span>
                        <span className="history-group-title">{group.title}</span>
                        <span className="history-group-count">{group.totalCount} 次</span>
                      </div>
                      <div className="history-group-url">{group.latestUrl || "未填写 URL"}</div>
                      <div className="history-group-meta">
                        <span className={`status-pill ${statusClass}`}>{statusText}</span>
                        <span>{group.latestRecord.responseSummary.durationMs} ms</span>
                        <span>{relativeTime(group.latestRecord.executedAt)}</span>
                      </div>
                    </button>
                    <button className="icon-button history-group-toggle" type="button" onClick={() => controller.toggleHistoryGroup(group.key)}>
                      {group.expanded ? "−" : "+"}
                    </button>
                  </div>
                  {group.expanded ? (
                    <div className="history-group-items">
                      {group.records.slice(0, 3).map((record, index) => (
                        <button
                          key={record.id}
                          className={`history-record-item${index === 0 ? " latest" : ""}`}
                          type="button"
                          onClick={() => controller.selectHistory(record.id)}
                        >
                          <div className="history-record-top">
                            <span className={`status-pill ${getHistoryStatusClass(record)}`}>{getHistoryStatusText(record)}</span>
                            <div className="history-record-meta">
                              <span>{record.responseSummary.durationMs} ms</span>
                              <span>{formatClock(record.executedAt)}</span>
                            </div>
                          </div>
                          <div className="history-record-caption">{record.request.url || "未填写 URL"}</div>
                        </button>
                      ))}
                      {overflowCount > 0 ? <div className="history-record-more">还有 {overflowCount} 条较早记录</div> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
      </div>
    </>
  );
}

function renderRequestButton(
  request: HttpRequestEntity,
  activeRequestId: string | null,
  onSelect: (requestId: string) => void
): React.ReactElement {
  return (
    <button className={`collection-item${activeRequestId === request.id ? " active" : ""}`} type="button" onClick={() => onSelect(request.id)}>
      <div className="collection-main">
        <span className={`method-pill method-${request.method.toLowerCase()}`}>{request.method}</span>
        <div style={{ minWidth: 0 }}>
          <div className="item-title">{request.name}</div>
          <div className="item-subtitle">{request.url || "未填写 URL"}</div>
        </div>
      </div>
    </button>
  );
}

function renderEmptyState(
  title: string,
  allowCreateCollection: boolean,
  controller: ReturnType<typeof useSidebarController>
): React.ReactElement {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      <div>点击按钮创建第一个请求, 然后在主工作台中编辑并发送.</div>
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

  return "筛选历史记录";
}
