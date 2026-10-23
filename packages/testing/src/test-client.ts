/** Anything exposing Hono's `app.request()` (an app or router). */
export interface RequestableApp {
  request(path: string, init?: RequestInit): Response | Promise<Response>;
}

export interface TestRequestOptions {
  token?: string;
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}

export interface TestResponse<T = any> {
  status: number;
  headers: Headers;
  body: T;
}

/** Thin wrapper over `app.request()` that handles JSON and bearer tokens. */
export const request = async <T = any>(
  app: RequestableApp,
  method: string,
  path: string,
  options: TestRequestOptions = {},
): Promise<TestResponse<T>> => {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  let body: string | undefined = options.rawBody;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  // Real HTTP clients send Content-Length; the body-limit middleware relies on it to answer 413.
  if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body));
  const response = await app.request(path, { method, headers, body });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON bodies (metrics, docs) are returned as text.
  }
  return { status: response.status, headers: response.headers, body: parsed as T };
};
