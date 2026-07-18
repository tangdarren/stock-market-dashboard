import { ENV } from './env'

export class ApiError extends Error {
  readonly status: number
  readonly reason?: string

  constructor(status: number, message: string, reason?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.reason = reason
  }
}

export class BackendUnavailableError extends ApiError {
  constructor(message: string) {
    super(0, message, 'backend_unavailable')
    this.name = 'BackendUnavailableError'
  }
}

interface RequestOptions {
  signal?: AbortSignal
  query?: Record<string, string | number | boolean | undefined>
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${ENV.API_PREFIX}${path}`, ENV.API_BASE_URL)
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      signal: options.signal,
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new BackendUnavailableError(
      `Cannot reach backend at ${ENV.API_BASE_URL}. Ensure the API is running.`,
    )
  }

  // Some environments (jsdom + MSW `HttpResponse.error()`) surface a network
  // failure as a response with `status === 0` instead of throwing.
  if (response.status === 0 || response.type === 'error') {
    throw new BackendUnavailableError(
      `Cannot reach backend at ${ENV.API_BASE_URL}. Ensure the API is running.`,
    )
  }

  const body = await response.text()
  const parsed = body ? safeJsonParse(body) : null

  if (!response.ok) {
    const detail = parsed?.detail ?? parsed
    const message =
      typeof detail === 'string'
        ? detail
        : detail?.message ?? `Request failed with status ${response.status}`
    const reason =
      typeof detail === 'object' && detail !== null ? (detail.reason as string | undefined) : undefined
    throw new ApiError(response.status, message, reason)
  }

  return (parsed as T) ?? ({} as T)
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, options),
}
