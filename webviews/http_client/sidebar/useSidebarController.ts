import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HttpClientViewState } from "../../../src/http_client/types";
import { getBootstrap } from "../shared/bootstrap";
import {
  buildCollectionGroups,
  buildEnvironmentItems,
  buildHistoryGroups,
  buildUngroupedRequests,
  createInitialSidebarUiState,
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
  ungroupedRequests: HttpClientViewState["config"]["requests"];
  environmentItems: SidebarEnvironmentItem[];
  setActiveTab(tab: SidebarTab): void;
  setKeyword(keyword: string): void;
  toggleHistoryGroup(groupKey: string): void;
  createRequest(collectionId?: string | null): void;
  createCollection(): void;
  createEnvironment(): void;
  selectRequest(requestId: string): void;
  selectHistory(historyId: string): void;
  selectEnvironment(environmentId: string | null): void;
}

export function useSidebarController(): SidebarController {
  const bootstrap = getBootstrap("sidebar");
  const vscode = useMemo(() => getVscodeApi<SidebarToExtensionMessage>(), []);
  const [viewState, setViewState] = useState<HttpClientViewState | null>(() => bootstrap.initialState ?? null);
  const [uiState, setUiState] = useState<SidebarUiState>(createInitialSidebarUiState);
  const [hasHostState, setHasHostState] = useState(Boolean(bootstrap.initialState));
  const viewStateRef = useRef<HttpClientViewState | null>(null);

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  const postMessage = useCallback(
    (message: SidebarToExtensionMessage) => {
      vscode?.postMessage(message);
    },
    [vscode]
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

  const createEnvironment = useCallback(() => {
    setActiveTab("environments");
    postMessage({ type: "httpClientSidebar/createEnvironment" });
  }, [postMessage, setActiveTab]);

  const selectRequest = useCallback(
    (requestId: string) => {
      postMessage({
        type: "httpClientSidebar/selectRequest",
        payload: { requestId },
      });
    },
    [postMessage]
  );

  const selectHistory = useCallback(
    (historyId: string) => {
      postMessage({
        type: "httpClientSidebar/selectHistory",
        payload: { historyId },
      });
    },
    [postMessage]
  );

  const selectEnvironment = useCallback(
    (environmentId: string | null) => {
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
      viewStateRef.current = payload.payload;
      setViewState(payload.payload);
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [postMessage]);

  const historyGroups = useMemo(() => {
    if (!viewState) {
      return [];
    }

    return buildHistoryGroups(viewState, uiState.keyword, uiState.expandedHistoryGroups);
  }, [uiState.expandedHistoryGroups, uiState.keyword, viewState]);

  const collectionGroups = useMemo(() => {
    if (!viewState) {
      return [];
    }

    return buildCollectionGroups(viewState.config, uiState.keyword);
  }, [uiState.keyword, viewState]);

  const ungroupedRequests = useMemo(() => {
    if (!viewState) {
      return [];
    }

    return buildUngroupedRequests(viewState.config, uiState.keyword);
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
    ungroupedRequests,
    environmentItems,
    setActiveTab,
    setKeyword,
    toggleHistoryGroup,
    createRequest,
    createCollection,
    createEnvironment,
    selectRequest,
    selectHistory,
    selectEnvironment,
  };
}
