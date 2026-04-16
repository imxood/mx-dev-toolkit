import { randomUUID } from "crypto";
import { ToastNotifyMessage, ToastToWebviewMessage } from "../toast/types";

export const HTTP_CLIENT_CONFIG_VERSION = 1;
export const HTTP_CLIENT_CONFIG_FILE = "mx_http_client.json";
export const HTTP_CLIENT_HISTORY_LIMIT = 50;
export const HTTP_CLIENT_LOAD_TEST_ERROR_SAMPLE_LIMIT = 20;
export const HTTP_CLIENT_LOAD_TEST_MAX_CONCURRENCY = 50;
export const HTTP_CLIENT_LOAD_TEST_MAX_REQUESTS = 10000;
export const HTTP_CLIENT_LOAD_TEST_MAX_TIMEOUT_MS = 120000;
export const HTTP_CLIENT_DEFAULT_TIMEOUT_MS = 30000;
export const HTTP_CLIENT_DEFAULT_LOAD_TEST_TIMEOUT_MS = 30000;
export const HTTP_CLIENT_WEBVIEW_BUILD_ID = "2026-04-16-01";
export const HTTP_CLIENT_RESPONSE_ACK_TIMEOUT_MS = 400;

export const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type HttpBodyMode = "none" | "raw" | "json";

export interface HttpKeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface HttpCollectionEntity {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface HttpRequestEntity {
  id: string;
  collectionId: string | null;
  name: string;
  method: HttpMethod;
  url: string;
  params: HttpKeyValue[];
  headers: HttpKeyValue[];
  bodyMode: HttpBodyMode;
  bodyText: string;
  favorite: boolean;
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
  requests: HttpRequestEntity[];
  environments: HttpEnvironmentEntity[];
}

export interface HttpResponseSummary {
  status: number | null;
  statusText: string;
  durationMs: number;
  ok: boolean;
  sizeBytes: number;
}

export interface HttpHistoryRecord {
  id: string;
  request: HttpRequestEntity;
  responseSummary: HttpResponseSummary;
  environmentId: string | null;
  executedAt: string;
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
  selectedHistoryId: string | null;
  activeEnvironmentId: string | null;
  draft: HttpRequestEntity | null;
  history: HttpHistoryRecord[];
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
  history: HttpHistoryRecord[];
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
  | {
      type: "httpClient/createRequest";
      payload: {
        collectionId: string | null;
        request?: HttpRequestEntity;
      };
    }
  | { type: "httpClient/createEnvironment" }
  | { type: "httpClient/renameRequestPrompt"; payload: { requestId: string } }
  | { type: "httpClient/deleteRequest"; payload: { requestId: string } }
  | { type: "httpClient/duplicateRequest"; payload: { requestId: string } }
  | { type: "httpClient/toggleFavorite"; payload: { requestId: string; favorite: boolean } }
  | { type: "httpClient/selectEnvironment"; payload: { environmentId: string | null } }
  | { type: "httpClient/saveEnvironment"; payload: { environment: HttpEnvironmentEntity } }
  | { type: "httpClient/deleteEnvironment"; payload: { environmentId: string } }
  | { type: "httpClient/selectHistory"; payload: { historyId: string } }
  | { type: "httpClient/openResponseEditor"; payload: { content: string; language: string } }
  | { type: "httpClient/loadTest/start"; payload: HttpClientLoadTestPayload }
  | { type: "httpClient/loadTest/stop" }
  | { type: "httpClient/responseAck"; payload: HttpClientResponseAckPayload }
  | { type: "httpClient/frontendLog"; payload: HttpClientFrontendLogPayload };

export type ExtensionToWebviewMessage =
  | ToastToWebviewMessage
  | { type: "httpClient/state"; payload: HttpClientViewState }
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

export function createDefaultCollection(name = "默认集合"): HttpCollectionEntity {
  const now = createNowIsoString();
  return {
    id: randomUUID(),
    name,
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

export function createDefaultRequest(name = "新请求", collectionId: string | null = null): HttpRequestEntity {
  const now = createNowIsoString();
  return {
    id: randomUUID(),
    collectionId,
    name,
    method: "GET",
    url: "",
    params: [createHttpKeyValue()],
    headers: [createHttpKeyValue()],
    bodyMode: "none",
    bodyText: "",
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultConfigFile(): HttpClientConfigFile {
  return {
    version: HTTP_CLIENT_CONFIG_VERSION,
    collections: [createDefaultCollection()],
    requests: [],
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

export function createEmptyHistory(): HttpHistoryRecord[] {
  return [];
}

export function sanitizeRequestEntity(input: HttpRequestEntity): HttpRequestEntity {
  return {
    ...input,
    name: input.name.trim() || "未命名请求",
    method: isHttpMethod(input.method) ? input.method : "GET",
    url: input.url.trim(),
    params: input.params.length > 0 ? input.params.map((item) => ({ ...item })) : [createHttpKeyValue()],
    headers: input.headers.length > 0 ? input.headers.map((item) => ({ ...item })) : [createHttpKeyValue()],
    bodyMode: input.bodyMode,
    bodyText: input.bodyText ?? "",
    updatedAt: createNowIsoString(),
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
