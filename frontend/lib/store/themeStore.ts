import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  // Standardfarben (Mint) statt der Mandanten-Farben aus tenant.json
  classicPalette: boolean
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  setClassicPalette: (on: boolean) => void
}

function applyPalette(classic: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('palette-classic', classic)
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(theme)
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      classicPalette: false,
      toggleTheme: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
        set({ theme: next })
        applyTheme(next)
      },
      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },
      setClassicPalette: (on) => {
        set({ classicPalette: on })
        applyPalette(on)
      },
    }),
    {
      name: 'xxx-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme)
          applyPalette(state.classicPalette)
        }
      },
    }
  )
)
