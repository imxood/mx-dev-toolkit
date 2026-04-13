import { createHttpKeyValue, HttpBodyMode, HttpMethod, HttpRequestEntity } from "./types";

const DATA_OPTIONS = new Set(["-d", "--data", "--data-raw", "--data-binary", "--data-ascii"]);
const HEADER_OPTIONS = new Set(["-H", "--header"]);

export function importCurlToRequest(raw: string, base: HttpRequestEntity): HttpRequestEntity {
  const tokens = tokenizeCurl(raw);
  if (tokens.length === 0 || tokens[0].toLowerCase() !== "curl") {
    throw new Error("请输入以 curl 开头的命令");
  }

  let method: HttpMethod | null = null;
  let url = "";
  let bodyText = "";
  let bodyMode: HttpBodyMode = "none";
  const headers: HttpRequestEntity["headers"] = [];

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if ((token === "-X" || token === "--request") && tokens[index + 1]) {
      const nextMethod = tokens[index + 1].toUpperCase();
      if (nextMethod === "GET" || nextMethod === "POST" || nextMethod === "PUT" || nextMethod === "DELETE" || nextMethod === "PATCH") {
        method = nextMethod;
      }
      index += 1;
      continue;
    }
    if (HEADER_OPTIONS.has(token) && tokens[index + 1]) {
      const headerValue = tokens[index + 1];
      const separatorIndex = headerValue.indexOf(":");
      if (separatorIndex > 0) {
        headers.push(
          createHttpKeyValue({
            key: headerValue.slice(0, separatorIndex).trim(),
            value: headerValue.slice(separatorIndex + 1).trim(),
          })
        );
      }
      index += 1;
      continue;
    }
    if (DATA_OPTIONS.has(token) && tokens[index + 1]) {
      bodyText = tokens[index + 1];
      bodyMode = looksLikeJson(bodyText) ? "json" : "raw";
      if (!method) {
        method = "POST";
      }
      index += 1;
      continue;
    }
    if ((token === "--url" || token === "-L") && tokens[index + 1]) {
      if (token === "--url") {
        url = tokens[index + 1];
        index += 1;
      }
      continue;
    }
    if (!token.startsWith("-") && !url) {
      url = token;
    }
  }

  if (!url) {
    throw new Error("未能从 cURL 中解析 URL");
  }

  return {
    ...base,
    method: method ?? base.method,
    url,
    headers: headers.length > 0 ? headers : base.headers,
    bodyMode,
    bodyText,
  };
}

export function tokenizeCurl(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function looksLikeJson(input: string): boolean {
  try {
    JSON.parse(input);
    return true;
  } catch {
    return false;
  }
}
