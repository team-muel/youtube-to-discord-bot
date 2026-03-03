/// <reference types="vite/client" />

// Frontend configuration helpers

export const API_BASE = import.meta.env.VITE_API_BASE || '';

function readCookie(name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function apiFetch(input: string, init?: RequestInit) {
  // allow absolute URLs as well
  const url = input.startsWith('http') ? input : `${API_BASE}${input}`;
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
