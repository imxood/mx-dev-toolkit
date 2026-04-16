import type {
  ExtensionToWebviewMessage,
  HttpBodyMode,
  HttpClientViewState,
  HttpHistoryRecord,
  HttpKeyValue,
  HttpLoadTestProfile,
  HttpRequestEntity,
  HttpResponseResult,
} from "../../../src/http_client/types";

export interface WorkbenchUiState {
  responseSearch: string;
  responsePretty: boolean;
  lastErrorMessage: string;
}

export interface WorkbenchMessageSnapshot {
  viewState: HttpClientViewState;
  uiState: WorkbenchUiState;
  hostCommand: "send" | "save" | "loadTest" | "focusCurlImport" | null;
}

type WorkbenchSessionPatch = Partial<
  Pick<
    HttpClientViewState,
    | "activeRequestId"
    | "selectedHistoryId"
    | "activeEnvironmentId"
    | "draft"
    | "response"
    | "requestRunning"
    | "loadTestProfile"
    | "loadTestResult"
    | "loadTestProgress"
    | "dirty"
    | "activeTab"
    | "responseTab"
  >
>;

export function createInitialUiState(): WorkbenchUiState {
  return {
    responseSearch: "",
    responsePretty: true,
    lastErrorMessage: "",
  };
}

export function createFallbackViewState(): HttpClientViewState {
  const now = "2026-04-14T00:00:00.000Z";
  const draft = createFallbackDraft(now);
  return {
    config: {
      version: 1,
      collections: [],
      requests: [],
      environments: [],
    },
    activeRequestId: null,
    selectedHistoryId: null,
    activeEnvironmentId: null,
    draft,
    history: [],
    response: null,
    requestRunning: false,
    loadTestProfile: {
      totalRequests: 100,
      concurrency: 5,
      timeoutMs: 30000,
    },
    loadTestResult: null,
    loadTestProgress: null,
    dirty: false,
    activeTab: "params",
    responseTab: "body",
  };
}

export function applyWorkbenchMessage(
  currentViewState: HttpClientViewState,
  currentUiState: WorkbenchUiState,
  message: ExtensionToWebviewMessage
): WorkbenchMessageSnapshot {
  if (message.type === "mxToast/show") {
    return {
      viewState: currentViewState,
      uiState: currentUiState,
      hostCommand: null,
    };
  }

  if (message.type === "httpClient/state") {
    return {
      viewState: cloneViewState(message.payload),
      uiState: currentUiState,
      hostCommand: null,
    };
  }

  if (message.type === "httpClient/response") {
    return {
      viewState: patchWorkbenchSession(currentViewState, {
        response: message.payload,
        requestRunning: false,
        responseTab: "body",
      }),
      uiState: {
        ...currentUiState,
        lastErrorMessage: "",
      },
      hostCommand: null,
    };
  }

  if (message.type === "httpClient/loadTest/progress") {
    return {
      viewState: patchWorkbenchSession(currentViewState, {
        loadTestProgress: message.payload,
        responseTab: "loadTest",
      }),
      uiState: currentUiState,
      hostCommand: null,
    };
  }

  if (message.type === "httpClient/loadTest/result") {
    return {
      viewState: patchWorkbenchSession(currentViewState, {
        loadTestResult: message.payload,
        loadTestProgress: null,
        responseTab: "loadTest",
      }),
      uiState: currentUiState,
      hostCommand: null,
    };
  }

  if (message.type === "httpClient/error") {
    return {
      viewState: patchWorkbenchSession(currentViewState, {
        response: null,
        requestRunning: false,
        responseTab: "body",
      }),
      uiState: {
        ...currentUiState,
        lastErrorMessage: message.payload.message,
      },
      hostCommand: null,
    };
  }

  if (message.type === "httpClient/hostCommand") {
    return {
      viewState: currentViewState,
      uiState: currentUiState,
      hostCommand: message.payload.command,
    };
  }

  return {
    viewState: currentViewState,
    uiState: currentUiState,
    hostCommand: null,
  };
}

