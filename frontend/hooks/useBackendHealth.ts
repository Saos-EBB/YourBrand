'use client'

import { useEffect, useState } from 'react'
import { NGROK_HEADER } from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'
// /health liegt unprefixed auf der Backend-Root (main.ts nimmt es vom
// globalen /api/v1-Prefix aus), also Origin-Teil von API_BASE + /health.
const HEALTH_URL = `${new URL(API_BASE).origin}/health`

const POLL_INTERVAL_MS = 30_000
const TIMEOUT_MS = 4_000

export type BackendHealth = 'checking' | 'healthy' | 'unhealthy'

export function useBackendHealth(): BackendHealth {
  const [status, setStatus] = useState<BackendHealth>('checking')

  useEffect(() => {
    let cancelled = false

    async function check() {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
      try {
        const res = await fetch(HEALTH_URL, { headers: NGROK_HEADER, signal: controller.signal })
        if (!cancelled) setStatus(res.ok ? 'healthy' : 'unhealthy')
      } catch {
        if (!cancelled) setStatus('unhealthy')
      } finally {
        clearTimeout(timeout)
      }
    }

    check()
    const id = setInterval(check, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return status
}
