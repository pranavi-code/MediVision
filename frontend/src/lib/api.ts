// Small API client with sensible defaults
export const API_BASE: string =
  (import.meta as any).env?.VITE_API_URL ||
  (import.meta as any).env?.VITE_API_BASE ||
  "http://localhost:8585";

type FetchOpts = {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
};

async function request<T = any>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { method = "GET", headers = {}, body, signal } = opts;
  const init: RequestInit = {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
    credentials: "omit",
    mode: "cors",
  };
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      msg = j?.detail || j?.error || JSON.stringify(j);
    } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  // @ts-ignore
  return (await res.text()) as T;
}

export const api = {
  get: <T = any>(path: string, signal?: AbortSignal) => request<T>(path, { method: "GET", signal }),
  post: <T = any>(path: string, body?: any, signal?: AbortSignal) => request<T>(path, { method: "POST", body, signal }),
  patch: <T = any>(path: string, body?: any, signal?: AbortSignal) => request<T>(path, { method: "PATCH", body, signal }),
};

export const API_URL = API_BASE;

export function makeApi(token?: string) {
  const baseHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  return {
    get: <T = any>(path: string, signal?: AbortSignal) =>
      request<T>(path, { method: "GET", headers: baseHeaders, signal }),
    post: <T = any>(path: string, body?: any, signal?: AbortSignal) =>
      request<T>(path, { method: "POST", headers: baseHeaders, body, signal }),
    patch: <T = any>(path: string, body?: any, signal?: AbortSignal) =>
      request<T>(path, { method: "PATCH", headers: baseHeaders, body, signal }),
  };
}
