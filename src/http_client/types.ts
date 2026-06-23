import { randomUUID } from "crypto";
import { ulid } from "ulid";
import { ToastNotifyMessage, ToastToWebviewMessage } from "../toast/types";

export const HTTP_CLIENT_CONFIG_VERSION = 2;
export const HTTP_CLIENT_CONFIG_FILE = "mx_http_client.json";
export const HTTP_CLIENT_HISTORY_LIMIT = 50;
export const HTTP_CLIENT_RESPONSE_SNAPSHOT_MAX_BYTES = 256 * 1024;
export const HTTP_CLIENT_LOAD_TEST_ERROR_SAMPLE_LIMIT = 20;
export const HTTP_CLIENT_LOAD_TEST_MAX_CONCURRENCY = 50;
export const HTTP_CLIENT_LOAD_TEST_MAX_REQUESTS = 10000;
export const HTTP_CLIENT_LOAD_TEST_MAX_TIMEOUT_MS = 120000;
export const HTTP_CLIENT_DEFAULT_TIMEOUT_MS = 30000;
export const HTTP_CLIENT_DEFAULT_LOAD_TEST_TIMEOUT_MS = 30000;
export const HTTP_CLIENT_WEBVIEW_BUILD_ID = "2026-06-23-01";
export const HTTP_CLIENT_RESPONSE_ACK_TIMEOUT_MS = 400;
export const HTTP_CLIENT_DEFAULT_COLLECTION_ID = "default-collection";
export const HTTP_CLIENT_DEFAULT_COLLECTION_NAME = "默认集合";

export const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type HttpBodyMode = "none" | "raw" | "json";

export interface HttpKeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface HttpResolvedRequest {
  requestId: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  headerEntries: HttpKeyValue[];
  bodyText: string;
  bodyMode: HttpBodyMode;
  unresolvedVariables: string[];
  environmentId: string | null;
  sourceRequest: HttpRequestEntity;
  timeoutMs: number;
}

export interface HttpRequestEntity {
  id: string;
  /**
   * 排序键, ULID (26 字符 Crockford base32), 字典序 = 时间序.
   * 拖拽重排时只改本字段, 写盘 O(1); 数组按 sortId 升序排就是用户最后看到的顺序.
   * id 仍然是不变的主键, 改 URL / 改名称都不会重新分配.
   */
  sortId: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: HttpKeyValue[];
  headers: HttpKeyValue[];
  bodyMode: HttpBodyMode;
  bodyText: string;
  lastStatus: number | null;
  lastDurationMs: number | null;
  lastExecutedAt: string | null;
  lastResponseSnapshot: HttpResponseResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface HttpCollectionEntity {
  id: string;
  name: string;
  isDefault: boolean;
  requests: HttpRequestEntity[];
  createdAt: string;
  updatedAt: string;
}

export interface HttpEnvironmentEntity {
  id: string;
  name: string;
  variables: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface HttpClientConfigFile {
  version: number;
  collections: HttpCollectionEntity[];
  environments: HttpEnvironmentEntity[];
}

export interface HttpResponseMeta {
  startedAt: string;
  durationMs: number;
  sizeBytes: number;
  finalUrl: string;
  redirected: boolean;
  contentType: string;
  unresolvedVariables: string[];
  environmentId: string | null;
}

export interface HttpHeaderEntry {
  key: string;
  value: string;
}

export interface HttpResponseResult {
  ok: boolean;
  status: number;
  statusText: string;
  bodyRawText: string;
  bodyText: string;
  bodyPrettyText: string;
  isJson: boolean;
  headers: HttpHeaderEntry[];
  meta: HttpResponseMeta;
}

export interface HttpClientErrorDetails {
  code: "timeout" | "cancelled" | "network" | "validation";
  message: string;
}

export class HttpClientError extends Error {
  public readonly details: HttpClientErrorDetails;

