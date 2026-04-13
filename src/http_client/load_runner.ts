import {
  HTTP_CLIENT_LOAD_TEST_ERROR_SAMPLE_LIMIT,
  HTTP_CLIENT_LOAD_TEST_MAX_CONCURRENCY,
  HTTP_CLIENT_LOAD_TEST_MAX_REQUESTS,
  HTTP_CLIENT_LOAD_TEST_MAX_TIMEOUT_MS,
  HttpClientError,
  HttpLoadTestErrorSample,
  HttpLoadTestProfile,
  HttpLoadTestProgress,
  HttpLoadTestResult,
  HttpResolvedRequest,
  percentile,
} from "./types";
import { HttpRequestRunner } from "./runner";

export interface RunLoadTestOptions {
  onProgress?: (progress: HttpLoadTestProgress) => void;
  signal?: AbortSignal;
}

export class HttpLoadTestRunner {
  constructor(private readonly requestRunner: HttpRequestRunner) {}

  public async run(
    request: HttpResolvedRequest,
    profile: HttpLoadTestProfile,
    options?: RunLoadTestOptions
  ): Promise<HttpLoadTestResult> {
    validateProfile(profile);
    const startedMs = Date.now();
    const durations: number[] = [];
    const statusCounts = new Map<string, number>();
    const errorSamples: HttpLoadTestErrorSample[] = [];
    let completedRequests = 0;
    let successCount = 0;
    let failureCount = 0;
    let nextIndex = 0;
    let cancelled = false;

    const emitProgress = () => {
      options?.onProgress?.({
        completedRequests,
        totalRequests: profile.totalRequests,
        successCount,
        failureCount,
        running: !cancelled && completedRequests < profile.totalRequests,
      });
    };

    const worker = async () => {
      while (nextIndex < profile.totalRequests) {
        if (options?.signal?.aborted) {
          cancelled = true;
          break;
        }
        const currentIndex = nextIndex;
        nextIndex += 1;
        try {
          const response = await this.requestRunner.run(
            {
              ...request,
              timeoutMs: profile.timeoutMs,
            },
            { signal: options?.signal }
          );
          durations.push(response.meta.durationMs);
          const statusKey = String(response.status);
          statusCounts.set(statusKey, (statusCounts.get(statusKey) ?? 0) + 1);
          if (response.status >= 200 && response.status < 400) {
            successCount += 1;
          } else {
            failureCount += 1;
            pushErrorSample(errorSamples, {
              index: currentIndex,
              message: response.statusText || "HTTP 状态失败",
              status: response.status,
            });
          }
        } catch (error) {
          failureCount += 1;
          const message =
            error instanceof HttpClientError ? error.details.message : `未知异常: ${(error as Error).message}`;
          pushErrorSample(errorSamples, {
            index: currentIndex,
            message,
            status: null,
          });
        } finally {
          completedRequests += 1;
          emitProgress();
        }
      }
    };

    const workerCount = Math.min(profile.concurrency, profile.totalRequests);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const durationMs = Date.now() - startedMs;
    const completedDurationValues = durations.length > 0 ? durations : [0];
    return {
      totalRequests: profile.totalRequests,
      completedRequests,
      successCount,
      failureCount,
      successRate: completedRequests === 0 ? 0 : successCount / completedRequests,
      averageDurationMs:
        durations.length === 0 ? 0 : durations.reduce((sum, value) => sum + value, 0) / durations.length,
      minDurationMs: Math.min(...completedDurationValues),
      p50DurationMs: percentile(durations, 0.5),
      p95DurationMs: percentile(durations, 0.95),
      maxDurationMs: Math.max(...completedDurationValues),
      rps: durationMs === 0 ? completedRequests : (completedRequests / durationMs) * 1000,
      durationMs,
      statusCounts: [...statusCounts.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((left, right) => left.status.localeCompare(right.status)),
      errorSamples,
      cancelled: cancelled || Boolean(options?.signal?.aborted),
    };
  }
}

export function validateProfile(profile: HttpLoadTestProfile): void {
  if (profile.totalRequests < 1 || profile.totalRequests > HTTP_CLIENT_LOAD_TEST_MAX_REQUESTS) {
    throw new HttpClientError({
      code: "validation",
      message: `总请求数必须在 1 到 ${HTTP_CLIENT_LOAD_TEST_MAX_REQUESTS} 之间`,
    });
  }
  if (profile.concurrency < 1 || profile.concurrency > HTTP_CLIENT_LOAD_TEST_MAX_CONCURRENCY) {
    throw new HttpClientError({
      code: "validation",
      message: `并发数必须在 1 到 ${HTTP_CLIENT_LOAD_TEST_MAX_CONCURRENCY} 之间`,
    });
  }
  if (profile.timeoutMs < 1 || profile.timeoutMs > HTTP_CLIENT_LOAD_TEST_MAX_TIMEOUT_MS) {
    throw new HttpClientError({
      code: "validation",
      message: `超时时间必须在 1 到 ${HTTP_CLIENT_LOAD_TEST_MAX_TIMEOUT_MS} ms 之间`,
    });
  }
}

function pushErrorSample(target: HttpLoadTestErrorSample[], sample: HttpLoadTestErrorSample): void {
  if (target.length < HTTP_CLIENT_LOAD_TEST_ERROR_SAMPLE_LIMIT) {
    target.push(sample);
  }
}
