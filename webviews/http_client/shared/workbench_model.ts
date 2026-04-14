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
      viewState: {
        ...cloneViewState(currentViewState),
        response: cloneResponse(message.payload),
        requestRunning: false,
        responseTab: "body",
      },
      uiState: {
        ...currentUiState,
        lastErrorMessage: "",
      },
      hostCommand: null,
    };
  }

  if (message.type === "httpClient/loadTest/progress") {
    return {
      viewState: {
        ...cloneViewState(currentViewState),
        loadTestProgress: { ...message.payload },
        responseTab: "loadTest",
      },
      uiState: currentUiState,
      hostCommand: null,
    };
  }

  if (message.type === "httpClient/loadTest/result") {
    return {
      viewState: {
        ...cloneViewState(currentViewState),
        loadTestResult: {
          ...message.payload,
          errorSamples: message.payload.errorSamples.map((sample) => ({ ...sample })),
          statusCounts: message.payload.statusCounts.map((item) => ({ ...item })),
        },
        loadTestProgress: null,
        responseTab: "loadTest",
      },
      uiState: currentUiState,
      hostCommand: null,
    };
  }

  if (message.type === "httpClient/error") {
    return {
      viewState: {
        ...cloneViewState(currentViewState),
        response: null,
        requestRunning: false,
        responseTab: "body",
      },
      uiState: {
        ...currentUiState,
        lastErrorMessage: message.payload.message,
      },
      hostCommand: null,
    };
  }

  if (message.type === "httpClient/hostCommand") {
    return {
      viewState: cloneViewState(currentViewState),
      uiState: currentUiState,
      hostCommand: message.payload.command,
    };
  }

  return {
    viewState: cloneViewState(currentViewState),
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
    loadTestProfile: { ...viewState.loadTestProfile },
    loadTestResult: viewState.loadTestResult
      ? {
          ...viewState.loadTestResult,
          errorSamples: viewState.loadTestResult.errorSamples.map((sample) => ({ ...sample })),
          statusCounts: viewState.loadTestResult.statusCounts.map((item) => ({ ...item })),
        }
      : null,
    loadTestProgress: viewState.loadTestProgress ? { ...viewState.loadTestProgress } : null,
  };
}

export function cloneRequest(request: HttpRequestEntity): HttpRequestEntity {
  return {
    ...request,
    params: request.params.map((item) => ({ ...item })),
    headers: request.headers.map((item) => ({ ...item })),
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
