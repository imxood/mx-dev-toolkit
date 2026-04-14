import type { HttpClientViewState } from "../../../src/http_client/types";

export type HttpClientWebviewSurface = "workbench" | "sidebar";

export interface HttpClientWebviewBootstrap {
  buildId: string;
  surface: HttpClientWebviewSurface;
  initialState?: HttpClientViewState | null;
}

declare global {
  interface Window {
    __MX_HTTP_CLIENT_BOOTSTRAP__?: HttpClientWebviewBootstrap;
    __mxToastCenter?: {
      push(toast: unknown): void;
    };
  }
}

export function getBootstrap(surface: HttpClientWebviewSurface): HttpClientWebviewBootstrap {
  return window.__MX_HTTP_CLIENT_BOOTSTRAP__ ?? {
    buildId: "webview-react-scaffold",
    surface,
  };
}
