import { useAuthStore } from './store/authStore'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

export function normalise<T>(res: T[] | { data: T[] }): T[] {
  return Array.isArray(res) ? res : (res as { data: T[] }).data ?? []
}

// Ensures only one token refresh runs at a time — concurrent 401 handlers
// reuse the same promise instead of each calling POST /auth/refresh separately.
// Without this, a single-use refresh token gets consumed by the first caller
// and the rest see a failed refresh, triggering logout() and a redirect loop.
let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) return false
      const data = await res.json() as { accessToken: string }
      useAuthStore.getState().setAccessToken(data.accessToken)
      return true
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

interface FetchApiOptions extends RequestInit {
  rawBody?: boolean
}

function buildHeaders(token: string | null, init?: HeadersInit, rawBody?: boolean): Headers {
  const headers = new Headers(init)
  if (!rawBody) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

export async function fetchApi<T>(
  path: string,
  options: FetchApiOptions = {}
): Promise<T> {
  const { rawBody, ...fetchOptions } = options
  const { accessToken } = useAuthStore.getState()
  const skipContentType = rawBody || fetchOptions.body instanceof FormData
  const headers = buildHeaders(accessToken, fetchOptions.headers, skipContentType)

  let res = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    credentials: 'include',
    headers,
  })

  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (!refreshed) {
      useAuthStore.getState().logout()
      throw new Error('Session expired')
    }
    const newToken = useAuthStore.getState().accessToken
    const retryHeaders = buildHeaders(newToken, fetchOptions.headers, skipContentType)
    res = await fetch(`${BASE_URL}${path}`, {
      ...fetchOptions,
      credentials: 'include',
      headers: retryHeaders,
    })
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message ?? 'Request failed')
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  return res.json() as Promise<T>
}
