'use client'

import { useEffect, useState } from 'react'
import { fetchMediaObjectUrl } from '@/lib/api'

// src fuer Medien, die vielleicht noch nicht freigegeben sind: mit Login laden, als Blob-URL zeigen.
// Blob- und data-URLs (lokale Vorschau) gehen unveraendert durch.
export function useAuthedMediaSrc(url: string | null | undefined): string | undefined {
  const [src, setSrc] = useState<string | undefined>()

  useEffect(() => {
    if (!url) { setSrc(undefined); return }
    if (url.startsWith('blob:') || url.startsWith('data:')) { setSrc(url); return }
    let objectUrl: string | undefined
    let cancelled = false
    fetchMediaObjectUrl(url)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u)
        else { objectUrl = u; setSrc(u) }
      })
      .catch(() => { if (!cancelled) setSrc(undefined) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  return src
}
