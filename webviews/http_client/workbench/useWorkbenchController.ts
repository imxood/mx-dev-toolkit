import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ExtensionToWebviewMessage,
  HttpClientViewState,
  HttpRequestEntity,
  WebviewToExtensionMessage,
} from "../../../src/http_client/types";
import { getBootstrap } from "../shared/bootstrap";
import { getVscodeApi } from "../shared/vscode";
import {
  applyWorkbenchMessage,
  buildUrlHint,
  cloneRequest,
  cloneViewState,
  createEmptyKeyValue,
  createFallbackViewState,
  createInitialUiState,
  ensureJsonBodyMode,
  getDisplayedResponseText,
  renderJsonHighlightedText,
  syncParamsFromUrl,
  syncUrlFromParams,
  type WorkbenchUiState,
} from "../shared/workbench_model";

export interface WorkbenchController {
  buildId: string;
  viewState: HttpClientViewState;
  uiState: WorkbenchUiState;
  hasHostState: boolean;
  displayedResponseText: string;
  highlightedResponseHtml: string;
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
  setResponseSearch(keyword: string): void;
  toggleResponsePretty(): void;
  performSend(): void;
  performSave(): void;
  performLoadTest(): void;
  stopLoadTest(): void;
  setLoadTestProfileField(field: "totalRequests" | "concurrency" | "timeoutMs", value: number): void;
  importCurl(): void;
  copyResponse(): Promise<void>;
  copyHeaderValue(value: string): Promise<void>;
}

export function useWorkbenchController(): WorkbenchController {
  const bootstrap = getBootstrap("workbench");
  const vscode = useMemo(() => getVscodeApi<WebviewToExtensionMessage>(), []);
  const [viewState, setViewState] = useState<HttpClientViewState>(() => {
    return bootstrap.initialState ? cloneViewState(bootstrap.initialState) : createFallbackViewState();
  });
  const [uiState, setUiState] = useState<WorkbenchUiState>(createInitialUiState);
  const [hasHostState, setHasHostState] = useState(Boolean(bootstrap.initialState));
  const viewStateRef = useRef(viewState);
  const uiStateRef = useRef(uiState);
  const pendingAckSourceRef = useRef<"bootstrap" | "state" | "response">("bootstrap");
  const lastAckKeyRef = useRef("");

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  useEffect(() => {
    uiStateRef.current = uiState;
  }, [uiState]);

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

  const mutateDraft = useCallback(
    (mutator: (draft: HttpRequestEntity) => HttpRequestEntity) => {
      updateViewState(
        (current) => {
          if (!current.draft) {
            return current;
          }

          const next = cloneViewState(current);
          const draft = next.draft;
          if (!draft) {
            return next;
          }
          const nextDraft = mutator(draft);
          next.draft = nextDraft;
          next.draft.updatedAt = new Date().toISOString();
          next.dirty = true;
          return next;
        },
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
        (current) => ({
          ...cloneViewState(current),
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
        (current) => ({
          ...cloneViewState(current),
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
      updateViewState((current) => ({
        ...cloneViewState(current),
        activeEnvironmentId: environmentId,
      }));
      postMessage({
        type: "httpClient/selectEnvironment",
        payload: {
          environmentId,
        },
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
      return false;
    }

    const result = ensureJsonBodyMode(currentDraft.bodyMode, currentDraft.bodyText);
    const formatted = result.bodyText !== currentDraft.bodyText || result.bodyMode !== currentDraft.bodyMode;
    mutateDraft((draft) => {
      const next = cloneRequest(draft);
      next.bodyMode = result.bodyMode;
      next.bodyText = result.bodyText;
      return next;
    });
    return formatted;
  }, [mutateDraft]);

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
        lastErrorMessage: urlHint,
      }));
      updateViewState(
        (current) => ({
          ...cloneViewState(current),
          response: null,
          responseTab: "body",
        }),
        { emitUiState: true }
      );
      return;
    }

    updateUiState((current) => ({
      ...current,
      lastErrorMessage: "",
    }));
    updateViewState((current) => ({
      ...cloneViewState(current),
      requestRunning: true,
      response: null,
    }));
    postMessage({
      type: "httpClient/send",
      payload: {
        request: cloneRequest(currentViewState.draft),
        environmentId: currentViewState.activeEnvironmentId,
        timeoutMs: 30000,
      },
    });
  }, [postMessage, updateUiState, updateViewState]);

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

  const performLoadTest = useCallback(() => {
    const currentViewState = viewStateRef.current;
    if (!currentViewState.draft) {
      return;
    }

    updateViewState(
      (current) => ({
        ...cloneViewState(current),
        responseTab: "loadTest",
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
  }, [postMessage, updateViewState]);

  const stopLoadTest = useCallback(() => {
    postMessage({ type: "httpClient/loadTest/stop" });
  }, [postMessage]);

  const setLoadTestProfileField = useCallback(
    (field: "totalRequests" | "concurrency" | "timeoutMs", value: number) => {
      updateViewState((current) => {
        const next = cloneViewState(current);
        next.loadTestProfile = {
          ...next.loadTestProfile,
          [field]: Number.isFinite(value) ? value : next.loadTestProfile[field],
        };
        return next;
      });
    },
    [updateViewState]
  );

  const importCurl = useCallback(() => {
    postMessage({ type: "httpClient/importCurlPrompt" });
  }, [postMessage]);

  const copyResponse = useCallback(async () => {
    await navigator.clipboard.writeText(getDisplayedResponseText(viewStateRef.current.response, uiStateRef.current.responsePretty));
  }, []);

  const copyHeaderValue = useCallback(async (value: string) => {
    await navigator.clipboard.writeText(value);
  }, []);

  const toggleResponsePretty = useCallback(() => {
    updateUiState((current) => ({
      ...current,
      responsePretty: !current.responsePretty,
    }));
  }, [updateUiState]);

  const setResponseSearch = useCallback((keyword: string) => {
    updateUiState((current) => ({
      ...current,
      responseSearch: keyword,
    }));
  }, [updateUiState]);

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

      const snapshot = applyWorkbenchMessage(viewStateRef.current, uiStateRef.current, payload);
      if (payload.type === "httpClient/state") {
        setHasHostState(true);
        pendingAckSourceRef.current = "state";
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

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        performSave();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [performSave, performSend]);

  return {
    buildId: bootstrap.buildId,
    viewState,
    uiState,
    hasHostState,
    displayedResponseText: getDisplayedResponseText(viewState.response, uiState.responsePretty),
    highlightedResponseHtml:
      viewState.response && uiState.responsePretty && viewState.response.isJson
        ? renderJsonHighlightedText(getDisplayedResponseText(viewState.response, true), uiState.responseSearch)
        : "",
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
    setResponseSearch,
    toggleResponsePretty,
    performSend,
    performSave,
    performLoadTest,
    stopLoadTest,
    setLoadTestProfileField,
    importCurl,
    copyResponse,
    copyHeaderValue,
  };
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
