export const ROUTES = {
  HOME: '/',
  DAILY: '/market',
  REPLAY: '/replay',
  LEARN: '/learn',
  ABOUT: '/about',
} as const

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES]
