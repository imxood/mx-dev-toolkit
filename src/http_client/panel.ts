import { randomUUID } from "crypto";
import * as vscode from "vscode";
import { importCurlToRequest } from "./curl_import";
import { HttpLoadTestRunner } from "./load_runner";
import { resolveRequest } from "./resolver";
import { HttpRequestRunner } from "./runner";
import { HttpClientStore } from "./store";
import { normalizeToastInput, ToastService } from "../toast/service";
import {
  ExtensionToWebviewMessage,
  HTTP_CLIENT_DEFAULT_LOAD_TEST_TIMEOUT_MS,
  HTTP_CLIENT_DEFAULT_TIMEOUT_MS,
  HTTP_CLIENT_RESPONSE_ACK_TIMEOUT_MS,
  HTTP_CLIENT_WEBVIEW_BUILD_ID,
  HttpClientError,
  HttpClientLoadTestPayload,
  HttpClientSendPayload,
  HttpClientViewState,
  HttpEnvironmentEntity,
  HttpHistoryRecord,
  HttpLoadTestProfile,
  HttpLoadTestProgress,
  HttpLoadTestResult,
  HttpRequestEntity,
  HttpResponseResult,
  WebviewToExtensionMessage,
  cloneRequest,
  createDefaultRequest,
  createNowIsoString,
} from "./types";
import { getHttpClientHtml } from "./webview";

const DEFAULT_LOAD_TEST_PROFILE: HttpLoadTestProfile = {
  totalRequests: 20,
  concurrency: 5,
  timeoutMs: HTTP_CLIENT_DEFAULT_LOAD_TEST_TIMEOUT_MS,
};

