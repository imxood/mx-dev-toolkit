import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import {
  createDefaultCollection,
  createDefaultConfigFile,
  createDefaultRequest,
  createEmptyHistory,
  createNowIsoString,
  HTTP_CLIENT_CONFIG_FILE,
  HTTP_CLIENT_CONFIG_VERSION,
  HTTP_CLIENT_HISTORY_LIMIT,
  HttpClientConfigFile,
  HttpClientDraftState,
  HttpClientSnapshot,
  HttpClientStateStore,
  HttpCollectionEntity,
  HttpEnvironmentEntity,
  HttpHistoryRecord,
  HttpRequestEntity,
  cloneRequest,
  createHttpKeyValue,
  isHttpMethod,
  sanitizeRequestEntity,
} from "./types";

const KEY_ACTIVE_REQUEST_ID = "httpClient.activeRequestId";
const KEY_ACTIVE_ENVIRONMENT_ID = "httpClient.activeEnvironmentId";
const KEY_HISTORY = "httpClient.history";
const KEY_LAST_LOAD_PROFILE = "httpClient.lastLoadProfile";
const KEY_SCRATCH_DRAFT = "httpClient.scratchDraft";

function getDraftKey(requestId: string): string {
  return `httpClient.draft.${requestId}`;
}

export class HttpClientStore {
  private readonly configPath: string;
  private configCache: HttpClientConfigFile | null = null;
  private loadingConfigPromise: Promise<HttpClientConfigFile> | null = null;

