function requireEnv(key: string): string {
  const value = import.meta.env[key]
  if (!value && import.meta.env.DEV) {
    console.warn(`[env] Missing required variable: ${key}`)
  }
  return (value as string) ?? ''
}

export const ENV = {
  WEBULL_APP_KEY: requireEnv('VITE_WEBULL_APP_KEY'),
  WEBULL_APP_SECRET: requireEnv('VITE_WEBULL_APP_SECRET'),
  WEBULL_BASE_URL:
    (import.meta.env['VITE_WEBULL_BASE_URL'] as string) ||
    'https://openapi.webull.com',
  IS_DEV: import.meta.env.DEV,
} as const
