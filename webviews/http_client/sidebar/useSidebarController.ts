import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HttpClientViewState, HttpEnvironmentEntity, HttpRequestEntity } from "../../../src/http_client/types";
import { getBootstrap } from "../shared/bootstrap";
import {
  buildCollectionGroups,
  buildEnvironmentItems,
  createInitialSidebarUiState,
  type ExtensionToSidebarMessage,
  type SidebarCollectionGroup,
  type SidebarEnvironmentDraft,
  type SidebarEnvironmentDraftRow,
  type SidebarEnvironmentItem,
  type SidebarTab,
  type SidebarToExtensionMessage,
  type SidebarUiState,
} from "../shared/sidebar_model";
import { getVscodeApi } from "../shared/vscode";

export interface SidebarController {
  buildId: string;
  viewState: HttpClientViewState | null;
  uiState: SidebarUiState;
  hasHostState: boolean;
  collectionGroups: SidebarCollectionGroup[];
  environmentItems: SidebarEnvironmentItem[];
  selectedEnvironment: HttpEnvironmentEntity | null;
  environmentDraft: SidebarEnvironmentDraft | null;
  pendingRequestAction: { requestId: string; kind: "duplicate" | "delete" } | null;
  setActiveTab(tab: SidebarTab): void;
  setKeyword(keyword: string): void;
  toggleCollectionGroup(groupKey: string): void;
  createRequest(collectionId?: string | null): void;
  createCollection(): void;
  renameCollection(collectionId: string): void;
  deleteCollection(collectionId: string): void;
  createEnvironment(): void;
  selectRequest(requestId: string): void;
  renameRequest(requestId: string, name: string): void;
  duplicateRequest(requestId: string): void;
  deleteRequest(requestId: string): void;
  exportCurl(requestId: string): void;
  moveRequest(requestId: string, targetCollectionId: string): void;
  selectEnvironment(environmentId: string | null): void;
  setEnvironmentDraftName(name: string): void;
  updateEnvironmentVariable(id: string, field: "key" | "value", value: string): void;
  addEnvironmentVariable(): void;
  removeEnvironmentVariable(id: string): void;
  saveEnvironment(): void;
  deleteEnvironment(): void;
}

