import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRequest } from "../resolver";
import { createDefaultEnvironment, createDefaultRequest, HttpClientError } from "../types";
import { createTestLogger } from "./helpers";

test("resolver: 环境变量在 URL, Header, Body 中正确替换并收集未解析变量", async () => {
  const logger = await createTestLogger("http_client_resolver.txt");
  await logger.flow("验证 resolver 的变量替换和未解析变量收集能力");

  const request = createDefaultRequest("解析测试");
  request.method = "POST";
  request.url = "{{baseUrl}}/tool/list";
  request.params = [
    { id: "param-1", key: "keyword", value: "{{keyword}}", enabled: true },
    { id: "param-2", key: "missing", value: "{{missingVar}}", enabled: true },
  ];
  request.headers = [
    { id: "header-1", key: "Authorization", value: "Bearer {{token}}", enabled: true },
    { id: "header-2", key: "X-Missing", value: "{{unknown}}", enabled: true },
  ];
  request.bodyMode = "json";
  request.bodyText = "{\n  \"user\": \"{{user}}\",\n  \"trace\": \"{{traceId}}\"\n}";

  const environment = createDefaultEnvironment("dev");
  environment.variables = {
    baseUrl: "http://127.0.0.1:3000",
    keyword: "lamp",
    token: "abc123",
    user: "maxu",
  };

  await logger.step("执行请求解析");
  const resolved = resolveRequest(request, {
    environment,
    timeoutMs: 1500,
  });

  await logger.verify(`解析后的 URL: ${resolved.url}`);
  assert.equal(
    resolved.url,
    "http://127.0.0.1:3000/tool/list?keyword=lamp&missing=%7B%7BmissingVar%7D%7D"
  );
  assert.equal(resolved.headers.Authorization, "Bearer abc123");
  assert.equal(resolved.headers["X-Missing"], "{{unknown}}");
  assert.match(resolved.bodyText, /"user": "maxu"/);
  assert.match(resolved.bodyText, /"trace": "\{\{traceId\}\}"/);
  assert.deepEqual(resolved.unresolvedVariables.sort(), ["missingVar", "traceId", "unknown"]);

  await logger.conclusion("resolver 能在多位置替换变量, 并保留未解析变量列表");
});

test("resolver: 非 HTTP/HTTPS URL 会在发送前被拒绝", async () => {
  const logger = await createTestLogger("http_client_resolver_invalid_url.txt");
  await logger.flow("验证 resolver 会阻止非 HTTP/HTTPS 的非法 URL");

  const request = createDefaultRequest("非法 URL");
  request.method = "GET";
  request.url = "ftp://127.0.0.1/resource";

  await logger.step("执行请求解析, 期待 validation 错误");
  await assert.rejects(
    async () => resolveRequest(request, { environment: null, timeoutMs: 1000 }),
    (error: unknown) => {
      assert.ok(error instanceof HttpClientError);
      assert.equal(error.details.code, "validation");
      assert.match(error.details.message, /HTTP\/HTTPS/);
      return true;
    }
  );

  await logger.conclusion("resolver 已在发送前拦截非法协议 URL");
});
