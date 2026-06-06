'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const BASE = `${API_URL}/api/v1`;
const TOKEN_KEY = 'vb_token';

export const tokenStore = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { retry?: boolean } = {},
): Promise<T> {
  const token = tokenStore.get();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' });

  // Try one silent refresh on 401 (refresh token is an httpOnly cookie).
  if (res.status === 401 && options.retry !== false && path !== '/auth/refresh') {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...options, retry: false });
  }

  if (!res.ok) {
    let body: { message?: string | string[]; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error */
    }
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new ApiError(res.status, msg ?? res.statusText, body.details);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return (await res.text()) as unknown as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    tokenStore.set(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  fileUrl: (path: string) => `${BASE}${path}`,
};