  constructor(
    private readonly workspaceRoot: string,
    private readonly stateStore: HttpClientStateStore
  ) {
    this.configPath = path.join(workspaceRoot, HTTP_CLIENT_CONFIG_FILE);
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  public async ensureInitialized(): Promise<HttpClientConfigFile> {
    if (this.configCache) {
      return this.configCache;
    }

    if (this.loadingConfigPromise) {
      return this.loadingConfigPromise;
    }

    this.loadingConfigPromise = this.loadOrCreateConfig();
    try {
      return await this.loadingConfigPromise;
    } finally {
      this.loadingConfigPromise = null;
    }
  }

  private async loadOrCreateConfig(): Promise<HttpClientConfigFile> {
    try {
      await fs.access(this.configPath);
    } catch {
      const initialConfig = createDefaultConfigFile();
      await this.writeConfig(initialConfig);
      return this.configCache ?? initialConfig;
    }
    return this.loadConfigFromDisk();
  }

  public async loadSnapshot(): Promise<HttpClientSnapshot> {
    const config = await this.ensureInitialized();
    return {
      config,
      history: this.getHistory(),
      activeRequestId: this.getActiveRequestId(),
      activeEnvironmentId: this.getActiveEnvironmentId(),
    };
  }

  public async loadConfig(): Promise<HttpClientConfigFile> {
    if (this.configCache) {
      return this.configCache;
    }

    return this.loadConfigFromDisk();
  }

  private async loadConfigFromDisk(): Promise<HttpClientConfigFile> {
    const rawText = await fs.readFile(this.configPath, "utf8");
    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch (error) {
      throw new Error(`mx_http_client.json 解析失败: ${(error as Error).message}`);
    }
    const normalized = normalizeConfig(raw);
    if (normalized.version !== HTTP_CLIENT_CONFIG_VERSION) {
      normalized.version = HTTP_CLIENT_CONFIG_VERSION;
      await this.writeConfig(normalized);
      return this.configCache ?? normalized;
    }

    this.configCache = normalized;
    return normalized;
  }

  public async writeConfig(config: HttpClientConfigFile): Promise<void> {
    const normalized = normalizeConfig(config);
    await fs.writeFile(this.configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    this.configCache = normalized;
  }

  public async createCollection(name: string): Promise<HttpCollectionEntity> {
    const config = await this.ensureInitialized();
    const collection = createDefaultCollection(name.trim() || "新集合");
    config.collections.push(collection);
    await this.writeConfig(config);
    return collection;
  }

  public async renameCollection(collectionId: string, name: string): Promise<void> {
    const config = await this.ensureInitialized();
    const collection = config.collections.find((item) => item.id === collectionId);
    if (!collection) {
      throw new Error("集合不存在");
    }
    collection.name = name.trim() || collection.name;
    collection.updatedAt = createNowIsoString();
    await this.writeConfig(config);
  }

  public async deleteCollection(collectionId: string): Promise<void> {
    const config = await this.ensureInitialized();
    config.collections = config.collections.filter((item) => item.id !== collectionId);
    config.requests = config.requests.map((request) =>
      request.collectionId === collectionId
        ? {
            ...request,
            collectionId: null,
            updatedAt: createNowIsoString(),
          }
        : request
    );
    if (config.collections.length === 0) {
      config.collections.push(createDefaultCollection());
    }
    await this.writeConfig(config);
  }

  public async saveRequest(request: HttpRequestEntity): Promise<HttpRequestEntity> {
    const config = await this.ensureInitialized();
    const normalized = sanitizeRequestEntity({
      ...request,
      createdAt: request.createdAt || createNowIsoString(),
    });
    if (!normalized.collectionId) {
      normalized.collectionId = config.collections[0]?.id ?? createDefaultCollection().id;
      if (config.collections.length === 0) {
        config.collections.push({
          id: normalized.collectionId,
          name: "默认集合",
          createdAt: createNowIsoString(),
          updatedAt: createNowIsoString(),
        });
      }
    }
    const index = config.requests.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      const existed = config.requests[index];
      config.requests[index] = {
        ...normalized,
        createdAt: existed.createdAt,
      };
    } else {
      config.requests.push(normalized);
    }
    await this.writeConfig(config);
    await this.clearDraft(normalized.id);
    await this.setActiveRequestId(normalized.id);
    return normalized;
  }

  public async renameRequest(requestId: string, name: string): Promise<void> {
    const config = await this.ensureInitialized();
    const request = config.requests.find((item) => item.id === requestId);
    if (!request) {
      throw new Error("请求不存在");
    }
    request.name = name.trim() || request.name;
    request.updatedAt = createNowIsoString();
    await this.writeConfig(config);
  }

  public async deleteRequest(requestId: string): Promise<void> {
    const config = await this.ensureInitialized();
    config.requests = config.requests.filter((item) => item.id !== requestId);
    await this.writeConfig(config);
    await this.clearDraft(requestId);
    if (this.getActiveRequestId() === requestId) {
      await this.setActiveRequestId(null);
    }
  }

  public async duplicateRequest(requestId: string): Promise<HttpRequestEntity> {
    const config = await this.ensureInitialized();
    const request = config.requests.find((item) => item.id === requestId);
    if (!request) {
      throw new Error("请求不存在");
    }
    const now = createNowIsoString();
    const duplicate = sanitizeRequestEntity({
      ...cloneRequest(request),
      id: randomUUID(),
      name: `${request.name} 副本`,
      createdAt: now,
      updatedAt: now,
    });
    config.requests.push(duplicate);
    await this.writeConfig(config);
    await this.setActiveRequestId(duplicate.id);
    return duplicate;
  }

  public async setRequestFavorite(requestId: string, favorite: boolean): Promise<void> {
    const config = await this.ensureInitialized();
    const request = config.requests.find((item) => item.id === requestId);
    if (!request) {
      throw new Error("请求不存在");
    }
    request.favorite = favorite;
    request.updatedAt = createNowIsoString();
    await this.writeConfig(config);
  }

  public async createScratchRequest(
    collectionId: string | null = null,
    requestOverride?: HttpRequestEntity
  ): Promise<HttpRequestEntity> {
    const request = requestOverride
      ? sanitizeRequestEntity({
          ...requestOverride,
          collectionId: requestOverride.collectionId ?? collectionId,
        })
      : createDefaultRequest("新请求", collectionId);
    await this.saveScratchDraft(request);
    await this.setActiveRequestId(request.id);
    return request;
  }

  public async createEnvironment(name: string): Promise<HttpEnvironmentEntity> {
    const config = await this.ensureInitialized();
    const now = createNowIsoString();
    const environment: HttpEnvironmentEntity = {
      id: randomUUID(),
      name: name.trim() || "新环境",
      variables: {
        baseUrl: "",
        token: "",
      },
      createdAt: now,
      updatedAt: now,
    };
    config.environments.push(environment);
    await this.writeConfig(config);
    return environment;
  }

  public async saveEnvironment(environment: HttpEnvironmentEntity): Promise<HttpEnvironmentEntity> {
    const config = await this.ensureInitialized();
    const normalized: HttpEnvironmentEntity = {
      ...environment,
      name: environment.name.trim() || "未命名环境",
      variables: { ...environment.variables },
      updatedAt: createNowIsoString(),
      createdAt: environment.createdAt || createNowIsoString(),
    };
    const index = config.environments.findIndex((item) => item.id === normalized.id);
    if (index >= 0) {
      const existed = config.environments[index];
      config.environments[index] = {
        ...normalized,
        createdAt: existed.createdAt,
      };
    } else {
      config.environments.push(normalized);
    }
    await this.writeConfig(config);
    return normalized;
  }

  public async deleteEnvironment(environmentId: string): Promise<void> {
    const config = await this.ensureInitialized();
    config.environments = config.environments.filter((item) => item.id !== environmentId);
    await this.writeConfig(config);
    if (this.getActiveEnvironmentId() === environmentId) {
      await this.setActiveEnvironmentId(null);
    }
  }

  public async saveDraft(request: HttpRequestEntity, dirty: boolean): Promise<void> {
    if (!dirty) {
      await this.clearDraft(request.id);
      return;
    }
    await this.stateStore.update(getDraftKey(request.id), cloneRequest(request));
  }

  public getDraft(requestId: string): HttpClientDraftState {
    const draft = this.stateStore.get<HttpRequestEntity>(getDraftKey(requestId)) ?? null;
    return {
      draft: draft ? normalizeRequest(draft) : null,
      dirty: Boolean(draft),
    };
  }

  public async saveScratchDraft(request: HttpRequestEntity): Promise<void> {
    await this.stateStore.update(KEY_SCRATCH_DRAFT, cloneRequest(request));
  }

  public getScratchDraft(): HttpRequestEntity | null {
    const draft = this.stateStore.get<HttpRequestEntity>(KEY_SCRATCH_DRAFT) ?? null;
    return draft ? normalizeRequest(draft) : null;
  }

  public async clearDraft(requestId: string): Promise<void> {
    await this.stateStore.update(getDraftKey(requestId), undefined);
    const scratch = this.getScratchDraft();
    if (scratch?.id === requestId) {
      await this.stateStore.update(KEY_SCRATCH_DRAFT, undefined);
    }
  }

  public getHistory(): HttpHistoryRecord[] {
    const history = this.stateStore.get<HttpHistoryRecord[]>(KEY_HISTORY, createEmptyHistory()) ?? [];
    return history.map((record) => ({
      ...record,
      request: normalizeRequest(record.request),
    }));
  }

  public async recordHistory(record: HttpHistoryRecord): Promise<void> {
    const nextHistory = [record, ...this.getHistory().filter((item) => item.id !== record.id)].slice(
      0,
      HTTP_CLIENT_HISTORY_LIMIT
    );
    await this.stateStore.update(KEY_HISTORY, nextHistory);
  }

  public getHistoryItem(historyId: string): HttpHistoryRecord | null {
    return this.getHistory().find((item) => item.id === historyId) ?? null;
  }

  public getActiveRequestId(): string | null {
    return this.stateStore.get<string | null>(KEY_ACTIVE_REQUEST_ID, null) ?? null;
  }

  public async setActiveRequestId(requestId: string | null): Promise<void> {
    await this.stateStore.update(KEY_ACTIVE_REQUEST_ID, requestId);
  }

  public getActiveEnvironmentId(): string | null {
    return this.stateStore.get<string | null>(KEY_ACTIVE_ENVIRONMENT_ID, null) ?? null;
  }

  public async setActiveEnvironmentId(environmentId: string | null): Promise<void> {
    await this.stateStore.update(KEY_ACTIVE_ENVIRONMENT_ID, environmentId);
  }

  public getLastLoadProfile<T>(defaultValue: T): T {
    return this.stateStore.get<T>(KEY_LAST_LOAD_PROFILE, defaultValue) ?? defaultValue;
  }

  public async setLastLoadProfile(profile: unknown): Promise<void> {
    await this.stateStore.update(KEY_LAST_LOAD_PROFILE, profile);
  }
}

function normalizeConfig(raw: unknown): HttpClientConfigFile {
  const fallback = createDefaultConfigFile();
  if (!raw || typeof raw !== "object") {
    return fallback;
  }
  const value = raw as Partial<HttpClientConfigFile>;
  const collections = Array.isArray(value.collections)
    ? value.collections
        .filter((item): item is HttpCollectionEntity => Boolean(item && typeof item === "object"))
        .map((item) => ({
          id: typeof item.id === "string" && item.id ? item.id : randomUUID(),
          name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "未命名集合",
          createdAt: typeof item.createdAt === "string" ? item.createdAt : createNowIsoString(),
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : createNowIsoString(),
        }))
    : fallback.collections;
  const requests = Array.isArray(value.requests)
    ? value.requests
        .filter((item): item is HttpRequestEntity => Boolean(item && typeof item === "object"))
        .map((item) => normalizeRequest(item))
    : fallback.requests;
  const environments = Array.isArray(value.environments)
    ? value.environments
        .filter((item): item is HttpEnvironmentEntity => Boolean(item && typeof item === "object"))
        .map((item) => ({
          id: typeof item.id === "string" && item.id ? item.id : randomUUID(),
          name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "未命名环境",
          variables: typeof item.variables === "object" && item.variables ? { ...item.variables } : {},
          createdAt: typeof item.createdAt === "string" ? item.createdAt : createNowIsoString(),
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : createNowIsoString(),
        }))
    : fallback.environments;

  return {
    version: typeof value.version === "number" ? value.version : HTTP_CLIENT_CONFIG_VERSION,
    collections: collections.length > 0 ? collections : fallback.collections,
    requests,
    environments: environments.length > 0 ? environments : fallback.environments,
  };
}

function normalizeRequest(input: HttpRequestEntity): HttpRequestEntity {
  const now = createNowIsoString();
  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUUID(),
    collectionId: typeof input.collectionId === "string" ? input.collectionId : null,
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : "未命名请求",
    method: isHttpMethod(input.method) ? input.method : "GET",
    url: typeof input.url === "string" ? input.url : "",
    params: Array.isArray(input.params) && input.params.length > 0 ? input.params.map(normalizeKeyValue) : [createHttpKeyValue()],
    headers: Array.isArray(input.headers) && input.headers.length > 0 ? input.headers.map(normalizeKeyValue) : [createHttpKeyValue()],
    bodyMode: input.bodyMode === "raw" || input.bodyMode === "json" || input.bodyMode === "none" ? input.bodyMode : "none",
    bodyText: typeof input.bodyText === "string" ? input.bodyText : "",
    favorite: Boolean(input.favorite),
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now,
  };
}

function normalizeKeyValue(input: Partial<HttpRequestEntity["params"][number]>): HttpRequestEntity["params"][number] {
  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUUID(),
    key: typeof input.key === "string" ? input.key : "",
    value: typeof input.value === "string" ? input.value : "",
    enabled: input.enabled !== false,
  };
}
