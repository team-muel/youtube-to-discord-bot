/// <reference types="vite/client" />

// Frontend configuration helpers

export const API_BASE = import.meta.env.VITE_API_BASE || '';

export function apiFetch(input: string, init?: RequestInit) {
  // allow absolute URLs as well
  const url = input.startsWith('http') ? input : `${API_BASE}${input}`;
  return fetch(url, {
    credentials: 'include',
    ...init,
  });
}
