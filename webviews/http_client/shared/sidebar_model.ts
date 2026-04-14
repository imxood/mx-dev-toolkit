import type {
  HttpClientConfigFile,
  HttpClientViewState,
  HttpEnvironmentEntity,
  HttpHistoryRecord,
  HttpRequestEntity,
} from "../../../src/http_client/types";
import type { ToastToWebviewMessage } from "../../../src/toast/types";

export type SidebarTab = "activity" | "collections" | "environments";

export interface SidebarUiState {
  activeTab: SidebarTab;
  keyword: string;
  expandedHistoryGroups: Record<string, boolean>;
}

export type SidebarToExtensionMessage =
  | { type: "httpClientSidebar/init" }
  | { type: "httpClientSidebar/createRequest"; payload?: { collectionId?: string | null } }
  | { type: "httpClientSidebar/createCollection" }
  | { type: "httpClientSidebar/createEnvironment" }
  | { type: "httpClientSidebar/selectRequest"; payload: { requestId: string } }
  | { type: "httpClientSidebar/selectHistory"; payload: { historyId: string } }
  | { type: "httpClientSidebar/selectEnvironment"; payload: { environmentId: string | null } };

export type ExtensionToSidebarMessage =
  | { type: "httpClientSidebar/state"; payload: HttpClientViewState }
  | ToastToWebviewMessage;

export interface SidebarHistoryGroup {
  key: string;
  requestId: string | null;
  title: string;
  method: string;
  latestUrl: string;
  latestRecord: HttpHistoryRecord;
  records: HttpHistoryRecord[];
  totalCount: number;
  expanded: boolean;
  active: boolean;
}

export interface SidebarCollectionGroup {
  collectionId: string;
  collectionName: string;
  requests: HttpRequestEntity[];
}

export interface SidebarEnvironmentItem {
  environment: HttpEnvironmentEntity;
  active: boolean;
}

export function createInitialSidebarUiState(): SidebarUiState {
  return {
    activeTab: "activity",
    keyword: "",
    expandedHistoryGroups: {},
  };
}

export function buildHistoryGroups(
  viewState: HttpClientViewState,
  keyword: string,
  expandedHistoryGroups: Record<string, boolean>
): SidebarHistoryGroup[] {
  const recentItems = viewState.history.slice(0, 30);
  const grouped = new Map<string, Omit<SidebarHistoryGroup, "totalCount" | "expanded" | "active">>();

  recentItems.forEach((item) => {
    const key = getHistoryGroupKey(item);
    const current = grouped.get(key);
    if (current) {
      current.records.push(item);
      return;
    }

    grouped.set(key, {
      key,
      requestId: item.request?.id ? item.request.id : null,
      title: item.request?.name || "未命名请求",
      method: item.request?.method || "GET",
      latestUrl: item.request?.url || "未填写 URL",
      latestRecord: item,
      records: [item],
    });
  });

  const match = createKeywordMatcher(keyword);
  const groups = Array.from(grouped.values())
    .filter((group) => {
      if (!keyword.trim()) {
        return true;
      }

      if (match(`${group.title} ${group.latestUrl} ${group.method}`)) {
        return true;
      }

      return group.records.some((record) => {
        return match(`${record.request.name} ${record.request.url} ${record.responseSummary.status ?? "ERR"}`);
      });
    })
    .sort((left, right) => (left.latestRecord.executedAt < right.latestRecord.executedAt ? 1 : -1));

  const hasExpanded = groups.some((group) => expandedHistoryGroups[group.key]);
  return groups.map((group, index) => ({
    ...group,
    totalCount: group.records.length,
    expanded: hasExpanded ? Boolean(expandedHistoryGroups[group.key]) : index === 0,
    active: Boolean(group.requestId && viewState.activeRequestId === group.requestId),
  }));
}

export function buildCollectionGroups(config: HttpClientConfigFile, keyword: string): SidebarCollectionGroup[] {
  const match = createKeywordMatcher(keyword);
  const requests = config.requests.slice().sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1));

  return config.collections
    .map((collection) => {
      const collectionMatch = match(collection.name);
      const members = requests.filter((request) => {
        if (request.collectionId !== collection.id) {
          return false;
        }

        return !keyword.trim() || collectionMatch || match(`${request.name} ${request.url}`);
      });

      if (members.length === 0 && keyword.trim() && !collectionMatch) {
        return null;
      }

      return {
        collectionId: collection.id,
        collectionName: collection.name,
        requests: members,
      };
    })
    .filter((item): item is SidebarCollectionGroup => Boolean(item));
}

export function buildUngroupedRequests(config: HttpClientConfigFile, keyword: string): HttpRequestEntity[] {
  const match = createKeywordMatcher(keyword);
  return config.requests
    .slice()
    .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))
    .filter((request) => !keyword.trim() || match(`${request.name} ${request.url}`))
    .filter((request) => {
      return !request.collectionId || !config.collections.some((collection) => collection.id === request.collectionId);
    });
}

export function buildEnvironmentItems(viewState: HttpClientViewState, keyword: string): SidebarEnvironmentItem[] {
  const match = createKeywordMatcher(keyword);
  return viewState.config.environments
    .filter((environment) => {
      if (!keyword.trim()) {
        return true;
      }

      return match(`${environment.name} ${Object.keys(environment.variables).join(" ")}`);
    })
    .map((environment) => ({
      environment,
      active: environment.id === viewState.activeEnvironmentId,
    }));
}

export function createKeywordMatcher(keyword: string): (value: string) => boolean {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return () => true;
  }

  return (value: string) => String(value ?? "").toLowerCase().includes(normalizedKeyword);
}

export function relativeTime(input: string, now = Date.now()): string {
  const diff = now - new Date(input).getTime();
  if (Number.isNaN(diff)) {
    return "";
  }

  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }

  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export function formatClock(input: string): string {
  const value = new Date(input);
  if (Number.isNaN(value.getTime())) {
    return "";
  }

  return value.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function getHistoryStatusText(item: HttpHistoryRecord): string {
  return item.responseSummary.status === null ? "ERR" : String(item.responseSummary.status);
}

export function getHistoryStatusClass(item: HttpHistoryRecord): "ok" | "error" | "neutral" {
  if (item.responseSummary.ok) {
    return "ok";
  }

  if (item.responseSummary.status === null) {
    return "neutral";
  }

  return "error";
}

function normalizeHistoryUrl(rawUrl: string): string {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }

  return value.replace(/\/+$/, "");
}

function getHistoryGroupKey(item: HttpHistoryRecord): string {
  const requestId = String(item?.request?.id || "").trim();
  if (requestId) {
    return `request:${requestId}`;
  }

  return `fallback:${String(item.request.method || "GET")}:${normalizeHistoryUrl(item.request.url || "")}`;
}
