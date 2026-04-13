import {
  HttpClientError,
  HttpResponseResult,
  HttpResolvedRequest,
  safePrettyJson,
} from "./types";

export interface RunRequestOptions {
  signal?: AbortSignal;
}

export class HttpRequestRunner {
  public async run(request: HttpResolvedRequest, options?: RunRequestOptions): Promise<HttpResponseResult> {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort("timeout"), request.timeoutMs);
    const mergedSignal = createMergedSignal(timeoutController.signal, options?.signal);
    try {
      const init: RequestInit = {
        method: request.method,
        headers: request.headers,
        signal: mergedSignal,
      };
      if (request.bodyMode !== "none" && request.method !== "GET" && request.method !== "DELETE") {
        init.body = request.bodyText;
      }
      const response = await fetch(request.url, init);
      const bodyText = await response.text();
      const durationMs = Date.now() - startedMs;
      const headers = Array.from(response.headers.entries()).map(([key, value]) => ({
        key,
        value,
      }));
      const { isJson, prettyText } = safePrettyJson(bodyText);
      const contentType = response.headers.get("content-type") ?? "";
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        bodyText,
        bodyPrettyText: isJson ? prettyText : bodyText,
        isJson,
        headers,
        meta: {
          startedAt,
          durationMs,
          sizeBytes: Buffer.byteLength(bodyText, "utf8"),
          finalUrl: response.url || request.url,
          redirected: response.redirected,
          contentType,
          unresolvedVariables: request.unresolvedVariables,
          environmentId: request.environmentId,
        },
      };
    } catch (error) {
      if (timeoutController.signal.aborted && timeoutController.signal.reason === "timeout") {
        throw new HttpClientError({
          code: "timeout",
          message: `请求超时, 已超过 ${request.timeoutMs} ms`,
        });
      }
      if (options?.signal?.aborted || mergedSignal.aborted) {
        throw new HttpClientError({
          code: "cancelled",
          message: "请求已取消",
        });
      }
      throw new HttpClientError({
        code: "network",
        message: `网络请求失败: ${(error as Error).message}`,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function createMergedSignal(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
    signals.forEach((signal) => signal?.removeEventListener("abort", abort));
  };
  signals.forEach((signal) => {
    if (!signal) {
      return;
    }
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort);
  });
  return controller.signal;
}
