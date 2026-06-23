import type {
  HttpClientViewState,
  HttpCollectionEntity,
  HttpEnvironmentEntity,
  HttpRequestEntity,
} from "../../../src/http_client/types";
import type { ToastNotifyMessage, ToastToWebviewMessage } from "../../../src/toast/types";

export type SidebarTab = "collections" | "environments";

export interface SidebarUiState {
  activeTab: SidebarTab;
  keyword: string;
  expandedCollectionGroups: Record<string, boolean>;
  selectedEnvironmentId: string | null;
}

export interface SidebarEnvironmentDraftRow {
  id: string;
  key: string;
  value: string;
}

export interface SidebarEnvironmentDraft {
  environmentId: string;
  name: string;
  variables: SidebarEnvironmentDraftRow[];
  dirty: boolean;
}

export type SidebarToExtensionMessage =
  | ToastNotifyMessage
  | { type: "httpClientSidebar/init" }
  | { type: "httpClientSidebar/createRequest"; payload?: { collectionId?: string | null } }
  | { type: "httpClientSidebar/createCollection" }
  | { type: "httpClientSidebar/createEnvironment" }
  | { type: "httpClientSidebar/renameCollection"; payload: { collectionId: string } }
  | { type: "httpClientSidebar/deleteCollection"; payload: { collectionId: string } }
  | { type: "httpClientSidebar/renameRequest"; payload: { requestId: string; name: string } }
  | { type: "httpClientSidebar/duplicateRequest"; payload: { requestId: string } }
  | { type: "httpClientSidebar/deleteRequest"; payload: { requestId: string } }
  | { type: "httpClientSidebar/moveRequest"; payload: { requestId: string; beforeRequestId: string | null; targetCollectionId: string } }
  | { type: "httpClientSidebar/exportCurl"; payload: { requestId: string } }
  | { type: "httpClientSidebar/selectRequest"; payload: { requestId: string } }
  | { type: "httpClientSidebar/selectEnvironment"; payload: { environmentId: string | null } }
  | { type: "httpClientSidebar/saveEnvironment"; payload: { environment: HttpEnvironmentEntity } }
  | { type: "httpClientSidebar/deleteEnvironment"; payload: { environmentId: string } };

export type ExtensionToSidebarMessage =
  | { type: "httpClientSidebar/state"; payload: HttpClientViewState }
  | { type: "httpClientSidebar/curl"; payload: { requestId: string; curl: string } }
  | ToastToWebviewMessage;

export interface SidebarCollectionGroup {
  collectionId: string;
  collectionName: string;
  isDefault: boolean;
  requests: HttpRequestEntity[];
  expanded: boolean;
}

export interface SidebarEnvironmentItem {
  environment: HttpEnvironmentEntity;
  active: boolean;
}

export function createInitialSidebarUiState(): SidebarUiState {
  return {
    activeTab: "collections",
    keyword: "",
    expandedCollectionGroups: {},
    selectedEnvironmentId: null,
  };
}

export function buildCollectionGroups(
  config: HttpClientViewState["config"],
  keyword: string,
  draft: HttpRequestEntity | null = null,
  expandedCollectionGroups: Record<string, boolean> = {}
): SidebarCollectionGroup[] {
  const match = createKeywordMatcher(keyword);
  const draftInCollections = draft
    ? config.collections.some((collection) => collection.requests.some((request) => request.id === draft.id))
    : true;
  const showDraftInCollection = (collection: HttpCollectionEntity): boolean =>
    Boolean(draft) && !draftInCollections && collection.isDefault;

  return config.collections
    .map((collection) => {
      const collectionMatch = match(collection.name);
      const baseRequests = showDraftInCollection(collection)
        ? [draft as HttpRequestEntity, ...collection.requests]
        : collection.requests;
      const members = baseRequests.filter((request) => {
        if (keyword.trim() && !collectionMatch && !match(`${request.name} ${request.url} ${request.method}`)) {
          return false;
        }
        return true;
      });

      if (members.length === 0 && keyword.trim() && !collectionMatch) {
        return null;
      }

      return {
        collectionId: collection.id,
        collectionName: collection.name,
        isDefault: collection.isDefault,
        requests: members,
        expanded: expandedCollectionGroups[collection.id] !== false,
      };
    })
    .filter((item): item is SidebarCollectionGroup => Boolean(item));
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

export function relativeTime(input: string | null | undefined, now = Date.now()): string {
  if (!input) {
    return "";
  }
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

export function getRequestStatusBadge(request: HttpRequestEntity): { className: "ok" | "warn" | "err" | "neutral"; label: string; durationLabel: string } {
  if (request.lastStatus == null) {
    return { className: "neutral", label: "未运行", durationLabel: "" };
  }
  const className = request.lastStatus >= 500 ? "err" : request.lastStatus >= 400 ? "warn" : "ok";
  const durationLabel = request.lastDurationMs != null ? `${request.lastDurationMs}ms` : "";
  return { className, label: String(request.lastStatus), durationLabel };
}

export function findRequestInCollections(
  config: HttpClientViewState["config"],
  requestId: string
): { request: HttpRequestEntity; collection: HttpCollectionEntity } | null {
  for (const collection of config.collections) {
    const request = collection.requests.find((item) => item.id === requestId);
    if (request) {
      return { request, collection };
    }
  }
  return null;
}

export function defaultCollection(config: HttpClientViewState["config"]): HttpCollectionEntity | null {
  return config.collections.find((item) => item.isDefault) ?? config.collections[0] ?? null;
}
