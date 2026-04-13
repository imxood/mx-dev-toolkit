import { test } from "node:test";
import assert from "node:assert/strict";
import { importCurlToRequest } from "../curl_import";
import { createDefaultRequest } from "../types";
import { createTestLogger } from "./helpers";

test("curl_import: 常见 cURL 命令可正确转换为请求实体", async () => {
  const logger = await createTestLogger("http_client_curl_import.txt");
  await logger.flow("验证常见 cURL 场景的 Method, URL, Header, Body 解析");

  const base = createDefaultRequest("导入基础");
  const request = importCurlToRequest(
    `curl -X POST https://example.com/api/list -H "Content-Type: application/json" -H "Authorization: Bearer 123" -d "{\\"user\\":\\"demo\\"}"`,
    base
  );

  await logger.step("检查 Method, URL, Header 和 JSON Body");
  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://example.com/api/list");
  assert.equal(request.bodyMode, "json");
  assert.equal(request.headers.length, 2);
  assert.equal(request.headers[0].key, "Content-Type");
  assert.match(request.bodyText, /demo/);

  await logger.conclusion("cURL 常见导入路径可用");
});