export class HttpClientPanelController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private readonly stateChangedEmitter = new vscode.EventEmitter<HttpClientViewState>();
  private readonly requestRunner = new HttpRequestRunner();
  private readonly loadTestRunner = new HttpLoadTestRunner(this.requestRunner);
  private currentDraft: HttpRequestEntity | null = null;
  private selectedHistoryId: string | null = null;
  private dirty = false;
  private currentResponse: HttpResponseResult | null = null;
  private requestAbortController: AbortController | null = null;
  private requestRunning = false;
  private loadTestResult: HttpLoadTestResult | null = null;
  private loadTestProgress: HttpLoadTestProgress | null = null;
  private activeTab: HttpClientViewState["activeTab"] = "params";
  private responseTab: HttpClientViewState["responseTab"] = "body";
  private loadTestAbortController: AbortController | null = null;
  private pendingHostCommand: "send" | "save" | "loadTest" | "focusCurlImport" | null = null;
  private currentWebviewBuildId: string | null = null;
  private responseAckTimer: NodeJS.Timeout | null = null;
  private readonly toastHostDisposable: { dispose(): void };

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly channel: vscode.OutputChannel,
    private readonly store: HttpClientStore,
    private readonly toastService: ToastService
  ) {
    this.toastHostDisposable = this.toastService.registerHost({
      id: "httpClient.panel",
      priority: 100,
      isAvailable: () => Boolean(this.panel && this.panel.visible && this.currentWebviewBuildId === HTTP_CLIENT_WEBVIEW_BUILD_ID),
      postToast: async (toast) => {
        if (!this.panel) {
          return false;
        }
        return this.panel.webview.postMessage({
          type: "mxToast/show",
          payload: toast,
        });
      },
    });
  }

  public readonly onDidChangeState = this.stateChangedEmitter.event;

  public async show(viewState?: HttpClientViewState): Promise<void> {
    if (this.panel) {
      await this.ensureDraftLoaded();
      await this.ensureCurrentWebview("show");
      this.panel.reveal(vscode.ViewColumn.One, false);
      await this.postState(viewState);
      return;
    }

    await this.ensureDraftLoaded();

    this.panel = vscode.window.createWebviewPanel(
      "mx-dev-toolkit.httpClient",
      "Mx HTTP Client",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.html = getHttpClientHtml(this.panel.webview, viewState ?? (await this.buildViewState()), createNonce());
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
        void this.handleMessage(message);
      },
      undefined,
      this.context.subscriptions
    );
    this.panel.onDidDispose(
      () => {
        this.clearResponseAckWait();
        this.panel = null;
        this.stopLoadTest();
      },
      undefined,
      this.context.subscriptions
    );
  }

  public async triggerCommand(command: "send" | "save" | "loadTest" | "focusCurlImport"): Promise<void> {
    const wasVisible = Boolean(this.panel);
    await this.show();
    if (!this.panel) {
      return;
    }
    this.pendingHostCommand = wasVisible ? null : command;
    await this.postMessage({
      type: "httpClient/hostCommand",
      payload: { command },
    });
  }

  public dispose(): void {
    this.clearResponseAckWait();
    this.stopLoadTest();
    this.stateChangedEmitter.dispose();
    this.toastHostDisposable.dispose();
    this.panel?.dispose();
  }

  public async getViewState(): Promise<HttpClientViewState> {
    await this.ensureDraftLoaded();
    return this.buildViewState();
  }

  public async openRequest(requestId: string): Promise<void> {
    const viewState = await this.selectSavedRequest(requestId, { postState: false });
    if (!viewState) {
      return;
    }
    await this.show(viewState);
  }

  public async openHistory(historyId: string): Promise<void> {
    const viewState = await this.selectHistoryItem(historyId, { postState: false });
    if (!viewState) {
      return;
    }
    await this.show(viewState);
  }

  public async createRequest(collectionId: string | null): Promise<void> {
    const viewState = await this.createScratchRequest(collectionId, { postState: false });
    await this.show(viewState);
  }

  public async createCollection(): Promise<void> {
    await this.createCollectionByPrompt();
  }

  public async renameCollection(collectionId: string): Promise<void> {
    await this.renameCollectionByPrompt(collectionId);
  }

  public async removeCollection(collectionId: string): Promise<void> {
    await this.deleteCollection(collectionId);
  }

  public async createEnvironment(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: "请输入环境名称",
      ignoreFocusOut: true,
    });
    if (!name) {
      return;
    }
    const environment = await this.store.createEnvironment(name);
    await this.store.setActiveEnvironmentId(environment.id);
    await this.postState();
    await this.notifyToast(`环境已创建: ${environment.name}`, "success");
  }

  public async selectEnvironment(
    environmentId: string | null,
    options: { postState?: boolean } = {}
  ): Promise<void> {
    await this.store.setActiveEnvironmentId(environmentId);
    if (options.postState !== false) {
      await this.postState();
    }
  }

  public async saveEnvironment(environment: HttpEnvironmentEntity): Promise<void> {
    const saved = await this.store.saveEnvironment(environment);
    await this.postState();
    await this.notifyToast(`环境已保存: ${saved.name}`, "success");
  }

  public async deleteEnvironment(environmentId: string): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage("确认删除该环境?", { modal: true }, "删除");
    if (confirmed !== "删除") {
      return;
    }
    await this.store.deleteEnvironment(environmentId);
    await this.postState();
    await this.notifyToast("环境已删除", "success");
  }

  public async renameRequest(requestId: string): Promise<void> {
    await this.renameRequestByPrompt(requestId);
  }

  public async removeRequest(requestId: string): Promise<void> {
    await this.deleteRequest(requestId);
  }

  public async duplicateSavedRequest(requestId: string): Promise<void> {
    await this.duplicateRequest(requestId);
  }

  public async setRequestFavorite(requestId: string, favorite: boolean): Promise<void> {
    await this.toggleFavorite(requestId, favorite);
  }

  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case "mxToast/notify":
        if (this.panel && this.currentWebviewBuildId === HTTP_CLIENT_WEBVIEW_BUILD_ID) {
          await this.panel.webview.postMessage({
            type: "mxToast/show",
            payload: normalizeToastInput({
              ...message.payload,
              source: "http_client.webview",
            }),
          });
          return;
        }
        await this.toastService.notify({
          ...message.payload,
          source: "http_client.webview",
        });
        return;
      case "httpClient/init":
        this.currentWebviewBuildId = message.payload?.buildId ?? null;
        this.channel.appendLine(`[HttpClient] webview init build=${this.currentWebviewBuildId ?? "legacy"}`);
        await this.ensureDraftLoaded();
        if (this.pendingHostCommand) {
          const command = this.pendingHostCommand;
          this.pendingHostCommand = null;
          await this.postMessage({
            type: "httpClient/hostCommand",
            payload: { command },
          });
        }
        return;
      case "httpClient/uiStateChanged":
        this.activeTab = message.payload.activeTab;
        this.responseTab = message.payload.responseTab;
        return;
      case "httpClient/draftChanged":
        await this.handleDraftChanged(message.payload.request, message.payload.dirty);
        return;
      case "httpClient/cancelRequest":
        this.stopRequest();
        await this.postState();
        return;
      case "httpClient/selectRequest":
        await this.selectSavedRequest(message.payload.requestId, { postState: false });
        return;
      case "httpClient/createScratchRequest":
        await this.createScratchRequest(null);
        return;
      case "httpClient/save":
        if (!(await this.ensureCurrentWebview("save", message.payload.request))) {
          return;
        }
        await this.saveDraft(message.payload.request);
        return;
      case "httpClient/send":
        if (!(await this.ensureCurrentWebview("send", message.payload.request))) {
          return;
        }
        await this.sendRequest(message.payload);
        return;
      case "httpClient/importCurlPrompt":
        await this.importCurlByPrompt();
        return;
      case "httpClient/createCollectionPrompt":
        await this.createCollectionByPrompt();
        return;
      case "httpClient/renameCollectionPrompt":
        await this.renameCollectionByPrompt(message.payload.collectionId);
        return;
      case "httpClient/deleteCollection":
        await this.deleteCollection(message.payload.collectionId);
        return;
      case "httpClient/createRequest":
        await this.createScratchRequest(message.payload.collectionId, {
          postState: false,
          request: message.payload.request,
        });
        return;
      case "httpClient/createEnvironment":
        await this.createEnvironment();
        return;
      case "httpClient/renameRequestPrompt":
        await this.renameRequestByPrompt(message.payload.requestId);
        return;
      case "httpClient/deleteRequest":
        await this.deleteRequest(message.payload.requestId);
        return;
      case "httpClient/duplicateRequest":
        await this.duplicateRequest(message.payload.requestId);
        return;
      case "httpClient/toggleFavorite":
        await this.toggleFavorite(message.payload.requestId, message.payload.favorite, { postState: false });
        return;
      case "httpClient/selectEnvironment":
        await this.selectEnvironment(message.payload.environmentId, { postState: false });
        return;
      case "httpClient/saveEnvironment":
        await this.saveEnvironment(message.payload.environment);
        return;
      case "httpClient/deleteEnvironment":
        await this.deleteEnvironment(message.payload.environmentId);
        return;
      case "httpClient/selectHistory":
        await this.selectHistoryItem(message.payload.historyId, { postState: false });
        return;
      case "httpClient/loadTest/start":
        if (!(await this.ensureCurrentWebview("loadTest", message.payload.request))) {
          return;
        }
        await this.startLoadTest(message.payload);
        return;
      case "httpClient/loadTest/stop":
        this.stopLoadTest();
        await this.postLoadTestResult(this.loadTestResult ?? createCancelledLoadTestResult(this.loadTestProgress));
        await this.postState();
        return;
      case "httpClient/responseAck":
        this.clearResponseAckWait();
        this.channel.appendLine(`[HttpClient] response ack source=${message.payload.source}`);
        return;
      case "httpClient/frontendLog":
        this.channel.appendLine(
          `[HttpClientWebview][${message.payload.level}] ${message.payload.scope}: ${message.payload.message}`
        );
        return;
      default:
        return;
    }
  }

  private async handleDraftChanged(request: HttpRequestEntity, dirty: boolean): Promise<void> {
    this.currentDraft = cloneRequest(request);
    this.dirty = dirty;
    await this.store.setActiveRequestId(request.id);
    const config = await this.store.ensureInitialized();
    const savedRequest = config.requests.find((item) => item.id === request.id);
    if (savedRequest) {
      await this.store.saveDraft(this.currentDraft, dirty);
    } else {
      await this.store.saveScratchDraft(this.currentDraft);
    }
  }

  private async selectSavedRequest(
    requestId: string,
    options: { postState?: boolean } = {}
  ): Promise<HttpClientViewState | null> {
    const config = await this.store.ensureInitialized();
    const savedRequest = config.requests.find((item) => item.id === requestId);
    if (!savedRequest) {
      await this.postError(`未找到请求: ${requestId}`);
      return null;
    }
    const draftState = this.store.getDraft(requestId);
    this.currentDraft = draftState.draft ? cloneRequest(draftState.draft) : cloneRequest(savedRequest);
    this.selectedHistoryId = null;
    this.dirty = draftState.dirty;
    await this.store.setActiveRequestId(requestId);
    this.currentResponse = null;
    const viewState = await this.buildViewState();
    if (options.postState !== false) {
      await this.postState(viewState);
    }
    return viewState;
  }

  private async createScratchRequest(
    collectionId: string | null,
    options: { postState?: boolean; request?: HttpRequestEntity } = {}
  ): Promise<HttpClientViewState> {
    const draft = await this.store.createScratchRequest(collectionId, options.request);
    this.currentDraft = cloneRequest(draft);
    this.selectedHistoryId = null;
    this.dirty = true;
    this.currentResponse = null;
    this.responseTab = "body";
    const viewState = await this.buildViewState();
    if (options.postState !== false) {
      await this.postState(viewState);
    }
    return viewState;
  }

  private async saveDraft(request: HttpRequestEntity): Promise<void> {
    try {
      const savedRequest = await this.store.saveRequest(request);
      this.currentDraft = cloneRequest(savedRequest);
      this.selectedHistoryId = null;
      this.dirty = false;
      this.channel.appendLine(`[HttpClient] saved request ${savedRequest.method} ${savedRequest.name}`);
      await this.postState();
    } catch (error) {
      await this.postError((error as Error).message);
    }
  }

  private async sendRequest(payload: HttpClientSendPayload): Promise<void> {
    const config = await this.store.ensureInitialized();
    const environment = payload.environmentId
      ? config.environments.find((item) => item.id === payload.environmentId) ?? null
      : null;
    const timeoutMs = payload.timeoutMs ?? HTTP_CLIENT_DEFAULT_TIMEOUT_MS;
    this.currentDraft = cloneRequest(payload.request);
    await this.handleDraftChanged(payload.request, this.dirty);
    try {
      this.clearResponseAckWait();
      this.stopRequest();
      this.requestAbortController = new AbortController();
      this.requestRunning = true;
      this.currentResponse = null;
      this.responseTab = "body";
      await this.postState();
      this.channel.appendLine(
        `[HttpClient] request started id=${payload.request.id} env=${payload.environmentId ?? "none"} timeout=${timeoutMs}ms`
      );
      const resolved = resolveRequest(payload.request, {
        environment,
        timeoutMs,
      });
      this.channel.appendLine(
        `[HttpClient] request resolved method=${resolved.method} unresolved=${resolved.unresolvedVariables.length}`
      );
      this.channel.appendLine(`[HttpClient] send ${resolved.method} ${resolved.url}`);
      const response = await this.requestRunner.run(resolved, {
        signal: this.requestAbortController.signal,
      });
      this.currentResponse = response;
      this.requestRunning = false;
      this.requestAbortController = null;
      this.channel.appendLine(
        `[HttpClient] response ${response.status} ${response.statusText || ""} ${response.meta.durationMs}ms ${response.meta.sizeBytes}B`
      );
      const record = this.createHistoryRecord(payload.request, payload.environmentId, response);
      this.responseTab = "body";
      this.channel.appendLine(`[HttpClient] posting response to webview record=${record.id}`);
      const responseDelivered = await this.postMessage({
        type: "httpClient/response",
        payload: response,
      });
      this.channel.appendLine(`[HttpClient] response delivered=${responseDelivered}`);
      if (responseDelivered) {
        this.scheduleResponseAckWait();
      }
      await this.postState();
      this.channel.appendLine("[HttpClient] response state refreshed");
      this.channel.appendLine(`[HttpClient] history save scheduled ${record.id}`);
      void this.persistHistoryRecord(record);
    } catch (error) {
      this.clearResponseAckWait();
      const message = error instanceof HttpClientError ? error.details.message : (error as Error).message;
      this.channel.appendLine(`[HttpClient] request failed: ${message}`);
      await this.postError(message);
      this.channel.appendLine("[HttpClient] error posted to webview");
    } finally {
      this.requestRunning = false;
      this.requestAbortController = null;
      await this.postState();
      this.channel.appendLine("[HttpClient] request cycle completed");
    }
  }

  private async persistHistoryRecord(record: HttpHistoryRecord): Promise<void> {
    try {
      this.channel.appendLine(`[HttpClient] history save started ${record.id}`);
      await this.store.recordHistory(record);
      this.channel.appendLine(`[HttpClient] history saved ${record.id}`);
      await this.postState();
      this.channel.appendLine(`[HttpClient] history state refreshed ${record.id}`);
    } catch (error) {
      this.channel.appendLine(`[HttpClient] history save failed: ${(error as Error).message}`);
    }
  }

  private async importCurlByPrompt(): Promise<void> {
    let raw = await this.promptCurlInput();
    while (raw) {
      const currentDraft = this.currentDraft ? cloneRequest(this.currentDraft) : createDefaultRequest();
      try {
        const target = hasMeaningfulRequestContent(currentDraft)
          ? await vscode.window.showWarningMessage(
              "检测到当前请求已有内容. 请选择导入方式.",
              { modal: true },
              "新建请求导入",
              "覆盖当前请求"
            )
          : "覆盖当前请求";
        if (!target) {
          return;
        }

        const base =
          target === "新建请求导入"
            ? createDefaultRequest("导入 cURL", currentDraft.collectionId)
            : currentDraft;
        const nextRequest = importCurlToRequest(raw, base);
        this.currentDraft = cloneRequest(nextRequest);
        this.dirty = true;
        await this.handleDraftChanged(nextRequest, true);
        await this.postState();
        await this.notifyToast("cURL 已导入", "success");
        return;
      } catch (error) {
        const retry = await vscode.window.showWarningMessage(
          `cURL 导入失败: ${(error as Error).message}`,
          { modal: true },
          "重新编辑"
        );
        if (retry !== "重新编辑") {
          await this.postError(`cURL 导入失败: ${(error as Error).message}`);
          return;
        }
        raw = await this.promptCurlInput(raw);
      }
    }
  }

  private async promptCurlInput(value?: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
      prompt: "请输入 cURL 命令",
      placeHolder: CURL_PROMPT_PLACEHOLDER,
      value,
      ignoreFocusOut: true,
    });
  }

  private async createCollectionByPrompt(): Promise<void> {
    const name = await vscode.window.showInputBox({
      prompt: "请输入集合名称",
      ignoreFocusOut: true,
    });
    if (!name) {
      return;
    }
    await this.store.createCollection(name);
    await this.postState();
  }

  private async renameCollectionByPrompt(collectionId: string): Promise<void> {
    const config = await this.store.ensureInitialized();
    const collection = config.collections.find((item) => item.id === collectionId);
    if (!collection) {
      await this.postError("集合不存在");
      return;
    }
    const name = await vscode.window.showInputBox({
      prompt: "请输入新的集合名称",
      value: collection.name,
      ignoreFocusOut: true,
    });
    if (!name) {
      return;
    }
    await this.store.renameCollection(collectionId, name);
    await this.postState();
  }

  private async deleteCollection(collectionId: string): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
      "删除集合后, 其中请求会移动到未分组. 是否继续?",
      { modal: true },
      "删除"
    );
    if (confirmed !== "删除") {
      await this.postState();
      return;
    }
    await this.store.deleteCollection(collectionId);
    await this.postState();
  }

  private async renameRequestByPrompt(requestId: string): Promise<void> {
    const config = await this.store.ensureInitialized();
    const request = config.requests.find((item) => item.id === requestId) ?? this.currentDraft;
    if (!request) {
      await this.postError("请求不存在");
      return;
    }
    const name = await vscode.window.showInputBox({
      prompt: "请输入新的请求名称",
      value: request.name,
      ignoreFocusOut: true,
    });
    if (!name) {
      return;
    }
    if (config.requests.some((item) => item.id === requestId)) {
      await this.store.renameRequest(requestId, name);
      if (this.currentDraft?.id === requestId) {
        this.currentDraft.name = name;
      }
    } else if (this.currentDraft?.id === requestId) {
      this.currentDraft.name = name;
      await this.handleDraftChanged(this.currentDraft, true);
    }
    await this.postState();
  }

  private async deleteRequest(requestId: string): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage("确认删除该请求?", { modal: true }, "删除");
    if (confirmed !== "删除") {
      await this.postState();
      return;
    }
    await this.store.deleteRequest(requestId);
    if (this.currentDraft?.id === requestId) {
      this.currentDraft = null;
      this.selectedHistoryId = null;
      this.dirty = false;
      this.currentResponse = null;
    }
    await this.ensureDraftLoaded();
    await this.postState();
  }

  private async duplicateRequest(requestId: string): Promise<void> {
    try {
      const duplicate = await this.store.duplicateRequest(requestId);
      this.currentDraft = cloneRequest(duplicate);
      this.selectedHistoryId = null;
      this.dirty = false;
      await this.postState();
    } catch (error) {
      await this.postError((error as Error).message);
      await this.postState();
    }
  }

  private async toggleFavorite(
    requestId: string,
    favorite: boolean,
    options: { postState?: boolean } = {}
  ): Promise<void> {
    try {
      await this.store.setRequestFavorite(requestId, favorite);
      if (this.currentDraft?.id === requestId) {
        this.currentDraft.favorite = favorite;
      }
      if (options.postState !== false) {
        await this.postState();
      }
    } catch (error) {
      await this.postError((error as Error).message);
    }
  }

  private async selectHistoryItem(
    historyId: string,
    options: { postState?: boolean } = {}
  ): Promise<HttpClientViewState | null> {
    const history = this.store.getHistoryItem(historyId);
    if (!history) {
      await this.postError("历史记录不存在");
      return null;
    }
    this.currentDraft = cloneRequest(history.request);
    this.selectedHistoryId = historyId;
    this.dirty = false;
    this.currentResponse = null;
    this.responseTab = "body";
    await this.store.setActiveRequestId(history.request.id);
    const viewState = await this.buildViewState();
    if (options.postState !== false) {
      await this.postState(viewState);
    }
    return viewState;
  }

  private async startLoadTest(payload: HttpClientLoadTestPayload): Promise<void> {
    this.stopLoadTest();
    const config = await this.store.ensureInitialized();
    const environment = payload.environmentId
      ? config.environments.find((item) => item.id === payload.environmentId) ?? null
      : null;
    this.loadTestAbortController = new AbortController();
    this.loadTestProgress = {
      completedRequests: 0,
      totalRequests: payload.profile.totalRequests,
      successCount: 0,
      failureCount: 0,
      running: true,
    };
    this.loadTestResult = null;
    this.responseTab = "loadTest";
    await this.store.setLastLoadProfile(payload.profile);
    try {
      const resolved = resolveRequest(payload.request, {
        environment,
        timeoutMs: payload.profile.timeoutMs,
      });
      this.channel.appendLine(
        `[HttpLoadTest] start total=${payload.profile.totalRequests} concurrency=${payload.profile.concurrency} timeout=${payload.profile.timeoutMs}`
      );
      const result = await this.loadTestRunner.run(resolved, payload.profile, {
        signal: this.loadTestAbortController.signal,
        onProgress: async (progress) => {
          this.loadTestProgress = progress;
          await this.postMessage({
            type: "httpClient/loadTest/progress",
            payload: progress,
          });
        },
      });
      this.loadTestResult = result;
      this.loadTestProgress = null;
      this.channel.appendLine(
        `[HttpLoadTest] done success=${result.successCount} failure=${result.failureCount} rps=${result.rps.toFixed(2)}`
      );
      await this.postLoadTestResult(result);
      await this.postState();
    } catch (error) {
      if (this.loadTestAbortController?.signal.aborted) {
        return;
      }
      const message = error instanceof HttpClientError ? error.details.message : (error as Error).message;
      this.loadTestProgress = null;
      await this.postError(message);
      await this.postState();
    }
  }

  private stopLoadTest(): void {
    if (!this.loadTestAbortController) {
      return;
    }
    this.loadTestAbortController.abort();
    this.loadTestAbortController = null;
    if (this.loadTestProgress) {
      this.loadTestResult = createCancelledLoadTestResult(this.loadTestProgress);
      this.loadTestProgress = null;
    }
  }

  private stopRequest(): void {
    if (!this.requestAbortController) {
      return;
    }
    this.requestAbortController.abort();
    this.requestAbortController = null;
    this.requestRunning = false;
  }

  private async postLoadTestResult(result: HttpLoadTestResult): Promise<void> {
    await this.postMessage({
      type: "httpClient/loadTest/result",
      payload: result,
    });
  }

  private createHistoryRecord(
    request: HttpRequestEntity,
    environmentId: string | null,
    response: HttpResponseResult
  ): HttpHistoryRecord {
    return {
      id: randomUUID(),
      request: cloneRequest(request),
      environmentId,
      executedAt: createNowIsoString(),
      responseSummary: {
        status: response.status,
        statusText: response.statusText,
        durationMs: response.meta.durationMs,
        ok: response.ok,
        sizeBytes: response.meta.sizeBytes,
      },
    };
  }

  private async buildViewState(): Promise<HttpClientViewState> {
    const snapshot = await this.store.loadSnapshot();
    const loadTestProfile = this.store.getLastLoadProfile(DEFAULT_LOAD_TEST_PROFILE);
    return {
      config: snapshot.config,
      activeRequestId: this.currentDraft?.id ?? snapshot.activeRequestId,
      selectedHistoryId: this.selectedHistoryId,
      activeEnvironmentId: snapshot.activeEnvironmentId,
      draft: this.currentDraft ? cloneRequest(this.currentDraft) : null,
      history: snapshot.history,
      response: this.currentResponse,
      requestRunning: this.requestRunning,
      loadTestProfile,
      loadTestResult: this.loadTestResult,
      loadTestProgress: this.loadTestProgress,
      dirty: this.dirty,
      activeTab: this.activeTab,
      responseTab: this.responseTab,
    };
  }

  private async ensureDraftLoaded(): Promise<void> {
    if (this.currentDraft) {
      return;
    }
    const snapshot = await this.store.loadSnapshot();
    const activeRequestId = snapshot.activeRequestId;
    if (activeRequestId) {
      const draftState = this.store.getDraft(activeRequestId);
      if (draftState.draft) {
        this.currentDraft = cloneRequest(draftState.draft);
        this.dirty = draftState.dirty;
        return;
      }
      const savedRequest = snapshot.config.requests.find((item) => item.id === activeRequestId);
      if (savedRequest) {
        this.currentDraft = cloneRequest(savedRequest);
        this.dirty = false;
        return;
      }
    }
    const scratchDraft = this.store.getScratchDraft();
    if (scratchDraft) {
      this.currentDraft = cloneRequest(scratchDraft);
      this.dirty = true;
      return;
    }
    const firstRequest = snapshot.config.requests[0];
    if (firstRequest) {
      this.currentDraft = cloneRequest(firstRequest);
      this.dirty = false;
      await this.store.setActiveRequestId(firstRequest.id);
      return;
    }
    this.currentDraft = createDefaultRequest("新请求", snapshot.config.collections[0]?.id ?? null);
    this.dirty = true;
    await this.store.saveScratchDraft(this.currentDraft);
    await this.store.setActiveRequestId(this.currentDraft.id);
  }

  private async postState(viewState?: HttpClientViewState): Promise<void> {
    const payload = viewState ?? (await this.buildViewState());
    await this.postMessage({
      type: "httpClient/state",
      payload,
    });
    this.stateChangedEmitter.fire(payload);
  }

  private async postError(message: string): Promise<void> {
    await this.postMessage({
      type: "httpClient/error",
      payload: { message },
    });
  }

  private async notifyToast(
    message: string,
    kind: "info" | "success" | "warning" | "error",
    copyText = message
  ): Promise<void> {
    await this.toastService.notify({
      source: "http_client.panel",
      message,
      kind,
      copyText,
    });
  }

  private async postMessage(message: ExtensionToWebviewMessage): Promise<boolean> {
    if (!this.panel) {
      return false;
    }
    return this.panel.webview.postMessage(message);
  }

  private async ensureCurrentWebview(
    command: "show" | "send" | "save" | "loadTest" | "focusCurlImport",
    request?: HttpRequestEntity
  ): Promise<boolean> {
    if (!this.panel) {
      return false;
    }
    if (this.currentWebviewBuildId === HTTP_CLIENT_WEBVIEW_BUILD_ID) {
      return true;
    }
    if (request) {
      this.currentDraft = cloneRequest(request);
      this.dirty = true;
      this.currentResponse = null;
    }
    this.channel.appendLine(
      `[HttpClient] stale webview detected current=${this.currentWebviewBuildId ?? "legacy"} expected=${HTTP_CLIENT_WEBVIEW_BUILD_ID}, reload`
    );
    this.clearResponseAckWait();
    this.pendingHostCommand = command === "show" ? null : command;
    this.currentWebviewBuildId = null;
    this.panel.webview.html = getHttpClientHtml(this.panel.webview, await this.buildViewState(), createNonce());
    return false;
  }

  private scheduleResponseAckWait(): void {
    this.clearResponseAckWait();
    this.responseAckTimer = setTimeout(() => {
      this.responseAckTimer = null;
      void this.reloadPanelFromState("response ack timeout");
    }, HTTP_CLIENT_RESPONSE_ACK_TIMEOUT_MS);
  }

  private clearResponseAckWait(): void {
    if (!this.responseAckTimer) {
      return;
    }
    clearTimeout(this.responseAckTimer);
    this.responseAckTimer = null;
  }

  private async reloadPanelFromState(reason: string): Promise<void> {
    if (!this.panel || !this.currentResponse || this.requestRunning) {
      return;
    }
    this.channel.appendLine(`[HttpClient] ${reason}, reload panel from current state`);
    this.currentWebviewBuildId = null;
    this.panel.webview.html = getHttpClientHtml(this.panel.webview, await this.buildViewState(), createNonce());
  }
}

