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

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).substring(2, 12)}`;
}

export function clearPendingIdempotencyKeys(): void {
  pendingIdempotencyKeys.clear();
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

  const defaultHeaders: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  if (authToken) {
    defaultHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  const callerHeaders: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

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
  }
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
