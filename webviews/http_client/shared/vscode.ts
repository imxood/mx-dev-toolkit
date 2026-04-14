export interface VscodeApi<TMessage = unknown> {
  postMessage(message: TMessage): void;
  setState(state: unknown): void;
  getState(): unknown;
}

declare global {
  function acquireVsCodeApi<TMessage = unknown>(): VscodeApi<TMessage>;
}

export function getVscodeApi<TMessage = unknown>(): VscodeApi<TMessage> | null {
  if (typeof acquireVsCodeApi !== "function") {
    return null;
  }

  return acquireVsCodeApi<TMessage>();
}