export function cloneViewState(viewState: HttpClientViewState): HttpClientViewState {
  return {
    ...viewState,
    config: {
      version: viewState.config.version,
      collections: viewState.config.collections.map((collection) => ({ ...collection })),
      requests: viewState.config.requests.map((request) => cloneRequest(request)),
      environments: viewState.config.environments.map((environment) => ({
        ...environment,
        variables: { ...environment.variables },
      })),
    },
    draft: viewState.draft ? cloneRequest(viewState.draft) : null,
    history: viewState.history.map((item) => cloneHistoryRecord(item)),
    response: viewState.response ? cloneResponse(viewState.response) : null,
    loadTestProfile: cloneLoadTestProfile(viewState.loadTestProfile),
    loadTestResult: viewState.loadTestResult ? cloneLoadTestResult(viewState.loadTestResult) : null,
    loadTestProgress: viewState.loadTestProgress ? cloneLoadTestProgress(viewState.loadTestProgress) : null,
  };
}

export function cloneRequest(request: HttpRequestEntity): HttpRequestEntity {
  return {
    ...request,
    params: request.params.map((item) => ({ ...item })),
    headers: request.headers.map((item) => ({ ...item })),
  };
}

export function patchWorkbenchSession(
  currentViewState: HttpClientViewState,
  patch: WorkbenchSessionPatch
): HttpClientViewState {
  const nextState: HttpClientViewState = {
    ...currentViewState,
  };

  if ("activeRequestId" in patch) {
    nextState.activeRequestId = patch.activeRequestId ?? null;
  }
  if ("selectedHistoryId" in patch) {
    nextState.selectedHistoryId = patch.selectedHistoryId ?? null;
  }
  if ("activeEnvironmentId" in patch) {
    nextState.activeEnvironmentId = patch.activeEnvironmentId ?? null;
  }
  if ("draft" in patch) {
    nextState.draft = patch.draft ? cloneRequest(patch.draft) : null;
  }
  if ("response" in patch) {
    nextState.response = patch.response ? cloneResponse(patch.response) : null;
  }
  if ("requestRunning" in patch) {
    nextState.requestRunning = Boolean(patch.requestRunning);
  }
  if ("loadTestProfile" in patch && patch.loadTestProfile) {
    nextState.loadTestProfile = cloneLoadTestProfile(patch.loadTestProfile);
  }
  if ("loadTestResult" in patch) {
    nextState.loadTestResult = patch.loadTestResult ? cloneLoadTestResult(patch.loadTestResult) : null;
  }
  if ("loadTestProgress" in patch) {
    nextState.loadTestProgress = patch.loadTestProgress ? cloneLoadTestProgress(patch.loadTestProgress) : null;
  }
  if ("dirty" in patch) {
    nextState.dirty = Boolean(patch.dirty);
  }
  if ("activeTab" in patch && patch.activeTab) {
    nextState.activeTab = patch.activeTab;
  }
  if ("responseTab" in patch && patch.responseTab) {
    nextState.responseTab = patch.responseTab;
  }

  return nextState;
}

export function updateDraftLocally(
  currentViewState: HttpClientViewState,
  mutator: (draft: HttpRequestEntity) => HttpRequestEntity
): HttpClientViewState {
  if (!currentViewState.draft) {
    return currentViewState;
  }

  const nextDraft = mutator(cloneRequest(currentViewState.draft));
  nextDraft.updatedAt = new Date().toISOString();
  return patchWorkbenchSession(currentViewState, {
    draft: nextDraft,
    dirty: true,
  });
}

export function createScratchRequestLocally(
  currentViewState: HttpClientViewState,
  request: HttpRequestEntity
): HttpClientViewState {
  return patchWorkbenchSession(currentViewState, {
    activeRequestId: request.id,
    selectedHistoryId: null,
    draft: request,
    response: null,
    dirty: true,
    responseTab: "body",
  });
}

