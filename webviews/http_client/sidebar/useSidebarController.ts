import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HttpClientViewState, HttpEnvironmentEntity, HttpRequestEntity } from "../../../src/http_client/types";
import { getBootstrap } from "../shared/bootstrap";
import {
  buildCollectionGroups,
  buildEnvironmentItems,
  buildFavoriteRequests,
  buildHistoryGroups,
  buildUngroupedRequests,
  createInitialSidebarUiState,
  type SidebarEnvironmentDraft,
  type SidebarEnvironmentDraftRow,
  type ExtensionToSidebarMessage,
  type SidebarCollectionGroup,
  type SidebarEnvironmentItem,
  type SidebarHistoryGroup,
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
  historyGroups: SidebarHistoryGroup[];
  collectionGroups: SidebarCollectionGroup[];
  favoriteRequests: HttpRequestEntity[];
  ungroupedRequests: HttpClientViewState["config"]["requests"];
  environmentItems: SidebarEnvironmentItem[];
  selectedEnvironment: HttpEnvironmentEntity | null;
  environmentDraft: SidebarEnvironmentDraft | null;
  pendingRequestAction: { requestId: string; kind: "duplicate" | "delete" } | null;
  setActiveTab(tab: SidebarTab): void;
  setKeyword(keyword: string): void;
  toggleHistoryGroup(groupKey: string): void;
  createRequest(collectionId?: string | null): void;
  createCollection(): void;
  renameCollection(collectionId: string): void;
  deleteCollection(collectionId: string): void;
  createEnvironment(): void;
  selectRequest(requestId: string): void;
  renameRequest(requestId: string): void;
  duplicateRequest(requestId: string): void;
  deleteRequest(requestId: string): void;
  toggleFavorite(requestId: string, favorite: boolean): void;
  selectHistory(historyId: string): void;
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

  const setActiveTab = useCallback((tab: SidebarTab) => {
    setUiState((current) => ({
      ...current,
      activeTab: tab,
    }));
  }, []);

  const setKeyword = useCallback((keyword: string) => {
    setUiState((current) => ({
      ...current,
      keyword,
    }));
  }, []);

  const toggleHistoryGroup = useCallback((groupKey: string) => {
    setUiState((current) => ({
      ...current,
      expandedHistoryGroups: {
        ...current.expandedHistoryGroups,
        [groupKey]: !current.expandedHistoryGroups[groupKey],
      },
    }));
  }, []);

  const createRequest = useCallback(
    (collectionId: string | null = null) => {
      setUiState((current) => ({
        ...current,
        selectedHistoryId: null,
      }));
      postMessage({
        type: "httpClientSidebar/createRequest",
        payload: {
          collectionId,
        },
      });
    },
    [postMessage]
  );

  const createCollection = useCallback(() => {
    setActiveTab("collections");
    postMessage({ type: "httpClientSidebar/createCollection" });
  }, [postMessage, setActiveTab]);

  const renameCollection = useCallback(
    (collectionId: string) => {
      postMessage({
        type: "httpClientSidebar/renameCollection",
        payload: { collectionId },
      });
    },
    [postMessage]
  );

  const deleteCollection = useCallback(
    (collectionId: string) => {
      postMessage({
        type: "httpClientSidebar/deleteCollection",
        payload: { collectionId },
      });
    },
    [postMessage]
  );

  const createEnvironment = useCallback(() => {
    setActiveTab("environments");
    setUiState((current) => ({
      ...current,
      selectedEnvironmentId: null,
    }));
    postMessage({ type: "httpClientSidebar/createEnvironment" });
  }, [postMessage, setActiveTab]);

  const selectRequest = useCallback(
    (requestId: string) => {
      setUiState((current) => ({
        ...current,
        selectedHistoryId: null,
      }));
      postMessage({
        type: "httpClientSidebar/selectRequest",
        payload: { requestId },
      });
    },
    [postMessage]
  );

  const renameRequest = useCallback(
    (requestId: string) => {
      postMessage({
        type: "httpClientSidebar/renameRequest",
        payload: { requestId },
      });
    },
    [postMessage]
  );

  const duplicateRequest = useCallback(
    (requestId: string) => {
      setPendingRequestAction({ requestId, kind: "duplicate" });
      postMessageAfterPaint({
        type: "httpClientSidebar/duplicateRequest",
        payload: { requestId },
      });
    },
    [postMessageAfterPaint]
  );

  const deleteRequest = useCallback(
    (requestId: string) => {
      setPendingRequestAction({ requestId, kind: "delete" });
      postMessageAfterPaint({
        type: "httpClientSidebar/deleteRequest",
        payload: { requestId },
      });
    },
    [postMessageAfterPaint]
  );

  const toggleFavorite = useCallback(
    (requestId: string, favorite: boolean) => {
      postMessage({
        type: "httpClientSidebar/toggleFavorite",
        payload: { requestId, favorite },
      });
    },
    [postMessage]
  );

  const selectHistory = useCallback(
    (historyId: string) => {
      setUiState((current) => ({
        ...current,
        selectedHistoryId: historyId,
      }));
      postMessage({
        type: "httpClientSidebar/selectHistory",
        payload: { historyId },
      });
    },
    [postMessage]
  );

  const selectEnvironment = useCallback(
    (environmentId: string | null) => {
      setUiState((current) => ({
        ...current,
        selectedEnvironmentId: environmentId ?? current.selectedEnvironmentId,
      }));
      postMessage({
        type: "httpClientSidebar/selectEnvironment",
        payload: { environmentId },
      });
    },
    [postMessage]
  );

  useEffect(() => {
    postMessage({ type: "httpClientSidebar/init" });

    const onMessage = (event: MessageEvent) => {
      const payload = event.data as ExtensionToSidebarMessage | undefined;
      if (!payload || typeof payload !== "object" || !("type" in payload)) {
        return;
      }

      if (payload.type === "mxToast/show") {
        window.__mxToastCenter?.push(payload.payload);
        return;
      }

      if (payload.type !== "httpClientSidebar/state") {
        return;
      }

      setHasHostState(true);
      setPendingRequestAction(null);
      viewStateRef.current = payload.payload;
      setViewState(payload.payload);
      setUiState((current) => {
        if (current.selectedHistoryId === payload.payload.selectedHistoryId) {
          return current;
        }
        return {
          ...current,
          selectedHistoryId: payload.payload.selectedHistoryId,
        };
      });
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [postMessage]);

  useEffect(() => {
    if (!viewState) {
      return;
    }
    setUiState((current) => {
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
  }, [viewState]);

  const selectedEnvironment = useMemo(() => {
    if (!viewState) {
      return null;
    }
    const selectedId = uiState.selectedEnvironmentId ?? viewState.activeEnvironmentId ?? viewState.config.environments[0]?.id ?? null;
    if (!selectedId) {
      return null;
    }
    return viewState.config.environments.find((environment) => environment.id === selectedId) ?? null;
  }, [uiState.selectedEnvironmentId, viewState]);

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
      type: "httpClientSidebar/saveEnvironment",
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
      type: "httpClientSidebar/deleteEnvironment",
      payload: { environmentId: selectedEnvironment.id },
    });
  }, [notifyToast, postMessage, selectedEnvironment]);

  const historyGroups = useMemo(() => {
    if (!viewState) {
      return [];
    }

    return buildHistoryGroups(viewState, uiState.keyword, uiState.expandedHistoryGroups, uiState.selectedHistoryId);
  }, [uiState.expandedHistoryGroups, uiState.keyword, uiState.selectedHistoryId, viewState]);

  const collectionGroups = useMemo(() => {
    if (!viewState) {
      return [];
    }

    return buildCollectionGroups(viewState.config, uiState.keyword, viewState.draft);
  }, [uiState.keyword, viewState]);

  const favoriteRequests = useMemo(() => {
    if (!viewState) {
      return [];
    }

    return buildFavoriteRequests(viewState.config, uiState.keyword, viewState.draft);
  }, [uiState.keyword, viewState]);

  const ungroupedRequests = useMemo(() => {
    if (!viewState) {
      return [];
    }

    return buildUngroupedRequests(viewState.config, uiState.keyword, viewState.draft);
  }, [uiState.keyword, viewState]);

  const environmentItems = useMemo(() => {
    if (!viewState) {
      return [];
    }

    return buildEnvironmentItems(viewState, uiState.keyword);
  }, [uiState.keyword, viewState]);

  return {
    buildId: bootstrap.buildId,
    viewState,
    uiState,
    hasHostState,
    historyGroups,
    collectionGroups,
    favoriteRequests,
    ungroupedRequests,
    environmentItems,
    selectedEnvironment,
    environmentDraft,
    pendingRequestAction,
    setActiveTab,
    setKeyword,
    toggleHistoryGroup,
    createRequest,
    createCollection,
    renameCollection,
    deleteCollection,
    createEnvironment,
    selectRequest,
    renameRequest,
    duplicateRequest,
    deleteRequest,
    toggleFavorite,
    selectHistory,
    selectEnvironment,
    setEnvironmentDraftName,
    updateEnvironmentVariable,
    addEnvironmentVariable,
    removeEnvironmentVariable,
    saveEnvironment,
    deleteEnvironment,
  };
}
