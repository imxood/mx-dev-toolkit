import { randomUUID } from "crypto";
import { ToastItem, ToastKind, ToastNotificationInput } from "./types";

const DEFAULT_TOAST_DURATION_MS: Record<ToastKind, number> = {
  success: 1800,
  info: 2400,
  warning: 3200,
  error: 4200,
};

export interface ToastWindowApi {
  showInformationMessage(message: string): Thenable<unknown> | Promise<unknown>;
  showWarningMessage(message: string): Thenable<unknown> | Promise<unknown>;
  showErrorMessage(message: string): Thenable<unknown> | Promise<unknown>;
}

export interface ToastHost {
  id: string;
  priority: number;
  isAvailable(): boolean;
  postToast(toast: ToastItem): Promise<boolean> | Thenable<boolean>;
}

export class ToastService {
  private readonly hosts = new Map<string, ToastHost>();

  constructor(private readonly windowApi: ToastWindowApi) {}

  public registerHost(host: ToastHost): { dispose(): void } {
    this.hosts.set(host.id, host);
    return {
      dispose: () => {
        this.hosts.delete(host.id);
      },
    };
  }

  public async notify(input: ToastNotificationInput): Promise<void> {
    const toast = normalizeToastInput(input);
    const hosts = [...this.hosts.values()]
      .filter((host) => {
        try {
          return host.isAvailable();
        } catch {
          return false;
        }
      })
      .sort((left, right) => right.priority - left.priority);

    for (const host of hosts) {
      try {
        if (await host.postToast(toast)) {
          return;
        }
      } catch {
        continue;
      }
    }

    await this.showNativeToast(toast);
  }

  public dispose(): void {
    this.hosts.clear();
  }

  private async showNativeToast(toast: ToastItem): Promise<void> {
    if (toast.kind === "error") {
      await this.windowApi.showErrorMessage(toast.message);
      return;
    }
    if (toast.kind === "warning") {
      await this.windowApi.showWarningMessage(toast.message);
      return;
    }
    await this.windowApi.showInformationMessage(toast.message);
  }
}

export function normalizeToastInput(input: ToastNotificationInput): ToastItem {
  const kind = input.kind ?? "info";
  return {
    id: randomUUID(),
    kind,
    message: input.message,
    copyText: input.copyText ?? input.message,
    durationMs: typeof input.durationMs === "number" ? Math.max(0, input.durationMs) : DEFAULT_TOAST_DURATION_MS[kind],
    source: input.source,
    createdAt: new Date().toISOString(),
  };
}
