'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/lib/store/authStore'
import { useHiddenStore } from '@/lib/store/hiddenStore'

// ─── Audio (absorbed from lib/hiddenAudio.ts) ─────────────────────────────────

let _audio: HTMLAudioElement | null = null

export function playHiddenAudio(path: string): void {
  if (typeof window === 'undefined') return
  if (_audio) {
    _audio.pause()
    _audio = null
  }
  _audio = new Audio(path)
  _audio.loop = true
  _audio.volume = 0.5
  _audio.play().catch(() => {})
}

export function stopHiddenAudio(): void {
  if (!_audio) return
  _audio.pause()
  _audio.currentTime = 0
}

// ─── Password ─────────────────────────────────────────────────────────────────

export const MASTER_KEY = 'YourBrand'

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHiddenZone() {
  const isHidden    = useHiddenStore((s) => s.isHidden)
  const theme       = useHiddenStore((s) => s.theme)
  const toggleTheme = useHiddenStore((s) => s.toggleTheme)
  const unlock      = useHiddenStore((s) => s.unlock)
  const lock        = useHiddenStore((s) => s.lock)

  const accessToken = useAuthStore((s) => s.accessToken)
  const isFirstRun  = useRef(true)
  const prevToken   = useRef(accessToken)

  // Restore active custom color theme from localStorage on mount
  useEffect(() => {
    try {
      const activeName = localStorage.getItem('dev-color-active-theme')
      if (!activeName) return
      const raw = localStorage.getItem('dev-color-themes')
      if (!raw) return
      const themes = JSON.parse(raw) as Record<string, Record<string, string>>
      const theme = themes[activeName]
      if (!theme) return
      for (const [name, value] of Object.entries(theme)) {
        document.documentElement.style.setProperty(name, value)
      }
    } catch {}
  }, [])

  // Apply / remove underground theme classes on <html>
  useEffect(() => {
    const html = document.documentElement
    const UNDERGROUND = ['underground-brick', 'underground-neon']
    const NORMAL      = ['dark', 'light']

    if (isHidden) {
      const currentNormal = NORMAL.find((c) => html.classList.contains(c)) ?? 'dark'
      html.dataset.savedTheme = currentNormal
      NORMAL.forEach((c) => html.classList.remove(c))
      UNDERGROUND.forEach((c) => html.classList.remove(c))
      html.classList.add(theme === 'brick' ? 'underground-brick' : 'underground-neon')
    } else {
      UNDERGROUND.forEach((c) => html.classList.remove(c))
      // Nur zuruecksetzen, wenn die Zone vorher wirklich offen war — sonst
      // kam bei jedem Laden im hellen Modus ein zusaetzliches "dark" dazu.
      const saved = html.dataset.savedTheme
      if (saved) {
        html.classList.add(saved)
        delete html.dataset.savedTheme
      }
    }
  }, [isHidden, theme])

  // Lock zone + stop audio on logout (token present → null transition)
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      prevToken.current  = accessToken
      return
    }
    if (prevToken.current !== null && accessToken === null) {
      lock()
      stopHiddenAudio()
    }
    prevToken.current = accessToken
  }, [accessToken, lock])

  return {
    isHidden,
    theme,
    toggleTheme,
    unlock,
    lock,
    checkPassword: (pw: string) => pw === MASTER_KEY,
  }
}
