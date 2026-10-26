'use client'

import { forwardRef, type AudioHTMLAttributes, type ImgHTMLAttributes } from 'react'
import { useAuthedMediaSrc } from '@/lib/hooks/useAuthedMediaSrc'

// Fuer noch nicht freigegebene Medien (Admin-Moderation, eigenes Profil): /media/file liefert sie nur mit Login,
// img- und audio-Tags schicken aber keinen Token. Freigegebene Medien anderer weiter mit normalem src (Browser-Cache).
type Src = { src: string | null | undefined }

export function AuthedImg({ src, alt, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & Src) {
  const blobSrc = useAuthedMediaSrc(src)
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={blobSrc} alt={alt} {...props} />
}

export const AuthedAudio = forwardRef<HTMLAudioElement, Omit<AudioHTMLAttributes<HTMLAudioElement>, 'src'> & Src>(
  function AuthedAudio({ src, ...props }, ref) {
    const blobSrc = useAuthedMediaSrc(src)
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio ref={ref} src={blobSrc} {...props} />
  },
)
