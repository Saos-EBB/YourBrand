'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Coins } from 'lucide-react'
import { useHiddenStore } from '@/lib/store/hiddenStore'
import { runLogoBreak } from '@/lib/physics/letterPhysics'

import { fetchApi } from '@/lib/api'

// ─── Logo button with 13-click Easter egg + physics ──────────────────────────

export function HiddenLogoButton() {
  const clickCount      = useHiddenStore((s) => s.clickCount)
  const incrementClick  = useHiddenStore((s) => s.incrementClick)
  const resetClickCount = useHiddenStore((s) => s.resetClickCount)
  const openOverlay     = useHiddenStore((s) => s.openOverlay)

  const logoButtonRef     = useRef<HTMLButtonElement>(null)
  const logoResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleLogoClick() {
    if (logoResetTimerRef.current) clearTimeout(logoResetTimerRef.current)
    incrementClick()
    if (clickCount + 1 >= 6) {
      const rect = logoButtonRef.current?.getBoundingClientRect()
      const text = logoButtonRef.current?.textContent ?? ''
      if (rect && text) {
        runLogoBreak(text, rect, () => {
          openOverlay()
        })
      }
      resetClickCount()
    } else {
      logoResetTimerRef.current = setTimeout(() => resetClickCount(), 3000)
    }
  }

  return (
    <button
      ref={logoButtonRef}
      onClick={handleLogoClick}
      className="text-xl font-bold text-on-surface tracking-tight"
      aria-label="Paarship home"
    >
      YourDemo
    </button>
  )
}

// ─── Coin balance + theme toggle + shop modal (hidden zone only) ──────────────

export function HiddenZoneControls() {
  const isHidden    = useHiddenStore((s) => s.isHidden)
  const theme       = useHiddenStore((s) => s.theme)
  const toggleTheme = useHiddenStore((s) => s.toggleTheme)

  const [coinBalance, setCoinBalance] = useState<number | null>(null)
  const [shopOpen, setShopOpen]       = useState(false)
  const [mounted, setMounted]         = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!isHidden) { setCoinBalance(null); return }

    function refresh() {
      fetchApi<number>('/hidden/coin/balance')
        .then((b) => { setCoinBalance(typeof b === 'number' ? b : 0) })
        .catch(() => { setCoinBalance(0) })
    }

    refresh()
    window.addEventListener('coin-balance-refresh', refresh)
    return () => window.removeEventListener('coin-balance-refresh', refresh)
  }, [isHidden])

  if (!isHidden) return null

  return (
    <>
      {coinBalance !== null && (
        <button
          onClick={() => setShopOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-surface-container-high border border-outline-variant hover:border-primary-fixed-dim transition-colors"
          title="Coins kaufen"
        >
          <Coins size={15} className="text-primary-fixed-dim" />
          <span className="text-sm font-bold text-on-surface tabular-nums">{coinBalance}</span>
        </button>
      )}

      <button
        onClick={toggleTheme}
        title={theme === 'brick' ? 'Switch to Spielhölle' : 'Switch to Hinterhof'}
        className="h-8 w-8 rounded-full bg-surface-container-highest flex items-center justify-center text-base hover:scale-110 transition-all border border-outline-variant"
      >
        {theme === 'brick' ? '🎰' : '🧱'}
      </button>

      {mounted && shopOpen && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShopOpen(false) }}
        >
          <div className="bg-surface-container border border-outline-variant rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-on-surface text-lg">🪙 Coins kaufen</h2>
              <button
                onClick={() => setShopOpen(false)}
                className="text-on-surface-variant hover:text-on-surface text-sm"
              >
                ✕
              </button>
            </div>
            {[
              { pkg: 'sardine',   label: '🐟 Sardine',   coins: '100',    price: '0,99 €'  },
              { pkg: 'thunfisch', label: '🐟 Thunfisch',  coins: '500',    price: '3,99 €'  },
              { pkg: 'hai',       label: '🦈 Hai',        coins: '2.000',  price: '12,99 €' },
              { pkg: 'moby_dick', label: '🐋 Moby Dick',  coins: '10.000', price: '49,99 €' },
            ].map((item) => (
              <button
                key={item.pkg}
                onClick={async () => {
                  setShopOpen(false)
                  try {
                    const res = await fetchApi<{ url: string }>('/hidden/coin/purchase', {
                      method: 'POST',
                      body: JSON.stringify({ package: item.pkg }),
                    })
                    localStorage.setItem('coin_return_url', window.location.pathname)
                    window.location.href = res.url
                  } catch { alert('Fehler beim Öffnen des Shops') }
                }}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant hover:border-primary-fixed-dim transition-colors w-full text-left"
              >
                <div>
                  <p className="font-semibold text-on-surface text-sm">{item.label}</p>
                  <p className="text-xs text-primary-fixed-dim">{item.coins} Coins</p>
                </div>
                <span className="font-bold text-on-surface text-sm">{item.price}</span>
              </button>
            ))}
            <p className="text-xs text-on-surface-variant text-center">
              Stripe Test Mode — keine echten Zahlungen
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
