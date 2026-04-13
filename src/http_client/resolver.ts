import {
  HTTP_CLIENT_DEFAULT_TIMEOUT_MS,
  HttpClientError,
  HttpEnvironmentEntity,
  HttpRequestEntity,
  HttpResolvedRequest,
} from "./types";

const VARIABLE_PATTERN = /\{\{([a-zA-Z0-9_\-\.]+)\}\}/g;

export interface ResolveRequestOptions {
  environment: HttpEnvironmentEntity | null;
  timeoutMs?: number;
}

export function resolveRequest(
  request: HttpRequestEntity,
  options: ResolveRequestOptions
): HttpResolvedRequest {
  const unresolvedVariables = new Set<string>();
  const environmentId = options.environment?.id ?? null;
  const variables = options.environment?.variables ?? {};
  const replaceValue = (input: string): string =>
    input.replace(VARIABLE_PATTERN, (_match, variableName: string) => {
      const resolved = variables[variableName];
      if (typeof resolved !== "string") {
        unresolvedVariables.add(variableName);
        return `{{${variableName}}}`;
      }
      return resolved;
    });

  const resolvedUrl = replaceValue(request.url.trim());
  if (!resolvedUrl) {
    throw new HttpClientError({
      code: "validation",
      message: "URL 不能为空",
    });
  }

  const baseUrl = normalizeHttpUrl(resolvedUrl);
  const url = appendParams(baseUrl, request.params, replaceValue);
  const headerEntries = request.headers
    .filter((item) => item.enabled && item.key.trim())
    .map((item) => ({
      ...item,
      key: replaceValue(item.key.trim()),
      value: replaceValue(item.value),
    }));
  const headers = Object.fromEntries(headerEntries.map((item) => [item.key, item.value]));
  const bodyText = request.bodyMode === "none" ? "" : replaceValue(request.bodyText ?? "");

  return {
    requestId: request.id,
    method: request.method,
    url,
    headers,
    headerEntries,
    bodyText,
    bodyMode: request.bodyMode,
    unresolvedVariables: [...unresolvedVariables],
    environmentId,
    sourceRequest: {
      ...request,
      url,
      bodyText,
      headers: headerEntries,
      params: request.params.map((item) => ({
        ...item,
        key: replaceValue(item.key),
        value: replaceValue(item.value),
      })),
    },
    timeoutMs: options.timeoutMs ?? HTTP_CLIENT_DEFAULT_TIMEOUT_MS,
  };
}

function normalizeHttpUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    const hint = /^[a-zA-Z0-9.-]+(\:\d+)?(\/.*)?$/.test(rawUrl)
      ? `请补全协议, 例如 https://${rawUrl.replace(/^\/+/, "")}`
      : "请输入完整 URL, 例如 https://example.com/api";
    throw new HttpClientError({
      code: "validation",
      message: `URL 不合法: ${rawUrl}. ${hint}`,
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpClientError({
      code: "validation",
      message: `仅支持 HTTP/HTTPS 请求: ${rawUrl}`,
    });
  }
  return url.toString();
}

function appendParams(
  rawUrl: string,
  params: HttpRequestEntity["params"],
  replaceValue: (input: string) => string
): string {
  const enabledParams = params.filter((item) => item.enabled && item.key.trim());
  if (enabledParams.length === 0) {
    return rawUrl;
  }
  const url = new URL(normalizeHttpUrl(rawUrl));
  enabledParams.forEach((item) => {
    url.searchParams.set(replaceValue(item.key.trim()), replaceValue(item.value));
  });
  return url.toString();
}
