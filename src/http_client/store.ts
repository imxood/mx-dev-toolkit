import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import {
  createDefaultCollection,
  createDefaultConfigFile,
  createDefaultEnvironment,
  createDefaultRequest,
  createNowIsoString,
  HTTP_CLIENT_CONFIG_FILE,
  HTTP_CLIENT_CONFIG_VERSION,
  HTTP_CLIENT_DEFAULT_COLLECTION_ID,
  HTTP_CLIENT_DEFAULT_COLLECTION_NAME,
  HttpClientConfigFile,
  HttpClientDraftState,
  HttpClientSnapshot,
  HttpClientStateStore,
  HttpCollectionEntity,
  HttpEnvironmentEntity,
  HttpRequestEntity,
  HttpResponseResult,
  clipResponseForSnapshot,
  createHttpKeyValue,
  isHttpMethod,
  sanitizeRequestEntity,
} from "./types";
import { newSortId, betweenSortIds } from "./sort_id";

const KEY_ACTIVE_REQUEST_ID = "httpClient.activeRequestId";
const KEY_ACTIVE_ENVIRONMENT_ID = "httpClient.activeEnvironmentId";
const KEY_LAST_LOAD_PROFILE = "httpClient.lastLoadProfile";
const KEY_SCRATCH_DRAFT = "httpClient.scratchDraft";

function getDraftKey(requestId: string): string {
  return `httpClient.draft.${requestId}`;
}

/** 返回 collection 中字典序最小的 sortId; 集合为空时返回 null. */
function minSortId(collection: HttpCollectionEntity): string | null {
  if (collection.requests.length === 0) {
    return null;
  }
  let min = collection.requests[0].sortId;
  for (let index = 1; index < collection.requests.length; index += 1) {
    const candidate = collection.requests[index].sortId;
    if (candidate < min) {
      min = candidate;
    }
  }
  return min;
}

export interface HttpClientStoreRequestLookup {
  request: HttpRequestEntity;
  collection: HttpCollectionEntity;
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
    let rawText: string;
    try {
      rawText = await fs.readFile(this.configPath, "utf8");
    } catch {
      const initialConfig = createDefaultConfigFile();
      await this.writeConfig(initialConfig);
      return this.configCache ?? initialConfig;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch (error) {
      throw new Error(`mx_http_client.json 解析失败: ${(error as Error).message}`);
    }
    const normalized = normalizeConfig(raw);
    this.configCache = normalized;
    await this.writeConfig(normalized);
    return normalized;
  }

  public async loadSnapshot(): Promise<HttpClientSnapshot> {
    const config = await this.ensureInitialized();
    return {
      config,
      activeRequestId: this.getActiveRequestId(),
      activeEnvironmentId: this.getActiveEnvironmentId(),
    };
  }

