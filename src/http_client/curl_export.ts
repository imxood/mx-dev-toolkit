import { HttpKeyValue, HttpRequestEntity } from "./types";

export function exportRequestToCurl(request: HttpRequestEntity): string {
  const lines: string[] = [];
  const headerSegments: string[] = [];
  const params: string[] = [];

  for (const header of request.headers) {
    if (!header.enabled) {
      continue;
    }
    const key = header.key.trim();
    if (!key) {
      continue;
    }
    headerSegments.push(escapeShellArg(`${key}: ${header.value}`));
  }

  if (request.method !== "GET" || (request.bodyMode !== "none" && request.bodyText)) {
    lines.push(`curl -X ${request.method} ${escapeShellArg(request.url)}`);
  } else {
    lines.push(`curl ${escapeShellArg(request.url)}`);
  }

  for (const segment of headerSegments) {
    lines.push(`  -H ${segment}`);
  }

  for (const param of request.params) {
    if (!param.enabled) {
      continue;
    }
    const key = param.key.trim();
    if (!key) {
      continue;
    }
    params.push(`${encodeURIComponent(key)}=${encodeURIComponent(param.value)}`);
  }

  if (params.length > 0) {
    const separator = request.url.includes("?") ? "&" : "?";
    lines.push(`  -G ${escapeShellArg(`${request.url}${separator}${params.join("&")}`)}`);
  }

  if (request.bodyMode !== "none" && request.bodyText) {
    lines.push(`  -d ${escapeShellArg(request.bodyText)}`);
  }

  return lines.join(" \\\n");
}

function escapeShellArg(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function formatCurlForClipboard(request: HttpRequestEntity): string {
  return exportRequestToCurl(request);
}

export function describeEnabledCount(items: HttpKeyValue[]): number {
  return items.filter((item) => item.enabled && item.key.trim()).length;
}