export function selectRequestLocally(
  currentViewState: HttpClientViewState,
  requestId: string
): HttpClientViewState {
  const savedRequest = currentViewState.config.requests.find((item) => item.id === requestId) ?? null;
  if (!savedRequest) {
    return currentViewState;
  }

  const draft = currentViewState.draft?.id === requestId ? currentViewState.draft : savedRequest;
  return patchWorkbenchSession(currentViewState, {
    activeRequestId: requestId,
    selectedHistoryId: null,
    draft,
    response: null,
    dirty: currentViewState.draft?.id === requestId ? currentViewState.dirty : false,
    responseTab: "body",
  });
}

export function selectHistoryLocally(
  currentViewState: HttpClientViewState,
  historyId: string
): HttpClientViewState {
  const history = currentViewState.history.find((item) => item.id === historyId) ?? null;
  if (!history) {
    return currentViewState;
  }

  return patchWorkbenchSession(currentViewState, {
    activeRequestId: history.request.id,
    selectedHistoryId: historyId,
    draft: history.request,
    response: null,
    dirty: false,
    responseTab: "body",
  });
}

export function setEnvironmentLocally(
  currentViewState: HttpClientViewState,
  environmentId: string | null
): HttpClientViewState {
  return patchWorkbenchSession(currentViewState, {
    activeEnvironmentId: environmentId,
  });
}

export function toggleFavoriteLocally(
  currentViewState: HttpClientViewState,
  requestId: string,
  favorite: boolean
): HttpClientViewState {
  const hasSavedRequest = currentViewState.config.requests.some((request) => request.id === requestId);
  if (!hasSavedRequest && currentViewState.draft?.id !== requestId) {
    return currentViewState;
  }

  const nextDraft =
    currentViewState.draft?.id === requestId
      ? {
          ...cloneRequest(currentViewState.draft),
          favorite,
        }
      : currentViewState.draft;

  return {
    ...patchWorkbenchSession(
      currentViewState,
      nextDraft
        ? {
            draft: nextDraft,
          }
        : {}
    ),
    config: hasSavedRequest
      ? {
          ...currentViewState.config,
          requests: currentViewState.config.requests.map((request) =>
            request.id === requestId
              ? {
                  ...request,
                  favorite,
                }
              : request
          ),
        }
      : currentViewState.config,
  };
}

