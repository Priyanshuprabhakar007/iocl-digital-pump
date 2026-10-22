import { ApiResponse } from '../../shared/types';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

// Tracks logical POST submission keys so retries of a failed/in-flight request reuse the same Idempotency-Key,
// while new logical operations after completion receive a fresh UUID.
const pendingIdempotencyKeys = new Map<string, string>();

// In-flight GET request deduplication map to prevent redundant concurrent fetches
const inFlightGetRequests = new Map<string, Promise<ApiResponse<any>>>();

// Client-side query cache for master/reference data
interface CacheEntry<T> {
  data: ApiResponse<T>;
  timestamp: number;
}
const requestQueryCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 30_000; // 30 seconds TTL for master/reference data

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).substring(2, 12)}`;
}

export function clearPendingIdempotencyKeys(): void {
  pendingIdempotencyKeys.clear();
}

export function clearApiCache(): void {
  requestQueryCache.clear();
  inFlightGetRequests.clear();
  pendingIdempotencyKeys.clear();
}

function isCacheableEndpoint(endpoint: string): boolean {
  if (
    endpoint.includes('/auth/me') ||
    endpoint.includes('/auth/login') ||
    endpoint.includes('/auth/logout') ||
    endpoint.includes('/auth/demo-login')
  ) {
    return false;
  }
  return (
    endpoint.includes('/api/v1/outlets') ||
    endpoint.includes('/api/v1/hierarchy') ||
    endpoint.includes('/api/v1/products') ||
    endpoint.includes('/api/v1/roles') ||
    endpoint.includes('/api/v1/scopes') ||
    endpoint.includes('/api/v1/users')
  );
}

function invalidateCacheForPath(endpoint: string): void {
  const cleanEndpoint = endpoint.split('?')[0];
  const segments = cleanEndpoint.split('/').filter(Boolean);
  const prefix = segments.slice(0, 3).join('/');
  for (const key of Array.from(requestQueryCache.keys())) {
    if (key.includes(prefix)) {
      requestQueryCache.delete(key);
    }
  }
}

function getBodySignature(body: BodyInit | null | undefined): string {
  if (!body) return '';
  if (typeof body === 'string') return body;
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const parts: string[] = [];
    body.forEach((value, key) => {
      if (typeof value === 'string') {
        parts.push(`${key}:${value}`);
      } else if (value && typeof value === 'object' && 'name' in value && 'size' in value) {
        const f = value as File;
        parts.push(`${key}:${f.name}:${f.size}:${f.type || ''}`);
      }
    });
    parts.sort();
    return parts.join('|');
  }
  return String(body);
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const method = (options.method || 'GET').toUpperCase();

  const callerHeaders: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  const skipCache =
    callerHeaders['x-skip-cache'] === 'true' ||
    options.cache === 'no-store' ||
    options.cache === 'no-cache';

  const dedupeKey = `${method}:${endpoint}:${authToken || 'anonymous'}`;

  // Check TTL query cache for GET requests on master data
  if (method === 'GET' && !skipCache && isCacheableEndpoint(endpoint)) {
    const cached = requestQueryCache.get(dedupeKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data as ApiResponse<T>;
    }
  }

  // Deduplicate in-flight concurrent GET requests
  if (method === 'GET' && !skipCache) {
    const inFlight = inFlightGetRequests.get(dedupeKey);
    if (inFlight) {
      return inFlight as Promise<ApiResponse<T>>;
    }
  }

  const fetchPromise = (async (): Promise<ApiResponse<T>> => {
    const defaultHeaders: Record<string, string> = isFormData
      ? {}
      : { 'Content-Type': 'application/json' };

    if (authToken) {
      defaultHeaders['Authorization'] = `Bearer ${authToken}`;
    }

    let logicalSignature: string | null = null;
    const isAuthSessionEndpoint =
      endpoint.includes('/auth/login') || endpoint.includes('/auth/logout') || endpoint.includes('/auth/demo-login');

    if (method === 'POST' && !isAuthSessionEndpoint) {
      const existingHeaderKey =
        callerHeaders['Idempotency-Key'] || callerHeaders['idempotency-key'];
      logicalSignature = `${method}:${endpoint}:${getBodySignature(options.body)}`;

      if (existingHeaderKey) {
        callerHeaders['Idempotency-Key'] = existingHeaderKey;
      } else {
        let key = pendingIdempotencyKeys.get(logicalSignature);
        if (!key) {
          key = generateIdempotencyKey();
          pendingIdempotencyKeys.set(logicalSignature, key);
        }
        callerHeaders['Idempotency-Key'] = key;
      }
    }

    const config: RequestInit = {
      ...options,
      credentials: 'include',
      headers: {
        ...defaultHeaders,
        ...callerHeaders,
      },
    };

    const requestUrl = endpoint.startsWith('http')
      ? endpoint
      : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    try {
      const res = await fetch(requestUrl, config);
      const contentType = res.headers.get('content-type') || '';

      // Clear logical key once the server has definitively processed the request (2xx or 4xx),
      // but retain it on 5xx so a user retry reuses the same Idempotency-Key.
      if (logicalSignature && res.status < 500) {
        pendingIdempotencyKeys.delete(logicalSignature);
      }

      // Invalidate relevant query cache entries upon successful state mutation
      if (method !== 'GET' && res.status < 400) {
        invalidateCacheForPath(endpoint);
      }

      if (contentType.includes('application/json')) {
        const json = (await res.json()) as ApiResponse<T>;
        if (
          !json.success &&
          json.error?.code === 'OUTLET_ARCHIVED' &&
          !endpoint.includes('/auth/login') &&
          typeof window !== 'undefined'
        ) {
          window.dispatchEvent(new CustomEvent('iocl:outlet-archived', { detail: { ...json.error, endpoint } }));
        }

        if (json.success && method === 'GET' && !skipCache && isCacheableEndpoint(endpoint)) {
          requestQueryCache.set(dedupeKey, {
            data: json,
            timestamp: Date.now(),
          });
        }

        return json;
      }

      return {
        success: false,
        data: null,
        error: {
          code: 'HTTP_ERROR',
          message: `Backend returned HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`,
        },
      };
    } catch (err: any) {
      // Keep pendingIdempotencyKeys entry on network failure so immediate retry reuses the same key
      return {
        success: false,
        data: null,
        error: {
          code: 'NETWORK_ERROR',
          message: err.message || 'Failed to connect to backend server',
        },
      };
    } finally {
      if (method === 'GET') {
        inFlightGetRequests.delete(dedupeKey);
      }
    }
  })();

  if (method === 'GET' && !skipCache) {
    inFlightGetRequests.set(dedupeKey, fetchPromise);
  }

  return fetchPromise;
}

export interface BlobFetchResult {
  success: boolean;
  blob: Blob | null;
  filename: string | null;
  error: {
    code: string;
    message: string;
  } | null;
}

export async function apiFetchBlob(
  endpoint: string,
  options: RequestInit = {}
): Promise<BlobFetchResult> {
  const defaultHeaders: Record<string, string> = {};

  if (authToken) {
    defaultHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  const config: RequestInit = {
    ...options,
    credentials: 'include',
    headers: {
      ...defaultHeaders,
      ...((options.headers as Record<string, string>) || {}),
    },
  };

  const requestUrl = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const res = await fetch(requestUrl, config);
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const json = (await res.json()) as ApiResponse<unknown>;
      return {
        success: false,
        blob: null,
        filename: null,
        error: {
          code: json.error?.code || 'FETCH_ERROR',
          message: json.error?.message || 'Failed to fetch file',
        },
      };
    }

    if (!res.ok) {
      return {
        success: false,
        blob: null,
        filename: null,
        error: {
          code: 'HTTP_ERROR',
          message: `Backend returned HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`,
        },
      };
    }

    const blob = await res.blob();
    let filename: string | null = null;
    const disposition = res.headers.get('content-disposition');
    if (disposition) {
      const match = disposition.match(/filename="?([^";]+)"?/i);
      if (match && match[1]) {
        filename = match[1].trim();
      }
    }

    return {
      success: true,
      blob,
      filename,
      error: null,
    };
  } catch (err: any) {
    return {
      success: false,
      blob: null,
      filename: null,
      error: {
        code: 'NETWORK_ERROR',
        message: err.message || 'Failed to connect to backend server',
      },
    };
  }
}
