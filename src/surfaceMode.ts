export type SurfaceMode = 'white' | 'monotone';

export const SURFACE_MODE_POLICY: SurfaceMode = 'white';
export const SURFACE_MODE_STORAGE_KEY = 'muel-surface-mode';

const isSurfaceMode = (value: string | null): value is SurfaceMode => value === 'white' || value === 'monotone';

export function getStoredSurfaceMode(): SurfaceMode {
  if (typeof window === 'undefined') {
    return SURFACE_MODE_POLICY;
  }

  const saved = window.localStorage.getItem(SURFACE_MODE_STORAGE_KEY);
  return isSurfaceMode(saved) ? saved : SURFACE_MODE_POLICY;
}

export function persistSurfaceMode(mode: SurfaceMode) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(SURFACE_MODE_STORAGE_KEY, mode);
}

export function applySurfaceMode(mode: SurfaceMode) {
  document.documentElement.setAttribute('data-surface', mode);
  document.body.setAttribute('data-surface', mode);
}

export function setSurfaceMode(mode: SurfaceMode) {
  applySurfaceMode(mode);
  persistSurfaceMode(mode);
}
