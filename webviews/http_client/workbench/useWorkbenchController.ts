import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ulid } from "ulid";
import type {
  ExtensionToWebviewMessage,
  HttpClientViewState,
  HttpEnvironmentEntity,
  HttpRequestEntity,
  HttpResponseResult,
  WebviewToExtensionMessage,
} from "../../../src/http_client/types";
import { getBootstrap } from "../shared/bootstrap";
import { getVscodeApi } from "../shared/vscode";
import {
  buildCollectionGroups,
  buildEnvironmentItems,
  createInitialSidebarUiState,
  type SidebarCollectionGroup,
  type SidebarEnvironmentDraft,
  type SidebarEnvironmentDraftRow,
  type SidebarEnvironmentItem,
  type SidebarTab,
  type SidebarUiState,
} from "../shared/sidebar_model";
import {
  applyWorkbenchMessage,
  buildUrlHint,
  cloneRequest,
  cloneViewState,
  createScratchRequestLocally,
  createEmptyKeyValue,
  createFallbackViewState,
  createInitialUiState,
  getDisplayedResponseText,
  highlightText,
  moveRequestLocally,
  patchWorkbenchSession,
  selectRequestLocally,
  setEnvironmentLocally,
  syncParamsFromUrl,
  syncUrlFromParams,
  updateDraftLocally,
  type WorkbenchUiState,
} from "../shared/workbench_model";

export interface WorkbenchController {
  buildId: string;
  viewState: HttpClientViewState;
  uiState: WorkbenchUiState;
  sidebarUiState: SidebarUiState;
  hasHostState: boolean;
  displayedResponseText: string;
  highlightedResponseHtml: string;
  collectionGroups: SidebarCollectionGroup[];
  environmentItems: SidebarEnvironmentItem[];
  selectedEnvironment: HttpEnvironmentEntity | null;
  environmentDraft: SidebarEnvironmentDraft | null;
  pendingRequestAction: { requestId: string; kind: "duplicate" | "delete" } | null;
  setSidebarTab(tab: SidebarTab): void;
  setSidebarKeyword(keyword: string): void;
  toggleCollectionGroup(groupKey: string): void;
  createRequest(collectionId?: string | null): void;
  createCollection(): void;
  renameCollection(collectionId: string): void;
  deleteCollection(collectionId: string): void;
  createEnvironment(): void;
  selectRequest(requestId: string): void;
  renameRequest(requestId: string): void;
  duplicateRequest(requestId: string): void;
  deleteRequest(requestId: string): void;
  exportCurl(requestId: string): void;
  moveRequest(requestId: string, beforeRequestId: string | null, targetCollectionId: string): void;
  selectEnvironment(environmentId: string | null): void;
  setEnvironmentDraftName(name: string): void;
  updateEnvironmentVariable(id: string, field: "key" | "value", value: string): void;
  addEnvironmentVariable(): void;
  removeEnvironmentVariable(id: string): void;
  saveEnvironment(): void;
  deleteEnvironment(): void;
  setRequestTab(tab: HttpClientViewState["activeTab"]): void;
  setResponseTab(tab: HttpClientViewState["responseTab"]): void;
  setMethod(method: HttpRequestEntity["method"]): void;
  setUrl(url: string): void;
  setEnvironment(environmentId: string | null): void;
  updateKeyValue(section: "params" | "headers", id: string, field: "key" | "value" | "enabled", value: string | boolean): void;
  addKeyValue(section: "params" | "headers"): void;
  removeKeyValue(section: "params" | "headers", id: string): void;
  setBodyMode(mode: HttpRequestEntity["bodyMode"]): void;
  setBodyText(text: string): void;
  formatJsonBody(): boolean;
  formatResponseJson(): boolean;
  setResponseSearch(keyword: string): void;
  toggleResponsePretty(): void;
  performSend(): void;
  performSave(): void;
  cancelRequest(): void;
  performLoadTest(): void;
  stopLoadTest(): void;
  setLoadTestProfileField(field: "totalRequests" | "concurrency" | "timeoutMs", value: number): void;
  importCurl(): void;
  copyResponse(): Promise<void>;
  openResponseEditor(): void;
  copyHeaderValue(value: string): Promise<void>;
}

