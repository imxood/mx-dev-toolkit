import type {
  ExtensionToWebviewMessage,
  HttpBodyMode,
  HttpClientViewState,
  HttpKeyValue,
  HttpLoadTestProfile,
  HttpRequestEntity,
  HttpResponseResult,
} from "../../../src/http_client/types";
import { betweenSortIds, newSortId } from "./sort_id";

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
      version: 2,
      collections: [],
      environments: [],
    },
    activeRequestId: null,
    activeEnvironmentId: null,
    draft,
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
      collections: viewState.config.collections.map((collection) => ({
        ...collection,
        requests: collection.requests.map((request) => cloneRequest(request)),
      })),
      environments: viewState.config.environments.map((environment) => ({
        ...environment,
        variables: { ...environment.variables },
      })),
    },
    draft: viewState.draft ? cloneRequest(viewState.draft) : null,
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
    lastResponseSnapshot: request.lastResponseSnapshot ? cloneResponse(request.lastResponseSnapshot) : null,
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
  const lookup = findRequestInCollections(currentViewState, requestId);
  if (!lookup) {
    return currentViewState;
  }

  const snapshot = lookup.request.lastResponseSnapshot;
  const draft = currentViewState.draft?.id === requestId ? currentViewState.draft : cloneRequest(lookup.request);

  return patchWorkbenchSession(currentViewState, {
    activeRequestId: requestId,
    draft,
    response: snapshot ? cloneResponse(snapshot) : null,
    dirty: currentViewState.draft?.id === requestId ? currentViewState.dirty : false,
    responseTab: "body",
  });
}

export function moveRequestLocally(
  currentViewState: HttpClientViewState,
  requestId: string,
  beforeRequestId: string | null,
  targetCollectionId: string
): HttpClientViewState {
  const lookup = findRequestInCollections(currentViewState, requestId);
  if (!lookup) {
    return currentViewState;
  }
  const target = currentViewState.config.collections.find((item) => item.id === targetCollectionId)
    ?? lookup.collection;

  // filter 之后再算 insertIndex, 跟 currentIndex 比较做 no-op 检测
  if (target.id === lookup.collection.id) {
    if (beforeRequestId === requestId) {
      return currentViewState;
    }
    const currentIndex = lookup.collection.requests.findIndex((item) => item.id === requestId);
    const filtered = lookup.collection.requests.filter((item) => item.id !== requestId);
    const insertIndex = beforeRequestId
      ? filtered.findIndex((item) => item.id === beforeRequestId)
      : filtered.length;
    const safeInsertIndex = insertIndex < 0 ? filtered.length : insertIndex;
    if (safeInsertIndex === currentIndex) {
      return currentViewState;
    }
  }

  // filter 之后算 safeIndex
  const filtered = target.requests.filter((item) => item.id !== requestId);
  const insertIndex = beforeRequestId
    ? filtered.findIndex((item) => item.id === beforeRequestId)
    : filtered.length;
  const safeIndex = insertIndex < 0 ? filtered.length : insertIndex;

  const prevSortId = safeIndex > 0 ? filtered[safeIndex - 1].sortId : null;
  const nextSortId = safeIndex < filtered.length ? filtered[safeIndex].sortId : null;
  const newSortId = betweenSortIds(prevSortId, nextSortId, new Set(filtered.map((item) => item.sortId)));
  const now = new Date().toISOString();
  const movingRequest = { ...cloneRequest(lookup.request), sortId: newSortId, updatedAt: now };

  return {
    ...currentViewState,
    config: {
      ...currentViewState.config,
      collections: currentViewState.config.collections.map((collection) => {
        if (collection.id === lookup.collection.id && collection.id !== target.id) {
          return { ...collection, requests: collection.requests.filter((item) => item.id !== requestId) };
        }
        if (collection.id === target.id && collection.id !== lookup.collection.id) {
          const next = [...collection.requests];
          next.splice(safeIndex, 0, movingRequest);
          return { ...collection, requests: next };
        }
        if (collection.id === target.id && collection.id === lookup.collection.id) {
          const next = collection.requests.filter((item) => item.id !== requestId);
          next.splice(safeIndex, 0, movingRequest);
          return { ...collection, requests: next };
        }
        return collection;
      }),
    },
  };
}

export function setEnvironmentLocally(
  currentViewState: HttpClientViewState,
  environmentId: string | null
): HttpClientViewState {
  return patchWorkbenchSession(currentViewState, {
    activeEnvironmentId: environmentId,
  });
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

  const displayText = normalizeResponseText(response.bodyText);
  return responsePretty ? displayText : escapeResponseText(displayText);
}

export function normalizeResponseText(source: string): string {
  const input = String(source ?? "");
  if (!input.includes("\\")) {
    return input;
  }

  let output = "";

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char !== "\\") {
      output += char;
      continue;
    }

    const next = input[index + 1];
    if (!next) {
      output += char;
      continue;
    }

    switch (next) {
      case "n":
        output += "\n";
        index += 1;
        break;
      case "r":
        output += "\r";
        index += 1;
        break;
      case "t":
        output += "\t";
        index += 1;
        break;
      case "b":
        output += "\b";
        index += 1;
        break;
      case "f":
        output += "\f";
        index += 1;
        break;
      case "v":
        output += "\v";
        index += 1;
        break;
      case "0":
        output += "\0";
        index += 1;
        break;
      case "u": {
        const hex = input.slice(index + 2, index + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          output += String.fromCharCode(Number.parseInt(hex, 16));
          index += 5;
        } else {
          output += char;
        }
        break;
      }
      default:
        output += char;
        break;
    }
  }

  return output;
}

export function escapeResponseText(source: string): string {
  const input = String(source ?? "");
  let output = "";

  for (const char of input) {
    switch (char) {
      case "\n":
        output += "\\n";
        break;
      case "\r":
        output += "\\r";
        break;
      case "\t":
        output += "\\t";
        break;
      case "\b":
        output += "\\b";
        break;
      case "\f":
        output += "\\f";
        break;
      case "\v":
        output += "\\v";
        break;
      case "\0":
        output += "\\0";
        break;
      default: {
        const codePoint = char.codePointAt(0);
        if (codePoint !== undefined && (codePoint < 0x20 || codePoint === 0x7f)) {
          output += `\\x${codePoint.toString(16).padStart(2, "0")}`;
        } else {
          output += char;
        }
      }
    }
  }

  return output;
}

export function isScratchDraft(viewState: HttpClientViewState): boolean {
  const draft = viewState.draft;
  if (!draft) {
    return false;
  }
  return !findRequestInCollections(viewState, draft.id);
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

interface RequestInCollectionLookup {
  request: HttpRequestEntity;
  collection: { id: string; requests: HttpRequestEntity[] };
}

function findRequestInCollections(viewState: HttpClientViewState, requestId: string): RequestInCollectionLookup | null {
  for (const collection of viewState.config.collections) {
    const request = collection.requests.find((item) => item.id === requestId);
    if (request) {
      return { request, collection };
    }
  }
  return null;
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
    sortId: newSortId(),
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
    lastStatus: null,
    lastDurationMs: null,
    lastExecutedAt: null,
    lastResponseSnapshot: null,
    createdAt: now,
    updatedAt: now,
  };
}
