import { test } from "node:test";
import assert from "node:assert/strict";
import { closeMockServer, createMockServer, createTestLogger } from "./helpers";
import { HttpLoadTestRunner } from "../load_runner";
import { HttpRequestRunner } from "../runner";
import { createDefaultRequest } from "../types";
import { resolveRequest } from "../resolver";

test("load_runner: 并发执行, 统计聚合和取消行为正确", async () => {
  const logger = await createTestLogger("http_client_load_runner.txt");
  await logger.flow("验证压测调度, 指标统计和取消行为");

  let requestCount = 0;
  const { server, url } = await createMockServer((_req, res) => {
    requestCount += 1;
    const current = requestCount;
    const delay = current % 3 === 0 ? 35 : 10;
    setTimeout(() => {
      if (current % 5 === 0) {
        res.statusCode = 500;
        res.end("server error");
        return;
      }
      res.statusCode = 200;
      res.end("ok");
    }, delay);
  });

  try {
    const request = createDefaultRequest("压测请求");
    request.method = "GET";
    request.url = `${url}/bench`;
    const resolved = resolveRequest(request, { environment: null, timeoutMs: 300 });
    const loadRunner = new HttpLoadTestRunner(new HttpRequestRunner());
    const progressTrace: number[] = [];

    await logger.step("执行 12 次请求, 并发 4");
    const result = await loadRunner.run(
      resolved,
      {
        totalRequests: 12,
        concurrency: 4,
        timeoutMs: 300,
      },
      {
        onProgress(progress) {
          progressTrace.push(progress.completedRequests);
        },
      }
    );

    await logger.verify(`压测完成数: ${result.completedRequests}, 成功: ${result.successCount}, 失败: ${result.failureCount}`);
    assert.equal(result.completedRequests, 12);
    assert.equal(result.successCount + result.failureCount, 12);
    assert.ok(result.p95DurationMs >= result.p50DurationMs);
    assert.ok(result.statusCounts.some((item) => item.status === "200"));
    assert.ok(result.statusCounts.some((item) => item.status === "500"));
    assert.ok(progressTrace.length > 0);

    const abortController = new AbortController();
    setTimeout(() => abortController.abort(), 20);

    await logger.step("执行可取消压测, 校验 cancelled 标志");
    const cancelled = await loadRunner.run(
      resolved,
      {
        totalRequests: 20,
        concurrency: 5,
        timeoutMs: 300,
      },
      {
        signal: abortController.signal,
      }
    );
    assert.equal(cancelled.cancelled, true);
    assert.ok(cancelled.completedRequests <= 20);
  } finally {
    await closeMockServer(server);
  }

  await logger.conclusion("load_runner 已覆盖并发统计和取消路径");
});
