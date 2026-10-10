'use client'

import { useEffect, useState } from 'react'

// Aktuelle Zeit, alle 30 s neu — fuer Fristen ("noch 25 Min")
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

// Restzeit bis zur Frist, kurz: "noch 25 Min", "noch 3 Std", "abgelaufen"
export function timeLeft(until: string, now: number): { label: string; urgent: boolean } {
  const min = Math.round((new Date(until).getTime() - now) / 60_000)
  if (min <= 0) return { label: 'Frist abgelaufen', urgent: true }
  if (min < 60) return { label: `noch ${min} Min`, urgent: true }
  const h = Math.floor(min / 60)
  if (h < 48) return { label: `noch ${h} Std`, urgent: false }
  return { label: `noch ${Math.floor(h / 24)} Tage`, urgent: false }
}

const dateTime = new Intl.DateTimeFormat('de', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}