function hasMeaningfulRequestContent(request: HttpRequestEntity | null): boolean {
  if (!request) {
    return false;
  }

  if (request.url.trim() || request.bodyText.trim()) {
    return true;
  }

  if (request.method !== "GET" || request.name.trim() !== "新请求") {
    return true;
  }

  return request.params.some((item) => item.key.trim() || item.value.trim()) || request.headers.some((item) => item.key.trim() || item.value.trim());
}

const CURL_PROMPT_PLACEHOLDER = "curl -X POST https://example.com -H 'Content-Type: application/json' -d '{\"name\":\"demo\"}'";

function createNonce(): string {
  return randomUUID().replace(/-/g, "");
}

function createCancelledLoadTestResult(progress: HttpLoadTestProgress | null): HttpLoadTestResult {
  return {
    totalRequests: progress?.totalRequests ?? 0,
    completedRequests: progress?.completedRequests ?? 0,
    successCount: progress?.successCount ?? 0,
    failureCount: progress?.failureCount ?? 0,
    successRate: 0,
    averageDurationMs: 0,
    minDurationMs: 0,
    p50DurationMs: 0,
    p95DurationMs: 0,
    maxDurationMs: 0,
    rps: 0,
    durationMs: 0,
    statusCounts: [],
    errorSamples: [],
    cancelled: true,
  };
}