export function useSidebarController(): SidebarController {
  const bootstrap = getBootstrap("sidebar");
  const vscode = useMemo(() => getVscodeApi<SidebarToExtensionMessage>(), []);
  const [viewState, setViewState] = useState<HttpClientViewState | null>(() => bootstrap.initialState ?? null);
  const [uiState, setUiState] = useState<SidebarUiState>(createInitialSidebarUiState);
  const [hasHostState, setHasHostState] = useState(Boolean(bootstrap.initialState));
  const [environmentDraft, setEnvironmentDraft] = useState<SidebarEnvironmentDraft | null>(null);
  const [pendingRequestAction, setPendingRequestAction] = useState<{ requestId: string; kind: "duplicate" | "delete" } | null>(null);
  const viewStateRef = useRef<HttpClientViewState | null>(null);
  const environmentRowIdRef = useRef(1);

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  const createEnvironmentRow = useCallback((key = "", value = ""): SidebarEnvironmentDraftRow => {
    const id = `env-row-${environmentRowIdRef.current++}`;
    return { id, key, value };
  }, []);

  const postMessage = useCallback(
    (message: SidebarToExtensionMessage) => {
      vscode?.postMessage(message);
    },
    [vscode]
  );

  const postMessageAfterPaint = useCallback(
    (message: SidebarToExtensionMessage) => {
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
          postMessage(message);
        });
        return;
      }

      setTimeout(() => {
        postMessage(message);
      }, 0);
    },
    [postMessage]
  );

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionToSidebarMessage>) => {
      const data = event.data;
      if (!data || typeof data !== "object") {
        return;
      }
      if (data.type === "httpClientSidebar/state") {
        setViewState(data.payload);
        setHasHostState(true);
        return;
      }
      if (data.type === "httpClientSidebar/curl") {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(data.payload.curl).catch(() => undefined);
        }
        window.__mxToastCenter?.push({
          message: "cURL 已复制",
          kind: "success",
          copyText: data.payload.curl,
        });
        return;
      }
      if (data.type === "mxToast/show") {
        window.__mxToastCenter?.push({
          message: data.payload.message,
          kind: data.payload.kind,
          copyText: data.payload.copyText,
        });
      }
    };

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
    };
  }, []);

  const setActiveTab = useCallback((tab: SidebarTab) => {
    setUiState((current) => ({ ...current, activeTab: tab }));
  }, []);

  const setKeyword = useCallback((keyword: string) => {
    setUiState((current) => ({ ...current, keyword }));
  }, []);

  const toggleCollectionGroup = useCallback((groupKey: string) => {
    setUiState((current) => ({
      ...current,
      expandedCollectionGroups: {
        ...current.expandedCollectionGroups,
        [groupKey]: current.expandedCollectionGroups[groupKey] === false,
      },
    }));
  }, []);

  const createRequest = useCallback(
    (collectionId?: string | null) => {
      postMessage({
        type: "httpClientSidebar/createRequest",
        payload: { collectionId: collectionId ?? null },
      });
    },
    [postMessage]
  );

  const createCollection = useCallback(() => {
    postMessage({ type: "httpClientSidebar/createCollection" });
  }, [postMessage]);

  const renameCollection = useCallback(
    (collectionId: string) => {
      postMessage({ type: "httpClientSidebar/renameCollection", payload: { collectionId } });
    },
    [postMessage]
  );

  const deleteCollection = useCallback(
    (collectionId: string) => {
      postMessage({ type: "httpClientSidebar/deleteCollection", payload: { collectionId } });
    },
    [postMessage]
  );

  const createEnvironment = useCallback(() => {
    postMessage({ type: "httpClientSidebar/createEnvironment" });
  }, [postMessage]);

  const selectRequest = useCallback(
    (requestId: string) => {
      postMessage({ type: "httpClientSidebar/selectRequest", payload: { requestId } });
    },
    [postMessage]
  );

  const renameRequest = useCallback(
    (requestId: string, name: string) => {
      postMessage({ type: "httpClientSidebar/renameRequest", payload: { requestId, name } });
    },
    [postMessage]
  );

  const duplicateRequest = useCallback(
    (requestId: string) => {
      setPendingRequestAction({ requestId, kind: "duplicate" });
      postMessage({ type: "httpClientSidebar/duplicateRequest", payload: { requestId } });
      setTimeout(() => setPendingRequestAction(null), 800);
    },
    [postMessage]
  );

  const deleteRequest = useCallback(
    (requestId: string) => {
      setPendingRequestAction({ requestId, kind: "delete" });
      postMessage({ type: "httpClientSidebar/deleteRequest", payload: { requestId } });
      setTimeout(() => setPendingRequestAction(null), 800);
    },
    [postMessage]
  );

  const exportCurl = useCallback(
    (requestId: string) => {
      postMessage({ type: "httpClientSidebar/exportCurl", payload: { requestId } });
    },
    [postMessage]
  );

  const moveRequest = useCallback(
    (requestId: string, targetCollectionId: string) => {
      const current = viewStateRef.current;
      if (!current) {
        return;
      }
      const lookup = current.config.collections
        .flatMap((collection) => collection.requests.map((request) => ({ request, collection })))
        .find((entry) => entry.request.id === requestId);
      if (!lookup || lookup.collection.id === targetCollectionId) {
        return;
      }
      const movedRequest: HttpRequestEntity = { ...lookup.request, updatedAt: new Date().toISOString() };
      const nextState: HttpClientViewState = {
        ...current,
        config: {
          ...current.config,
          collections: current.config.collections.map((collection) => {
            if (collection.id === lookup.collection.id) {
              return { ...collection, requests: collection.requests.filter((item) => item.id !== requestId) };
            }
            if (collection.id === targetCollectionId) {
              return { ...collection, requests: [movedRequest, ...collection.requests] };
            }
            return collection;
          }),
        },
      };
      setViewState(nextState);
      postMessageAfterPaint({
        type: "httpClientSidebar/moveRequest",
        payload: { requestId, targetCollectionId },
      });
      const targetCollection = nextState.config.collections.find((collection) => collection.id === targetCollectionId);
      window.__mxToastCenter?.push({
        message: `已移至 ${targetCollection?.name ?? "目标集合"}`,
        kind: "success",
        copyText: targetCollection?.name ?? "",
      });
    },
    [postMessageAfterPaint]
  );

  const selectEnvironment = useCallback(
    (environmentId: string | null) => {
      postMessage({ type: "httpClientSidebar/selectEnvironment", payload: { environmentId } });
    },
    [postMessage]
  );

  const setEnvironmentDraftName = useCallback((name: string) => {
    setEnvironmentDraft((current) => (current ? { ...current, name, dirty: true } : current));
  }, []);

  const updateEnvironmentVariable = useCallback(
    (id: string, field: "key" | "value", value: string) => {
      setEnvironmentDraft((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          dirty: true,
          variables: current.variables.map((variable) =>
            variable.id === id ? { ...variable, [field]: value } : variable
          ),
        };
      });
    },
    []
  );

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
        variables: current.variables.filter((variable) => variable.id !== id),
      };
    });
  }, []);

  const saveEnvironment = useCallback(() => {
    const current = environmentDraft;
    if (!current) {
      return;
    }
    const variables: Record<string, string> = {};
    for (const variable of current.variables) {
      if (!variable.key.trim()) {
        continue;
      }
      variables[variable.key.trim()] = variable.value;
    }
    postMessage({
      type: "httpClientSidebar/saveEnvironment",
      payload: {
        environment: {
          id: current.environmentId,
          name: current.name,
          variables,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    });
    setEnvironmentDraft((draft) => (draft ? { ...draft, dirty: false } : draft));
  }, [environmentDraft, postMessage]);

  const deleteEnvironment = useCallback(() => {
    const current = environmentDraft;
    if (!current) {
      return;
    }
    postMessage({
      type: "httpClientSidebar/deleteEnvironment",
      payload: { environmentId: current.environmentId },
    });
  }, [environmentDraft, postMessage]);

  useEffect(() => {
    if (!viewState) {
      setEnvironmentDraft(null);
      return;
    }
    const activeId = viewState.activeEnvironmentId;
    const env = viewState.config.environments.find((item) => item.id === activeId);
    if (!env) {
      setEnvironmentDraft(null);
      return;
    }
    setEnvironmentDraft((current) => {
      if (current && current.environmentId === env.id && !current.dirty) {
        return current;
      }
      return {
        environmentId: env.id,
        name: env.name,
        variables: Object.entries(env.variables).map(([key, value]) => createEnvironmentRow(key, value)),
        dirty: false,
      };
    });
  }, [viewState, createEnvironmentRow]);

  const collectionGroups = useMemo(() => {
    if (!viewState) {
      return [] as SidebarCollectionGroup[];
    }
    const draft = viewState.draft && !viewState.config.collections.some((collection) => collection.requests.some((request) => request.id === viewState.draft?.id))
      ? viewState.draft
      : null;
    return buildCollectionGroups(viewState.config, uiState.keyword, draft, uiState.expandedCollectionGroups);
  }, [uiState.keyword, uiState.expandedCollectionGroups, viewState]);

  const environmentItems = useMemo<SidebarEnvironmentItem[]>(() => {
    if (!viewState) {
      return [];
    }
    return buildEnvironmentItems(viewState, uiState.keyword);
  }, [uiState.keyword, viewState]);

  const selectedEnvironment = useMemo(() => {
    if (!viewState) {
      return null;
    }
    return viewState.config.environments.find((item) => item.id === viewState.activeEnvironmentId) ?? null;
  }, [viewState]);

  // 把 moveRequest / selectRequest 暴露到 window, 让 SidebarView 内部使用
  useEffect(() => {
    window.__mxSidebarMoveRequest = (requestId, targetCollectionId) => moveRequest(requestId, targetCollectionId);
    window.__mxSidebarSelectRequest = (requestId) => selectRequest(requestId);
    return () => {
      delete window.__mxSidebarMoveRequest;
      delete window.__mxSidebarSelectRequest;
    };
  }, [moveRequest, selectRequest]);

  return {
    buildId: bootstrap.buildId,
    viewState,
    uiState,
    hasHostState,
    collectionGroups,
    environmentItems,
    selectedEnvironment,
    environmentDraft,
    pendingRequestAction,
    setActiveTab,
    setKeyword,
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
    selectEnvironment,
    setEnvironmentDraftName,
    updateEnvironmentVariable,
    addEnvironmentVariable,
    removeEnvironmentVariable,
    saveEnvironment,
    deleteEnvironment,
  };
}
