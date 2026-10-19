import { ApiResponse } from '../../shared/types';

let authToken: string | null = null;
if (typeof window !== 'undefined') {
  try {
    authToken = sessionStorage.getItem('iocl_auth_token');
  } catch {}
}

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        sessionStorage.setItem('iocl_auth_token', token);
      } else {
        sessionStorage.removeItem('iocl_auth_token');
      }
    } catch {}
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const defaultHeaders: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  if (authToken) {
    defaultHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  const config: RequestInit = {
    ...options,
    credentials: 'include',
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string> || {}),
    },
  };

  const requestUrl = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const res = await fetch(requestUrl, config);
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const json = (await res.json()) as ApiResponse<T>;
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