export function useWorkbenchController(): WorkbenchController {
  const bootstrap = getBootstrap("workbench");
  const vscode = useMemo(() => getVscodeApi<WebviewToExtensionMessage>(), []);
  const [viewState, setViewState] = useState<HttpClientViewState>(() => {
    return bootstrap.initialState ? cloneViewState(bootstrap.initialState) : createFallbackViewState();
  });
  const [uiState, setUiState] = useState<WorkbenchUiState>(createInitialUiState);
  const [sidebarUiState, setSidebarUiState] = useState<SidebarUiState>(createInitialSidebarUiState);
  const [hasHostState, setHasHostState] = useState(Boolean(bootstrap.initialState));
  const [environmentDraft, setEnvironmentDraft] = useState<SidebarEnvironmentDraft | null>(null);
  const [pendingRequestAction, setPendingRequestAction] = useState<{ requestId: string; kind: "duplicate" | "delete" } | null>(null);
  const viewStateRef = useRef(viewState);
  const uiStateRef = useRef(uiState);
  const sidebarUiStateRef = useRef(sidebarUiState);
  const environmentRowIdRef = useRef(1);
  const pendingAckSourceRef = useRef<"bootstrap" | "state" | "response">("bootstrap");
  const lastAckKeyRef = useRef("");

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

  useEffect(() => {
    sidebarUiStateRef.current = sidebarUiState;
  }, [sidebarUiState]);

  const createEnvironmentRow = useCallback((key = "", value = ""): SidebarEnvironmentDraftRow => {
    const id = `env-row-${environmentRowIdRef.current++}`;
    return { id, key, value };
  }, []);

  const postMessage = useCallback(
    (message: WebviewToExtensionMessage) => {
      vscode?.postMessage(message);
    },
    [vscode]
  );

  const logFrontend = useCallback(
    (level: "info" | "warn" | "error", scope: string, message: string) => {
      postMessage({
        type: "httpClient/frontendLog",
        payload: {
          level,
          scope,
          message,
        },
      });
    },
    [postMessage]
  );

  const notifyToast = useCallback(
    (message: string, kind: "info" | "success" | "warning" | "error" = "info", durationMs?: number) => {
      postMessage({
        type: "mxToast/notify",
        payload: {
          message,
          kind,
          copyText: message,
          durationMs,
        },
      });
    },
    [postMessage]
  );

  const emitUiState = useCallback(
    (nextViewState: HttpClientViewState) => {
      postMessage({
        type: "httpClient/uiStateChanged",
        payload: {
          activeTab: nextViewState.activeTab,
          responseTab: nextViewState.responseTab,
        },
      });
    },
    [postMessage]
  );

  const emitDraftState = useCallback(
    (request: HttpRequestEntity, dirty: boolean) => {
      postMessage({
        type: "httpClient/draftChanged",
        payload: {
          request,
          dirty,
        },
      });
    },
    [postMessage]
  );

  const replaceViewState = useCallback((nextViewState: HttpClientViewState) => {
    viewStateRef.current = nextViewState;
    setViewState(nextViewState);
  }, []);

  const replaceUiState = useCallback((nextUiState: WorkbenchUiState) => {
    uiStateRef.current = nextUiState;
    setUiState(nextUiState);
  }, []);

  const updateViewState = useCallback(
    (producer: (current: HttpClientViewState) => HttpClientViewState, options?: { emitUiState?: boolean; emitDraft?: boolean }) => {
      const nextState = producer(viewStateRef.current);
      replaceViewState(nextState);

      if (options?.emitUiState) {
        emitUiState(nextState);
      }

      if (options?.emitDraft && nextState.draft) {
        emitDraftState(cloneRequest(nextState.draft), nextState.dirty);
      }

      return nextState;
    },
    [emitDraftState, emitUiState, replaceViewState]
  );

  const updateUiState = useCallback(
    (producer: (current: WorkbenchUiState) => WorkbenchUiState) => {
      const nextUiState = producer(uiStateRef.current);
      replaceUiState(nextUiState);
      return nextUiState;
    },
    [replaceUiState]
  );

  const updateSidebarUiState = useCallback((producer: (current: SidebarUiState) => SidebarUiState) => {
    const nextUiState = producer(sidebarUiStateRef.current);
    sidebarUiStateRef.current = nextUiState;
    setSidebarUiState(nextUiState);
    return nextUiState;
  }, []);

  const setSidebarTab = useCallback((tab: SidebarTab) => {
    updateSidebarUiState((current) => ({
      ...current,
      activeTab: tab,
    }));
  }, [updateSidebarUiState]);

  const setSidebarKeyword = useCallback((keyword: string) => {
    updateSidebarUiState((current) => ({
      ...current,
      keyword,
    }));
  }, [updateSidebarUiState]);

  const toggleCollectionGroup = useCallback((groupKey: string) => {
    updateSidebarUiState((current) => ({
      ...current,
      expandedCollectionGroups: {
        ...current.expandedCollectionGroups,
        [groupKey]: current.expandedCollectionGroups[groupKey] === false,
      },
    }));
  }, [updateSidebarUiState]);

  const mutateDraft = useCallback(
    (mutator: (draft: HttpRequestEntity) => HttpRequestEntity) => {
      updateViewState(
        (current) => updateDraftLocally(current, mutator),
        { emitDraft: true }
      );
      updateUiState((current) => ({
        ...current,
        lastErrorMessage: "",
      }));
    },
    [updateUiState, updateViewState]
  );

  const setRequestTab = useCallback(
    (tab: HttpClientViewState["activeTab"]) => {
      updateViewState(
        (current) =>
          patchWorkbenchSession(current, {
            activeTab: tab,
          }),
        { emitUiState: true }
      );
    },
    [updateViewState]
  );

  const setResponseTab = useCallback(
    (tab: HttpClientViewState["responseTab"]) => {
      updateViewState(
        (current) =>
          patchWorkbenchSession(current, {
            responseTab: tab,
          }),
        { emitUiState: true }
      );
    },
    [updateViewState]
  );

  const setMethod = useCallback(
    (method: HttpRequestEntity["method"]) => {
      mutateDraft((draft) => ({
        ...cloneRequest(draft),
        method,
      }));
    },
    [mutateDraft]
  );

  const setUrl = useCallback(
    (url: string) => {
      mutateDraft((draft) => {
        const next = cloneRequest(draft);
        next.url = url.trim();
        return syncParamsFromUrl(next, createId);
      });
    },
    [mutateDraft]
  );

  const setEnvironment = useCallback(
    (environmentId: string | null) => {
      updateViewState((current) => setEnvironmentLocally(current, environmentId));
      updateSidebarUiState((current) => ({
        ...current,
        selectedEnvironmentId: environmentId,
      }));
      postMessage({
        type: "httpClient/selectEnvironment",
        payload: {
          environmentId,
        },
      });
    },
    [postMessage, updateSidebarUiState, updateViewState]
  );

  const createRequest = useCallback(
    (collectionId: string | null = null) => {
      const nextDraft = createWorkbenchScratchRequest();
      updateSidebarUiState((current) => ({
        ...current,
        activeTab: "collections",
      }));
      updateViewState((current) => createScratchRequestLocally(current, nextDraft));
      updateUiState((current) => ({
        ...current,
        lastErrorMessage: "",
      }));
      postMessage({
        type: "httpClient/createRequest",
        payload: {
          collectionId,
          request: cloneRequest(nextDraft),
        },
      });
    },
    [postMessage, updateSidebarUiState, updateUiState, updateViewState]
  );

  const createCollection = useCallback(() => {
    setSidebarTab("collections");
    postMessage({ type: "httpClient/createCollectionPrompt" });
  }, [postMessage, setSidebarTab]);

  const renameCollection = useCallback(
    (collectionId: string) => {
      postMessage({
        type: "httpClient/renameCollectionPrompt",
        payload: { collectionId },
      });
    },
    [postMessage]
  );

  const deleteCollection = useCallback(
    (collectionId: string) => {
      postMessage({
        type: "httpClient/deleteCollection",
        payload: { collectionId },
      });
    },
    [postMessage]
  );

  const createEnvironment = useCallback(() => {
    setSidebarTab("environments");
    updateSidebarUiState((current) => ({
      ...current,
      selectedEnvironmentId: null,
    }));
    postMessage({ type: "httpClient/createEnvironment" });
  }, [postMessage, setSidebarTab, updateSidebarUiState]);

  const selectRequest = useCallback(
    (requestId: string) => {
      updateViewState((current) => selectRequestLocally(current, requestId));
      updateUiState((current) => ({
        ...current,
        lastErrorMessage: "",
      }));
      postMessage({
        type: "httpClient/selectRequest",
        payload: { requestId },
      });
    },
    [postMessage, updateUiState, updateViewState]
  );

  const renameRequest = useCallback(
    (requestId: string, name?: string) => {
      const nextName = name ?? window.prompt("请输入新的请求名称") ?? "";
      if (!nextName.trim()) {
        return;
      }
      postMessage({
        type: "httpClient/renameRequest",
        payload: { requestId, name: nextName.trim() },
      });
    },
    [postMessage]
  );

  const duplicateRequest = useCallback(
    (requestId: string) => {
      setPendingRequestAction({ requestId, kind: "duplicate" });
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
          postMessage({
            type: "httpClient/duplicateRequest",
            payload: { requestId },
          });
        });
        return;
      }
      postMessage({
        type: "httpClient/duplicateRequest",
        payload: { requestId },
      });
    },
    [postMessage]
  );

  const deleteRequest = useCallback(
    (requestId: string) => {
      setPendingRequestAction({ requestId, kind: "delete" });
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
          postMessage({
            type: "httpClient/deleteRequest",
            payload: { requestId },
          });
        });
        return;
      }
      postMessage({
        type: "httpClient/deleteRequest",
        payload: { requestId },
      });
    },
    [postMessage]
  );

  const exportCurl = useCallback(
    (requestId: string) => {
      postMessage({
        type: "httpClient/exportCurl",
        payload: { requestId },
      });
    },
    [postMessage]
  );

  const moveRequest = useCallback(
    (requestId: string, beforeRequestId: string | null, targetCollectionId: string) => {
      updateViewState((current) => moveRequestLocally(current, requestId, beforeRequestId, targetCollectionId));
      postMessage({
        type: "httpClient/moveRequest",
        payload: { requestId, beforeRequestId, targetCollectionId },
      });
    },
    [postMessage, updateViewState]
  );

  const updateKeyValue = useCallback(
    (section: "params" | "headers", id: string, field: "key" | "value" | "enabled", value: string | boolean) => {
      mutateDraft((draft) => {
        const next = cloneRequest(draft);
        const item = next[section].find((entry) => entry.id === id);
        if (!item) {
          return next;
        }

        if (field === "enabled") {
          item.enabled = Boolean(value);
        } else if (field === "key") {
          item.key = String(value);
        } else {
          item.value = String(value);
        }

        return section === "params" ? syncUrlFromParams(next) : next;
      });
    },
    [mutateDraft]
  );

  const addKeyValue = useCallback(
    (section: "params" | "headers") => {
      mutateDraft((draft) => {
        const next = cloneRequest(draft);
        next[section] = [...next[section], createEmptyKeyValue(createId)];
        return section === "params" ? syncUrlFromParams(next) : next;
      });
    },
    [mutateDraft]
  );

  const removeKeyValue = useCallback(
    (section: "params" | "headers", id: string) => {
      mutateDraft((draft) => {
        const next = cloneRequest(draft);
        next[section] = next[section].filter((entry) => entry.id !== id);
        if (next[section].length === 0) {
          next[section] = [createEmptyKeyValue(createId)];
        }
        return section === "params" ? syncUrlFromParams(next) : next;
      });
    },
    [mutateDraft]
  );

  const setBodyMode = useCallback(
    (mode: HttpRequestEntity["bodyMode"]) => {
      mutateDraft((draft) => ({
        ...cloneRequest(draft),
        bodyMode: mode,
      }));
    },
    [mutateDraft]
  );

  const setBodyText = useCallback(
    (text: string) => {
      mutateDraft((draft) => ({
        ...cloneRequest(draft),
        bodyText: text,
      }));
    },
    [mutateDraft]
  );

  const formatJsonBody = useCallback(() => {
    const currentDraft = viewStateRef.current.draft;
    if (!currentDraft) {
      notifyToast("没有可格式化的请求体", "warning");
      return false;
    }

    try {
      const formattedText = JSON.stringify(JSON.parse(currentDraft.bodyText || "{}"), null, 2);
      mutateDraft((draft) => {
        const next = cloneRequest(draft);
        next.bodyMode = "json";
        next.bodyText = formattedText;
        return next;
      });
      notifyToast("JSON 已格式化", "success");
      return true;
    } catch {
      notifyToast("当前内容不是合法 JSON", "warning");
      return false;
    }
  }, [mutateDraft, notifyToast]);

  const performSend = useCallback(() => {
    const currentViewState = viewStateRef.current;
    if (currentViewState.requestRunning) {
      postMessage({ type: "httpClient/cancelRequest" });
      return;
    }

    if (!currentViewState.draft) {
      return;
    }

    const urlHint = buildUrlHint(currentViewState.draft.url);
    if (urlHint) {
      updateUiState((current) => ({
        ...current,
        lastErrorMessage: "",
      }));
      updateViewState(
        (current) =>
          patchWorkbenchSession(current, {
            response: null,
            responseTab: "body",
          }),
        { emitUiState: true }
      );
      notifyToast(urlHint, "warning", 3000);
      return;
    }

    updateUiState((current) => ({
      ...current,
      lastErrorMessage: "",
    }));
    updateViewState((current) =>
      patchWorkbenchSession(current, {
        requestRunning: true,
        response: null,
        responseTab: "body",
      })
    );
    postMessage({
      type: "httpClient/send",
      payload: {
        request: cloneRequest(currentViewState.draft),
        environmentId: currentViewState.activeEnvironmentId,
        timeoutMs: 30000,
      },
    });
  }, [notifyToast, postMessage, updateUiState, updateViewState]);

  const performSave = useCallback(() => {
    const currentDraft = viewStateRef.current.draft;
    if (!currentDraft) {
      return;
    }
    postMessage({
      type: "httpClient/save",
      payload: {
        request: cloneRequest(currentDraft),
      },
    });
  }, [postMessage]);

  const cancelRequest = useCallback(() => {
    postMessage({ type: "httpClient/cancelRequest" });
  }, [postMessage]);

  const performLoadTest = useCallback(() => {
    const currentViewState = viewStateRef.current;
    if (!currentViewState.draft) {
      notifyToast("没有可压测的请求", "warning");
      return;
    }

    if (currentViewState.loadTestProgress?.running) {
      postMessage({ type: "httpClient/loadTest/stop" });
      return;
    }

    const urlHint = buildUrlHint(currentViewState.draft.url);
    if (urlHint) {
      notifyToast(urlHint, "warning", 3000);
      return;
    }

    updateViewState(
      (current) =>
        patchWorkbenchSession(current, {
          responseTab: "loadTest",
          loadTestResult: null,
          loadTestProgress: {
            completedRequests: 0,
            totalRequests: current.loadTestProfile.totalRequests,
            successCount: 0,
            failureCount: 0,
            running: true,
          },
        }),
      { emitUiState: true }
    );
    postMessage({
      type: "httpClient/loadTest/start",
      payload: {
        request: cloneRequest(currentViewState.draft),
        environmentId: currentViewState.activeEnvironmentId,
        profile: { ...currentViewState.loadTestProfile },
      },
    });
  }, [notifyToast, postMessage, updateUiState, updateViewState]);

  const stopLoadTest = useCallback(() => {
    postMessage({ type: "httpClient/loadTest/stop" });
  }, [postMessage]);

  const setLoadTestProfileField = useCallback(
    (field: "totalRequests" | "concurrency" | "timeoutMs", value: number) => {
      updateViewState((current) =>
        patchWorkbenchSession(current, {
          loadTestProfile: {
            ...current.loadTestProfile,
            [field]: Number.isFinite(value) ? value : current.loadTestProfile[field],
          },
        })
      );
    },
    [updateViewState]
  );

  const importCurl = useCallback(() => {
    postMessage({ type: "httpClient/importCurlPrompt" });
  }, [postMessage]);

  const copyResponse = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getDisplayedResponseText(viewStateRef.current.response, uiStateRef.current.responsePretty));
      notifyToast("响应体已复制到剪贴板", "success");
    } catch {
      notifyToast("复制响应体失败", "error");
    }
  }, [notifyToast]);

  const copyHeaderValue = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notifyToast("Header 已复制到剪贴板", "success");
    } catch {
      notifyToast("复制 Header 失败", "error");
    }
  }, [notifyToast]);

  const toggleResponsePretty = useCallback(() => {
    updateUiState((current) => ({
      ...current,
      responsePretty: !current.responsePretty,
    }));
  }, [updateUiState]);

  const formatResponseJson = useCallback((): boolean => {
    const response = viewStateRef.current.response;
    if (!response) {
      notifyToast("当前没有可格式化的响应内容", "warning");
      return false;
    }

    try {
      const parsed = JSON.parse(response.bodyRawText || "");
      const prettyText = JSON.stringify(parsed, null, 2);
      updateUiState((current) => ({ ...current, responsePretty: true }));
      updateViewState((current) =>
        current.response
          ? {
              ...current,
              response: {
                ...current.response,
                bodyText: prettyText,
                bodyPrettyText: prettyText,
                isJson: true,
              },
            }
          : current
      );
      notifyToast("JSON 已格式化", "success");
      return true;
    } catch {
      notifyToast("当前响应不是合法 JSON", "warning");
      return false;
    }
  }, [notifyToast, updateUiState, updateViewState]);

  const openResponseEditor = useCallback(() => {
    const response = viewStateRef.current.response;
    if (!response) {
      notifyToast("当前没有可打开的响应内容", "warning");
      return;
    }

    const showOriginal = uiStateRef.current.responsePretty;
    postMessage({
      type: "httpClient/openResponseEditor",
      payload: {
        content: getDisplayedResponseText(response, showOriginal),
        language: showOriginal ? inferResponseEditorLanguage(response) : "plaintext",
      },
    });
  }, [notifyToast, postMessage]);

  const setResponseSearch = useCallback((keyword: string) => {
    updateUiState((current) => ({
      ...current,
      responseSearch: keyword,
    }));
  }, [updateUiState]);

  const selectedEnvironment = useMemo(() => {
    const selectedId =
      sidebarUiState.selectedEnvironmentId ?? viewState.activeEnvironmentId ?? viewState.config.environments[0]?.id ?? null;
    if (!selectedId) {
      return null;
    }
    return viewState.config.environments.find((environment) => environment.id === selectedId) ?? null;
  }, [sidebarUiState.selectedEnvironmentId, viewState.activeEnvironmentId, viewState.config.environments]);

  useEffect(() => {
    updateSidebarUiState((current) => {
      const hasCurrentSelection =
        current.selectedEnvironmentId !== null &&
        viewState.config.environments.some((environment) => environment.id === current.selectedEnvironmentId);
      if (hasCurrentSelection) {
        return current;
      }
      const fallbackId = viewState.activeEnvironmentId ?? viewState.config.environments[0]?.id ?? null;
      if (fallbackId === current.selectedEnvironmentId) {
        return current;
      }
      return {
        ...current,
        selectedEnvironmentId: fallbackId,
      };
    });
  }, [updateSidebarUiState, viewState.activeEnvironmentId, viewState.config.environments]);

  useEffect(() => {
    if (!selectedEnvironment) {
      setEnvironmentDraft(null);
      return;
    }
    setEnvironmentDraft({
      environmentId: selectedEnvironment.id,
      name: selectedEnvironment.name,
      variables: Object.entries(selectedEnvironment.variables).map(([key, value]) => createEnvironmentRow(key, value)),
      dirty: false,
    });
  }, [createEnvironmentRow, selectedEnvironment?.id, selectedEnvironment?.updatedAt]);

  // 把 moveRequest / selectRequest 暴露到 window, 让 SidebarView 内部使用
  useEffect(() => {
    window.__mxSidebarMoveRequest = (requestId, beforeRequestId, targetCollectionId) =>
      moveRequest(requestId, beforeRequestId, targetCollectionId);
    window.__mxSidebarSelectRequest = (requestId) => selectRequest(requestId);
    return () => {
      delete window.__mxSidebarMoveRequest;
      delete window.__mxSidebarSelectRequest;
    };
  }, [moveRequest, selectRequest]);

  const setEnvironmentDraftName = useCallback((name: string) => {
    setEnvironmentDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        name,
        dirty: true,
      };
    });
  }, []);

  const updateEnvironmentVariable = useCallback((id: string, field: "key" | "value", value: string) => {
    setEnvironmentDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        dirty: true,
        variables: current.variables.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
      };
    });
  }, []);

  const addEnvironmentVariable = useCallback(() => {
    setEnvironmentDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        dirty: true,
        variables: [...current.variables, createEnvironmentRow()],
      };
    });
  }, [createEnvironmentRow]);

  const removeEnvironmentVariable = useCallback((id: string) => {
    setEnvironmentDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        dirty: true,
        variables: current.variables.filter((item) => item.id !== id),
      };
    });
  }, []);

  const saveEnvironment = useCallback(() => {
    if (!selectedEnvironment || !environmentDraft) {
      notifyToast("没有可保存的环境", "warning");
      return;
    }
    const variables = Object.fromEntries(
      environmentDraft.variables
        .map((item) => [item.key.trim(), item.value] as const)
        .filter(([key]) => key.length > 0)
    );
    postMessage({
      type: "httpClient/saveEnvironment",
      payload: {
        environment: {
          ...selectedEnvironment,
          name: environmentDraft.name,
          variables,
        },
      },
    });
  }, [environmentDraft, notifyToast, postMessage, selectedEnvironment]);

  const deleteEnvironment = useCallback(() => {
    if (!selectedEnvironment) {
      notifyToast("请选择一个环境", "warning");
      return;
    }
    postMessage({
      type: "httpClient/deleteEnvironment",
      payload: {
        environmentId: selectedEnvironment.id,
      },
    });
  }, [notifyToast, postMessage, selectedEnvironment]);

  const collectionGroups = useMemo(() => {
    return buildCollectionGroups(viewState.config, sidebarUiState.keyword, viewState.draft, sidebarUiState.expandedCollectionGroups);
  }, [sidebarUiState.expandedCollectionGroups, sidebarUiState.keyword, viewState]);

  const environmentItems = useMemo(() => {
    return buildEnvironmentItems(viewState, sidebarUiState.keyword);
  }, [sidebarUiState.keyword, viewState]);

  useEffect(() => {
    postMessage({
      type: "httpClient/init",
      payload: {
        buildId: bootstrap.buildId,
      },
    });
    logFrontend("info", "bootstrap", `react workbench ready build=${bootstrap.buildId}`);

    const onMessage = (event: MessageEvent) => {
      const payload = event.data as ExtensionToWebviewMessage | undefined;
      if (!payload || typeof payload !== "object" || !("type" in payload)) {
        return;
      }

      if (payload.type === "mxToast/show") {
        window.__mxToastCenter?.push(payload.payload);
        return;
      }

      if (payload.type === "httpClient/curl") {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(payload.payload.curl).catch(() => undefined);
        }
        window.__mxToastCenter?.push({
          message: "cURL 已复制",
          kind: "success",
          copyText: payload.payload.curl,
        });
        return;
      }

      const snapshot = applyWorkbenchMessage(viewStateRef.current, uiStateRef.current, payload);
      if (payload.type === "httpClient/state") {
        setHasHostState(true);
        pendingAckSourceRef.current = "state";
        setPendingRequestAction(null);
      } else if (payload.type === "httpClient/response") {
        pendingAckSourceRef.current = "response";
        logFrontend("info", "httpClient/response", "response rendered");
      }
      replaceViewState(snapshot.viewState);
      replaceUiState(snapshot.uiState);

      if (snapshot.hostCommand === "send") {
        queueMicrotask(performSend);
      } else if (snapshot.hostCommand === "save") {
        queueMicrotask(performSave);
      } else if (snapshot.hostCommand === "loadTest") {
        queueMicrotask(performLoadTest);
      } else if (snapshot.hostCommand === "focusCurlImport") {
        queueMicrotask(importCurl);
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [bootstrap.buildId, importCurl, logFrontend, performLoadTest, performSave, performSend, postMessage, replaceUiState, replaceViewState]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      logFrontend("error", "window.error", String(event.error ?? event.message ?? "unknown window error"));
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      logFrontend("error", "window.unhandledrejection", String(event.reason ?? "unknown rejection"));
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [logFrontend]);

  useEffect(() => {
    if (!viewState.response || viewState.requestRunning) {
      return;
    }

    const ackKey = `${viewState.response.meta.startedAt}:${viewState.response.status}:${viewState.response.meta.durationMs}`;
    if (lastAckKeyRef.current === ackKey) {
      return;
    }
    lastAckKeyRef.current = ackKey;
    postMessage({
      type: "httpClient/responseAck",
      payload: {
        source: pendingAckSourceRef.current,
      },
    });
  }, [postMessage, viewState.requestRunning, viewState.response]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        performSend();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [performSend]);

  const displayedResponseText = useMemo(() => {
    return getDisplayedResponseText(viewState.response, uiState.responsePretty);
  }, [uiState.responsePretty, viewState.response]);

  const highlightedResponseHtml = useMemo(() => {
    if (!viewState.response) {
      return "";
    }
    return highlightText(displayedResponseText, uiState.responseSearch);
  }, [displayedResponseText, uiState.responseSearch, viewState.response]);

  return {
    buildId: bootstrap.buildId,
    viewState,
    uiState,
    sidebarUiState,
    hasHostState,
    displayedResponseText,
    highlightedResponseHtml,
    collectionGroups,
    environmentItems,
    selectedEnvironment,
    environmentDraft,
    pendingRequestAction,
    setSidebarTab,
    setSidebarKeyword,
    toggleCollectionGroup,
    createRequest,
    createCollection,
    renameCollection,
    deleteCollection,
    createEnvironment,
    selectRequest,
    renameRequest,
    duplicateRequest,
    deleteRequest,
    exportCurl,
    moveRequest,
    selectEnvironment: setEnvironment,
    setEnvironmentDraftName,
    updateEnvironmentVariable,
    addEnvironmentVariable,
    removeEnvironmentVariable,
    saveEnvironment,
    deleteEnvironment,
    setRequestTab,
    setResponseTab,
    setMethod,
    setUrl,
    setEnvironment,
    updateKeyValue,
    addKeyValue,
    removeKeyValue,
    setBodyMode,
    setBodyText,
    formatJsonBody,
    formatResponseJson,
    setResponseSearch,
    toggleResponsePretty,
    performSend,
    performSave,
    cancelRequest,
    performLoadTest,
    stopLoadTest,
    setLoadTestProfileField,
    importCurl,
    copyResponse,
    openResponseEditor,
    copyHeaderValue,
  };
}

function inferResponseEditorLanguage(response: HttpResponseResult): string {
  if (response.isJson) {
    return "json";
  }

  const contentType = String(response.meta.contentType || "").toLowerCase();
  if (contentType.includes("xml")) {
    return "xml";
  }
  if (contentType.includes("html")) {
    return "html";
  }
  if (contentType.includes("javascript")) {
    return "javascript";
  }
  if (contentType.includes("css")) {
    return "css";
  }

  return "plaintext";
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSortId(): string {
  return ulid();
}

function createWorkbenchScratchRequest(): HttpRequestEntity {
  const now = new Date().toISOString();
  return {
    id: createId(),
    sortId: createSortId(),
    name: "新请求",
    method: "GET",
    url: "",
    params: [createEmptyKeyValue(createId)],
    headers: [createEmptyKeyValue(createId)],
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