export function buildUrlHint(rawUrl: string): string {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) {
    return "URL 不能为空";
  }

  const bareHostPattern = /^[a-zA-Z0-9.-]+(:\d+)?(\/.*)?$/;
  if (bareHostPattern.test(trimmed) && !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    return `URL 需要以 http:// 或 https:// 开头, 例如 https://${trimmed.replace(/^\/+/, "")}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "仅支持 HTTP/HTTPS 请求, 例如 https://example.com/api";
    }
  } catch {
    return "URL 格式不正确, 例如 https://example.com/api";
  }

  return "";
}

export function getDisplayedResponseText(response: HttpResponseResult | null, responsePretty: boolean): string {
  if (!response) {
    return "";
  }

  return responsePretty && response.isJson ? response.bodyPrettyText : response.bodyText;
}

export function getSelectedHistoryOrdinal(history: HttpHistoryRecord[], selectedHistoryId: string | null, limit = 30): number | null {
  if (!selectedHistoryId) {
    return null;
  }

  const index = history.slice(0, limit).findIndex((item) => item.id === selectedHistoryId);
  return index >= 0 ? index + 1 : null;
}

export function isScratchDraft(viewState: HttpClientViewState): boolean {
  const draft = viewState.draft;
  if (!draft) {
    return false;
  }

  return !viewState.config.requests.some((request) => request.id === draft.id);
}

export function createEmptyKeyValue(createId: () => string): HttpKeyValue {
  return {
    id: createId(),
    key: "",
    value: "",
    enabled: true,
  };
}

export function splitUrlParts(rawUrl: string): { base: string; query: string; hash: string } {
  const value = String(rawUrl || "");
  const hashIndex = value.indexOf("#");
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const queryIndex = withoutHash.indexOf("?");

  return {
    base: queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash,
    query: queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "",
    hash,
  };
}

export function syncParamsFromUrl(draft: HttpRequestEntity, createId: () => string): HttpRequestEntity {
  const parts = splitUrlParts(draft.url);
  const params = Array.from(new URLSearchParams(parts.query).entries()).map(([key, value]) => ({
    id: createId(),
    key,
    value,
    enabled: true,
  }));

  return {
    ...cloneRequest(draft),
    params: params.length > 0 ? [...params, createEmptyKeyValue(createId)] : [createEmptyKeyValue(createId)],
  };
}

export function syncUrlFromParams(draft: HttpRequestEntity): HttpRequestEntity {
  const parts = splitUrlParts(draft.url);
  const search = new URLSearchParams();

  draft.params.forEach((item) => {
    if (item.enabled && item.key.trim()) {
      search.set(item.key.trim(), item.value);
    }
  });

  const queryText = search.toString();
  return {
    ...cloneRequest(draft),
    url: `${parts.base}${queryText ? `?${queryText}` : ""}${parts.hash}`,
  };
}

export function ensureJsonBodyMode(bodyMode: HttpBodyMode, bodyText: string): { bodyMode: HttpBodyMode; bodyText: string } {
  try {
    return {
      bodyMode: "json",
      bodyText: JSON.stringify(JSON.parse(bodyText || "{}"), null, 2),
    };
  } catch {
    return {
      bodyMode,
      bodyText,
    };
  }
}

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function highlightText(source: string, keyword: string): string {
  const rawSource = String(source ?? "");
  if (!keyword) {
    return escapeHtml(rawSource);
  }

  const safeKeyword = keyword.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(safeKeyword, "gi");
  return escapeHtml(rawSource).replace(regex, (match) => `<mark>${match}</mark>`);
}

export function renderJsonHighlightedText(source: string, keyword: string): string {
  const tokenPattern =
    /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?/g;
  let lastIndex = 0;
  let result = "";
  let match = tokenPattern.exec(source);

  while (match) {
    result += highlightText(source.slice(lastIndex, match.index), keyword);
    const token = match[0];
    const tokenEndIndex = match.index + token.length;
    const isKey = source.slice(tokenEndIndex).match(/^\s*:/) !== null;
    result += `<span class="json-token ${classifyJsonToken(isKey ? `${token}:` : token)}">${highlightText(token, keyword)}</span>`;
    lastIndex = tokenPattern.lastIndex;
    match = tokenPattern.exec(source);
  }

  result += highlightText(source.slice(lastIndex), keyword);
  return result;
}

function classifyJsonToken(token: string): string {
  if (/^"/.test(token)) {
    return token.endsWith(":") ? "json-key" : "json-string";
  }

  if (token === "true" || token === "false") {
    return "json-boolean";
  }

  if (token === "null") {
    return "json-null";
  }

  return "json-number";
}

function cloneHistoryRecord(item: HttpHistoryRecord): HttpHistoryRecord {
  return {
    ...item,
    request: cloneRequest(item.request),
    responseSummary: { ...item.responseSummary },
  };
}

function cloneLoadTestProfile(profile: HttpLoadTestProfile): HttpLoadTestProfile {
  return {
    ...profile,
  };
}

function cloneLoadTestProgress(progress: NonNullable<HttpClientViewState["loadTestProgress"]>) {
  return {
    ...progress,
  };
}

function cloneLoadTestResult(result: NonNullable<HttpClientViewState["loadTestResult"]>) {
  return {
    ...result,
    errorSamples: result.errorSamples.map((sample) => ({ ...sample })),
    statusCounts: result.statusCounts.map((item) => ({ ...item })),
  };
}

function cloneResponse(response: HttpResponseResult): HttpResponseResult {
  return {
    ...response,
    headers: response.headers.map((header) => ({ ...header })),
    meta: {
      ...response.meta,
      unresolvedVariables: [...response.meta.unresolvedVariables],
    },
  };
}

function createFallbackDraft(now: string): HttpRequestEntity {
  return {
    id: "fallback-request",
    collectionId: null,
    name: "新请求",
    method: "GET",
    url: "",
    params: [
      {
        id: "fallback-param",
        key: "",
        value: "",
        enabled: true,
      },
    ],
    headers: [
      {
        id: "fallback-header",
        key: "",
        value: "",
        enabled: true,
      },
    ],
    bodyMode: "json",
    bodyText: "",
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}
