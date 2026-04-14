import { test } from "node:test";
import assert from "node:assert/strict";
import { closeMockServer, createMockServer, createTestLogger } from "./helpers";
import { HttpRequestRunner } from "../runner";
import { HttpClientError, createDefaultRequest } from "../types";
import { resolveRequest } from "../resolver";
import { createDefaultEnvironment } from "../types";

test("runner: 正常请求可返回 JSON 响应并解析 Meta", async () => {
  const logger = await createTestLogger("http_client_runner.txt");
  await logger.flow("验证 runner 的正常请求, 超时和取消行为");

  const { server, url } = await createMockServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end('{"ok":true,"message":"\\u83b7\\u53d6\\u6210\\u529f","items":[1,2,3]}');
  });

  try {
    const request = createDefaultRequest("正常请求");
    request.method = "GET";
    request.url = "{{baseUrl}}/products";
    const environment = createDefaultEnvironment("local");
    environment.variables.baseUrl = url;

    await logger.step("执行 GET 请求并校验 JSON 响应");
    const resolved = resolveRequest(request, { environment, timeoutMs: 1000 });
    const runner = new HttpRequestRunner();
    const response = await runner.run(resolved);

    assert.equal(response.status, 200);
    assert.equal(response.isJson, true);
    assert.match(response.bodyRawText, /\\u83b7\\u53d6\\u6210\\u529f/);
    assert.match(response.bodyText, /获取成功/);
    assert.match(response.bodyPrettyText, /"items": \[/);
    assert.match(response.bodyPrettyText, /获取成功/);
    assert.equal(response.meta.finalUrl, `${url}/products`);
    assert.ok(response.meta.sizeBytes > 0);
    await logger.verify(`响应耗时: ${response.meta.durationMs} ms`);
  } finally {
    await closeMockServer(server);
  }

  let capturedMethod = "";
  let capturedHeader = "";
  let capturedBody = "";
  const { server: postServer, url: postUrl } = await createMockServer(async (req, res) => {
    capturedMethod = req.method ?? "";
    capturedHeader = String(req.headers["x-demo-token"] ?? "");
    capturedBody = await new Promise<string>((resolve) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    res.statusCode = 201;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ accepted: true }));
  });

  try {
    const request = createDefaultRequest("真实 POST 请求");
    request.method = "POST";
    request.url = `${postUrl}/submit`;
    request.bodyMode = "json";
    request.bodyText = JSON.stringify({ name: "mx-dev-toolkit", ok: true });
    request.headers = [
      { id: "header-1", key: "X-Demo-Token", value: "real-http", enabled: true },
    ];
    const runner = new HttpRequestRunner();

    await logger.step("执行真实 POST 请求并校验服务端收到 method/header/body");
    const resolved = resolveRequest(request, { environment: null, timeoutMs: 1000 });
    const response = await runner.run(resolved);

    assert.equal(response.status, 201);
    assert.equal(capturedMethod, "POST");
    assert.equal(capturedHeader, "real-http");
    assert.match(capturedBody, /"name":"mx-dev-toolkit"/);
    await logger.verify(`服务端收到请求体: ${capturedBody}`);
  } finally {
    await closeMockServer(postServer);
  }

  const { server: timeoutServer, url: timeoutUrl } = await createMockServer((_req, res) => {
    setTimeout(() => {
      res.statusCode = 200;
      res.end("slow");
    }, 120);
  });

  try {
    const request = createDefaultRequest("超时请求");
    request.method = "GET";
    request.url = timeoutUrl;
    const resolved = resolveRequest(request, { environment: null, timeoutMs: 30 });
    const runner = new HttpRequestRunner();

    await logger.step("执行超时请求, 期待抛出 timeout 错误");
    await assert.rejects(
      async () => runner.run(resolved),
      (error: unknown) => {
        assert.ok(error instanceof HttpClientError);
        assert.equal(error.details.code, "timeout");
        return true;
      }
    );
  } finally {
    await closeMockServer(timeoutServer);
  }

  const { server: cancelServer, url: cancelUrl } = await createMockServer((_req, res) => {
    setTimeout(() => {
      res.statusCode = 200;
      res.end("later");
    }, 80);
  });

  try {
    const request = createDefaultRequest("取消请求");
    request.method = "GET";
    request.url = cancelUrl;
    const resolved = resolveRequest(request, { environment: null, timeoutMs: 1000 });
    const runner = new HttpRequestRunner();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);

    await logger.step("执行取消请求, 期待抛出 cancelled 错误");
    await assert.rejects(
      async () => runner.run(resolved, { signal: controller.signal }),
      (error: unknown) => {
        assert.ok(error instanceof HttpClientError);
        assert.equal(error.details.code, "cancelled");
        return true;
      }
    );
  } finally {
    await closeMockServer(cancelServer);
  }

  await logger.conclusion("runner 已覆盖正常请求, 超时和取消三类关键行为");
});
