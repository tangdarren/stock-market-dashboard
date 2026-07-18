const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:8000'

const DEMO_FLAG = String(import.meta.env.VITE_DEMO_MODE ?? '').toLowerCase() === 'true'

export const ENV = {
  API_BASE_URL: BASE_URL,
  API_PREFIX: '/api/v1',
  DEMO_MODE: DEMO_FLAG,
  IS_DEV: import.meta.env.DEV,
} as const

export type EnvConfig = typeof ENV