  public async loadConfig(): Promise<HttpClientConfigFile> {
    if (this.configCache) {
      return this.configCache;
    }
    return this.ensureInitialized();
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

  public async renameCollection(collectionId: string, name: string): Promise<HttpCollectionEntity> {
    const config = await this.ensureInitialized();
    const collection = config.collections.find((item) => item.id === collectionId);
    if (!collection) {
      throw new Error("集合不存在");
    }
    if (collection.isDefault) {
      throw new Error("默认集合不可重命名");
    }
    collection.name = name.trim() || collection.name;
    collection.updatedAt = createNowIsoString();
    await this.writeConfig(config);
    return collection;
  }

  public async deleteCollection(collectionId: string): Promise<void> {
    const config = await this.ensureInitialized();
    const collection = config.collections.find((item) => item.id === collectionId);
    if (!collection) {
      throw new Error("集合不存在");
    }
    if (collection.isDefault) {
      throw new Error("默认集合不可删除");
    }
    const defaultCollection = this.ensureDefaultCollection(config);
    // 把集合内的请求迁到默认集合
    for (const request of collection.requests) {
      defaultCollection.requests.push({
        ...request,
        updatedAt: createNowIsoString(),
      });
    }
    config.collections = config.collections.filter((item) => item.id !== collectionId);
    await this.writeConfig(config);
  }

  public getDefaultCollection(config: HttpClientConfigFile = this.configCache ?? createDefaultConfigFile()): HttpCollectionEntity {
    return this.ensureDefaultCollection(config);
  }

  private ensureDefaultCollection(config: HttpClientConfigFile): HttpCollectionEntity {
    const existing = config.collections.find((item) => item.isDefault);
    if (existing) {
      existing.id = HTTP_CLIENT_DEFAULT_COLLECTION_ID;
      existing.name = HTTP_CLIENT_DEFAULT_COLLECTION_NAME;
      existing.isDefault = true;
      this.absorbLegacyDefaultCollections(config, existing);
      return existing;
    }
    // 老 config 没有 isDefault 字段, 但可能已经有 name = "默认集合" 的集合.
    // 把它的 requests 合并过来, 升级为真默认集合, 删掉重复项.
    const legacy = config.collections.find(
      (item) => item.name === HTTP_CLIENT_DEFAULT_COLLECTION_NAME && item.id !== HTTP_CLIENT_DEFAULT_COLLECTION_ID
    );
    if (legacy) {
      legacy.id = HTTP_CLIENT_DEFAULT_COLLECTION_ID;
      legacy.name = HTTP_CLIENT_DEFAULT_COLLECTION_NAME;
      legacy.isDefault = true;
      config.collections = config.collections.filter(
        (item) => item.id === HTTP_CLIENT_DEFAULT_COLLECTION_ID || !this.isLegacyDefaultDuplicate(item, legacy)
      );
      this.absorbLegacyDefaultCollections(config, legacy);
      return legacy;
    }
    const collection: HttpCollectionEntity = {
      id: HTTP_CLIENT_DEFAULT_COLLECTION_ID,
      name: HTTP_CLIENT_DEFAULT_COLLECTION_NAME,
      isDefault: true,
      requests: [],
      createdAt: createNowIsoString(),
      updatedAt: createNowIsoString(),
    };
    config.collections.unshift(collection);
    return collection;
  }

  private absorbLegacyDefaultCollections(config: HttpClientConfigFile, target: HttpCollectionEntity): void {
    // 收尾: 任何还残留的 name = "默认集合" 但不是 target 自身的集合,
    // 把它的 requests 合并到 target, 然后删掉.
    const duplicates = config.collections.filter(
      (item) => item.id !== target.id && item.name === HTTP_CLIENT_DEFAULT_COLLECTION_NAME
    );
    if (duplicates.length === 0) {
      return;
    }
    const existingRequestIds = new Set(target.requests.map((r) => r.id));
    for (const dup of duplicates) {
      for (const req of dup.requests) {
        if (!existingRequestIds.has(req.id)) {
          target.requests.unshift({ ...req, updatedAt: createNowIsoString() });
          existingRequestIds.add(req.id);
        }
      }
    }
    config.collections = config.collections.filter((item) => item.id === target.id || item.name !== HTTP_CLIENT_DEFAULT_COLLECTION_NAME);
  }

  private isLegacyDefaultDuplicate(item: HttpCollectionEntity, primary: HttpCollectionEntity): boolean {
    if (item.id === primary.id) {
      return false;
    }
    return item.name === HTTP_CLIENT_DEFAULT_COLLECTION_NAME;
  }

  public findRequestById(requestId: string): HttpClientStoreRequestLookup | null {
    const config = this.configCache;
    if (!config) {
      return null;
    }
    for (const collection of config.collections) {
      const request = collection.requests.find((item) => item.id === requestId);
      if (request) {
        return { request, collection };
      }
    }
    return null;
  }

  public async saveRequest(
    request: HttpRequestEntity,
    options: { collectionId?: string | null; allowCreateInDefault?: boolean } = {}
  ): Promise<HttpRequestEntity> {
    const config = await this.ensureInitialized();
    const lookup = this.findRequestById(request.id);
    const targetCollection = this.resolveTargetCollection(config, lookup?.collection.id ?? options.collectionId ?? null);

    const normalized = sanitizeRequestEntity({
      ...request,
      createdAt: lookup?.request.createdAt ?? request.createdAt ?? createNowIsoString(),
    });

    if (lookup) {
      lookup.collection.requests = lookup.collection.requests.map((item) =>
        item.id === normalized.id ? { ...normalized, createdAt: lookup.request.createdAt } : item
      );
    } else {
      // 新建时强制 sortId < 已有最小, 保持数组 sortId 严格升序 (头部最小, 尾部最大)
      const currentMinSortId = minSortId(targetCollection);
      const finalSortId = betweenSortIds(null, currentMinSortId, new Set(targetCollection.requests.map((item) => item.sortId)));
      targetCollection.requests.unshift({ ...normalized, sortId: finalSortId, createdAt: normalized.createdAt });
    }

    await this.writeConfig(config);
    await this.clearDraft(normalized.id);
    await this.setActiveRequestId(normalized.id);
    return normalized;
  }

  public async upsertRequestById(
    request: HttpRequestEntity,
    snapshot: HttpResponseResult,
    fallbackCollectionId: string | null = null
  ): Promise<HttpRequestEntity> {
    const config = await this.ensureInitialized();
    const lookup = this.findRequestById(request.id);
    const targetCollection = lookup?.collection ?? this.resolveTargetCollection(config, fallbackCollectionId);
    const clipped = clipResponseForSnapshot(snapshot);
    const now = createNowIsoString();

    const nextRequest: HttpRequestEntity = sanitizeRequestEntity({
      ...(lookup?.request ?? request),
      ...request,
      id: lookup?.request.id ?? request.id,
      createdAt: lookup?.request.createdAt ?? request.createdAt ?? now,
      lastStatus: snapshot.status,
      lastDurationMs: snapshot.meta.durationMs,
      lastExecutedAt: now,
      lastResponseSnapshot: clipped.response,
      updatedAt: now,
    });

    if (lookup) {
      targetCollection.requests = targetCollection.requests.map((item) =>
        item.id === nextRequest.id ? { ...nextRequest, createdAt: lookup.request.createdAt } : item
      );
    } else {
      // 新建时强制 sortId < 已有最小, 保持数组 sortId 严格升序
      const currentMinSortId = minSortId(targetCollection);
      const finalSortId = betweenSortIds(null, currentMinSortId, new Set(targetCollection.requests.map((item) => item.sortId)));
      targetCollection.requests.unshift({ ...nextRequest, sortId: finalSortId, createdAt: nextRequest.createdAt });
    }

    await this.writeConfig(config);
    await this.clearDraft(nextRequest.id);
    await this.setActiveRequestId(nextRequest.id);
    return nextRequest;
  }

  public async renameRequest(requestId: string, name: string): Promise<HttpRequestEntity> {
    const config = await this.ensureInitialized();
    const lookup = this.findRequestById(requestId);
    if (!lookup) {
      throw new Error("请求不存在");
    }
    lookup.request.name = name.trim() || lookup.request.name;
    lookup.request.updatedAt = createNowIsoString();
    await this.writeConfig(config);
    return lookup.request;
  }

  public async deleteRequest(requestId: string): Promise<void> {
    const config = await this.ensureInitialized();
    let removed = false;
    for (const collection of config.collections) {
      const before = collection.requests.length;
      collection.requests = collection.requests.filter((item) => item.id !== requestId);
      if (collection.requests.length !== before) {
        removed = true;
      }
    }
    if (!removed) {
      throw new Error("请求不存在");
    }
    await this.writeConfig(config);
    await this.clearDraft(requestId);
    if (this.getActiveRequestId() === requestId) {
      await this.setActiveRequestId(null);
    }
  }

  public async duplicateRequest(requestId: string, options: { collectionId?: string | null } = {}): Promise<HttpRequestEntity> {
    const config = await this.ensureInitialized();
    const lookup = this.findRequestById(requestId);
    if (!lookup) {
      throw new Error("请求不存在");
    }
    const target = this.resolveTargetCollection(config, options.collectionId ?? lookup.collection.id);
    const now = createNowIsoString();
    const duplicate = sanitizeRequestEntity({
      ...lookup.request,
      id: randomUuid(),
      name: `${lookup.request.name} 副本`,
      createdAt: now,
      updatedAt: now,
    });
    const currentMinSortId = minSortId(target);
    const finalSortId = betweenSortIds(null, currentMinSortId, new Set(target.requests.map((item) => item.sortId)));
    target.requests.unshift({ ...duplicate, sortId: finalSortId, createdAt: now });
    await this.writeConfig(config);
    await this.setActiveRequestId(duplicate.id);
    return duplicate;
  }

  public async moveRequest(
    requestId: string,
    beforeRequestId: string | null,
    targetCollectionId: string
  ): Promise<HttpRequestEntity> {
    const config = await this.ensureInitialized();
    const lookup = this.findRequestById(requestId);
    if (!lookup) {
      throw new Error("请求不存在");
    }
    const target = this.resolveTargetCollection(config, targetCollectionId);

    // 同集合原位检测: filter 之后再算 insertIndex,跟 currentIndex 比
    if (target.id === lookup.collection.id) {
      if (beforeRequestId === requestId) {
        return lookup.request;
      }
      const currentIndex = lookup.collection.requests.findIndex((item) => item.id === requestId);
      const filtered = lookup.collection.requests.filter((item) => item.id !== requestId);
      const insertIndex = beforeRequestId
        ? filtered.findIndex((item) => item.id === beforeRequestId)
        : filtered.length;
      const safeInsertIndex = insertIndex < 0 ? filtered.length : insertIndex;
      if (safeInsertIndex === currentIndex) {
        return lookup.request;
      }
    }

    // 跨集合: 先从源集合删除
    if (target.id !== lookup.collection.id) {
      lookup.collection.requests = lookup.collection.requests.filter((item) => item.id !== requestId);
    }

    // filter 之后算 safeIndex (filter 改变了 beforeRequestId 的位置, 且跨集合时 A 已在源里删了)
    // 注意: filtered 是新数组, 但 target.requests 跟原数组是同一引用, 必须先替换
    target.requests = target.requests.filter((item) => item.id !== requestId);
    const insertIndex = beforeRequestId
      ? target.requests.findIndex((item) => item.id === beforeRequestId)
      : target.requests.length;
    const safeIndex = insertIndex < 0 ? target.requests.length : insertIndex;

    const prevSortId = safeIndex > 0 ? target.requests[safeIndex - 1].sortId : null;
    const nextSortId = safeIndex < target.requests.length ? target.requests[safeIndex].sortId : null;
    const newSortId = betweenSortIds(prevSortId, nextSortId, new Set(target.requests.map((item) => item.sortId)));
    const moving: HttpRequestEntity = {
      ...lookup.request,
      sortId: newSortId,
      updatedAt: createNowIsoString(),
    };

    target.requests.splice(safeIndex, 0, moving);
    await this.writeConfig(config);
    return moving;
  }

  public async createScratchRequest(
    collectionId: string | null = null,
    requestOverride?: HttpRequestEntity
  ): Promise<HttpRequestEntity> {
    const request = requestOverride
      ? sanitizeRequestEntity(requestOverride)
      : createDefaultRequest("新请求");
    await this.saveScratchDraft(request);
    await this.setActiveRequestId(request.id);
    return request;
  }

  public async createEnvironment(name: string): Promise<HttpEnvironmentEntity> {
    const config = await this.ensureInitialized();
    const now = createNowIsoString();
    const environment: HttpEnvironmentEntity = {
      id: randomUuid(),
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

  private resolveTargetCollection(config: HttpClientConfigFile, requestedId: string | null): HttpCollectionEntity {
    if (requestedId) {
      const target = config.collections.find((item) => item.id === requestedId);
      if (target) {
        return target;
      }
    }
    return this.ensureDefaultCollection(config);
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
        .filter((item) => Boolean(item && typeof item === "object"))
        .map((item) => normalizeCollection(item as Partial<HttpCollectionEntity>))
    : [];
  const environments = Array.isArray(value.environments)
    ? value.environments
        .filter((item): item is HttpEnvironmentEntity => Boolean(item && typeof item === "object"))
        .map((item) => ({
          id: typeof item.id === "string" && item.id ? item.id : randomUuid(),
          name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "未命名环境",
          variables: typeof item.variables === "object" && item.variables ? { ...item.variables } : {},
          createdAt: typeof item.createdAt === "string" ? item.createdAt : createNowIsoString(),
          updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : createNowIsoString(),
        }))
    : fallback.environments;

  const collectionsFinal = ensureDefaultCollectionInList(collections.length > 0 ? collections : [normalizeCollection({})]);
  return {
    version: HTTP_CLIENT_CONFIG_VERSION,
    collections: collectionsFinal,
    environments: environments.length > 0 ? environments : fallback.environments,
  };
}

function normalizeCollection(input: Partial<HttpCollectionEntity>): HttpCollectionEntity {
  const now = createNowIsoString();
  const requests = Array.isArray(input.requests)
    ? input.requests
        .filter((item): item is HttpRequestEntity => Boolean(item && typeof item === "object"))
        .map((item) => normalizeRequest(item))
    : [];
  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUuid(),
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : "未命名集合",
    isDefault: Boolean(input.isDefault),
    requests,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now,
  };
}

function ensureDefaultCollectionInList(collections: HttpCollectionEntity[]): HttpCollectionEntity[] {
  const next = collections.map((item) => ({ ...item }));
  let existing = next.find((item) => item.isDefault);
  if (!existing) {
    // 老 config 没有 isDefault 字段, 但可能 name 已经是 "默认集合"
    existing = next.find((item) => item.name === HTTP_CLIENT_DEFAULT_COLLECTION_NAME);
    if (existing) {
      existing.isDefault = true;
    }
  }
  if (existing) {
    existing.id = HTTP_CLIENT_DEFAULT_COLLECTION_ID;
    existing.name = HTTP_CLIENT_DEFAULT_COLLECTION_NAME;
    return next;
  }
  const collection: HttpCollectionEntity = {
    id: HTTP_CLIENT_DEFAULT_COLLECTION_ID,
    name: HTTP_CLIENT_DEFAULT_COLLECTION_NAME,
    isDefault: true,
    requests: [],
    createdAt: createNowIsoString(),
    updatedAt: createNowIsoString(),
  };
  next.unshift(collection);
  return next;
}

function normalizeRequest(input: Partial<HttpRequestEntity>): HttpRequestEntity {
  const now = createNowIsoString();
  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUuid(),
    sortId: typeof input.sortId === "string" && input.sortId.length === 26 ? input.sortId : newSortId(),
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : "未命名请求",
    method: isHttpMethod(input.method) ? input.method : "GET",
    url: typeof input.url === "string" ? input.url : "",
    params: Array.isArray(input.params) && input.params.length > 0 ? input.params.map(normalizeKeyValue) : [createHttpKeyValue()],
    headers: Array.isArray(input.headers) && input.headers.length > 0 ? input.headers.map(normalizeKeyValue) : [createHttpKeyValue()],
    bodyMode: input.bodyMode === "raw" || input.bodyMode === "json" || input.bodyMode === "none" ? input.bodyMode : "none",
    bodyText: typeof input.bodyText === "string" ? input.bodyText : "",
    lastStatus: typeof input.lastStatus === "number" ? input.lastStatus : null,
    lastDurationMs: typeof input.lastDurationMs === "number" ? input.lastDurationMs : null,
    lastExecutedAt: typeof input.lastExecutedAt === "string" ? input.lastExecutedAt : null,
    lastResponseSnapshot: input.lastResponseSnapshot && typeof input.lastResponseSnapshot === "object" ? input.lastResponseSnapshot : null,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : now,
  };
}

function normalizeKeyValue(input: Partial<HttpRequestEntity["params"][number]>): HttpRequestEntity["params"][number] {
  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUuid(),
    key: typeof input.key === "string" ? input.key : "",
    value: typeof input.value === "string" ? input.value : "",
    enabled: input.enabled !== false,
  };
}

function cloneRequest(request: HttpRequestEntity): HttpRequestEntity {
  return {
    ...request,
    params: request.params.map((item) => ({ ...item })),
    headers: request.headers.map((item) => ({ ...item })),
  };
}

function randomUuid(): string {
  return randomUUID();
}
