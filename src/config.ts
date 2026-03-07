/// <reference types="vite/client" />

// Frontend configuration helpers

export const API_BASE = import.meta.env.VITE_API_BASE || '';

export class ApiError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const buildApiUrl = (input: string) => {
  return input.startsWith('http') ? input : `${API_BASE}${input}`;
};

function readCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function apiFetch(input: string, init?: RequestInit) {
  const url = buildApiUrl(input);
  const csrfToken = readCookie('csrf_token');
  const headers = new Headers(init?.headers || {});
  if (csrfToken && !headers.has('x-csrf-token')) {
    headers.set('x-csrf-token', csrfToken);
  }

  return fetch(url, {
    credentials: 'include',
    headers,
    ...init,
  });
}

export async function apiFetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(input, init);
  if (!response.ok) {
    let details = '';

    try {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = (await response.json()) as { error?: string; message?: string };
        details = String(payload.error || payload.message || '').trim();
      } else {
        details = (await response.text()).trim();
      }
    } catch {
      details = '';
    }

    const message = details
      ? `API request failed: ${response.status} (${details})`
      : `API request failed: ${response.status}`;

    throw new ApiError(message, response.status, details || undefined);
  }
  return (await response.json()) as T;
}
