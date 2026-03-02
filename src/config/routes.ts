export const ROUTES = {
  home: '/',
  inApp: '/in-app',
  studio: '/studio',
  support: '/support',
  embedded: '/embedded',
  dashboard: '/dashboard',
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