  constructor(details: HttpClientErrorDetails) {
    super(details.message);
    this.name = "HttpClientError";
    this.details = details;
  }
}

export interface HttpLoadTestProfile {
  totalRequests: number;
  concurrency: number;
  timeoutMs: number;
}

export interface HttpLoadTestErrorSample {
  index: number;
  message: string;
  status: number | null;
}

export interface HttpLoadTestStatusCount {
  status: string;
  count: number;
}

export interface HttpLoadTestProgress {
  completedRequests: number;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  running: boolean;
}

export interface HttpLoadTestResult {
  totalRequests: number;
  completedRequests: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageDurationMs: number;
  minDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  rps: number;
  durationMs: number;
  statusCounts: HttpLoadTestStatusCount[];
  errorSamples: HttpLoadTestErrorSample[];
  cancelled: boolean;
}

export interface HttpClientViewState {
  config: HttpClientConfigFile;
  activeRequestId: string | null;
  activeEnvironmentId: string | null;
  draft: HttpRequestEntity | null;
  response: HttpResponseResult | null;
  requestRunning: boolean;
  loadTestProfile: HttpLoadTestProfile;
  loadTestResult: HttpLoadTestResult | null;
  loadTestProgress: HttpLoadTestProgress | null;
  dirty: boolean;
  activeTab: "params" | "headers" | "body";
  responseTab: "body" | "headers" | "meta" | "loadTest";
}

export interface HttpClientStateStore {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface HttpClientSnapshot {
  config: HttpClientConfigFile;
  activeRequestId: string | null;
  activeEnvironmentId: string | null;
}

export interface HttpClientDraftState {
  draft: HttpRequestEntity | null;
  dirty: boolean;
}

export interface HttpClientCommandContext {
  source: "ui" | "command";
}

export interface HttpClientSendPayload {
  request: HttpRequestEntity;
  environmentId: string | null;
  timeoutMs?: number;
}

export interface HttpClientSavePayload {
  request: HttpRequestEntity;
}

export interface HttpClientLoadTestPayload {
  request: HttpRequestEntity;
  environmentId: string | null;
  profile: HttpLoadTestProfile;
}

export interface HttpClientFrontendLogPayload {
  level: "info" | "warn" | "error";
  scope: string;
  message: string;
}

export interface HttpClientResponseAckPayload {
  source: "bootstrap" | "state" | "response";
}

export interface HttpClientMoveRequestPayload {
  requestId: string;
  /** 目标集合里要插入到此请求之前; null 表示追加到目标集合末尾. */
  beforeRequestId: string | null;
  targetCollectionId: string;
}

export interface HttpClientExportCurlPayload {
  requestId: string;
}

export interface HttpClientRenameRequestPayload {
  requestId: string;
  name: string;
}

export type WebviewToExtensionMessage =
  | { type: "httpClient/init"; payload?: { buildId?: string } }
  | ToastNotifyMessage
  | { type: "httpClient/uiStateChanged"; payload: { activeTab: "params" | "headers" | "body"; responseTab: "body" | "headers" | "meta" | "loadTest" } }
  | { type: "httpClient/draftChanged"; payload: { request: HttpRequestEntity; dirty: boolean } }
  | { type: "httpClient/cancelRequest" }
  | { type: "httpClient/selectRequest"; payload: { requestId: string } }
  | { type: "httpClient/createScratchRequest" }
  | { type: "httpClient/save"; payload: HttpClientSavePayload }
  | { type: "httpClient/send"; payload: HttpClientSendPayload }
  | { type: "httpClient/importCurlPrompt" }
  | { type: "httpClient/createCollectionPrompt" }
  | { type: "httpClient/renameCollectionPrompt"; payload: { collectionId: string } }
  | { type: "httpClient/deleteCollection"; payload: { collectionId: string } }
  | { type: "httpClient/createRequest"; payload: { collectionId: string | null; request?: HttpRequestEntity } }
  | { type: "httpClient/createEnvironment" }
  | { type: "httpClient/renameRequest"; payload: HttpClientRenameRequestPayload }
  | { type: "httpClient/deleteRequest"; payload: { requestId: string } }
  | { type: "httpClient/duplicateRequest"; payload: { requestId: string } }
  | { type: "httpClient/moveRequest"; payload: HttpClientMoveRequestPayload }
  | { type: "httpClient/exportCurl"; payload: HttpClientExportCurlPayload }
  | { type: "httpClient/selectEnvironment"; payload: { environmentId: string | null } }
  | { type: "httpClient/saveEnvironment"; payload: { environment: HttpEnvironmentEntity } }
  | { type: "httpClient/deleteEnvironment"; payload: { environmentId: string } }
  | { type: "httpClient/openResponseEditor"; payload: { content: string; language: string } }
  | { type: "httpClient/loadTest/start"; payload: HttpClientLoadTestPayload }
  | { type: "httpClient/loadTest/stop" }
  | { type: "httpClient/responseAck"; payload: HttpClientResponseAckPayload }
  | { type: "httpClient/frontendLog"; payload: HttpClientFrontendLogPayload };

export type ExtensionToWebviewMessage =
  | ToastToWebviewMessage
  | { type: "httpClient/state"; payload: HttpClientViewState }
  | { type: "httpClient/curl"; payload: { requestId: string; curl: string } }
  | { type: "httpClient/response"; payload: HttpResponseResult }
  | { type: "httpClient/loadTest/progress"; payload: HttpLoadTestProgress }
  | { type: "httpClient/loadTest/result"; payload: HttpLoadTestResult }
  | { type: "httpClient/error"; payload: { message: string } }
  | { type: "httpClient/hostCommand"; payload: { command: "send" | "save" | "loadTest" | "focusCurlImport" } };

export function createNowIsoString(): string {
  return new Date().toISOString();
}

export function createHttpKeyValue(input?: Partial<HttpKeyValue>): HttpKeyValue {
  return {
    id: input?.id ?? randomUUID(),
    key: input?.key ?? "",
    value: input?.value ?? "",
    enabled: input?.enabled ?? true,
  };
}

export function createDefaultCollection(name = HTTP_CLIENT_DEFAULT_COLLECTION_NAME): HttpCollectionEntity {
  const now = createNowIsoString();
  return {
    id: randomUUID(),
    name,
    isDefault: false,
    requests: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultEnvironment(name = "default"): HttpEnvironmentEntity {
  const now = createNowIsoString();
  return {
    id: randomUUID(),
    name,
    variables: {
      baseUrl: "",
      token: "",
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultRequest(name = "新请求"): HttpRequestEntity {
  const now = createNowIsoString();
  return {
    id: randomUUID(),
    sortId: ulid(),
    name,
    method: "GET",
    url: "",
    params: [createHttpKeyValue()],
    headers: [createHttpKeyValue()],
    bodyMode: "none",
    bodyText: "",
    lastStatus: null,
    lastDurationMs: null,
    lastExecutedAt: null,
    lastResponseSnapshot: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultConfigFile(): HttpClientConfigFile {
  const collection: HttpCollectionEntity = {
    id: HTTP_CLIENT_DEFAULT_COLLECTION_ID,
    name: HTTP_CLIENT_DEFAULT_COLLECTION_NAME,
    isDefault: true,
    requests: [],
    createdAt: createNowIsoString(),
    updatedAt: createNowIsoString(),
  };
  return {
    version: HTTP_CLIENT_CONFIG_VERSION,
    collections: [collection],
    environments: [createDefaultEnvironment()],
  };
}

export function cloneRequest(request: HttpRequestEntity): HttpRequestEntity {
  return {
    ...request,
    params: request.params.map((item) => ({ ...item })),
    headers: request.headers.map((item) => ({ ...item })),
  };
}

export function isHttpMethod(value: unknown): value is HttpMethod {
  return typeof value === "string" && (HTTP_METHODS as readonly string[]).includes(value);
}

export function normalizeBodyMode(method: HttpMethod, bodyMode: HttpBodyMode): HttpBodyMode {
  if (method === "GET" || method === "DELETE") {
    return bodyMode === "none" ? bodyMode : bodyMode;
  }
  return bodyMode;
}

export function sanitizeRequestEntity(input: HttpRequestEntity): HttpRequestEntity {
  return {
    ...input,
    sortId: input.sortId && input.sortId.length === 26 ? input.sortId : ulid(),
    name: input.name.trim() || "未命名请求",
    method: isHttpMethod(input.method) ? input.method : "GET",
    url: input.url.trim(),
    params: input.params.length > 0 ? input.params.map((item) => ({ ...item })) : [createHttpKeyValue()],
    headers: input.headers.length > 0 ? input.headers.map((item) => ({ ...item })) : [createHttpKeyValue()],
    bodyMode: input.bodyMode,
    bodyText: input.bodyText ?? "",
    lastStatus: typeof input.lastStatus === "number" ? input.lastStatus : null,
    lastDurationMs: typeof input.lastDurationMs === "number" ? input.lastDurationMs : null,
    lastExecutedAt: typeof input.lastExecutedAt === "string" ? input.lastExecutedAt : null,
    lastResponseSnapshot: input.lastResponseSnapshot ?? null,
    updatedAt: createNowIsoString(),
  };
}

export function clipResponseForSnapshot(response: HttpResponseResult): { response: HttpResponseResult; truncated: boolean } {
  const rawBytes = Buffer.byteLength(response.bodyRawText, "utf8");
  if (rawBytes <= HTTP_CLIENT_RESPONSE_SNAPSHOT_MAX_BYTES) {
    return { response, truncated: false };
  }

  const truncatedText = Buffer.from(response.bodyRawText, "utf8")
    .subarray(0, HTTP_CLIENT_RESPONSE_SNAPSHOT_MAX_BYTES)
    .toString("utf8");
  return {
    response: {
      ...response,
      bodyRawText: truncatedText,
      bodyText: truncatedText,
      bodyPrettyText: truncatedText,
    },
    truncated: true,
  };
}

export function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export function safePrettyJson(input: string): { isJson: boolean; displayText: string; prettyText: string } {
  try {
    const parsed = JSON.parse(input);
    return {
      isJson: true,
      displayText: JSON.stringify(parsed),
      prettyText: JSON.stringify(parsed, null, 2),
    };
  } catch {
    return {
      isJson: false,
      displayText: input,
      prettyText: input,
    };
  }
}
