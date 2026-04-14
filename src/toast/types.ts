export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastNotifyPayload {
  message: string;
  kind?: ToastKind;
  copyText?: string;
  durationMs?: number;
}

export interface ToastNotificationInput extends ToastNotifyPayload {
  source: string;
}

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  copyText: string;
  durationMs: number;
  source: string;
  createdAt: string;
}

export type ToastToWebviewMessage = { type: "mxToast/show"; payload: ToastItem };
export type ToastNotifyMessage = { type: "mxToast/notify"; payload: ToastNotifyPayload };
